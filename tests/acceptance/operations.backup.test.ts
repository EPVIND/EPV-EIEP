import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyMemoryState } from "@eiep/api";
import { createEncryptedRecoveryBundle } from "@eiep/recovery";

test("NFR-REL-001 / AC-10: backup bundle encrypts repository and file content with integrity metadata", () => {
  const state = createEmptyMemoryState();
  state.assignments.push({
    id: "backup-role", userId: "backup-user", actingOrganizationId: "org-epv",
    permissions: ["project.read"], scope: { organizationId: "org-epv", projectId: "project-backup", workPackageId: null, objectId: null },
    effectiveFrom: new Date("2026-07-20T00:00:00.000Z"), effectiveTo: null, revokedAt: null,
  });
  const protectedContent = Buffer.from("%PDF-1.7\ncontrolled recovery evidence", "utf8");
  const bundle = createEncryptedRecoveryBundle(
    state,
    [{ boundary: "released", storageKey: "project-backup/evidence.pdf", content: protectedContent }],
    Buffer.alloc(32, 7),
    { sourceEnvironment: "test", sourceBuildId: "local-recovery-evidence", createdAt: new Date("2026-07-21T10:00:00.000Z") },
  );

  assert.equal(bundle.algorithm, "AES-256-GCM");
  assert.match(bundle.ciphertextSha256, /^[0-9a-f]{64}$/u);
  assert.equal(JSON.stringify(bundle).includes("controlled recovery evidence"), false);
  assert.equal(JSON.stringify(bundle).includes("backup-user"), false);
  assert.ok(Buffer.from(bundle.ciphertextBase64, "base64").byteLength > protectedContent.byteLength);
});
