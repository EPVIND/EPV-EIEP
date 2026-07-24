import { createHash, randomUUID } from "node:crypto";
import type { AccessContext, AuditEvent, EngineeringRegisterItemRevisionRecord, EngineeringRegisterType,
  EngineeringValidationFinding, RoleAssignment } from "@eiep/shared-types";
import { requireAuthorization } from "@eiep/rules-engine";
import { ConflictError, NotFoundError, ValidationError } from "./errors.js";
import type { FoundationStore, FoundationTransaction } from "./foundation-store.js";

type Clock = () => Date;
type IdFactory = () => string;

export interface CreateEngineeringRegisterItemInput {
  readonly registerType: EngineeringRegisterType;
  readonly tag: string;
  readonly revision: string;
  readonly parentRevisionId: string | null;
  readonly revisionReason: string;
  readonly title: string;
  readonly disciplineCode: string;
  readonly systemCode: string | null;
  readonly areaCode: string | null;
  readonly workPackageCode: string | null;
  readonly responsibleOrganizationId: string;
  readonly documentRevisionIds: readonly string[];
  readonly relatedItemRevisionIds: readonly string[];
  readonly attributes: Readonly<Record<string, string>>;
  readonly plannedIssueDate: Date | null;
  readonly forecastIssueDate: Date | null;
  readonly actualIssueDate: Date | null;
}

export interface EngineeringRegisterSnapshot {
  readonly generatedAt: Date;
  readonly items: readonly EngineeringRegisterItemRevisionRecord[];
  readonly counts: Readonly<Record<EngineeringRegisterType, number>>;
  readonly openValidationFindingCount: number;
}

const registerTypes: readonly EngineeringRegisterType[] = ["requirement", "deliverable", "system", "equipment", "line", "instrument", "component", "tag"];

function required(value: string, field: string, maximum = 4_000): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || /[\u0000\r\n]/u.test(normalized)) throw new ValidationError(`${field} is invalid.`, [`${field}_invalid`]);
  return normalized;
}
function code(value: string, field: string): string {
  const normalized = required(value, field, 96).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_.\/-]{0,95}$/u.test(normalized)) throw new ValidationError(`${field} is invalid.`, [`${field}_invalid`]);
  return normalized;
}
function optionalCode(value: string | null, field: string): string | null { return value === null || value.trim() === "" ? null : code(value, field); }
function strings(values: readonly string[], field: string): readonly string[] {
  const normalized = values.map((value) => required(value, field, 256));
  if (new Set(normalized).size !== normalized.length) throw new ValidationError(`${field} contains duplicates.`, [`${field}_duplicate`]);
  return normalized;
}
function attributes(values: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  const entries = Object.entries(values);
  if (entries.length > 32) throw new ValidationError("Too many register attributes.", ["engineering_attributes_excessive"]);
  return Object.fromEntries(entries.map(([key, value]) => [code(key, "attributeKey"), required(value, "attributeValue", 2_000)]));
}
function optionalDate(value: Date | null, field: string): Date | null {
  if (value === null) return null;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new ValidationError(`${field} is invalid.`, [`${field}_invalid`]);
  return new Date(value);
}
function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
function canonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
function scope(organizationId: string, projectId: string, objectId: string | null) { return { organizationId, projectId, workPackageId: null, objectId }; }
function audit(idFactory: IdFactory, occurredAt: Date, context: AccessContext,
  input: Omit<AuditEvent, "id" | "occurredAt" | "actorUserId" | "actingOrganizationId" | "correlationId" | "canonicalSha256">): AuditEvent {
  const payload = { actorUserId: context.userId, actingOrganizationId: context.actingOrganizationId, projectId: input.projectId,
    action: input.action, objectType: input.objectType, objectId: input.objectId, priorState: input.priorState, newState: input.newState,
    reason: input.reason, correlationId: context.correlationId, changedFields: input.changedFields };
  return { id: idFactory(), occurredAt, ...payload, canonicalSha256: sha256(JSON.stringify(payload)) };
}

function findings(transaction: FoundationTransaction, projectId: string, input: CreateEngineeringRegisterItemInput): readonly EngineeringValidationFinding[] {
  const result: EngineeringValidationFinding[] = [];
  const add = (codeValue: string, detail: string) => result.push({ code: codeValue, severity: "error", detail });
  for (const [type, value] of [["system", input.systemCode], ["area", input.areaCode], ["work_package", input.workPackageCode]] as const) {
    if (value && transaction.projectStructureByCode(projectId, type, value)?.state !== "active") add(`${type}_scope_invalid`, `${type.replace("_", " ")} is not an active project structure element.`);
  }
  const participant = transaction.projectOrganizationsForProject(projectId).find((item) => item.organizationId === input.responsibleOrganizationId && item.state === "active");
  if (!participant) add("responsible_organization_invalid", "Responsible organization is not an active project participant.");
  for (const revisionId of input.documentRevisionIds) {
    const revision = transaction.revisionById(revisionId); const document = revision ? transaction.documentById(revision.documentId) : null;
    if (!revision || !document || document.projectId !== projectId || revision.state !== "released") add("document_revision_invalid", `Document revision ${revisionId} is not released in this project.`);
  }
  for (const relatedId of input.relatedItemRevisionIds) {
    const related = transaction.engineeringRegisterItemById(relatedId);
    if (!related || related.projectId !== projectId || !["approved", "superseded"].includes(related.state)) add("related_item_invalid", `Related item ${relatedId} is not an approved project register revision.`);
  }
  if (["equipment", "line", "instrument", "component"].includes(input.registerType) && !input.systemCode) add("system_scope_required", "This register type requires a project system.");
  if (input.registerType === "deliverable" && !input.plannedIssueDate) add("planned_issue_required", "Deliverables require a planned issue date.");
  if (input.actualIssueDate && input.documentRevisionIds.length === 0) add("actual_issue_document_required", "Actual issue requires an exact released document revision.");
  if (input.plannedIssueDate && input.forecastIssueDate && input.forecastIssueDate.getTime() < input.plannedIssueDate.getTime()) {
    result.push({ code: "forecast_before_plan", severity: "warning", detail: "Forecast is earlier than the planned issue date and requires engineering review." });
  }
  return result;
}

export class EngineeringRegisterService {
  public constructor(private readonly store: FoundationStore, private readonly clock: Clock = () => new Date(), private readonly idFactory: IdFactory = randomUUID) {}

  public snapshot(context: AccessContext, assignments: readonly RoleAssignment[], projectId: string): Promise<EngineeringRegisterSnapshot> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId); if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "engineering.register.read", resource: scope(project.businessScopeOrganizationId, projectId, null), requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "standard" }, now);
      const items = transaction.engineeringRegisterItems(projectId);
      const counts = Object.fromEntries(registerTypes.map((type) => [type, items.filter((item) => item.registerType === type && item.state !== "superseded").length])) as Record<EngineeringRegisterType, number>;
      return { generatedAt: now, items, counts, openValidationFindingCount: items.filter((item) => ["draft", "rejected"].includes(item.state)).reduce((sum, item) => sum + item.validationFindings.length, 0) };
    });
  }

  public create(context: AccessContext, assignments: readonly RoleAssignment[], projectId: string, raw: CreateEngineeringRegisterItemInput): Promise<EngineeringRegisterItemRevisionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId); if (!project || project.state !== "active") throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "engineering.register.manage", resource: scope(project.businessScopeOrganizationId, projectId, null), requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa" }, now);
      if (!registerTypes.includes(raw.registerType)) throw new ValidationError("Register type is invalid.", ["engineering_register_type_invalid"]);
      const input: CreateEngineeringRegisterItemInput = { ...raw, tag: code(raw.tag, "tag"), revision: code(raw.revision, "revision"),
        revisionReason: required(raw.revisionReason, "revisionReason"), title: required(raw.title, "title", 256), disciplineCode: code(raw.disciplineCode, "disciplineCode"),
        systemCode: optionalCode(raw.systemCode, "systemCode"), areaCode: optionalCode(raw.areaCode, "areaCode"), workPackageCode: optionalCode(raw.workPackageCode, "workPackageCode"),
        responsibleOrganizationId: required(raw.responsibleOrganizationId, "responsibleOrganizationId", 256), documentRevisionIds: strings(raw.documentRevisionIds, "documentRevisionId"),
        relatedItemRevisionIds: strings(raw.relatedItemRevisionIds, "relatedItemRevisionId"), attributes: attributes(raw.attributes),
        plannedIssueDate: optionalDate(raw.plannedIssueDate, "plannedIssueDate"), forecastIssueDate: optionalDate(raw.forecastIssueDate, "forecastIssueDate"), actualIssueDate: optionalDate(raw.actualIssueDate, "actualIssueDate") };
      if (transaction.engineeringRegisterItemByRevision(projectId, input.registerType, input.tag, input.revision)) throw new ConflictError();
      const parent = input.parentRevisionId ? transaction.engineeringRegisterItemById(input.parentRevisionId) : null;
      const existing = transaction.engineeringRegisterItems(projectId).some((item) => item.registerType === input.registerType && item.tag === input.tag);
      if ((input.parentRevisionId && (!parent || parent.projectId !== projectId || parent.registerType !== input.registerType || parent.tag !== input.tag || !["approved", "rejected"].includes(parent.state))) || (!input.parentRevisionId && existing)) {
        throw new ValidationError("Register revision lineage is invalid.", ["engineering_parent_invalid"]);
      }
      const validationFindings = findings(transaction, projectId, input);
      const canonicalSha256 = sha256(canonical({ ...input, parentRevisionId: parent?.id ?? null, validationRuleVersion: "engineering-register-v1" }));
      const item: EngineeringRegisterItemRevisionRecord = { id: this.idFactory(), businessScopeOrganizationId: project.businessScopeOrganizationId,
        projectId, ...input, parentRevisionId: parent?.id ?? null, validationRuleVersion: "engineering-register-v1", validationFindings, canonicalSha256,
        state: "draft", submittedAt: null, submittedBy: null, reviewedAt: null, reviewedBy: null, reviewReason: null, version: 1,
        createdAt: now, createdBy: context.userId, updatedAt: now, updatedBy: context.userId };
      transaction.insertEngineeringRegisterItem(item);
      transaction.appendAudit(audit(this.idFactory, now, context, { projectId, action: "engineering.register_item_created", objectType: "engineering_register_item_revision", objectId: item.id, priorState: null, newState: item.state, reason: item.revisionReason, changedFields: { registerType: item.registerType, tag: item.tag, revision: item.revision, canonicalSha256, findingCodes: validationFindings.map((finding) => finding.code) } }));
      return item;
    });
  }

  public submit(context: AccessContext, assignments: readonly RoleAssignment[], itemId: string, expectedVersion: number): Promise<EngineeringRegisterItemRevisionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const item = transaction.engineeringRegisterItemById(itemId); if (!item) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "engineering.register.submit", resource: scope(item.businessScopeOrganizationId, item.projectId, item.id), requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa" }, now);
      if (item.version !== expectedVersion) throw new ConflictError();
      if (item.state !== "draft" || item.validationFindings.some((finding) => finding.severity === "error")) throw new ValidationError("Register revision is not ready for review.", ["engineering_validation_incomplete"]);
      const submitted = { ...item, state: "under_review" as const, submittedAt: now, submittedBy: context.userId, version: item.version + 1, updatedAt: now, updatedBy: context.userId };
      transaction.updateEngineeringRegisterItem(submitted, expectedVersion);
      transaction.appendAudit(audit(this.idFactory, now, context, { projectId: item.projectId, action: "engineering.register_item_submitted", objectType: "engineering_register_item_revision", objectId: item.id, priorState: item.state, newState: submitted.state, reason: null, changedFields: { canonicalSha256: item.canonicalSha256 } }));
      return submitted;
    });
  }

  public review(context: AccessContext, assignments: readonly RoleAssignment[], itemId: string, expectedVersion: number, decision: "approve" | "reject", reason: string): Promise<EngineeringRegisterItemRevisionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const item = transaction.engineeringRegisterItemById(itemId); if (!item) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "engineering.register.approve", resource: scope(item.businessScopeOrganizationId, item.projectId, item.id), requiredQualifications: ["engineering_authority"], forbiddenActorIds: [item.createdBy, item.submittedBy ?? item.createdBy], minimumAssurance: "step-up" }, now);
      if (item.version !== expectedVersion) throw new ConflictError();
      if (item.state !== "under_review") throw new ValidationError("Register revision is not under review.", ["engineering_state_invalid"]);
      if (decision === "approve" && item.parentRevisionId) {
        const parent = transaction.engineeringRegisterItemById(item.parentRevisionId); if (!parent || !["approved", "rejected"].includes(parent.state)) throw new ConflictError();
        if (parent.state === "approved") transaction.updateEngineeringRegisterItem({ ...parent, state: "superseded", version: parent.version + 1, updatedAt: now, updatedBy: context.userId }, parent.version);
      }
      const reviewed = { ...item, state: decision === "approve" ? "approved" as const : "rejected" as const, reviewedAt: now, reviewedBy: context.userId,
        reviewReason: required(reason, "reason"), version: item.version + 1, updatedAt: now, updatedBy: context.userId };
      transaction.updateEngineeringRegisterItem(reviewed, expectedVersion);
      transaction.appendAudit(audit(this.idFactory, now, context, { projectId: item.projectId, action: decision === "approve" ? "engineering.register_item_approved" : "engineering.register_item_rejected", objectType: "engineering_register_item_revision", objectId: item.id, priorState: item.state, newState: reviewed.state, reason: reviewed.reviewReason, changedFields: { canonicalSha256: item.canonicalSha256 } }));
      return reviewed;
    });
  }
}
