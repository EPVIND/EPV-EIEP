import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationDeniedError } from "@eiep/rules-engine";
import {
  FoundationService,
  InMemoryFoundationStore,
  OperationalService,
  ValidationError,
} from "@eiep/api";
import { approveMaterialConfiguration, assignment, completeReadiness, context, scope, seedAuthoritativeProjectReadiness, seedGovernedFile, sequentialIds } from "../helpers/foundation-fixture.js";

const fixedTime = new Date("2026-07-20T21:00:00.000Z");

async function setupProjectAndMtr(projectNumber: string) {
  const store = new InMemoryFoundationStore();
  const ids = sequentialIds(projectNumber.toLowerCase());
  const foundation = new FoundationService(store, () => fixedTime, ids);
  const operations = new OperationalService(store, () => fixedTime, ids);
  const project = await foundation.createProject(
    context("project-creator"),
    [assignment("create-project", "project-creator", ["project.create"], scope())],
    {
      businessScopeOrganizationId: "org-epv", number: projectNumber, name: "Operational vertical slice",
      customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "America/Denver",
      readiness: completeReadiness,
    },
  );
  await seedAuthoritativeProjectReadiness(store, project.id, fixedTime);
  await foundation.activateProject(
    context("project-authority"),
    [assignment("activate-project", "project-authority", ["project.activate"], scope(project.id))],
    project.id,
    project.version,
  );
  const document = await foundation.registerDocument(
    context("document-controller"),
    [assignment("create-mtr", "document-controller", ["document.create"], scope(project.id))],
    project.id,
    { number: `${projectNumber}-MTR-001`, title: "Material test report", type: "material_certification", discipline: "quality" },
  );
  await seedGovernedFile(store, project.id, "mtr-file");
  const revision = await foundation.submitDocumentRevision(
    context("mtr-author"),
    [assignment("submit-mtr", "mtr-author", ["document.revision.submit"], scope(project.id))],
    document.id,
    { revision: "0", purpose: "Material certification", source: "controlled supplier submittal", fileId: "mtr-file", requiredApprovalCount: 1 },
  );
  const approved = await foundation.approveDocumentRevision(
    context("mtr-approver"),
    [assignment("approve-mtr", "mtr-approver", ["document.approve"], scope(project.id, document.id))],
    revision.id,
    revision.version,
    true,
  );
  const released = await foundation.releaseDocumentRevision(
    context("document-releaser"),
    [assignment("release-mtr", "document-releaser", ["document.release"], scope(project.id, document.id))],
    approved.id,
    approved.version,
    document.version,
  );
  return { store, foundation, operations, project, mtrRevision: released };
}

async function configureTurnoverPackage(
  operations: OperationalService,
  projectId: string,
  code: string,
  materialItemIds: readonly string[],
  recordClasses: readonly ("material" | "pmi" | "ncr" | "punch" | "document_revision")[],
) {
  const configurator = context("turnover-configurator", "mfa");
  const configureAccess = [assignment(`configure-${code}`, configurator.userId, ["turnover.configure", "turnover.package.create"], scope(projectId))];
  const boundary = await operations.createCompletionBoundary(
    configurator,
    configureAccess,
    projectId,
    { boundaryType: "system", code: `${code}-BOUNDARY`, name: `${code} completion boundary` },
  );
  for (const recordClass of recordClasses) {
    await operations.configureTurnoverRequirement(
      configurator,
      configureAccess,
      boundary.id,
      {
        code: `${code}-${recordClass}`, recordClass, required: true,
        notApplicableAllowed: recordClass === "ncr" || recordClass === "punch" || recordClass === "pmi" || recordClass === "document_revision",
        acceptanceAuthority: "configured-turnover-authority",
      },
    );
  }
  return operations.createTurnoverPackage(
    configurator,
    configureAccess,
    boundary.id,
    { code, recipientScope: "customer-system-1", materialItemIds },
  );
}

async function acceptMtr(operations: OperationalService, projectId: string, materialId: string, expectedVersion: number) {
  return operations.reviewMtr(
    context(`mtr-reviewer-${materialId}`, "step-up", ["mtr_reviewer"]),
    [assignment(`review-mtr-${materialId}`, `mtr-reviewer-${materialId}`, ["material.mtr.review"], scope(projectId))],
    materialId,
    expectedVersion,
    {
      decision: "accepted", heatLotVerified: true, gradeVerified: true, specificationVerified: true,
      reviewNotes: "Exact released MTR revision matches heat/lot, grade, and governing specification.",
      evidenceFileIds: [`mtr-review-evidence-${materialId}`],
    },
  );
}

test("FR-MAT-001-005, FR-PMI-001-003, FR-TOV-002-004 / AC-05-06-09: accepted material preserves MTR/genealogy and produces immutable turnover versions", async () => {
  const { store, foundation, operations, project, mtrRevision } = await setupProjectAndMtr("OPS-001");
  const materialConfiguration = await approveMaterialConfiguration(foundation, store, project.id, "1", {
    mtrRequired: true, receivingInspectionRequired: true, pmiRequired: true,
    governingPmiRule: "PROJECT-RULE-PMI-001",
  }, [mtrRevision.id]);
  const received = await operations.receiveMaterial(
    context("receiver", "mfa"),
    [assignment("receive", "receiver", ["material.receive"], scope(project.id))],
    project.id,
    {
      projectConfigurationRevisionId: materialConfiguration.id,
      identifier: "mat-0001", receiptNumber: "rcv-001", purchaseReference: "po-001",
      vendorOrganizationId: "org-vendor", specification: "project-spec-1", grade: "GRADE-A",
      form: "pipe", dimensions: "NPS 2 SCH 80", quantity: "12.500", unitCode: "FT", heatLot: "HEAT-001",
      mtrDocumentRevisionId: mtrRevision.id, receiptEvidenceFileIds: ["receipt-photo", "packing-list"],
      storageLocation: "RACK-A1", mtrRequired: true, receivingInspectionRequired: true,
      pmiRequired: true, governingPmiRule: "PROJECT-RULE-PMI-001",
    },
  );
  const pmiRequirement = await operations.pmiRequirement(
    context("quality-reader", "standard"),
    [assignment("read-pmi-rule", "quality-reader", ["pmi.read"], scope(project.id))],
    received.id,
  );
  assert.deepEqual(pmiRequirement, {
    required: true, governingRule: "PROJECT-RULE-PMI-001", decisionSource: "project_configuration",
    projectConfigurationRevisionId: materialConfiguration.id, overrideId: null, reason: "PROJECT-RULE-PMI-001",
  });

  await assert.rejects(
    operations.reviewMtr(
      context("receiver", "step-up", ["mtr_reviewer"]),
      [assignment("self-review-mtr", "receiver", ["material.mtr.review"], scope(project.id))],
      received.id, received.version,
      {
        decision: "accepted", heatLotVerified: true, gradeVerified: true, specificationVerified: true,
        reviewNotes: "Receiver must not accept their own MTR review.", evidenceFileIds: ["self-review-evidence"],
      },
    ),
    (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "separation_of_duty",
  );

  const reviewedMtr = await acceptMtr(operations, project.id, received.id, received.version);
  assert.equal(reviewedMtr.material.requirements.mtrAccepted, true);
  assert.equal(reviewedMtr.material.requirements.mtrReviewId, reviewedMtr.review.id);

  await operations.acceptReceivingInspection(
    context("receiving-inspector", "step-up", ["receiving_inspector"]),
    [assignment("accept-receipt", "receiving-inspector", ["inspection.accept"], scope(project.id))],
    received.id,
    reviewedMtr.material.version,
  );
  const equipment = await operations.registerEquipment(
    context("equipment-admin", "mfa"),
    [assignment("equipment", "equipment-admin", ["inspection.equipment.manage"], scope(project.id))],
    project.id,
    {
      identifier: "xrf-001", serialNumber: "SERIAL-XRF-001", methodCapabilities: ["XRF"],
      verificationState: "passed", validFrom: new Date("2026-07-01T00:00:00.000Z"),
      validTo: new Date("2026-08-01T00:00:00.000Z"), evidenceFileId: "daily-verification-file",
    },
  );
  const pmi = await operations.recordPmi(
    context("pmi-inspector", "mfa", ["pmi_inspector"]),
    [assignment("perform-pmi", "pmi-inspector", ["pmi.perform"], scope(project.id))],
    received.id,
    {
      governingRule: "PROJECT-RULE-PMI-001", requiredMaterial: "GRADE-A", observedMaterial: "GRADE-A",
      method: "XRF", componentLocation: "HEAT-001 receiving location", equipmentId: equipment.id, inspectedAt: fixedTime,
      readings: { chromium: "18.2", nickel: "8.1" }, evidenceFileIds: ["pmi-result-file"],
      notes: "Observed readings match the controlled material requirement.", result: "pass",
    },
  );
  const acceptedPmi = await operations.acceptPmi(
    context("pmi-acceptor", "step-up", ["pmi_acceptor"]),
    [assignment("accept-pmi", "pmi-acceptor", ["pmi.accept"], scope(project.id))],
    pmi.id,
    pmi.version,
  );
  assert.equal(acceptedPmi.state, "accepted");
  const readyMaterial = await store.transaction((transaction) => transaction.materialById(received.id));
  assert.ok(readyMaterial);
  const released = await operations.releaseMaterial(
    context("material-releaser", "step-up", ["material_release_authority"]),
    [assignment("release-material", "material-releaser", ["material.release.approve"], scope(project.id))],
    received.id,
    readyMaterial.version,
  );
  await assert.rejects(
    operations.splitMaterial(
      context("fabricator", "mfa"),
      [assignment("split-invalid", "fabricator", ["material.genealogy.manage"], scope(project.id))],
      released.id,
      released.version,
      { childIdentifier: "MAT-INVALID", relationship: "cut_piece", childQuantity: "2.500", remainingParentQuantity: "9.999", storageLocation: "CUT-STATION-1" },
    ),
    (error: unknown) => error instanceof ValidationError && error.details.includes("quantity_reconciliation_failed"),
  );
  const split = await operations.splitMaterial(
    context("fabricator", "mfa"),
    [assignment("split-material", "fabricator", ["material.genealogy.manage"], scope(project.id))],
    released.id,
    released.version,
    { childIdentifier: "MAT-0001-C1", relationship: "cut_piece", childQuantity: "2.500", remainingParentQuantity: "10.000", storageLocation: "CUT-STATION-1" },
  );
  assert.equal(split.child.heatLot, received.heatLot);
  assert.equal(split.child.mtrDocumentRevisionId, mtrRevision.id);
  assert.equal(split.genealogy.parentItemId, received.id);

  const configuredPackage = await configureTurnoverPackage(
    operations, project.id, "PACKAGE-SYSTEM-1", [split.parent.id, split.child.id], ["material", "pmi", "document_revision"],
  );
  const turnoverAccess = [assignment("generate-turnover", "turnover-coordinator", ["turnover.generate"], scope(project.id))];
  const packageV1 = await operations.generateTurnover(
    context("turnover-coordinator"), turnoverAccess,
    { packageId: configuredPackage.id, projectId: project.id },
  );
  assert.equal(packageV1.versionNumber, 1);
  assert.deepEqual(packageV1.manifest.map((entry) => entry.sourceType), ["document_revision", "material", "material", "pmi"]);
  assert.equal(packageV1.manifest.filter((entry) => entry.sourceType === "document_revision").length, 1);
  assert.equal(packageV1.manifest.filter((entry) => entry.sourceType === "pmi").length, 1);
  const issued = await operations.issueMaterial(
    context("warehouse", "mfa"),
    [assignment("issue-material", "warehouse", ["material.issue"], scope(project.id))],
    split.parent.id,
    split.parent.version,
  );
  assert.equal(issued.state, "issued");
  const packageV2 = await operations.generateTurnover(
    context("turnover-coordinator"), turnoverAccess,
    { packageId: configuredPackage.id, projectId: project.id },
  );
  assert.equal(packageV2.versionNumber, 2);
  assert.notEqual(packageV2.manifestSha256, packageV1.manifestSha256);
  const delta = await operations.compareTurnoverVersions(
    context("turnover-reader", "mfa"),
    [assignment("read-turnover", "turnover-reader", ["turnover.read"], scope(project.id))],
    project.id, configuredPackage.id, 1, 2,
  );
  assert.deepEqual(delta, { added: [], removed: [], changed: [`material:${issued.id}`] });

  const returned = await operations.returnMaterial(
    context("warehouse-return", "mfa"),
    [assignment("return-material", "warehouse-return", ["material.return"], scope(project.id))],
    issued.id, issued.version, { toLocation: "RETURN-RACK-1", reason: "Unused balance returned from the work front." },
  );
  const relocated = await operations.moveMaterial(
    context("warehouse-move", "mfa"),
    [assignment("move-material", "warehouse-move", ["material.move"], scope(project.id))],
    returned.id, returned.version, { toLocation: "QA-RACK-2", reason: "Moved to the controlled QA storage zone." },
  );
  const reissued = await operations.issueMaterial(
    context("warehouse-reissue", "mfa"),
    [assignment("reissue-material", "warehouse-reissue", ["material.issue"], scope(project.id))],
    relocated.id, relocated.version,
  );
  assert.equal(reissued.state, "issued");
  const movementHistory = await operations.materialMovements(
    context("material-reader", "mfa"),
    [assignment("read-material-history", "material-reader", ["material.read"], scope(project.id))],
    reissued.id,
  );
  assert.deepEqual(
    movementHistory.map((movement) => movement.movementType),
    ["received", "released", "split_out", "issued", "returned", "relocated", "issued"],
  );
  const mtrHistory = await operations.mtrReviews(
    context("material-reader", "mfa"),
    [assignment("read-mtr-history", "material-reader", ["material.read"], scope(project.id))],
    reissued.id,
  );
  assert.equal(mtrHistory.length, 1);
  assert.equal(mtrHistory[0]?.decision, "accepted");

  const history = await foundation.auditHistory(
    context("auditor", "mfa"),
    [assignment("audit", "auditor", ["audit.read"], scope(project.id))],
    project.id,
  );
  assert.ok(history.some((event) => event.action === "material.received"));
  assert.ok(history.some((event) => event.action === "pmi.accepted"));
  assert.ok(history.some((event) => event.action === "turnover.regenerated"));
});

test("FR-MAT-004-005, FR-PMI-003-004, FR-NCR-001-003 / AC-06-07: failed PMI atomically quarantines one material and enforces independent NCR recovery", async () => {
  const { store, foundation, operations, project, mtrRevision } = await setupProjectAndMtr("OPS-002");
  const materialConfiguration = await approveMaterialConfiguration(foundation, store, project.id, "1", {
    mtrRequired: true, receivingInspectionRequired: false, pmiRequired: true,
    governingPmiRule: "PROJECT-RULE-PMI-FAIL",
  }, [mtrRevision.id]);
  const received = await operations.receiveMaterial(
    context("receiver", "mfa"),
    [assignment("receive", "receiver", ["material.receive"], scope(project.id))],
    project.id,
    {
      projectConfigurationRevisionId: materialConfiguration.id,
      identifier: "mat-fail", receiptNumber: "rcv-002", purchaseReference: "po-002",
      vendorOrganizationId: "org-vendor", specification: "project-spec-2", grade: "GRADE-B", form: "plate",
      dimensions: "1 IN", quantity: "1", unitCode: "EA", heatLot: "HEAT-FAIL",
      mtrDocumentRevisionId: mtrRevision.id, receiptEvidenceFileIds: ["receipt-evidence"], storageLocation: "HOLD-AREA",
      mtrRequired: true, receivingInspectionRequired: false, pmiRequired: true, governingPmiRule: "PROJECT-RULE-PMI-FAIL",
    },
  );
  await acceptMtr(operations, project.id, received.id, received.version);
  const equipment = await operations.registerEquipment(
    context("equipment-admin", "mfa"),
    [assignment("equipment", "equipment-admin", ["inspection.equipment.manage"], scope(project.id))],
    project.id,
    {
      identifier: "xrf-002", serialNumber: "SERIAL-XRF-002", methodCapabilities: ["XRF"], verificationState: "passed",
      validFrom: new Date("2026-07-01T00:00:00.000Z"), validTo: new Date("2026-08-01T00:00:00.000Z"),
      evidenceFileId: "verification-file",
    },
  );
  const pmiContext = context("pmi-inspector", "mfa", ["pmi_inspector"]);
  const pmiAssignments = [assignment("perform-and-contain", "pmi-inspector", ["pmi.perform", "ncr.create"], scope(project.id))];
  const failedPmiInput = {
    governingRule: "PROJECT-RULE-PMI-FAIL", requiredMaterial: "GRADE-B", observedMaterial: "OTHER-GRADE",
    method: "XRF", componentLocation: "Quarantine rack / received item", equipmentId: equipment.id,
    inspectedAt: fixedTime, readings: { nickel: "unexpected" }, evidenceFileIds: ["failed-pmi-file"],
    notes: "Observed alloy did not match the controlled requirement.", result: "fail" as const, failedNcrNumber: "NCR-001",
    failureDescription: "Observed alloy does not match the required material.",
    containment: "Segregated in the marked quarantine area.", failureResponsibleUserId: "material-owner", turnoverRequired: true,
  };
  await assert.rejects(
    operations.recordPmi(pmiContext, pmiAssignments, received.id, { ...failedPmiInput, componentLocation: " " }),
    (error: unknown) => error instanceof ValidationError && error.details.includes("componentLocation_required"),
  );
  await assert.rejects(
    operations.recordPmi(pmiContext, pmiAssignments, received.id, { ...failedPmiInput, notes: " " }),
    (error: unknown) => error instanceof ValidationError && error.details.includes("notes_required"),
  );
  const failed = await operations.recordPmi(pmiContext, pmiAssignments, received.id, failedPmiInput);
  assert.equal(failed.state, "failed");
  assert.ok(failed.ncrId);
  const quarantined = await store.transaction((transaction) => transaction.materialById(received.id));
  const ncr = await store.transaction((transaction) => transaction.ncrById(failed.ncrId!));
  assert.equal(quarantined?.state, "quarantined");
  assert.equal(quarantined?.requirements.openDispositionCount, 1);
  assert.equal(ncr?.affectedObjectId, received.id);
  await assert.rejects(
    operations.issueMaterial(
      context("warehouse", "mfa"),
      [assignment("issue", "warehouse", ["material.issue"], scope(project.id))],
      received.id,
      quarantined!.version,
    ),
    (error: unknown) => error instanceof ValidationError && error.details.includes("material_not_released"),
  );

  await assert.rejects(
    operations.proposeNcrDisposition(
      context("disposition-proposer", "mfa"),
      [assignment("propose", "disposition-proposer", ["ncr.disposition.propose"], scope(project.id))],
      ncr!.id,
      ncr!.version,
      { disposition: "Replace the affected material and repeat PMI.", correctiveAction: " " },
    ),
    (error: unknown) => error instanceof ValidationError && error.details.includes("correctiveAction_required"),
  );
  const proposed = await operations.proposeNcrDisposition(
    context("disposition-proposer", "mfa"),
    [assignment("propose", "disposition-proposer", ["ncr.disposition.propose"], scope(project.id))],
    ncr!.id,
    ncr!.version,
    { disposition: "Replace the affected material and repeat PMI.",
      correctiveAction: "Replace the nonconforming item, verify identity, and repeat PMI before release." },
  );
  await assert.rejects(
    operations.approveNcrDisposition(
      context("disposition-proposer", "step-up", ["ncr_disposition_authority"]),
      [assignment("self-approve", "disposition-proposer", ["ncr.disposition.approve"], scope(project.id))],
      proposed.id,
      proposed.version,
    ),
    (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "separation_of_duty",
  );
  const approved = await operations.approveNcrDisposition(
    context("disposition-approver", "step-up", ["ncr_disposition_authority"]),
    [assignment("approve", "disposition-approver", ["ncr.disposition.approve"], scope(project.id))],
    proposed.id,
    proposed.version,
  );
  const reinspected = await operations.recordNcrReinspection(
    context("quality-inspector", "mfa", ["quality_inspector"]),
    [assignment("reinspect", "quality-inspector", ["ncr.reinspect"], scope(project.id))],
    approved.id,
    approved.version,
    "reinspection-evidence",
  );
  const closed = await operations.closeNcr(
    context("ncr-closer", "step-up", ["ncr_close_authority"]),
    [assignment("close", "ncr-closer", ["ncr.close"], scope(project.id))],
    reinspected.id,
    reinspected.version,
  );
  assert.equal(closed.state, "closed");
  const afterClosure = await store.transaction((transaction) => transaction.materialById(received.id));
  assert.equal(afterClosure?.state, "received_pending");
  assert.equal(afterClosure?.requirements.openDispositionCount, 0);

  const passing = await operations.recordPmi(
    context("second-pmi-inspector", "mfa", ["pmi_inspector"]),
    [assignment("repeat-pmi", "second-pmi-inspector", ["pmi.perform"], scope(project.id))],
    received.id,
    {
      governingRule: "PROJECT-RULE-PMI-FAIL", requiredMaterial: "GRADE-B", observedMaterial: "GRADE-B",
      method: "XRF", componentLocation: "Replacement item receiving location", equipmentId: equipment.id,
      inspectedAt: fixedTime, readings: { chromium: "accepted" }, evidenceFileIds: ["passing-pmi-file"],
      notes: "Replacement item matches the controlled requirement.", result: "pass",
    },
  );
  await operations.acceptPmi(
    context("pmi-acceptor", "step-up", ["pmi_acceptor"]),
    [assignment("accept-pmi", "pmi-acceptor", ["pmi.accept"], scope(project.id))],
    passing.id,
    passing.version,
  );
  const releasable = await store.transaction((transaction) => transaction.materialById(received.id));
  const released = await operations.releaseMaterial(
    context("material-releaser", "step-up", ["material_release_authority"]),
    [assignment("release", "material-releaser", ["material.release.approve"], scope(project.id))],
    received.id,
    releasable!.version,
  );
  const configuredPackage = await configureTurnoverPackage(
    operations, project.id, "PACKAGE-NCR", [released.id], ["material", "pmi", "ncr", "document_revision"],
  );
  const turnover = await operations.generateTurnover(
    context("turnover-coordinator"),
    [assignment("turnover", "turnover-coordinator", ["turnover.generate"], scope(project.id))],
    { packageId: configuredPackage.id, projectId: project.id },
  );
  assert.ok(turnover.manifest.some((entry) => entry.sourceType === "ncr" && entry.sourceId === closed.id));
});

test("FR-MAT-005, FR-PMI-003 / AC-05-06: missing MTR and expired instrument verification remain explicit release blockers", async () => {
  const { store, foundation, operations, project, mtrRevision } = await setupProjectAndMtr("OPS-003");
  const noPmiConfiguration = await approveMaterialConfiguration(foundation, store, project.id, "1", {
    mtrRequired: true, receivingInspectionRequired: false, pmiRequired: false,
  }, [mtrRevision.id]);
  const missingMtr = await operations.receiveMaterial(
    context("receiver", "mfa"),
    [assignment("receive-missing-mtr", "receiver", ["material.receive"], scope(project.id))],
    project.id,
    {
      projectConfigurationRevisionId: noPmiConfiguration.id,
      identifier: "MAT-NO-MTR", receiptNumber: "RCV-NO-MTR", purchaseReference: "PO-NO-MTR",
      vendorOrganizationId: "org-vendor", specification: "project-spec", grade: "GRADE-C", form: "bar",
      dimensions: "configured", quantity: "1", unitCode: "EA", heatLot: "HEAT-NO-MTR",
      mtrDocumentRevisionId: null, receiptEvidenceFileIds: ["receipt-file"], storageLocation: "RACK-1",
      mtrRequired: true, receivingInspectionRequired: false, pmiRequired: false, governingPmiRule: null,
    },
  );
  await assert.rejects(
    operations.releaseMaterial(
      context("material-releaser", "step-up", ["material_release_authority"]),
      [assignment("release-no-mtr", "material-releaser", ["material.release.approve"], scope(project.id))],
      missingMtr.id,
      missingMtr.version,
    ),
    (error: unknown) => error instanceof ValidationError
      && error.details.includes("mtr_missing")
      && error.details.includes("mtr_not_accepted"),
  );

  const pmiConfiguration = await approveMaterialConfiguration(foundation, store, project.id, "2", {
    mtrRequired: true, receivingInspectionRequired: false, pmiRequired: true,
    governingPmiRule: "PROJECT-RULE-PMI-EXPIRY",
  }, [mtrRevision.id]);
  const material = await operations.receiveMaterial(
    context("receiver-two", "mfa"),
    [assignment("receive-expired", "receiver-two", ["material.receive"], scope(project.id))],
    project.id,
    {
      projectConfigurationRevisionId: pmiConfiguration.id,
      identifier: "MAT-EXPIRED-PMI", receiptNumber: "RCV-EXPIRED", purchaseReference: "PO-EXPIRED",
      vendorOrganizationId: "org-vendor", specification: "project-spec", grade: "GRADE-C", form: "bar",
      dimensions: "configured", quantity: "1", unitCode: "EA", heatLot: "HEAT-EXPIRED",
      mtrDocumentRevisionId: mtrRevision.id, receiptEvidenceFileIds: ["receipt-file-2"], storageLocation: "RACK-2",
      mtrRequired: true, receivingInspectionRequired: false, pmiRequired: true, governingPmiRule: "PROJECT-RULE-PMI-EXPIRY",
    },
  );
  const reviewedMtr = await acceptMtr(operations, project.id, material.id, material.version);
  const expiredEquipment = await operations.registerEquipment(
    context("equipment-admin", "mfa"),
    [assignment("equipment-expired", "equipment-admin", ["inspection.equipment.manage"], scope(project.id))],
    project.id,
    {
      identifier: "XRF-EXPIRED", serialNumber: "SERIAL-EXPIRED", methodCapabilities: ["XRF"], verificationState: "passed",
      validFrom: new Date("2026-06-01T00:00:00.000Z"), validTo: new Date("2026-07-19T00:00:00.000Z"), evidenceFileId: "expired-verification-file",
    },
  );
  const pmi = await operations.recordPmi(
    context("pmi-inspector", "mfa", ["pmi_inspector"]),
    [assignment("perform-expired", "pmi-inspector", ["pmi.perform"], scope(project.id))],
    material.id,
    {
      governingRule: "PROJECT-RULE-PMI-EXPIRY", requiredMaterial: "GRADE-C", observedMaterial: "GRADE-C",
      method: "XRF", componentLocation: "Receiving inspection station", equipmentId: expiredEquipment.id,
      inspectedAt: fixedTime, readings: { chromium: "configured" }, evidenceFileIds: ["pmi-evidence"],
      notes: "Reading captured before acceptance review.", result: "pass",
    },
  );
  await assert.rejects(
    operations.acceptPmi(
      context("pmi-acceptor", "step-up", ["pmi_acceptor"]),
      [assignment("accept-expired", "pmi-acceptor", ["pmi.accept"], scope(project.id))],
      pmi.id,
      pmi.version,
    ),
    (error: unknown) => error instanceof ValidationError && error.details.includes("instrument_verification_expired"),
  );
  await assert.rejects(
    operations.releaseMaterial(
      context("material-releaser", "step-up", ["material_release_authority"]),
      [assignment("release-expired", "material-releaser", ["material.release.approve"], scope(project.id))],
      material.id,
      reviewedMtr.material.version,
    ),
    (error: unknown) => error instanceof ValidationError && error.details.includes("pmi_incomplete"),
  );
});
