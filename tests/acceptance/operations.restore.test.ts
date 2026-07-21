import assert from "node:assert/strict";
import test from "node:test";
import { FoundationService, InMemoryFoundationStore, createEmptyMemoryState } from "@eiep/api";
import { createEncryptedRecoveryBundle, restoreEncryptedRecoveryBundle } from "@eiep/recovery";
import { assignment, completeReadiness, context, scope, sequentialIds } from "../helpers/foundation-fixture.js";

test("NFR-REL-002 / AC-10: clean restore preserves relationships, audit, access scope, dates, and file bytes", async () => {
  const store = new InMemoryFoundationStore();
  const now = new Date("2026-07-21T10:30:00.000Z");
  const service = new FoundationService(store, () => now, sequentialIds("restore"));
  const role = assignment("restore-role", "restore-user", ["project.create", "project.read"], scope());
  store.seedAssignments([role]);
  const project = await service.createProject(context("restore-user", "mfa"), [role], {
    businessScopeOrganizationId: "org-epv", number: "RESTORE-001", name: "Restore rehearsal",
    customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "America/Denver", readiness: completeReadiness,
  });
  const evidence = Buffer.from("%PDF-1.7\nrestored exact bytes", "utf8");
  const key = Buffer.alloc(32, 11);
  const bundle = createEncryptedRecoveryBundle(
    store.snapshot(),
    [{ boundary: "released", storageKey: `${project.id}/turnover/evidence.pdf`, content: evidence }],
    key,
    { sourceEnvironment: "test", sourceBuildId: "restore-rehearsal", createdAt: now },
  );
  const restored = restoreEncryptedRecoveryBundle(bundle, key);
  const restoredStore = new InMemoryFoundationStore(restored.state);
  const recovered = await restoredStore.transaction((transaction) => ({
    project: transaction.projectById(project.id),
    audit: transaction.auditForProject(project.id),
    assignments: transaction.assignmentsFor("restore-user"),
  }));

  assert.equal(recovered.project?.number, "RESTORE-001");
  assert.equal(recovered.project?.timeZone, "America/Denver");
  assert.ok(recovered.project?.createdAt instanceof Date);
  assert.equal(recovered.audit[0]?.action, "project.created");
  assert.equal(recovered.audit[0]?.canonicalSha256.length, 64);
  assert.deepEqual(recovered.assignments[0]?.permissions, ["project.create", "project.read"]);
  assert.equal(restored.objects[0]?.storageKey, `${project.id}/turnover/evidence.pdf`);
  assert.deepEqual(Buffer.from(restored.objects[0]?.content ?? []), evidence);
});

test("NFR-REL-002, NFR-SEC-001 / AC-10: restore fails closed for a wrong key or altered ciphertext", () => {
  const key = Buffer.alloc(32, 3);
  const bundle = createEncryptedRecoveryBundle(
    createEmptyMemoryState(), [], key,
    { sourceEnvironment: "test", sourceBuildId: "tamper-rehearsal", createdAt: new Date("2026-07-21T10:45:00.000Z") },
  );
  assert.throws(() => restoreEncryptedRecoveryBundle(bundle, Buffer.alloc(32, 4)), /authentication/u);
  const altered = { ...bundle, ciphertextBase64: `${bundle.ciphertextBase64.slice(0, -4)}AAAA` };
  assert.throws(() => restoreEncryptedRecoveryBundle(altered, key), /integrity/u);
});
