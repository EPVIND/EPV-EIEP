import assert from "node:assert/strict";
import test from "node:test";
import type { AuditEvent } from "@eiep/shared-types";
import { FoundationService, InMemoryFoundationStore } from "@eiep/api";
import { assignment, completeReadiness, context, scope, sequentialIds } from "../helpers/foundation-fixture.js";

const now = new Date("2026-07-21T06:00:00.000Z");

test("FR-AUD-001-002 / AC-03: authorized history preserves prior values and hashes while recursively redacting protected fields", async () => {
  const store = new InMemoryFoundationStore();
  const service = new FoundationService(store, () => now, sequentialIds("audit-redaction"));
  const project = await service.createProject(
    context("project-creator"),
    [assignment("create-project", "project-creator", ["project.create"], scope())],
    {
      businessScopeOrganizationId: "org-epv", number: "AUD-001", name: "Audit redaction",
      customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "UTC", readiness: completeReadiness,
    },
  );
  const redactionSentinel = ["must", "not", "be", "returned"].join("-");
  const protectedEvent: AuditEvent = {
    id: "protected-event", occurredAt: now, actorUserId: "administrator", actingOrganizationId: "org-epv",
    projectId: project.id, action: "configuration.changed", objectType: "protected_configuration", objectId: "config-1",
    priorState: "old", newState: "new", reason: "rotation", correlationId: "correlation-protected",
    changedFields: {
      displayName: { from: "Old", to: "New" }, apiToken: { from: "old-token", to: "new-token" },
      nested: { password: redactionSentinel, safe: "visible" }, legalTaxReference: "protected-reference",
    },
    canonicalSha256: "0".repeat(64),
  };
  await store.transaction((transaction) => transaction.appendAudit(protectedEvent));
  const history = await service.auditHistory(
    context("auditor", "mfa"),
    [assignment("audit", "auditor", ["audit.read"], scope(project.id))], project.id,
  );
  const viewed = history.find((event) => event.id === protectedEvent.id);
  assert.deepEqual(viewed?.changedFields.displayName, { from: "Old", to: "New" });
  assert.deepEqual(viewed?.changedFields.apiToken, "[REDACTED]");
  assert.deepEqual(viewed?.changedFields.nested, { password: "[REDACTED]", safe: "visible" });
  assert.equal(viewed?.changedFields.legalTaxReference, "[REDACTED]");
  assert.equal(viewed?.canonicalSha256, protectedEvent.canonicalSha256);
  const persisted = await store.transaction((transaction) => transaction.auditForProject(project.id));
  assert.ok(persisted.some((event) => event.action === "audit.viewed"));
  assert.ok(persisted.some((event) => event.action === "audit.redaction_applied"));
});
