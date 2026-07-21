import assert from "node:assert/strict";
import test from "node:test";
import { ConflictError, FoundationService, InMemoryFoundationStore, PlatformService } from "@eiep/api";
import { assignment, completeReadiness, context, scope, sequentialIds } from "../helpers/foundation-fixture.js";

const now = new Date("2026-07-21T09:00:00.000Z");

test("FR-INT-003 / AC-10: integration inbox preserves external IDs and makes exact retries idempotent", async () => {
  const store = new InMemoryFoundationStore();
  const ids = sequentialIds("integration-idempotency");
  const foundation = new FoundationService(store, () => now, ids);
  const platform = new PlatformService(store, () => now, ids);
  const project = await foundation.createProject(
    context("project-creator"),
    [assignment("create-project", "project-creator", ["project.create"], scope())],
    {
      businessScopeOrganizationId: "org-epv", number: "INT-001", name: "Integration idempotency",
      customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "UTC", readiness: completeReadiness,
    },
  );
  const receiver = context("erp-adapter", "mfa", ["integration_service"]);
  const access = [assignment("receive", receiver.userId, ["integration.receive"], scope(project.id))];
  const request = {
    interfaceCode: "erp.material.receipt", idempotencyKey: "erp-event-1001", externalId: "ERP-MAT-1001",
    schemaVersion: 1, payload: { identifier: "MAT-1001", quantity: 2, source: "erp" },
  } as const;
  const received = await platform.receiveIntegration(receiver, access, project.id, request);
  const replay = await platform.receiveIntegration(receiver, access, project.id, request);
  assert.equal(replay.id, received.id);
  assert.equal(replay.externalId, "ERP-MAT-1001");
  assert.equal(replay.attemptCount, 0);
  const reorderedReplay = await platform.receiveIntegration(receiver, access, project.id, {
    ...request, payload: { source: "erp", quantity: 2, identifier: "MAT-1001" },
  });
  assert.equal(reorderedReplay.id, received.id);
  await assert.rejects(
    platform.receiveIntegration(receiver, access, project.id, {
      ...request, payload: { ...request.payload, quantity: 3 },
    }),
    (error: unknown) => error instanceof ConflictError && /different content/u.test(error.message),
  );
  await assert.rejects(
    platform.receiveIntegration(receiver, access, project.id, {
      ...request, externalId: "ERP-MAT-OTHER",
    }),
    (error: unknown) => error instanceof ConflictError && /different content/u.test(error.message),
  );
  const audit = await store.transaction((transaction) => transaction.auditForProject(project.id));
  assert.equal(audit.filter((event) => event.action === "integration.received").length, 1);
  assert.equal(audit.find((event) => event.action === "integration.received")?.changedFields.externalId, request.externalId);
});
