import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type {
  AccessContext,
  AuditEvent,
  EstimateAssemblyRevisionRecord,
  EstimateAuthorityPolicyRevisionRecord,
  EstimateHandoffRecord,
  EstimateLineCalculation,
  EstimateLineRecord,
  EstimateProductivityFactorRevisionRecord,
  EstimateProposalRecord,
  EstimateQuoteLine,
  EstimateQuoteRecord,
  EstimateRecord,
  EstimateRevisionRecord,
  EstimateRevisionTotals,
  RoleAssignment,
} from "@eiep/shared-types";
import {
  canonicalTimeZone,
  parseControlledDecimal,
  requireAuthorization,
  unitDefinition,
} from "@eiep/rules-engine";
import { ConflictError, NotFoundError, ValidationError } from "./errors.js";
import type { FoundationStore, FoundationTransaction } from "./foundation-store.js";

type Clock = () => Date;
type IdFactory = () => string;

const decimalScale = 6;
const decimalBase = 10n ** BigInt(decimalScale);
const centsBase = 100n;

export interface CreateEstimateInput {
  readonly businessScopeOrganizationId: string;
  readonly number: string;
  readonly name: string;
  readonly customerOrganizationId: string;
  readonly facilityId: string;
  readonly opportunityReference: string | null;
  readonly scopeStatement: string;
  readonly dueAt: Date;
  readonly originatingTimeZone: string;
  readonly currency: string;
  readonly basisReferences: readonly string[];
  readonly initialRevision: string;
  readonly assumptions: readonly string[];
  readonly exclusions: readonly string[];
  readonly alternates: readonly string[];
  readonly contingencyPercent: string;
  readonly escalationPercent: string;
  readonly markupPercent: string;
  readonly taxPercent: string;
}

export interface ProposeEstimateAssemblyInput {
  readonly businessScopeOrganizationId: string;
  readonly code: string;
  readonly revision: string;
  readonly description: string;
  readonly costCode: string;
  readonly unitCode: string;
  readonly baseLaborHoursPerUnit: string;
  readonly laborRatePerHour: string;
  readonly materialUnitCost: string;
  readonly equipmentUnitCost: string;
  readonly subcontractUnitCost: string;
  readonly supersedesRevisionId: string | null;
}

export interface ProposeProductivityFactorInput {
  readonly businessScopeOrganizationId: string;
  readonly code: string;
  readonly revision: string;
  readonly name: string;
  readonly multiplier: string;
  readonly sourceReference: string;
  readonly justification: string;
  readonly discipline: string;
  readonly conditionCode: string;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  readonly supersedesRevisionId: string | null;
}

export interface ProposeEstimateAuthorityPolicyInput {
  readonly businessScopeOrganizationId: string;
  readonly currency: string;
  readonly revision: string;
  readonly standardEstimateApprovalLimit: string;
  readonly standardQuoteSelectionLimit: string;
  readonly standardProposalApprovalLimit: string;
  readonly estimateAboveThresholdQualification: string;
  readonly quoteAboveThresholdQualification: string;
  readonly proposalAboveThresholdQualification: string;
  readonly supersedesRevisionId: string | null;
}

export interface UpsertEstimateLineInput {
  readonly lineKey: string | null;
  readonly parentLineKey: string | null;
  readonly sortOrder: number;
  readonly costCode: string | null;
  readonly bidItemCode: string | null;
  readonly alternateCode: string | null;
  readonly wbsCode: string | null;
  readonly workPackageCode: string | null;
  readonly assemblyRevisionId: string | null;
  readonly description: string;
  readonly quantity: string;
  readonly unitCode: string | null;
  readonly baseLaborHoursPerUnit: string | null;
  readonly laborRatePerHour: string | null;
  readonly materialUnitCost: string | null;
  readonly equipmentUnitCost: string | null;
  readonly subcontractUnitCost: string | null;
  readonly allowanceCost: string;
  readonly otherCost: string;
  readonly productivityFactorRevisionIds: readonly string[];
}

export interface CreateEstimateRevisionInput {
  readonly revision: string;
  readonly revisionReason: string;
  readonly assumptions: readonly string[];
  readonly exclusions: readonly string[];
  readonly alternates: readonly string[];
  readonly contingencyPercent: string;
  readonly escalationPercent: string;
  readonly markupPercent: string;
  readonly taxPercent: string;
}

export interface ReceiveEstimateQuoteInput {
  readonly vendorOrganizationId: string;
  readonly quoteNumber: string;
  readonly sourceFileId: string;
  readonly sourceSha256: string;
  readonly currency: string;
  readonly validUntil: Date;
  readonly inclusions: readonly string[];
  readonly exclusions: readonly string[];
  readonly qualifications: readonly string[];
  readonly freightAmount: string;
  readonly taxAmount: string;
  readonly lines: readonly Omit<EstimateQuoteLine, "id">[];
}

export interface GenerateEstimateProposalInput {
  readonly proposalNumber: string;
  readonly validUntil: Date;
  readonly commercialTermsReferences: readonly string[];
}

export interface EstimateHandoffInput {
  readonly projectId: string;
  readonly authorizationReference: string;
  readonly adjustmentCostCodes: {
    readonly contingency: string;
    readonly escalation: string;
    readonly markup: string;
    readonly tax: string;
  };
}

export interface EstimateDetail {
  readonly estimate: EstimateRecord;
  readonly revisions: readonly EstimateRevisionRecord[];
  readonly lines: readonly EstimateLineRecord[];
  readonly quotes: readonly EstimateQuoteRecord[];
  readonly proposals: readonly EstimateProposalRecord[];
  readonly handoffs: readonly EstimateHandoffRecord[];
}

export interface EstimateRevisionDelta {
  readonly addedLineKeys: readonly string[];
  readonly removedLineKeys: readonly string[];
  readonly changedLineKeys: readonly string[];
}

export interface EstimateQuoteComparison {
  readonly quoteId: string;
  readonly vendorOrganizationId: string;
  readonly quoteNumber: string;
  readonly normalizedTotal: string;
  readonly currency: string;
  readonly validUntil: Date;
  readonly expired: boolean;
  readonly unresolvedScopeLineKeys: readonly string[];
  readonly exclusions: readonly string[];
  readonly qualifications: readonly string[];
  readonly state: EstimateQuoteRecord["state"];
}

function required(value: string, field: string, maximum = 4_000): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || /[\u0000\r\n]/u.test(normalized)) {
    throw new ValidationError(`${field} is invalid.`, [`${field}_invalid`]);
  }
  return normalized;
}

function optional(value: string | null, field: string, maximum = 256): string | null {
  if (value === null) return null;
  return required(value, field, maximum);
}

function code(value: string, field: string): string {
  const normalized = required(value, field, 64).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_.-]{0,63}$/u.test(normalized)) {
    throw new ValidationError(`${field} is invalid.`, [`${field}_invalid`]);
  }
  return normalized;
}

function currency(value: string): string {
  const normalized = required(value, "currency", 3).toUpperCase();
  if (!/^[A-Z]{3}$/u.test(normalized)) throw new ValidationError("currency is invalid.", ["currency_invalid"]);
  return normalized;
}

function strings(values: readonly string[], field: string, requiredCount = false): readonly string[] {
  const normalized = values.map((value) => required(value, field, 2_000));
  if (requiredCount && normalized.length === 0) throw new ValidationError(`${field} is required.`, [`${field}_required`]);
  if (new Set(normalized).size !== normalized.length) throw new ValidationError(`${field} contains duplicates.`, [`${field}_duplicate`]);
  return normalized;
}

function date(value: Date, field: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new ValidationError(`${field} is invalid.`, [`${field}_invalid`]);
  }
  return new Date(value);
}

function decimal(value: string, field: string, allowZero = true): bigint {
  const parsed = parseControlledDecimal(value, { allowZero, maximumScale: decimalScale, maximumIntegerDigits: 12 });
  if (!parsed) throw new ValidationError(`${field} is invalid.`, [`${field}_invalid`]);
  return parsed.coefficient * 10n ** BigInt(decimalScale - parsed.scale);
}

function percentage(value: string, field: string): bigint {
  const parsed = decimal(value, field);
  if (parsed > 1_000n * decimalBase) {
    throw new ValidationError(`${field} exceeds the controlled maximum.`, [`${field}_invalid`]);
  }
  return parsed;
}

function money(value: string, field: string): bigint {
  const parsed = parseControlledDecimal(value, { allowZero: true, maximumScale: 2, maximumIntegerDigits: 14 });
  if (!parsed) throw new ValidationError(`${field} is invalid.`, [`${field}_invalid`]);
  return parsed.coefficient * 10n ** BigInt(2 - parsed.scale);
}

function roundDivide(value: bigint, denominator: bigint): bigint {
  return (value + denominator / 2n) / denominator;
}

function multiplyDecimal(left: bigint, right: bigint): bigint {
  return roundDivide(left * right, decimalBase);
}

function multiplyMoney(left: bigint, right: bigint): bigint {
  return roundDivide(left * right, decimalBase * 10_000n);
}

function percentMoney(amount: bigint, rate: bigint): bigint {
  return roundDivide(amount * rate, 100n * decimalBase);
}

function formatDecimal(value: bigint): string {
  const integer = value / decimalBase;
  const fraction = (value % decimalBase).toString().padStart(decimalScale, "0").replace(/0+$/u, "");
  return fraction ? `${integer}.${fraction}` : integer.toString();
}

function formatMoney(value: bigint): string {
  return `${value / centsBase}.${(value % centsBase).toString().padStart(2, "0")}`;
}

function zeroTotals(isoCurrency: string): EstimateRevisionTotals {
  return {
    version: "estimate-v1", currency: isoCurrency, directCost: "0.00", contingencyAmount: "0.00",
    escalationAmount: "0.00", markupAmount: "0.00", taxAmount: "0.00", finalPrice: "0.00",
  };
}

function calculateLine(input: {
  readonly quantity: string;
  readonly baseLaborHoursPerUnit: string;
  readonly laborRatePerHour: string;
  readonly materialUnitCost: string;
  readonly equipmentUnitCost: string;
  readonly subcontractUnitCost: string;
  readonly allowanceCost: string;
  readonly otherCost: string;
  readonly factorMultipliers: readonly string[];
}): EstimateLineCalculation {
  const quantity = decimal(input.quantity, "quantity", false);
  const baseHours = decimal(input.baseLaborHoursPerUnit, "baseLaborHoursPerUnit");
  const laborRate = decimal(input.laborRatePerHour, "laborRatePerHour");
  const materialUnitCost = decimal(input.materialUnitCost, "materialUnitCost");
  const equipmentUnitCost = decimal(input.equipmentUnitCost, "equipmentUnitCost");
  const subcontractUnitCost = decimal(input.subcontractUnitCost, "subcontractUnitCost");
  let factor = decimal("1", "productivityMultiplier", false);
  for (const value of input.factorMultipliers) factor = multiplyDecimal(factor, decimal(value, "factorMultiplier", false));
  const adjustedLaborHours = multiplyDecimal(multiplyDecimal(quantity, baseHours), factor);
  const laborCost = multiplyMoney(adjustedLaborHours, laborRate);
  const materialCost = multiplyMoney(quantity, materialUnitCost);
  const equipmentCost = multiplyMoney(quantity, equipmentUnitCost);
  const subcontractCost = multiplyMoney(quantity, subcontractUnitCost);
  const allowanceCost = money(input.allowanceCost, "allowanceCost");
  const otherCost = money(input.otherCost, "otherCost");
  return {
    version: "estimate-v1",
    productivityMultiplier: formatDecimal(factor),
    adjustedLaborHours: formatDecimal(adjustedLaborHours),
    laborCost: formatMoney(laborCost),
    materialCost: formatMoney(materialCost),
    equipmentCost: formatMoney(equipmentCost),
    subcontractCost: formatMoney(subcontractCost),
    allowanceCost: formatMoney(allowanceCost),
    otherCost: formatMoney(otherCost),
    totalCost: formatMoney(laborCost + materialCost + equipmentCost + subcontractCost + allowanceCost + otherCost),
  };
}

function calculateTotals(revision: EstimateRevisionRecord, lines: readonly EstimateLineRecord[], isoCurrency: string): EstimateRevisionTotals {
  const direct = lines.filter((line) => line.state === "active")
    .reduce((total, line) => total + money(line.calculation.totalCost, "lineTotal"), 0n);
  const contingency = percentMoney(direct, percentage(revision.contingencyPercent, "contingencyPercent"));
  const escalation = percentMoney(direct, percentage(revision.escalationPercent, "escalationPercent"));
  const markupBasis = direct + contingency + escalation;
  const markup = percentMoney(markupBasis, percentage(revision.markupPercent, "markupPercent"));
  const taxBasis = markupBasis + markup;
  const tax = percentMoney(taxBasis, percentage(revision.taxPercent, "taxPercent"));
  return {
    version: "estimate-v1", currency: isoCurrency, directCost: formatMoney(direct),
    contingencyAmount: formatMoney(contingency), escalationAmount: formatMoney(escalation),
    markupAmount: formatMoney(markup), taxAmount: formatMoney(tax), finalPrice: formatMoney(taxBasis + tax),
  };
}

function canonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map((entry) => canonical(entry)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function proposalArtifact(input: {
  readonly estimate: EstimateRecord;
  readonly revision: EstimateRevisionRecord;
  readonly lines: readonly EstimateLineRecord[];
  readonly proposalNumber: string;
  readonly validUntil: Date;
  readonly commercialTermsReferences: readonly string[];
  readonly sourceCanonicalSha256: string;
}): string {
  const list = (values: readonly string[]) => values.length
    ? `<ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>`
    : "<p>None stated.</p>";
  const lineRows = [...input.lines].sort((left, right) => left.sortOrder - right.sortOrder)
    .map((line) => `<tr><td>${escapeHtml(line.lineKey)}</td><td>${escapeHtml(line.description)}</td>`
      + `<td>${escapeHtml(line.quantity)} ${escapeHtml(line.unitCode)}</td><td>${escapeHtml(line.costCode)}</td>`
      + `<td class="amount">${escapeHtml(line.calculation.totalCost)}</td></tr>`).join("");
  const totals = input.revision.totals;
  return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">"
    + `<title>${escapeHtml(input.proposalNumber)} · ${escapeHtml(input.estimate.name)}</title>`
    + "<style>@page{size:letter;margin:.65in}body{font:11pt Arial,sans-serif;color:#17252b;line-height:1.4}"
    + "header{border-bottom:3px solid #0d6068;margin-bottom:18px;padding-bottom:12px}h1{margin:0;font-size:24pt}"
    + "h2{font-size:13pt;color:#0d6068;margin-top:20px}table{width:100%;border-collapse:collapse}"
    + "th,td{padding:7px;border-bottom:1px solid #ccd7d5;text-align:left}.amount{text-align:right;font-variant-numeric:tabular-nums}"
    + ".totals{margin-left:auto;width:300px}.totals th{text-align:left}.totals td{text-align:right}.final{font-weight:bold;background:#e5f4ec}"
    + ".hash{font:8pt Consolas,monospace;overflow-wrap:anywhere;color:#53666b}footer{margin-top:28px;border-top:1px solid #ccd7d5;padding-top:10px;color:#53666b}"
    + "</style></head><body>"
    + `<header><p>EPV Industrial Enterprise Platform · Controlled proposal</p><h1>${escapeHtml(input.proposalNumber)}</h1>`
    + `<p>${escapeHtml(input.estimate.name)} · Estimate ${escapeHtml(input.estimate.number)} · Revision ${escapeHtml(input.revision.revision)}</p></header>`
    + `<dl><dt>Customer organization</dt><dd>${escapeHtml(input.estimate.customerOrganizationId)}</dd>`
    + `<dt>Facility</dt><dd>${escapeHtml(input.estimate.facilityId)}</dd><dt>Valid through</dt><dd>${escapeHtml(input.validUntil.toISOString())}</dd>`
    + `<dt>Currency</dt><dd>${escapeHtml(input.estimate.currency)}</dd></dl>`
    + `<h2>Scope</h2><p>${escapeHtml(input.estimate.scopeStatement)}</p>`
    + `<h2>Priced scope</h2><table><thead><tr><th>Line</th><th>Description</th><th>Quantity</th><th>Cost code</th><th class="amount">Direct cost</th></tr></thead><tbody>${lineRows}</tbody></table>`
    + `<table class="totals"><tbody><tr><th>Direct cost</th><td>${escapeHtml(totals.directCost)}</td></tr>`
    + `<tr><th>Contingency</th><td>${escapeHtml(totals.contingencyAmount)}</td></tr><tr><th>Escalation</th><td>${escapeHtml(totals.escalationAmount)}</td></tr>`
    + `<tr><th>Markup</th><td>${escapeHtml(totals.markupAmount)}</td></tr><tr><th>Tax</th><td>${escapeHtml(totals.taxAmount)}</td></tr>`
    + `<tr class="final"><th>Total proposal price</th><td>${escapeHtml(totals.currency)} ${escapeHtml(totals.finalPrice)}</td></tr></tbody></table>`
    + `<h2>Assumptions</h2>${list(input.revision.assumptions)}<h2>Exclusions</h2>${list(input.revision.exclusions)}`
    + `<h2>Alternates</h2>${list(input.revision.alternates)}<h2>Commercial terms references</h2>${list(input.commercialTermsReferences)}`
    + `<footer><p>Generated from an immutable approved estimate revision. Source SHA-256:</p><p class="hash">${input.sourceCanonicalSha256}</p>`
    + "<p>Approval and issue status must be verified in EIEP. A printed or downloaded copy is uncontrolled after its recorded issue context.</p></footer>"
    + "</body></html>";
}

function scope(organizationId: string, objectId: string | null, projectId: string | null = null) {
  return { organizationId, projectId, workPackageId: null, objectId };
}

function event(
  idFactory: IdFactory,
  occurredAt: Date,
  context: AccessContext,
  input: Omit<AuditEvent, "id" | "occurredAt" | "actorUserId" | "actingOrganizationId" | "correlationId" | "canonicalSha256">,
): AuditEvent {
  const payload = {
    actorUserId: context.userId,
    actingOrganizationId: context.actingOrganizationId,
    projectId: input.projectId,
    action: input.action,
    objectType: input.objectType,
    objectId: input.objectId,
    priorState: input.priorState,
    newState: input.newState,
    reason: input.reason,
    correlationId: context.correlationId,
    changedFields: input.changedFields,
  };
  return { id: idFactory(), occurredAt, ...payload, canonicalSha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
}

function lineBusinessValue(line: EstimateLineRecord) {
  const { id: _id, revisionId: _revisionId, version: _version, createdAt: _createdAt, createdBy: _createdBy,
    updatedAt: _updatedAt, updatedBy: _updatedBy, ...business } = line;
  return business;
}

export class EstimatingService {
  public constructor(
    private readonly store: FoundationStore,
    private readonly clock: Clock = () => new Date(),
    private readonly idFactory: IdFactory = randomUUID,
  ) {}

  public proposeAssembly(
    context: AccessContext, assignments: readonly RoleAssignment[], input: ProposeEstimateAssemblyInput,
  ): Promise<EstimateAssemblyRevisionRecord> {
    const now = this.clock();
    requireAuthorization(context, assignments, {
      action: "estimate.catalog.manage", resource: scope(input.businessScopeOrganizationId, null),
      requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
    }, now);
    const unit = unitDefinition(input.unitCode);
    if (!unit) throw new ValidationError("unitCode is not controlled.", ["unit_code_invalid"]);
    const assembly: EstimateAssemblyRevisionRecord = {
      id: this.idFactory(), businessScopeOrganizationId: required(input.businessScopeOrganizationId, "businessScopeOrganizationId", 128),
      code: code(input.code, "code"), revision: code(input.revision, "revision"),
      description: required(input.description, "description"), costCode: code(input.costCode, "costCode"), unitCode: unit.code,
      baseLaborHoursPerUnit: formatDecimal(decimal(input.baseLaborHoursPerUnit, "baseLaborHoursPerUnit")),
      laborRatePerHour: formatDecimal(decimal(input.laborRatePerHour, "laborRatePerHour")),
      materialUnitCost: formatDecimal(decimal(input.materialUnitCost, "materialUnitCost")),
      equipmentUnitCost: formatDecimal(decimal(input.equipmentUnitCost, "equipmentUnitCost")),
      subcontractUnitCost: formatDecimal(decimal(input.subcontractUnitCost, "subcontractUnitCost")),
      state: "under_review", supersedesRevisionId: input.supersedesRevisionId,
      proposedAt: now, proposedBy: context.userId, reviewedAt: null, reviewedBy: null, reviewReason: null, version: 1,
    };
    return this.store.transaction((transaction) => {
      const active = transaction.estimateAssemblies(assembly.businessScopeOrganizationId, assembly.code)
        .find((candidate) => candidate.state === "active") ?? null;
      if ((active?.id ?? null) !== assembly.supersedesRevisionId) {
        throw new ConflictError("The assembly must identify the exact active revision it supersedes.");
      }
      transaction.insertEstimateAssembly(assembly);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: null, action: "estimate.assembly_proposed", objectType: "estimate_assembly_revision",
        objectId: assembly.id, priorState: null, newState: assembly.state, reason: null,
        changedFields: { code: assembly.code, revision: assembly.revision, costCode: assembly.costCode, unitCode: assembly.unitCode },
      }));
      return assembly;
    });
  }

  public reviewAssembly(
    context: AccessContext, assignments: readonly RoleAssignment[], assemblyId: string,
    expectedVersion: number, decision: "approve" | "reject", reason: string,
  ): Promise<EstimateAssemblyRevisionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const assembly = transaction.estimateAssemblyById(assemblyId);
      if (!assembly) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "estimate.catalog.approve", resource: scope(assembly.businessScopeOrganizationId, assembly.id),
        requiredQualifications: ["estimating_authority"], forbiddenActorIds: [assembly.proposedBy], minimumAssurance: "step-up",
      }, now);
      if (assembly.version !== expectedVersion) throw new ConflictError();
      if (assembly.state !== "under_review") throw new ValidationError("The assembly is not under review.", ["assembly_state_invalid"]);
      if (decision === "approve" && assembly.supersedesRevisionId) {
        const prior = transaction.estimateAssemblyById(assembly.supersedesRevisionId);
        if (!prior || prior.state !== "active") throw new ConflictError("The superseded assembly is no longer active.");
        transaction.updateEstimateAssembly({ ...prior, state: "superseded", version: prior.version + 1 }, prior.version);
      }
      const reviewed: EstimateAssemblyRevisionRecord = {
        ...assembly, state: decision === "approve" ? "active" : "rejected", reviewedAt: now,
        reviewedBy: context.userId, reviewReason: required(reason, "reason"), version: assembly.version + 1,
      };
      transaction.updateEstimateAssembly(reviewed, expectedVersion);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: null, action: `estimate.assembly_${decision === "approve" ? "approved" : "rejected"}`,
        objectType: "estimate_assembly_revision", objectId: assembly.id, priorState: assembly.state,
        newState: reviewed.state, reason: reviewed.reviewReason, changedFields: { state: reviewed.state },
      }));
      return reviewed;
    });
  }

  public listAssemblies(
    context: AccessContext, assignments: readonly RoleAssignment[], codeFilter?: string,
  ): Promise<readonly EstimateAssemblyRevisionRecord[]> {
    const now = this.clock();
    requireAuthorization(context, assignments, {
      action: "estimate.read", resource: scope(context.actingOrganizationId, null), requiredQualifications: [],
      forbiddenActorIds: [], minimumAssurance: "standard",
    }, now);
    return this.store.transaction((transaction) => transaction.estimateAssemblies(
      context.actingOrganizationId, codeFilter ? code(codeFilter, "code") : undefined,
    ));
  }

  public proposeProductivityFactor(
    context: AccessContext, assignments: readonly RoleAssignment[], input: ProposeProductivityFactorInput,
  ): Promise<EstimateProductivityFactorRevisionRecord> {
    const now = this.clock();
    requireAuthorization(context, assignments, {
      action: "estimate.catalog.manage", resource: scope(input.businessScopeOrganizationId, null),
      requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
    }, now);
    const effectiveFrom = date(input.effectiveFrom, "effectiveFrom");
    const effectiveTo = input.effectiveTo ? date(input.effectiveTo, "effectiveTo") : null;
    if (effectiveTo && effectiveTo.getTime() <= effectiveFrom.getTime()) {
      throw new ValidationError("The factor effective interval is invalid.", ["factor_effective_interval_invalid"]);
    }
    const multiplier = decimal(input.multiplier, "multiplier", false);
    if (multiplier > 100n * decimalBase) throw new ValidationError("multiplier is too large.", ["multiplier_invalid"]);
    const factor: EstimateProductivityFactorRevisionRecord = {
      id: this.idFactory(), businessScopeOrganizationId: required(input.businessScopeOrganizationId, "businessScopeOrganizationId", 128),
      code: code(input.code, "code"), revision: code(input.revision, "revision"), name: required(input.name, "name", 200),
      multiplier: formatDecimal(multiplier), sourceReference: required(input.sourceReference, "sourceReference", 512),
      justification: required(input.justification, "justification", 2_000), discipline: code(input.discipline, "discipline"),
      conditionCode: code(input.conditionCode, "conditionCode"), effectiveFrom, effectiveTo,
      state: "under_review", supersedesRevisionId: input.supersedesRevisionId,
      proposedAt: now, proposedBy: context.userId, reviewedAt: null, reviewedBy: null, reviewReason: null, version: 1,
    };
    return this.store.transaction((transaction) => {
      const active = transaction.estimateProductivityFactors(factor.businessScopeOrganizationId, factor.code)
        .find((candidate) => candidate.state === "active") ?? null;
      if ((active?.id ?? null) !== factor.supersedesRevisionId) {
        throw new ConflictError("The factor must identify the exact active revision it supersedes.");
      }
      transaction.insertEstimateProductivityFactor(factor);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: null, action: "estimate.productivity_factor_proposed", objectType: "estimate_productivity_factor_revision",
        objectId: factor.id, priorState: null, newState: factor.state, reason: factor.justification,
        changedFields: { code: factor.code, revision: factor.revision, multiplier: factor.multiplier,
          discipline: factor.discipline, conditionCode: factor.conditionCode },
      }));
      return factor;
    });
  }

  public reviewProductivityFactor(
    context: AccessContext, assignments: readonly RoleAssignment[], factorId: string,
    expectedVersion: number, decision: "approve" | "reject", reason: string,
  ): Promise<EstimateProductivityFactorRevisionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const factor = transaction.estimateProductivityFactorById(factorId);
      if (!factor) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "estimate.catalog.approve", resource: scope(factor.businessScopeOrganizationId, factor.id),
        requiredQualifications: ["estimating_authority"], forbiddenActorIds: [factor.proposedBy], minimumAssurance: "step-up",
      }, now);
      if (factor.version !== expectedVersion) throw new ConflictError();
      if (factor.state !== "under_review") throw new ValidationError("The factor is not under review.", ["factor_state_invalid"]);
      if (decision === "approve" && factor.supersedesRevisionId) {
        const prior = transaction.estimateProductivityFactorById(factor.supersedesRevisionId);
        if (!prior || prior.state !== "active") throw new ConflictError("The superseded factor is no longer active.");
        transaction.updateEstimateProductivityFactor({ ...prior, state: "superseded", version: prior.version + 1 }, prior.version);
      }
      const reviewed: EstimateProductivityFactorRevisionRecord = {
        ...factor, state: decision === "approve" ? "active" : "rejected", reviewedAt: now,
        reviewedBy: context.userId, reviewReason: required(reason, "reason"), version: factor.version + 1,
      };
      transaction.updateEstimateProductivityFactor(reviewed, expectedVersion);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: null, action: `estimate.productivity_factor_${decision === "approve" ? "approved" : "rejected"}`,
        objectType: "estimate_productivity_factor_revision", objectId: factor.id, priorState: factor.state,
        newState: reviewed.state, reason: reviewed.reviewReason, changedFields: { state: reviewed.state },
      }));
      return reviewed;
    });
  }

  public listProductivityFactors(
    context: AccessContext, assignments: readonly RoleAssignment[], codeFilter?: string,
  ): Promise<readonly EstimateProductivityFactorRevisionRecord[]> {
    const now = this.clock();
    requireAuthorization(context, assignments, {
      action: "estimate.read", resource: scope(context.actingOrganizationId, null), requiredQualifications: [],
      forbiddenActorIds: [], minimumAssurance: "standard",
    }, now);
    return this.store.transaction((transaction) => transaction.estimateProductivityFactors(
      context.actingOrganizationId, codeFilter ? code(codeFilter, "code") : undefined,
    ));
  }

  public proposeAuthorityPolicy(
    context: AccessContext, assignments: readonly RoleAssignment[], input: ProposeEstimateAuthorityPolicyInput,
  ): Promise<EstimateAuthorityPolicyRevisionRecord> {
    const now = this.clock();
    const organizationId = required(input.businessScopeOrganizationId, "businessScopeOrganizationId", 128);
    requireAuthorization(context, assignments, {
      action: "estimate.catalog.manage", resource: scope(organizationId, null), requiredQualifications: [],
      forbiddenActorIds: [], minimumAssurance: "mfa",
    }, now);
    const isoCurrency = currency(input.currency);
    const policy: EstimateAuthorityPolicyRevisionRecord = {
      id: this.idFactory(), businessScopeOrganizationId: organizationId, currency: isoCurrency,
      revision: code(input.revision, "revision"),
      standardEstimateApprovalLimit: formatMoney(money(input.standardEstimateApprovalLimit, "standardEstimateApprovalLimit")),
      standardQuoteSelectionLimit: formatMoney(money(input.standardQuoteSelectionLimit, "standardQuoteSelectionLimit")),
      standardProposalApprovalLimit: formatMoney(money(input.standardProposalApprovalLimit, "standardProposalApprovalLimit")),
      estimateAboveThresholdQualification: code(input.estimateAboveThresholdQualification, "estimateAboveThresholdQualification"),
      quoteAboveThresholdQualification: code(input.quoteAboveThresholdQualification, "quoteAboveThresholdQualification"),
      proposalAboveThresholdQualification: code(input.proposalAboveThresholdQualification, "proposalAboveThresholdQualification"),
      state: "under_review", supersedesRevisionId: input.supersedesRevisionId,
      proposedAt: now, proposedBy: context.userId, reviewedAt: null, reviewedBy: null, reviewReason: null, version: 1,
    };
    return this.store.transaction((transaction) => {
      const active = transaction.estimateAuthorityPolicies(organizationId, isoCurrency)
        .find((candidate) => candidate.state === "active") ?? null;
      if ((active?.id ?? null) !== policy.supersedesRevisionId) {
        throw new ConflictError("The authority policy must identify the exact active revision it supersedes.");
      }
      transaction.insertEstimateAuthorityPolicy(policy);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: null, action: "estimate.authority_policy_proposed", objectType: "estimate_authority_policy_revision",
        objectId: policy.id, priorState: null, newState: policy.state, reason: null,
        changedFields: { currency: policy.currency, revision: policy.revision,
          standardEstimateApprovalLimit: policy.standardEstimateApprovalLimit,
          standardQuoteSelectionLimit: policy.standardQuoteSelectionLimit,
          standardProposalApprovalLimit: policy.standardProposalApprovalLimit },
      }));
      return policy;
    });
  }

  public reviewAuthorityPolicy(
    context: AccessContext, assignments: readonly RoleAssignment[], policyId: string,
    expectedVersion: number, decision: "approve" | "reject", reason: string,
  ): Promise<EstimateAuthorityPolicyRevisionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const policy = transaction.estimateAuthorityPolicyById(policyId);
      if (!policy) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "estimate.catalog.approve", resource: scope(policy.businessScopeOrganizationId, policy.id),
        requiredQualifications: ["estimating_authority"], forbiddenActorIds: [policy.proposedBy], minimumAssurance: "step-up",
      }, now);
      if (policy.version !== expectedVersion) throw new ConflictError();
      if (policy.state !== "under_review") throw new ValidationError("The authority policy is not under review.", ["authority_policy_state_invalid"]);
      if (decision === "approve" && policy.supersedesRevisionId) {
        const prior = transaction.estimateAuthorityPolicyById(policy.supersedesRevisionId);
        if (!prior || prior.state !== "active") throw new ConflictError("The superseded authority policy is no longer active.");
        transaction.updateEstimateAuthorityPolicy({ ...prior, state: "superseded", version: prior.version + 1 }, prior.version);
      }
      const reviewed: EstimateAuthorityPolicyRevisionRecord = {
        ...policy, state: decision === "approve" ? "active" : "rejected", reviewedAt: now,
        reviewedBy: context.userId, reviewReason: required(reason, "reason"), version: policy.version + 1,
      };
      transaction.updateEstimateAuthorityPolicy(reviewed, expectedVersion);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: null, action: `estimate.authority_policy_${decision === "approve" ? "approved" : "rejected"}`,
        objectType: "estimate_authority_policy_revision", objectId: policy.id, priorState: policy.state,
        newState: reviewed.state, reason: reviewed.reviewReason, changedFields: { currency: policy.currency, revision: policy.revision },
      }));
      return reviewed;
    });
  }

  public listAuthorityPolicies(
    context: AccessContext, assignments: readonly RoleAssignment[], currencyFilter?: string,
  ): Promise<readonly EstimateAuthorityPolicyRevisionRecord[]> {
    const now = this.clock();
    requireAuthorization(context, assignments, {
      action: "estimate.read", resource: scope(context.actingOrganizationId, null), requiredQualifications: [],
      forbiddenActorIds: [], minimumAssurance: "standard",
    }, now);
    return this.store.transaction((transaction) => transaction.estimateAuthorityPolicies(
      context.actingOrganizationId, currencyFilter ? currency(currencyFilter) : undefined,
    ));
  }

  public createEstimate(
    context: AccessContext, assignments: readonly RoleAssignment[], input: CreateEstimateInput,
  ): Promise<EstimateDetail> {
    const now = this.clock();
    const organizationId = required(input.businessScopeOrganizationId, "businessScopeOrganizationId", 128);
    requireAuthorization(context, assignments, {
      action: "estimate.create", resource: scope(organizationId, null), requiredQualifications: [],
      forbiddenActorIds: [], minimumAssurance: "mfa",
    }, now);
    const dueAt = date(input.dueAt, "dueAt");
    if (dueAt.getTime() <= now.getTime()) throw new ValidationError("dueAt must be in the future.", ["due_at_invalid"]);
    const timeZone = canonicalTimeZone(input.originatingTimeZone);
    if (!timeZone) throw new ValidationError("originatingTimeZone is invalid.", ["time_zone_invalid"]);
    const estimateId = this.idFactory();
    const revisionId = this.idFactory();
    const isoCurrency = currency(input.currency);
    const revision: EstimateRevisionRecord = {
      id: revisionId, estimateId, revision: code(input.initialRevision, "initialRevision"), parentRevisionId: null,
      revisionReason: "initial", state: "draft", assumptions: strings(input.assumptions, "assumptions"),
      exclusions: strings(input.exclusions, "exclusions"), alternates: strings(input.alternates, "alternates"),
      contingencyPercent: formatDecimal(percentage(input.contingencyPercent, "contingencyPercent")),
      escalationPercent: formatDecimal(percentage(input.escalationPercent, "escalationPercent")),
      markupPercent: formatDecimal(percentage(input.markupPercent, "markupPercent")),
      taxPercent: formatDecimal(percentage(input.taxPercent, "taxPercent")), totals: zeroTotals(isoCurrency),
      submittedAt: null, submittedBy: null, reviewedAt: null, reviewedBy: null, reviewReason: null,
      version: 1, createdAt: now, createdBy: context.userId, updatedAt: now, updatedBy: context.userId,
    };
    const estimate: EstimateRecord = {
      id: estimateId, businessScopeOrganizationId: organizationId, number: code(input.number, "number"),
      name: required(input.name, "name", 200), customerOrganizationId: required(input.customerOrganizationId, "customerOrganizationId", 128),
      facilityId: required(input.facilityId, "facilityId", 128), opportunityReference: optional(input.opportunityReference, "opportunityReference", 256),
      scopeStatement: required(input.scopeStatement, "scopeStatement"), dueAt, originatingTimeZone: timeZone,
      currency: isoCurrency, basisReferences: strings(input.basisReferences, "basisReferences", true), ownerUserId: context.userId,
      state: "draft", currentRevisionId: revisionId, version: 1, createdAt: now, createdBy: context.userId,
      updatedAt: now, updatedBy: context.userId,
    };
    return this.store.transaction((transaction) => {
      if (transaction.estimateByNumber(organizationId, estimate.number)) {
        throw new ConflictError("The estimate number already exists in this business scope.");
      }
      transaction.insertEstimate(estimate);
      transaction.insertEstimateRevision(revision);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: null, action: "estimate.created", objectType: "estimate", objectId: estimate.id,
        priorState: null, newState: estimate.state, reason: null,
        changedFields: { number: estimate.number, customerOrganizationId: estimate.customerOrganizationId,
          currency: estimate.currency, revisionId: revision.id },
      }));
      return { estimate, revisions: [revision], lines: [], quotes: [], proposals: [], handoffs: [] };
    });
  }

  public listEstimates(context: AccessContext, assignments: readonly RoleAssignment[]): Promise<readonly EstimateRecord[]> {
    const now = this.clock();
    return this.store.transaction((transaction) => transaction.estimatesForOrganization(context.actingOrganizationId)
      .filter((estimate) => {
        try {
          requireAuthorization(context, assignments, {
            action: "estimate.read", resource: scope(estimate.businessScopeOrganizationId, estimate.id),
            requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "standard",
          }, now);
          return true;
        } catch {
          return false;
        }
      }));
  }

  public estimateDetail(
    context: AccessContext, assignments: readonly RoleAssignment[], estimateId: string,
  ): Promise<EstimateDetail> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const estimate = transaction.estimateById(estimateId);
      if (!estimate) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "estimate.read", resource: scope(estimate.businessScopeOrganizationId, estimate.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "standard",
      }, now);
      const revisions = transaction.estimateRevisions(estimate.id);
      return {
        estimate, revisions,
        lines: revisions.flatMap((revision) => transaction.estimateLines(revision.id)),
        quotes: revisions.flatMap((revision) => transaction.estimateQuotes(revision.id)),
        proposals: transaction.estimateProposals(estimate.id), handoffs: transaction.estimateHandoffs(estimate.id),
      };
    });
  }

  public upsertLine(
    context: AccessContext, assignments: readonly RoleAssignment[], revisionId: string,
    lineId: string | null, expectedVersion: number | null, input: UpsertEstimateLineInput,
  ): Promise<EstimateLineRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const revision = transaction.estimateRevisionById(revisionId);
      const estimate = revision ? transaction.estimateById(revision.estimateId) : null;
      if (!revision || !estimate) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "estimate.edit", resource: scope(estimate.businessScopeOrganizationId, estimate.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "standard",
      }, now);
      if (revision.state !== "draft") throw new ValidationError("Submitted estimate revisions are immutable.", ["estimate_revision_immutable"]);
      const current = lineId ? transaction.estimateLineById(lineId) : null;
      if (lineId && (!current || current.revisionId !== revision.id)) throw new NotFoundError();
      if ((current?.version ?? null) !== expectedVersion) throw new ConflictError();
      if (!Number.isInteger(input.sortOrder) || input.sortOrder < 0 || input.sortOrder > 1_000_000) {
        throw new ValidationError("sortOrder is invalid.", ["sort_order_invalid"]);
      }
      const assembly = input.assemblyRevisionId ? transaction.estimateAssemblyById(input.assemblyRevisionId) : null;
      if (input.assemblyRevisionId && (!assembly || assembly.businessScopeOrganizationId !== estimate.businessScopeOrganizationId
        || assembly.state !== "active")) {
        throw new ValidationError("The assembly revision is not active in this business scope.", ["assembly_revision_invalid"]);
      }
      const rawUnit = assembly?.unitCode ?? (input.unitCode ? unitDefinition(input.unitCode)?.code : null);
      if (!rawUnit) throw new ValidationError("unitCode is not controlled.", ["unit_code_invalid"]);
      const factors = input.productivityFactorRevisionIds.map((id) => transaction.estimateProductivityFactorById(id));
      if (factors.some((factor) => !factor || factor.businessScopeOrganizationId !== estimate.businessScopeOrganizationId
        || factor.state !== "active" || factor.effectiveFrom.getTime() > now.getTime()
        || (factor.effectiveTo && factor.effectiveTo.getTime() <= now.getTime()))) {
        throw new ValidationError("A productivity factor is not active and effective in this business scope.", ["productivity_factor_invalid"]);
      }
      if (new Set(input.productivityFactorRevisionIds).size !== input.productivityFactorRevisionIds.length) {
        throw new ValidationError("Productivity factors contain duplicates.", ["productivity_factor_duplicate"]);
      }
      const direct = (value: string | null, field: string) => {
        if (assembly) return null;
        if (value === null) throw new ValidationError(`${field} is required without an assembly.`, [`${field}_required`]);
        return value;
      };
      const baseLaborHoursPerUnit = assembly?.baseLaborHoursPerUnit ?? direct(input.baseLaborHoursPerUnit, "baseLaborHoursPerUnit")!;
      const laborRatePerHour = assembly?.laborRatePerHour ?? direct(input.laborRatePerHour, "laborRatePerHour")!;
      const materialUnitCost = assembly?.materialUnitCost ?? direct(input.materialUnitCost, "materialUnitCost")!;
      const equipmentUnitCost = assembly?.equipmentUnitCost ?? direct(input.equipmentUnitCost, "equipmentUnitCost")!;
      const subcontractUnitCost = assembly?.subcontractUnitCost ?? direct(input.subcontractUnitCost, "subcontractUnitCost")!;
      const calculation = calculateLine({
        quantity: input.quantity, baseLaborHoursPerUnit, laborRatePerHour, materialUnitCost,
        equipmentUnitCost, subcontractUnitCost, allowanceCost: input.allowanceCost, otherCost: input.otherCost,
        factorMultipliers: factors.map((factor) => factor!.multiplier),
      });
      const normalized: EstimateLineRecord = {
        id: current?.id ?? this.idFactory(), revisionId: revision.id,
        lineKey: current?.lineKey ?? (input.lineKey ? code(input.lineKey, "lineKey") : code(this.idFactory(), "lineKey")),
        parentLineKey: input.parentLineKey ? code(input.parentLineKey, "parentLineKey") : null,
        sortOrder: input.sortOrder, costCode: assembly?.costCode ?? code(input.costCode ?? "", "costCode"),
        bidItemCode: input.bidItemCode ? code(input.bidItemCode, "bidItemCode") : null,
        alternateCode: input.alternateCode ? code(input.alternateCode, "alternateCode") : null,
        wbsCode: input.wbsCode ? code(input.wbsCode, "wbsCode") : null,
        workPackageCode: input.workPackageCode ? code(input.workPackageCode, "workPackageCode") : null,
        assemblyRevisionId: assembly?.id ?? null, description: required(input.description, "description"),
        quantity: formatDecimal(decimal(input.quantity, "quantity", false)), unitCode: rawUnit,
        baseLaborHoursPerUnit: formatDecimal(decimal(baseLaborHoursPerUnit, "baseLaborHoursPerUnit")),
        laborRatePerHour: formatDecimal(decimal(laborRatePerHour, "laborRatePerHour")),
        materialUnitCost: formatDecimal(decimal(materialUnitCost, "materialUnitCost")),
        equipmentUnitCost: formatDecimal(decimal(equipmentUnitCost, "equipmentUnitCost")),
        subcontractUnitCost: formatDecimal(decimal(subcontractUnitCost, "subcontractUnitCost")),
        allowanceCost: formatMoney(money(input.allowanceCost, "allowanceCost")),
        otherCost: formatMoney(money(input.otherCost, "otherCost")),
        productivityFactors: factors.map((factor) => ({
          factorRevisionId: factor!.id, multiplier: factor!.multiplier, sourceReference: factor!.sourceReference,
          justification: factor!.justification, approvedBy: factor!.reviewedBy!, approvedAt: factor!.reviewedAt!,
        })),
        calculation, state: "active", version: (current?.version ?? 0) + 1,
        createdAt: current?.createdAt ?? now, createdBy: current?.createdBy ?? context.userId,
        updatedAt: now, updatedBy: context.userId,
      };
      if (normalized.parentLineKey && !transaction.estimateLineByKey(revision.id, normalized.parentLineKey)) {
        throw new ValidationError("parentLineKey does not identify a line in this revision.", ["parent_line_invalid"]);
      }
      if (current) transaction.updateEstimateLine(normalized, current.version);
      else transaction.insertEstimateLine(normalized);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: null, action: "estimate.line_changed", objectType: "estimate_line", objectId: normalized.id,
        priorState: current?.state ?? null, newState: normalized.state, reason: null,
        changedFields: { estimateId: estimate.id, revisionId: revision.id, lineKey: normalized.lineKey,
          costCode: normalized.costCode, totalCost: normalized.calculation.totalCost, version: normalized.version },
      }));
      return normalized;
    });
  }

  public removeLine(
    context: AccessContext, assignments: readonly RoleAssignment[], lineId: string, expectedVersion: number, reason: string,
  ): Promise<EstimateLineRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const line = transaction.estimateLineById(lineId);
      const revision = line ? transaction.estimateRevisionById(line.revisionId) : null;
      const estimate = revision ? transaction.estimateById(revision.estimateId) : null;
      if (!line || !revision || !estimate) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "estimate.edit", resource: scope(estimate.businessScopeOrganizationId, estimate.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "standard",
      }, now);
      if (revision.state !== "draft") throw new ValidationError("Submitted estimate revisions are immutable.", ["estimate_revision_immutable"]);
      if (line.version !== expectedVersion) throw new ConflictError();
      if (transaction.estimateLines(revision.id).some((candidate) => candidate.state === "active" && candidate.parentLineKey === line.lineKey)) {
        throw new ValidationError("A parent line with active children cannot be removed.", ["estimate_line_has_children"]);
      }
      const removed = { ...line, state: "removed" as const, version: line.version + 1, updatedAt: now, updatedBy: context.userId };
      transaction.updateEstimateLine(removed, expectedVersion);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: null, action: "estimate.line_removed", objectType: "estimate_line", objectId: line.id,
        priorState: line.state, newState: removed.state, reason: required(reason, "reason"),
        changedFields: { estimateId: estimate.id, revisionId: revision.id, lineKey: line.lineKey },
      }));
      return removed;
    });
  }

  public submitRevision(
    context: AccessContext, assignments: readonly RoleAssignment[], revisionId: string, expectedVersion: number,
  ): Promise<EstimateRevisionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const revision = transaction.estimateRevisionById(revisionId);
      const estimate = revision ? transaction.estimateById(revision.estimateId) : null;
      if (!revision || !estimate) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "estimate.submit", resource: scope(estimate.businessScopeOrganizationId, estimate.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (revision.version !== expectedVersion) throw new ConflictError();
      if (revision.state !== "draft") throw new ValidationError("Only a draft revision can be submitted.", ["estimate_revision_state_invalid"]);
      const lines = transaction.estimateLines(revision.id).filter((line) => line.state === "active");
      if (lines.length === 0) throw new ValidationError("An estimate revision requires at least one active line.", ["estimate_line_required"]);
      const submitted: EstimateRevisionRecord = {
        ...revision, state: "under_review", totals: calculateTotals(revision, lines, estimate.currency),
        submittedAt: now, submittedBy: context.userId, version: revision.version + 1, updatedAt: now, updatedBy: context.userId,
      };
      const updatedEstimate: EstimateRecord = {
        ...estimate, state: "under_review", currentRevisionId: revision.id, version: estimate.version + 1,
        updatedAt: now, updatedBy: context.userId,
      };
      transaction.updateEstimateRevision(submitted, expectedVersion);
      transaction.updateEstimate(updatedEstimate, estimate.version);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: null, action: "estimate.revision_submitted", objectType: "estimate_revision", objectId: revision.id,
        priorState: revision.state, newState: submitted.state, reason: revision.revisionReason,
        changedFields: { estimateId: estimate.id, revision: revision.revision, totals: submitted.totals, lineCount: lines.length },
      }));
      return submitted;
    });
  }

  public reviewRevision(
    context: AccessContext, assignments: readonly RoleAssignment[], revisionId: string,
    expectedVersion: number, decision: "approve" | "reject", reason: string,
  ): Promise<EstimateRevisionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const revision = transaction.estimateRevisionById(revisionId);
      const estimate = revision ? transaction.estimateById(revision.estimateId) : null;
      if (!revision || !estimate) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "estimate.approve", resource: scope(estimate.businessScopeOrganizationId, estimate.id),
        requiredQualifications: ["estimating_authority"], forbiddenActorIds: revision.submittedBy ? [revision.submittedBy] : [],
        minimumAssurance: "step-up",
      }, now);
      if (revision.version !== expectedVersion) throw new ConflictError();
      if (revision.state !== "under_review") throw new ValidationError("The estimate revision is not under review.", ["estimate_revision_state_invalid"]);
      let authorityPolicyId: string | null = null;
      if (decision === "approve") {
        const policy = transaction.estimateAuthorityPolicies(estimate.businessScopeOrganizationId, estimate.currency)
          .find((candidate) => candidate.state === "active");
        if (!policy) throw new ValidationError("An active estimating authority policy is required.", ["estimate_authority_policy_required"]);
        authorityPolicyId = policy.id;
        if (money(revision.totals.finalPrice, "finalPrice") > money(policy.standardEstimateApprovalLimit, "estimateApprovalLimit")) {
          requireAuthorization(context, assignments, {
            action: "estimate.approve", resource: scope(estimate.businessScopeOrganizationId, estimate.id),
            requiredQualifications: [policy.estimateAboveThresholdQualification],
            forbiddenActorIds: revision.submittedBy ? [revision.submittedBy] : [], minimumAssurance: "step-up",
          }, now);
        }
      }
      if (decision === "approve" && revision.parentRevisionId) {
        const parent = transaction.estimateRevisionById(revision.parentRevisionId);
        if (!parent || (parent.state !== "approved" && parent.state !== "rejected")) {
          throw new ConflictError("The parent revision is no longer a valid controlled baseline.");
        }
        if (parent.state === "approved") {
          transaction.updateEstimateRevision({ ...parent, state: "superseded", version: parent.version + 1,
            updatedAt: now, updatedBy: context.userId }, parent.version);
        }
      }
      const reviewed: EstimateRevisionRecord = {
        ...revision, state: decision === "approve" ? "approved" : "rejected", reviewedAt: now,
        reviewedBy: context.userId, reviewReason: required(reason, "reason"), version: revision.version + 1,
        updatedAt: now, updatedBy: context.userId,
      };
      const updatedEstimate: EstimateRecord = {
        ...estimate, state: decision === "approve" ? "approved" : "draft", currentRevisionId: revision.id,
        version: estimate.version + 1, updatedAt: now, updatedBy: context.userId,
      };
      transaction.updateEstimateRevision(reviewed, expectedVersion);
      transaction.updateEstimate(updatedEstimate, estimate.version);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: null, action: `estimate.revision_${decision === "approve" ? "approved" : "rejected"}`,
        objectType: "estimate_revision", objectId: revision.id, priorState: revision.state,
        newState: reviewed.state, reason: reviewed.reviewReason,
        changedFields: { estimateId: estimate.id, revision: revision.revision, totals: revision.totals, authorityPolicyId },
      }));
      return reviewed;
    });
  }

  public createRevision(
    context: AccessContext, assignments: readonly RoleAssignment[], estimateId: string,
    expectedEstimateVersion: number, input: CreateEstimateRevisionInput,
  ): Promise<EstimateRevisionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const estimate = transaction.estimateById(estimateId);
      if (!estimate) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "estimate.revise", resource: scope(estimate.businessScopeOrganizationId, estimate.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (estimate.version !== expectedEstimateVersion) throw new ConflictError();
      const parent = transaction.estimateRevisionById(estimate.currentRevisionId);
      if (!parent || (parent.state !== "approved" && parent.state !== "rejected")) {
        throw new ValidationError("Only an approved or rejected controlled revision can be revised.", ["estimate_parent_revision_invalid"]);
      }
      const revisionId = this.idFactory();
      const revision: EstimateRevisionRecord = {
        id: revisionId, estimateId: estimate.id, revision: code(input.revision, "revision"), parentRevisionId: parent.id,
        revisionReason: required(input.revisionReason, "revisionReason"), state: "draft",
        assumptions: strings(input.assumptions, "assumptions"), exclusions: strings(input.exclusions, "exclusions"),
        alternates: strings(input.alternates, "alternates"),
        contingencyPercent: formatDecimal(percentage(input.contingencyPercent, "contingencyPercent")),
        escalationPercent: formatDecimal(percentage(input.escalationPercent, "escalationPercent")),
        markupPercent: formatDecimal(percentage(input.markupPercent, "markupPercent")),
        taxPercent: formatDecimal(percentage(input.taxPercent, "taxPercent")), totals: zeroTotals(estimate.currency),
        submittedAt: null, submittedBy: null, reviewedAt: null, reviewedBy: null, reviewReason: null,
        version: 1, createdAt: now, createdBy: context.userId, updatedAt: now, updatedBy: context.userId,
      };
      transaction.insertEstimateRevision(revision);
      for (const sourceLine of transaction.estimateLines(parent.id).filter((line) => line.state === "active")) {
        transaction.insertEstimateLine({
          ...sourceLine, id: this.idFactory(), revisionId: revision.id, version: 1,
          createdAt: now, createdBy: context.userId, updatedAt: now, updatedBy: context.userId,
        });
      }
      transaction.updateEstimate({ ...estimate, state: "draft", currentRevisionId: revision.id,
        version: estimate.version + 1, updatedAt: now, updatedBy: context.userId }, estimate.version);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: null, action: "estimate.revision_created", objectType: "estimate_revision", objectId: revision.id,
        priorState: parent.state, newState: revision.state, reason: revision.revisionReason,
        changedFields: { estimateId: estimate.id, parentRevisionId: parent.id, revision: revision.revision },
      }));
      return revision;
    });
  }

  public revisionDelta(
    context: AccessContext, assignments: readonly RoleAssignment[], revisionId: string,
  ): Promise<EstimateRevisionDelta> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const revision = transaction.estimateRevisionById(revisionId);
      const estimate = revision ? transaction.estimateById(revision.estimateId) : null;
      if (!revision || !estimate) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "estimate.read", resource: scope(estimate.businessScopeOrganizationId, estimate.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "standard",
      }, now);
      if (!revision.parentRevisionId) return { addedLineKeys: [], removedLineKeys: [], changedLineKeys: [] };
      const parent = new Map(transaction.estimateLines(revision.parentRevisionId)
        .filter((line) => line.state === "active").map((line) => [line.lineKey, line]));
      const current = new Map(transaction.estimateLines(revision.id)
        .filter((line) => line.state === "active").map((line) => [line.lineKey, line]));
      return {
        addedLineKeys: [...current.keys()].filter((key) => !parent.has(key)).sort(),
        removedLineKeys: [...parent.keys()].filter((key) => !current.has(key)).sort(),
        changedLineKeys: [...current.keys()].filter((key) => parent.has(key)
          && !isDeepStrictEqual(lineBusinessValue(current.get(key)!), lineBusinessValue(parent.get(key)!))).sort(),
      };
    });
  }

  public receiveQuote(
    context: AccessContext, assignments: readonly RoleAssignment[], revisionId: string, input: ReceiveEstimateQuoteInput,
  ): Promise<EstimateQuoteRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const revision = transaction.estimateRevisionById(revisionId);
      const estimate = revision ? transaction.estimateById(revision.estimateId) : null;
      if (!revision || !estimate) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "estimate.quote.manage", resource: scope(estimate.businessScopeOrganizationId, estimate.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (revision.state !== "draft") throw new ValidationError("Quotes can be normalized only against a draft revision.", ["quote_revision_state_invalid"]);
      if (!/^[0-9a-f]{64}$/u.test(input.sourceSha256)) throw new ValidationError("sourceSha256 is invalid.", ["source_hash_invalid"]);
      const sourceFile = transaction.governedFileById(required(input.sourceFileId, "sourceFileId", 256));
      if (!sourceFile || sourceFile.businessScopeOrganizationId !== estimate.businessScopeOrganizationId
        || sourceFile.projectId !== null || sourceFile.validationState !== "released"
        || sourceFile.sha256 !== input.sourceSha256 || sourceFile.detectedSha256 !== input.sourceSha256) {
        throw new ValidationError(
          "The quote source must be an integrity-matched released organization-scoped file.",
          ["quote_source_file_invalid"],
        );
      }
      const validUntil = date(input.validUntil, "validUntil");
      if (validUntil.getTime() <= now.getTime()) throw new ValidationError("The quote is expired.", ["quote_expired"]);
      if (currency(input.currency) !== estimate.currency) throw new ValidationError("Quote currency does not match the estimate.", ["quote_currency_mismatch"]);
      if (input.lines.length === 0) throw new ValidationError("A quote requires at least one normalized line.", ["quote_line_required"]);
      const estimateLines = transaction.estimateLines(revision.id).filter((line) => line.state === "active");
      const estimateLineKeys = new Set(estimateLines.map((line) => line.lineKey));
      const normalizedLines = input.lines.map((line) => {
        const lineKey = code(line.bidScopeLineKey, "bidScopeLineKey");
        if (!estimateLineKeys.has(lineKey)) throw new ValidationError("A quote line is not mapped to this revision.", ["quote_line_scope_invalid"]);
        const controlledUnit = unitDefinition(line.unitCode);
        if (!controlledUnit) throw new ValidationError("A quote unit is not controlled.", ["unit_code_invalid"]);
        return {
          id: this.idFactory(), bidScopeLineKey: lineKey, description: required(line.description, "description"),
          quantity: formatDecimal(decimal(line.quantity, "quantity", false)), unitCode: controlledUnit.code,
          amount: formatMoney(money(line.amount, "amount")),
        };
      });
      if (new Set(normalizedLines.map((line) => line.bidScopeLineKey)).size !== normalizedLines.length) {
        throw new ValidationError("A quote cannot map the same bid scope line twice.", ["quote_line_duplicate"]);
      }
      const freight = money(input.freightAmount, "freightAmount");
      const tax = money(input.taxAmount, "taxAmount");
      const normalizedTotal = normalizedLines.reduce((total, line) => total + money(line.amount, "amount"), freight + tax);
      const unresolved = [...estimateLineKeys].filter((key) => !normalizedLines.some((line) => line.bidScopeLineKey === key)).sort();
      const quote: EstimateQuoteRecord = {
        id: this.idFactory(), estimateId: estimate.id, revisionId: revision.id,
        vendorOrganizationId: required(input.vendorOrganizationId, "vendorOrganizationId", 128),
        quoteNumber: code(input.quoteNumber, "quoteNumber"), sourceFileId: sourceFile.id,
        sourceSha256: input.sourceSha256, currency: estimate.currency, validUntil,
        inclusions: strings(input.inclusions, "inclusions"), exclusions: strings(input.exclusions, "exclusions"),
        qualifications: strings(input.qualifications, "qualifications"), freightAmount: formatMoney(freight),
        taxAmount: formatMoney(tax), lines: normalizedLines, normalizedTotal: formatMoney(normalizedTotal),
        unresolvedScopeLineKeys: unresolved, state: "normalized", selectedAt: null, selectedBy: null,
        selectionReason: null, version: 1, createdAt: now, createdBy: context.userId, updatedAt: now, updatedBy: context.userId,
      };
      transaction.insertEstimateQuote(quote);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: null, action: "estimate.quote_received", objectType: "estimate_quote", objectId: quote.id,
        priorState: null, newState: quote.state, reason: null,
        changedFields: { estimateId: estimate.id, revisionId: revision.id, vendorOrganizationId: quote.vendorOrganizationId,
          normalizedTotal: quote.normalizedTotal, unresolvedScopeLineCount: unresolved.length, sourceSha256: quote.sourceSha256 },
      }));
      return quote;
    });
  }

  public selectQuote(
    context: AccessContext, assignments: readonly RoleAssignment[], quoteId: string, expectedVersion: number, reason: string,
  ): Promise<EstimateQuoteRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const quote = transaction.estimateQuoteById(quoteId);
      const estimate = quote ? transaction.estimateById(quote.estimateId) : null;
      const revision = quote ? transaction.estimateRevisionById(quote.revisionId) : null;
      if (!quote || !estimate || !revision) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "estimate.quote.select", resource: scope(estimate.businessScopeOrganizationId, estimate.id),
        requiredQualifications: ["estimating_authority"], forbiddenActorIds: [quote.createdBy], minimumAssurance: "step-up",
      }, now);
      if (quote.version !== expectedVersion) throw new ConflictError();
      if (revision.state !== "draft" || quote.state !== "normalized") {
        throw new ValidationError("The quote is not selectable in its current state.", ["quote_state_invalid"]);
      }
      if (quote.validUntil.getTime() <= now.getTime()) throw new ValidationError("The quote is expired.", ["quote_expired"]);
      if (quote.unresolvedScopeLineKeys.length > 0) {
        throw new ValidationError("Unresolved bid scope prevents quote selection.", ["quote_scope_unresolved"]);
      }
      const policy = transaction.estimateAuthorityPolicies(estimate.businessScopeOrganizationId, estimate.currency)
        .find((candidate) => candidate.state === "active");
      if (!policy) throw new ValidationError("An active quote-selection authority policy is required.", ["estimate_authority_policy_required"]);
      if (money(quote.normalizedTotal, "normalizedTotal") > money(policy.standardQuoteSelectionLimit, "quoteSelectionLimit")) {
        requireAuthorization(context, assignments, {
          action: "estimate.quote.select", resource: scope(estimate.businessScopeOrganizationId, estimate.id),
          requiredQualifications: [policy.quoteAboveThresholdQualification], forbiddenActorIds: [quote.createdBy],
          minimumAssurance: "step-up",
        }, now);
      }
      for (const other of transaction.estimateQuotes(revision.id).filter((candidate) => candidate.state === "selected")) {
        transaction.updateEstimateQuote({ ...other, state: "not_selected", version: other.version + 1,
          updatedAt: now, updatedBy: context.userId }, other.version);
      }
      const selected: EstimateQuoteRecord = {
        ...quote, state: "selected", selectedAt: now, selectedBy: context.userId,
        selectionReason: required(reason, "reason"), version: quote.version + 1, updatedAt: now, updatedBy: context.userId,
      };
      transaction.updateEstimateQuote(selected, expectedVersion);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: null, action: "estimate.quote_selected", objectType: "estimate_quote", objectId: quote.id,
        priorState: quote.state, newState: selected.state, reason: selected.selectionReason,
        changedFields: { estimateId: estimate.id, revisionId: revision.id, vendorOrganizationId: quote.vendorOrganizationId,
          normalizedTotal: quote.normalizedTotal, authorityPolicyId: policy.id },
      }));
      return selected;
    });
  }

  public quoteComparison(
    context: AccessContext, assignments: readonly RoleAssignment[], revisionId: string,
  ): Promise<readonly EstimateQuoteComparison[]> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const revision = transaction.estimateRevisionById(revisionId);
      const estimate = revision ? transaction.estimateById(revision.estimateId) : null;
      if (!revision || !estimate) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "estimate.read", resource: scope(estimate.businessScopeOrganizationId, estimate.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "standard",
      }, now);
      return transaction.estimateQuotes(revision.id).map((quote) => ({
        quoteId: quote.id, vendorOrganizationId: quote.vendorOrganizationId, quoteNumber: quote.quoteNumber,
        normalizedTotal: quote.normalizedTotal, currency: quote.currency, validUntil: quote.validUntil,
        expired: quote.validUntil.getTime() <= now.getTime(), unresolvedScopeLineKeys: quote.unresolvedScopeLineKeys,
        exclusions: quote.exclusions, qualifications: quote.qualifications, state: quote.state,
      }));
    });
  }

  public generateProposal(
    context: AccessContext, assignments: readonly RoleAssignment[], revisionId: string, input: GenerateEstimateProposalInput,
  ): Promise<EstimateProposalRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const revision = transaction.estimateRevisionById(revisionId);
      const estimate = revision ? transaction.estimateById(revision.estimateId) : null;
      if (!revision || !estimate) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "estimate.proposal.generate", resource: scope(estimate.businessScopeOrganizationId, estimate.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (revision.state !== "approved" || estimate.currentRevisionId !== revision.id) {
        throw new ValidationError("Only the current approved estimate revision can generate a proposal.", ["proposal_revision_invalid"]);
      }
      const validUntil = date(input.validUntil, "validUntil");
      if (validUntil.getTime() <= now.getTime()) throw new ValidationError("Proposal validity must be future bounded.", ["proposal_validity_invalid"]);
      const source = {
        estimate, revision,
        lines: transaction.estimateLines(revision.id).filter((line) => line.state === "active"),
        selectedQuotes: transaction.estimateQuotes(revision.id).filter((quote) => quote.state === "selected"),
      };
      const sourceCanonicalSha256 = sha256(source);
      const proposalNumber = code(input.proposalNumber, "proposalNumber");
      const terms = strings(input.commercialTermsReferences, "commercialTermsReferences", true);
      const artifactContent = proposalArtifact({
        estimate, revision, lines: source.lines, proposalNumber, validUntil,
        commercialTermsReferences: terms, sourceCanonicalSha256,
      });
      const artifactSha256 = createHash("sha256").update(artifactContent).digest("hex");
      const artifactFilename = `${proposalNumber.toLowerCase()}.html`;
      const proposal: EstimateProposalRecord = {
        id: this.idFactory(), estimateId: estimate.id, revisionId: revision.id, proposalNumber,
        customerOrganizationId: estimate.customerOrganizationId, totalPrice: revision.totals.finalPrice,
        currency: estimate.currency, validUntil, commercialTermsReferences: terms, sourceCanonicalSha256,
        artifactManifestSha256: sha256({ sourceCanonicalSha256, artifactSha256, artifactFilename,
          artifactMediaType: "text/html", proposalNumber, totalPrice: revision.totals.finalPrice,
          currency: estimate.currency, validUntil, commercialTermsReferences: terms }),
        artifactSha256, artifactMediaType: "text/html", artifactFilename, artifactContent,
        state: "draft", approvedAt: null, approvedBy: null, issuedAt: null, issuedBy: null,
        version: 1, createdAt: now, createdBy: context.userId, updatedAt: now, updatedBy: context.userId,
      };
      transaction.insertEstimateProposal(proposal);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: null, action: "estimate.proposal_generated", objectType: "estimate_proposal", objectId: proposal.id,
        priorState: null, newState: proposal.state, reason: null,
        changedFields: { estimateId: estimate.id, revisionId: revision.id, proposalNumber, totalPrice: proposal.totalPrice,
          sourceCanonicalSha256, artifactSha256, artifactManifestSha256: proposal.artifactManifestSha256 },
      }));
      return proposal;
    });
  }

  public reviewProposal(
    context: AccessContext, assignments: readonly RoleAssignment[], proposalId: string,
    expectedVersion: number, decision: "approve" | "reject", reason: string,
  ): Promise<EstimateProposalRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const proposal = transaction.estimateProposalById(proposalId);
      const estimate = proposal ? transaction.estimateById(proposal.estimateId) : null;
      if (!proposal || !estimate) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "estimate.proposal.approve", resource: scope(estimate.businessScopeOrganizationId, estimate.id),
        requiredQualifications: ["commercial_authority"], forbiddenActorIds: [proposal.createdBy], minimumAssurance: "step-up",
      }, now);
      if (proposal.version !== expectedVersion) throw new ConflictError();
      if (proposal.state !== "draft") throw new ValidationError("The proposal is not under review.", ["proposal_state_invalid"]);
      let authorityPolicyId: string | null = null;
      if (decision === "approve") {
        const policy = transaction.estimateAuthorityPolicies(estimate.businessScopeOrganizationId, proposal.currency)
          .find((candidate) => candidate.state === "active");
        if (!policy) throw new ValidationError("An active proposal authority policy is required.", ["estimate_authority_policy_required"]);
        authorityPolicyId = policy.id;
        if (money(proposal.totalPrice, "proposalTotal") > money(policy.standardProposalApprovalLimit, "proposalApprovalLimit")) {
          requireAuthorization(context, assignments, {
            action: "estimate.proposal.approve", resource: scope(estimate.businessScopeOrganizationId, estimate.id),
            requiredQualifications: [policy.proposalAboveThresholdQualification], forbiddenActorIds: [proposal.createdBy],
            minimumAssurance: "step-up",
          }, now);
        }
      }
      if (decision === "reject") {
        transaction.appendAudit(event(this.idFactory, now, context, {
          projectId: null, action: "estimate.proposal_rejected", objectType: "estimate_proposal", objectId: proposal.id,
          priorState: proposal.state, newState: "superseded", reason: required(reason, "reason"), changedFields: { estimateId: estimate.id },
        }));
      }
      const reviewed: EstimateProposalRecord = {
        ...proposal, state: decision === "approve" ? "approved" : "superseded",
        approvedAt: decision === "approve" ? now : null, approvedBy: decision === "approve" ? context.userId : null,
        version: proposal.version + 1, updatedAt: now, updatedBy: context.userId,
      };
      transaction.updateEstimateProposal(reviewed, expectedVersion);
      if (decision === "approve") transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: null, action: "estimate.proposal_approved", objectType: "estimate_proposal", objectId: proposal.id,
        priorState: proposal.state, newState: reviewed.state, reason: required(reason, "reason"),
        changedFields: { estimateId: estimate.id, revisionId: proposal.revisionId, totalPrice: proposal.totalPrice,
          authorityPolicyId },
      }));
      return reviewed;
    });
  }

  public issueProposal(
    context: AccessContext, assignments: readonly RoleAssignment[], proposalId: string, expectedVersion: number,
  ): Promise<EstimateProposalRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const proposal = transaction.estimateProposalById(proposalId);
      const estimate = proposal ? transaction.estimateById(proposal.estimateId) : null;
      if (!proposal || !estimate) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "estimate.proposal.issue", resource: scope(estimate.businessScopeOrganizationId, estimate.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (proposal.version !== expectedVersion) throw new ConflictError();
      if (proposal.state !== "approved") throw new ValidationError("Only an approved proposal can be issued.", ["proposal_state_invalid"]);
      if (proposal.validUntil.getTime() <= now.getTime()) throw new ValidationError("The proposal is expired.", ["proposal_expired"]);
      const issued: EstimateProposalRecord = {
        ...proposal, state: "issued", issuedAt: now, issuedBy: context.userId,
        version: proposal.version + 1, updatedAt: now, updatedBy: context.userId,
      };
      transaction.updateEstimateProposal(issued, expectedVersion);
      transaction.updateEstimate({ ...estimate, state: "proposal_issued", version: estimate.version + 1,
        updatedAt: now, updatedBy: context.userId }, estimate.version);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: null, action: "estimate.proposal_issued", objectType: "estimate_proposal", objectId: proposal.id,
        priorState: proposal.state, newState: issued.state, reason: null,
        changedFields: { estimateId: estimate.id, proposalNumber: proposal.proposalNumber,
          sourceCanonicalSha256: proposal.sourceCanonicalSha256 },
      }));
      return issued;
    });
  }

  public downloadProposal(
    context: AccessContext, assignments: readonly RoleAssignment[], proposalId: string,
  ): Promise<EstimateProposalRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const proposal = transaction.estimateProposalById(proposalId);
      const estimate = proposal ? transaction.estimateById(proposal.estimateId) : null;
      if (!proposal || !estimate || (proposal.state !== "approved" && proposal.state !== "issued")) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "estimate.proposal.download", resource: scope(estimate.businessScopeOrganizationId, estimate.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (createHash("sha256").update(proposal.artifactContent).digest("hex") !== proposal.artifactSha256) {
        throw new ConflictError("The immutable proposal artifact failed integrity verification.");
      }
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: null, action: "estimate.proposal_downloaded", objectType: "estimate_proposal", objectId: proposal.id,
        priorState: proposal.state, newState: proposal.state, reason: null,
        changedFields: { estimateId: estimate.id, artifactSha256: proposal.artifactSha256,
          artifactManifestSha256: proposal.artifactManifestSha256 },
      }));
      return proposal;
    });
  }

  public handoffProposal(
    context: AccessContext, assignments: readonly RoleAssignment[], proposalId: string,
    input: EstimateHandoffInput,
  ): Promise<EstimateHandoffRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const proposal = transaction.estimateProposalById(proposalId);
      const estimate = proposal ? transaction.estimateById(proposal.estimateId) : null;
      const revision = proposal ? transaction.estimateRevisionById(proposal.revisionId) : null;
      const project = transaction.projectById(input.projectId);
      if (!proposal || !estimate || !revision || !project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "estimate.handoff", resource: scope(estimate.businessScopeOrganizationId, estimate.id, project.id),
        requiredQualifications: ["project_controls_authority"], forbiddenActorIds: [], minimumAssurance: "step-up",
      }, now);
      if (proposal.state !== "issued" || proposal.validUntil.getTime() <= now.getTime()) {
        throw new ValidationError("Only a current issued proposal can be handed off.", ["proposal_handoff_invalid"]);
      }
      if (project.businessScopeOrganizationId !== estimate.businessScopeOrganizationId) {
        throw new ValidationError("The handoff project is outside the estimate business scope.", ["handoff_scope_invalid"]);
      }
      if (transaction.estimateHandoffByProposal(proposal.id)) throw new ConflictError("The proposal was already handed off.");
      const lines = transaction.estimateLines(revision.id).filter((line) => line.state === "active");
      const mappings: Array<EstimateHandoffRecord["mappings"][number]> = lines.map((line) => ({
        estimateLineKey: line.lineKey, category: "direct_cost", costCode: line.costCode, wbsCode: line.wbsCode,
        workPackageCode: line.workPackageCode, amount: line.calculation.totalCost,
      }));
      const adjustmentMappings = [
        ["contingency", revision.totals.contingencyAmount, input.adjustmentCostCodes.contingency],
        ["escalation", revision.totals.escalationAmount, input.adjustmentCostCodes.escalation],
        ["markup", revision.totals.markupAmount, input.adjustmentCostCodes.markup],
        ["tax", revision.totals.taxAmount, input.adjustmentCostCodes.tax],
      ] as const;
      for (const [category, amount, costCode] of adjustmentMappings) {
        mappings.push({
          estimateLineKey: `ADJUSTMENT-${category.toUpperCase()}`,
          category,
          costCode: code(costCode, `${category}CostCode`),
          wbsCode: null,
          workPackageCode: null,
          amount,
        });
      }
      const mappedTotal = mappings.reduce((total, mapping) => total + money(mapping.amount, "amount"), 0n);
      const sourceTotal = money(revision.totals.finalPrice, "sourceTotal");
      const handoff: EstimateHandoffRecord = {
        id: this.idFactory(), estimateId: estimate.id, proposalId: proposal.id, projectId: project.id,
        sourceRevisionId: revision.id, sourceCanonicalSha256: proposal.sourceCanonicalSha256,
        mappings, mappedTotal: formatMoney(mappedTotal), sourceTotal: formatMoney(sourceTotal),
        reconciliationDifference: formatMoney(mappedTotal >= sourceTotal ? mappedTotal - sourceTotal : sourceTotal - mappedTotal),
        authorizationReference: required(input.authorizationReference, "authorizationReference", 512), createdAt: now, createdBy: context.userId,
      };
      if (handoff.reconciliationDifference !== "0.00") {
        throw new ValidationError("The estimate handoff does not reconcile to direct cost.", ["handoff_reconciliation_failed"]);
      }
      transaction.insertEstimateHandoff(handoff);
      transaction.updateEstimate({ ...estimate, state: "awarded", version: estimate.version + 1,
        updatedAt: now, updatedBy: context.userId }, estimate.version);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: project.id, action: "estimate.handoff_completed", objectType: "estimate_handoff", objectId: handoff.id,
        priorState: estimate.state, newState: "awarded", reason: handoff.authorizationReference,
        changedFields: { estimateId: estimate.id, proposalId: proposal.id, sourceRevisionId: revision.id,
          mappedTotal: handoff.mappedTotal, mappingCount: mappings.length, sourceCanonicalSha256: handoff.sourceCanonicalSha256 },
      }));
      return handoff;
    });
  }
}
