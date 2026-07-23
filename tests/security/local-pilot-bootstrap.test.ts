import assert from "node:assert/strict";
import test from "node:test";
import {
  bootstrapLocalPilotAccess,
  InMemoryFoundationStore,
  loadEphemeralLocalPilotBootstrapJson,
  LocalPilotBootstrapError,
  parseLocalPilotBootstrapJson,
  StoreBackedDevelopmentAuthenticator,
} from "@eiep/api";

const manifest = {
  manifestVersion: 1,
  mode: "controlled_local_pilot",
  authorizationReference: "PO-approved local pilot boundary",
  requesterAuthorityId: "00000000-0000-4000-8000-000000000001",
  approverAuthorityId: "00000000-0000-4000-8000-000000000002",
  businessScopeOrganizationId: "00000000-0000-4000-8000-000000000003",
  authorizedAt: "2026-07-21T12:00:00.000Z",
  effectiveFrom: "2026-07-21T12:00:00.000Z",
  effectiveTo: "2026-08-21T12:00:00.000Z",
  users: [
    {
      userAccountId: "10000000-0000-4000-8000-000000000001",
      personId: "20000000-0000-4000-8000-000000000001",
      displayName: "Pilot Coordinator",
      accessAssignmentId: "30000000-0000-4000-8000-000000000001",
      qualificationCodes: ["project_configuration_authority"],
      permissions: ["project.create", "project.read", "project.structure.manage"],
    },
    {
      userAccountId: "10000000-0000-4000-8000-000000000002",
      personId: "20000000-0000-4000-8000-000000000002",
      displayName: "Pilot Author",
      accessAssignmentId: "30000000-0000-4000-8000-000000000002",
      qualificationCodes: ["pmi_inspector"],
      permissions: ["project.read", "material.receive", "pmi.perform"],
    },
    {
      userAccountId: "10000000-0000-4000-8000-000000000003",
      personId: "20000000-0000-4000-8000-000000000003",
      displayName: "Pilot Reviewer",
      accessAssignmentId: "30000000-0000-4000-8000-000000000003",
      qualificationCodes: ["material_release_authority"],
      permissions: ["project.read", "material.release"],
    },
  ],
} as const;

test("NFR-SEC-002-003 / AC-01-03: exact local pilot bootstrap is bounded, persisted, and idempotent", async () => {
  const input = parseLocalPilotBootstrapJson(JSON.stringify(manifest));
  const store = new InMemoryFoundationStore();
  const clock = () => new Date("2026-07-22T12:00:00.000Z");
  const first = await bootstrapLocalPilotAccess(store, input, "a".repeat(64), clock);
  const retry = await bootstrapLocalPilotAccess(store, input, "a".repeat(64), clock);
  assert.deepEqual(first, { status: "created", userCount: 3, manifestSha256: "a".repeat(64), effectiveTo: input.effectiveTo });
  assert.equal(retry.status, "verified");
  const snapshot = store.snapshot();
  assert.equal(snapshot.identityAccounts.size, 3);
  assert.equal(snapshot.managedAccessAssignments.size, 3);
  assert.equal(snapshot.audits.filter((event) => event.action === "identity.local_pilot_bootstrap_completed").length, 1);
});

test("NFR-SEC-002 / AC-01: ephemeral pilot bootstrap derives its manifest hash from exact bytes", () => {
  const text = JSON.stringify(manifest);
  const loaded = loadEphemeralLocalPilotBootstrapJson(text);
  assert.equal(loaded.input.users.length, 3);
  assert.match(loaded.manifestSha256, /^[0-9a-f]{64}$/u);
  assert.throws(() => loadEphemeralLocalPilotBootstrapJson(""), LocalPilotBootstrapError);
});
test("NFR-SEC-002 / AC-01: local pilot manifest rejects identity aliasing, short user sets, and unbounded dates", async () => {
  assert.throws(() => parseLocalPilotBootstrapJson(JSON.stringify({ ...manifest, users: manifest.users.slice(0, 2) })),
    LocalPilotBootstrapError);
  assert.throws(() => parseLocalPilotBootstrapJson(JSON.stringify({
    ...manifest,
    users: manifest.users.map((user) => ({ ...user, personId: manifest.users[0].personId })),
  })), LocalPilotBootstrapError);
  const input = parseLocalPilotBootstrapJson(JSON.stringify({ ...manifest, effectiveTo: "2027-08-21T12:00:00.000Z" }));
  await assert.rejects(bootstrapLocalPilotAccess(new InMemoryFoundationStore(), input, "b".repeat(64),
    () => new Date("2026-07-22T12:00:00.000Z")), LocalPilotBootstrapError);
});

test("FR-IAM-001-002 / AC-02: development pilot headers resolve only active stored accounts and qualifications", async () => {
  const input = parseLocalPilotBootstrapJson(JSON.stringify(manifest));
  const store = new InMemoryFoundationStore();
  await bootstrapLocalPilotAccess(store, input, "c".repeat(64), () => new Date("2026-07-22T12:00:00.000Z"));
  const authenticator = new StoreBackedDevelopmentAuthenticator(store);
  const context = await authenticator.authenticate({
    authorizationHeader: undefined,
    developmentUserId: manifest.users[1].userAccountId,
    requestedOrganizationId: manifest.businessScopeOrganizationId,
    developmentAssurance: "mfa",
    correlationId: "pilot-test",
  });
  assert.equal(context.userId, manifest.users[1].userAccountId);
  assert.deepEqual(context.qualifications, ["pmi_inspector"]);
  await assert.rejects(authenticator.authenticate({
    authorizationHeader: undefined,
    developmentUserId: "90000000-0000-4000-8000-000000000001",
    requestedOrganizationId: manifest.businessScopeOrganizationId,
    developmentAssurance: "mfa",
    correlationId: "pilot-denied",
  }), /Authentication failed/u);
});

test("NFR-SEC-002 / AC-01: conflicting pilot identity state fails closed", async () => {
  const input = parseLocalPilotBootstrapJson(JSON.stringify(manifest));
  const store = new InMemoryFoundationStore();
  await bootstrapLocalPilotAccess(store, input, "d".repeat(64), () => new Date("2026-07-22T12:00:00.000Z"));
  const changed = parseLocalPilotBootstrapJson(JSON.stringify({
    ...manifest,
    users: manifest.users.map((user, index) => index === 0 ? { ...user, displayName: "Changed identity" } : user),
  }));
  await assert.rejects(bootstrapLocalPilotAccess(store, changed, "e".repeat(64),
    () => new Date("2026-07-22T12:00:00.000Z")), LocalPilotBootstrapError);
  assert.equal(store.snapshot().identityAccounts.get(manifest.users[0].userAccountId)?.displayName, "Pilot Coordinator");
});
