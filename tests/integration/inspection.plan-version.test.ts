import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationDeniedError } from "@eiep/rules-engine";
import { FoundationService, InMemoryFoundationStore, OperationalService, ValidationError } from "@eiep/api";
import { assignment, completeReadiness, context, scope, seedAuthoritativeProjectReadiness, sequentialIds } from "../helpers/foundation-fixture.js";

const now = new Date("2026-07-20T23:00:00.000Z");

test("FR-INS-001-002 / AC-02-06: approved current plan revision enforces fields, qualifications, assurance, signature meaning, and independent acceptance", async () => {
  const store = new InMemoryFoundationStore();
  const ids = sequentialIds("inspection");
  const foundation = new FoundationService(store, () => now, ids);
  const operations = new OperationalService(store, () => now, ids);
  const project = await foundation.createProject(
    context("project-creator"),
    [assignment("create", "project-creator", ["project.create"], scope())],
    {
      businessScopeOrganizationId: "org-epv", number: "INS-001", name: "Inspection controls",
      customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "UTC", readiness: completeReadiness,
    },
  );
  await seedAuthoritativeProjectReadiness(store, project.id, now);
  await foundation.activateProject(
    context("project-authority"),
    [assignment("activate", "project-authority", ["project.activate"], scope(project.id))],
    project.id,
    project.version,
  );

  const revisionA = await operations.submitInspectionPlanRevision(
    context("plan-author", "mfa"),
    [assignment("plan-manage", "plan-author", ["inspection.plan.manage"], scope(project.id))],
    project.id,
    {
      templateCode: "DIMENSIONAL", revision: "A", title: "Dimensional inspection",
      requiredFields: ["actual_length", "unit", "acceptance_basis"], applicableTargetTypes: ["work", "material"],
      requiredPerformerQualifications: ["dimensional_inspector"],
      requiredAcceptorQualifications: ["quality_acceptor"], acceptanceReference: "PROJECT-REQ-DIM-001",
      minimumAcceptanceAssurance: "step-up",
    },
  );
  await assert.rejects(
    operations.approveInspectionPlanRevision(
      context("plan-author", "step-up", ["inspection_plan_authority"]),
      [assignment("self-approve-plan", "plan-author", ["inspection.plan.approve"], scope(project.id))],
      revisionA.id,
      revisionA.version,
    ),
    (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "separation_of_duty",
  );
  const approvedA = await operations.approveInspectionPlanRevision(
    context("plan-approver", "step-up", ["inspection_plan_authority"]),
    [assignment("approve-plan", "plan-approver", ["inspection.plan.approve"], scope(project.id))],
    revisionA.id,
    revisionA.version,
  );

  await assert.rejects(
    operations.submitInspection(
      context("inspector", "mfa", ["dimensional_inspector"]),
      [assignment("perform", "inspector", ["inspection.perform"], scope(project.id))],
      project.id,
      {
        planRevisionId: approvedA.id, targetType: "work", targetId: "work-object-1", performedAt: now,
        fieldValues: { actual_length: "100", unit: "mm" }, evidenceFileIds: ["inspection-photo"], result: "pass",
      },
    ),
    (error: unknown) => error instanceof ValidationError && error.details.includes("inspection_field_missing:acceptance_basis"),
  );
  const inspection = await operations.submitInspection(
    context("inspector", "mfa", ["dimensional_inspector"]),
    [assignment("perform", "inspector", ["inspection.perform"], scope(project.id))],
    project.id,
    {
      planRevisionId: approvedA.id, targetType: "work", targetId: "work-object-1", performedAt: now,
      fieldValues: { actual_length: "100", unit: "mm", acceptance_basis: "PROJECT-REQ-DIM-001" },
      evidenceFileIds: ["inspection-photo"], result: "pass",
    },
  );
  await assert.rejects(
    operations.reviewInspection(
      context("inspector", "step-up", ["quality_acceptor"]),
      [assignment("self-accept", "inspector", ["inspection.accept"], scope(project.id))],
      inspection.id,
      inspection.version,
      "accept",
      "Accepted as conforming to the approved inspection plan.",
    ),
    (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "separation_of_duty",
  );
  const accepted = await operations.reviewInspection(
    context("quality-acceptor", "step-up", ["quality_acceptor"]),
    [assignment("accept", "quality-acceptor", ["inspection.accept"], scope(project.id))],
    inspection.id,
    inspection.version,
    "accept",
    "Accepted as conforming to the approved inspection plan.",
  );
  assert.equal(accepted.state, "accepted");
  assert.equal(accepted.acceptedBy, "quality-acceptor");
  assert.equal(accepted.acceptedAssurance, "step-up");
  assert.match(accepted.acceptanceMeaning!, /approved inspection plan/u);

  const revisionB = await operations.submitInspectionPlanRevision(
    context("plan-author", "mfa"),
    [assignment("plan-manage-b", "plan-author", ["inspection.plan.manage"], scope(project.id))],
    project.id,
    {
      templateCode: "DIMENSIONAL", revision: "B", title: "Dimensional inspection",
      requiredFields: ["actual_length", "unit", "acceptance_basis", "location"], applicableTargetTypes: ["work"],
      requiredPerformerQualifications: ["dimensional_inspector"], requiredAcceptorQualifications: ["quality_acceptor"],
      acceptanceReference: "PROJECT-REQ-DIM-002", minimumAcceptanceAssurance: "step-up",
    },
  );
  const approvedB = await operations.approveInspectionPlanRevision(
    context("plan-approver", "step-up", ["inspection_plan_authority"]),
    [assignment("approve-plan-b", "plan-approver", ["inspection.plan.approve"], scope(project.id))],
    revisionB.id,
    revisionB.version,
  );
  assert.equal(approvedB.state, "approved");
  const supersededA = await store.transaction((transaction) => transaction.inspectionPlanById(approvedA.id));
  assert.equal(supersededA?.state, "superseded");
  await assert.rejects(
    operations.submitInspection(
      context("inspector", "mfa", ["dimensional_inspector"]),
      [assignment("perform-old", "inspector", ["inspection.perform"], scope(project.id))],
      project.id,
      {
        planRevisionId: approvedA.id, targetType: "work", targetId: "work-object-2", performedAt: now,
        fieldValues: { actual_length: "100", unit: "mm", acceptance_basis: "old" }, evidenceFileIds: ["old-plan-file"], result: "pass",
      },
    ),
    (error: unknown) => error instanceof ValidationError && error.details.includes("inspection_plan_not_approved"),
  );

  const audit = await foundation.auditHistory(
    context("auditor", "mfa"),
    [assignment("audit", "auditor", ["audit.read"], scope(project.id))],
    project.id,
  );
  assert.ok(audit.some((event) => event.action === "inspection_plan.superseded"));
  assert.ok(audit.some((event) => event.action === "inspection.accepted"));
});
