import { createHash, randomUUID } from "node:crypto";
import type {
  AccessContext,
  AuditEvent,
  FabricationAssemblyRevisionRecord,
  FabricationAssemblyType,
  FabricationBomLine,
  FabricationCutLine,
  FabricationExecutionEventRecord,
  FabricationExecutionEventType,
  FabricationTravelerOperation,
  FabricationTravelerRecord,
  RoleAssignment,
} from "@eiep/shared-types";
import { parseControlledDecimal, requireAuthorization } from "@eiep/rules-engine";
import { ConflictError, NotFoundError, ValidationError } from "./errors.js";
import type { FoundationStore, FoundationTransaction } from "./foundation-store.js";

type Clock = () => Date;
type IdFactory = () => string;

export interface CreateFabricationAssemblyInput {
  readonly number: string;
  readonly revision: string;
  readonly assemblyType: FabricationAssemblyType;
  readonly parentRevisionId: string | null;
  readonly revisionReason: string;
  readonly sourceSystem: "manual" | "model_import";
  readonly sourceVersion: string | null;
  readonly sourceSha256: string | null;
  readonly systemCode: string;
  readonly areaCode: string;
  readonly workPackageCode: string;
  readonly completionBoundaryId: string;
  readonly drawingRevisionIds: readonly string[];
  readonly materialItemIds: readonly string[];
  readonly weldIds: readonly string[];
  readonly requiredInspectionIds: readonly string[];
  readonly bomLines: readonly FabricationBomLine[];
  readonly cutLines: readonly FabricationCutLine[];
}

export interface CreateFabricationTravelerInput {
  readonly number: string;
  readonly revision: string;
  readonly operations: readonly FabricationTravelerOperation[];
}

export interface RecordFabricationEventInput {
  readonly expectedTravelerVersion: number;
  readonly operationKey: string;
  readonly eventType: FabricationExecutionEventType;
  readonly result: "pass" | "fail" | "observed";
  readonly quantity: string;
  readonly unitCode: string;
  readonly observations: Readonly<Record<string, string>>;
  readonly evidenceFileIds: readonly string[];
  readonly performedAt: Date;
}

export interface FabricationSnapshot {
  readonly assemblies: readonly FabricationAssemblyRevisionRecord[];
  readonly travelers: readonly FabricationTravelerRecord[];
  readonly events: readonly FabricationExecutionEventRecord[];
  readonly releaseReadiness: readonly { readonly assemblyRevisionId: string; readonly blockers: readonly string[] }[];
  readonly acceptanceReadiness: readonly { readonly assemblyRevisionId: string; readonly blockers: readonly string[] }[];
}

function required(value: string, field: string, maximum = 4_000): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || /[\u0000\r\n]/u.test(normalized)) {
    throw new ValidationError(`${field} is invalid.`, [`${field}_invalid`]);
  }
  return normalized;
}

function code(value: string, field: string): string {
  const normalized = required(value, field, 64).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_.-]{0,63}$/u.test(normalized)) throw new ValidationError(`${field} is invalid.`, [`${field}_invalid`]);
  return normalized;
}

function strings(values: readonly string[], field: string, requireOne = false): readonly string[] {
  const result = values.map((value) => required(value, field, 256));
  if (requireOne && result.length === 0) throw new ValidationError(`${field} is required.`, [`${field}_required`]);
  if (new Set(result).size !== result.length) throw new ValidationError(`${field} contains duplicates.`, [`${field}_duplicate`]);
  return result;
}

function codes(values: readonly string[], field: string, requireOne = false): readonly string[] {
  const result = values.map((value) => code(value, field));
  if (requireOne && result.length === 0) throw new ValidationError(`${field} is required.`, [`${field}_required`]);
  if (new Set(result).size !== result.length) throw new ValidationError(`${field} contains duplicates.`, [`${field}_duplicate`]);
  return result;
}

function decimal(value: string, field: string, allowZero = false): string {
  const parsed = parseControlledDecimal(value, { allowZero, maximumScale: 6, maximumIntegerDigits: 12 });
  if (!parsed || (!allowZero && parsed.coefficient <= 0n) || (allowZero && parsed.coefficient < 0n)) {
    throw new ValidationError(`${field} is invalid.`, [`${field}_invalid`]);
  }
  const scale = parsed.scale;
  const coefficient = parsed.coefficient;
  if (scale === 0) return coefficient.toString();
  const base = 10n ** BigInt(scale);
  const integer = coefficient / base;
  const fraction = (coefficient % base).toString().padStart(scale, "0").replace(/0+$/u, "");
  return `${integer}${fraction ? `.${fraction}` : ""}`;
}

function date(value: Date, field: string, now: Date): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime()) || value.getTime() > now.getTime() + 300_000) {
    throw new ValidationError(`${field} is invalid.`, [`${field}_invalid`]);
  }
  return new Date(value);
}

function normalizedObject(values: Readonly<Record<string, string>>, field: string): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [code(key, `${field}Key`), required(value, field, 1_000)]));
}

function scope(organizationId: string, projectId: string, objectId: string | null) {
  return { organizationId, projectId, workPackageId: null, objectId };
}

function audit(idFactory: IdFactory, occurredAt: Date, context: AccessContext,
  input: Omit<AuditEvent, "id" | "occurredAt" | "actorUserId" | "actingOrganizationId" | "correlationId" | "canonicalSha256">): AuditEvent {
  const payload = { actorUserId: context.userId, actingOrganizationId: context.actingOrganizationId,
    projectId: input.projectId, action: input.action, objectType: input.objectType, objectId: input.objectId,
    priorState: input.priorState, newState: input.newState, reason: input.reason,
    correlationId: context.correlationId, changedFields: input.changedFields };
  return { id: idFactory(), occurredAt, ...payload,
    canonicalSha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function releasedRevision(transaction: FoundationTransaction, projectId: string, revisionId: string): string {
  const revision = transaction.revisionById(revisionId);
  const document = revision ? transaction.documentById(revision.documentId) : null;
  if (!revision || !document || document.projectId !== projectId || revision.state !== "released") {
    throw new ValidationError("The exact fabrication drawing or procedure revision is not released for this project.", ["fabrication_revision_invalid"]);
  }
  return revision.id;
}

function releasedFiles(transaction: FoundationTransaction, organizationId: string, projectId: string,
  values: readonly string[], field: string, requireOne: boolean): readonly string[] {
  const fileIds = strings(values, field, requireOne);
  for (const fileId of fileIds) {
    const file = transaction.governedFileById(fileId);
    if (!file || file.businessScopeOrganizationId !== organizationId || file.projectId !== projectId
      || file.validationState !== "released" || file.malwareState !== "clean" || file.detectedSha256 !== file.sha256) {
      throw new ValidationError("Fabrication evidence must be an integrity-matched released project file.", ["fabrication_evidence_invalid"]);
    }
  }
  return fileIds;
}

function operationEvents(transaction: FoundationTransaction, travelerId: string, operationKey: string) {
  return transaction.fabricationExecutionEvents(travelerId).filter((event) => event.operationKey === operationKey);
}

function releaseBlockers(transaction: FoundationTransaction, assembly: FabricationAssemblyRevisionRecord,
  traveler: FabricationTravelerRecord | null): readonly string[] {
  if (["released_to_fabrication", "in_fabrication", "fabrication_complete", "accepted"].includes(assembly.state)) return [];
  const blockers = new Set<string>();
  if (assembly.state !== "approved") blockers.add("assembly_approval_required");
  if (!traveler || traveler.state !== "draft") blockers.add("draft_traveler_required");
  for (const revisionId of assembly.drawingRevisionIds) {
    const revision = transaction.revisionById(revisionId);
    if (revision?.state !== "released") blockers.add(`drawing_not_released:${revisionId}`);
  }
  for (const materialId of assembly.materialItemIds) {
    const material = transaction.materialById(materialId);
    if (!material || !["released", "issued"].includes(material.state)) blockers.add(`material_not_released:${materialId}`);
  }
  for (const weldId of assembly.weldIds) {
    const weld = transaction.weldById(weldId);
    if (!weld || weld.projectId !== assembly.projectId || weld.state !== "planned") blockers.add(`weld_not_planned:${weldId}`);
    else {
      if (!assembly.drawingRevisionIds.includes(weld.drawingRevisionId)) blockers.add(`weld_drawing_mismatch:${weldId}`);
      if (!weld.materialItemIds.every((materialId) => assembly.materialItemIds.includes(materialId))) blockers.add(`weld_material_mismatch:${weldId}`);
      if (!weld.componentReferences.includes(assembly.number)) blockers.add(`weld_component_mismatch:${weldId}`);
    }
  }
  if (traveler) for (const operation of traveler.operations) {
    if (operation.procedureDocumentRevisionId) {
      const revision = transaction.revisionById(operation.procedureDocumentRevisionId);
      if (revision?.state !== "released") blockers.add(`procedure_not_released:${operation.operationKey}`);
    }
  }
  return [...blockers];
}

function acceptanceBlockers(transaction: FoundationTransaction, assembly: FabricationAssemblyRevisionRecord,
  traveler: FabricationTravelerRecord | null): readonly string[] {
  if (assembly.state === "accepted") return [];
  const blockers = new Set<string>();
  if (assembly.state !== "fabrication_complete") blockers.add("fabrication_completion_required");
  if (!traveler || traveler.state !== "complete") blockers.add("traveler_completion_required");
  for (const inspectionId of assembly.requiredInspectionIds) {
    const inspection = transaction.inspectionById(inspectionId);
    if (!inspection || inspection.projectId !== assembly.projectId || inspection.state !== "accepted" || inspection.result !== "pass") {
      blockers.add(`inspection_not_accepted:${inspectionId}`);
    }
  }
  for (const weldId of assembly.weldIds) {
    if (transaction.weldById(weldId)?.state !== "released") blockers.add(`weld_not_released:${weldId}`);
  }
  const affectedIds = new Set([assembly.id, ...assembly.weldIds, ...assembly.materialItemIds]);
  for (const ncr of transaction.ncrForProject(assembly.projectId)) {
    if (affectedIds.has(ncr.affectedObjectId) && ncr.state !== "closed") blockers.add(`open_ncr:${ncr.id}`);
  }
  return [...blockers];
}

export class FabricationService {
  public constructor(
    private readonly store: FoundationStore,
    private readonly clock: Clock = () => new Date(),
    private readonly idFactory: IdFactory = randomUUID,
  ) {}

  public createAssembly(context: AccessContext, assignments: readonly RoleAssignment[], projectId: string,
    input: CreateFabricationAssemblyInput): Promise<FabricationAssemblyRevisionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project || project.state !== "active") throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "fabrication.plan", resource: scope(project.businessScopeOrganizationId, projectId, null),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa" }, now);
      const number = code(input.number, "number");
      const revision = code(input.revision, "revision");
      for (const [type, value] of [["system", input.systemCode], ["area", input.areaCode], ["work_package", input.workPackageCode]] as const) {
        if (!transaction.projectStructureByCode(projectId, type, code(value, `${type}Code`))) {
          throw new ValidationError("Fabrication project structure mapping is invalid.", ["fabrication_structure_invalid"]);
        }
      }
      const boundary = transaction.completionBoundaryById(input.completionBoundaryId);
      if (!boundary || boundary.projectId !== projectId || boundary.state !== "active") {
        throw new ValidationError("Fabrication completion boundary is invalid.", ["fabrication_boundary_invalid"]);
      }
      const drawingRevisionIds = strings(input.drawingRevisionIds, "drawingRevisionIds", true)
        .map((id) => releasedRevision(transaction, projectId, id));
      const materialItemIds = strings(input.materialItemIds, "materialItemIds", true);
      if (materialItemIds.some((id) => transaction.materialById(id)?.projectId !== projectId)) {
        throw new ValidationError("Fabrication materials must resolve inside the project.", ["fabrication_material_invalid"]);
      }
      const weldIds = strings(input.weldIds, "weldIds", input.assemblyType === "pipe_spool");
      if (weldIds.some((id) => transaction.weldById(id)?.projectId !== projectId)) {
        throw new ValidationError("Fabrication welds must resolve inside the project.", ["fabrication_weld_invalid"]);
      }
      const requiredInspectionIds = strings(input.requiredInspectionIds, "requiredInspectionIds");
      if (requiredInspectionIds.some((id) => transaction.inspectionById(id)?.projectId !== projectId)) {
        throw new ValidationError("Required inspections must resolve inside the project.", ["fabrication_inspection_invalid"]);
      }
      const bomLines = input.bomLines.map((line) => ({ lineKey: code(line.lineKey, "bomLineKey"),
        materialItemId: required(line.materialItemId, "bomMaterialItemId", 128), description: required(line.description, "bomDescription"),
        quantity: decimal(line.quantity, "bomQuantity"), unitCode: code(line.unitCode, "bomUnitCode"), pieceMark: code(line.pieceMark, "pieceMark") }));
      if (bomLines.length === 0 || new Set(bomLines.map((line) => line.lineKey)).size !== bomLines.length
        || new Set(bomLines.map((line) => line.pieceMark)).size !== bomLines.length
        || !sameSet(materialItemIds, [...new Set(bomLines.map((line) => line.materialItemId))])) {
        throw new ValidationError("The fabrication BOM must uniquely and completely cover the assembly materials.", ["fabrication_bom_invalid"]);
      }
      const cutLines = input.cutLines.map((line) => ({ lineKey: code(line.lineKey, "cutLineKey"),
        bomLineKey: code(line.bomLineKey, "cutBomLineKey"), materialItemId: required(line.materialItemId, "cutMaterialItemId", 128),
        cutLength: decimal(line.cutLength, "cutLength"), lengthUnitCode: code(line.lengthUnitCode, "lengthUnitCode"),
        cutAngleDegrees: decimal(line.cutAngleDegrees, "cutAngleDegrees", true),
        bevelCode: line.bevelCode === null ? null : code(line.bevelCode, "bevelCode"), quantity: decimal(line.quantity, "cutQuantity") }));
      if (new Set(cutLines.map((line) => line.lineKey)).size !== cutLines.length
        || cutLines.some((line) => !bomLines.some((bom) => bom.lineKey === line.bomLineKey && bom.materialItemId === line.materialItemId))) {
        throw new ValidationError("Fabrication cut lines must uniquely resolve to the exact BOM material.", ["fabrication_cut_list_invalid"]);
      }
      const parent = input.parentRevisionId ? transaction.fabricationAssemblyById(input.parentRevisionId) : null;
      if (input.parentRevisionId && (!parent || parent.projectId !== projectId || parent.number !== number || parent.revision === revision
        || parent.state === "draft" || parent.state === "under_review" || parent.state === "rejected")) {
        throw new ValidationError("The parent fabrication revision is invalid.", ["fabrication_parent_invalid"]);
      }
      if (!input.parentRevisionId && transaction.fabricationAssemblies(projectId).some((item) => item.number === number)) {
        throw new ValidationError("A subsequent fabrication revision must identify its parent revision.", ["fabrication_parent_required"]);
      }
      const sourceVersion = input.sourceVersion === null ? null : required(input.sourceVersion, "sourceVersion", 128);
      const sourceSha256 = input.sourceSha256?.trim().toLowerCase() ?? null;
      if (input.sourceSystem === "model_import" && (!sourceVersion || !sourceSha256 || !/^[a-f0-9]{64}$/u.test(sourceSha256))) {
        throw new ValidationError("Model imports require an exact source version and SHA-256.", ["fabrication_source_invalid"]);
      }
      if (input.sourceSystem === "manual" && (sourceVersion || sourceSha256)) {
        throw new ValidationError("Manual assembly definitions cannot claim an imported source version.", ["fabrication_source_invalid"]);
      }
      const record: FabricationAssemblyRevisionRecord = { id: this.idFactory(), businessScopeOrganizationId: project.businessScopeOrganizationId,
        projectId, number, revision, assemblyType: input.assemblyType, parentRevisionId: input.parentRevisionId,
        revisionReason: required(input.revisionReason, "revisionReason"), sourceSystem: input.sourceSystem, sourceVersion, sourceSha256,
        systemCode: code(input.systemCode, "systemCode"), areaCode: code(input.areaCode, "areaCode"),
        workPackageCode: code(input.workPackageCode, "workPackageCode"), completionBoundaryId: boundary.id,
        drawingRevisionIds, materialItemIds, weldIds, requiredInspectionIds, bomLines, cutLines, state: "draft",
        submittedAt: null, submittedBy: null, reviewedAt: null, reviewedBy: null, reviewReason: null,
        releasedAt: null, releasedBy: null, acceptedAt: null, acceptedBy: null, version: 1,
        createdAt: now, createdBy: context.userId, updatedAt: now, updatedBy: context.userId };
      transaction.insertFabricationAssembly(record);
      transaction.appendAudit(audit(this.idFactory, now, context, { projectId, action: "fabrication.assembly_created",
        objectType: "fabrication_assembly_revision", objectId: record.id, priorState: null, newState: record.state, reason: record.revisionReason,
        changedFields: { number, revision, assemblyType: record.assemblyType, drawingRevisionIds, materialItemIds, weldIds } }));
      return record;
    });
  }

  public submitAssembly(context: AccessContext, assignments: readonly RoleAssignment[], assemblyId: string,
    expectedVersion: number): Promise<FabricationAssemblyRevisionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const record = transaction.fabricationAssemblyById(assemblyId); if (!record) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "fabrication.submit", resource: scope(record.businessScopeOrganizationId, record.projectId, record.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa" }, now);
      if (record.version !== expectedVersion) throw new ConflictError();
      if (record.state !== "draft") throw new ValidationError("Only a draft fabrication revision can be submitted.", ["fabrication_state_invalid"]);
      const submitted: FabricationAssemblyRevisionRecord = { ...record, state: "under_review", submittedAt: now, submittedBy: context.userId,
        version: record.version + 1, updatedAt: now, updatedBy: context.userId };
      transaction.updateFabricationAssembly(submitted, expectedVersion);
      transaction.appendAudit(audit(this.idFactory, now, context, { projectId: record.projectId, action: "fabrication.assembly_submitted",
        objectType: "fabrication_assembly_revision", objectId: record.id, priorState: record.state, newState: submitted.state,
        reason: null, changedFields: { state: submitted.state } }));
      return submitted;
    });
  }

  public reviewAssembly(context: AccessContext, assignments: readonly RoleAssignment[], assemblyId: string, expectedVersion: number,
    decision: "approve" | "reject", reason: string): Promise<FabricationAssemblyRevisionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const record = transaction.fabricationAssemblyById(assemblyId); if (!record) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "fabrication.approve", resource: scope(record.businessScopeOrganizationId, record.projectId, record.id),
        requiredQualifications: ["fabrication_engineering_authority"], forbiddenActorIds: [record.createdBy, record.submittedBy ?? ""],
        minimumAssurance: "step-up" }, now);
      if (record.version !== expectedVersion) throw new ConflictError();
      if (record.state !== "under_review") throw new ValidationError("Fabrication revision is not under review.", ["fabrication_state_invalid"]);
      if (decision === "approve") {
        for (const revisionId of record.drawingRevisionIds) releasedRevision(transaction, record.projectId, revisionId);
        if (record.parentRevisionId) {
          const parent = transaction.fabricationAssemblyById(record.parentRevisionId);
          if (!parent) throw new ConflictError();
          const priorTraveler = transaction.fabricationTravelerForAssembly(parent.id);
          const priorEvents = priorTraveler ? transaction.fabricationExecutionEvents(priorTraveler.id) : [];
          if (priorTraveler && (["in_progress", "on_hold"].includes(priorTraveler.state)
            || (priorTraveler.state === "issued" && priorEvents.length > 0))) {
            throw new ValidationError("An actively executing parent revision must be placed through controlled change disposition before supersession.", ["fabrication_parent_active"]);
          }
          if (priorTraveler && priorTraveler.state !== "superseded") {
            transaction.updateFabricationTraveler({ ...priorTraveler, state: "superseded", version: priorTraveler.version + 1,
              updatedAt: now, updatedBy: context.userId }, priorTraveler.version);
          }
          if (parent.state !== "superseded") transaction.updateFabricationAssembly({ ...parent, state: "superseded", version: parent.version + 1,
            updatedAt: now, updatedBy: context.userId }, parent.version);
        }
      }
      const reviewed: FabricationAssemblyRevisionRecord = { ...record, state: decision === "approve" ? "approved" : "rejected",
        reviewedAt: now, reviewedBy: context.userId, reviewReason: required(reason, "reason"), version: record.version + 1,
        updatedAt: now, updatedBy: context.userId };
      transaction.updateFabricationAssembly(reviewed, expectedVersion);
      transaction.appendAudit(audit(this.idFactory, now, context, { projectId: record.projectId,
        action: `fabrication.assembly_${decision}d`, objectType: "fabrication_assembly_revision", objectId: record.id,
        priorState: record.state, newState: reviewed.state, reason: reviewed.reviewReason,
        changedFields: { state: reviewed.state, parentRevisionId: reviewed.parentRevisionId } }));
      return reviewed;
    });
  }

  public createTraveler(context: AccessContext, assignments: readonly RoleAssignment[], assemblyId: string,
    input: CreateFabricationTravelerInput): Promise<FabricationTravelerRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const assembly = transaction.fabricationAssemblyById(assemblyId); if (!assembly) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "fabrication.plan", resource: scope(assembly.businessScopeOrganizationId, assembly.projectId, assembly.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa" }, now);
      if (assembly.state !== "approved") throw new ValidationError("A traveler requires an approved fabrication revision.", ["fabrication_approval_required"]);
      const operations = input.operations.map((operation) => ({ operationKey: code(operation.operationKey, "operationKey"),
        sequence: operation.sequence, operationType: operation.operationType, workCenterCode: code(operation.workCenterCode, "workCenterCode"),
        requiredQualificationCodes: codes(operation.requiredQualificationCodes, "requiredQualificationCode"),
        procedureDocumentRevisionId: operation.procedureDocumentRevisionId === null ? null
          : releasedRevision(transaction, assembly.projectId, operation.procedureDocumentRevisionId), holdPoint: operation.holdPoint,
        materialItemIds: strings(operation.materialItemIds, "operationMaterialItemIds"), weldIds: strings(operation.weldIds, "operationWeldIds"),
        plannedHours: decimal(operation.plannedHours, "plannedHours"), instructions: required(operation.instructions, "instructions") }));
      if (operations.length === 0 || new Set(operations.map((operation) => operation.operationKey)).size !== operations.length
        || new Set(operations.map((operation) => operation.sequence)).size !== operations.length
        || operations.some((operation) => !Number.isInteger(operation.sequence) || operation.sequence < 1
          || !operation.materialItemIds.every((id) => assembly.materialItemIds.includes(id))
          || !operation.weldIds.every((id) => assembly.weldIds.includes(id))
          || (operation.operationType === "weld" && operation.weldIds.length === 0)
          || (operation.operationType === "cut" && operation.materialItemIds.length === 0))) {
        throw new ValidationError("Traveler operations must be unique, ordered, and confined to the approved assembly scope.", ["fabrication_operations_invalid"]);
      }
      const sorted = [...operations].sort((left, right) => left.sequence - right.sequence);
      const traveler: FabricationTravelerRecord = { id: this.idFactory(), businessScopeOrganizationId: assembly.businessScopeOrganizationId,
        projectId: assembly.projectId, assemblyRevisionId: assembly.id, number: code(input.number, "travelerNumber"),
        revision: code(input.revision, "travelerRevision"), operations: sorted, state: "draft", issuedAt: null, issuedBy: null,
        version: 1, createdAt: now, createdBy: context.userId, updatedAt: now, updatedBy: context.userId };
      transaction.insertFabricationTraveler(traveler);
      transaction.appendAudit(audit(this.idFactory, now, context, { projectId: assembly.projectId,
        action: "fabrication.traveler_created", objectType: "fabrication_traveler", objectId: traveler.id,
        priorState: null, newState: traveler.state, reason: null,
        changedFields: { assemblyRevisionId: assembly.id, operationCount: traveler.operations.length,
          holdPointCount: traveler.operations.filter((operation) => operation.holdPoint).length } }));
      return traveler;
    });
  }

  public releaseAssembly(context: AccessContext, assignments: readonly RoleAssignment[], assemblyId: string,
    expectedAssemblyVersion: number, expectedTravelerVersion: number, reason: string): Promise<{
      readonly assembly: FabricationAssemblyRevisionRecord; readonly traveler: FabricationTravelerRecord;
    }> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const assembly = transaction.fabricationAssemblyById(assemblyId);
      const traveler = assembly ? transaction.fabricationTravelerForAssembly(assembly.id) : null;
      if (!assembly || !traveler) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "fabrication.release", resource: scope(assembly.businessScopeOrganizationId, assembly.projectId, assembly.id),
        requiredQualifications: ["fabrication_release_authority"],
        forbiddenActorIds: [assembly.createdBy, assembly.submittedBy ?? "", assembly.reviewedBy ?? "", traveler.createdBy],
        minimumAssurance: "step-up" }, now);
      if (assembly.version !== expectedAssemblyVersion || traveler.version !== expectedTravelerVersion) throw new ConflictError();
      const blockers = releaseBlockers(transaction, assembly, traveler);
      if (blockers.length > 0) throw new ValidationError("Fabrication release prerequisites are not satisfied.", blockers);
      const releaseReason = required(reason, "reason");
      const releasedAssembly: FabricationAssemblyRevisionRecord = { ...assembly, state: "released_to_fabrication",
        releasedAt: now, releasedBy: context.userId, version: assembly.version + 1, updatedAt: now, updatedBy: context.userId };
      const issuedTraveler: FabricationTravelerRecord = { ...traveler, state: "issued", issuedAt: now, issuedBy: context.userId,
        version: traveler.version + 1, updatedAt: now, updatedBy: context.userId };
      transaction.updateFabricationAssembly(releasedAssembly, expectedAssemblyVersion);
      transaction.updateFabricationTraveler(issuedTraveler, expectedTravelerVersion);
      transaction.appendAudit(audit(this.idFactory, now, context, { projectId: assembly.projectId,
        action: "fabrication.released_to_shop", objectType: "fabrication_assembly_revision", objectId: assembly.id,
        priorState: assembly.state, newState: releasedAssembly.state, reason: releaseReason,
        changedFields: { travelerId: traveler.id, travelerState: issuedTraveler.state, drawingRevisionIds: assembly.drawingRevisionIds } }));
      return { assembly: releasedAssembly, traveler: issuedTraveler };
    });
  }

  public recordEvent(context: AccessContext, assignments: readonly RoleAssignment[], travelerId: string,
    input: RecordFabricationEventInput): Promise<{
      readonly assembly: FabricationAssemblyRevisionRecord; readonly traveler: FabricationTravelerRecord;
      readonly event: FabricationExecutionEventRecord;
    }> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const traveler = transaction.fabricationTravelerById(travelerId);
      const assembly = traveler ? transaction.fabricationAssemblyById(traveler.assemblyRevisionId) : null;
      if (!traveler || !assembly) throw new NotFoundError();
      const operationKey = code(input.operationKey, "operationKey");
      const operation = traveler.operations.find((item) => item.operationKey === operationKey);
      if (!operation) throw new ValidationError("Traveler operation does not exist.", ["fabrication_operation_missing"]);
      const events = transaction.fabricationExecutionEvents(traveler.id);
      const currentEvents = events.filter((event) => event.operationKey === operation.operationKey);
      const priorOperations = traveler.operations.filter((item) => item.sequence < operation.sequence);
      if (priorOperations.some((item) => !events.some((event) => event.operationKey === item.operationKey && event.eventType === "complete"))) {
        throw new ValidationError("Traveler operations must execute in sequence.", ["fabrication_sequence_invalid"]);
      }
      const forbiddenActorIds = input.eventType === "release_hold" ? [...new Set(currentEvents.map((event) => event.performedBy))] : [];
      requireAuthorization(context, assignments, { action: input.eventType === "release_hold" ? "fabrication.hold.release" : "fabrication.execute",
        resource: scope(assembly.businessScopeOrganizationId, assembly.projectId, traveler.id),
        requiredQualifications: input.eventType === "release_hold" ? ["fabrication_hold_authority"] : operation.requiredQualificationCodes,
        forbiddenActorIds, minimumAssurance: input.eventType === "release_hold" ? "step-up" : "mfa" }, now);
      if (traveler.version !== input.expectedTravelerVersion) throw new ConflictError();
      if (!["issued", "in_progress", "on_hold"].includes(traveler.state)
        || !["released_to_fabrication", "in_fabrication"].includes(assembly.state)) {
        throw new ValidationError("Traveler is not open for controlled execution.", ["fabrication_execution_state_invalid"]);
      }
      const started = currentEvents.some((event) => event.eventType === "start");
      const completed = currentEvents.some((event) => event.eventType === "complete");
      const held = [...currentEvents].reverse().find((event) => event.eventType === "hold" || event.eventType === "release_hold");
      const requiredResult: Readonly<Record<FabricationExecutionEventType, RecordFabricationEventInput["result"]>> = {
        start: "observed", complete: "pass", hold: "observed", release_hold: "observed", rework: "observed", scrap: "fail",
      };
      if (input.result !== requiredResult[input.eventType]) {
        throw new ValidationError("Fabrication event result does not match its controlled meaning.",
          [`fabrication_${input.eventType}_result_must_be_${requiredResult[input.eventType]}`]);
      }
      if (completed || (input.eventType === "start" && started)
        || (input.eventType !== "start" && !started)
        || (input.eventType === "hold" && traveler.state === "on_hold")
        || (input.eventType === "release_hold" && (traveler.state !== "on_hold" || held?.eventType !== "hold"))
        || (input.eventType === "complete" && traveler.state === "on_hold")
        || (input.eventType === "complete" && operation.holdPoint
          && !currentEvents.some((event) => event.eventType === "release_hold"))) {
        throw new ValidationError("Fabrication event is invalid for the current traveler operation state.", ["fabrication_event_transition_invalid"]);
      }
      const evidenceFileIds = releasedFiles(transaction, assembly.businessScopeOrganizationId, assembly.projectId,
        input.evidenceFileIds, "evidenceFileIds", input.eventType !== "start");
      const event: FabricationExecutionEventRecord = { id: this.idFactory(), sequence: events.length + 1,
        businessScopeOrganizationId: assembly.businessScopeOrganizationId,
        projectId: assembly.projectId, assemblyRevisionId: assembly.id, travelerId: traveler.id, operationKey,
        eventType: input.eventType, result: input.result, quantity: decimal(input.quantity, "quantity", true),
        unitCode: code(input.unitCode, "unitCode"), observations: normalizedObject(input.observations, "observations"),
        evidenceFileIds, performedAt: date(input.performedAt, "performedAt", now), performedBy: context.userId, version: 1 };
      const allEvents = [...events, event];
      const allCompleted = traveler.operations.every((item) => allEvents.some((entry) => entry.operationKey === item.operationKey && entry.eventType === "complete"));
      const travelerState: FabricationTravelerRecord["state"] = allCompleted ? "complete"
        : input.eventType === "hold" || input.eventType === "scrap" ? "on_hold" : "in_progress";
      const updatedTraveler: FabricationTravelerRecord = { ...traveler, state: travelerState, version: traveler.version + 1,
        updatedAt: now, updatedBy: context.userId };
      const assemblyState: FabricationAssemblyRevisionRecord["state"] = allCompleted ? "fabrication_complete" : "in_fabrication";
      const updatedAssembly: FabricationAssemblyRevisionRecord = assembly.state === assemblyState ? assembly
        : { ...assembly, state: assemblyState, version: assembly.version + 1, updatedAt: now, updatedBy: context.userId };
      transaction.insertFabricationExecutionEvent(event);
      transaction.updateFabricationTraveler(updatedTraveler, input.expectedTravelerVersion);
      if (updatedAssembly.version !== assembly.version) transaction.updateFabricationAssembly(updatedAssembly, assembly.version);
      transaction.appendAudit(audit(this.idFactory, now, context, { projectId: assembly.projectId,
        action: `fabrication.${input.eventType}_recorded`, objectType: "fabrication_traveler_operation", objectId: traveler.id,
        priorState: traveler.state, newState: updatedTraveler.state, reason: null,
        changedFields: { eventId: event.id, operationKey, result: event.result, assemblyState: updatedAssembly.state } }));
      return { assembly: updatedAssembly, traveler: updatedTraveler, event };
    });
  }

  public acceptAssembly(context: AccessContext, assignments: readonly RoleAssignment[], assemblyId: string,
    expectedVersion: number, reason: string): Promise<FabricationAssemblyRevisionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const assembly = transaction.fabricationAssemblyById(assemblyId);
      const traveler = assembly ? transaction.fabricationTravelerForAssembly(assembly.id) : null;
      if (!assembly || !traveler) throw new NotFoundError();
      const eventPerformers = transaction.fabricationExecutionEvents(traveler.id).map((event) => event.performedBy);
      requireAuthorization(context, assignments, { action: "fabrication.accept", resource: scope(assembly.businessScopeOrganizationId, assembly.projectId, assembly.id),
        requiredQualifications: ["fabrication_quality_authority"], forbiddenActorIds: [...new Set([assembly.createdBy, assembly.submittedBy ?? "",
          assembly.reviewedBy ?? "", assembly.releasedBy ?? "", traveler.createdBy, ...eventPerformers])], minimumAssurance: "step-up" }, now);
      if (assembly.version !== expectedVersion) throw new ConflictError();
      const blockers = acceptanceBlockers(transaction, assembly, traveler);
      if (blockers.length > 0) throw new ValidationError("Fabrication acceptance prerequisites are not satisfied.", blockers);
      const accepted: FabricationAssemblyRevisionRecord = { ...assembly, state: "accepted", acceptedAt: now, acceptedBy: context.userId,
        version: assembly.version + 1, updatedAt: now, updatedBy: context.userId };
      transaction.updateFabricationAssembly(accepted, expectedVersion);
      transaction.appendAudit(audit(this.idFactory, now, context, { projectId: assembly.projectId,
        action: "fabrication.assembly_accepted", objectType: "fabrication_assembly_revision", objectId: assembly.id,
        priorState: assembly.state, newState: accepted.state, reason: required(reason, "reason"),
        changedFields: { travelerId: traveler.id, inspectionIds: assembly.requiredInspectionIds, weldIds: assembly.weldIds } }));
      return accepted;
    });
  }

  public snapshot(context: AccessContext, assignments: readonly RoleAssignment[], projectId: string): Promise<FabricationSnapshot> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId); if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "fabrication.read", resource: scope(project.businessScopeOrganizationId, projectId, null),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "standard" }, now);
      const assemblies = transaction.fabricationAssemblies(projectId);
      const travelers = transaction.fabricationTravelers(projectId);
      const events = travelers.flatMap((traveler) => transaction.fabricationExecutionEvents(traveler.id));
      return { assemblies, travelers, events,
        releaseReadiness: assemblies.map((assembly) => ({ assemblyRevisionId: assembly.id,
          blockers: releaseBlockers(transaction, assembly, travelers.find((traveler) => traveler.assemblyRevisionId === assembly.id) ?? null) })),
        acceptanceReadiness: assemblies.map((assembly) => ({ assemblyRevisionId: assembly.id,
          blockers: acceptanceBlockers(transaction, assembly, travelers.find((traveler) => traveler.assemblyRevisionId === assembly.id) ?? null) })) };
    });
  }
}
