import assert from "node:assert/strict";
import {
  ConflictError,
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
  await store.close();

  store = await PostgresFoundationStore.connect(connectionString);
  const persisted = await store.transaction((transaction) => ({
    project: transaction.projectById(project.id),
    audits: transaction.auditForProject(project.id),
    exportJob: transaction.exportJobById(queuedExport.id),
    outbox: transaction.integrationMessageByKey("export.worker", queuedExport.id),
    mtrReviews: transaction.mtrReviewsForMaterial("postgres-material"),
    movements: transaction.materialMovementsForItem("postgres-material"),
    controlledReport: transaction.controlledReportById(persistentReport.id),
  }));
  assert.equal(persisted.project?.number, "PG-001");
  assert.ok(persisted.project?.createdAt instanceof Date);
  assert.ok(persisted.audits.some((event) => event.action === "project.created"));
  assert.equal(persisted.exportJob?.state, "queued");
  assert.equal(persisted.outbox?.state, "pending");
  assert.equal(persisted.mtrReviews[0]?.decision, "accepted");
  assert.equal(persisted.movements[0]?.movementType, "received");
  assert.equal(persisted.controlledReport?.formCode, "FORM-PRJ-001");

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
  assert.ok(finalHealth.repositoryEntityCount >= representativeRecordCount + 6);
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
  process.stdout.write("PostgreSQL record-normalized restart, typed hydration, rollback, atomic outbox, concurrency, and competing lease checks passed.\n");
} finally {
  await store.close();
}
