import assert from "node:assert/strict";
import test from "node:test";
import { FoundationService, InMemoryFoundationStore, PlatformService } from "@eiep/api";
import { JobWorker } from "@eiep/job-worker";
import type { OutboundTransport } from "@eiep/integration";
import { assignment, completeReadiness, context, scope, sequentialIds } from "../helpers/foundation-fixture.js";

const now = new Date("2026-07-21T09:00:00.000Z");

test("NFR-PER-003, NFR-REL-004 / AC-10: durable worker processes queued export and leaves an explicit terminal state", async () => {
  const store = new InMemoryFoundationStore();
  const ids = sequentialIds("job-worker");
  const foundation = new FoundationService(store, () => now, ids);
  const platform = new PlatformService(store, () => now, ids);
  const project = await foundation.createProject(
    context("job-project-creator"),
    [assignment("job-create", "job-project-creator", ["project.create"], scope())],
    {
      businessScopeOrganizationId: "org-epv", number: "JOB-001", name: "Worker evidence",
      customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "UTC", readiness: completeReadiness,
    },
  );
  await store.transaction((transaction) => transaction.insertImportedRecord({
    id: "job-source-record", projectId: project.id, recordType: "material_receipt",
    payload: { projectId: project.id, identifier: "WORKER-MAT-001" }, importJobId: "controlled-worker-fixture",
    externalId: "WORKER-EXT-001", createdAt: now, createdBy: "job-project-creator",
  }));
  await store.transaction((transaction) => transaction.insertIntegrationMessage({
    id: "unsupported-earlier-message", direction: "outbox", projectId: project.id, interfaceCode: "unconfigured.transport",
    idempotencyKey: "unsupported-key", externalId: "UNSUPPORTED-1", schemaVersion: 1, payload: { ignored: true },
    payloadSha256: "b".repeat(64), correlationId: "unsupported-correlation", state: "pending", attemptCount: 0,
    lastError: null, createdAt: new Date(now.getTime() - 1_000), processedAt: null, version: 1,
  }));
  const requester = context("job-requester", "mfa");
  const queued = await platform.requestExport(
    requester,
    [assignment("job-request", requester.userId, ["export.create", "project.read"], scope(project.id))],
    project.id,
    { recordClass: "imported", recordIds: ["job-source-record"], format: "jsonl", recipientOrganizationId: "org-epv" },
  );
  const workerContext = context("job-worker-user", "mfa", ["export_worker", "integration_worker"]);
  const worker = new JobWorker(store, platform, { batchSize: 10 });
  const result = await worker.runOnce(workerContext, [assignment(
    "job-worker-role", workerContext.userId, ["export.process", "integration.process"], scope(project.id),
  )]);

  assert.equal(result.inspected, 1);
  assert.equal(result.completed.length, 1);
  const completed = await store.transaction((transaction) => transaction.exportJobById(queued.id));
  assert.equal(completed?.state, "completed");
  assert.match(completed?.resultSha256 ?? "", /^[0-9a-f]{64}$/u);
  const message = await store.transaction((transaction) => transaction.integrationMessageByKey("export.worker", queued.id));
  assert.equal(message?.state, "processed");
  const unsupported = await store.transaction((transaction) => transaction.integrationMessageById("unsupported-earlier-message"));
  assert.equal(unsupported?.state, "pending");
});

test("NFR-PER-003, NFR-REL-004 / AC-10: outbound adapter receives retained payload and permanent rejection dead-letters once", async () => {
  const store = new InMemoryFoundationStore();
  const ids = sequentialIds("outbound-worker");
  const foundation = new FoundationService(store, () => now, ids);
  const platform = new PlatformService(store, () => now, ids);
  const project = await foundation.createProject(
    context("outbound-project-creator"),
    [assignment("outbound-create", "outbound-project-creator", ["project.create"], scope())],
    {
      businessScopeOrganizationId: "org-epv", number: "OUTBOUND-001", name: "Outbound evidence",
      customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "UTC", readiness: completeReadiness,
    },
  );
  await store.transaction((transaction) => transaction.insertIntegrationMessage({
    id: "outbound-message", direction: "outbox", projectId: project.id, interfaceCode: "erp.material.v1",
    idempotencyKey: "outbound-key", externalId: "ERP-001", schemaVersion: 1,
    payload: { identifier: "MAT-001", quantity: "2.500" }, payloadSha256: "a".repeat(64),
    correlationId: "outbound-correlation", state: "pending", attemptCount: 0, lastError: null,
    createdAt: now, processedAt: null, version: 1,
  }));
  let receivedPayload: unknown;
  const transport: OutboundTransport = {
    async deliver(envelope) {
      receivedPayload = envelope.payload;
      return { disposition: "permanent_failure", statusCode: 422, errorCode: "contract_rejected", retryAfterSeconds: null };
    },
  };
  const workerContext = context("outbound-worker-user", "mfa", ["integration_worker"]);
  const worker = new JobWorker(store, platform, { batchSize: 10, transports: { "erp.material.v1": transport } });
  const result = await worker.runOnce(workerContext, [assignment(
    "outbound-process", workerContext.userId, ["integration.process"], scope(project.id),
  )]);

  assert.deepEqual(receivedPayload, { identifier: "MAT-001", quantity: "2.500" });
  assert.deepEqual(result.deadLettered, ["outbound-message"]);
  const message = await store.transaction((transaction) => transaction.integrationMessageById("outbound-message"));
  assert.equal(message?.state, "dead_letter");
  assert.equal(message?.attemptCount, 3);
  assert.equal(message?.lastError, "contract_rejected");
});

test("NFR-PER-003, NFR-REL-004 / AC-10: competing workers lease one message and deliver it exactly once", async () => {
  const store = new InMemoryFoundationStore();
  const ids = sequentialIds("leased-worker");
  const foundation = new FoundationService(store, () => now, ids);
  const platform = new PlatformService(store, () => now, ids);
  const project = await foundation.createProject(
    context("lease-project-creator"),
    [assignment("lease-create", "lease-project-creator", ["project.create"], scope())],
    {
      businessScopeOrganizationId: "org-epv", number: "LEASE-001", name: "Lease evidence",
      customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "UTC", readiness: completeReadiness,
    },
  );
  await store.transaction((transaction) => transaction.insertIntegrationMessage({
    id: "leased-outbound-message", direction: "outbox", projectId: project.id, interfaceCode: "erp.material.v1",
    idempotencyKey: "leased-outbound-key", externalId: "LEASED-ERP-001", schemaVersion: 1,
    payload: { identifier: "LEASED-MAT-001" }, payloadSha256: "c".repeat(64),
    correlationId: "leased-outbound-correlation", state: "pending", attemptCount: 0, lastError: null,
    createdAt: now, processedAt: null, version: 1,
  }));
  let deliveries = 0;
  const transport: OutboundTransport = {
    async deliver() {
      deliveries += 1;
      return { disposition: "accepted", statusCode: 202, errorCode: null, retryAfterSeconds: null };
    },
  };
  const workerContext = context("leased-worker-user", "mfa", ["integration_worker"]);
  const assignments = [assignment(
    "leased-worker-process", workerContext.userId, ["integration.process"], scope(project.id),
  )];
  const options = { batchSize: 1, leaseDurationMs: 60_000, transports: { "erp.material.v1": transport } };
  const [left, right] = await Promise.all([
    new JobWorker(store, platform, { ...options, workerId: "worker-left" }).runOnce(workerContext, assignments),
    new JobWorker(store, platform, { ...options, workerId: "worker-right" }).runOnce(workerContext, assignments),
  ]);

  assert.equal(left.inspected + right.inspected, 1);
  assert.equal(deliveries, 1);
  assert.equal(
    (await store.transaction((transaction) => transaction.integrationMessageById("leased-outbound-message")))?.state,
    "processed",
  );
});

test("NFR-REL-004 / AC-10: an active worker renews its lease during a slow idempotent delivery", async () => {
  const store = new InMemoryFoundationStore();
  const ids = sequentialIds("heartbeat-worker");
  const foundation = new FoundationService(store, () => now, ids);
  const platform = new PlatformService(store, () => now, ids);
  const project = await foundation.createProject(
    context("heartbeat-project-creator"),
    [assignment("heartbeat-create", "heartbeat-project-creator", ["project.create"], scope())],
    {
      businessScopeOrganizationId: "org-epv", number: "HEARTBEAT-001", name: "Heartbeat evidence",
      customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "UTC", readiness: completeReadiness,
    },
  );
  await store.transaction((transaction) => transaction.insertIntegrationMessage({
    id: "heartbeat-message", direction: "outbox", projectId: project.id, interfaceCode: "erp.material.v1",
    idempotencyKey: "heartbeat-key", externalId: "HEARTBEAT-ERP-001", schemaVersion: 1,
    payload: { identifier: "HEARTBEAT-MAT-001" }, payloadSha256: "d".repeat(64),
    correlationId: "heartbeat-correlation", state: "pending", attemptCount: 0, lastError: null,
    createdAt: now, processedAt: null, version: 1,
  }));
  let releaseDelivery: () => void = () => undefined;
  const deliveryGate = new Promise<void>((resolve) => { releaseDelivery = resolve; });
  let deliveryStarted: () => void = () => undefined;
  const started = new Promise<void>((resolve) => { deliveryStarted = resolve; });
  const transport: OutboundTransport = {
    async deliver() {
      deliveryStarted();
      await deliveryGate;
      return { disposition: "accepted", statusCode: 202, errorCode: null, retryAfterSeconds: null };
    },
  };
  const workerContext = context("heartbeat-worker-user", "mfa", ["integration_worker"]);
  const workerRun = new JobWorker(store, platform, {
    batchSize: 1, workerId: "heartbeat-worker", leaseDurationMs: 1_000,
    transports: { "erp.material.v1": transport },
  }).runOnce(workerContext, [assignment(
    "heartbeat-process", workerContext.userId, ["integration.process"], scope(project.id),
  )]);
  await started;
  await new Promise((resolve) => setTimeout(resolve, 1_100));
  assert.equal((await store.claimIntegrationWork({
    ownerId: "competing-after-original-expiry", interfaceCodes: new Set(["erp.material.v1"]),
    limit: 1, now: new Date(), leaseDurationMs: 1_000,
  })).length, 0);
  releaseDelivery();
  assert.deepEqual((await workerRun).completed, ["heartbeat-message"]);
});
