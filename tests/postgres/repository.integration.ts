import assert from "node:assert/strict";
import {
  bootstrapInitialApplicationAdministrators,
  ConflictError,
  EstimatingService,
  FoundationService,
  PlatformService,
  PostgresFoundationStore,
  ReportingService,
} from "@eiep/api";
import { assignment, completeReadiness, context, scope, sequentialIds } from "../helpers/foundation-fixture.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for the PostgreSQL repository integration test.");
const now = new Date("2026-07-21T12:00:00.000Z");
const ids = sequentialIds("postgres-repository");

let store = await PostgresFoundationStore.connect(connectionString);
try {
  const initialHealth = await store.health();
  assert.equal(initialHealth.schemaMigration, "0014_pmi_ncr_execution_detail.up.sql");
  assert.equal(initialHealth.repositoryRevision, 1);
  assert.equal(initialHealth.repositoryEntityCount, 0);
  const bootstrapInput = {
    authorizationReference: "CAB-2026-0042 / PostgreSQL bootstrap verification",
    requesterAuthorityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    approverAuthorityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    businessScopeOrganizationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    issuer: "https://identity.example.test/tenant/v2.0",
    authorizedAt: new Date("2026-07-21T11:00:00.000Z"),
    effectiveFrom: new Date("2026-07-21T11:30:00.000Z"),
    effectiveTo: new Date("2026-10-19T12:00:00.000Z"),
    administrators: [
      {
        userAccountId: "11111111-1111-4111-8111-111111111111",
        personId: "22222222-2222-4222-8222-222222222222",
        displayName: "PostgreSQL bootstrap administrator one",
        externalIdentityId: "33333333-3333-4333-8333-333333333333",
        subject: "postgres-entra-object-id-one",
        accessAssignmentId: "44444444-4444-4444-8444-444444444444",
      },
      {
        userAccountId: "55555555-5555-4555-8555-555555555555",
        personId: "66666666-6666-4666-8666-666666666666",
        displayName: "PostgreSQL bootstrap administrator two",
        externalIdentityId: "77777777-7777-4777-8777-777777777777",
        subject: "postgres-entra-object-id-two",
        accessAssignmentId: "88888888-8888-4888-8888-888888888888",
      },
    ],
  } as const;
  assert.equal((await bootstrapInitialApplicationAdministrators(store, bootstrapInput, () => now)).status, "created");
  assert.equal((await bootstrapInitialApplicationAdministrators(store, bootstrapInput, () => now)).status, "verified");
  const foundation = new FoundationService(store, () => now, ids);
  const project = await foundation.createProject(
    context("postgres-project-creator"),
    [assignment("create-project", "postgres-project-creator", ["project.create"], scope())],
    {
      businessScopeOrganizationId: "org-epv", number: "PG-001", name: "Persistent project",
      customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "UTC", readiness: completeReadiness,
    },
  );
  await store.transaction((transaction) => {
    transaction.insertImportedRecord({
      id: "postgres-imported-record", projectId: project.id, recordType: "material_receipt",
      payload: { projectId: project.id, description: "Persistent source" }, importJobId: "postgres-seed-import",
      externalId: "PG-EXT-001", createdAt: now, createdBy: "fixture",
    });
    transaction.insertMaterial({
      id: "postgres-material", projectId: project.id, identifier: "PG-MAT-001", receiptNumber: "PG-RCV-001",
      purchaseReference: "PG-PO-001", vendorOrganizationId: "org-vendor", specification: "PG-SPEC",
      grade: "PG-GRADE", form: "pipe", dimensions: "NPS 2", quantity: "1", unitCode: "EA", heatLot: "PG-HEAT",
      mtrDocumentRevisionId: "postgres-mtr-revision", receiptEvidenceFileIds: ["postgres-receipt-evidence"],
      storageLocation: "PG-RACK", parentItemId: null, state: "received_pending",
      requirements: {
        projectConfigurationRevisionId: "postgres-material-config", mtrRequired: true, mtrAccepted: true,
        mtrReviewId: "postgres-mtr-review", receivingInspectionRequired: false, receivingInspectionAccepted: true,
        pmiRequired: false, pmiAccepted: true, governingPmiRule: null, pmiOverrideId: null, openDispositionCount: 0,
      },
      version: 1, createdAt: now, createdBy: "postgres-receiver", updatedAt: now, updatedBy: "postgres-mtr-reviewer",
    });
    transaction.insertMtrReview({
      id: "postgres-mtr-review", projectId: project.id, materialItemId: "postgres-material",
      documentRevisionId: "postgres-mtr-revision", decision: "accepted", heatLotVerified: true,
      gradeVerified: true, specificationVerified: true, reviewNotes: "Persistent controlled MTR review.",
      evidenceFileIds: ["postgres-mtr-evidence"], reviewedAt: now, reviewedBy: "postgres-mtr-reviewer", version: 1,
    });
    transaction.insertMaterialMovement({
      id: "postgres-material-movement", projectId: project.id, materialItemId: "postgres-material",
      movementType: "received", fromState: null, toState: "received_pending", fromLocation: null,
      toLocation: "PG-RACK", quantity: "1", unitCode: "EA", workPackageId: null,
      reason: "receipt:PG-RCV-001", occurredAt: now, actorUserId: "postgres-receiver",
    });
  });
  const platform = new PlatformService(store, () => now, ids);
  const exporter = context("postgres-exporter", "mfa");
  const queuedExport = await platform.requestExport(
    exporter,
    [assignment("export", exporter.userId, ["export.create", "export.download", "project.read"], scope(project.id))],
    project.id,
    {
      recordClass: "imported", recordIds: ["postgres-imported-record"], format: "jsonl",
      recipientOrganizationId: "org-epv",
    },
  );
  const reporting = new ReportingService(store, false, () => now, ids);
  const persistentReport = await reporting.generate(
    context("postgres-reporter", "mfa"),
    [assignment("generate-report", "postgres-reporter", ["report.generate"], scope(project.id))],
    project.id,
    { formCode: "FORM-PRJ-001", targetId: project.id },
  );
  const estimating = new EstimatingService(store, () => now, ids);
  const estimator = context("postgres-estimator", "mfa");
  const estimatingAssignments = [assignment(
    "postgres-estimating", estimator.userId,
    ["estimate.create", "estimate.read", "estimate.edit", "estimate.submit"], scope(),
  )];
  const persistentEstimate = await estimating.createEstimate(estimator, estimatingAssignments, {
    businessScopeOrganizationId: "org-epv", number: "PG-EST-001", name: "Persistent estimate",
    customerOrganizationId: "org-customer", facilityId: "facility-1", opportunityReference: "PG-RFQ-001",
    scopeStatement: "Persistent PostgreSQL estimating verification.", dueAt: new Date("2026-08-31T17:00:00.000Z"),
    originatingTimeZone: "America/Denver", currency: "USD", basisReferences: ["PG-RFQ-001-REV-0"],
    initialRevision: "A", assumptions: ["Single shift"], exclusions: ["Owner testing"], alternates: [],
    contingencyPercent: "5", escalationPercent: "2", markupPercent: "10", taxPercent: "8",
  });
  const persistentEstimateLine = await estimating.upsertLine(
    estimator, estimatingAssignments, persistentEstimate.revisions[0]!.id, null, null,
    {
      lineKey: "PG-LINE-001", parentLineKey: null, sortOrder: 10, costCode: "PIPING",
      bidItemCode: "BASE", alternateCode: null, wbsCode: "WBS-PIPING", workPackageCode: "WP-PIPING",
      assemblyRevisionId: null, description: "PostgreSQL direct-cost line", quantity: "2", unitCode: "EA",
      baseLaborHoursPerUnit: "4", laborRatePerHour: "50", materialUnitCost: "100",
      equipmentUnitCost: "25", subcontractUnitCost: "0", allowanceCost: "10", otherCost: "5",
      productivityFactorRevisionIds: [],
    },
  );
  const persistentEstimateRevision = await estimating.submitRevision(
    estimator, estimatingAssignments, persistentEstimate.revisions[0]!.id, persistentEstimate.revisions[0]!.version,
  );
  await store.transaction((transaction) => {
    transaction.insertProjectControlsAuthorityPolicy({
      id: "postgres-controls-policy", businessScopeOrganizationId: "org-epv", currency: "USD", revision: "1",
      standardChangeApprovalLimit: "1000.00", standardProcurementAwardLimit: "5000.00",
      changeAboveThresholdQualification: "EXECUTIVE_CHANGE_AUTHORITY",
      procurementAboveThresholdQualification: "EXECUTIVE_PROCUREMENT_AUTHORITY", state: "active",
      supersedesRevisionId: null, proposedAt: now, proposedBy: "postgres-controls-editor",
      reviewedAt: now, reviewedBy: "postgres-controls-reviewer", reviewReason: "Persistent controls policy.", version: 2,
    });
    transaction.insertProjectControlBaseline({
      id: "postgres-control-baseline", businessScopeOrganizationId: "org-epv", projectId: project.id,
      sourceHandoffId: "postgres-handoff", sourceHandoffSha256: "b".repeat(64), number: "PG-CB-001", revision: "0",
      parentBaselineId: null, revisionReason: "Persistent award baseline", currency: "USD",
      periodStart: new Date("2026-07-01T00:00:00.000Z"), periodFinish: new Date("2027-06-30T00:00:00.000Z"),
      lines: [{ lineKey: "PG-LINE-001", sourceEstimateLineKey: "PG-LINE-001", sourceCategory: "direct_cost",
        costCode: "PIPING", wbsCode: "WBS-PIPING", workPackageCode: "WP-PIPING",
        controlAccountCode: "CA-PIPING", responsibleOrganizationId: "org-epv",
        budgetQuantity: "2", unitCode: "EA", budgetAmount: "665.00" }],
      sourceAwardAmount: "665.00", approvedChangeAmount: "0.00", managementReserveAmount: "35.00",
      currentBudgetAmount: "700.00", state: "approved", submittedAt: now, submittedBy: "postgres-controls-author",
      reviewedAt: now, reviewedBy: "postgres-controls-reviewer", reviewReason: "Persistent control baseline.",
      version: 3, createdAt: now, createdBy: "postgres-controls-author", updatedAt: now, updatedBy: "postgres-controls-reviewer",
    });
    transaction.insertScheduleProgram({
      id: "postgres-schedule", businessScopeOrganizationId: "org-epv", projectId: project.id,
      number: "PG-SCH-001", name: "Persistent schedule", timeZone: "UTC",
      currentRevisionId: "postgres-schedule-revision", version: 2, createdAt: now,
      createdBy: "postgres-scheduler", updatedAt: now, updatedBy: "postgres-schedule-reviewer",
    });
    transaction.insertScheduleRevision({
      id: "postgres-schedule-revision", scheduleId: "postgres-schedule", revision: "B0",
      revisionType: "baseline", parentRevisionId: null, sourceBaselineId: "postgres-control-baseline",
      dataDate: now, reason: "Persistent schedule baseline", sourceSystem: "manual", sourceVersion: null,
      sourceSha256: null, activities: [], dependencies: [], baselineVarianceDays: "0", state: "approved",
      submittedAt: now, submittedBy: "postgres-scheduler", reviewedAt: now,
      reviewedBy: "postgres-schedule-reviewer", reviewReason: "Persistent schedule verified.",
      version: 3, createdAt: now, createdBy: "postgres-scheduler",
    });
    transaction.insertWeldingProcedure({
      id: "postgres-wps", businessScopeOrganizationId: "org-epv", projectId: project.id, procedureType: "wps",
      number: "PG-WPS-001", revision: "0", governingDocumentRevisionId: "postgres-wps-document-revision",
      supportingPqrIds: ["postgres-pqr"], processCodes: ["GTAW"], materialGroupCodes: ["P1"], positionCodes: ["6G"],
      thicknessMinimum: "0.1", thicknessMaximum: "1", diameterMinimum: "2", diameterMaximum: "24",
      jointDesignCodes: ["BW-V"], consumableClassifications: ["ER70S-2"], preheatMinimum: "100",
      interpassMaximum: "350", effectiveFrom: new Date("2026-01-01T00:00:00.000Z"), effectiveTo: null,
      state: "approved", supersedesRevisionId: null, submittedAt: now, submittedBy: "postgres-wps-author",
      reviewedAt: now, reviewedBy: "postgres-wps-reviewer", reviewReason: "Persistent WPS.", version: 2,
    });
    transaction.insertWelderQualification({
      id: "postgres-wpq", businessScopeOrganizationId: "org-epv", projectId: project.id,
      welderUserId: "postgres-welder", employerOrganizationId: "org-epv", qualificationNumber: "PG-WPQ-001",
      governingDocumentRevisionId: "postgres-wpq-document-revision", processCodes: ["GTAW"], materialGroupCodes: ["P1"],
      positionCodes: ["6G"], thicknessMinimum: "0.1", thicknessMaximum: "1", diameterMinimum: "2", diameterMaximum: "24",
      qualifiedAt: new Date("2026-01-01T00:00:00.000Z"), validTo: new Date("2027-01-01T00:00:00.000Z"),
      continuityIntervalDays: 180, lastContinuityAt: new Date("2026-07-01T00:00:00.000Z"), evidenceFileIds: ["postgres-wpq-file"],
      state: "active", submittedAt: now, submittedBy: "postgres-wpq-author", reviewedAt: now,
      reviewedBy: "postgres-wpq-reviewer", reviewReason: "Persistent qualification.", version: 2,
    });
    transaction.insertWeld({
      id: "postgres-weld", businessScopeOrganizationId: "org-epv", projectId: project.id, number: "PG-W-001",
      systemCode: "SYS-01", areaCode: "AREA-01", workPackageCode: "WP-PIPING", componentReferences: ["ISO-001"],
      materialItemIds: ["postgres-material"], drawingRevisionId: "postgres-drawing-revision", weldMapLocation: "ISO-001 / J1",
      wpsRevisionId: "postgres-wps", processCode: "GTAW", materialGroupCode: "P1", positionCode: "6G",
      thickness: "0.25", diameter: "4", jointDesignCode: "BW-V", requiredExaminationMethods: ["RT"], pwhtRequired: true,
      completionBoundaryId: "postgres-boundary", repairCycle: 1, events: [{ id: "postgres-weld-event", eventType: "repair_weld",
        repairCycle: 1, performedAt: now, performedBy: "postgres-welder", welderQualificationIds: ["postgres-wpq"],
        consumableClassification: "ER70S-2", observations: { INTERPASS_TEMPERATURE: "300" },
        evidenceFileIds: ["postgres-weld-file"], result: "pass" }], state: "pending_examination", releasedAt: null,
      releasedBy: null, version: 4, createdAt: now, createdBy: "postgres-weld-coordinator", updatedAt: now, updatedBy: "postgres-welder",
    });
    transaction.insertNdeRequest({
      id: "postgres-nde-request", businessScopeOrganizationId: "org-epv", projectId: project.id, number: "PG-NDE-001",
      weldId: "postgres-weld", repairCycle: 1, methodCode: "RT", extent: "100%",
      techniqueDocumentRevisionId: "postgres-nde-technique", acceptanceReference: "PG-SPEC", examinationStage: "FINAL",
      requiredPersonnelQualification: "NDE_RT_LEVEL_II", dueAt: new Date("2026-07-22T00:00:00.000Z"),
      holdWitnessContext: "OWNER HOLD", reportRevisionIds: ["postgres-nde-report"], state: "accepted", version: 3,
      createdAt: now, createdBy: "postgres-nde-coordinator", updatedAt: now, updatedBy: "postgres-nde-reviewer",
    });
    transaction.insertNdeReport({
      id: "postgres-nde-report", requestId: "postgres-nde-request", revision: "1", examinerUserId: "postgres-nde-examiner",
      examinerOrganizationId: "org-nde", personnelQualificationReference: "RT LEVEL II", equipmentIds: ["postgres-rt-equipment"],
      mediaFileIds: ["postgres-nde-media"], performedAt: now, conditions: { SOURCE_DISTANCE: "24 IN" }, indications: [], result: "accept",
      evidenceFileIds: ["postgres-nde-file"], repairCycle: 1, state: "accepted", submittedAt: now,
      submittedBy: "postgres-nde-examiner", reviewedAt: now, reviewedBy: "postgres-nde-reviewer",
      reviewReason: "Persistent accepted NDE report.", version: 2,
    });
    transaction.insertPwhtCycle({
      id: "postgres-pwht", businessScopeOrganizationId: "org-epv", projectId: project.id, number: "PG-PWHT-001",
      procedureDocumentRevisionId: "postgres-pwht-procedure", weldIds: ["postgres-weld"], heatingRate: "300", coolingRate: "300",
      soakTemperatureMinimum: "1100", soakTemperatureMaximum: "1150", soakDurationMinutes: "60",
      thermocouples: [{ thermocoupleId: "TC-1", location: "CENTERLINE", minimumTemperature: "1110", maximumTemperature: "1140", withinTolerance: true }],
      equipmentIds: ["postgres-pwht-equipment"], chartFileId: "postgres-pwht-chart", evidenceFileIds: ["postgres-pwht-file"],
      interruptions: [], result: "pass", state: "accepted", performedAt: now, performedBy: "postgres-pwht-operator",
      reviewedAt: now, reviewedBy: "postgres-pwht-reviewer", reviewReason: "Persistent accepted PWHT cycle.", version: 2,
    });
    transaction.insertTestPackage({
      id: "postgres-test-package", businessScopeOrganizationId: "org-epv", projectId: project.id, number: "PG-TP-001",
      testType: "pressure", completionBoundaryId: "postgres-boundary", governingDocumentRevisionIds: ["postgres-test-procedure"],
      drawingRevisionIds: ["postgres-drawing-revision"], testMedium: "WATER", targetPressure: "225", holdDurationMinutes: "30",
      hazardPermitReferences: ["PG-JHA-001"], prerequisiteReferences: ["PG-LINE-WALK"], blindValveInstrumentReferences: ["PG-BLIND-LIST"],
      gaugeEquipmentIds: ["postgres-gauge"], participantUserIds: ["postgres-test-director"], witnessUserIds: ["postgres-owner-witness"],
      evidenceFileIds: ["postgres-test-file"], result: "pass", deficiencyNcrIds: [], restorationConfirmation: "Restored.",
      state: "accepted", performedAt: now, performedBy: "postgres-test-director", reviewedAt: now,
      reviewedBy: "postgres-test-reviewer", reviewReason: "Persistent accepted test.", version: 3,
      createdAt: now, createdBy: "postgres-test-manager", updatedAt: now, updatedBy: "postgres-test-reviewer",
    });
  });
  await store.close();

  store = await PostgresFoundationStore.connect(connectionString);
  const persisted = await store.transaction((transaction) => ({
    applicationIdentityBootstrap: transaction.applicationIdentityBootstrapState(),
    project: transaction.projectById(project.id),
    audits: transaction.auditForProject(project.id),
    exportJob: transaction.exportJobById(queuedExport.id),
    outbox: transaction.integrationMessageByKey("export.worker", queuedExport.id),
    mtrReviews: transaction.mtrReviewsForMaterial("postgres-material"),
    movements: transaction.materialMovementsForItem("postgres-material"),
    controlledReport: transaction.controlledReportById(persistentReport.id),
    estimate: transaction.estimateById(persistentEstimate.estimate.id),
    estimateRevision: transaction.estimateRevisionById(persistentEstimateRevision.id),
    estimateLines: transaction.estimateLines(persistentEstimateRevision.id),
    controlBaseline: transaction.projectControlBaselineById("postgres-control-baseline"),
    controlsPolicy: transaction.projectControlsAuthorityPolicyById("postgres-controls-policy"),
    schedule: transaction.scheduleProgramById("postgres-schedule"),
    scheduleRevision: transaction.scheduleRevisionById("postgres-schedule-revision"),
    weldingProcedure: transaction.weldingProcedureById("postgres-wps"),
    welderQualification: transaction.welderQualificationById("postgres-wpq"),
    weld: transaction.weldById("postgres-weld"),
    ndeRequest: transaction.ndeRequestById("postgres-nde-request"),
    ndeReport: transaction.ndeReportById("postgres-nde-report"),
    pwhtCycle: transaction.pwhtCycleById("postgres-pwht"),
    testPackage: transaction.testPackageById("postgres-test-package"),
  }));
  assert.equal(persisted.applicationIdentityBootstrap.identityAccounts.length, 2);
  assert.equal(persisted.applicationIdentityBootstrap.externalIdentities.length, 2);
  assert.equal(persisted.applicationIdentityBootstrap.managedAccessAssignments.length, 2);
  assert.equal(persisted.applicationIdentityBootstrap.audits.filter(
    (event) => event.action === "identity.bootstrap_completed",
  ).length, 1);
  assert.equal(persisted.project?.number, "PG-001");
  assert.ok(persisted.project?.createdAt instanceof Date);
  assert.ok(persisted.audits.some((event) => event.action === "project.created"));
  assert.equal(persisted.exportJob?.state, "queued");
  assert.equal(persisted.outbox?.state, "pending");
  assert.equal(persisted.mtrReviews[0]?.decision, "accepted");
  assert.equal(persisted.movements[0]?.movementType, "received");
  assert.equal(persisted.controlledReport?.formCode, "FORM-PRJ-001");
  assert.equal(persisted.estimate?.number, "PG-EST-001");
  assert.equal(persisted.estimateRevision?.state, "under_review");
  assert.equal(persisted.estimateRevision?.totals.finalPrice, "845.33");
  assert.equal(persisted.estimateLines[0]?.id, persistentEstimateLine.id);
  assert.equal(persisted.estimateLines[0]?.calculation.totalCost, "665.00");
  assert.equal(persisted.controlBaseline?.currentBudgetAmount, "700.00");
  assert.ok(persisted.controlBaseline?.periodStart instanceof Date);
  assert.equal(persisted.controlsPolicy?.standardChangeApprovalLimit, "1000.00");
  assert.equal(persisted.schedule?.currentRevisionId, persisted.scheduleRevision?.id);
  assert.ok(persisted.scheduleRevision?.dataDate instanceof Date);
  assert.equal(persisted.weldingProcedure?.number, "PG-WPS-001");
  assert.ok(persisted.weldingProcedure?.effectiveFrom instanceof Date);
  assert.ok(persisted.welderQualification?.validTo instanceof Date);
  assert.equal(persisted.weld?.events[0]?.repairCycle, 1);
  assert.ok(persisted.weld?.events[0]?.performedAt instanceof Date);
  assert.equal(persisted.ndeRequest?.repairCycle, persisted.ndeReport?.repairCycle);
  assert.ok(persisted.ndeRequest?.dueAt instanceof Date);
  assert.equal(persisted.pwhtCycle?.thermocouples[0]?.withinTolerance, true);
  assert.ok(persisted.pwhtCycle?.performedAt instanceof Date);
  assert.equal(persisted.testPackage?.restorationConfirmation, "Restored.");
  assert.ok(persisted.testPackage?.performedAt instanceof Date);

  const claim = {
    interfaceCodes: new Set(["export.worker"]), limit: 1, now,
    leaseDurationMs: 60_000,
  };
  const competingClaims = await Promise.all([
    store.claimIntegrationWork({ ...claim, ownerId: "worker-a" }),
    store.claimIntegrationWork({ ...claim, ownerId: "worker-b" }),
  ]);
  assert.equal(competingClaims.flat().length, 1);
  const onlyLease = competingClaims.flat()[0]!;
  assert.equal(onlyLease.message.id, persisted.outbox?.id);
  assert.equal(await store.releaseIntegrationWorkLease(onlyLease.message.id, "wrong-token"), false);
  assert.equal((await store.claimIntegrationWork({ ...claim, ownerId: "worker-c" })).length, 0);
  const reclaimed = await store.claimIntegrationWork({
    ...claim, ownerId: "worker-c", now: new Date(now.getTime() + claim.leaseDurationMs + 1),
  });
  assert.equal(reclaimed.length, 1);
  assert.equal(await store.releaseIntegrationWorkLease(onlyLease.message.id, onlyLease.leaseToken), false);
  assert.equal(await store.releaseIntegrationWorkLease(reclaimed[0]!.message.id, reclaimed[0]!.leaseToken), true);

  await assert.rejects(
    store.transaction((transaction) => {
      transaction.insertImportedRecord({
        id: "rolled-back-record", projectId: project.id, recordType: "material_receipt",
        payload: { projectId: project.id }, importJobId: "rollback-import", externalId: "ROLLBACK-1",
        createdAt: now, createdBy: "fixture",
      });
      throw new Error("intentional rollback");
    }),
    /intentional rollback/u,
  );
  assert.equal(
    (await store.transaction((transaction) => transaction.importedRecordsForProject(project.id)))
      .some((record) => record.id === "rolled-back-record"),
    false,
  );

  const concurrentUpdates = await Promise.allSettled([
    store.transaction((transaction) => {
      const current = transaction.projectById(project.id)!;
      transaction.updateProject({ ...current, name: "Concurrent A", version: current.version + 1 }, 1);
    }),
    store.transaction((transaction) => {
      const current = transaction.projectById(project.id)!;
      transaction.updateProject({ ...current, name: "Concurrent B", version: current.version + 1 }, 1);
    }),
  ]);
  assert.equal(concurrentUpdates.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = concurrentUpdates.find((result) => result.status === "rejected");
  assert.ok(rejected?.status === "rejected" && rejected.reason instanceof ConflictError);
  const afterConcurrency = await store.transaction((transaction) => transaction.projectById(project.id));
  assert.equal(afterConcurrency?.version, 2);
  assert.ok(["Concurrent A", "Concurrent B"].includes(afterConcurrency?.name ?? ""));

  const representativeRecordCount = 2_000;
  const volumeStartedAt = performance.now();
  await store.transaction((transaction) => {
    for (let index = 0; index < representativeRecordCount; index += 1) {
      transaction.insertImportedRecord({
        id: `postgres-volume-${index}`, projectId: project.id, recordType: "material_receipt",
        payload: { projectId: project.id, sequence: String(index) }, importJobId: "postgres-volume-import",
        externalId: `PG-VOLUME-${index}`, createdAt: now, createdBy: "fixture",
      });
    }
  });
  assert.ok(performance.now() - volumeStartedAt < 30_000, "Representative-volume write exceeded the provisional local guard.");
  await store.close();
  store = await PostgresFoundationStore.connect(connectionString);
  assert.equal(
    (await store.transaction((transaction) => transaction.importedRecordsForProject(project.id))).length,
    representativeRecordCount + 1,
  );

  const finalHealth = await store.health();
  assert.ok(finalHealth.repositoryRevision >= 4);
  assert.ok(finalHealth.repositoryEntityCount >= representativeRecordCount + 10);
  await store.close();
  store = await PostgresFoundationStore.connect(connectionString, "eiep_runtime");
  const leastPrivilegeHealth = await store.health();
  assert.equal(leastPrivilegeHealth.currentUser, "eiep_runtime");
  assert.equal(
    (await store.transaction((transaction) => transaction.projectById(project.id)))?.version,
    2,
  );
  await store.close();
  store = await PostgresFoundationStore.connect(connectionString, "eiep_job_worker");
  assert.equal((await store.health()).currentUser, "eiep_job_worker");
  assert.equal((await store.transaction((transaction) => transaction.projectById(project.id)))?.version, 2);
  process.stdout.write("PostgreSQL record-normalized restart, estimating/project-controls/execution-discipline hydration, rollback, atomic outbox, concurrency, and competing lease checks passed.\n");
} finally {
  await store.close();
}
