import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryFoundationStore, ReportingService } from "@eiep/api";
import { AuthorizationDeniedError } from "@eiep/rules-engine";
import { assignment, completeReadiness, context, scope } from "../helpers/foundation-fixture.js";

const now = new Date("2026-07-21T18:00:00.000Z");
const projectId = "command-project";

async function commandCenterFixture() {
  const store = new InMemoryFoundationStore();
  await store.transaction((transaction) => {
    transaction.insertProject({ id: projectId, businessScopeOrganizationId: "org-epv", number: "CMD-001",
      name: "Command center project", customerOrganizationId: "org-customer", facilityId: "facility-command",
      timeZone: "America/Denver", state: "active", readiness: completeReadiness, version: 2,
      createdAt: now, createdBy: "project-authority", updatedAt: now, updatedBy: "project-authority" });
    transaction.insertDocument({ id: "command-document", projectId, number: "CMD-DWG-001", title: "Command drawing",
      type: "drawing", discipline: "piping", currentRevisionId: "command-document-current", version: 2,
      createdAt: now, createdBy: "document-author", updatedAt: now, updatedBy: "document-author" });
    transaction.insertRevision({ id: "command-document-current", documentId: "command-document", revision: "1",
      state: "released", purpose: "construction", source: "controlled fixture", fileId: "command-current-file",
      fileValidationState: "released", approvalCount: 1, requiredApprovalCount: 1, supersedesRevisionId: null,
      version: 2, createdAt: now, createdBy: "document-author", updatedAt: now, updatedBy: "document-author" });
    transaction.insertRevision({ id: "command-document-review", documentId: "command-document", revision: "2",
      state: "under_review", purpose: "construction", source: "controlled fixture", fileId: "command-review-file",
      fileValidationState: "released", approvalCount: 0, requiredApprovalCount: 1,
      supersedesRevisionId: "command-document-current", version: 3, createdAt: now,
      createdBy: "document-author", updatedAt: now, updatedBy: "document-author" });
    transaction.insertScheduleProgram({ id: "command-schedule", businessScopeOrganizationId: "org-epv", projectId,
      number: "SCH-001", name: "Integrated schedule", timeZone: "America/Denver", currentRevisionId: "command-schedule-revision",
      version: 2, createdAt: now, createdBy: "scheduler", updatedAt: now, updatedBy: "schedule-authority" });
    transaction.insertScheduleRevision({ id: "command-schedule-revision", scheduleId: "command-schedule", revision: "1",
      revisionType: "baseline", parentRevisionId: null, sourceBaselineId: "command-baseline", dataDate: now,
      reason: "Controlled baseline", sourceSystem: "manual", sourceVersion: null, sourceSha256: null,
      activities: [
        { activityKey: "complete", displayId: "A100", name: "Completed fabrication", activityType: "activity",
          calendarCode: "DAY", wbsCode: "FAB", workPackageCode: null, responsibleOrganizationId: "org-epv",
          completionBoundaryId: null, plannedStart: new Date("2026-07-10T14:00:00.000Z"),
          plannedFinish: new Date("2026-07-15T22:00:00.000Z"), actualStart: new Date("2026-07-10T14:00:00.000Z"),
          actualFinish: new Date("2026-07-15T20:00:00.000Z"), remainingDurationDays: "0", quantity: null,
          unitCode: null, resourceCodes: [], constraintCodes: [], requiredDocumentRevisionIds: [],
          requiredMaterialItemIds: [], requiredInspectionIds: [], fieldClaimPercent: "100", acceptedProgressPercent: "100",
          sourceExternalId: null },
        { activityKey: "late", displayId: "A200", name: "Late installation", activityType: "activity",
          calendarCode: "DAY", wbsCode: "INSTALL", workPackageCode: null, responsibleOrganizationId: "org-epv",
          completionBoundaryId: null, plannedStart: new Date("2026-07-14T14:00:00.000Z"),
          plannedFinish: new Date("2026-07-20T22:00:00.000Z"), actualStart: new Date("2026-07-14T14:00:00.000Z"),
          actualFinish: null, remainingDurationDays: "2", quantity: null, unitCode: null, resourceCodes: [],
          constraintCodes: [], requiredDocumentRevisionIds: [], requiredMaterialItemIds: [], requiredInspectionIds: [],
          fieldClaimPercent: "50", acceptedProgressPercent: "50", sourceExternalId: null },
      ], dependencies: [{ predecessorActivityKey: "complete", successorActivityKey: "late", relationship: "FS", lagDays: "0" }],
      baselineVarianceDays: "1", state: "approved", submittedAt: now, submittedBy: "scheduler", reviewedAt: now,
      reviewedBy: "schedule-authority", reviewReason: "Approved baseline", version: 2, createdAt: now, createdBy: "scheduler" });
    transaction.insertFabricationAssembly({ id: "command-fabrication", businessScopeOrganizationId: "org-epv", projectId,
      number: "SP-CMD-001", revision: "0", assemblyType: "pipe_spool", parentRevisionId: null,
      revisionReason: "Initial command-center fabrication scope.", sourceSystem: "manual", sourceVersion: null, sourceSha256: null,
      systemCode: "SYS-CMD", areaCode: "AREA-CMD", workPackageCode: "WP-FAB", completionBoundaryId: "boundary-command",
      drawingRevisionIds: ["command-document-current"], materialItemIds: [], weldIds: [], requiredInspectionIds: [],
      bomLines: [], cutLines: [], state: "under_review", submittedAt: now, submittedBy: "fabrication-planner",
      reviewedAt: null, reviewedBy: null, reviewReason: null, releasedAt: null, releasedBy: null,
      acceptedAt: null, acceptedBy: null, version: 2, createdAt: now, createdBy: "fabrication-planner",
      updatedAt: now, updatedBy: "fabrication-planner" });
    for (const [id, number, ownerUserId] of [["owned-punch", "P-001", "operator"], ["other-punch", "P-002", "other-user"]] as const) {
      transaction.insertPunch({ id, projectId, number, type: "completion", priority: "high", systemId: null, areaId: null,
        workPackageId: null, assetId: null, description: `${number} controlled completion work`, ownerUserId,
        targetAt: new Date("2026-07-20T18:00:00.000Z"), evidenceFileIds: [], state: "open", verifiedBy: null,
        verificationEvidenceFileId: null, closureMeaning: null, turnoverRequired: true, version: 1,
        createdAt: new Date("2026-07-18T18:00:00.000Z"), createdBy: "quality-lead", updatedAt: now, updatedBy: "quality-lead" });
    }
    transaction.appendAudit({ id: "command-audit", occurredAt: new Date("2026-07-21T17:45:00.000Z"),
      actorUserId: "scheduler", actingOrganizationId: "org-epv", projectId, action: "schedule.revision_approved",
      objectType: "schedule_revision", objectId: "command-schedule-revision", priorState: "under_review", newState: "approved",
      reason: "Approved baseline", correlationId: "command-correlation", changedFields: { state: "approved" }, canonicalSha256: "a".repeat(64) });
  });
  return { store, service: new ReportingService(store, false, () => now) };
}

test("FR-CMD-001-004 / AC-15: command center derives authorized metrics, owned actions, schedule variance, and exact activity links", async () => {
  const { service } = await commandCenterFixture();
  const access = context("operator", "mfa");
  const assignments = [assignment("command-access", "operator", [
    "report.read", "schedule.read", "schedule.manage", "punch.read", "punch.update.owned", "audit.read",
  ], scope(projectId))];
  const snapshot = await service.commandCenter(access, assignments, projectId);
  assert.equal(snapshot.metrics.scheduleProgressPercent, 75);
  assert.equal(snapshot.schedule.completedActivities, 1);
  assert.equal(snapshot.schedule.lateActivities, 1);
  assert.deepEqual(snapshot.schedule.sourceRevisionIds, ["command-schedule-revision"]);
  assert.equal(snapshot.metrics.openExceptions, 2);
  assert.equal(snapshot.metrics.openTasks, 2);
  assert.deepEqual(snapshot.tasks.map((task) => task.recordId).sort(), ["command-schedule-revision:late", "owned-punch"]);
  assert.equal(snapshot.tasks.every((task) => task.priority === "critical" && task.overdue), true);
  assert.equal(snapshot.tasks.some((task) => task.recordId === "other-punch"), false);
  assert.equal(snapshot.modules.find((module) => module.module === "quality")?.total, 2);
  assert.equal(snapshot.modules.find((module) => module.module === "scheduling")?.progressPercent, 50);
  assert.equal(snapshot.activityVisible, true);
  assert.deepEqual(snapshot.recentActivity[0], {
    id: "command-audit", occurredAt: new Date("2026-07-21T17:45:00.000Z"), actorUserId: "scheduler",
    action: "schedule.revision_approved", module: "scheduling", objectType: "schedule_revision",
    objectId: "command-schedule-revision", priorState: "under_review", newState: "approved",
  });
});

test("FR-CMD-001-003 / AC-02, AC-15: dashboard counts, tasks, and activity fail closed independently by underlying scope", async () => {
  const { service } = await commandCenterFixture();
  const reportOnly = context("report-reader", "mfa");
  const snapshot = await service.commandCenter(reportOnly,
    [assignment("report-only", "report-reader", ["report.read"], scope(projectId))], projectId);
  assert.equal(snapshot.metrics.openTasks, 0);
  assert.equal(snapshot.metrics.openExceptions, 0);
  assert.equal(snapshot.metrics.scheduleProgressPercent, null);
  assert.equal(snapshot.activityVisible, false);
  assert.deepEqual(snapshot.recentActivity, []);
  assert.equal(snapshot.modules.every((module) => module.total === 0), true);

  const currentOnly = await service.commandCenter(context("current-reader", "mfa"), [
    assignment("current-report", "current-reader", ["report.read", "document.read_current"], scope(projectId)),
  ], projectId);
  assert.equal(currentOnly.metrics.documentsCurrent, 1);
  assert.equal(currentOnly.modules.find((module) => module.module === "documents")?.attention, 0);
  assert.equal(currentOnly.tasks.some((task) => task.recordId === "command-document-review"), false);

  const historyReader = await service.commandCenter(context("history-reader", "mfa"), [
    assignment("history-report", "history-reader", ["report.read", "document.read_current", "document.read_history"], scope(projectId)),
  ], projectId);
  assert.equal(historyReader.modules.find((module) => module.module === "documents")?.attention, 1);
  assert.equal(historyReader.tasks.some((task) => task.recordId === "command-document-review"), false);

  const reviewer = await service.commandCenter(context("document-reviewer", "step-up"), [
    assignment("review-report", "document-reviewer", ["report.read", "document.read_current", "document.approve"], scope(projectId)),
  ], projectId);
  assert.equal(reviewer.tasks.some((task) => task.recordId === "command-document-review"), true);

  await assert.rejects(service.commandCenter(context("other-reader", "mfa"),
    [assignment("other-report", "other-reader", ["report.read"], scope("other-project"))], projectId), AuthorizationDeniedError);
});

test("FR-CMD-002 / FR-FAB-003: command center projects permission-scoped fabrication review work", async () => {
  const { service } = await commandCenterFixture();
  const reviewer = context("fabrication-reviewer", "step-up", ["fabrication_engineering_authority"]);
  const snapshot = await service.commandCenter(reviewer, [assignment("fabrication-command-access", "fabrication-reviewer",
    ["report.read", "fabrication.read", "fabrication.approve"], scope(projectId))], projectId);
  assert.equal(snapshot.modules.find((module) => module.module === "fabrication")?.total, 1);
  assert.equal(snapshot.modules.find((module) => module.module === "fabrication")?.attention, 1);
  assert.equal(snapshot.tasks.some((task) => task.recordId === "command-fabrication"
    && task.action === "fabrication.approve"), true);
});
