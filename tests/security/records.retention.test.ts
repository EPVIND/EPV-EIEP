import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationDeniedError } from "@eiep/rules-engine";
import { FoundationService, InMemoryFoundationStore, ValidationError } from "@eiep/api";
import { assignment, completeReadiness, context, scope, sequentialIds } from "../helpers/foundation-fixture.js";

const now = new Date("2026-07-21T06:30:00.000Z");

test("FR-AUD-003, NFR-DAT-002 / AC-03-10: approved retention, legal hold, and three-party disposition prevent direct deletion", async () => {
  const store = new InMemoryFoundationStore();
  const service = new FoundationService(store, () => now, sequentialIds("retention"));
  const project = await service.createProject(
    context("project-creator"),
    [assignment("create-project", "project-creator", ["project.create"], scope())],
    {
      businessScopeOrganizationId: "org-epv", number: "RET-001", name: "Retention controls",
      customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "UTC", readiness: completeReadiness,
    },
  );
  const policyManager = context("policy-manager", "step-up");
  const policy = await service.proposeRetentionPolicy(
    policyManager,
    [assignment("manage-retention", policyManager.userId, ["records.retention.manage"], scope(project.id))],
    project.id,
    { recordClass: "project", contractReference: "CONTRACT-RETENTION-001", retentionDurationDays: 0, dispositionAction: "archive" },
  );
  const retentionAuthority = context("retention-authority", "step-up", ["records_retention_authority"]);
  await service.approveRetentionPolicy(
    retentionAuthority,
    [assignment("approve-policy", retentionAuthority.userId, ["records.retention.approve"], scope(project.id))],
    policy.id, policy.version,
  );
  const holdAuthority = context("legal-hold-authority", "step-up", ["legal_hold_authority"]);
  const hold = await service.placeLegalHold(
    holdAuthority,
    [assignment("place-hold", holdAuthority.userId, ["records.legal_hold.manage"], scope(project.id))],
    project.id, "project", project.id, "Pending contractual claim.",
  );
  const dispositionRequester = context("disposition-requester", "step-up");
  const requestAccess = [assignment(
    "request-disposition", dispositionRequester.userId, ["records.disposition.manage"], scope(project.id),
  )];
  await assert.rejects(
    service.requestRetentionDisposition(
      dispositionRequester, requestAccess, project.id, "project", project.id, "Archive after approved retention.",
    ),
    (error: unknown) => error instanceof ValidationError && error.details.includes("legal_hold_active"),
  );
  await assert.rejects(
    service.releaseLegalHold(
      holdAuthority,
      [assignment("release-own-hold", holdAuthority.userId, ["records.legal_hold.manage"], scope(project.id))],
      hold.id, hold.version, "Self release attempt.",
    ),
    (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "separation_of_duty",
  );
  const holdReleaseAuthority = context("legal-hold-release-authority", "step-up", ["legal_hold_authority"]);
  await service.releaseLegalHold(
    holdReleaseAuthority,
    [assignment("release-hold", holdReleaseAuthority.userId, ["records.legal_hold.manage"], scope(project.id))],
    hold.id, hold.version, "Claim resolved and release approved.",
  );
  const proposed = await service.requestRetentionDisposition(
    dispositionRequester, requestAccess, project.id, "project", project.id, "Archive after approved retention.",
  );
  await assert.rejects(
    service.approveRetentionDisposition(
      context(dispositionRequester.userId, "step-up", ["records_retention_authority"]),
      [assignment("self-approve", dispositionRequester.userId, ["records.disposition.approve"], scope(project.id))],
      proposed.id, proposed.version,
    ),
    (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "separation_of_duty",
  );
  const dispositionApprover = context("disposition-approver", "step-up", ["records_retention_authority"]);
  const approved = await service.approveRetentionDisposition(
    dispositionApprover,
    [assignment("approve-disposition", dispositionApprover.userId, ["records.disposition.approve"], scope(project.id))],
    proposed.id, proposed.version,
  );
  const operator = context("disposition-operator", "step-up", ["records_disposition_operator"]);
  const executed = await service.executeRetentionDisposition(
    operator,
    [assignment("execute-disposition", operator.userId, ["records.disposition.execute"], scope(project.id))],
    approved.id, approved.version,
  );
  assert.equal(executed.state, "executed");
  assert.equal(executed.action, "archive");
  assert.ok(await store.transaction((transaction) => transaction.projectById(project.id)));
  const audit = await store.transaction((transaction) => transaction.auditForProject(project.id));
  const dispositionAudit = audit.find((event) => event.action === "record.dispositioned");
  assert.equal(dispositionAudit?.changedFields.physicalDeletionPerformed, false);
});
