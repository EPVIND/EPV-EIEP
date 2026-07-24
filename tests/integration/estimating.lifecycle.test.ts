import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  EstimatingService,
  InMemoryFoundationStore,
  type UpsertEstimateLineInput,
} from "@eiep/api";
import { AuthorizationDeniedError } from "@eiep/rules-engine";
import { assignment, completeReadiness, context, scope, sequentialIds } from "../helpers/foundation-fixture.js";

const now = new Date("2026-07-21T12:00:00.000Z");
const organizationId = "org-epv";

function quoteHash(quoteNumber: string): string {
  return quoteNumber.replace(/[^a-f]/giu, "a").padEnd(64, "a").slice(0, 64).toLowerCase();
}

function seedQuoteSource(store: InMemoryFoundationStore, quoteNumber: string): Promise<void> {
  const id = `file-${quoteNumber}`;
  const sha256 = quoteHash(quoteNumber);
  return store.transaction((transaction) => transaction.insertGovernedFile({
    id, businessScopeOrganizationId: organizationId, projectId: null,
    storageKey: `organizations/${organizationId}/${id}`, originalFilename: `${quoteNumber}.pdf`,
    declaredMediaType: "application/pdf", detectedMediaType: "application/pdf", sha256, detectedSha256: sha256,
    sizeBytes: 128, validationState: "released", malwareState: "clean", validatorVersion: "fixture-validator-1",
    retentionClass: "commercial-quote", activeContentDetected: false, encryptedArchiveDetected: false, version: 3,
    uploadedAt: now, uploadedBy: "quote-uploader", validatedAt: now, validatedBy: "file-validator",
    releasedAt: now, releasedBy: "file-release-authority",
  }));
}

function access(userId: string, permissions: readonly string[], qualifications: readonly string[] = []) {
  return {
    context: context(userId, "step-up", qualifications, organizationId),
    assignments: [assignment(`${userId}-access`, userId, permissions, scope(null, null, organizationId), {}, organizationId)],
  };
}

async function configuredEstimate() {
  const store = new InMemoryFoundationStore();
  const service = new EstimatingService(store, () => now, sequentialIds("estimating"));
  const catalogEditor = access("catalog-editor", ["estimate.catalog.manage"]);
  const catalogReviewer = access("catalog-reviewer", ["estimate.catalog.approve"], ["estimating_authority"]);
  const assembly = await service.proposeAssembly(catalogEditor.context, catalogEditor.assignments, {
    businessScopeOrganizationId: organizationId, code: "PIPE-INSTALL", revision: "1",
    description: "Governed pipe installation assembly", costCode: "PIPING-INSTALL", unitCode: "EA",
    baseLaborHoursPerUnit: "2", laborRatePerHour: "50", materialUnitCost: "100",
    equipmentUnitCost: "10", subcontractUnitCost: "20", supersedesRevisionId: null,
  });
  const activeAssembly = await service.reviewAssembly(
    catalogReviewer.context, catalogReviewer.assignments, assembly.id, assembly.version, "approve", "Approved estimating basis.",
  );
  const factor = await service.proposeProductivityFactor(catalogEditor.context, catalogEditor.assignments, {
    businessScopeOrganizationId: organizationId, code: "CONGESTED", revision: "1", name: "Congested work area",
    multiplier: "1.25", sourceReference: "EST-BASIS-2026-01", justification: "Approved site-condition adjustment.",
    discipline: "PIPING", conditionCode: "CONGESTED", effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
    effectiveTo: new Date("2027-07-01T00:00:00.000Z"), supersedesRevisionId: null,
  });
  const activeFactor = await service.reviewProductivityFactor(
    catalogReviewer.context, catalogReviewer.assignments, factor.id, factor.version, "approve", "Source and applicability verified.",
  );
  const authorityPolicy = await service.proposeAuthorityPolicy(catalogEditor.context, catalogEditor.assignments, {
    businessScopeOrganizationId: organizationId, currency: "USD", revision: "1",
    standardEstimateApprovalLimit: "3000", standardQuoteSelectionLimit: "2600",
    standardProposalApprovalLimit: "3000", estimateAboveThresholdQualification: "EXECUTIVE_ESTIMATE_AUTHORITY",
    quoteAboveThresholdQualification: "EXECUTIVE_QUOTE_AUTHORITY",
    proposalAboveThresholdQualification: "EXECUTIVE_COMMERCIAL_AUTHORITY", supersedesRevisionId: null,
  });
  const activeAuthorityPolicy = await service.reviewAuthorityPolicy(
    catalogReviewer.context, catalogReviewer.assignments, authorityPolicy.id, authorityPolicy.version,
    "approve", "Commercial authority thresholds independently verified.",
  );
  const estimator = access("estimator", [
    "estimate.create", "estimate.read", "estimate.edit", "estimate.submit", "estimate.revise",
    "estimate.quote.manage", "estimate.proposal.generate",
  ]);
  const detail = await service.createEstimate(estimator.context, estimator.assignments, {
    businessScopeOrganizationId: organizationId, number: "EST-2026-001", name: "Controlled industrial estimate",
    customerOrganizationId: "org-customer", facilityId: "facility-1", opportunityReference: "INQUIRY-42",
    scopeStatement: "Defined piping fabrication and installation scope.", dueAt: new Date("2026-08-15T17:00:00.000Z"),
    originatingTimeZone: "America/Denver", currency: "USD", basisReferences: ["DRAWING-100-REV-0"],
    initialRevision: "A", assumptions: ["Normal shift pattern"], exclusions: ["Owner-supplied commissioning"],
    alternates: ["ALT-1 <script>alert(1)</script>"], contingencyPercent: "5", escalationPercent: "2", markupPercent: "10", taxPercent: "8",
  });
  const lineInput: UpsertEstimateLineInput = {
    lineKey: "PIPE-INSTALL-001", parentLineKey: null, sortOrder: 10, costCode: null,
    bidItemCode: "BASE", alternateCode: null, wbsCode: "WBS-PIPING", workPackageCode: "WP-PIPING",
    assemblyRevisionId: activeAssembly.id, description: "Install controlled pipe assembly", quantity: "10", unitCode: null,
    baseLaborHoursPerUnit: null, laborRatePerHour: null, materialUnitCost: null, equipmentUnitCost: null,
    subcontractUnitCost: null, allowanceCost: "50", otherCost: "25",
    productivityFactorRevisionIds: [activeFactor.id],
  };
  const line = await service.upsertLine(
    estimator.context, estimator.assignments, detail.revisions[0]!.id, null, null, lineInput,
  );
  return { store, service, estimator, detail, line, lineInput, activeAssembly, activeFactor, activeAuthorityPolicy };
}

test("FR-EST-001-005 / AC-11: governed assemblies and independently approved productivity produce an exact immutable estimate revision", async () => {
  const { store, service, estimator, detail, line, lineInput } = await configuredEstimate();
  assert.equal(line.calculation.productivityMultiplier, "1.25");
  assert.equal(line.calculation.adjustedLaborHours, "25");
  assert.equal(line.calculation.laborCost, "1250.00");
  assert.equal(line.calculation.materialCost, "1000.00");
  assert.equal(line.calculation.equipmentCost, "100.00");
  assert.equal(line.calculation.subcontractCost, "200.00");
  assert.equal(line.calculation.totalCost, "2625.00");
  assert.equal(line.productivityFactors[0]?.sourceReference, "EST-BASIS-2026-01");
  assert.equal(line.productivityFactors[0]?.approvedBy, "catalog-reviewer");

  const submitted = await service.submitRevision(
    estimator.context, estimator.assignments, detail.revisions[0]!.id, detail.revisions[0]!.version,
  );
  assert.deepEqual(submitted.totals, {
    version: "estimate-v1", currency: "USD", directCost: "2625.00", contingencyAmount: "131.25",
    escalationAmount: "52.50", markupAmount: "280.88", taxAmount: "247.17", finalPrice: "3336.80",
  });
  await assert.rejects(
    service.reviewRevision(
      context(estimator.context.userId, "step-up", ["estimating_authority"]),
      [assignment("self-review", estimator.context.userId, ["estimate.approve"], scope(null, null, organizationId))],
      submitted.id, submitted.version, "approve", "Self approval must fail.",
    ),
    (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "separation_of_duty",
  );
  const reviewer = access("estimate-reviewer", ["estimate.approve"], ["estimating_authority"]);
  await assert.rejects(
    service.reviewRevision(
      reviewer.context, reviewer.assignments, submitted.id, submitted.version, "approve", "Scope and basis verified.",
    ),
    (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "qualification_required",
  );
  const elevatedReviewer = access(
    "estimate-executive-reviewer", ["estimate.approve"], ["estimating_authority", "EXECUTIVE_ESTIMATE_AUTHORITY"],
  );
  const approved = await service.reviewRevision(
    elevatedReviewer.context, elevatedReviewer.assignments, submitted.id, submitted.version, "approve", "Scope and basis verified.",
  );
  assert.equal(approved.state, "approved");
  await assert.rejects(
    service.upsertLine(estimator.context, estimator.assignments, submitted.id, line.id, line.version, {
      ...lineInput, quantity: "11",
    }),
    /immutable/u,
  );
  assert.ok(store.snapshot().audits.some((audit) => audit.action === "estimate.revision_approved"));
});

test("FR-EST-002, FR-EST-006-008 / AC-11: quote comparison exposes gaps, enforces independent selection, and revisions retain exact deltas", async () => {
  const { store, service, estimator, detail, line, lineInput, activeAssembly, activeFactor } = await configuredEstimate();
  const second = await service.upsertLine(estimator.context, estimator.assignments, detail.revisions[0]!.id, null, null, {
    ...lineInput, lineKey: "PIPE-INSTALL-002", sortOrder: 20, description: "Second bid-scope item", quantity: "2",
  });
  const quoteInput = (vendor: string, quoteNumber: string, amount: string, includeSecond = true) => ({
    vendorOrganizationId: vendor, quoteNumber, sourceFileId: `file-${quoteNumber}`,
    sourceSha256: quoteHash(quoteNumber),
    currency: "USD", validUntil: new Date("2026-08-01T00:00:00.000Z"), inclusions: ["Mapped base scope"],
    exclusions: quoteNumber === "Q-3" ? ["Freight excluded"] : [], qualifications: ["Subject to final schedule"],
    freightAmount: "100", taxAmount: "50", lines: [
      { bidScopeLineKey: line.lineKey, description: "Primary scope", quantity: "10", unitCode: "EA", amount },
      ...(includeSecond ? [{ bidScopeLineKey: second.lineKey, description: "Secondary scope", quantity: "2", unitCode: "EA", amount: "500" }] : []),
    ],
  });
  await assert.rejects(
    service.receiveQuote(
      estimator.context, estimator.assignments, detail.revisions[0]!.id,
      quoteInput("vendor-missing-source", "Q-0", "2200"),
    ),
    /released organization-scoped file/u,
  );
  for (const quoteNumber of ["Q-1", "Q-2", "Q-3"]) await seedQuoteSource(store, quoteNumber);
  const quoteOne = await service.receiveQuote(
    estimator.context, estimator.assignments, detail.revisions[0]!.id, quoteInput("vendor-1", "Q-1", "2100"),
  );
  await service.receiveQuote(
    estimator.context, estimator.assignments, detail.revisions[0]!.id, quoteInput("vendor-2", "Q-2", "1900"),
  );
  const incomplete = await service.receiveQuote(
    estimator.context, estimator.assignments, detail.revisions[0]!.id, quoteInput("vendor-3", "Q-3", "1700", false),
  );
  const comparison = await service.quoteComparison(estimator.context, estimator.assignments, detail.revisions[0]!.id);
  assert.equal(comparison.length, 3);
  assert.deepEqual(comparison.find((quote) => quote.quoteId === incomplete.id)?.unresolvedScopeLineKeys, [second.lineKey]);
  const selector = access("quote-selector", ["estimate.quote.select"], ["estimating_authority"]);
  await assert.rejects(
    service.selectQuote(selector.context, selector.assignments, incomplete.id, incomplete.version, "Lowest price."),
    /Unresolved bid scope/u,
  );
  await assert.rejects(
    service.selectQuote(selector.context, selector.assignments, quoteOne.id, quoteOne.version, "Best evaluated complete scope."),
    (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "qualification_required",
  );
  const elevatedSelector = access(
    "executive-quote-selector", ["estimate.quote.select"], ["estimating_authority", "EXECUTIVE_QUOTE_AUTHORITY"],
  );
  const selected = await service.selectQuote(
    elevatedSelector.context, elevatedSelector.assignments, quoteOne.id, quoteOne.version, "Best evaluated complete scope.",
  );
  assert.equal(selected.state, "selected");

  const submitted = await service.submitRevision(
    estimator.context, estimator.assignments, detail.revisions[0]!.id, detail.revisions[0]!.version,
  );
  const reviewer = access(
    "estimate-reviewer", ["estimate.approve"], ["estimating_authority", "EXECUTIVE_ESTIMATE_AUTHORITY"],
  );
  await service.reviewRevision(reviewer.context, reviewer.assignments, submitted.id, submitted.version, "approve", "Approved baseline.");
  const current = (await service.estimateDetail(estimator.context, estimator.assignments, detail.estimate.id)).estimate;
  const revisionB = await service.createRevision(estimator.context, estimator.assignments, detail.estimate.id, current.version, {
    revision: "B", revisionReason: "Scope refinement", assumptions: ["Normal shift pattern"],
    exclusions: ["Owner-supplied commissioning"], alternates: ["ALT-1"], contingencyPercent: "5",
    escalationPercent: "2", markupPercent: "10", taxPercent: "8",
  });
  const cloned = (await service.estimateDetail(estimator.context, estimator.assignments, detail.estimate.id)).lines
    .filter((candidate) => candidate.revisionId === revisionB.id);
  const clonedFirst = cloned.find((candidate) => candidate.lineKey === line.lineKey)!;
  const clonedSecond = cloned.find((candidate) => candidate.lineKey === second.lineKey)!;
  await service.upsertLine(estimator.context, estimator.assignments, revisionB.id, clonedFirst.id, clonedFirst.version, {
    ...lineInput, lineKey: clonedFirst.lineKey, quantity: "12", assemblyRevisionId: activeAssembly.id,
    productivityFactorRevisionIds: [activeFactor.id],
  });
  await service.removeLine(estimator.context, estimator.assignments, clonedSecond.id, clonedSecond.version, "Removed from revised scope.");
  await service.upsertLine(estimator.context, estimator.assignments, revisionB.id, null, null, {
    ...lineInput, lineKey: "PIPE-INSTALL-003", sortOrder: 30, description: "Added revised item", quantity: "1",
    assemblyRevisionId: activeAssembly.id, productivityFactorRevisionIds: [activeFactor.id],
  });
  assert.deepEqual(await service.revisionDelta(estimator.context, estimator.assignments, revisionB.id), {
    addedLineKeys: ["PIPE-INSTALL-003"], removedLineKeys: ["PIPE-INSTALL-002"], changedLineKeys: ["PIPE-INSTALL-001"],
  });
});

test("FR-EST-002, FR-EST-008 / AC-11: rejection records the decision and permits a corrected controlled successor", async () => {
  const { service, estimator, detail } = await configuredEstimate();
  const submitted = await service.submitRevision(
    estimator.context, estimator.assignments, detail.revisions[0]!.id, detail.revisions[0]!.version,
  );
  const reviewer = access("estimate-reviewer", ["estimate.approve"], ["estimating_authority"]);
  const rejected = await service.reviewRevision(
    reviewer.context, reviewer.assignments, submitted.id, submitted.version, "reject", "Clarify the field execution basis.",
  );
  assert.equal(rejected.state, "rejected");
  assert.equal(rejected.reviewReason, "Clarify the field execution basis.");
  const current = (await service.estimateDetail(estimator.context, estimator.assignments, detail.estimate.id)).estimate;
  const corrected = await service.createRevision(estimator.context, estimator.assignments, current.id, current.version, {
    revision: "B", revisionReason: "Corrected field execution basis", assumptions: ["Normal shift pattern"],
    exclusions: ["Owner-supplied commissioning"], alternates: ["ALT-1"], contingencyPercent: "5",
    escalationPercent: "2", markupPercent: "10", taxPercent: "8",
  });
  assert.equal(corrected.parentRevisionId, rejected.id);
  assert.equal(corrected.state, "draft");
  assert.equal((await service.revisionDelta(estimator.context, estimator.assignments, corrected.id)).changedLineKeys.length, 0);
});

test("FR-EST-009-010 / AC-11: approved proposal freezes source hashes and reconciles an immutable award handoff", async () => {
  const { store, service, estimator, detail } = await configuredEstimate();
  const submitted = await service.submitRevision(
    estimator.context, estimator.assignments, detail.revisions[0]!.id, detail.revisions[0]!.version,
  );
  const reviewer = access(
    "estimate-reviewer", ["estimate.approve"], ["estimating_authority", "EXECUTIVE_ESTIMATE_AUTHORITY"],
  );
  const approved = await service.reviewRevision(
    reviewer.context, reviewer.assignments, submitted.id, submitted.version, "approve", "Approved for proposal.",
  );
  const proposal = await service.generateProposal(estimator.context, estimator.assignments, approved.id, {
    proposalNumber: "PROP-2026-001", validUntil: new Date("2026-08-31T00:00:00.000Z"),
    commercialTermsReferences: ["TERMS-2026-REV-1"],
  });
  assert.match(proposal.sourceCanonicalSha256, /^[0-9a-f]{64}$/u);
  assert.match(proposal.artifactManifestSha256, /^[0-9a-f]{64}$/u);
  assert.match(proposal.artifactSha256, /^[0-9a-f]{64}$/u);
  assert.equal(createHash("sha256").update(proposal.artifactContent).digest("hex"), proposal.artifactSha256);
  assert.match(proposal.artifactContent, /Controlled industrial estimate/u);
  assert.match(proposal.artifactContent, /USD 3336\.80/u);
  assert.doesNotMatch(proposal.artifactContent, /<script>/u);
  assert.match(proposal.artifactContent, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/u);
  const downloader = access("proposal-downloader", ["estimate.proposal.download"]);
  await assert.rejects(
    service.downloadProposal(downloader.context, downloader.assignments, proposal.id),
    /not found/u,
  );
  await assert.rejects(
    service.reviewProposal(
      context(estimator.context.userId, "step-up", ["commercial_authority"]),
      [assignment("self-proposal-review", estimator.context.userId, ["estimate.proposal.approve"], scope(null, null, organizationId))],
      proposal.id, proposal.version, "approve", "Self approval must fail.",
    ),
    (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "separation_of_duty",
  );
  const commercial = access("commercial-approver", ["estimate.proposal.approve"], ["commercial_authority"]);
  await assert.rejects(
    service.reviewProposal(
      commercial.context, commercial.assignments, proposal.id, proposal.version, "approve", "Commercial terms approved.",
    ),
    (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "qualification_required",
  );
  const elevatedCommercial = access(
    "executive-commercial-approver", ["estimate.proposal.approve"],
    ["commercial_authority", "EXECUTIVE_COMMERCIAL_AUTHORITY"],
  );
  const approvedProposal = await service.reviewProposal(
    elevatedCommercial.context, elevatedCommercial.assignments, proposal.id, proposal.version, "approve", "Commercial terms approved.",
  );
  const downloaded = await service.downloadProposal(downloader.context, downloader.assignments, proposal.id);
  assert.equal(downloaded.artifactContent, proposal.artifactContent);
  const issuer = access("proposal-issuer", ["estimate.proposal.issue"]);
  const issued = await service.issueProposal(issuer.context, issuer.assignments, proposal.id, approvedProposal.version);
  await store.transaction((transaction) => transaction.insertProject({
    id: "awarded-project", businessScopeOrganizationId: organizationId, number: "PRJ-2026-001", name: "Awarded project",
    customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "America/Denver", state: "draft",
    readiness: completeReadiness, version: 1, createdAt: now, createdBy: "project-admin", updatedAt: now, updatedBy: "project-admin",
  }));
  const controls = access("project-controls", ["estimate.handoff"], ["project_controls_authority"]);
  const handoff = await service.handoffProposal(controls.context, controls.assignments, issued.id, {
    projectId: "awarded-project", authorizationReference: "AWARD-2026-001",
    adjustmentCostCodes: { contingency: "CONTINGENCY", escalation: "ESCALATION", markup: "MARKUP", tax: "TAX" },
  });
  assert.equal(handoff.sourceTotal, "3336.80");
  assert.equal(handoff.mappedTotal, handoff.sourceTotal);
  assert.equal(handoff.reconciliationDifference, "0.00");
  assert.deepEqual(handoff.mappings.map((mapping) => mapping.category), [
    "direct_cost", "contingency", "escalation", "markup", "tax",
  ]);
  await assert.rejects(
    service.handoffProposal(controls.context, controls.assignments, issued.id, {
      projectId: "awarded-project", authorizationReference: "AWARD-2026-001",
      adjustmentCostCodes: { contingency: "CONTINGENCY", escalation: "ESCALATION", markup: "MARKUP", tax: "TAX" },
    }),
    /already handed off/u,
  );
  assert.ok(store.snapshot().audits.some((audit) => audit.action === "estimate.handoff_completed" && audit.projectId === "awarded-project"));
});
