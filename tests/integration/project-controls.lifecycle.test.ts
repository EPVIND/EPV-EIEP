import assert from "node:assert/strict";
import test from "node:test";
import {
  InMemoryFoundationStore,
  ProjectControlsService,
  type CreateScheduleRevisionInput,
} from "@eiep/api";
import { AuthorizationDeniedError } from "@eiep/rules-engine";
import type { ScheduleActivity } from "@eiep/shared-types";
import {
  assignment,
  completeReadiness,
  context,
  scope,
  seedGovernedFile,
  sequentialIds,
} from "../helpers/foundation-fixture.js";

const now = new Date("2026-07-21T12:00:00.000Z");
const projectId = "project-controls-1";
const organizationId = "org-epv";
const sourceSha256 = "a".repeat(64);

function access(
  userId: string,
  permissions: readonly string[],
  qualifications: readonly string[] = [],
  scopedProjectId: string | null = projectId,
) {
  return {
    context: context(userId, "step-up", qualifications, organizationId),
    assignments: [assignment(`${userId}-access`, userId, permissions, scope(scopedProjectId), {}, organizationId)],
  };
}

async function configuredControls() {
  const store = new InMemoryFoundationStore();
  const service = new ProjectControlsService(store, () => now, sequentialIds("controls"));
  await store.transaction((transaction) => {
    transaction.insertProject({
      id: projectId, businessScopeOrganizationId: organizationId, number: "PJC-001",
      name: "Project controls pilot", customerOrganizationId: "org-customer", facilityId: "facility-1",
      timeZone: "America/Denver", state: "active", readiness: completeReadiness, version: 2,
      createdAt: now, createdBy: "project-authority", updatedAt: now, updatedBy: "project-authority",
    });
    transaction.insertProjectStructure({
      id: "wbs-controls", projectId, type: "wbs", parentId: null, code: "WBS-PIPING", name: "Piping",
      state: "active", version: 1, createdAt: now, createdBy: "project-authority",
    });
    transaction.insertProjectStructure({
      id: "wp-controls", projectId, type: "work_package", parentId: "wbs-controls", code: "WP-PIPING",
      name: "Piping work package", state: "active", version: 1, createdAt: now, createdBy: "project-authority",
    });
    transaction.insertCompletionBoundary({
      id: "boundary-controls", projectId, boundaryType: "system", code: "SYS-01", name: "System 01",
      state: "active", version: 1, createdAt: now, createdBy: "project-authority",
    });
    transaction.insertDocument({
      id: "document-controls", projectId, number: "SPEC-100", title: "Procurement specification",
      type: "specification", discipline: "piping", currentRevisionId: "revision-controls", version: 1,
      createdAt: now, createdBy: "document-control", updatedAt: now, updatedBy: "document-control",
    });
    transaction.insertRevision({
      id: "revision-controls", documentId: "document-controls", revision: "0", state: "released",
      purpose: "Procurement and schedule requirement", source: "controlled fixture", fileId: "file-controls",
      fileValidationState: "released", approvalCount: 1, requiredApprovalCount: 1, supersedesRevisionId: null,
      version: 2, createdAt: now, createdBy: "document-control", updatedAt: now, updatedBy: "document-control",
    });
    transaction.insertEstimate({
      id: "estimate-controls", businessScopeOrganizationId: organizationId, number: "EST-CONTROLS",
      name: "Awarded controls estimate", customerOrganizationId: "org-customer", facilityId: "facility-1",
      opportunityReference: "RFQ-CONTROLS", scopeStatement: "Awarded piping scope.",
      dueAt: new Date("2026-08-01T00:00:00.000Z"), originatingTimeZone: "America/Denver",
      currency: "USD", basisReferences: ["SPEC-100-0"], ownerUserId: "estimator", state: "awarded",
      currentRevisionId: "estimate-revision-controls", version: 3, createdAt: now, createdBy: "estimator",
      updatedAt: now, updatedBy: "handoff-authority",
    });
    transaction.insertEstimateRevision({
      id: "estimate-revision-controls", estimateId: "estimate-controls", revision: "A", parentRevisionId: null,
      revisionReason: "Award basis", state: "approved", assumptions: [], exclusions: [], alternates: [],
      contingencyPercent: "10", escalationPercent: "0", markupPercent: "0", taxPercent: "0",
      totals: { version: "estimate-v1", currency: "USD", directCost: "1000.00", contingencyAmount: "100.00",
        escalationAmount: "0.00", markupAmount: "0.00", taxAmount: "0.00", finalPrice: "1100.00" },
      submittedAt: now, submittedBy: "estimator", reviewedAt: now, reviewedBy: "estimate-authority",
      reviewReason: "Approved award", version: 3, createdAt: now, createdBy: "estimator",
      updatedAt: now, updatedBy: "estimate-authority",
    });
    transaction.insertEstimateLine({
      id: "estimate-line-controls", revisionId: "estimate-revision-controls", lineKey: "PIPE-001",
      parentLineKey: null, sortOrder: 10, costCode: "PIPING", bidItemCode: "BASE", alternateCode: null,
      wbsCode: "WBS-PIPING", workPackageCode: "WP-PIPING", assemblyRevisionId: null,
      description: "Piping installation", quantity: "10", unitCode: "EA", baseLaborHoursPerUnit: "0",
      laborRatePerHour: "0", materialUnitCost: "0", equipmentUnitCost: "0", subcontractUnitCost: "0",
      allowanceCost: "0.00", otherCost: "1000.00", productivityFactors: [],
      calculation: { version: "estimate-v1", productivityMultiplier: "1", adjustedLaborHours: "0",
        laborCost: "0.00", materialCost: "0.00", equipmentCost: "0.00", subcontractCost: "0.00",
        allowanceCost: "0.00", otherCost: "1000.00", totalCost: "1000.00" },
      state: "active", version: 1, createdAt: now, createdBy: "estimator", updatedAt: now, updatedBy: "estimator",
    });
    transaction.insertEstimateHandoff({
      id: "handoff-controls", estimateId: "estimate-controls", proposalId: "proposal-controls",
      projectId, sourceRevisionId: "estimate-revision-controls", sourceCanonicalSha256: "b".repeat(64),
      mappings: [
        { estimateLineKey: "PIPE-001", category: "direct_cost", costCode: "PIPING",
          wbsCode: "WBS-PIPING", workPackageCode: "WP-PIPING", amount: "1000.00" },
        { estimateLineKey: "ADJUSTMENT-CONTINGENCY", category: "contingency", costCode: "CONTINGENCY",
          wbsCode: null, workPackageCode: null, amount: "100.00" },
      ],
      mappedTotal: "1100.00", sourceTotal: "1100.00", reconciliationDifference: "0.00",
      authorizationReference: "AWARD-001", createdAt: now, createdBy: "handoff-authority",
    });
  });
  await seedGovernedFile(store, projectId, "file-controls");
  const policyEditor = access("policy-editor", ["controls.policy.manage"], [], null);
  const policyReviewer = access("policy-reviewer", ["controls.policy.approve"], ["project_controls_authority"], null);
  const policy = await service.proposeAuthorityPolicy(policyEditor.context, policyEditor.assignments, {
    businessScopeOrganizationId: organizationId, currency: "USD", revision: "1",
    standardChangeApprovalLimit: "100", standardProcurementAwardLimit: "800",
    changeAboveThresholdQualification: "EXECUTIVE_CHANGE_AUTHORITY",
    procurementAboveThresholdQualification: "EXECUTIVE_PROCUREMENT_AUTHORITY", supersedesRevisionId: null,
  });
  await service.reviewAuthorityPolicy(
    policyReviewer.context, policyReviewer.assignments, policy.id, policy.version, "approve", "Limits verified.",
  );
  const baselineAuthor = access("baseline-author", ["controls.baseline.create", "controls.baseline.submit"], ["project_controls_authority"]);
  const draft = await service.createBaselineFromHandoff(baselineAuthor.context, baselineAuthor.assignments, projectId, {
    sourceHandoffId: "handoff-controls", number: "CB-001", revision: "0", revisionReason: "Initial award baseline",
    periodStart: new Date("2026-07-01T00:00:00.000Z"), periodFinish: new Date("2027-06-30T00:00:00.000Z"),
    managementReserveAmount: "100", mappings: [
      { sourceEstimateLineKey: "PIPE-001", controlAccountCode: "CA-PIPING",
        responsibleOrganizationId: organizationId, wbsCode: "WBS-PIPING", workPackageCode: "WP-PIPING" },
      { sourceEstimateLineKey: "ADJUSTMENT-CONTINGENCY", controlAccountCode: "CA-CONTINGENCY",
        responsibleOrganizationId: organizationId, wbsCode: null, workPackageCode: null },
    ],
  });
  const submitted = await service.submitBaseline(
    baselineAuthor.context, baselineAuthor.assignments, draft.id, draft.version,
  );
  const baselineReviewer = access("baseline-reviewer", ["controls.baseline.approve"], ["project_controls_authority"]);
  const baseline = await service.reviewBaseline(
    baselineReviewer.context, baselineReviewer.assignments, submitted.id, submitted.version, "approve", "Award reconciled.",
  );
  return { store, service, baseline, baselineAuthor, baselineReviewer };
}

test("FR-PJC-001-004 / EX-AC-04: immutable baseline, thresholded change, period cost, and quantity progress remain separate", async () => {
  const { store, service, baseline } = await configuredControls();
  assert.equal(baseline.sourceAwardAmount, "1100.00");
  assert.equal(baseline.currentBudgetAmount, "1200.00");
  assert.equal(baseline.lines[0]?.budgetQuantity, "10");

  const changeAuthor = access("change-author", ["controls.change.manage"]);
  const change = await service.createChangeRequest(changeAuthor.context, changeAuthor.assignments, projectId, {
    baselineId: baseline.id, number: "CR-001", title: "Additional piping", origin: "Owner request",
    description: "Add two controlled piping units.", scheduleDaysImpact: "3", quotationReference: "Q-CHANGE-001",
    evidenceFileIds: ["file-controls"],
    lineImpacts: [{ baselineLineKey: "PIPE-001", quantityDelta: "2", amountDelta: "200", reason: "Added scope" }],
  });
  const standardReviewer = access("change-reviewer", ["controls.change.approve"], ["project_controls_authority"]);
  await assert.rejects(
    service.reviewChangeRequest(
      standardReviewer.context, standardReviewer.assignments, change.id, change.version, "approve", "Attempt standard approval.",
    ),
    (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "qualification_required",
  );
  const executiveReviewer = access(
    "change-executive", ["controls.change.approve"], ["project_controls_authority", "EXECUTIVE_CHANGE_AUTHORITY"],
  );
  const approvedChange = await service.reviewChangeRequest(
    executiveReviewer.context, executiveReviewer.assignments, change.id, change.version, "approve", "Above-limit change approved.",
  );
  const revisionAuthor = access("revision-author", ["controls.baseline.create", "controls.baseline.submit"], ["project_controls_authority"]);
  const successorDraft = await service.createBaselineFromChange(
    revisionAuthor.context, revisionAuthor.assignments, approvedChange.id,
    { revision: "1", revisionReason: "Incorporate CR-001", periodStart: baseline.periodStart, periodFinish: baseline.periodFinish },
  );
  const successorSubmitted = await service.submitBaseline(
    revisionAuthor.context, revisionAuthor.assignments, successorDraft.id, successorDraft.version,
  );
  const revisionReviewer = access("revision-reviewer", ["controls.baseline.approve"], ["project_controls_authority"]);
  const successor = await service.reviewBaseline(
    revisionReviewer.context, revisionReviewer.assignments, successorSubmitted.id, successorSubmitted.version,
    "approve", "Change revision reconciled.",
  );
  assert.equal(successor.parentBaselineId, baseline.id);
  assert.equal(successor.currentBudgetAmount, "1400.00");
  assert.equal(successor.lines.find((line) => line.lineKey === "PIPE-001")?.budgetQuantity, "12");
  assert.equal(store.snapshot().projectControlBaselines.get(baseline.id)?.state, "superseded");
  assert.equal(store.snapshot().projectChangeRequests.get(change.id)?.state, "incorporated");

  const costSubmitter = access("cost-submitter", ["controls.cost.submit"]);
  const costReviewer = access("cost-reviewer", ["controls.cost.accept"], ["project_controls_authority"]);
  for (const [entryType, amount, sourceId] of [
    ["actual", "300", "ACTUAL-2026-07"],
    ["accrual", "100", "ACCRUAL-2026-07"],
    ["forecast_remaining", "500", "FORECAST-2026-07"],
  ] as const) {
    const entry = await service.submitCostEntry(costSubmitter.context, costSubmitter.assignments, projectId, {
      baselineId: successor.id, baselineLineKey: "PIPE-001", entryType, amount,
      periodStart: new Date("2026-07-01T00:00:00.000Z"), periodFinish: new Date("2026-07-31T00:00:00.000Z"),
      sourceType: "CONTROLLED_IMPORT", sourceId, sourceSha256, description: `${entryType} source`,
    });
    await service.reviewCostEntry(
      costReviewer.context, costReviewer.assignments, entry.id, entry.version, "accept", "Source reconciled.",
    );
  }

  const progressSubmitter = access("field-progress", ["controls.progress.submit"]);
  const progress = await service.submitProgressClaim(progressSubmitter.context, progressSubmitter.assignments, projectId, {
    baselineId: successor.id, baselineLineKey: "PIPE-001",
    periodStart: new Date("2026-07-01T00:00:00.000Z"), periodFinish: new Date("2026-07-31T00:00:00.000Z"),
    claimedQuantity: "5", evidenceFileIds: ["file-controls"], fieldStatus: "Five installed units claimed by field.",
  });
  assert.equal(progress.claimedEarnedAmount, "500.00");
  assert.equal(progress.qualityAcceptanceState, "not_evaluated");
  assert.equal(progress.invoiceApprovalState, "not_submitted");
  const progressReviewer = access("progress-reviewer", ["controls.progress.accept"], ["project_controls_authority"]);
  await service.reviewProgressClaim(
    progressReviewer.context, progressReviewer.assignments, progress.id, progress.version, "accept", "Quantity evidence verified.",
  );
  const reader = access("controls-reader", ["controls.read"]);
  const summary = await service.costSummary(reader.context, reader.assignments, projectId);
  assert.deepEqual(summary, {
    currency: "USD", currentBudget: "1400.00", commitments: "0.00", actuals: "300.00",
    accruals: "100.00", acceptedProgress: "500.00", forecastRemaining: "500.00",
    estimateAtCompletion: "900.00", varianceAtCompletion: "500.00", contingencyDraws: "0.00",
    reserveMovements: "0.00",
  });
});

test("FR-PRC-001-003 / EX-AC-05: requisition, comparison, thresholded award, commitment, and expediting retain exact sources", async () => {
  const { store, service, baseline } = await configuredControls();
  const requisitionAuthor = access("requisition-author", ["procurement.requisition.manage"]);
  const requisition = await service.createProcurementRequisition(
    requisitionAuthor.context, requisitionAuthor.assignments, projectId, {
      baselineId: baseline.id, number: "REQ-001", title: "Piping materials and services", items: [{
        itemKey: "ITEM-001", baselineLineKey: "PIPE-001", itemType: "material", description: "Controlled pipe item",
        specificationReference: "SPEC-100 REV 0", governingDocumentRevisionIds: ["revision-controls"],
        quantity: "5", unitCode: "EA", needBy: new Date("2026-09-01T00:00:00.000Z"),
        deliveryTerms: "Delivered project site", inspectionRequirements: ["Receiving inspection"],
        documentRequirements: ["MTR"], turnoverRequirements: ["Accepted MTR"], costCode: "PIPING",
        workPackageCode: "WP-PIPING", budgetAmount: "900",
      }],
    },
  );
  const submitted = await service.submitProcurementRequisition(
    requisitionAuthor.context, requisitionAuthor.assignments, requisition.id, requisition.version,
  );
  const requisitionReviewer = access(
    "requisition-reviewer", ["procurement.requisition.approve"], ["procurement_authority"],
  );
  const approved = await service.reviewProcurementRequisition(
    requisitionReviewer.context, requisitionReviewer.assignments, submitted.id, submitted.version,
    "approve", "Requirements and budget verified.",
  );
  const buyer = access("buyer", ["procurement.bid.manage"]);
  let bidPackage = await service.createProcurementBidPackage(buyer.context, buyer.assignments, projectId, {
    requisitionId: approved.id, number: "BID-001", bidderOrganizationIds: ["vendor-a", "vendor-b"],
  });
  bidPackage = await service.recordProcurementOffer(buyer.context, buyer.assignments, bidPackage.id, bidPackage.version, {
    offerKey: "OFFER-A", vendorOrganizationId: "vendor-a", quoteReference: "QA-001",
    sourceFileId: "file-controls", sourceSha256, currency: "USD", validUntil: new Date("2026-08-31T00:00:00.000Z"),
    totalAmount: "850", promisedDate: new Date("2026-08-25T00:00:00.000Z"), inclusions: ["All requisition items"],
    exclusions: [], clarifications: ["Delivery included"], unresolvedItemKeys: [],
  });
  bidPackage = await service.recordProcurementOffer(buyer.context, buyer.assignments, bidPackage.id, bidPackage.version, {
    offerKey: "OFFER-B", vendorOrganizationId: "vendor-b", quoteReference: "QB-001",
    sourceFileId: "file-controls", sourceSha256, currency: "USD", validUntil: new Date("2026-08-31T00:00:00.000Z"),
    totalAmount: "820", promisedDate: new Date("2026-08-20T00:00:00.000Z"), inclusions: [],
    exclusions: ["Receiving inspection"], clarifications: [], unresolvedItemKeys: ["ITEM-001"],
  });
  const recommender = access("bid-recommender", ["procurement.bid.recommend"], ["procurement_authority"]);
  const recommended = await service.recommendProcurementOffer(
    recommender.context, recommender.assignments, bidPackage.id, bidPackage.version, "OFFER-A", "Complete evaluated scope.",
  );
  const standardAwarder = access("award-authority", ["procurement.bid.award"], ["procurement_authority"]);
  await assert.rejects(
    service.awardProcurementOffer(standardAwarder.context, standardAwarder.assignments, recommended.id, {
      expectedVersion: recommended.version, reason: "Attempt standard award.", purchaseOrderReference: "PO-001", revision: "0",
    }),
    (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "qualification_required",
  );
  const executiveAwarder = access(
    "executive-awarder", ["procurement.bid.award"], ["procurement_authority", "EXECUTIVE_PROCUREMENT_AUTHORITY"],
  );
  const awarded = await service.awardProcurementOffer(executiveAwarder.context, executiveAwarder.assignments, recommended.id, {
    expectedVersion: recommended.version, reason: "Above-limit award approved.", purchaseOrderReference: "PO-001", revision: "0",
  });
  assert.equal(awarded.commitment.amount, "850.00");
  assert.equal(awarded.commitment.vendorOrganizationId, "vendor-a");
  const expediter = access("expediter", ["procurement.expedite.manage"]);
  const acknowledged = await service.recordProcurementStatus(expediter.context, expediter.assignments, awarded.commitment.id, {
    expectedVersion: awarded.commitment.version, eventType: "acknowledgement", status: "Vendor acknowledged exact PO revision.",
    promisedAt: new Date("2026-08-25T00:00:00.000Z"), forecastAt: new Date("2026-08-27T00:00:00.000Z"),
    actualAt: null, sourceReference: "ACK-PO-001-0", evidenceFileIds: ["file-controls"],
    receivedMaterialItemIds: [], responsibleUserId: "expediter",
  });
  assert.equal(acknowledged.state, "acknowledged");
  assert.equal(acknowledged.statusEvents[0]?.sourceReference, "ACK-PO-001-0");
  await assert.rejects(
    service.recordProcurementStatus(expediter.context, expediter.assignments, acknowledged.id, {
      expectedVersion: acknowledged.version, eventType: "receipt", status: "Unlinked receipt attempt.", promisedAt: null,
      forecastAt: null, actualAt: now, sourceReference: "RECEIPT-INVALID", evidenceFileIds: ["file-controls"],
      receivedMaterialItemIds: [], responsibleUserId: "expediter",
    }),
    /must link at least one received material item/u,
  );
  await store.transaction((transaction) => transaction.insertMaterial({
    id: "material-controls-receipt", projectId, identifier: "MAT-RECEIPT-001", receiptNumber: "REC-001",
    purchaseReference: "PO-001", vendorOrganizationId: "vendor-a", specification: "SPEC-100", grade: "GRADE-1",
    form: "pipe", dimensions: "2 in", quantity: "5", unitCode: "EA", heatLot: "HEAT-001",
    mtrDocumentRevisionId: "revision-controls", receiptEvidenceFileIds: ["file-controls"], storageLocation: "receiving",
    parentItemId: null, state: "received_pending", requirements: {
      projectConfigurationRevisionId: "config-controls", mtrRequired: true, mtrAccepted: false, mtrReviewId: null,
      receivingInspectionRequired: true, receivingInspectionAccepted: false, pmiRequired: false,
      pmiAccepted: false, governingPmiRule: null, pmiOverrideId: null, openDispositionCount: 0,
    }, version: 1, createdAt: now, createdBy: "receiver", updatedAt: now, updatedBy: "receiver",
  }));
  const received = await service.recordProcurementStatus(expediter.context, expediter.assignments, acknowledged.id, {
    expectedVersion: acknowledged.version, eventType: "receipt", status: "Linked controlled receiving record.",
    promisedAt: null, forecastAt: null, actualAt: now, sourceReference: "REC-001", evidenceFileIds: ["file-controls"],
    receivedMaterialItemIds: ["material-controls-receipt"], responsibleUserId: "expediter",
  });
  assert.equal(received.state, "received");
  assert.deepEqual(received.statusEvents.at(-1)?.receivedMaterialItemIds, ["material-controls-receipt"]);
  const reader = access("procurement-reader", ["controls.read"]);
  assert.equal((await service.costSummary(reader.context, reader.assignments, projectId)).commitments, "850.00");
});

function activity(
  key: string,
  start: string,
  finish: string,
  progress: string,
  sourceExternalId: string,
  overrides: Partial<ScheduleActivity> = {},
): ScheduleActivity {
  return {
    activityKey: key, displayId: key, name: `Activity ${key}`, activityType: "activity", calendarCode: "STANDARD",
    wbsCode: "WBS-PIPING", workPackageCode: "WP-PIPING", responsibleOrganizationId: organizationId,
    completionBoundaryId: "boundary-controls", plannedStart: new Date(start), plannedFinish: new Date(finish),
    actualStart: null, actualFinish: null, remainingDurationDays: "10", quantity: "10", unitCode: "EA",
    resourceCodes: ["CREW-PIPING"], constraintCodes: [], requiredDocumentRevisionIds: ["revision-controls"],
    requiredMaterialItemIds: [], requiredInspectionIds: [], fieldClaimPercent: progress,
    acceptedProgressPercent: progress, sourceExternalId, ...overrides,
  };
}

test("FR-SCH-001-004 / EX-AC-05: approved baseline, two updates, look-ahead, and idempotent import preserve logic and variance", async () => {
  const { service, baseline } = await configuredControls();
  const scheduler = access("scheduler", ["schedule.manage", "schedule.import"]);
  const schedule = await service.createScheduleProgram(scheduler.context, scheduler.assignments, projectId, {
    number: "SCH-001", name: "Project control schedule", timeZone: "America/Denver",
  });
  const dependencies = [{ predecessorActivityKey: "A100", successorActivityKey: "A200", relationship: "FS" as const, lagDays: "0" }];
  const baselineInput: CreateScheduleRevisionInput = {
    revision: "B0", revisionType: "baseline", parentRevisionId: null, sourceBaselineId: baseline.id,
    dataDate: new Date("2026-07-21T00:00:00.000Z"), reason: "Initial approved schedule",
    sourceSystem: "manual", sourceVersion: null, sourceSha256: null,
    activities: [
      activity("A100", "2026-07-22T00:00:00.000Z", "2026-07-31T00:00:00.000Z", "0", "P6-A100"),
      activity("A200", "2026-08-01T00:00:00.000Z", "2026-08-10T00:00:00.000Z", "0", "P6-A200"),
    ], dependencies,
  };
  const draft = await service.createScheduleRevision(
    scheduler.context, scheduler.assignments, schedule.id, schedule.version, baselineInput,
  );
  const submitted = await service.submitScheduleRevision(scheduler.context, scheduler.assignments, draft.id, draft.version);
  const scheduleReviewer = access("schedule-reviewer", ["schedule.approve"], ["scheduling_authority"]);
  const approvedBaseline = await service.reviewScheduleRevision(
    scheduleReviewer.context, scheduleReviewer.assignments, submitted.id, submitted.version, "approve", "Logic verified.",
  );
  const updateOne = await service.createScheduleRevision(
    scheduler.context, scheduler.assignments, schedule.id, schedule.version + 1, {
      ...baselineInput, revision: "U1", revisionType: "update", parentRevisionId: approvedBaseline.id,
      dataDate: new Date("2026-07-28T00:00:00.000Z"), reason: "Weekly update 1",
      activities: [
        activity("A100", "2026-07-22T00:00:00.000Z", "2026-08-02T00:00:00.000Z", "20", "P6-A100",
          { actualStart: new Date("2026-07-22T00:00:00.000Z"), remainingDurationDays: "5", fieldClaimPercent: "25" }),
        activity("A200", "2026-08-03T00:00:00.000Z", "2026-08-12T00:00:00.000Z", "0", "P6-A200",
          { constraintCodes: ["MATERIAL-DELIVERY"] }),
      ],
    },
  );
  const updateOneSubmitted = await service.submitScheduleRevision(
    scheduler.context, scheduler.assignments, updateOne.id, updateOne.version,
  );
  const approvedUpdateOne = await service.reviewScheduleRevision(
    scheduleReviewer.context, scheduleReviewer.assignments, updateOneSubmitted.id, updateOneSubmitted.version,
    "approve", "Update actuals and forecast verified.",
  );
  assert.equal(approvedUpdateOne.baselineVarianceDays, "2");

  const importInput = {
    idempotencyKey: "p6-u2", sourceSystem: "p6" as const, sourceVersion: "P6-24.12",
    sourceFileId: "file-controls", sourceSha256, mappingVersion: "P6-MAP-1", targetRevision: "U2",
    targetRevisionType: "update" as const, parentRevisionId: approvedUpdateOne.id,
    dataDate: new Date("2026-08-04T00:00:00.000Z"),
    activities: [
      activity("A100", "2026-07-22T00:00:00.000Z", "2026-08-02T00:00:00.000Z", "40", "P6-A100",
        { actualStart: new Date("2026-07-22T00:00:00.000Z"), remainingDurationDays: "2", fieldClaimPercent: "45" }),
      activity("A200", "2026-08-03T00:00:00.000Z", "2026-08-13T00:00:00.000Z", "10", "P6-A200",
        { constraintCodes: ["MATERIAL-DELIVERY"], fieldClaimPercent: "15" }),
    ], dependencies,
  };
  const preview = await service.previewScheduleImport(scheduler.context, scheduler.assignments, schedule.id, importInput);
  assert.equal(preview.state, "previewed");
  const exactRetry = await service.previewScheduleImport(scheduler.context, scheduler.assignments, schedule.id, importInput);
  assert.equal(exactRetry.id, preview.id);
  const committed = await service.commitScheduleImport(
    scheduler.context, scheduler.assignments, preview.id, preview.version,
  );
  const importSubmitted = await service.submitScheduleRevision(
    scheduler.context, scheduler.assignments, committed.revision.id, committed.revision.version,
  );
  const approvedUpdateTwo = await service.reviewScheduleRevision(
    scheduleReviewer.context, scheduleReviewer.assignments, importSubmitted.id, importSubmitted.version,
    "approve", "Imported update verified independently.",
  );
  assert.equal(approvedUpdateTwo.baselineVarianceDays, "3");
  assert.equal(approvedUpdateTwo.sourceSha256, sourceSha256);
  const lookAheadReader = access("schedule-reader", ["schedule.read"]);
  const lookAhead = await service.scheduleLookAhead(lookAheadReader.context, lookAheadReader.assignments, schedule.id, 30);
  assert.equal(lookAhead.length, 1);
  assert.deepEqual(lookAhead.find((item) => item.activity.activityKey === "A200")?.blockers, ["MATERIAL-DELIVERY"]);

  const invalid = await service.previewScheduleImport(scheduler.context, scheduler.assignments, schedule.id, {
    ...importInput, idempotencyKey: "p6-invalid", targetRevision: "U3", parentRevisionId: approvedUpdateTwo.id,
    activities: [activity("A300", "2026-08-05T00:00:00.000Z", "2026-08-06T00:00:00.000Z", "0", "P6-DUP"),
      activity("A400", "2026-08-07T00:00:00.000Z", "2026-08-08T00:00:00.000Z", "0", "P6-DUP")],
    dependencies: [],
  });
  assert.equal(invalid.state, "invalid");
  assert.ok(invalid.previewErrors.includes("duplicate_external_id"));
  await assert.rejects(
    service.commitScheduleImport(scheduler.context, scheduler.assignments, invalid.id, invalid.version),
    /Only a valid preview/u,
  );
});
