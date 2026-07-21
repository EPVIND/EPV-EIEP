import { createHash, randomUUID } from "node:crypto";
import type {
  AccessContext,
  AuditEvent,
  ProcurementBidPackageRecord,
  ProcurementCommitmentRecord,
  ProcurementOffer,
  ProcurementRequisitionItem,
  ProcurementRequisitionRecord,
  ProjectChangeLineImpact,
  ProjectChangeRequestRecord,
  ProjectControlBaselineLine,
  ProjectControlBaselineRecord,
  ProjectControlsAuthorityPolicyRevisionRecord,
  ProjectCostEntryRecord,
  ProjectCostEntryType,
  ProjectProgressClaimRecord,
  RoleAssignment,
  ScheduleActivity,
  ScheduleDependency,
  ScheduleImportRecord,
  ScheduleProgramRecord,
  ScheduleRevisionRecord,
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

export interface ProposeProjectControlsAuthorityPolicyInput {
  readonly businessScopeOrganizationId: string;
  readonly currency: string;
  readonly revision: string;
  readonly standardChangeApprovalLimit: string;
  readonly standardProcurementAwardLimit: string;
  readonly changeAboveThresholdQualification: string;
  readonly procurementAboveThresholdQualification: string;
  readonly supersedesRevisionId: string | null;
}

export interface CreateProjectControlBaselineInput {
  readonly sourceHandoffId: string;
  readonly number: string;
  readonly revision: string;
  readonly revisionReason: string;
  readonly periodStart: Date;
  readonly periodFinish: Date;
  readonly managementReserveAmount: string;
  readonly mappings: readonly {
    readonly sourceEstimateLineKey: string;
    readonly controlAccountCode: string;
    readonly responsibleOrganizationId: string;
    readonly wbsCode: string | null;
    readonly workPackageCode: string | null;
  }[];
}

export interface CreateProjectChangeInput {
  readonly baselineId: string;
  readonly number: string;
  readonly title: string;
  readonly origin: string;
  readonly description: string;
  readonly scheduleDaysImpact: string;
  readonly quotationReference: string | null;
  readonly evidenceFileIds: readonly string[];
  readonly lineImpacts: readonly ProjectChangeLineImpact[];
}

export interface CreateControlBaselineFromChangeInput {
  readonly revision: string;
  readonly revisionReason: string;
  readonly periodStart: Date;
  readonly periodFinish: Date;
}

export interface SubmitProjectCostEntryInput {
  readonly baselineId: string;
  readonly baselineLineKey: string | null;
  readonly entryType: ProjectCostEntryType;
  readonly amount: string;
  readonly periodStart: Date;
  readonly periodFinish: Date;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly sourceSha256: string;
  readonly description: string;
}

export interface SubmitProjectProgressClaimInput {
  readonly baselineId: string;
  readonly baselineLineKey: string;
  readonly periodStart: Date;
  readonly periodFinish: Date;
  readonly claimedQuantity: string;
  readonly evidenceFileIds: readonly string[];
  readonly fieldStatus: string;
}

export interface CreateProcurementRequisitionInput {
  readonly baselineId: string;
  readonly number: string;
  readonly title: string;
  readonly items: readonly (Omit<ProcurementRequisitionItem, "needBy"> & { readonly needBy: Date })[];
}

export interface CreateProcurementBidPackageInput {
  readonly requisitionId: string;
  readonly number: string;
  readonly bidderOrganizationIds: readonly string[];
}

export interface RecordProcurementOfferInput extends Omit<ProcurementOffer, "receivedAt" | "receivedBy"> {}

export interface AwardProcurementInput {
  readonly expectedVersion: number;
  readonly reason: string;
  readonly purchaseOrderReference: string;
  readonly revision: string;
}

export interface RecordProcurementStatusInput {
  readonly expectedVersion: number;
  readonly eventType: ProcurementCommitmentRecord["statusEvents"][number]["eventType"];
  readonly status: string;
  readonly promisedAt: Date | null;
  readonly forecastAt: Date | null;
  readonly actualAt: Date | null;
  readonly sourceReference: string;
  readonly evidenceFileIds: readonly string[];
  readonly receivedMaterialItemIds: readonly string[];
  readonly responsibleUserId: string;
}

export interface CreateScheduleProgramInput {
  readonly number: string;
  readonly name: string;
  readonly timeZone: string;
}

export interface CreateScheduleRevisionInput {
  readonly revision: string;
  readonly revisionType: "baseline" | "update";
  readonly parentRevisionId: string | null;
  readonly sourceBaselineId: string;
  readonly dataDate: Date;
  readonly reason: string;
  readonly sourceSystem: "manual" | "p6" | "microsoft_project";
  readonly sourceVersion: string | null;
  readonly sourceSha256: string | null;
  readonly activities: readonly ScheduleActivity[];
  readonly dependencies: readonly ScheduleDependency[];
}

export interface PreviewScheduleImportInput {
  readonly idempotencyKey: string;
  readonly sourceSystem: "p6" | "microsoft_project";
  readonly sourceVersion: string;
  readonly sourceFileId: string;
  readonly sourceSha256: string;
  readonly mappingVersion: string;
  readonly targetRevision: string;
  readonly targetRevisionType: "baseline" | "update";
  readonly parentRevisionId: string | null;
  readonly dataDate: Date;
  readonly activities: readonly ScheduleActivity[];
  readonly dependencies: readonly ScheduleDependency[];
}

export interface ProjectControlsSnapshot {
  readonly baselines: readonly ProjectControlBaselineRecord[];
  readonly changes: readonly ProjectChangeRequestRecord[];
  readonly costEntries: readonly ProjectCostEntryRecord[];
  readonly progressClaims: readonly ProjectProgressClaimRecord[];
  readonly requisitions: readonly ProcurementRequisitionRecord[];
  readonly bidPackages: readonly ProcurementBidPackageRecord[];
  readonly commitments: readonly ProcurementCommitmentRecord[];
  readonly schedules: readonly ScheduleProgramRecord[];
  readonly scheduleRevisions: readonly ScheduleRevisionRecord[];
  readonly scheduleImports: readonly ScheduleImportRecord[];
}

export interface ProjectCostSummary {
  readonly currency: string;
  readonly currentBudget: string;
  readonly commitments: string;
  readonly actuals: string;
  readonly accruals: string;
  readonly acceptedProgress: string;
  readonly forecastRemaining: string;
  readonly estimateAtCompletion: string;
  readonly varianceAtCompletion: string;
  readonly contingencyDraws: string;
  readonly reserveMovements: string;
}

function required(value: string, field: string, maximum = 4_000): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || /[\u0000\r\n]/u.test(normalized)) {
    throw new ValidationError(`${field} is invalid.`, [`${field}_invalid`]);
  }
  return normalized;
}

function optional(value: string | null, field: string, maximum = 256): string | null {
  return value === null ? null : required(value, field, maximum);
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

function date(value: Date, field: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new ValidationError(`${field} is invalid.`, [`${field}_invalid`]);
  }
  return new Date(value);
}

function period(start: Date, finish: Date): readonly [Date, Date] {
  const normalizedStart = date(start, "periodStart");
  const normalizedFinish = date(finish, "periodFinish");
  if (normalizedStart.getTime() > normalizedFinish.getTime()) {
    throw new ValidationError("The period finish precedes its start.", ["period_invalid"]);
  }
  return [normalizedStart, normalizedFinish];
}

function strings(values: readonly string[], field: string, requireOne = false): readonly string[] {
  const normalized = values.map((value) => required(value, field, 2_000));
  if (requireOne && normalized.length === 0) throw new ValidationError(`${field} is required.`, [`${field}_required`]);
  if (new Set(normalized).size !== normalized.length) throw new ValidationError(`${field} contains duplicates.`, [`${field}_duplicate`]);
  return normalized;
}

function unsignedDecimal(value: string, field: string, allowZero = true): bigint {
  const parsed = parseControlledDecimal(value, { allowZero, maximumScale: decimalScale, maximumIntegerDigits: 12 });
  if (!parsed) throw new ValidationError(`${field} is invalid.`, [`${field}_invalid`]);
  return parsed.coefficient * 10n ** BigInt(decimalScale - parsed.scale);
}

function signedDecimal(value: string, field: string): bigint {
  const normalized = value.trim();
  const negative = normalized.startsWith("-");
  const parsed = parseControlledDecimal(negative ? normalized.slice(1) : normalized, {
    allowZero: true, maximumScale: decimalScale, maximumIntegerDigits: 12,
  });
  if (!parsed) throw new ValidationError(`${field} is invalid.`, [`${field}_invalid`]);
  const scaled = parsed.coefficient * 10n ** BigInt(decimalScale - parsed.scale);
  return negative ? -scaled : scaled;
}

function unsignedMoney(value: string, field: string): bigint {
  const parsed = parseControlledDecimal(value, { allowZero: true, maximumScale: 2, maximumIntegerDigits: 14 });
  if (!parsed) throw new ValidationError(`${field} is invalid.`, [`${field}_invalid`]);
  return parsed.coefficient * 10n ** BigInt(2 - parsed.scale);
}

function signedMoney(value: string, field: string): bigint {
  const normalized = value.trim();
  const negative = normalized.startsWith("-");
  const amount = unsignedMoney(negative ? normalized.slice(1) : normalized, field);
  return negative ? -amount : amount;
}

function formatDecimal(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const integer = absolute / decimalBase;
  const fraction = (absolute % decimalBase).toString().padStart(decimalScale, "0").replace(/0+$/u, "");
  return `${negative ? "-" : ""}${integer}${fraction ? `.${fraction}` : ""}`;
}

function formatMoney(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? "-" : ""}${absolute / centsBase}.${(absolute % centsBase).toString().padStart(2, "0")}`;
}

function multiplyMoneyByRatio(amount: bigint, numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new ValidationError("A controlled quantity denominator must be positive.", ["quantity_invalid"]);
  const absolute = amount * numerator;
  const rounded = absolute >= 0n
    ? (absolute + denominator / 2n) / denominator
    : -((-absolute + denominator / 2n) / denominator);
  return rounded;
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

function sha256Value(value: string, field: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(normalized)) throw new ValidationError(`${field} is invalid.`, [`${field}_invalid`]);
  return normalized;
}

function scope(organizationId: string, projectId: string | null, objectId: string | null) {
  return { organizationId, projectId, workPackageId: null, objectId };
}

function event(
  idFactory: IdFactory,
  occurredAt: Date,
  context: AccessContext,
  input: Omit<AuditEvent, "id" | "occurredAt" | "actorUserId" | "actingOrganizationId" | "correlationId" | "canonicalSha256">,
): AuditEvent {
  const payload = {
    actorUserId: context.userId, actingOrganizationId: context.actingOrganizationId,
    projectId: input.projectId, action: input.action, objectType: input.objectType,
    objectId: input.objectId, priorState: input.priorState, newState: input.newState,
    reason: input.reason, correlationId: context.correlationId, changedFields: input.changedFields,
  };
  return { id: idFactory(), occurredAt, ...payload, canonicalSha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
}

function currentApprovedBaseline(
  transaction: FoundationTransaction, projectId: string,
): ProjectControlBaselineRecord | null {
  return transaction.projectControlBaselines(projectId).find((baseline) => baseline.state === "approved") ?? null;
}

function activeControlsPolicy(
  transaction: FoundationTransaction, organizationId: string, isoCurrency: string,
): ProjectControlsAuthorityPolicyRevisionRecord {
  const policy = transaction.projectControlsAuthorityPolicies(organizationId, isoCurrency)
    .find((candidate) => candidate.state === "active");
  if (!policy) throw new ValidationError("An active project-controls authority policy is required.", ["authority_policy_required"]);
  return policy;
}

function validateReleasedFiles(
  transaction: FoundationTransaction,
  organizationId: string,
  projectId: string,
  fileIds: readonly string[],
  field: string,
  requireOne = true,
): readonly string[] {
  const normalized = strings(fileIds, field, requireOne);
  for (const fileId of normalized) {
    const file = transaction.governedFileById(fileId);
    if (!file || file.businessScopeOrganizationId !== organizationId || file.projectId !== projectId
      || file.validationState !== "released" || file.malwareState !== "clean"
      || !file.detectedSha256 || file.detectedSha256 !== file.sha256) {
      throw new ValidationError("Evidence must be an integrity-matched released project file.", ["evidence_file_invalid"]);
    }
  }
  return normalized;
}

function validateReleasedDocumentRevisions(
  transaction: FoundationTransaction, projectId: string, revisionIds: readonly string[],
): readonly string[] {
  const normalized = strings(revisionIds, "governingDocumentRevisionIds", true);
  for (const revisionId of normalized) {
    const revision = transaction.revisionById(revisionId);
    const document = revision ? transaction.documentById(revision.documentId) : null;
    if (!revision || !document || document.projectId !== projectId || revision.state !== "released") {
      throw new ValidationError("A governing document revision is not current released project evidence.", ["governing_revision_invalid"]);
    }
  }
  return normalized;
}

function scheduleDataErrors(
  transaction: FoundationTransaction,
  projectId: string,
  scheduleId: string,
  activities: readonly ScheduleActivity[],
  dependencies: readonly ScheduleDependency[],
): readonly string[] {
  const errors = new Set<string>();
  const keys = new Set<string>();
  const displayIds = new Set<string>();
  const externalIds = new Set<string>();
  const priorExternalMappings = new Map<string, string>();
  for (const revision of transaction.scheduleRevisions(scheduleId)) {
    for (const activity of revision.activities) {
      if (activity.sourceExternalId) priorExternalMappings.set(activity.sourceExternalId, activity.activityKey);
    }
  }
  for (const activity of activities) {
    if (!activity.activityKey.trim() || keys.has(activity.activityKey)) errors.add("duplicate_or_missing_activity_key");
    keys.add(activity.activityKey);
    if (!activity.displayId.trim() || displayIds.has(activity.displayId)) errors.add("duplicate_or_missing_display_id");
    displayIds.add(activity.displayId);
    if (!(activity.plannedStart instanceof Date) || Number.isNaN(activity.plannedStart.getTime())
      || !(activity.plannedFinish instanceof Date) || Number.isNaN(activity.plannedFinish.getTime())
      || activity.plannedStart.getTime() > activity.plannedFinish.getTime()) errors.add("activity_dates_invalid");
    if (activity.activityType === "milestone"
      && activity.plannedStart.getTime() !== activity.plannedFinish.getTime()) errors.add("milestone_dates_invalid");
    if (!transaction.projectStructureByCode(projectId, "wbs", activity.wbsCode)) errors.add("unmapped_wbs");
    if (activity.workPackageCode
      && !transaction.projectStructureByCode(projectId, "work_package", activity.workPackageCode)) errors.add("unmapped_work_package");
    if (activity.completionBoundaryId) {
      const boundary = transaction.completionBoundaryById(activity.completionBoundaryId);
      if (!boundary || boundary.projectId !== projectId) errors.add("unmapped_completion_boundary");
    }
    for (const revisionId of activity.requiredDocumentRevisionIds) {
      const revision = transaction.revisionById(revisionId);
      const document = revision ? transaction.documentById(revision.documentId) : null;
      if (!revision || !document || document.projectId !== projectId) errors.add("unmapped_document_revision");
    }
    for (const materialId of activity.requiredMaterialItemIds) {
      const material = transaction.materialById(materialId);
      if (!material || material.projectId !== projectId) errors.add("unmapped_material");
    }
    for (const inspectionId of activity.requiredInspectionIds) {
      const inspection = transaction.inspectionById(inspectionId);
      if (!inspection || inspection.projectId !== projectId) errors.add("unmapped_inspection");
    }
    if (activity.sourceExternalId) {
      if (externalIds.has(activity.sourceExternalId)) errors.add("duplicate_external_id");
      externalIds.add(activity.sourceExternalId);
      const priorKey = priorExternalMappings.get(activity.sourceExternalId);
      if (priorKey && priorKey !== activity.activityKey) errors.add("external_id_conflict");
    }
    try {
      const remaining = unsignedDecimal(activity.remainingDurationDays, "remainingDurationDays");
      const field = unsignedDecimal(activity.fieldClaimPercent, "fieldClaimPercent");
      const accepted = unsignedDecimal(activity.acceptedProgressPercent, "acceptedProgressPercent");
      if (field > 100n * decimalBase || accepted > field || accepted > 100n * decimalBase
        || (activity.activityType === "milestone" && remaining !== 0n)) errors.add("activity_progress_invalid");
    } catch {
      errors.add("activity_progress_invalid");
    }
  }
  const dependencyKeys = new Set<string>();
  const adjacency = new Map<string, string[]>();
  for (const key of keys) adjacency.set(key, []);
  for (const dependency of dependencies) {
    const dependencyKey = `${dependency.predecessorActivityKey}\u0000${dependency.successorActivityKey}\u0000${dependency.relationship}`;
    if (dependencyKeys.has(dependencyKey)) errors.add("duplicate_dependency");
    dependencyKeys.add(dependencyKey);
    if (!keys.has(dependency.predecessorActivityKey) || !keys.has(dependency.successorActivityKey)) {
      errors.add("unmapped_dependency");
      continue;
    }
    if (dependency.predecessorActivityKey === dependency.successorActivityKey) errors.add("self_dependency");
    adjacency.get(dependency.predecessorActivityKey)?.push(dependency.successorActivityKey);
    try { signedDecimal(dependency.lagDays, "lagDays"); } catch { errors.add("dependency_lag_invalid"); }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (key: string): boolean => {
    if (visiting.has(key)) return true;
    if (visited.has(key)) return false;
    visiting.add(key);
    if ((adjacency.get(key) ?? []).some(visit)) return true;
    visiting.delete(key);
    visited.add(key);
    return false;
  };
  if ([...keys].some(visit)) errors.add("dependency_cycle");
  return [...errors].sort();
}

function normalizeScheduleData(
  activities: readonly ScheduleActivity[], dependencies: readonly ScheduleDependency[],
): { readonly activities: readonly ScheduleActivity[]; readonly dependencies: readonly ScheduleDependency[] } {
  return {
    activities: activities.map((activity) => {
      const unit = activity.unitCode === null ? null : unitDefinition(activity.unitCode);
      if (activity.unitCode !== null && !unit) throw new ValidationError("The schedule quantity unit is not controlled.", ["unit_code_invalid"]);
      return {
        activityKey: code(activity.activityKey, "activityKey"), displayId: required(activity.displayId, "displayId", 128),
        name: required(activity.name, "name"), activityType: activity.activityType,
        calendarCode: code(activity.calendarCode, "calendarCode"), wbsCode: code(activity.wbsCode, "wbsCode"),
        workPackageCode: activity.workPackageCode === null ? null : code(activity.workPackageCode, "workPackageCode"),
        responsibleOrganizationId: required(activity.responsibleOrganizationId, "responsibleOrganizationId", 128),
        completionBoundaryId: activity.completionBoundaryId === null ? null : required(activity.completionBoundaryId, "completionBoundaryId", 128),
        plannedStart: date(activity.plannedStart, "plannedStart"), plannedFinish: date(activity.plannedFinish, "plannedFinish"),
        actualStart: activity.actualStart === null ? null : date(activity.actualStart, "actualStart"),
        actualFinish: activity.actualFinish === null ? null : date(activity.actualFinish, "actualFinish"),
        remainingDurationDays: formatDecimal(unsignedDecimal(activity.remainingDurationDays, "remainingDurationDays")),
        quantity: activity.quantity === null ? null : formatDecimal(unsignedDecimal(activity.quantity, "quantity")),
        unitCode: unit?.code ?? null, resourceCodes: strings(activity.resourceCodes.map((value) => code(value, "resourceCode")), "resourceCodes"),
        constraintCodes: strings(activity.constraintCodes.map((value) => code(value, "constraintCode")), "constraintCodes"),
        requiredDocumentRevisionIds: strings(activity.requiredDocumentRevisionIds, "requiredDocumentRevisionIds"),
        requiredMaterialItemIds: strings(activity.requiredMaterialItemIds, "requiredMaterialItemIds"),
        requiredInspectionIds: strings(activity.requiredInspectionIds, "requiredInspectionIds"),
        fieldClaimPercent: formatDecimal(unsignedDecimal(activity.fieldClaimPercent, "fieldClaimPercent")),
        acceptedProgressPercent: formatDecimal(unsignedDecimal(activity.acceptedProgressPercent, "acceptedProgressPercent")),
        sourceExternalId: activity.sourceExternalId === null ? null : required(activity.sourceExternalId, "sourceExternalId", 256),
      };
    }),
    dependencies: dependencies.map((dependency) => ({
      predecessorActivityKey: code(dependency.predecessorActivityKey, "predecessorActivityKey"),
      successorActivityKey: code(dependency.successorActivityKey, "successorActivityKey"),
      relationship: dependency.relationship, lagDays: formatDecimal(signedDecimal(dependency.lagDays, "lagDays")),
    })),
  };
}

function baselineVarianceDays(
  transaction: FoundationTransaction, scheduleId: string, activities: readonly ScheduleActivity[],
): string {
  const baseline = transaction.scheduleRevisions(scheduleId)
    .find((revision) => revision.revisionType === "baseline" && ["approved", "superseded"].includes(revision.state));
  if (!baseline || baseline.activities.length === 0 || activities.length === 0) return "0";
  const baselineFinish = Math.max(...baseline.activities.map((activity) => activity.plannedFinish.getTime()));
  const updateFinish = Math.max(...activities.map((activity) => activity.plannedFinish.getTime()));
  return formatDecimal(BigInt(updateFinish - baselineFinish) * decimalBase / 86_400_000n);
}

export class ProjectControlsService {
  public constructor(
    private readonly store: FoundationStore,
    private readonly clock: Clock = () => new Date(),
    private readonly idFactory: IdFactory = randomUUID,
  ) {}

  public proposeAuthorityPolicy(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    input: ProposeProjectControlsAuthorityPolicyInput,
  ): Promise<ProjectControlsAuthorityPolicyRevisionRecord> {
    const now = this.clock();
    requireAuthorization(context, assignments, {
      action: "controls.policy.manage", resource: scope(input.businessScopeOrganizationId, null, null),
      requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
    }, now);
    const policy: ProjectControlsAuthorityPolicyRevisionRecord = {
      id: this.idFactory(), businessScopeOrganizationId: required(input.businessScopeOrganizationId, "businessScopeOrganizationId", 128),
      currency: currency(input.currency), revision: code(input.revision, "revision"),
      standardChangeApprovalLimit: formatMoney(unsignedMoney(input.standardChangeApprovalLimit, "standardChangeApprovalLimit")),
      standardProcurementAwardLimit: formatMoney(unsignedMoney(input.standardProcurementAwardLimit, "standardProcurementAwardLimit")),
      changeAboveThresholdQualification: code(input.changeAboveThresholdQualification, "changeAboveThresholdQualification"),
      procurementAboveThresholdQualification: code(input.procurementAboveThresholdQualification, "procurementAboveThresholdQualification"),
      state: "under_review", supersedesRevisionId: input.supersedesRevisionId,
      proposedAt: now, proposedBy: context.userId, reviewedAt: null, reviewedBy: null, reviewReason: null, version: 1,
    };
    return this.store.transaction((transaction) => {
      const active = transaction.projectControlsAuthorityPolicies(policy.businessScopeOrganizationId, policy.currency)
        .find((candidate) => candidate.state === "active") ?? null;
      if ((active?.id ?? null) !== policy.supersedesRevisionId) throw new ConflictError("The policy must identify the exact active revision it supersedes.");
      transaction.insertProjectControlsAuthorityPolicy(policy);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: null, action: "controls.authority_policy_proposed", objectType: "project_controls_authority_policy",
        objectId: policy.id, priorState: null, newState: policy.state, reason: null,
        changedFields: { currency: policy.currency, revision: policy.revision },
      }));
      return policy;
    });
  }

  public reviewAuthorityPolicy(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    policyId: string,
    expectedVersion: number,
    decision: "approve" | "reject",
    reason: string,
  ): Promise<ProjectControlsAuthorityPolicyRevisionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const policy = transaction.projectControlsAuthorityPolicyById(policyId);
      if (!policy) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "controls.policy.approve", resource: { organizationId: policy.businessScopeOrganizationId, projectId: null, workPackageId: null, objectId: policy.id },
        requiredQualifications: ["project_controls_authority"], forbiddenActorIds: [policy.proposedBy], minimumAssurance: "step-up",
      }, now);
      if (policy.version !== expectedVersion) throw new ConflictError();
      if (policy.state !== "under_review") throw new ValidationError("The policy is not under review.", ["policy_state_invalid"]);
      if (decision === "approve" && policy.supersedesRevisionId) {
        const prior = transaction.projectControlsAuthorityPolicyById(policy.supersedesRevisionId);
        if (!prior || prior.state !== "active") throw new ConflictError("The superseded policy is no longer active.");
        transaction.updateProjectControlsAuthorityPolicy({ ...prior, state: "superseded", version: prior.version + 1 }, prior.version);
      }
      const reviewed: ProjectControlsAuthorityPolicyRevisionRecord = {
        ...policy, state: decision === "approve" ? "active" : "rejected", reviewedAt: now,
        reviewedBy: context.userId, reviewReason: required(reason, "reason"), version: policy.version + 1,
      };
      transaction.updateProjectControlsAuthorityPolicy(reviewed, expectedVersion);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: null, action: `controls.authority_policy_${decision === "approve" ? "approved" : "rejected"}`,
        objectType: "project_controls_authority_policy", objectId: policy.id, priorState: policy.state,
        newState: reviewed.state, reason: reviewed.reviewReason, changedFields: { state: reviewed.state },
      }));
      return reviewed;
    });
  }

  public listAuthorityPolicies(
    context: AccessContext, assignments: readonly RoleAssignment[], organizationId: string,
  ): Promise<readonly ProjectControlsAuthorityPolicyRevisionRecord[]> {
    requireAuthorization(context, assignments, {
      action: "controls.read", resource: { organizationId, projectId: null, workPackageId: null, objectId: null },
      requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "standard",
    }, this.clock());
    return this.store.transaction((transaction) => transaction.projectControlsAuthorityPolicies(organizationId));
  }

  public createBaselineFromHandoff(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    input: CreateProjectControlBaselineInput,
  ): Promise<ProjectControlBaselineRecord> {
    const now = this.clock();
    const [periodStart, periodFinish] = period(input.periodStart, input.periodFinish);
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      const handoff = transaction.estimateHandoffById(input.sourceHandoffId);
      const estimate = handoff ? transaction.estimateById(handoff.estimateId) : null;
      const revision = handoff ? transaction.estimateRevisionById(handoff.sourceRevisionId) : null;
      if (!project || !handoff || !estimate || !revision || handoff.projectId !== projectId) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "controls.baseline.create", resource: scope(project.businessScopeOrganizationId, projectId, handoff.id),
        requiredQualifications: ["project_controls_authority"], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (project.businessScopeOrganizationId !== estimate.businessScopeOrganizationId
        || handoff.reconciliationDifference !== "0.00") {
        throw new ValidationError("The estimate handoff does not reconcile in project scope.", ["handoff_invalid"]);
      }
      if (transaction.projectControlBaselines(projectId).some((candidate) => candidate.sourceHandoffId === handoff.id)) {
        throw new ConflictError("The estimate handoff already has a project-control baseline.");
      }
      const mappingByKey = new Map(input.mappings.map((mapping) => [mapping.sourceEstimateLineKey, mapping]));
      if (mappingByKey.size !== input.mappings.length || mappingByKey.size !== handoff.mappings.length
        || handoff.mappings.some((mapping) => !mappingByKey.has(mapping.estimateLineKey))) {
        throw new ValidationError("Every handoff mapping must be controlled exactly once.", ["baseline_mapping_invalid"]);
      }
      const estimateLines = transaction.estimateLines(revision.id);
      const lines: ProjectControlBaselineLine[] = handoff.mappings.map((source) => {
        const controlled = mappingByKey.get(source.estimateLineKey)!;
        const estimateLine = estimateLines.find((candidate) => candidate.lineKey === source.estimateLineKey) ?? null;
        const unit = unitDefinition(estimateLine?.unitCode ?? "EA");
        if (!unit) throw new ValidationError("The source unit is not controlled.", ["unit_code_invalid"]);
        return {
          lineKey: code(source.estimateLineKey, "sourceEstimateLineKey"),
          sourceEstimateLineKey: source.estimateLineKey, sourceCategory: source.category,
          costCode: code(source.costCode, "costCode"),
          wbsCode: controlled.wbsCode === null ? source.wbsCode : code(controlled.wbsCode, "wbsCode"),
          workPackageCode: controlled.workPackageCode === null ? source.workPackageCode : code(controlled.workPackageCode, "workPackageCode"),
          controlAccountCode: code(controlled.controlAccountCode, "controlAccountCode"),
          responsibleOrganizationId: required(controlled.responsibleOrganizationId, "responsibleOrganizationId", 128),
          budgetQuantity: estimateLine ? formatDecimal(unsignedDecimal(estimateLine.quantity, "quantity", false)) : "1",
          unitCode: unit.code, budgetAmount: formatMoney(unsignedMoney(source.amount, "sourceAmount")),
        };
      });
      const sourceAward = lines.reduce((sum, line) => sum + unsignedMoney(line.budgetAmount, "budgetAmount"), 0n);
      if (formatMoney(sourceAward) !== handoff.sourceTotal || formatMoney(sourceAward) !== handoff.mappedTotal) {
        throw new ValidationError("The baseline does not exactly reconcile to the handoff.", ["baseline_reconciliation_invalid"]);
      }
      const reserve = unsignedMoney(input.managementReserveAmount, "managementReserveAmount");
      const baseline: ProjectControlBaselineRecord = {
        id: this.idFactory(), businessScopeOrganizationId: project.businessScopeOrganizationId, projectId,
        sourceHandoffId: handoff.id, sourceHandoffSha256: sha256(handoff),
        number: code(input.number, "number"), revision: code(input.revision, "revision"), parentBaselineId: null,
        revisionReason: required(input.revisionReason, "revisionReason"), currency: estimate.currency,
        periodStart, periodFinish, lines, sourceAwardAmount: formatMoney(sourceAward), approvedChangeAmount: "0.00",
        managementReserveAmount: formatMoney(reserve), currentBudgetAmount: formatMoney(sourceAward + reserve),
        state: "draft", submittedAt: null, submittedBy: null, reviewedAt: null, reviewedBy: null,
        reviewReason: null, version: 1, createdAt: now, createdBy: context.userId, updatedAt: now, updatedBy: context.userId,
      };
      transaction.insertProjectControlBaseline(baseline);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId, action: "controls.baseline_created", objectType: "project_control_baseline", objectId: baseline.id,
        priorState: null, newState: baseline.state, reason: baseline.revisionReason,
        changedFields: { sourceHandoffId: handoff.id, sourceHandoffSha256: baseline.sourceHandoffSha256,
          sourceAwardAmount: baseline.sourceAwardAmount, managementReserveAmount: baseline.managementReserveAmount },
      }));
      return baseline;
    });
  }

  public submitBaseline(
    context: AccessContext, assignments: readonly RoleAssignment[], baselineId: string, expectedVersion: number,
  ): Promise<ProjectControlBaselineRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const baseline = transaction.projectControlBaselineById(baselineId);
      if (!baseline) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "controls.baseline.submit", resource: scope(baseline.businessScopeOrganizationId, baseline.projectId, baseline.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (baseline.version !== expectedVersion) throw new ConflictError();
      if (baseline.state !== "draft" || baseline.lines.length === 0) {
        throw new ValidationError("Only a complete draft baseline can be submitted.", ["baseline_state_invalid"]);
      }
      const submitted: ProjectControlBaselineRecord = {
        ...baseline, state: "under_review", submittedAt: now, submittedBy: context.userId,
        version: baseline.version + 1, updatedAt: now, updatedBy: context.userId,
      };
      transaction.updateProjectControlBaseline(submitted, expectedVersion);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: baseline.projectId, action: "controls.baseline_submitted", objectType: "project_control_baseline",
        objectId: baseline.id, priorState: baseline.state, newState: submitted.state, reason: null,
        changedFields: { version: submitted.version, sourceHandoffSha256: baseline.sourceHandoffSha256 },
      }));
      return submitted;
    });
  }

  public reviewBaseline(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    baselineId: string,
    expectedVersion: number,
    decision: "approve" | "reject",
    reason: string,
  ): Promise<ProjectControlBaselineRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const baseline = transaction.projectControlBaselineById(baselineId);
      if (!baseline) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "controls.baseline.approve", resource: scope(baseline.businessScopeOrganizationId, baseline.projectId, baseline.id),
        requiredQualifications: ["project_controls_authority"],
        forbiddenActorIds: [baseline.createdBy, baseline.submittedBy ?? baseline.createdBy], minimumAssurance: "step-up",
      }, now);
      if (baseline.version !== expectedVersion) throw new ConflictError();
      if (baseline.state !== "under_review") throw new ValidationError("The baseline is not under review.", ["baseline_state_invalid"]);
      if (decision === "approve") {
        const current = currentApprovedBaseline(transaction, baseline.projectId);
        if ((current?.id ?? null) !== baseline.parentBaselineId) {
          throw new ConflictError("The baseline does not succeed the exact current approved baseline.");
        }
        if (current) transaction.updateProjectControlBaseline({ ...current, state: "superseded", version: current.version + 1,
          updatedAt: now, updatedBy: context.userId }, current.version);
      }
      const reviewed: ProjectControlBaselineRecord = {
        ...baseline, state: decision === "approve" ? "approved" : "rejected", reviewedAt: now,
        reviewedBy: context.userId, reviewReason: required(reason, "reason"), version: baseline.version + 1,
        updatedAt: now, updatedBy: context.userId,
      };
      transaction.updateProjectControlBaseline(reviewed, expectedVersion);
      if (decision === "approve") {
        const change = transaction.projectChangeRequests(baseline.projectId)
          .find((candidate) => candidate.resultingBaselineId === baseline.id && candidate.state === "approved");
        if (change) transaction.updateProjectChangeRequest({ ...change, state: "incorporated", version: change.version + 1,
          updatedAt: now, updatedBy: context.userId }, change.version);
      }
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: baseline.projectId, action: `controls.baseline_${decision === "approve" ? "approved" : "rejected"}`,
        objectType: "project_control_baseline", objectId: baseline.id, priorState: baseline.state,
        newState: reviewed.state, reason: reviewed.reviewReason,
        changedFields: { currentBudgetAmount: reviewed.currentBudgetAmount, parentBaselineId: reviewed.parentBaselineId },
      }));
      return reviewed;
    });
  }

  public createChangeRequest(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    input: CreateProjectChangeInput,
  ): Promise<ProjectChangeRequestRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      const baseline = transaction.projectControlBaselineById(input.baselineId);
      if (!project || !baseline || baseline.projectId !== projectId) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "controls.change.manage", resource: scope(project.businessScopeOrganizationId, projectId, baseline.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (baseline.state !== "approved" || currentApprovedBaseline(transaction, projectId)?.id !== baseline.id) {
        throw new ValidationError("Changes must target the current approved baseline.", ["baseline_not_current"]);
      }
      const seen = new Set<string>();
      const impacts = input.lineImpacts.map((impact) => {
        const baselineLineKey = code(impact.baselineLineKey, "baselineLineKey");
        if (seen.has(baselineLineKey) || !baseline.lines.some((line) => line.lineKey === baselineLineKey)) {
          throw new ValidationError("Change impacts must map unique current baseline lines.", ["change_mapping_invalid"]);
        }
        seen.add(baselineLineKey);
        return {
          baselineLineKey, quantityDelta: formatDecimal(signedDecimal(impact.quantityDelta, "quantityDelta")),
          amountDelta: formatMoney(signedMoney(impact.amountDelta, "amountDelta")), reason: required(impact.reason, "impactReason"),
        };
      });
      if (impacts.length === 0) throw new ValidationError("At least one controlled line impact is required.", ["line_impacts_required"]);
      const total = impacts.reduce((sum, impact) => sum + signedMoney(impact.amountDelta, "amountDelta"), 0n);
      if (unsignedMoney(baseline.currentBudgetAmount, "currentBudgetAmount") + total < 0n) {
        throw new ValidationError("The change would make the project budget negative.", ["change_amount_invalid"]);
      }
      const evidenceFileIds = validateReleasedFiles(
        transaction, project.businessScopeOrganizationId, projectId, input.evidenceFileIds, "evidenceFileIds",
      );
      const change: ProjectChangeRequestRecord = {
        id: this.idFactory(), businessScopeOrganizationId: project.businessScopeOrganizationId, projectId,
        baselineId: baseline.id, number: code(input.number, "number"), title: required(input.title, "title"),
        origin: required(input.origin, "origin"), description: required(input.description, "description"),
        scheduleDaysImpact: formatDecimal(signedDecimal(input.scheduleDaysImpact, "scheduleDaysImpact")),
        quotationReference: optional(input.quotationReference, "quotationReference"), evidenceFileIds, lineImpacts: impacts,
        totalCostImpact: formatMoney(total), state: "under_review", submittedAt: now, submittedBy: context.userId,
        reviewedAt: null, reviewedBy: null, reviewReason: null, resultingBaselineId: null, version: 1,
        createdAt: now, createdBy: context.userId, updatedAt: now, updatedBy: context.userId,
      };
      transaction.insertProjectChangeRequest(change);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId, action: "controls.change_submitted", objectType: "project_change_request", objectId: change.id,
        priorState: null, newState: change.state, reason: change.description,
        changedFields: { baselineId: baseline.id, totalCostImpact: change.totalCostImpact,
          scheduleDaysImpact: change.scheduleDaysImpact, evidenceFileIds },
      }));
      return change;
    });
  }

  public reviewChangeRequest(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    changeId: string,
    expectedVersion: number,
    decision: "approve" | "reject",
    reason: string,
  ): Promise<ProjectChangeRequestRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const change = transaction.projectChangeRequestById(changeId);
      if (!change) throw new NotFoundError();
      const baseline = transaction.projectControlBaselineById(change.baselineId);
      if (!baseline) throw new NotFoundError();
      const policy = activeControlsPolicy(transaction, change.businessScopeOrganizationId, baseline.currency);
      const aboveLimit = (signedMoney(change.totalCostImpact, "totalCostImpact") < 0n
        ? -signedMoney(change.totalCostImpact, "totalCostImpact") : signedMoney(change.totalCostImpact, "totalCostImpact"))
        > unsignedMoney(policy.standardChangeApprovalLimit, "standardChangeApprovalLimit");
      requireAuthorization(context, assignments, {
        action: "controls.change.approve", resource: scope(change.businessScopeOrganizationId, change.projectId, change.id),
        requiredQualifications: ["project_controls_authority", ...(aboveLimit ? [policy.changeAboveThresholdQualification] : [])],
        forbiddenActorIds: [change.createdBy, change.submittedBy ?? change.createdBy], minimumAssurance: "step-up",
      }, now);
      if (change.version !== expectedVersion) throw new ConflictError();
      if (change.state !== "under_review" || currentApprovedBaseline(transaction, change.projectId)?.id !== change.baselineId) {
        throw new ValidationError("The change is not reviewable against the current baseline.", ["change_state_invalid"]);
      }
      const reviewed: ProjectChangeRequestRecord = {
        ...change, state: decision === "approve" ? "approved" : "rejected", reviewedAt: now,
        reviewedBy: context.userId, reviewReason: required(reason, "reason"), version: change.version + 1,
        updatedAt: now, updatedBy: context.userId,
      };
      transaction.updateProjectChangeRequest(reviewed, expectedVersion);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: change.projectId, action: `controls.change_${decision === "approve" ? "approved" : "rejected"}`,
        objectType: "project_change_request", objectId: change.id, priorState: change.state,
        newState: reviewed.state, reason: reviewed.reviewReason,
        changedFields: { totalCostImpact: reviewed.totalCostImpact, authorityPolicyId: policy.id },
      }));
      return reviewed;
    });
  }

  public createBaselineFromChange(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    changeId: string,
    input: CreateControlBaselineFromChangeInput,
  ): Promise<ProjectControlBaselineRecord> {
    const now = this.clock();
    const [periodStart, periodFinish] = period(input.periodStart, input.periodFinish);
    return this.store.transaction((transaction) => {
      const change = transaction.projectChangeRequestById(changeId);
      const parent = change ? transaction.projectControlBaselineById(change.baselineId) : null;
      if (!change || !parent) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "controls.baseline.create", resource: scope(change.businessScopeOrganizationId, change.projectId, change.id),
        requiredQualifications: ["project_controls_authority"], forbiddenActorIds: [change.createdBy], minimumAssurance: "mfa",
      }, now);
      if (change.state !== "approved" || change.resultingBaselineId
        || parent.state !== "approved" || currentApprovedBaseline(transaction, change.projectId)?.id !== parent.id) {
        throw new ValidationError("Only an approved unincorporated change against the current baseline can create a revision.", ["change_state_invalid"]);
      }
      const impacts = new Map(change.lineImpacts.map((impact) => [impact.baselineLineKey, impact]));
      const lines = parent.lines.map((line) => {
        const impact = impacts.get(line.lineKey);
        if (!impact) return line;
        const quantity = unsignedDecimal(line.budgetQuantity, "budgetQuantity") + signedDecimal(impact.quantityDelta, "quantityDelta");
        const amount = unsignedMoney(line.budgetAmount, "budgetAmount") + signedMoney(impact.amountDelta, "amountDelta");
        if (quantity < 0n || amount < 0n) throw new ValidationError("A change would make a baseline line negative.", ["change_line_invalid"]);
        return { ...line, budgetQuantity: formatDecimal(quantity), budgetAmount: formatMoney(amount) };
      });
      const changeAmount = signedMoney(change.totalCostImpact, "totalCostImpact");
      const approvedChanges = signedMoney(parent.approvedChangeAmount, "approvedChangeAmount") + changeAmount;
      const currentBudget = unsignedMoney(parent.currentBudgetAmount, "currentBudgetAmount") + changeAmount;
      const baseline: ProjectControlBaselineRecord = {
        ...parent, id: this.idFactory(), revision: code(input.revision, "revision"), parentBaselineId: parent.id,
        revisionReason: required(input.revisionReason, "revisionReason"), periodStart, periodFinish, lines,
        approvedChangeAmount: formatMoney(approvedChanges), currentBudgetAmount: formatMoney(currentBudget),
        state: "draft", submittedAt: null, submittedBy: null, reviewedAt: null, reviewedBy: null, reviewReason: null,
        version: 1, createdAt: now, createdBy: context.userId, updatedAt: now, updatedBy: context.userId,
      };
      transaction.insertProjectControlBaseline(baseline);
      transaction.updateProjectChangeRequest({ ...change, resultingBaselineId: baseline.id, version: change.version + 1,
        updatedAt: now, updatedBy: context.userId }, change.version);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: change.projectId, action: "controls.change_baseline_created", objectType: "project_control_baseline",
        objectId: baseline.id, priorState: null, newState: baseline.state, reason: baseline.revisionReason,
        changedFields: { changeId: change.id, parentBaselineId: parent.id, currentBudgetAmount: baseline.currentBudgetAmount },
      }));
      return baseline;
    });
  }

  public submitCostEntry(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    input: SubmitProjectCostEntryInput,
  ): Promise<ProjectCostEntryRecord> {
    const now = this.clock();
    const [periodStart, periodFinish] = period(input.periodStart, input.periodFinish);
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      const baseline = transaction.projectControlBaselineById(input.baselineId);
      if (!project || !baseline || baseline.projectId !== projectId) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "controls.cost.submit", resource: scope(project.businessScopeOrganizationId, projectId, baseline.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (baseline.state !== "approved" || currentApprovedBaseline(transaction, projectId)?.id !== baseline.id) {
        throw new ValidationError("Cost entries must target the current approved baseline.", ["baseline_not_current"]);
      }
      const lineKey = input.baselineLineKey === null ? null : code(input.baselineLineKey, "baselineLineKey");
      if (lineKey && !baseline.lines.some((line) => line.lineKey === lineKey)) {
        throw new ValidationError("The cost entry does not map to the baseline.", ["baseline_line_invalid"]);
      }
      const amount = input.entryType === "reserve_movement"
        ? signedMoney(input.amount, "amount") : unsignedMoney(input.amount, "amount");
      const entry: ProjectCostEntryRecord = {
        id: this.idFactory(), businessScopeOrganizationId: project.businessScopeOrganizationId, projectId,
        baselineId: baseline.id, baselineLineKey: lineKey, entryType: input.entryType,
        amount: formatMoney(amount), currency: baseline.currency, periodStart, periodFinish,
        sourceType: code(input.sourceType, "sourceType"), sourceId: required(input.sourceId, "sourceId", 256),
        sourceSha256: sha256Value(input.sourceSha256, "sourceSha256"), description: required(input.description, "description"),
        state: "submitted", submittedAt: now, submittedBy: context.userId, reviewedAt: null,
        reviewedBy: null, reviewReason: null, version: 1,
      };
      transaction.insertProjectCostEntry(entry);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId, action: "controls.cost_entry_submitted", objectType: "project_cost_entry", objectId: entry.id,
        priorState: null, newState: entry.state, reason: entry.description,
        changedFields: { entryType: entry.entryType, amount: entry.amount, sourceId: entry.sourceId,
          sourceSha256: entry.sourceSha256, periodStart, periodFinish },
      }));
      return entry;
    });
  }

  public reviewCostEntry(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    entryId: string,
    expectedVersion: number,
    decision: "accept" | "reject",
    reason: string,
  ): Promise<ProjectCostEntryRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const entry = transaction.projectCostEntryById(entryId);
      if (!entry) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "controls.cost.accept", resource: scope(entry.businessScopeOrganizationId, entry.projectId, entry.id),
        requiredQualifications: ["project_controls_authority"], forbiddenActorIds: [entry.submittedBy], minimumAssurance: "step-up",
      }, now);
      if (entry.version !== expectedVersion) throw new ConflictError();
      if (entry.state !== "submitted") throw new ValidationError("The cost entry is not reviewable.", ["cost_entry_state_invalid"]);
      const reviewed: ProjectCostEntryRecord = {
        ...entry, state: decision === "accept" ? "accepted" : "rejected", reviewedAt: now,
        reviewedBy: context.userId, reviewReason: required(reason, "reason"), version: entry.version + 1,
      };
      transaction.updateProjectCostEntry(reviewed, expectedVersion);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: entry.projectId, action: `controls.cost_entry_${decision === "accept" ? "accepted" : "rejected"}`,
        objectType: "project_cost_entry", objectId: entry.id, priorState: entry.state,
        newState: reviewed.state, reason: reviewed.reviewReason, changedFields: { amount: entry.amount, entryType: entry.entryType },
      }));
      return reviewed;
    });
  }

  public submitProgressClaim(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    input: SubmitProjectProgressClaimInput,
  ): Promise<ProjectProgressClaimRecord> {
    const now = this.clock();
    const [periodStart, periodFinish] = period(input.periodStart, input.periodFinish);
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      const baseline = transaction.projectControlBaselineById(input.baselineId);
      const line = baseline?.lines.find((candidate) => candidate.lineKey === code(input.baselineLineKey, "baselineLineKey"));
      if (!project || !baseline || baseline.projectId !== projectId || !line) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "controls.progress.submit", resource: scope(project.businessScopeOrganizationId, projectId, baseline.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (baseline.state !== "approved" || currentApprovedBaseline(transaction, projectId)?.id !== baseline.id) {
        throw new ValidationError("Progress must target the current approved baseline.", ["baseline_not_current"]);
      }
      const quantity = unsignedDecimal(input.claimedQuantity, "claimedQuantity", false);
      const budgetQuantity = unsignedDecimal(line.budgetQuantity, "budgetQuantity", false);
      if (quantity > budgetQuantity) throw new ValidationError("Claimed quantity exceeds the baseline line.", ["progress_quantity_invalid"]);
      const earned = multiplyMoneyByRatio(unsignedMoney(line.budgetAmount, "budgetAmount"), quantity, budgetQuantity);
      const evidenceFileIds = validateReleasedFiles(
        transaction, project.businessScopeOrganizationId, projectId, input.evidenceFileIds, "evidenceFileIds",
      );
      const claim: ProjectProgressClaimRecord = {
        id: this.idFactory(), businessScopeOrganizationId: project.businessScopeOrganizationId, projectId,
        baselineId: baseline.id, baselineLineKey: line.lineKey, periodStart, periodFinish,
        claimedQuantity: formatDecimal(quantity), unitCode: line.unitCode, claimedEarnedAmount: formatMoney(earned),
        evidenceFileIds, fieldStatus: required(input.fieldStatus, "fieldStatus"),
        qualityAcceptanceState: "not_evaluated", invoiceApprovalState: "not_submitted", state: "submitted",
        submittedAt: now, submittedBy: context.userId, reviewedAt: null, reviewedBy: null,
        reviewReason: null, version: 1,
      };
      transaction.insertProjectProgressClaim(claim);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId, action: "controls.progress_submitted", objectType: "project_progress_claim", objectId: claim.id,
        priorState: null, newState: claim.state, reason: claim.fieldStatus,
        changedFields: { baselineLineKey: line.lineKey, claimedQuantity: claim.claimedQuantity,
          claimedEarnedAmount: claim.claimedEarnedAmount, evidenceFileIds,
          qualityAcceptanceState: claim.qualityAcceptanceState, invoiceApprovalState: claim.invoiceApprovalState },
      }));
      return claim;
    });
  }

  public reviewProgressClaim(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    claimId: string,
    expectedVersion: number,
    decision: "accept" | "reject",
    reason: string,
  ): Promise<ProjectProgressClaimRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const claim = transaction.projectProgressClaimById(claimId);
      const baseline = claim ? transaction.projectControlBaselineById(claim.baselineId) : null;
      const line = baseline?.lines.find((candidate) => candidate.lineKey === claim?.baselineLineKey);
      if (!claim || !baseline || !line) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "controls.progress.accept", resource: scope(claim.businessScopeOrganizationId, claim.projectId, claim.id),
        requiredQualifications: ["project_controls_authority"], forbiddenActorIds: [claim.submittedBy], minimumAssurance: "step-up",
      }, now);
      if (claim.version !== expectedVersion) throw new ConflictError();
      if (claim.state !== "submitted" || baseline.state !== "approved") {
        throw new ValidationError("The progress claim is not reviewable.", ["progress_state_invalid"]);
      }
      if (decision === "accept") {
        const accepted = transaction.projectProgressClaims(claim.projectId)
          .filter((candidate) => candidate.baselineId === claim.baselineId
            && candidate.baselineLineKey === claim.baselineLineKey && candidate.state === "accepted")
          .reduce((sum, candidate) => sum + unsignedDecimal(candidate.claimedQuantity, "claimedQuantity"), 0n);
        if (accepted + unsignedDecimal(claim.claimedQuantity, "claimedQuantity")
          > unsignedDecimal(line.budgetQuantity, "budgetQuantity")) {
          throw new ValidationError("Accepted progress would exceed the current baseline quantity.", ["progress_quantity_invalid"]);
        }
      }
      const reviewed: ProjectProgressClaimRecord = {
        ...claim, state: decision === "accept" ? "accepted" : "rejected", reviewedAt: now,
        reviewedBy: context.userId, reviewReason: required(reason, "reason"), version: claim.version + 1,
      };
      transaction.updateProjectProgressClaim(reviewed, expectedVersion);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: claim.projectId, action: `controls.progress_${decision === "accept" ? "accepted" : "rejected"}`,
        objectType: "project_progress_claim", objectId: claim.id, priorState: claim.state,
        newState: reviewed.state, reason: reviewed.reviewReason,
        changedFields: { claimedQuantity: claim.claimedQuantity, claimedEarnedAmount: claim.claimedEarnedAmount,
          qualityAcceptanceState: claim.qualityAcceptanceState, invoiceApprovalState: claim.invoiceApprovalState },
      }));
      return reviewed;
    });
  }

  public costSummary(
    context: AccessContext, assignments: readonly RoleAssignment[], projectId: string,
  ): Promise<ProjectCostSummary> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "controls.read", resource: scope(project.businessScopeOrganizationId, projectId, null),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "standard",
      }, now);
      const baseline = currentApprovedBaseline(transaction, projectId);
      if (!baseline) throw new ValidationError("An approved project-control baseline is required.", ["baseline_required"]);
      const entries = transaction.projectCostEntries(projectId).filter((entry) => entry.state === "accepted");
      const total = (entryType: ProjectCostEntryType) => entries.filter((entry) => entry.entryType === entryType)
        .reduce((sum, entry) => sum + signedMoney(entry.amount, "amount"), 0n);
      const commitments = transaction.procurementCommitments(projectId)
        .filter((commitment) => commitment.state !== "closed")
        .reduce((sum, commitment) => sum + unsignedMoney(commitment.amount, "amount"), 0n);
      const actuals = total("actual");
      const accruals = total("accrual");
      const forecast = total("forecast_remaining");
      const eac = actuals + accruals + forecast;
      const progress = transaction.projectProgressClaims(projectId).filter((claim) => claim.state === "accepted")
        .reduce((sum, claim) => sum + unsignedMoney(claim.claimedEarnedAmount, "claimedEarnedAmount"), 0n);
      const budget = unsignedMoney(baseline.currentBudgetAmount, "currentBudgetAmount");
      return {
        currency: baseline.currency, currentBudget: baseline.currentBudgetAmount, commitments: formatMoney(commitments),
        actuals: formatMoney(actuals), accruals: formatMoney(accruals), acceptedProgress: formatMoney(progress),
        forecastRemaining: formatMoney(forecast), estimateAtCompletion: formatMoney(eac),
        varianceAtCompletion: formatMoney(budget - eac), contingencyDraws: formatMoney(total("contingency_draw")),
        reserveMovements: formatMoney(total("reserve_movement")),
      };
    });
  }

  public createProcurementRequisition(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    input: CreateProcurementRequisitionInput,
  ): Promise<ProcurementRequisitionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      const baseline = transaction.projectControlBaselineById(input.baselineId);
      if (!project || !baseline || baseline.projectId !== projectId) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "procurement.requisition.manage", resource: scope(project.businessScopeOrganizationId, projectId, baseline.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (baseline.state !== "approved" || currentApprovedBaseline(transaction, projectId)?.id !== baseline.id) {
        throw new ValidationError("The requisition must target the current approved baseline.", ["baseline_not_current"]);
      }
      if (input.items.length === 0) throw new ValidationError("At least one requisition item is required.", ["items_required"]);
      const itemKeys = new Set<string>();
      const items: ProcurementRequisitionItem[] = input.items.map((item) => {
        const itemKey = code(item.itemKey, "itemKey");
        const baselineLineKey = code(item.baselineLineKey, "baselineLineKey");
        const baselineLine = baseline.lines.find((candidate) => candidate.lineKey === baselineLineKey);
        if (itemKeys.has(itemKey) || !baselineLine) {
          throw new ValidationError("Requisition items require unique keys and current baseline mappings.", ["requisition_mapping_invalid"]);
        }
        itemKeys.add(itemKey);
        const unit = unitDefinition(item.unitCode);
        if (!unit) throw new ValidationError("The requisition unit is not controlled.", ["unit_code_invalid"]);
        const needBy = date(item.needBy, "needBy");
        if (needBy.getTime() <= now.getTime()) throw new ValidationError("The need date must be in the future.", ["need_by_invalid"]);
        const budgetAmount = unsignedMoney(item.budgetAmount, "budgetAmount");
        if (budgetAmount > unsignedMoney(baselineLine.budgetAmount, "baselineBudgetAmount")) {
          throw new ValidationError("The requisition item exceeds its baseline line budget.", ["requisition_budget_invalid"]);
        }
        return {
          itemKey, baselineLineKey, itemType: item.itemType, description: required(item.description, "description"),
          specificationReference: required(item.specificationReference, "specificationReference"),
          governingDocumentRevisionIds: validateReleasedDocumentRevisions(
            transaction, projectId, item.governingDocumentRevisionIds,
          ),
          quantity: formatDecimal(unsignedDecimal(item.quantity, "quantity", false)), unitCode: unit.code, needBy,
          deliveryTerms: required(item.deliveryTerms, "deliveryTerms"),
          inspectionRequirements: strings(item.inspectionRequirements, "inspectionRequirements", true),
          documentRequirements: strings(item.documentRequirements, "documentRequirements", true),
          turnoverRequirements: strings(item.turnoverRequirements, "turnoverRequirements", true),
          costCode: code(item.costCode, "costCode"),
          workPackageCode: item.workPackageCode === null ? null : code(item.workPackageCode, "workPackageCode"),
          budgetAmount: formatMoney(budgetAmount),
        };
      });
      const requisition: ProcurementRequisitionRecord = {
        id: this.idFactory(), businessScopeOrganizationId: project.businessScopeOrganizationId, projectId,
        baselineId: baseline.id, number: code(input.number, "number"), title: required(input.title, "title"), items,
        state: "draft", submittedAt: null, submittedBy: null, reviewedAt: null, reviewedBy: null, reviewReason: null,
        version: 1, createdAt: now, createdBy: context.userId, updatedAt: now, updatedBy: context.userId,
      };
      transaction.insertProcurementRequisition(requisition);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId, action: "procurement.requisition_created", objectType: "procurement_requisition",
        objectId: requisition.id, priorState: null, newState: requisition.state, reason: requisition.title,
        changedFields: { baselineId: baseline.id, itemCount: items.length,
          budgetAmount: formatMoney(items.reduce((sum, item) => sum + unsignedMoney(item.budgetAmount, "budgetAmount"), 0n)) },
      }));
      return requisition;
    });
  }

  public submitProcurementRequisition(
    context: AccessContext, assignments: readonly RoleAssignment[], requisitionId: string, expectedVersion: number,
  ): Promise<ProcurementRequisitionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const requisition = transaction.procurementRequisitionById(requisitionId);
      if (!requisition) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "procurement.requisition.manage", resource: scope(requisition.businessScopeOrganizationId, requisition.projectId, requisition.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (requisition.version !== expectedVersion) throw new ConflictError();
      if (requisition.state !== "draft") throw new ValidationError("The requisition is not a draft.", ["requisition_state_invalid"]);
      const submitted: ProcurementRequisitionRecord = {
        ...requisition, state: "under_review", submittedAt: now, submittedBy: context.userId,
        version: requisition.version + 1, updatedAt: now, updatedBy: context.userId,
      };
      transaction.updateProcurementRequisition(submitted, expectedVersion);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: requisition.projectId, action: "procurement.requisition_submitted", objectType: "procurement_requisition",
        objectId: requisition.id, priorState: requisition.state, newState: submitted.state, reason: null,
        changedFields: { version: submitted.version },
      }));
      return submitted;
    });
  }

  public reviewProcurementRequisition(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    requisitionId: string,
    expectedVersion: number,
    decision: "approve" | "reject",
    reason: string,
  ): Promise<ProcurementRequisitionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const requisition = transaction.procurementRequisitionById(requisitionId);
      if (!requisition) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "procurement.requisition.approve", resource: scope(requisition.businessScopeOrganizationId, requisition.projectId, requisition.id),
        requiredQualifications: ["procurement_authority"],
        forbiddenActorIds: [requisition.createdBy, requisition.submittedBy ?? requisition.createdBy], minimumAssurance: "step-up",
      }, now);
      if (requisition.version !== expectedVersion) throw new ConflictError();
      if (requisition.state !== "under_review") throw new ValidationError("The requisition is not under review.", ["requisition_state_invalid"]);
      const reviewed: ProcurementRequisitionRecord = {
        ...requisition, state: decision === "approve" ? "approved" : "rejected", reviewedAt: now,
        reviewedBy: context.userId, reviewReason: required(reason, "reason"), version: requisition.version + 1,
        updatedAt: now, updatedBy: context.userId,
      };
      transaction.updateProcurementRequisition(reviewed, expectedVersion);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: requisition.projectId,
        action: `procurement.requisition_${decision === "approve" ? "approved" : "rejected"}`,
        objectType: "procurement_requisition", objectId: requisition.id, priorState: requisition.state,
        newState: reviewed.state, reason: reviewed.reviewReason, changedFields: { state: reviewed.state },
      }));
      return reviewed;
    });
  }

  public createProcurementBidPackage(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    input: CreateProcurementBidPackageInput,
  ): Promise<ProcurementBidPackageRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      const requisition = transaction.procurementRequisitionById(input.requisitionId);
      if (!project || !requisition || requisition.projectId !== projectId) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "procurement.bid.manage", resource: scope(project.businessScopeOrganizationId, projectId, requisition.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (requisition.state !== "approved") throw new ValidationError("Only an approved requisition can be bid.", ["requisition_state_invalid"]);
      const bidderOrganizationIds = strings(input.bidderOrganizationIds, "bidderOrganizationIds", true);
      if (bidderOrganizationIds.length < 2) throw new ValidationError("At least two bidders are required for comparison.", ["bidders_required"]);
      const bidPackage: ProcurementBidPackageRecord = {
        id: this.idFactory(), businessScopeOrganizationId: project.businessScopeOrganizationId, projectId,
        requisitionId: requisition.id, number: code(input.number, "number"), bidderOrganizationIds, offers: [],
        recommendedOfferKey: null, recommendationReason: null, recommendedAt: null, recommendedBy: null,
        awardedOfferKey: null, awardReason: null, awardedAt: null, awardedBy: null,
        state: "issued", version: 1, createdAt: now, createdBy: context.userId, updatedAt: now, updatedBy: context.userId,
      };
      transaction.insertProcurementBidPackage(bidPackage);
      transaction.updateProcurementRequisition({ ...requisition, state: "issued", version: requisition.version + 1,
        updatedAt: now, updatedBy: context.userId }, requisition.version);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId, action: "procurement.bid_package_issued", objectType: "procurement_bid_package",
        objectId: bidPackage.id, priorState: null, newState: bidPackage.state, reason: null,
        changedFields: { requisitionId: requisition.id, bidderOrganizationIds },
      }));
      return bidPackage;
    });
  }

  public recordProcurementOffer(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    bidPackageId: string,
    expectedVersion: number,
    input: RecordProcurementOfferInput,
  ): Promise<ProcurementBidPackageRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const bidPackage = transaction.procurementBidPackageById(bidPackageId);
      const requisition = bidPackage ? transaction.procurementRequisitionById(bidPackage.requisitionId) : null;
      if (!bidPackage || !requisition) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "procurement.bid.manage", resource: scope(bidPackage.businessScopeOrganizationId, bidPackage.projectId, bidPackage.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (bidPackage.version !== expectedVersion) throw new ConflictError();
      if (!['issued', 'comparison'].includes(bidPackage.state)) {
        throw new ValidationError("The bid package no longer accepts offers.", ["bid_package_state_invalid"]);
      }
      if (!bidPackage.bidderOrganizationIds.includes(input.vendorOrganizationId)
        || bidPackage.offers.some((offer) => offer.offerKey === input.offerKey
          || offer.vendorOrganizationId === input.vendorOrganizationId)) {
        throw new ValidationError("The offer is duplicate or outside the invited bidders.", ["offer_vendor_invalid"]);
      }
      const file = transaction.governedFileById(input.sourceFileId);
      if (!file || file.projectId !== bidPackage.projectId
        || file.businessScopeOrganizationId !== bidPackage.businessScopeOrganizationId
        || file.validationState !== "released" || file.malwareState !== "clean"
        || file.sha256 !== sha256Value(input.sourceSha256, "sourceSha256")
        || file.detectedSha256 !== file.sha256) {
        throw new ValidationError("The offer source must be the exact released project file.", ["offer_source_invalid"]);
      }
      const baseline = transaction.projectControlBaselineById(requisition.baselineId);
      if (!baseline || currency(input.currency) !== baseline.currency) {
        throw new ValidationError("The offer currency does not match the controlled baseline.", ["currency_mismatch"]);
      }
      const itemKeys = new Set(requisition.items.map((item) => item.itemKey));
      const unresolvedItemKeys = strings(input.unresolvedItemKeys, "unresolvedItemKeys");
      if (unresolvedItemKeys.some((key) => !itemKeys.has(key))) {
        throw new ValidationError("An unresolved offer item is outside the requisition.", ["offer_scope_invalid"]);
      }
      const offer: ProcurementOffer = {
        offerKey: code(input.offerKey, "offerKey"),
        vendorOrganizationId: required(input.vendorOrganizationId, "vendorOrganizationId", 128),
        quoteReference: required(input.quoteReference, "quoteReference"), sourceFileId: file.id, sourceSha256: file.sha256,
        currency: baseline.currency, validUntil: date(input.validUntil, "validUntil"),
        totalAmount: formatMoney(unsignedMoney(input.totalAmount, "totalAmount")), promisedDate: date(input.promisedDate, "promisedDate"),
        inclusions: strings(input.inclusions, "inclusions"), exclusions: strings(input.exclusions, "exclusions"),
        clarifications: strings(input.clarifications, "clarifications"), unresolvedItemKeys,
        receivedAt: now, receivedBy: context.userId,
      };
      const updated: ProcurementBidPackageRecord = {
        ...bidPackage, offers: [...bidPackage.offers, offer], state: "comparison",
        version: bidPackage.version + 1, updatedAt: now, updatedBy: context.userId,
      };
      transaction.updateProcurementBidPackage(updated, expectedVersion);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: bidPackage.projectId, action: "procurement.offer_recorded", objectType: "procurement_bid_package",
        objectId: bidPackage.id, priorState: bidPackage.state, newState: updated.state, reason: null,
        changedFields: { offerKey: offer.offerKey, vendorOrganizationId: offer.vendorOrganizationId,
          totalAmount: offer.totalAmount, sourceFileId: offer.sourceFileId, sourceSha256: offer.sourceSha256,
          unresolvedItemKeys: offer.unresolvedItemKeys },
      }));
      return updated;
    });
  }

  public recommendProcurementOffer(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    bidPackageId: string,
    expectedVersion: number,
    offerKey: string,
    reason: string,
  ): Promise<ProcurementBidPackageRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const bidPackage = transaction.procurementBidPackageById(bidPackageId);
      if (!bidPackage) throw new NotFoundError();
      const offer = bidPackage.offers.find((candidate) => candidate.offerKey === code(offerKey, "offerKey"));
      if (!offer) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "procurement.bid.recommend", resource: scope(bidPackage.businessScopeOrganizationId, bidPackage.projectId, bidPackage.id),
        requiredQualifications: ["procurement_authority"], forbiddenActorIds: [offer.receivedBy], minimumAssurance: "mfa",
      }, now);
      if (bidPackage.version !== expectedVersion) throw new ConflictError();
      if (bidPackage.state !== "comparison" || bidPackage.offers.length < 2
        || offer.unresolvedItemKeys.length > 0 || offer.validUntil.getTime() <= now.getTime()) {
        throw new ValidationError("Recommendation requires a current complete offer and comparative bids.", ["offer_not_recommendable"]);
      }
      const updated: ProcurementBidPackageRecord = {
        ...bidPackage, recommendedOfferKey: offer.offerKey, recommendationReason: required(reason, "reason"),
        recommendedAt: now, recommendedBy: context.userId, state: "recommended", version: bidPackage.version + 1,
        updatedAt: now, updatedBy: context.userId,
      };
      transaction.updateProcurementBidPackage(updated, expectedVersion);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: bidPackage.projectId, action: "procurement.offer_recommended", objectType: "procurement_bid_package",
        objectId: bidPackage.id, priorState: bidPackage.state, newState: updated.state,
        reason: updated.recommendationReason, changedFields: { offerKey: offer.offerKey, totalAmount: offer.totalAmount },
      }));
      return updated;
    });
  }

  public awardProcurementOffer(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    bidPackageId: string,
    input: AwardProcurementInput,
  ): Promise<{ readonly bidPackage: ProcurementBidPackageRecord; readonly commitment: ProcurementCommitmentRecord }> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const bidPackage = transaction.procurementBidPackageById(bidPackageId);
      const requisition = bidPackage ? transaction.procurementRequisitionById(bidPackage.requisitionId) : null;
      const offer = bidPackage?.offers.find((candidate) => candidate.offerKey === bidPackage.recommendedOfferKey);
      const baseline = requisition ? transaction.projectControlBaselineById(requisition.baselineId) : null;
      if (!bidPackage || !requisition || !offer || !baseline) throw new NotFoundError();
      const policy = activeControlsPolicy(transaction, bidPackage.businessScopeOrganizationId, baseline.currency);
      const aboveLimit = unsignedMoney(offer.totalAmount, "totalAmount")
        > unsignedMoney(policy.standardProcurementAwardLimit, "standardProcurementAwardLimit");
      requireAuthorization(context, assignments, {
        action: "procurement.bid.award", resource: scope(bidPackage.businessScopeOrganizationId, bidPackage.projectId, bidPackage.id),
        requiredQualifications: ["procurement_authority", ...(aboveLimit ? [policy.procurementAboveThresholdQualification] : [])],
        forbiddenActorIds: [bidPackage.recommendedBy ?? bidPackage.createdBy, offer.receivedBy], minimumAssurance: "step-up",
      }, now);
      if (bidPackage.version !== input.expectedVersion) throw new ConflictError();
      if (bidPackage.state !== "recommended" || offer.validUntil.getTime() <= now.getTime()) {
        throw new ValidationError("The recommended offer is not awardable.", ["offer_not_awardable"]);
      }
      const purchaseOrderReference = required(input.purchaseOrderReference, "purchaseOrderReference", 128);
      if (transaction.procurementCommitments(bidPackage.projectId)
        .some((commitment) => commitment.purchaseOrderReference === purchaseOrderReference
          && commitment.revision === code(input.revision, "revision"))) throw new ConflictError();
      const commitment: ProcurementCommitmentRecord = {
        id: this.idFactory(), businessScopeOrganizationId: bidPackage.businessScopeOrganizationId,
        projectId: bidPackage.projectId, baselineId: baseline.id, requisitionId: requisition.id,
        bidPackageId: bidPackage.id, offerKey: offer.offerKey, vendorOrganizationId: offer.vendorOrganizationId,
        purchaseOrderReference, revision: code(input.revision, "revision"), amount: offer.totalAmount,
        currency: offer.currency, statusEvents: [], state: "awarded", version: 1,
        createdAt: now, createdBy: context.userId, updatedAt: now, updatedBy: context.userId,
      };
      const awarded: ProcurementBidPackageRecord = {
        ...bidPackage, awardedOfferKey: offer.offerKey, awardReason: required(input.reason, "reason"),
        awardedAt: now, awardedBy: context.userId, state: "awarded", version: bidPackage.version + 1,
        updatedAt: now, updatedBy: context.userId,
      };
      transaction.insertProcurementCommitment(commitment);
      transaction.updateProcurementBidPackage(awarded, input.expectedVersion);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: bidPackage.projectId, action: "procurement.offer_awarded", objectType: "procurement_commitment",
        objectId: commitment.id, priorState: null, newState: commitment.state, reason: awarded.awardReason,
        changedFields: { bidPackageId: bidPackage.id, offerKey: offer.offerKey, purchaseOrderReference,
          amount: commitment.amount, currency: commitment.currency, authorityPolicyId: policy.id },
      }));
      return { bidPackage: awarded, commitment };
    });
  }

  public recordProcurementStatus(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    commitmentId: string,
    input: RecordProcurementStatusInput,
  ): Promise<ProcurementCommitmentRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const commitment = transaction.procurementCommitmentById(commitmentId);
      if (!commitment) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "procurement.expedite.manage", resource: scope(commitment.businessScopeOrganizationId, commitment.projectId, commitment.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (commitment.version !== input.expectedVersion) throw new ConflictError();
      if (commitment.state === "closed") throw new ValidationError("A closed commitment cannot receive status.", ["commitment_state_invalid"]);
      const evidenceFileIds = validateReleasedFiles(
        transaction, commitment.businessScopeOrganizationId, commitment.projectId,
        input.evidenceFileIds, "evidenceFileIds", input.eventType !== "exception",
      );
      const receivedMaterialItemIds = strings(input.receivedMaterialItemIds, "receivedMaterialItemIds");
      if (input.eventType === "receipt" && receivedMaterialItemIds.length === 0) {
        throw new ValidationError("A receipt event must link at least one received material item.", ["receiving_link_required"]);
      }
      if (receivedMaterialItemIds.some((materialId) => transaction.materialById(materialId)?.projectId !== commitment.projectId)) {
        throw new ValidationError("Received material links must resolve inside the commitment project.", ["receiving_link_invalid"]);
      }
      const stateByEvent: Record<RecordProcurementStatusInput["eventType"], ProcurementCommitmentRecord["state"]> = {
        acknowledgement: "acknowledged", submittal: commitment.state,
        fabrication_milestone: "in_fabrication", shipment: "shipped", exception: "exception", receipt: "received",
      };
      const statusEvent = {
        id: this.idFactory(), eventType: input.eventType, status: required(input.status, "status"),
        promisedAt: input.promisedAt === null ? null : date(input.promisedAt, "promisedAt"),
        forecastAt: input.forecastAt === null ? null : date(input.forecastAt, "forecastAt"),
        actualAt: input.actualAt === null ? null : date(input.actualAt, "actualAt"),
        sourceReference: required(input.sourceReference, "sourceReference"), evidenceFileIds,
        receivedMaterialItemIds,
        responsibleUserId: required(input.responsibleUserId, "responsibleUserId", 128), recordedAt: now, recordedBy: context.userId,
      };
      const updated: ProcurementCommitmentRecord = {
        ...commitment, statusEvents: [...commitment.statusEvents, statusEvent], state: stateByEvent[input.eventType],
        version: commitment.version + 1, updatedAt: now, updatedBy: context.userId,
      };
      transaction.updateProcurementCommitment(updated, input.expectedVersion);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: commitment.projectId, action: "procurement.status_recorded", objectType: "procurement_commitment",
        objectId: commitment.id, priorState: commitment.state, newState: updated.state, reason: statusEvent.status,
        changedFields: { eventType: statusEvent.eventType, promisedAt: statusEvent.promisedAt,
          forecastAt: statusEvent.forecastAt, actualAt: statusEvent.actualAt, sourceReference: statusEvent.sourceReference,
          evidenceFileIds, receivedMaterialItemIds },
      }));
      return updated;
    });
  }

  public createScheduleProgram(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    input: CreateScheduleProgramInput,
  ): Promise<ScheduleProgramRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "schedule.manage", resource: scope(project.businessScopeOrganizationId, projectId, null),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      const timeZone = canonicalTimeZone(input.timeZone);
      if (!timeZone) throw new ValidationError("The schedule time zone is invalid.", ["time_zone_invalid"]);
      const schedule: ScheduleProgramRecord = {
        id: this.idFactory(), businessScopeOrganizationId: project.businessScopeOrganizationId, projectId,
        number: code(input.number, "number"), name: required(input.name, "name"), timeZone,
        currentRevisionId: null, version: 1, createdAt: now, createdBy: context.userId,
        updatedAt: now, updatedBy: context.userId,
      };
      transaction.insertScheduleProgram(schedule);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId, action: "schedule.created", objectType: "schedule_program", objectId: schedule.id,
        priorState: null, newState: "draft", reason: null,
        changedFields: { number: schedule.number, timeZone: schedule.timeZone },
      }));
      return schedule;
    });
  }

  public createScheduleRevision(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    scheduleId: string,
    expectedScheduleVersion: number,
    input: CreateScheduleRevisionInput,
  ): Promise<ScheduleRevisionRecord> {
    const now = this.clock();
    if (input.sourceSystem !== "manual" || input.sourceVersion !== null || input.sourceSha256 !== null) {
      throw new ValidationError("Provider schedule data must use the controlled import preview.", ["schedule_import_required"]);
    }
    return this.store.transaction((transaction) => {
      const schedule = transaction.scheduleProgramById(scheduleId);
      const baseline = transaction.projectControlBaselineById(input.sourceBaselineId);
      if (!schedule || !baseline || baseline.projectId !== schedule.projectId) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "schedule.manage", resource: scope(schedule.businessScopeOrganizationId, schedule.projectId, schedule.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (schedule.version !== expectedScheduleVersion) throw new ConflictError();
      if (baseline.state !== "approved" || currentApprovedBaseline(transaction, schedule.projectId)?.id !== baseline.id) {
        throw new ValidationError("The schedule revision must use the current approved control baseline.", ["baseline_not_current"]);
      }
      const parent = input.parentRevisionId ? transaction.scheduleRevisionById(input.parentRevisionId) : null;
      if (input.revisionType === "baseline") {
        if (parent || schedule.currentRevisionId) throw new ValidationError("A baseline cannot replace an approved schedule update.", ["schedule_parent_invalid"]);
      } else if (!parent || parent.id !== schedule.currentRevisionId || parent.state !== "approved") {
        throw new ValidationError("An update must succeed the exact current approved revision.", ["schedule_parent_invalid"]);
      }
      const errors = scheduleDataErrors(transaction, schedule.projectId, schedule.id, input.activities, input.dependencies);
      if (errors.length > 0) throw new ValidationError("The schedule data is invalid.", errors);
      const normalized = normalizeScheduleData(input.activities, input.dependencies);
      if (parent) {
        for (const prior of parent.activities) {
          const next = normalized.activities.find((activity) => activity.activityKey === prior.activityKey);
          if (!next || (prior.actualStart && !next.actualStart) || (prior.actualFinish && !next.actualFinish)
            || unsignedDecimal(next.acceptedProgressPercent, "acceptedProgressPercent")
              < unsignedDecimal(prior.acceptedProgressPercent, "acceptedProgressPercent")) {
            throw new ValidationError("Schedule updates cannot remove actuals or reduce accepted progress.", ["schedule_history_invalid"]);
          }
        }
      }
      const revision: ScheduleRevisionRecord = {
        id: this.idFactory(), scheduleId: schedule.id, revision: code(input.revision, "revision"),
        revisionType: input.revisionType, parentRevisionId: parent?.id ?? null, sourceBaselineId: baseline.id,
        dataDate: date(input.dataDate, "dataDate"), reason: required(input.reason, "reason"), sourceSystem: "manual",
        sourceVersion: null, sourceSha256: null, activities: normalized.activities, dependencies: normalized.dependencies,
        baselineVarianceDays: baselineVarianceDays(transaction, schedule.id, normalized.activities), state: "draft",
        submittedAt: null, submittedBy: null, reviewedAt: null, reviewedBy: null, reviewReason: null,
        version: 1, createdAt: now, createdBy: context.userId,
      };
      transaction.insertScheduleRevision(revision);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: schedule.projectId, action: "schedule.revision_created", objectType: "schedule_revision",
        objectId: revision.id, priorState: null, newState: revision.state, reason: revision.reason,
        changedFields: { revision: revision.revision, revisionType: revision.revisionType,
          parentRevisionId: revision.parentRevisionId, sourceBaselineId: baseline.id,
          activityCount: revision.activities.length, dependencyCount: revision.dependencies.length,
          baselineVarianceDays: revision.baselineVarianceDays },
      }));
      return revision;
    });
  }

  public submitScheduleRevision(
    context: AccessContext, assignments: readonly RoleAssignment[], revisionId: string, expectedVersion: number,
  ): Promise<ScheduleRevisionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const revision = transaction.scheduleRevisionById(revisionId);
      const schedule = revision ? transaction.scheduleProgramById(revision.scheduleId) : null;
      if (!revision || !schedule) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "schedule.manage", resource: scope(schedule.businessScopeOrganizationId, schedule.projectId, revision.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (revision.version !== expectedVersion) throw new ConflictError();
      if (revision.state !== "draft" || revision.activities.length === 0) {
        throw new ValidationError("Only a complete draft schedule revision can be submitted.", ["schedule_state_invalid"]);
      }
      const submitted: ScheduleRevisionRecord = {
        ...revision, state: "under_review", submittedAt: now, submittedBy: context.userId, version: revision.version + 1,
      };
      transaction.updateScheduleRevision(submitted, expectedVersion);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: schedule.projectId, action: "schedule.revision_submitted", objectType: "schedule_revision",
        objectId: revision.id, priorState: revision.state, newState: submitted.state, reason: null,
        changedFields: { version: submitted.version, sourceSha256: submitted.sourceSha256 },
      }));
      return submitted;
    });
  }

  public reviewScheduleRevision(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    revisionId: string,
    expectedVersion: number,
    decision: "approve" | "reject",
    reason: string,
  ): Promise<ScheduleRevisionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const revision = transaction.scheduleRevisionById(revisionId);
      const schedule = revision ? transaction.scheduleProgramById(revision.scheduleId) : null;
      if (!revision || !schedule) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "schedule.approve", resource: scope(schedule.businessScopeOrganizationId, schedule.projectId, revision.id),
        requiredQualifications: ["scheduling_authority"],
        forbiddenActorIds: [revision.createdBy, revision.submittedBy ?? revision.createdBy], minimumAssurance: "step-up",
      }, now);
      if (revision.version !== expectedVersion) throw new ConflictError();
      if (revision.state !== "under_review") throw new ValidationError("The schedule revision is not under review.", ["schedule_state_invalid"]);
      if (decision === "approve") {
        const current = schedule.currentRevisionId ? transaction.scheduleRevisionById(schedule.currentRevisionId) : null;
        if ((current?.id ?? null) !== revision.parentRevisionId) {
          throw new ConflictError("The schedule revision no longer succeeds the exact current revision.");
        }
        if (current) transaction.updateScheduleRevision({ ...current, state: "superseded", version: current.version + 1 }, current.version);
        transaction.updateScheduleProgram({ ...schedule, currentRevisionId: revision.id, version: schedule.version + 1,
          updatedAt: now, updatedBy: context.userId }, schedule.version);
      }
      const reviewed: ScheduleRevisionRecord = {
        ...revision, state: decision === "approve" ? "approved" : "rejected", reviewedAt: now,
        reviewedBy: context.userId, reviewReason: required(reason, "reason"), version: revision.version + 1,
      };
      transaction.updateScheduleRevision(reviewed, expectedVersion);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: schedule.projectId, action: `schedule.revision_${decision === "approve" ? "approved" : "rejected"}`,
        objectType: "schedule_revision", objectId: revision.id, priorState: revision.state,
        newState: reviewed.state, reason: reviewed.reviewReason,
        changedFields: { revision: reviewed.revision, dataDate: reviewed.dataDate,
          baselineVarianceDays: reviewed.baselineVarianceDays, sourceSha256: reviewed.sourceSha256 },
      }));
      return reviewed;
    });
  }

  public previewScheduleImport(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    scheduleId: string,
    input: PreviewScheduleImportInput,
  ): Promise<ScheduleImportRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const schedule = transaction.scheduleProgramById(scheduleId);
      if (!schedule) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "schedule.import", resource: scope(schedule.businessScopeOrganizationId, schedule.projectId, schedule.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      const idempotencyKey = required(input.idempotencyKey, "idempotencyKey", 128);
      const sourceSha256 = sha256Value(input.sourceSha256, "sourceSha256");
      const existing = transaction.scheduleImportByKey(schedule.projectId, idempotencyKey);
      if (existing) {
        if (existing.sourceSha256 !== sourceSha256 || existing.scheduleId !== schedule.id
          || existing.sourceSystem !== input.sourceSystem) throw new ConflictError("The import idempotency key has different source content.");
        return existing;
      }
      const file = transaction.governedFileById(input.sourceFileId);
      if (!file || file.projectId !== schedule.projectId
        || file.businessScopeOrganizationId !== schedule.businessScopeOrganizationId
        || file.validationState !== "released" || file.malwareState !== "clean"
        || file.sha256 !== sourceSha256 || file.detectedSha256 !== file.sha256) {
        throw new ValidationError("The schedule source must be the exact released project file.", ["schedule_source_invalid"]);
      }
      const normalized = normalizeScheduleData(input.activities, input.dependencies);
      const previewErrors = scheduleDataErrors(
        transaction, schedule.projectId, schedule.id, normalized.activities, normalized.dependencies,
      );
      const parent = input.parentRevisionId ? transaction.scheduleRevisionById(input.parentRevisionId) : null;
      if (input.targetRevisionType === "baseline") {
        if (parent || schedule.currentRevisionId) (previewErrors as string[]).push("schedule_parent_invalid");
      } else if (!parent || parent.id !== schedule.currentRevisionId || parent.state !== "approved") {
        (previewErrors as string[]).push("schedule_parent_invalid");
      }
      const scheduleImport: ScheduleImportRecord = {
        id: this.idFactory(), businessScopeOrganizationId: schedule.businessScopeOrganizationId,
        projectId: schedule.projectId, scheduleId: schedule.id, idempotencyKey,
        sourceSystem: input.sourceSystem, sourceVersion: required(input.sourceVersion, "sourceVersion", 128),
        sourceFileId: file.id, sourceSha256, mappingVersion: code(input.mappingVersion, "mappingVersion"),
        targetRevision: code(input.targetRevision, "targetRevision"), targetRevisionType: input.targetRevisionType,
        parentRevisionId: parent?.id ?? null, dataDate: date(input.dataDate, "dataDate"),
        activities: normalized.activities, dependencies: normalized.dependencies,
        previewErrors: [...new Set(previewErrors)].sort(), state: previewErrors.length > 0 ? "invalid" : "previewed",
        committedRevisionId: null, version: 1, createdAt: now, createdBy: context.userId,
        committedAt: null, committedBy: null,
      };
      transaction.insertScheduleImport(scheduleImport);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: schedule.projectId, action: "schedule.import_previewed", objectType: "schedule_import",
        objectId: scheduleImport.id, priorState: null, newState: scheduleImport.state, reason: null,
        changedFields: { sourceSystem: scheduleImport.sourceSystem, sourceVersion: scheduleImport.sourceVersion,
          sourceFileId: scheduleImport.sourceFileId, sourceSha256, mappingVersion: scheduleImport.mappingVersion,
          previewErrors: scheduleImport.previewErrors },
      }));
      return scheduleImport;
    });
  }

  public commitScheduleImport(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    importId: string,
    expectedVersion: number,
  ): Promise<{ readonly scheduleImport: ScheduleImportRecord; readonly revision: ScheduleRevisionRecord }> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const scheduleImport = transaction.scheduleImportById(importId);
      const schedule = scheduleImport ? transaction.scheduleProgramById(scheduleImport.scheduleId) : null;
      if (!scheduleImport || !schedule) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "schedule.import", resource: scope(schedule.businessScopeOrganizationId, schedule.projectId, scheduleImport.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (scheduleImport.version !== expectedVersion) throw new ConflictError();
      if (scheduleImport.state === "committed" && scheduleImport.committedRevisionId) {
        const revision = transaction.scheduleRevisionById(scheduleImport.committedRevisionId);
        if (!revision) throw new ConflictError("The committed import revision is missing.");
        return { scheduleImport, revision };
      }
      if (scheduleImport.state !== "previewed" || scheduleImport.previewErrors.length > 0) {
        throw new ValidationError("Only a valid preview can be committed.", ["schedule_import_invalid"]);
      }
      const baseline = currentApprovedBaseline(transaction, schedule.projectId);
      if (!baseline) throw new ValidationError("An approved project-control baseline is required.", ["baseline_required"]);
      const parent = scheduleImport.parentRevisionId ? transaction.scheduleRevisionById(scheduleImport.parentRevisionId) : null;
      if ((scheduleImport.targetRevisionType === "baseline" && (parent || schedule.currentRevisionId))
        || (scheduleImport.targetRevisionType === "update"
          && (!parent || parent.id !== schedule.currentRevisionId || parent.state !== "approved"))) {
        throw new ConflictError("The schedule changed after import preview.");
      }
      const file = transaction.governedFileById(scheduleImport.sourceFileId);
      if (!file || file.validationState !== "released" || file.sha256 !== scheduleImport.sourceSha256
        || file.detectedSha256 !== file.sha256) throw new ConflictError("The import source is no longer valid.");
      const revision: ScheduleRevisionRecord = {
        id: this.idFactory(), scheduleId: schedule.id, revision: scheduleImport.targetRevision,
        revisionType: scheduleImport.targetRevisionType, parentRevisionId: parent?.id ?? null,
        sourceBaselineId: baseline.id, dataDate: scheduleImport.dataDate,
        reason: `Imported ${scheduleImport.sourceSystem} ${scheduleImport.sourceVersion}`,
        sourceSystem: scheduleImport.sourceSystem, sourceVersion: scheduleImport.sourceVersion,
        sourceSha256: scheduleImport.sourceSha256, activities: scheduleImport.activities,
        dependencies: scheduleImport.dependencies,
        baselineVarianceDays: baselineVarianceDays(transaction, schedule.id, scheduleImport.activities),
        state: "draft", submittedAt: null, submittedBy: null, reviewedAt: null,
        reviewedBy: null, reviewReason: null, version: 1, createdAt: now, createdBy: context.userId,
      };
      const committed: ScheduleImportRecord = {
        ...scheduleImport, state: "committed", committedRevisionId: revision.id,
        version: scheduleImport.version + 1, committedAt: now, committedBy: context.userId,
      };
      transaction.insertScheduleRevision(revision);
      transaction.updateScheduleImport(committed, expectedVersion);
      transaction.appendAudit(event(this.idFactory, now, context, {
        projectId: schedule.projectId, action: "schedule.import_committed", objectType: "schedule_import",
        objectId: scheduleImport.id, priorState: scheduleImport.state, newState: committed.state, reason: null,
        changedFields: { revisionId: revision.id, targetRevision: revision.revision,
          sourceFileId: scheduleImport.sourceFileId, sourceSha256: scheduleImport.sourceSha256 },
      }));
      return { scheduleImport: committed, revision };
    });
  }

  public scheduleLookAhead(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    scheduleId: string,
    windowDays: number,
  ): Promise<readonly {
    readonly activity: ScheduleActivity;
    readonly blockers: readonly string[];
  }[]> {
    if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 180) {
      throw new ValidationError("The look-ahead window must be 1 to 180 days.", ["window_days_invalid"]);
    }
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const schedule = transaction.scheduleProgramById(scheduleId);
      const revision = schedule?.currentRevisionId ? transaction.scheduleRevisionById(schedule.currentRevisionId) : null;
      if (!schedule || !revision) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "schedule.read", resource: scope(schedule.businessScopeOrganizationId, schedule.projectId, schedule.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "standard",
      }, now);
      if (revision.state !== "approved") throw new ValidationError("The current schedule is not approved.", ["schedule_state_invalid"]);
      const windowFinish = revision.dataDate.getTime() + windowDays * 86_400_000;
      return revision.activities.filter((activity) => activity.plannedFinish.getTime() >= revision.dataDate.getTime()
        && activity.plannedStart.getTime() <= windowFinish).map((activity) => {
        const blockers = [...activity.constraintCodes];
        for (const revisionId of activity.requiredDocumentRevisionIds) {
          if (transaction.revisionById(revisionId)?.state !== "released") blockers.push(`DOCUMENT:${revisionId}`);
        }
        for (const materialId of activity.requiredMaterialItemIds) {
          const material = transaction.materialById(materialId);
          if (!material || !["released", "issued", "installed"].includes(material.state)) blockers.push(`MATERIAL:${materialId}`);
        }
        for (const inspectionId of activity.requiredInspectionIds) {
          if (transaction.inspectionById(inspectionId)?.state !== "accepted") blockers.push(`INSPECTION:${inspectionId}`);
        }
        return { activity, blockers: [...new Set(blockers)].sort() };
      });
    });
  }

  public projectSnapshot(
    context: AccessContext, assignments: readonly RoleAssignment[], projectId: string,
  ): Promise<ProjectControlsSnapshot> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "controls.read", resource: scope(project.businessScopeOrganizationId, projectId, null),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "standard",
      }, now);
      const schedules = transaction.schedulePrograms(projectId);
      return {
        baselines: transaction.projectControlBaselines(projectId), changes: transaction.projectChangeRequests(projectId),
        costEntries: transaction.projectCostEntries(projectId), progressClaims: transaction.projectProgressClaims(projectId),
        requisitions: transaction.procurementRequisitions(projectId), bidPackages: transaction.procurementBidPackages(projectId),
        commitments: transaction.procurementCommitments(projectId), schedules,
        scheduleRevisions: schedules.flatMap((schedule) => transaction.scheduleRevisions(schedule.id)),
        scheduleImports: transaction.scheduleImports(projectId),
      };
    });
  }
}
