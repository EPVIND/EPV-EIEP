import assert from "node:assert/strict";
import test from "node:test";
import { ConflictError, FoundationService, InMemoryFoundationStore, PlatformService } from "@eiep/api";
import { assignment, completeReadiness, context, scope, sequentialIds } from "../helpers/foundation-fixture.js";

const synchronizedAt = new Date("2026-07-21T10:00:00.000Z");
const originalAt = new Date("2026-07-21T08:42:15.000Z");

test("NFR-OFF-002 / AC-03-10: offline drafts preserve actor/device/timestamps, idempotency, and conflict history", async () => {
  const store = new InMemoryFoundationStore();
  const ids = sequentialIds("offline-sync");
  const foundation = new FoundationService(store, () => synchronizedAt, ids);
  const platform = new PlatformService(store, () => synchronizedAt, ids);
  const project = await foundation.createProject(
    context("project-creator"),
    [assignment("create-project", "project-creator", ["project.create"], scope())],
    {
      businessScopeOrganizationId: "org-epv", number: "OFF-001", name: "Offline synchronization",
      customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "UTC", readiness: completeReadiness,
    },
  );
  const fieldUser = context("field-user", "mfa");
  const createAccess = [assignment("draft", fieldUser.userId, ["offline.draft.create"], scope(project.id))];
  const input = {
    operation: "punch.draft.capture", payload: { description: "Coating damage", location: "Area 5" },
    idempotencyKey: "device-17-draft-9", originalAt, deviceId: "device-17",
  } as const;
  const queued = await platform.queueOfflineDraft(fieldUser, createAccess, project.id, input);
  const replay = await platform.queueOfflineDraft(fieldUser, createAccess, project.id, input);
  assert.equal(replay.id, queued.id);
  assert.deepEqual(
    {
      originalAt: queued.originalAt.toISOString(), originalBy: queued.originalBy,
      organization: queued.actingOrganizationId, device: queued.deviceId, state: queued.state,
    },
    {
      originalAt: originalAt.toISOString(), originalBy: fieldUser.userId,
      organization: fieldUser.actingOrganizationId, device: "device-17", state: "queued",
    },
  );
  await assert.rejects(
    platform.queueOfflineDraft(fieldUser, createAccess, project.id, {
      ...input, payload: { ...input.payload, location: "Area 6" },
    }),
    (error: unknown) => error instanceof ConflictError,
  );
  const synchronizer = context("sync-service", "mfa");
  const synchronized = await platform.synchronizeOfflineDraft(
    synchronizer,
    [assignment("sync", synchronizer.userId, ["offline.draft.sync"], scope(project.id))],
    queued.id, queued.version, "conflict", "Record was superseded while device was offline",
  );
  assert.equal(synchronized.state, "conflict");
  assert.equal(synchronized.synchronizedAt?.toISOString(), synchronizedAt.toISOString());
  assert.equal(synchronized.conflictReason, "Record was superseded while device was offline");
  const audit = await store.transaction((transaction) => transaction.auditForProject(project.id));
  const conflict = audit.find((event) => event.action === "offline.sync_conflict");
  assert.equal(conflict?.changedFields.deviceId, "device-17");
  assert.equal(conflict?.changedFields.originalAt, originalAt.toISOString());
  assert.equal(conflict?.changedFields.synchronizedAt, synchronizedAt.toISOString());
  assert.equal(conflict?.reason, synchronized.conflictReason);
});
