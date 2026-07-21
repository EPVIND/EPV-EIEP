import assert from "node:assert/strict";
import test from "node:test";
import { ConflictError, FoundationService, InMemoryFoundationStore, PlatformService } from "@eiep/api";
import { assignment, completeReadiness, context, scope, sequentialIds } from "../helpers/foundation-fixture.js";

const now = new Date("2026-07-21T09:15:00.000Z");

test("NFR-REL-004 / AC-10: integration processing bounds retries, dead-letters failures, and requires controlled reconciliation", async () => {
  const store = new InMemoryFoundationStore();
  const ids = sequentialIds("integration-recovery");
  const foundation = new FoundationService(store, () => now, ids);
  const platform = new PlatformService(store, () => now, ids);
  const project = await foundation.createProject(
    context("project-creator"),
    [assignment("create-project", "project-creator", ["project.create"], scope())],
    {
      businessScopeOrganizationId: "org-epv", number: "INT-002", name: "Integration recovery",
      customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "UTC", readiness: completeReadiness,
    },
  );
  const receiver = context("erp-adapter", "mfa", ["integration_service"]);
  const message = await platform.receiveIntegration(
    receiver,
    [assignment("receive", receiver.userId, ["integration.receive"], scope(project.id))],
    project.id,
    {
      interfaceCode: "erp.material.receipt", idempotencyKey: "erp-event-2001", externalId: "ERP-MAT-2001",
      schemaVersion: 1, payload: { identifier: "MAT-2001" },
    },
  );
  const worker = context("integration-worker", "mfa", ["integration_worker"]);
  const workerAccess = [assignment("process", worker.userId, ["integration.process"], scope(project.id))];
  const retryOne = await platform.processIntegration(worker, workerAccess, message.id, message.version, "failure", "endpoint_timeout");
  assert.deepEqual({ state: retryOne.state, attempts: retryOne.attemptCount }, { state: "retry", attempts: 1 });
  await assert.rejects(
    platform.processIntegration(worker, workerAccess, message.id, message.version, "failure", "stale_worker"),
    (error: unknown) => error instanceof ConflictError,
  );
  const retryTwo = await platform.processIntegration(worker, workerAccess, retryOne.id, retryOne.version, "failure", "endpoint_timeout");
  const deadLetter = await platform.processIntegration(worker, workerAccess, retryTwo.id, retryTwo.version, "failure", "schema_rejected");
  assert.deepEqual(
    { state: deadLetter.state, attempts: deadLetter.attemptCount, error: deadLetter.lastError },
    { state: "dead_letter", attempts: 3, error: "schema_rejected" },
  );
  const authority = context("integration-authority", "step-up", ["integration_reconciliation_authority"]);
  const authorityAccess = [assignment("manage", authority.userId, ["integration.manage"], scope(project.id))];
  const replay = await platform.reconcileIntegration(
    authority, authorityAccess, deadLetter.id, deadLetter.version, "replay", "Corrected source mapping",
  );
  assert.deepEqual(
    { state: replay.state, attempts: replay.attemptCount, error: replay.lastError },
    { state: "retry", attempts: 0, error: null },
  );
  const processed = await platform.processIntegration(worker, workerAccess, replay.id, replay.version, "success", null);
  assert.equal(processed.state, "processed");
  assert.equal(processed.processedAt?.toISOString(), now.toISOString());
  const audit = await store.transaction((transaction) => transaction.auditForProject(project.id));
  assert.equal(audit.filter((event) => event.action === "integration.retried").length, 2);
  assert.ok(audit.some((event) => event.action === "integration.dead_lettered"));
  assert.ok(audit.some((event) => event.action === "integration.reconciled" && event.reason === "Corrected source mapping"));
  assert.ok(audit.some((event) => event.action === "integration.processed"));
});
