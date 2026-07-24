import assert from "node:assert/strict";
import test from "node:test";
import { FabricationService, InMemoryFoundationStore } from "@eiep/api";
import { AuthorizationDeniedError } from "@eiep/rules-engine";
import { assignment, completeReadiness, context, scope, seedGovernedFile, sequentialIds } from "../helpers/foundation-fixture.js";

const now = new Date("2026-07-21T18:00:00.000Z");
const projectId = "fabrication-project";
const organizationId = "org-epv";

function access(userId: string, permissions: readonly string[], qualifications: readonly string[] = []) {
  return {
    context: context(userId, "step-up", qualifications, organizationId),
    assignments: [assignment(`${userId}-fabrication-access`, userId, permissions, scope(projectId), {}, organizationId)],
  };
}

async function configuredFabrication() {
  const store = new InMemoryFoundationStore();
  const service = new FabricationService(store, () => now, sequentialIds("fabrication"));
  await store.transaction((transaction) => {
    transaction.insertProject({
      id: projectId, businessScopeOrganizationId: organizationId, number: "FAB-001", name: "Fabrication controlled pilot",
      customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "America/Denver", state: "active",
      readiness: completeReadiness, version: 2, createdAt: now, createdBy: "project-authority", updatedAt: now, updatedBy: "project-authority",
    });
    for (const [type, id, parentId, structureCode, name] of [
      ["system", "system-1", null, "SYS-01", "Process system"],
      ["area", "area-1", "system-1", "AREA-01", "Process area"],
      ["wbs", "wbs-1", null, "WBS-FAB", "Fabrication WBS"],
      ["work_package", "work-package-1", "wbs-1", "WP-FAB", "Fabrication work package"],
    ] as const) transaction.insertProjectStructure({
      id, projectId, type, parentId, code: structureCode, name, state: "active", version: 1, createdAt: now, createdBy: "project-authority",
    });
    transaction.insertCompletionBoundary({ id: "boundary-1", projectId, boundaryType: "system", code: "FAB-SYS-01",
      name: "Fabrication system 01", state: "active", version: 1, createdAt: now, createdBy: "completion-authority" });
    transaction.insertDocument({ id: "drawing-1", projectId, number: "ISO-100", title: "Spool isometric",
      type: "drawing", discipline: "piping", currentRevisionId: "drawing-revision-1", version: 1,
      createdAt: now, createdBy: "document-control", updatedAt: now, updatedBy: "document-control" });
    transaction.insertRevision({ id: "drawing-revision-1", documentId: "drawing-1", revision: "0", state: "released",
      purpose: "Issued for fabrication", source: "controlled fixture", fileId: "fabrication-evidence-1",
      fileValidationState: "released", approvalCount: 1, requiredApprovalCount: 1, supersedesRevisionId: null, version: 2,
      createdAt: now, createdBy: "document-control", updatedAt: now, updatedBy: "document-control" });
    transaction.insertMaterial({ id: "material-1", projectId, identifier: "PIPE-HEAT-001", receiptNumber: "REC-001",
      purchaseReference: "PO-001", vendorOrganizationId: "org-vendor", specification: "A106", grade: "B", form: "pipe",
      dimensions: "NPS 4 SCH 40", quantity: "20", unitCode: "FT", heatLot: "HEAT-001", mtrDocumentRevisionId: "drawing-revision-1",
      receiptEvidenceFileIds: ["fabrication-evidence-1"], storageLocation: "FAB-BAY-1", parentItemId: null, state: "released",
      requirements: { projectConfigurationRevisionId: "material-config-1", mtrRequired: true, mtrAccepted: true,
        mtrReviewId: "mtr-review-1", receivingInspectionRequired: true, receivingInspectionAccepted: true,
        pmiRequired: false, pmiAccepted: true, governingPmiRule: null, pmiOverrideId: null, openDispositionCount: 0 },
      version: 3, createdAt: now, createdBy: "receiver", updatedAt: now, updatedBy: "quality-authority" });
    transaction.insertWeld({ id: "weld-1", businessScopeOrganizationId: organizationId, projectId, number: "W-100",
      systemCode: "SYS-01", areaCode: "AREA-01", workPackageCode: "WP-FAB", componentReferences: ["SP-100"],
      materialItemIds: ["material-1"], drawingRevisionId: "drawing-revision-1", weldMapLocation: "ISO-100 / JOINT 1",
      wpsRevisionId: "wps-revision-1", processCode: "GTAW", materialGroupCode: "P1", positionCode: "6G",
      thickness: "0.25", diameter: "4", jointDesignCode: "BW-V", requiredExaminationMethods: [], pwhtRequired: false,
      completionBoundaryId: "boundary-1", repairCycle: 0, events: [], state: "planned", releasedAt: null, releasedBy: null,
      version: 1, createdAt: now, createdBy: "weld-coordinator", updatedAt: now, updatedBy: "weld-coordinator" });
  });
  await seedGovernedFile(store, projectId, "fabrication-evidence-1");
  return { store, service };
}

test("FR-FAB-001-006: spool revision, independent release, sequenced traveler, hold point, and quality acceptance are governed", async () => {
  const { store, service } = await configuredFabrication();
  const planner = access("fabrication-planner", ["fabrication.plan", "fabrication.submit"]);
  let assembly = await service.createAssembly(planner.context, planner.assignments, projectId, {
    number: "SP-100", revision: "0", assemblyType: "pipe_spool", parentRevisionId: null,
    revisionReason: "Initial controlled spool definition.", sourceSystem: "manual", sourceVersion: null, sourceSha256: null,
    systemCode: "SYS-01", areaCode: "AREA-01", workPackageCode: "WP-FAB", completionBoundaryId: "boundary-1",
    drawingRevisionIds: ["drawing-revision-1"], materialItemIds: ["material-1"], weldIds: ["weld-1"], requiredInspectionIds: [],
    bomLines: [{ lineKey: "BOM-001", materialItemId: "material-1", description: "NPS 4 pipe",
      quantity: "10", unitCode: "FT", pieceMark: "P-100" }],
    cutLines: [{ lineKey: "CUT-001", bomLineKey: "BOM-001", materialItemId: "material-1", cutLength: "120",
      lengthUnitCode: "IN", cutAngleDegrees: "0", bevelCode: "BW-V", quantity: "1" }],
  });
  assembly = await service.submitAssembly(planner.context, planner.assignments, assembly.id, assembly.version);
  await assert.rejects(service.reviewAssembly(planner.context,
    [assignment("planner-approve", "fabrication-planner", ["fabrication.approve"], scope(projectId))],
    assembly.id, assembly.version, "approve", "Self approval."),
  (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "separation_of_duty");

  const engineering = access("fabrication-engineer", ["fabrication.approve"], ["fabrication_engineering_authority"]);
  assembly = await service.reviewAssembly(engineering.context, engineering.assignments, assembly.id, assembly.version,
    "approve", "Drawing, BOM, cut list, material, and weld lineage independently verified.");
  const traveler = await service.createTraveler(planner.context, planner.assignments, assembly.id, {
    number: "TRV-SP-100", revision: "0", operations: [
      { operationKey: "CUT", sequence: 10, operationType: "cut", workCenterCode: "SAW-01",
        requiredQualificationCodes: ["FABRICATOR"], procedureDocumentRevisionId: "drawing-revision-1", holdPoint: false,
        materialItemIds: ["material-1"], weldIds: [], plannedHours: "1.5", instructions: "Cut and identify heat-traceable pipe piece." },
      { operationKey: "FIT", sequence: 20, operationType: "fit_up", workCenterCode: "FIT-BAY-01",
        requiredQualificationCodes: ["FABRICATOR"], procedureDocumentRevisionId: "drawing-revision-1", holdPoint: true,
        materialItemIds: ["material-1"], weldIds: ["weld-1"], plannedHours: "2", instructions: "Fit spool and present hold point." },
    ],
  });
  const releaseAuthority = access("fabrication-release", ["fabrication.release"], ["fabrication_release_authority"]);
  const released = await service.releaseAssembly(releaseAuthority.context, releaseAuthority.assignments, assembly.id,
    assembly.version, traveler.version, "Exact released drawing, material, weld, and traveler scope verified.");
  assembly = released.assembly;
  let shopTraveler = released.traveler;
  const fabricator = access("fabricator-1", ["fabrication.execute"], ["FABRICATOR"]);
  const event = (operationKey: string, eventType: "start" | "complete" | "hold" | "release_hold") => ({
    expectedTravelerVersion: shopTraveler.version, operationKey, eventType, result: eventType === "complete" ? "pass" as const : "observed" as const,
    quantity: eventType === "start" ? "0" : "1", unitCode: "EA", observations: { STATUS: eventType.toUpperCase() },
    evidenceFileIds: eventType === "start" ? [] : ["fabrication-evidence-1"], performedAt: new Date("2026-07-21T17:00:00.000Z"),
  });
  shopTraveler = (await service.recordEvent(fabricator.context, fabricator.assignments, shopTraveler.id, event("CUT", "start"))).traveler;
  await assert.rejects(service.recordEvent(fabricator.context, fabricator.assignments, shopTraveler.id,
    { ...event("CUT", "complete"), result: "observed" }), (error: unknown) => error instanceof Error
      && "details" in error && Array.isArray(error.details)
      && error.details.includes("fabrication_complete_result_must_be_pass"));
  shopTraveler = (await service.recordEvent(fabricator.context, fabricator.assignments, shopTraveler.id, event("CUT", "complete"))).traveler;
  shopTraveler = (await service.recordEvent(fabricator.context, fabricator.assignments, shopTraveler.id, event("FIT", "start"))).traveler;
  shopTraveler = (await service.recordEvent(fabricator.context, fabricator.assignments, shopTraveler.id, event("FIT", "hold"))).traveler;
  await assert.rejects(service.recordEvent(fabricator.context,
    [assignment("fabricator-release-hold", "fabricator-1", ["fabrication.hold.release"], scope(projectId))],
    shopTraveler.id, event("FIT", "release_hold")),
  (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "separation_of_duty");
  const holdAuthority = access("fabrication-hold-authority", ["fabrication.hold.release"], ["fabrication_hold_authority"]);
  shopTraveler = (await service.recordEvent(holdAuthority.context, holdAuthority.assignments, shopTraveler.id,
    event("FIT", "release_hold"))).traveler;
  const completed = await service.recordEvent(fabricator.context, fabricator.assignments, shopTraveler.id, event("FIT", "complete"));
  shopTraveler = completed.traveler;
  assembly = completed.assembly;
  assert.equal(shopTraveler.state, "complete");
  assert.equal(assembly.state, "fabrication_complete");

  const quality = access("fabrication-quality", ["fabrication.accept"], ["fabrication_quality_authority"]);
  await assert.rejects(service.acceptAssembly(quality.context, quality.assignments, assembly.id, assembly.version,
    "Premature acceptance."), (error: unknown) => error instanceof Error
      && "details" in error && Array.isArray(error.details) && error.details.includes("weld_not_released:weld-1"));
  await store.transaction((transaction) => {
    const weld = transaction.weldById("weld-1")!;
    transaction.updateWeld({ ...weld, state: "released", releasedAt: now, releasedBy: "weld-release-authority",
      version: weld.version + 1, updatedAt: now, updatedBy: "weld-release-authority" }, weld.version);
  });
  const accepted = await service.acceptAssembly(quality.context, quality.assignments, assembly.id, assembly.version,
    "Traveler completion, released weld, and absence of open dispositions independently verified.");
  assert.equal(accepted.state, "accepted");
  const snapshot = await service.snapshot(access("fabrication-reader", ["fabrication.read"]).context,
    access("fabrication-reader", ["fabrication.read"]).assignments, projectId);
  assert.deepEqual(snapshot.events.map((item) => `${item.operationKey}:${item.eventType}`),
    ["CUT:start", "CUT:complete", "FIT:start", "FIT:hold", "FIT:release_hold", "FIT:complete"]);
  assert.deepEqual(snapshot.acceptanceReadiness[0]!.blockers, []);
  const audits = await store.transaction((transaction) => transaction.auditForProject(projectId));
  assert.equal(audits.some((item) => item.action === "fabrication.released_to_shop"), true);
  assert.equal(audits.some((item) => item.action === "fabrication.assembly_accepted"), true);
});
