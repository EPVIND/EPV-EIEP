import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  ApplicationIdentityBootstrapError,
  bootstrapInitialApplicationAdministrators,
  InMemoryFoundationStore,
  initialIdentityAdministratorPermissions,
  initialIdentityAdministratorQualifications,
  StoreIdentityResolver,
  type ApplicationIdentityBootstrapInput,
} from "@eiep/api";

const now = new Date("2026-07-21T12:00:00.000Z");
const issuer = "https://identity.example.test/tenant/v2.0";
const organizationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function input(overrides: Partial<ApplicationIdentityBootstrapInput> = {}): ApplicationIdentityBootstrapInput {
  return {
    authorizationReference: "CAB-2026-0042 / approved application identity bootstrap",
    requesterAuthorityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    approverAuthorityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    businessScopeOrganizationId: organizationId,
    issuer,
    authorizedAt: new Date("2026-07-21T11:00:00.000Z"),
    effectiveFrom: new Date("2026-07-21T11:30:00.000Z"),
    effectiveTo: new Date("2026-10-19T12:00:00.000Z"),
    administrators: [
      {
        userAccountId: "11111111-1111-4111-8111-111111111111",
        personId: "22222222-2222-4222-8222-222222222222",
        displayName: "Initial identity administrator one",
        externalIdentityId: "33333333-3333-4333-8333-333333333333",
        subject: "entra-object-id-one",
        accessAssignmentId: "44444444-4444-4444-8444-444444444444",
      },
      {
        userAccountId: "55555555-5555-4555-8555-555555555555",
        personId: "66666666-6666-4666-8666-666666666666",
        displayName: "Initial identity administrator two",
        externalIdentityId: "77777777-7777-4777-8777-777777777777",
        subject: "entra-object-id-two",
        accessAssignmentId: "88888888-8888-4888-8888-888888888888",
      },
    ],
    ...overrides,
  };
}

test("FR-IAM-001-002-004 / AC-02-03: one-time bootstrap creates two independently authorized, bounded application administrators and exact retry only", async () => {
  const store = new InMemoryFoundationStore();
  const created = await bootstrapInitialApplicationAdministrators(store, input(), () => now);
  assert.equal(created.status, "created");
  assert.equal(created.administratorCount, 2);
  assert.equal(created.effectiveTo.toISOString(), "2026-10-19T12:00:00.000Z");
  assert.match(created.authorizationReferenceSha256, /^[0-9a-f]{64}$/u);

  const firstSnapshot = store.snapshot();
  assert.equal(firstSnapshot.identityAccounts.size, 2);
  assert.equal(firstSnapshot.externalIdentities.size, 2);
  assert.equal(firstSnapshot.managedAccessAssignments.size, 2);
  assert.equal(firstSnapshot.audits.length, 11);
  for (const account of firstSnapshot.identityAccounts.values()) {
    assert.equal(account.state, "active");
    assert.deepEqual(account.qualificationCodes, initialIdentityAdministratorQualifications);
    assert.equal(account.version, 2);
    assert.notEqual(account.createdBy, account.updatedBy);
  }
  for (const externalIdentity of firstSnapshot.externalIdentities.values()) {
    assert.equal(externalIdentity.identityType, "internal");
    assert.equal(externalIdentity.issuer, issuer);
  }
  for (const assignment of firstSnapshot.managedAccessAssignments.values()) {
    assert.deepEqual(assignment.permissions, initialIdentityAdministratorPermissions);
    assert.equal(assignment.scope.organizationId, organizationId);
    assert.equal(assignment.scope.projectId, null);
    assert.equal(assignment.scope.workPackageId, null);
    assert.equal(assignment.scope.objectId, null);
    assert.ok(assignment.effectiveTo && assignment.effectiveTo.getTime() > now.getTime());
    assert.notEqual(assignment.grantedBy, assignment.reviewedBy);
    assert.equal(assignment.version, 2);
    assert.equal(assignment.permissions.some((permission) =>
      /^(project|document|material|quality|inspection|pmi|ncr|turnover|subcontractor)\./u.test(permission)), false);
  }
  for (const audit of firstSnapshot.audits) {
    const { id: _id, occurredAt: _occurredAt, canonicalSha256, ...payload } = audit;
    assert.equal(canonicalSha256, createHash("sha256").update(JSON.stringify(payload)).digest("hex"));
  }
  assert.equal(firstSnapshot.audits.filter((audit) => audit.action === "identity.bootstrap_completed").length, 1);

  const verified = await bootstrapInitialApplicationAdministrators(store, input(), () => now);
  assert.equal(verified.status, "verified");
  assert.deepEqual(store.snapshot(), firstSnapshot);

  const resolver = new StoreIdentityResolver(store, () => now);
  for (const administrator of input().administrators) {
    const resolved = await resolver.resolve({
      issuer, subject: administrator.subject, requestedOrganizationId: organizationId,
      assurance: "mfa", sessionId: `session-${administrator.subject}`,
      correlationId: `correlation-${administrator.subject}`, authenticatedAt: now,
    });
    assert.equal(resolved.userId, administrator.userAccountId);
    assert.equal(resolved.actingOrganizationId, organizationId);
    assert.deepEqual(resolved.qualifications, initialIdentityAdministratorQualifications);
  }
  await assert.rejects(
    resolver.resolve({
      issuer, subject: input().administrators[0]!.subject,
      requestedOrganizationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      assurance: "mfa", sessionId: "wrong-organization-session",
      correlationId: "wrong-organization-correlation", authenticatedAt: now,
    }),
    /not assigned/u,
  );
});

test("FR-IAM-001-002-004 / AC-02-03: bootstrap refuses partial, conflicting, or invalid authority state without mutation", async () => {
  const occupied = new InMemoryFoundationStore();
  await occupied.transaction((transaction) => transaction.insertIdentityAccount({
    id: "99999999-9999-4999-8999-999999999999",
    personId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    displayName: "Existing account",
    state: "active",
    qualificationCodes: [],
    version: 1,
    createdAt: now,
    createdBy: "fixture",
    updatedAt: now,
    updatedBy: "fixture",
  }));
  const before = occupied.snapshot();
  await assert.rejects(
    bootstrapInitialApplicationAdministrators(occupied, input(), () => now),
    (error: unknown) => error instanceof ApplicationIdentityBootstrapError && /nonempty or conflicts/u.test(error.message),
  );
  assert.deepEqual(occupied.snapshot(), before);

  const invalidInputs: readonly ApplicationIdentityBootstrapInput[] = [
    input({ administrators: [input().administrators[0]!] }),
    input({ administrators: [input().administrators[0]!, { ...input().administrators[1]!, subject: "entra-object-id-one" }] }),
    input({ approverAuthorityId: input().requesterAuthorityId }),
    input({ issuer: "http://identity.example.test/tenant/v2.0" }),
    input({ effectiveTo: new Date("2026-07-21T11:59:59.000Z") }),
  ];
  for (const invalidInput of invalidInputs) {
    const store = new InMemoryFoundationStore();
    await assert.rejects(
      bootstrapInitialApplicationAdministrators(store, invalidInput, () => now),
      ApplicationIdentityBootstrapError,
    );
    assert.deepEqual(store.snapshot(), new InMemoryFoundationStore().snapshot());
  }
});
