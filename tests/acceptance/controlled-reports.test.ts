import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationDeniedError } from "@eiep/rules-engine";
import { InMemoryFoundationStore, ReportingService, createEmptyMemoryState } from "@eiep/api";
import type { MvpFormCode } from "@eiep/shared-types";
import { assignment, completeReadiness, context, scope, sequentialIds } from "../helpers/foundation-fixture.js";

const now = new Date("2026-07-21T18:00:00.000Z");
const projectId = "report-project";

function reportStore(): InMemoryFoundationStore {
  const state = createEmptyMemoryState();
  state.projects.set(projectId, {
    id: projectId, businessScopeOrganizationId: "org-epv", number: "RPT-001", name: "Controlled reports",
    customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "UTC", state: "active",
    readiness: completeReadiness, version: 1, createdAt: now, createdBy: "fixture", updatedAt: now, updatedBy: "fixture",
  });
  state.projectOrganizations.set("report-business-organization", {
    id: "report-business-organization", projectId, organizationId: "org-epv", participationRole: "business_scope",
    state: "active", version: 1, createdAt: now, createdBy: "fixture",
  });
  state.projectOrganizations.set("report-customer-organization", {
    id: "report-customer-organization", projectId, organizationId: "org-customer", participationRole: "customer",
    state: "active", version: 1, createdAt: now, createdBy: "fixture",
  });
  for (const responsibilityType of ["project_authority", "quality_authority", "document_control_authority"] as const) {
    state.responsibilityAssignments.set(`report-${responsibilityType}`, {
      id: `report-${responsibilityType}`, projectId, targetType: "project", targetId: projectId, responsibilityType,
      organizationId: "org-epv", personId: `${responsibilityType}-user`, effectiveFrom: now, effectiveTo: null,
      state: "active", version: 1, createdAt: now, createdBy: "fixture",
    });
  }
  state.documents.set("report-document", {
    id: "report-document", projectId, number: "DOC-001", title: "Controlled drawing", type: "drawing",
    discipline: "mechanical", currentRevisionId: "report-document-revision", version: 1,
    createdAt: now, createdBy: "fixture", updatedAt: now, updatedBy: "fixture",
  });
  state.revisions.set("report-document-revision", {
    id: "report-document-revision", documentId: "report-document", revision: "0", state: "released",
    purpose: "construction", source: "controlled", fileId: "report-file", fileValidationState: "released",
    approvalCount: 1, requiredApprovalCount: 1, supersedesRevisionId: null, version: 2,
    createdAt: now, createdBy: "fixture", updatedAt: now, updatedBy: "fixture",
  });
  state.projectConfigurations.set("report-project-configuration", {
    id: "report-project-configuration", projectId, configurationCode: "PROJECT-BASELINE", revision: "1",
    settings: { baselineApproved: true }, governingDocumentRevisionIds: ["report-document-revision"], effectiveFrom: now,
    state: "active", supersedesRevisionId: null, approvedAt: now, approvedBy: "configuration-authority", version: 2,
    createdAt: now, createdBy: "configuration-author", updatedAt: now, updatedBy: "configuration-authority",
  });
  state.materials.set("report-material", {
    id: "report-material", projectId, identifier: "MAT-001", receiptNumber: "RCV-001", purchaseReference: "PO-001",
    vendorOrganizationId: "org-vendor", specification: "SPEC-001", grade: "GRADE-A", form: "pipe",
    dimensions: "NPS 2", quantity: "1", unitCode: "EA", heatLot: "HEAT-001",
    mtrDocumentRevisionId: "report-document-revision", receiptEvidenceFileIds: ["receipt-evidence"],
    storageLocation: "RACK-A", parentItemId: null, state: "released",
    requirements: {
      projectConfigurationRevisionId: "material-config", mtrRequired: true, mtrAccepted: true,
      mtrReviewId: "report-mtr-review", receivingInspectionRequired: false, receivingInspectionAccepted: true,
      pmiRequired: true, pmiAccepted: true, governingPmiRule: "PMI-RULE", pmiOverrideId: null, openDispositionCount: 0,
    },
    version: 4, createdAt: now, createdBy: "receiver", updatedAt: now, updatedBy: "material-releaser",
  });
  state.materialMovements.set("report-movement", {
    id: "report-movement", projectId, materialItemId: "report-material", movementType: "received",
    fromState: null, toState: "received_pending", fromLocation: null, toLocation: "RACK-A",
    quantity: "1", unitCode: "EA", workPackageId: null, reason: "receipt:RCV-001", occurredAt: now,
    actorUserId: "receiver",
  });
  state.mtrReviews.set("report-mtr-review", {
    id: "report-mtr-review", projectId, materialItemId: "report-material", documentRevisionId: "report-document-revision",
    decision: "accepted", heatLotVerified: true, gradeVerified: true, specificationVerified: true,
    reviewNotes: "All controlled comparisons passed.", evidenceFileIds: ["mtr-review-evidence"],
    reviewedAt: now, reviewedBy: "mtr-reviewer", version: 1,
  });
  state.equipment.set("report-equipment", {
    id: "report-equipment", projectId, identifier: "XRF-001", serialNumber: "SERIAL-001", methodCapabilities: ["XRF"],
    verificationState: "passed", validFrom: new Date("2026-07-01T00:00:00.000Z"),
    validTo: new Date("2026-08-01T00:00:00.000Z"), evidenceFileId: "equipment-evidence", state: "active", version: 1,
  });
  state.pmiRecords.set("report-pmi", {
    id: "report-pmi", projectId, materialItemId: "report-material", governingRule: "PMI-RULE",
    requiredMaterial: "GRADE-A", observedMaterial: "GRADE-A", method: "XRF", equipmentId: "report-equipment",
    componentLocation: "RACK-A / MAT-001", inspectorUserId: "pmi-inspector", inspectedAt: now, readings: { chromium: "18.2" },
    evidenceFileIds: ["pmi-evidence"], notes: "Observed alloy matched the controlled requirement.",
    result: "pass", state: "accepted", ncrId: null, acceptedBy: "pmi-acceptor", version: 2,
  });
  state.inspectionPlans.set("report-inspection-plan", {
    id: "report-inspection-plan", projectId, templateCode: "GEN-001", revision: "0", title: "Generic inspection",
    requiredFields: ["result"], applicableTargetTypes: ["material"], requiredPerformerQualifications: ["inspector"],
    requiredAcceptorQualifications: ["inspection_acceptor"], acceptanceReference: "SPEC-001",
    minimumAcceptanceAssurance: "step-up", state: "approved", supersedesRevisionId: null, approvedBy: "plan-approver",
    version: 2, createdAt: now, createdBy: "plan-author", updatedAt: now, updatedBy: "plan-approver",
  });
  state.inspections.set("report-inspection", {
    id: "report-inspection", projectId, planRevisionId: "report-inspection-plan", targetType: "material",
    targetId: "report-material", inspectorUserId: "inspector", performedAt: now, fieldValues: { result: "acceptable" },
    evidenceFileIds: ["inspection-evidence"], result: "pass", state: "accepted", acceptedBy: "inspection-acceptor",
    acceptanceMeaning: "Accepted to SPEC-001", acceptedAssurance: "step-up", rejectionReason: null, version: 2,
    createdAt: now, updatedAt: now,
  });
  state.ncrs.set("report-ncr", {
    id: "report-ncr", projectId, number: "NCR-001", affectedObjectType: "material", affectedObjectId: "report-material",
    requirementReference: "SPEC-001", description: "Controlled deficiency", containment: "Segregated", state: "closed",
    evidenceFileIds: ["ncr-evidence"], responsibleUserId: "ncr-owner", disposition: "Use as is",
    correctiveAction: "Confirmed engineering disposition and retained evidence.", dispositionProposedBy: "engineer", dispositionApprovedBy: "approver",
    reinspectionEvidenceFileId: "ncr-reinspection", turnoverRequired: true, version: 5,
    createdAt: now, createdBy: "inspector", updatedAt: now, updatedBy: "closer",
  });
  state.punches.set("report-punch", {
    id: "report-punch", projectId, number: "PCH-001", type: "completion", priority: "medium",
    systemId: "system-1", areaId: "area-1", workPackageId: "wp-1", assetId: null,
    description: "Complete identification tag", ownerUserId: "owner", targetAt: now,
    evidenceFileIds: ["punch-evidence"], state: "closed", verifiedBy: "verifier",
    verificationEvidenceFileId: "verification-evidence", closureMeaning: "Verified complete", turnoverRequired: true,
    version: 4, createdAt: now, createdBy: "inspector", updatedAt: now, updatedBy: "closer",
  });
  state.subcontractorProfiles.set("report-subcontractor-profile", {
    id: "report-subcontractor-profile", organizationId: "org-subcontractor", legalTaxReference: "PRIVATE-TAX-REFERENCE",
    declaredScopes: ["mechanical"], approvedScopes: ["mechanical"], geography: ["Colorado"], laborModel: "direct",
    lowerTierDisclosureRequired: true, qualificationState: "qualified", qualificationValidTo: new Date("2027-01-01T00:00:00.000Z"),
    version: 2, createdAt: now, createdBy: "subcontractor-admin", updatedAt: now, updatedBy: "qualification-approver",
  });
  state.subcontractorQualifications.set("report-subcontractor-qualification", {
    id: "report-subcontractor-qualification", profileId: "report-subcontractor-profile", organizationId: "org-subcontractor",
    category: "insurance", code: "INS-001", approvedScopes: ["mechanical"], issuer: "Carrier",
    effectiveAt: now, expiresAt: new Date("2027-01-01T00:00:00.000Z"), evidenceFileId: "insurance-evidence",
    exceptionReason: null, state: "verified", verifiedAt: now, verifiedBy: "qualification-reviewer", version: 1,
  });
  state.subcontractorAssignments.set("report-subcontractor-assignment", {
    id: "report-subcontractor-assignment", projectId, profileId: "report-subcontractor-profile",
    organizationId: "org-subcontractor", approvedScopeCode: "mechanical", workPackageIds: ["wp-1"],
    authorizationReference: "AUTH-001", mobilizationState: "released", mobilizedAt: now, mobilizedBy: "mobilization-approver",
    version: 3, createdAt: now, createdBy: "subcontractor-admin", updatedAt: now, updatedBy: "mobilization-approver",
  });
  state.mobilizationRequirements.set("report-mobilization-requirement", {
    id: "report-mobilization-requirement", projectId, assignmentId: "report-subcontractor-assignment", code: "MOB-001",
    category: "insurance", title: "Current insurance", required: true,
    qualificationId: "report-subcontractor-qualification", evidenceFileId: "insurance-evidence", state: "accepted",
    submittedBy: "subcontractor-user", reviewedBy: "mobilization-reviewer", reviewReason: "Current and verified",
    version: 2, createdAt: now, createdBy: "subcontractor-admin", updatedAt: now, updatedBy: "mobilization-reviewer",
  });
  state.subcontractorSubmissions.set("report-submission", {
    id: "report-submission", projectId, assignmentId: "report-subcontractor-assignment", organizationId: "org-subcontractor",
    workPackageId: "wp-1", category: "turnover", title: "Turnover index", claimedProgressPercent: null,
    evidenceFileIds: ["submission-evidence"], state: "accepted", submittedAt: now, submittedBy: "subcontractor-user",
    reviewedAt: now, reviewedBy: "submission-reviewer", acceptanceMeaning: "Accepted for mobilization", rejectionReason: null, version: 2,
  });
  state.completionBoundaries.set("report-boundary", {
    id: "report-boundary", projectId, boundaryType: "system", code: "SYS-001", name: "System 1",
    state: "active", version: 1, createdAt: now, createdBy: "turnover-configurator",
  });
  state.turnoverRequirements.set("report-turnover-requirement", {
    id: "report-turnover-requirement", projectId, completionBoundaryId: "report-boundary", code: "MAT",
    recordClass: "material", required: true, notApplicableAllowed: false, acceptanceAuthority: "turnover-authority",
    state: "active", version: 1, createdAt: now, createdBy: "turnover-configurator",
  });
  state.turnoverPackages.set("report-turnover-package", {
    id: "report-turnover-package", projectId, completionBoundaryId: "report-boundary", code: "TOV-001",
    recipientScope: "customer-system-1", materialItemIds: ["report-material"], state: "generated", version: 2,
    createdAt: now, createdBy: "turnover-configurator", updatedAt: now, updatedBy: "turnover-generator",
  });
  state.turnoverVersions.set("report-turnover-version", {
    id: "report-turnover-version", packageId: "report-turnover-package", projectId, versionNumber: 1,
    recipientScope: "customer-system-1", generatedAt: now, generatedBy: "turnover-generator", manifest: [],
    manifestSha256: "a".repeat(64),
  });
  return new InMemoryFoundationStore(state);
}

test("FORM-PRJ/DOC/MAT/MTR/PMI/INS/NCR/PCH/SUB/TOV: all eleven MVP outputs are immutable, authorized, printable snapshots", async () => {
  const store = reportStore();
  const reports = new ReportingService(store, true, () => now, sequentialIds("controlled-report"));
  const reporter = context("reporter", "mfa");
  const generateAccess = [assignment("report-generate", reporter.userId, ["report.generate"], scope(projectId))];
  const targets: readonly [MvpFormCode, string][] = [
    ["FORM-PRJ-001", projectId], ["FORM-DOC-001", "report-document"],
    ["FORM-MAT-001", "report-material"], ["FORM-MTR-001", "report-mtr-review"],
    ["FORM-PMI-001", "report-pmi"], ["FORM-INS-001", "report-inspection"],
    ["FORM-NCR-001", "report-ncr"], ["FORM-PCH-001", "report-punch"],
    ["FORM-SUB-001", "report-subcontractor-profile"], ["FORM-SUB-002", "report-subcontractor-assignment"],
    ["FORM-TOV-001", "report-turnover-package"],
  ];
  const generated = [];
  for (const [formCode, targetId] of targets) {
    const report = await reports.generate(reporter, generateAccess, projectId, { formCode, targetId });
    generated.push(report);
    assert.equal(report.formCode, formCode);
    assert.equal(report.revisionNumber, 1);
    assert.match(report.structuredSha256, /^[0-9a-f]{64}$/u);
    assert.match(report.printableSha256, /^[0-9a-f]{64}$/u);
    assert.ok(report.sourceRecords.length > 0);
    assert.match(report.printableHtml, /TRAINING \/ NOT FOR PRODUCTION/u);
    assert.match(report.printableHtml, /UNCONTROLLED WHEN PRINTED/u);
    assert.doesNotMatch(report.printableHtml, /<script\b/iu);
  }
  assert.equal(generated.length, 11);
  assert.doesNotMatch(JSON.stringify(generated.find((report) => report.formCode === "FORM-SUB-001")?.structuredContent), /PRIVATE-TAX-REFERENCE/u);

  const revised = await reports.generate(reporter, generateAccess, projectId, { formCode: "FORM-PRJ-001", targetId: projectId });
  assert.equal(revised.revisionNumber, 2);
  const reader = context("report-reader", "mfa");
  const readAccess = [assignment("report-read", reader.userId, ["report.read"], scope(projectId))];
  assert.equal((await reports.report(reader, readAccess, revised.id)).id, revised.id);
  await reports.download(reader, readAccess, revised.id, "json");
  assert.equal((await reports.reportsForProject(reader, readAccess, projectId)).length, 12);
  const dashboard = await reports.dashboard(reader, readAccess, projectId);
  assert.equal(dashboard.readiness.ready, true);
  assert.deepEqual(dashboard.documents, { total: 1, revisions: 1, currentReleased: 1, unreleased: 0, supersededRevisions: 0 });
  assert.equal(dashboard.materials.mtr.pending, 0);
  assert.equal(dashboard.materials.pmi.accepted, 1);
  assert.equal(dashboard.qualificationExpirations[0]?.sourceId, "report-equipment");
  assert.equal(dashboard.subcontractors[0]?.mobilizationState, "released");
  assert.equal(dashboard.turnover[0]?.generatedVersionCount, 1);
  assert.equal(dashboard.exceptions.openNcrs.length, 0);
  assert.equal(dashboard.exceptions.openPunchItems.length, 0);
  const audit = store.snapshot().audits;
  assert.equal(audit.filter((event) => event.action === "report.generated").length, 12);
  assert.equal(audit.filter((event) => event.action === "report.downloaded").length, 1);

  await assert.rejects(
    reports.report(
      context("other-reader", "mfa"),
      [assignment("other-scope", "other-reader", ["report.read"], scope("other-project"))],
      revised.id,
    ),
    (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "scope_denied",
  );
});
