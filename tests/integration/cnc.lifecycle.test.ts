import assert from "node:assert/strict";
import test from "node:test";
import { CncService, InMemoryFoundationStore } from "@eiep/api";
import { AuthorizationDeniedError } from "@eiep/rules-engine";
import { assignment, completeReadiness, context, scope, seedGovernedFile, sequentialIds } from "../helpers/foundation-fixture.js";

const now = new Date("2026-07-21T18:00:00.000Z");
const projectId = "cnc-project";
const organizationId = "org-epv";

function access(userId: string, permissions: readonly string[], qualifications: readonly string[] = []) {
  return {
    context: context(userId, "step-up", qualifications, organizationId),
    assignments: [assignment(`${userId}-cnc-access`, userId, permissions, scope(projectId), {}, organizationId)],
  };
}

async function configuredCnc() {
  const store = new InMemoryFoundationStore();
  const service = new CncService(store, () => now, sequentialIds("cnc"));
  await store.transaction((transaction) => {
    transaction.insertProject({
      id: projectId, businessScopeOrganizationId: organizationId, number: "CNC-001", name: "Controlled CNC pilot",
      customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "America/Denver", state: "active",
      readiness: completeReadiness, version: 2, createdAt: now, createdBy: "project-authority", updatedAt: now, updatedBy: "project-authority",
    });
    transaction.insertDocument({
      id: "cnc-source-document", projectId, number: "CUT-100", title: "Controlled cut detail", type: "drawing",
      discipline: "fabrication", currentRevisionId: "cnc-source-revision", version: 1,
      createdAt: now, createdBy: "document-control", updatedAt: now, updatedBy: "document-control",
    });
    transaction.insertRevision({
      id: "cnc-source-revision", documentId: "cnc-source-document", revision: "0", state: "released",
      purpose: "Issued for controlled machine preparation", source: "machine-neutral fixture", fileId: "cnc-source-file",
      fileValidationState: "released", approvalCount: 1, requiredApprovalCount: 1, supersedesRevisionId: null, version: 2,
      createdAt: now, createdBy: "document-control", updatedAt: now, updatedBy: "document-control",
    });
    transaction.insertMaterial({
      id: "cnc-stock", projectId, identifier: "PIPE-HEAT-100", receiptNumber: "REC-100", purchaseReference: "PO-100",
      vendorOrganizationId: "org-vendor", specification: "A106", grade: "B", form: "pipe", dimensions: "NPS 4 SCH 40",
      quantity: "20", unitCode: "FT", heatLot: "HEAT-100", mtrDocumentRevisionId: "cnc-source-revision",
      receiptEvidenceFileIds: ["cnc-source-file"], storageLocation: "CNC-STAGING", parentItemId: null, state: "released",
      requirements: { projectConfigurationRevisionId: "material-config-1", mtrRequired: true, mtrAccepted: true,
        mtrReviewId: "mtr-review-1", receivingInspectionRequired: true, receivingInspectionAccepted: true,
        pmiRequired: false, pmiAccepted: true, governingPmiRule: null, pmiOverrideId: null, openDispositionCount: 0 },
      version: 3, createdAt: now, createdBy: "receiver", updatedAt: now, updatedBy: "quality-authority",
    });
    transaction.insertFabricationAssembly({
      id: "assembly-revision-1", businessScopeOrganizationId: organizationId, projectId, number: "SP-100", revision: "0",
      assemblyType: "pipe_spool", parentRevisionId: null, revisionReason: "Approved controlled cut scope.", sourceSystem: "manual",
      sourceVersion: null, sourceSha256: null, systemCode: "SYS-01", areaCode: "AREA-01", workPackageCode: "WP-FAB",
      completionBoundaryId: "boundary-1", drawingRevisionIds: ["cnc-source-revision"], materialItemIds: ["cnc-stock"],
      weldIds: [], requiredInspectionIds: [], bomLines: [{ lineKey: "BOM-100", materialItemId: "cnc-stock",
        description: "NPS 4 pipe piece", quantity: "1", unitCode: "EA", pieceMark: "P-100" }],
      cutLines: [{ lineKey: "CUT-100", bomLineKey: "BOM-100", materialItemId: "cnc-stock", cutLength: "120",
        lengthUnitCode: "IN", cutAngleDegrees: "0", bevelCode: null, quantity: "1" }], state: "approved",
      submittedAt: now, submittedBy: "fabrication-planner", reviewedAt: now, reviewedBy: "fabrication-engineer",
      reviewReason: "Approved exact fabrication scope.", releasedAt: null, releasedBy: null, acceptedAt: null, acceptedBy: null,
      version: 3, createdAt: now, createdBy: "fabrication-planner", updatedAt: now, updatedBy: "fabrication-engineer",
    });
    transaction.insertFabricationTraveler({
      id: "traveler-1", businessScopeOrganizationId: organizationId, projectId, assemblyRevisionId: "assembly-revision-1",
      number: "TRV-SP-100", revision: "0", operations: [{ operationKey: "CUT", sequence: 10, operationType: "cut",
        workCenterCode: "SAW-01", requiredQualificationCodes: ["CNC_SAW_OPERATOR"],
        procedureDocumentRevisionId: "cnc-source-revision", holdPoint: false, materialItemIds: ["cnc-stock"], weldIds: [],
        plannedHours: "1", instructions: "Cut from exact released machine-neutral package." }], state: "draft",
      issuedAt: null, issuedBy: null, version: 1, createdAt: now, createdBy: "fabrication-planner",
      updatedAt: now, updatedBy: "fabrication-planner",
    });
  });
  await seedGovernedFile(store, projectId, "cnc-source-file");
  return { store, service };
}

test("FR-CNC-001-006: machine-neutral preparation, independent release, exact download, genealogy, and reconciliation are governed", async () => {
  const { store, service } = await configuredCnc();
  const programmer = access("cnc-programmer", ["cnc.profile.manage", "cnc.program.plan", "cnc.program.submit"]);
  let profile = await service.createMachineProfile(programmer.context, programmer.assignments, projectId, {
    workCenterCode: "SAW-01", revision: "1", parentRevisionId: null, revisionReason: "Initial controlled saw profile.",
    processTypes: ["saw"], stockFormCodes: ["PIPE"], supportedOperationTypes: ["cut", "miter"],
    supportedFeatureCodes: ["STRAIGHT_CUT"], unitCode: "IN", coordinateSystemCode: "XYZ_RIGHT_HAND",
    maximumLength: "240", maximumWidth: "24", maximumThickness: "4", postprocessorName: "Machine-neutral review package",
    postprocessorVersion: "1.0", effectiveFrom: new Date("2026-07-01T00:00:00.000Z"), effectiveTo: null,
  });
  const selfProfileReviewer = access("cnc-programmer", ["cnc.profile.approve"], ["cnc_profile_authority"]);
  await assert.rejects(service.reviewMachineProfile(selfProfileReviewer.context, selfProfileReviewer.assignments,
    profile.id, profile.version, "approve", "Self approval."),
  (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "separation_of_duty");
  const profileAuthority = access("cnc-profile-authority", ["cnc.profile.approve"], ["cnc_profile_authority"]);
  profile = await service.reviewMachineProfile(profileAuthority.context, profileAuthority.assignments, profile.id, profile.version,
    "approve", "Capabilities, dimensions, coordinate convention, and postprocessor identity independently verified.");
  assert.equal(profile.state, "approved");

  const programInput = {
    number: "CNC-SP-100", revision: "0", parentRevisionId: null, revisionReason: "Initial machine-neutral cut package.",
    processType: "saw", sourceFormat: "machine_neutral_json", sourceVersion: "1.0", sourceSha256: "a".repeat(64),
    sourceFileId: "cnc-source-file", sourceDocumentRevisionId: "cnc-source-revision", assemblyRevisionId: "assembly-revision-1",
    travelerId: "traveler-1", travelerOperationKey: "CUT", machineProfileRevisionId: profile.id, materialItemId: "cnc-stock",
    pieceMark: "P-100", quantity: "1", stock: { formCode: "PIPE", unitCode: "IN", length: "120", width: "4.5",
      thickness: "0.237", diameter: "4.5" }, coordinateSystemCode: "XYZ_RIGHT_HAND", operations: [{ operationKey: "CUT-10",
      sequence: 10, operationType: "cut", featureCode: "STRAIGHT_CUT", x: "0", y: "0", z: "0", length: "120",
      width: "4.5", depth: "0.237", diameter: "4.5", angleDegrees: "0", toolCode: null,
      instruction: "Cut one heat-traceable piece and preserve identity." }], warningDispositions: {},
  } as const;
  const invalidProgram = await service.createProgram(programmer.context, programmer.assignments, projectId, {
    ...programInput, number: "CNC-INVALID-100", sourceSha256: "d".repeat(64),
    operations: [{ ...programInput.operations[0], x: "300", featureCode: "UNSUPPORTED_FEATURE" }],
  });
  assert.equal(invalidProgram.state, "draft");
  assert.deepEqual(invalidProgram.validationFindings.map((finding) => finding.code),
    ["source_hash_mismatch", "feature_unsupported", "geometry_out_of_bounds"]);
  await assert.rejects(service.submitProgram(programmer.context, programmer.assignments, invalidProgram.id, invalidProgram.version),
    (error: unknown) => error instanceof Error && "details" in error && Array.isArray(error.details)
      && error.details.includes("cnc_program_validation_incomplete"));
  let program = await service.createProgram(programmer.context, programmer.assignments, projectId, programInput);
  assert.equal(program.state, "validated");
  assert.deepEqual(program.validationFindings, []);
  program = await service.submitProgram(programmer.context, programmer.assignments, program.id, program.version);
  const selfTechnicalReviewer = access("cnc-programmer", ["cnc.program.approve"], ["cnc_technical_authority"]);
  await assert.rejects(service.reviewProgram(selfTechnicalReviewer.context, selfTechnicalReviewer.assignments,
    program.id, program.version, "approve", "Self approval."),
  (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "separation_of_duty");
  const technicalAuthority = access("cnc-technical-authority", ["cnc.program.approve"], ["cnc_technical_authority"]);
  program = await service.reviewProgram(technicalAuthority.context, technicalAuthority.assignments, program.id, program.version,
    "approve", "Exact source, assembly, material, profile, coordinates, operations, and hash independently verified.");
  const releaseAuthority = access("cnc-release-authority", ["cnc.job.release"], ["cnc_release_authority"]);
  program = await service.releaseProgram(releaseAuthority.context, releaseAuthority.assignments, program.id, program.version,
    "Released for controlled operator download; direct machine control remains prohibited.");
  assert.equal(program.state, "released");
  assert.ok(program.releasedArtifactSha256);

  const operator = access("cnc-operator", ["cnc.job.download", "cnc.execute"], ["CNC_SAW_OPERATOR"]);
  const artifact = await service.artifact(operator.context, operator.assignments, program.id);
  assert.equal(artifact.sha256, program.releasedArtifactSha256);
  assert.match(artifact.content, /NO_DIRECT_MACHINE_CONTROL/u);
  await assert.rejects(service.recordExecution(operator.context, operator.assignments, program.id, {
    expectedProgramVersion: program.version, releasedArtifactSha256: "b".repeat(64), workCenterCode: "SAW-01",
    machineIdentifier: "SAW-A", startedAt: new Date("2026-07-21T17:00:00.000Z"),
    completedAt: new Date("2026-07-21T17:30:00.000Z"), actualQuantity: "1", scrapQuantity: "0",
    producedMaterialItemIds: [], remnantMaterialItemIds: [], evidenceFileIds: ["cnc-source-file"], exceptionNcrIds: [], result: "complete",
  }), (error: unknown) => error instanceof Error && "details" in error && Array.isArray(error.details)
    && error.details.includes("cnc_execution_release_mismatch"));

  await store.transaction((transaction) => {
    const source = transaction.materialById("cnc-stock")!;
    transaction.insertMaterial({ ...source, id: "cnc-piece-1", identifier: "P-100", quantity: "1", unitCode: "EA",
      parentItemId: source.id, storageLocation: "SAW-OUTFEED", state: "issued", version: 1,
      createdAt: now, createdBy: "cnc-operator", updatedAt: now, updatedBy: "cnc-operator" });
  });
  const recorded = await service.recordExecution(operator.context, operator.assignments, program.id, {
    expectedProgramVersion: program.version, releasedArtifactSha256: program.releasedArtifactSha256!, workCenterCode: "SAW-01",
    machineIdentifier: "SAW-A", startedAt: new Date("2026-07-21T17:00:00.000Z"),
    completedAt: new Date("2026-07-21T17:30:00.000Z"), actualQuantity: "1", scrapQuantity: "0",
    producedMaterialItemIds: ["cnc-piece-1"], remnantMaterialItemIds: [], evidenceFileIds: ["cnc-source-file"],
    exceptionNcrIds: [], result: "complete",
  });
  const selfReconciler = access("cnc-operator", ["cnc.execution.reconcile"], ["cnc_reconciliation_authority"]);
  await assert.rejects(service.reconcileExecution(selfReconciler.context, selfReconciler.assignments, recorded.execution.id,
    recorded.execution.version, recorded.program.version, "accept", "Self reconciliation."),
  (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "separation_of_duty");
  const reconciliationAuthority = access("cnc-reconciliation-authority", ["cnc.execution.reconcile"], ["cnc_reconciliation_authority"]);
  const reconciled = await service.reconcileExecution(reconciliationAuthority.context, reconciliationAuthority.assignments,
    recorded.execution.id, recorded.execution.version, recorded.program.version, "accept",
    "Released hash, work center, quantities, evidence, and material genealogy independently reconciled.");
  assert.equal(reconciled.execution.state, "accepted");
  assert.equal(reconciled.program.state, "reconciled");
  let successor = await service.createProgram(programmer.context, programmer.assignments, projectId, {
    ...programInput, revision: "1", parentRevisionId: reconciled.program.id,
    revisionReason: "Controlled successor after reconciled execution.",
  });
  assert.equal(successor.state, "validated");
  successor = await service.submitProgram(programmer.context, programmer.assignments, successor.id, successor.version);
  successor = await service.reviewProgram(technicalAuthority.context, technicalAuthority.assignments, successor.id, successor.version,
    "approve", "Successor source, lineage, operations, and deterministic hash independently verified.");
  assert.equal(successor.state, "approved");
  const historicalArtifact = await service.artifact(operator.context, operator.assignments, program.id);
  assert.equal(historicalArtifact.sha256, program.releasedArtifactSha256);
  const reader = access("cnc-reader", ["cnc.read"]);
  const snapshot = await service.snapshot(reader.context, reader.assignments, projectId);
  assert.equal(snapshot.machineProfiles.length, 1);
  assert.equal(snapshot.programs.find((item) => item.id === program.id)?.state, "superseded");
  assert.equal(snapshot.programs.find((item) => item.id === successor.id)?.parentRevisionId, program.id);
  assert.equal(snapshot.programs.find((item) => item.id === invalidProgram.id)?.state, "draft");
  assert.equal(snapshot.executions[0]!.producedMaterialItemIds[0], "cnc-piece-1");
  const audits = await store.transaction((transaction) => transaction.auditForProject(projectId));
  assert.equal(audits.some((item) => item.action === "cnc.job_released"), true);
  assert.equal(audits.some((item) => item.action === "cnc.job_downloaded"), true);
  assert.equal(audits.some((item) => item.action === "cnc.execution_accepted"), true);
});
