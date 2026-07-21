import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationDeniedError } from "@eiep/rules-engine";
import { ConflictError, FoundationService, InMemoryFoundationStore, ValidationError } from "@eiep/api";
import { assignment, completeReadiness, context, scope, seedGovernedFile, sequentialIds } from "../helpers/foundation-fixture.js";

const now = new Date("2026-07-21T04:00:00.000Z");

test("FR-PRJ-002-003, NFR-MNT-002 / AC-04: project hierarchy, participating master organizations, responsibilities, and independently approved configuration are versioned", async () => {
  const store = new InMemoryFoundationStore();
  const service = new FoundationService(store, () => now, sequentialIds("project-structure"));
  const project = await service.createProject(
    context("project-creator"),
    [assignment("create", "project-creator", ["project.create"], scope())],
    {
      businessScopeOrganizationId: "org-epv", number: "PRJ-STRUCT-001", name: "Project structure controls",
      customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "UTC", readiness: completeReadiness,
    },
  );
  const manager = context("project-structure-manager", "mfa");
  const managerAccess = [assignment(
    "manage-project", manager.userId,
    ["project.structure.manage", "project.assignment.manage", "project.configuration.manage"], scope(project.id),
  )];
  const system = await service.createProjectStructureElement(
    manager, managerAccess, project.id, { type: "system", parentId: null, code: "SYS-01", name: "Process system" },
  );
  await service.createProjectStructureElement(
    manager, managerAccess, project.id, { type: "area", parentId: null, code: "AREA-01", name: "Unit area" },
  );
  const wbs = await service.createProjectStructureElement(
    manager, managerAccess, project.id, { type: "wbs", parentId: null, code: "WBS-100", name: "Mechanical work" },
  );
  const workPackage = await service.createProjectStructureElement(
    manager, managerAccess, project.id, { type: "work_package", parentId: wbs.id, code: "WP-110", name: "Install equipment" },
  );
  await assert.rejects(
    service.createProjectStructureElement(
      manager, managerAccess, project.id,
      { type: "work_package", parentId: system.id, code: "WP-BAD", name: "Invalid hierarchy" },
    ),
    (error: unknown) => error instanceof ValidationError && error.details.includes("work_package_parent_invalid"),
  );
  const participant = await service.addProjectOrganization(
    manager, managerAccess, project.id, { organizationId: "org-mechanical-subcontractor", participationRole: "subcontractor" },
  );
  await assert.rejects(
    service.addProjectOrganization(
      manager, managerAccess, project.id, { organizationId: participant.organizationId, participationRole: "supplier" },
    ),
    (error: unknown) => error instanceof ConflictError,
  );
  const responsibility = await service.assignProjectResponsibility(
    manager, managerAccess, project.id,
    {
      targetType: "work_package", targetId: workPackage.id, responsibilityType: "perform",
      organizationId: participant.organizationId, personId: null, effectiveFrom: now, effectiveTo: null,
    },
  );
  assert.equal(responsibility.targetId, workPackage.id);
  assert.equal(responsibility.organizationId, participant.organizationId);

  const documentController = context("document-controller", "mfa");
  const document = await service.registerDocument(
    documentController,
    [assignment("create-document", documentController.userId, ["document.create"], scope(project.id))],
    project.id, { number: "SPEC-001", title: "Project quality requirements", type: "specification", discipline: "quality" },
  );
  await seedGovernedFile(store, project.id, "released-spec-file");
  const revision = await service.submitDocumentRevision(
    documentController,
    [assignment("submit-document", documentController.userId, ["document.revision.submit"], scope(project.id, document.id))],
    document.id,
    { revision: "0", purpose: "project configuration", source: "contract", fileId: "released-spec-file", requiredApprovalCount: 1 },
  );
  const approver = context("document-approver");
  const approvedRevision = await service.approveDocumentRevision(
    approver,
    [assignment("approve-document", approver.userId, ["document.approve"], scope(project.id, document.id))],
    revision.id, revision.version, true,
  );
  const releasedRevision = await service.releaseDocumentRevision(
    context("document-releaser"),
    [assignment("release-document", "document-releaser", ["document.release"], scope(project.id, document.id))],
    approvedRevision.id, approvedRevision.version, document.version,
  );
  const configurationV1 = await service.submitProjectConfiguration(
    manager, managerAccess, project.id,
    {
      configurationCode: "QUALITY-RULES", revision: "1",
      settings: { pmiRequired: true, receivingInspectionRequired: true, requiredInspectionPlan: "ITP-001" },
      governingDocumentRevisionIds: [releasedRevision.id], effectiveFrom: now,
    },
  );
  await assert.rejects(
    service.approveProjectConfiguration(
      context(manager.userId, "step-up", ["project_configuration_authority"]),
      [assignment("self-approve", manager.userId, ["project.configuration.approve"], scope(project.id, configurationV1.id))],
      configurationV1.id, configurationV1.version,
    ),
    (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "separation_of_duty",
  );
  const configurationAuthority = context("configuration-authority", "step-up", ["project_configuration_authority"]);
  const configurationAccess = [assignment(
    "approve-configuration", configurationAuthority.userId, ["project.configuration.approve", "project.read"], scope(project.id),
  )];
  await service.approveProjectConfiguration(
    configurationAuthority, configurationAccess, configurationV1.id, configurationV1.version,
  );
  const configurationV2 = await service.submitProjectConfiguration(
    manager, managerAccess, project.id,
    {
      configurationCode: "QUALITY-RULES", revision: "2",
      settings: { pmiRequired: true, receivingInspectionRequired: true, requiredInspectionPlan: "ITP-002" },
      governingDocumentRevisionIds: [releasedRevision.id], effectiveFrom: now,
    },
  );
  const activeV2 = await service.approveProjectConfiguration(
    configurationAuthority, configurationAccess, configurationV2.id, configurationV2.version,
  );
  const prior = await store.transaction((transaction) => transaction.projectConfigurationById(configurationV1.id));
  assert.equal(prior?.state, "superseded");
  const current = await service.currentProjectConfiguration(
    configurationAuthority, configurationAccess, project.id, "QUALITY-RULES",
  );
  assert.equal(current?.id, activeV2.id);
  assert.equal(current?.settings.requiredInspectionPlan, "ITP-002");
});
