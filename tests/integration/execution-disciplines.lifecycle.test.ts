import assert from "node:assert/strict";
import test from "node:test";
import { ExecutionDisciplineService, InMemoryFoundationStore } from "@eiep/api";
import { AuthorizationDeniedError } from "@eiep/rules-engine";
import type { WeldJointRecord } from "@eiep/shared-types";
import { assignment, completeReadiness, context, scope, seedGovernedFile, sequentialIds } from "../helpers/foundation-fixture.js";

const now = new Date("2026-07-21T12:00:00.000Z");
const performedAt = new Date("2026-07-21T10:00:00.000Z");
const projectId = "execution-project";
const organizationId = "org-epv";

function access(userId: string, permissions: readonly string[], qualifications: readonly string[] = []) {
  return {
    context: context(userId, "step-up", qualifications, organizationId),
    assignments: [assignment(`${userId}-execution-access`, userId, permissions, scope(projectId), {}, organizationId)],
  };
}

async function configuredExecution() {
  const store = new InMemoryFoundationStore();
  const service = new ExecutionDisciplineService(store, () => now, sequentialIds("execution"));
  await store.transaction((transaction) => {
    transaction.insertProject({
      id: projectId, businessScopeOrganizationId: organizationId, number: "EXE-001", name: "Execution disciplines pilot",
      customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "America/Denver", state: "active",
      readiness: completeReadiness, version: 2, createdAt: now, createdBy: "project-authority", updatedAt: now, updatedBy: "project-authority",
    });
    transaction.insertProjectOrganization({
      id: "project-org-nde", projectId, organizationId: "org-nde", participationRole: "inspector",
      state: "active", version: 1, createdAt: now, createdBy: "project-authority",
    });
    for (const [type, id, parentId, code, name] of [
      ["system", "system-1", null, "SYS-01", "Process system"],
      ["area", "area-1", "system-1", "AREA-01", "Process area"],
      ["wbs", "wbs-1", null, "WBS-PIPING", "Piping WBS"],
      ["work_package", "work-package-1", "wbs-1", "WP-PIPING", "Piping work package"],
    ] as const) transaction.insertProjectStructure({
      id, projectId, type, parentId, code, name, state: "active", version: 1, createdAt: now, createdBy: "project-authority",
    });
    transaction.insertCompletionBoundary({
      id: "boundary-1", projectId, boundaryType: "system", code: "TEST-SYS-01", name: "Test system 01",
      state: "active", version: 1, createdAt: now, createdBy: "completion-authority",
    });
    transaction.insertDocument({
      id: "document-1", projectId, number: "EXEC-SPEC-001", title: "Execution requirements",
      type: "procedure", discipline: "welding", currentRevisionId: "revision-1", version: 1,
      createdAt: now, createdBy: "document-control", updatedAt: now, updatedBy: "document-control",
    });
    transaction.insertRevision({
      id: "revision-1", documentId: "document-1", revision: "0", state: "released", purpose: "Welding and test requirements",
      source: "controlled fixture", fileId: "evidence-1", fileValidationState: "released", approvalCount: 1,
      requiredApprovalCount: 1, supersedesRevisionId: null, version: 2, createdAt: now, createdBy: "document-control",
      updatedAt: now, updatedBy: "document-control",
    });
    transaction.insertMaterial({
      id: "material-1", projectId, identifier: "PIPE-HEAT-001", receiptNumber: "REC-001", purchaseReference: "PO-001",
      vendorOrganizationId: "org-vendor", specification: "A106", grade: "B", form: "pipe", dimensions: "NPS 4 SCH 40",
      quantity: "1", unitCode: "EA", heatLot: "HEAT-001", mtrDocumentRevisionId: "revision-1",
      receiptEvidenceFileIds: ["evidence-1"], storageLocation: "WP-PIPING", parentItemId: null, state: "released",
      requirements: { projectConfigurationRevisionId: "material-config-1", mtrRequired: true, mtrAccepted: true,
        mtrReviewId: "mtr-review-1", receivingInspectionRequired: true, receivingInspectionAccepted: true,
        pmiRequired: false, pmiAccepted: true, governingPmiRule: null, pmiOverrideId: null, openDispositionCount: 0 },
      version: 3, createdAt: now, createdBy: "receiver", updatedAt: now, updatedBy: "quality-authority",
    });
    for (const [id, capabilities] of [
      ["nde-equipment-1", ["RT"]], ["pwht-equipment-1", ["PWHT"]], ["gauge-1", ["PRESSURE"]],
    ] as const) transaction.insertEquipment({
      id, projectId, identifier: id.toUpperCase(), serialNumber: `${id}-SERIAL`, methodCapabilities: capabilities,
      verificationState: "passed", validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validTo: new Date("2027-01-01T00:00:00.000Z"), evidenceFileId: "evidence-1", state: "active", version: 1,
    });
  });
  await seedGovernedFile(store, projectId, "evidence-1");

  const procedureAuthor = access("procedure-author", ["welding.procedure.manage"]);
  const procedureAuthority = access("procedure-authority", ["welding.procedure.approve", "welding.qualification.approve"], ["welding_authority"]);
  const commonProcedure = {
    governingDocumentRevisionId: "revision-1", processCodes: ["GTAW"], materialGroupCodes: ["P1"],
    positionCodes: ["6G"], thicknessMinimum: "0.1", thicknessMaximum: "1.0", diameterMinimum: "2",
    diameterMaximum: "24", jointDesignCodes: ["BW-V"], consumableClassifications: ["ER70S-2"],
    preheatMinimum: "100", interpassMaximum: "350", effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    effectiveTo: null, supersedesRevisionId: null,
  } as const;
  const pqrSubmitted = await service.submitProcedure(procedureAuthor.context, procedureAuthor.assignments, projectId, {
    ...commonProcedure, procedureType: "pqr", number: "PQR-001", revision: "0", supportingPqrIds: [],
  });
  const pqr = await service.reviewProcedure(procedureAuthority.context, procedureAuthority.assignments,
    pqrSubmitted.id, pqrSubmitted.version, "approve", "PQR evidence independently accepted.");
  await assert.rejects(service.submitProcedure(procedureAuthor.context, procedureAuthor.assignments, projectId, {
    ...commonProcedure, procedureType: "wps", number: "WPS-UNSUPPORTED", revision: "0", supportingPqrIds: [pqr.id],
    thicknessMaximum: "2.0",
  }), /supports its full applicability range/u);
  const specification = {
    codeProfileId: "ASME_BPVC_IX_2025", governingCode: "ASME BPVC Section IX", codeEdition: "2025",
    constructionCode: "ASME B31.3", controlledCatalogVersion: "WELD-CAT-001-REV-0", qualificationRoute: "procedure_qualification",
    procedureTitle: "Controlled GTAW procedure", serviceDescription: "Qualified carbon-steel pressure-piping butt weld.", units: "us_customary",
    joint: { jointType: "Single-V groove", designReference: "DETAIL-BW-V", grooveAngle: "60 DEG +/- 5", rootOpening: "0.125 IN +/- 0.031",
      rootFace: "0.062 IN +/- 0.031", backingType: "Gas backing", backingMaterial: "Argon", weldProgression: "Vertical up", misalignmentTolerance: "0.062 IN MAX" },
    baseMetals: { materialSpecifications: ["SA-106"], materialGrades: ["GRADE B"], groupSystem: "ASME P-Number / Group Number",
      groupCodes: ["P1"], productForms: ["Pipe"], thicknessRange: "0.1 – 1.0 IN", diameterRange: "2 – 24 IN",
      qualificationRangeBasis: "Supporting approved PQR qualified range", dissimilarMetalBasis: "Not applicable" },
    processSteps: [{ sequence: 1, processCode: "GTAW", operationMode: "manual", passScope: "Root through cap", transferMode: "Not applicable",
      currentType: "DC", polarity: "DCEN", amperageRange: "70-120", voltageRange: "9-14", travelSpeedRange: "2-6 IN/MIN", heatInputRange: "Owner-controlled",
      fillerSpecification: "ASME SFA-5.18", fillerClassification: "ER70S-2", fillerGroup: "F-NO 6 / A-NO 1", fillerDiameterRange: "0.062-0.094 IN",
      electrodeConfiguration: "Single tungsten", shieldingGasComposition: "100% ARGON", shieldingGasFlowRange: "15-25 CFH", backingGasComposition: "100% ARGON",
      backingGasFlowRange: "10-20 CFH", fluxOrBackingMaterial: "Not applicable" }],
    thermalControl: { preheatMethod: "Resistance heating", preheatMaintenance: "Continuous through welding", temperatureMeasurementMethod: "Calibrated contact pyrometer",
      temperatureControlBasis: "Supporting PQR and governing construction specification", pwhtDetermination: "not_required",
      pwhtRuleCitation: "Controlled ASME B31.3 rule record PWHT-001", pwhtRequired: false, pwhtTemperatureRange: "Not applicable",
      pwhtHoldingTime: "Not applicable", heatingRateLimit: "Not applicable", coolingRateLimit: "Not applicable" },
    technique: { beadTechnique: "Stringer", cleaningMethod: "Power wire brush", backGougingMethod: "Not applicable", oscillation: "Not applicable", peening: "Not permitted",
      contactTubeDistance: "Not applicable", interpassCleaning: "Brush and grind as required", singleOrMultiplePass: "Multiple pass", singleOrMultipleElectrode: "Single electrode" },
    examinationAndTests: { visualAcceptanceReference: "Controlled construction-code profile", ndeMethods: ["VT", "RT"], mechanicalTests: ["Tension", "Guided bend"],
      impactTestTemperature: "Not applicable", hardnessLimit: "Not applicable", macroOrFractureTests: ["Not required"], specimenReferences: ["PQR-LAB-001"],
      essentialVariableNotes: "Exact essential and supplementary-essential variables resolve through the licensed controlled code profile." },
    revisionReason: "Initial issue",
  } as const;
  await assert.rejects(service.submitProcedure(procedureAuthor.context, procedureAuthor.assignments, projectId, {
    ...commonProcedure, procedureType: "pqr", number: "PQR-DUPLICATE-STEP", revision: "0", supportingPqrIds: [],
    specification: { ...specification, processSteps: [specification.processSteps[0], specification.processSteps[0]] },
  }), /sequences must be unique/u);
  await assert.rejects(service.submitProcedure(procedureAuthor.context, procedureAuthor.assignments, projectId, {
    ...commonProcedure, procedureType: "pqr", number: "PQR-PWHT-CONFLICT", revision: "0", supportingPqrIds: [],
    specification: { ...specification, thermalControl: { ...specification.thermalControl, pwhtDetermination: "required", pwhtRequired: false } },
  }), /PWHT requirement conflicts/u);
  const wpsSubmitted = await service.submitProcedure(procedureAuthor.context, procedureAuthor.assignments, projectId, {
    ...commonProcedure, procedureType: "wps", number: "WPS-001", revision: "0", supportingPqrIds: [pqr.id], specification,
  });
  assert.equal(wpsSubmitted.specification?.processSteps[0]?.fillerClassification, "ER70S-2");
  const wps = await service.reviewProcedure(procedureAuthority.context, procedureAuthority.assignments,
    wpsSubmitted.id, wpsSubmitted.version, "approve", "WPS ranges verified against exact PQR revision.");

  const qualificationAuthor = access("qualification-author", ["welding.qualification.manage"]);
  const submittedQualification = await service.submitWelderQualification(
    qualificationAuthor.context, qualificationAuthor.assignments, projectId, {
      welderUserId: "welder-1", employerOrganizationId: organizationId, qualificationNumber: "WPQ-001",
      governingDocumentRevisionId: "revision-1", processCodes: ["GTAW"], materialGroupCodes: ["P1"], positionCodes: ["6G"],
      thicknessMinimum: "0.1", thicknessMaximum: "1.0", diameterMinimum: "2", diameterMaximum: "24",
      qualifiedAt: new Date("2026-01-01T00:00:00.000Z"), validTo: new Date("2027-01-01T00:00:00.000Z"),
      continuityIntervalDays: 180, lastContinuityAt: new Date("2026-07-01T00:00:00.000Z"), evidenceFileIds: ["evidence-1"],
    },
  );
  const qualification = await service.reviewWelderQualification(
    procedureAuthority.context, procedureAuthority.assignments, submittedQualification.id, submittedQualification.version,
    "approve", "Qualification scope and continuity independently verified.",
  );
  return { store, service, wps, qualification };
}

async function weldThroughVisual(
  service: ExecutionDisciplineService,
  wpsId: string,
  qualificationId: string,
  options: { readonly pwhtRequired: boolean; readonly requiredExaminationMethods: readonly string[] },
): Promise<WeldJointRecord> {
  const coordinator = access("weld-coordinator", ["welding.manage"]);
  const welder = access("welder-1", ["welding.execute"]);
  const inspector = access("weld-inspector", ["welding.inspect"], ["welding_inspector"]);
  let weld = await service.createWeld(coordinator.context, coordinator.assignments, projectId, {
    number: options.pwhtRequired ? "W-100" : "W-200", systemCode: "SYS-01", areaCode: "AREA-01",
    workPackageCode: "WP-PIPING", componentReferences: ["ISO-100-SPOOL-1"], materialItemIds: ["material-1"],
    drawingRevisionId: "revision-1", weldMapLocation: "ISO-100 / JOINT 1", wpsRevisionId: wpsId,
    processCode: "GTAW", materialGroupCode: "P1", positionCode: "6G", thickness: "0.25", diameter: "4",
    jointDesignCode: "BW-V", requiredExaminationMethods: options.requiredExaminationMethods,
    pwhtRequired: options.pwhtRequired, completionBoundaryId: "boundary-1",
  });
  weld = await service.recordWeldEvent(welder.context, welder.assignments, weld.id, {
    expectedVersion: weld.version, eventType: "fit_up", performedAt, welderQualificationIds: [],
    consumableClassification: null, observations: { ROOT_GAP: "0.125 IN" }, evidenceFileIds: ["evidence-1"], result: "pass",
  });
  await assert.rejects(service.recordWeldEvent(welder.context, welder.assignments, weld.id, {
    expectedVersion: weld.version, eventType: "weld_pass", performedAt, welderQualificationIds: [qualificationId],
    consumableClassification: "ER70S-2", observations: { INTERPASS_TEMPERATURE: "300" }, evidenceFileIds: ["evidence-1"], result: "pass",
  }), /preheat observation is required/u);
  weld = await service.recordWeldEvent(welder.context, welder.assignments, weld.id, {
    expectedVersion: weld.version, eventType: "preheat_observation", performedAt, welderQualificationIds: [],
    consumableClassification: null, observations: { TEMPERATURE: "150" }, evidenceFileIds: ["evidence-1"], result: "observed",
  });
  weld = await service.recordWeldEvent(welder.context, welder.assignments, weld.id, {
    expectedVersion: weld.version, eventType: "weld_pass", performedAt, welderQualificationIds: [qualificationId],
    consumableClassification: "ER70S-2", observations: { INTERPASS_TEMPERATURE: "300" }, evidenceFileIds: ["evidence-1"], result: "pass",
  });
  weld = await service.recordWeldEvent(inspector.context, inspector.assignments, weld.id, {
    expectedVersion: weld.version, eventType: "visual_examination", performedAt, welderQualificationIds: [],
    consumableClassification: null, observations: { ACCEPTANCE: "VISUAL ACCEPT" }, evidenceFileIds: ["evidence-1"], result: "pass",
  });
  return weld;
}

test("FR-WLD-001-003 / EX-AC-06: exact WPS, current welder qualification, append-only events, and independent release are enforced", async () => {
  const { service, wps, qualification } = await configuredExecution();
  const weld = await weldThroughVisual(service, wps.id, qualification.id, { pwhtRequired: false, requiredExaminationMethods: [] });
  assert.equal(weld.state, "ready_for_release");
  assert.deepEqual(weld.events.map((event) => event.eventType), ["fit_up", "preheat_observation", "weld_pass", "visual_examination"]);

  const performerRelease = access("welder-1", ["welding.release"], ["welding_release_authority"]);
  await assert.rejects(
    service.releaseWeld(performerRelease.context, performerRelease.assignments, weld.id, weld.version, "Self-release attempt."),
    (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "separation_of_duty",
  );
  const releaseAuthority = access("weld-release-authority", ["welding.release"], ["welding_release_authority"]);
  const released = await service.releaseWeld(releaseAuthority.context, releaseAuthority.assignments, weld.id, weld.version,
    "All exact-source and inspection prerequisites verified.");
  assert.equal(released.state, "released");
  await assert.rejects(service.recordWeldEvent(access("welder-1", ["welding.execute"]).context,
    access("welder-1", ["welding.execute"]).assignments, weld.id, {
      expectedVersion: released.version, eventType: "consumable_issue", performedAt, welderQualificationIds: [],
      consumableClassification: "ER70S-2", observations: { LOT: "LOT-001" }, evidenceFileIds: ["evidence-1"], result: "observed",
    }), /released weld is immutable/u);
});

test("FR-NDE-001-002, FR-PWH-001 / EX-AC-07: rejected NDE drives a new repair cycle before accepted NDE and PWHT permit release", async () => {
  const { service, wps, qualification } = await configuredExecution();
  let weld = await weldThroughVisual(service, wps.id, qualification.id, { pwhtRequired: true, requiredExaminationMethods: ["RT"] });
  const requestAuthor = access("nde-coordinator", ["nde.request.manage"]);
  const examiner = access("nde-examiner", ["nde.perform"], ["NDE_RT_LEVEL_II"]);
  const ndeAuthority = access("nde-authority", ["nde.approve"], ["nde_acceptance_authority"]);
  const requestFor = (number: string, weldId: string) => service.createNdeRequest(requestAuthor.context, requestAuthor.assignments, projectId, {
    number, weldId, methodCode: "RT", extent: "100%", techniqueDocumentRevisionId: "revision-1",
    acceptanceReference: "EXEC-SPEC-001 REV 0", examinationStage: "FINAL", requiredPersonnelQualification: "NDE_RT_LEVEL_II",
    dueAt: new Date("2026-07-22T00:00:00.000Z"), holdWitnessContext: "OWNER HOLD / QUALITY WITNESS",
  });
  const reportFor = (requestId: string, revision: string, result: "accept" | "reject") => service.submitNdeReport(
    examiner.context, examiner.assignments, requestId, { revision, examinerOrganizationId: "org-nde",
      personnelQualificationReference: "SNT-TC-1A RT LEVEL II", equipmentIds: ["nde-equipment-1"], mediaFileIds: ["evidence-1"],
      performedAt, conditions: { SOURCE_DISTANCE: "24 IN" }, indications: result === "reject" ? ["LINEAR INDICATION"] : [],
      result, evidenceFileIds: ["evidence-1"] },
  );

  const request0 = await requestFor("NDE-RT-100-0", weld.id);
  const submitted0 = await reportFor(request0.id, "0", "reject");
  const rejected0 = await service.reviewNdeReport(ndeAuthority.context, ndeAuthority.assignments,
    submitted0.report.id, submitted0.report.version, "accept", "Report valid; reject disposition confirmed.");
  assert.equal(rejected0.weld.state, "repair_required");
  const welder = access("welder-1", ["welding.execute"]);
  weld = await service.recordWeldEvent(welder.context, welder.assignments, weld.id, {
    expectedVersion: rejected0.weld.version, eventType: "repair_excavation", performedAt, welderQualificationIds: [],
    consumableClassification: null, observations: { DEFECT_REMOVED: "CONFIRMED" }, evidenceFileIds: ["evidence-1"], result: "observed",
  });
  weld = await service.recordWeldEvent(welder.context, welder.assignments, weld.id, {
    expectedVersion: weld.version, eventType: "preheat_observation", performedAt, welderQualificationIds: [],
    consumableClassification: null, observations: { TEMPERATURE: "145" }, evidenceFileIds: ["evidence-1"], result: "observed",
  });
  weld = await service.recordWeldEvent(welder.context, welder.assignments, weld.id, {
    expectedVersion: weld.version, eventType: "repair_weld", performedAt, welderQualificationIds: [qualification.id],
    consumableClassification: "ER70S-2", observations: { INTERPASS_TEMPERATURE: "290" }, evidenceFileIds: ["evidence-1"], result: "pass",
  });
  const inspector = access("weld-inspector", ["welding.inspect"], ["welding_inspector"]);
  weld = await service.recordWeldEvent(inspector.context, inspector.assignments, weld.id, {
    expectedVersion: weld.version, eventType: "visual_examination", performedAt, welderQualificationIds: [],
    consumableClassification: null, observations: { ACCEPTANCE: "REPAIR VISUAL ACCEPT" }, evidenceFileIds: ["evidence-1"], result: "pass",
  });
  assert.equal(weld.repairCycle, 1);
  const request1 = await requestFor("NDE-RT-100-1", weld.id);
  const submitted1 = await reportFor(request1.id, "1", "accept");
  const accepted1 = await service.reviewNdeReport(ndeAuthority.context, ndeAuthority.assignments,
    submitted1.report.id, submitted1.report.version, "accept", "Repair-cycle-one RT accepted.");
  assert.equal(accepted1.request.repairCycle, 1);

  const pwhtOperator = access("pwht-operator", ["pwht.perform"], ["pwht_operator"]);
  const cycle = await service.submitPwhtCycle(pwhtOperator.context, pwhtOperator.assignments, projectId, {
    number: "PWHT-100", procedureDocumentRevisionId: "revision-1", weldIds: [weld.id], heatingRate: "300",
    coolingRate: "300", soakTemperatureMinimum: "1100", soakTemperatureMaximum: "1150", soakDurationMinutes: "60",
    thermocouples: [{ thermocoupleId: "TC-1", location: "WELD CENTERLINE", minimumTemperature: "1110",
      maximumTemperature: "1140", withinTolerance: true }], equipmentIds: ["pwht-equipment-1"], chartFileId: "evidence-1",
    evidenceFileIds: ["evidence-1"], interruptions: [], result: "pass", performedAt,
  });
  const pwhtAuthority = access("pwht-authority", ["pwht.approve"], ["pwht_acceptance_authority"]);
  await service.reviewPwhtCycle(pwhtAuthority.context, pwhtAuthority.assignments, cycle.id, cycle.version,
    "accept", "Chart and thermocouple coverage accepted.");
  assert.deepEqual(await service.weldReleaseReadiness(access("execution-reader", ["execution.read"]).context,
    access("execution-reader", ["execution.read"]).assignments, weld.id), []);
});

test("FR-TST-001-002 / EX-AC-07: a boundary test remains blocked until weld release and requires independent accepted evidence", async () => {
  const { service, wps, qualification } = await configuredExecution();
  const weld = await weldThroughVisual(service, wps.id, qualification.id, { pwhtRequired: false, requiredExaminationMethods: [] });
  const manager = access("test-manager", ["testing.manage"]);
  let testPackage = await service.createTestPackage(manager.context, manager.assignments, projectId, {
    number: "TP-001", testType: "pressure", completionBoundaryId: "boundary-1", governingDocumentRevisionIds: ["revision-1"],
    drawingRevisionIds: ["revision-1"], testMedium: "HYDROSTATIC WATER", targetPressure: "225",
    holdDurationMinutes: "30", hazardPermitReferences: ["JHA-001"], prerequisiteReferences: ["LINE-WALK-001"],
    blindValveInstrumentReferences: ["BLIND-LIST-001"], gaugeEquipmentIds: ["gauge-1"], participantUserIds: ["test-director"],
    witnessUserIds: ["owner-witness"],
  });
  const blocked = await service.refreshTestReadiness(manager.context, manager.assignments, testPackage.id, testPackage.version);
  assert.deepEqual(blocked.blockers, ["weld_not_released:W-200"]);
  const releaseAuthority = access("weld-release-authority", ["welding.release"], ["welding_release_authority"]);
  await service.releaseWeld(releaseAuthority.context, releaseAuthority.assignments, weld.id, weld.version, "Boundary weld released.");
  const ready = await service.refreshTestReadiness(manager.context, manager.assignments, testPackage.id, testPackage.version);
  assert.equal(ready.testPackage.state, "ready");
  const director = access("test-director", ["testing.execute"], ["test_director"]);
  testPackage = await service.submitTestResult(director.context, director.assignments, testPackage.id, {
    expectedVersion: ready.testPackage.version, performedAt, result: "pass", evidenceFileIds: ["evidence-1"],
    deficiencyNcrIds: [], restorationConfirmation: "Temporary blinds removed and normal valve lineup independently checked.",
  });
  const selfReviewer = access("test-director", ["testing.approve"], ["testing_acceptance_authority"]);
  await assert.rejects(service.reviewTestResult(selfReviewer.context, selfReviewer.assignments, testPackage.id,
    testPackage.version, "accept", "Self-accept attempt."),
  (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "separation_of_duty");
  const authority = access("test-authority", ["testing.approve"], ["testing_acceptance_authority"]);
  const accepted = await service.reviewTestResult(authority.context, authority.assignments, testPackage.id,
    testPackage.version, "accept", "Pressure, hold, evidence, and restoration accepted.");
  assert.equal(accepted.state, "accepted");
  const snapshot = await service.snapshot(access("execution-reader", ["execution.read"]).context,
    access("execution-reader", ["execution.read"]).assignments, projectId);
  assert.equal(snapshot.testPackages[0]?.state, "accepted");
});
