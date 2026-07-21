import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationDeniedError, authorize } from "@eiep/rules-engine";
import { FoundationService, InMemoryFoundationStore } from "@eiep/api";
import { assignment, context, scope, sequentialIds } from "../helpers/foundation-fixture.js";

test("FR-IAM-002-004 / AC-02-03: privileged assignments and delegated access are bounded, independent, attributable, reviewable, expiring, and revocable", async () => {
  let now = new Date("2026-07-21T02:00:00.000Z");
  const store = new InMemoryFoundationStore();
  const service = new FoundationService(store, () => now, sequentialIds("managed-access"));
  const projectScope = scope("project-managed-access");
  const administrator = context("access-administrator", "step-up", ["access_administrator"]);
  const administratorAccess = [assignment(
    "admin-access", administrator.userId,
    ["access.assignment.manage", "access.delegation.manage", "access.delegation.revoke"], projectScope,
  )];
  assert.throws(
    () => service.grantAccessAssignment(administrator, administratorAccess, {
      userId: administrator.userId, actingOrganizationId: "org-epv", permissions: ["document.read_current"],
      scope: projectScope, effectiveFrom: now, effectiveTo: new Date("2026-07-22T02:00:00.000Z"), grantReason: "Self grant",
    }),
    (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "separation_of_duty",
  );
  const managed = await service.grantAccessAssignment(administrator, administratorAccess, {
    userId: "field-user", actingOrganizationId: "org-epv", permissions: ["document.read_current"],
    scope: projectScope, effectiveFrom: now, effectiveTo: new Date("2026-07-22T02:00:00.000Z"),
    grantReason: "Temporary field document review coverage.",
  });
  const reviewer = context("access-reviewer", "step-up", ["access_reviewer"]);
  const reviewerAccess = [assignment(
    "reviewer-access", reviewer.userId, ["access.assignment.review", "access.delegation.review"], projectScope,
  )];
  const reviewed = await service.reviewAccessAssignment(reviewer, reviewerAccess, managed.id, managed.version);
  assert.equal(reviewed.reviewedBy, reviewer.userId);
  let fieldAssignments = await store.transaction((transaction) => transaction.assignmentsFor("field-user"));
  assert.equal(authorize(context("field-user"), fieldAssignments, {
    action: "document.read_current", resource: projectScope, requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "standard",
  }, now).allowed, true);
  now = new Date("2026-07-23T02:00:00.000Z");
  fieldAssignments = await store.transaction((transaction) => transaction.assignmentsFor("field-user"));
  assert.equal(authorize(context("field-user"), fieldAssignments, {
    action: "document.read_current", resource: projectScope, requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "standard",
  }, now).reasonCode, "no_active_assignment");

  now = new Date("2026-07-21T03:00:00.000Z");
  const delegator = context("document-controller", "step-up");
  const delegatorAccess = [assignment(
    "delegator-access", delegator.userId, ["access.delegation.create", "access.delegation.revoke"], projectScope,
  )];
  const proposed = await service.proposeDelegation(delegator, delegatorAccess, {
    delegateUserId: "backup-document-controller", actingOrganizationId: "org-epv",
    permissions: ["document.approve"], scope: projectScope, effectiveFrom: now,
    effectiveTo: new Date("2026-07-24T03:00:00.000Z"), justification: "Approved leave coverage.",
  });
  await assert.rejects(
    service.approveDelegation(
      context(delegator.userId, "step-up", ["access_administrator"]), administratorAccess,
      proposed.id, proposed.version,
    ),
    (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "separation_of_duty",
  );
  const approved = await service.approveDelegation(administrator, administratorAccess, proposed.id, proposed.version);
  const delegatedAssignments = await store.transaction((transaction) => transaction.assignmentsFor("backup-document-controller"));
  assert.equal(authorize(context("backup-document-controller"), delegatedAssignments, {
    action: "document.approve", resource: projectScope, requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "standard",
  }, now).allowed, true);
  const revoked = await service.revokeDelegation(
    delegator, delegatorAccess, approved.id, approved.version, "Primary controller returned early.",
  );
  assert.equal(revoked.state, "revoked");
  const afterRevocation = await store.transaction((transaction) => transaction.assignmentsFor("backup-document-controller"));
  assert.equal(authorize(context("backup-document-controller"), afterRevocation, {
    action: "document.approve", resource: projectScope, requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "standard",
  }, now).reasonCode, "no_active_assignment");
  const audit = await store.transaction((transaction) => transaction.auditForProject("project-managed-access"));
  assert.ok(audit.some((event) => event.action === "access.assignment_reviewed"));
  assert.ok(audit.some((event) => event.action === "delegation.revoked"));
});
