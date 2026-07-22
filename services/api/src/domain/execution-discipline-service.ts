import { createHash, randomUUID } from "node:crypto";
import type {
  AccessContext, AuditEvent, NdeReportRevisionRecord, NdeRequestRecord, PwhtCycleRecord,
  PwhtThermocoupleReading, RoleAssignment, TestPackageRecord, WelderQualificationRecord,
  WeldingProcedureRevisionRecord, WeldExecutionEvent, WeldJointRecord,
} from "@eiep/shared-types";
import { parseControlledDecimal, requireAuthorization } from "@eiep/rules-engine";
import { ConflictError, NotFoundError, ValidationError } from "./errors.js";
import type { FoundationStore, FoundationTransaction } from "./foundation-store.js";

type Clock = () => Date;
type IdFactory = () => string;
const scale = 6;
const base = 10n ** BigInt(scale);

export interface SubmitWeldingProcedureInput {
  readonly procedureType: "pqr" | "wps"; readonly number: string; readonly revision: string;
  readonly governingDocumentRevisionId: string; readonly supportingPqrIds: readonly string[];
  readonly processCodes: readonly string[]; readonly materialGroupCodes: readonly string[];
  readonly positionCodes: readonly string[]; readonly thicknessMinimum: string; readonly thicknessMaximum: string;
  readonly diameterMinimum: string; readonly diameterMaximum: string; readonly jointDesignCodes: readonly string[];
  readonly consumableClassifications: readonly string[]; readonly preheatMinimum: string; readonly interpassMaximum: string;
  readonly effectiveFrom: Date; readonly effectiveTo: Date | null; readonly supersedesRevisionId: string | null;
}
export interface SubmitWelderQualificationInput {
  readonly welderUserId: string; readonly employerOrganizationId: string; readonly qualificationNumber: string;
  readonly governingDocumentRevisionId: string; readonly processCodes: readonly string[];
  readonly materialGroupCodes: readonly string[]; readonly positionCodes: readonly string[];
  readonly thicknessMinimum: string; readonly thicknessMaximum: string; readonly diameterMinimum: string;
  readonly diameterMaximum: string; readonly qualifiedAt: Date; readonly validTo: Date;
  readonly continuityIntervalDays: number; readonly lastContinuityAt: Date; readonly evidenceFileIds: readonly string[];
}
export interface CreateWeldInput {
  readonly number: string; readonly systemCode: string; readonly areaCode: string; readonly workPackageCode: string;
  readonly componentReferences: readonly string[]; readonly materialItemIds: readonly string[];
  readonly drawingRevisionId: string; readonly weldMapLocation: string; readonly wpsRevisionId: string;
  readonly processCode: string; readonly materialGroupCode: string; readonly positionCode: string;
  readonly thickness: string; readonly diameter: string; readonly jointDesignCode: string;
  readonly requiredExaminationMethods: readonly string[]; readonly pwhtRequired: boolean;
  readonly completionBoundaryId: string;
}
export interface RecordWeldEventInput {
  readonly expectedVersion: number; readonly eventType: WeldExecutionEvent["eventType"];
  readonly performedAt: Date; readonly welderQualificationIds: readonly string[];
  readonly consumableClassification: string | null; readonly observations: Readonly<Record<string, string>>;
  readonly evidenceFileIds: readonly string[]; readonly result: WeldExecutionEvent["result"];
}
export interface CreateNdeRequestInput {
  readonly number: string; readonly weldId: string; readonly methodCode: string; readonly extent: string;
  readonly techniqueDocumentRevisionId: string; readonly acceptanceReference: string; readonly examinationStage: string;
  readonly requiredPersonnelQualification: string; readonly dueAt: Date; readonly holdWitnessContext: string;
}
export interface SubmitNdeReportInput {
  readonly revision: string; readonly examinerOrganizationId: string; readonly personnelQualificationReference: string;
  readonly equipmentIds: readonly string[]; readonly mediaFileIds: readonly string[]; readonly performedAt: Date;
  readonly conditions: Readonly<Record<string, string>>; readonly indications: readonly string[];
  readonly result: "accept" | "reject"; readonly evidenceFileIds: readonly string[];
}
export interface SubmitPwhtCycleInput {
  readonly number: string; readonly procedureDocumentRevisionId: string; readonly weldIds: readonly string[];
  readonly heatingRate: string; readonly coolingRate: string; readonly soakTemperatureMinimum: string;
  readonly soakTemperatureMaximum: string; readonly soakDurationMinutes: string;
  readonly thermocouples: readonly PwhtThermocoupleReading[]; readonly equipmentIds: readonly string[];
  readonly chartFileId: string; readonly evidenceFileIds: readonly string[]; readonly interruptions: readonly string[];
  readonly result: "pass" | "fail"; readonly performedAt: Date;
}
export interface CreateTestPackageInput {
  readonly number: string; readonly testType: "pressure" | "leak" | "functional";
  readonly completionBoundaryId: string; readonly governingDocumentRevisionIds: readonly string[];
  readonly drawingRevisionIds: readonly string[]; readonly testMedium: string; readonly targetPressure: string | null;
  readonly holdDurationMinutes: string; readonly hazardPermitReferences: readonly string[];
  readonly prerequisiteReferences: readonly string[]; readonly blindValveInstrumentReferences: readonly string[];
  readonly gaugeEquipmentIds: readonly string[]; readonly participantUserIds: readonly string[];
  readonly witnessUserIds: readonly string[];
}
export interface SubmitTestResultInput {
  readonly expectedVersion: number; readonly performedAt: Date; readonly result: "pass" | "fail";
  readonly evidenceFileIds: readonly string[]; readonly deficiencyNcrIds: readonly string[];
  readonly restorationConfirmation: string;
}
export interface ExecutionDisciplineSnapshot {
  readonly procedures: readonly WeldingProcedureRevisionRecord[]; readonly welderQualifications: readonly WelderQualificationRecord[];
  readonly welds: readonly WeldJointRecord[]; readonly ndeRequests: readonly NdeRequestRecord[];
  readonly ndeReports: readonly NdeReportRevisionRecord[]; readonly pwhtCycles: readonly PwhtCycleRecord[];
  readonly testPackages: readonly TestPackageRecord[];
  readonly weldReadiness: readonly { readonly weldId: string; readonly blockers: readonly string[] }[];
}

function required(value: string, field: string, maximum = 4_000): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || /[\u0000\r\n]/u.test(normalized)) throw new ValidationError(`${field} is invalid.`, [`${field}_invalid`]);
  return normalized;
}
function code(value: string, field: string): string {
  const normalized = required(value, field, 64).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_.-]{0,63}$/u.test(normalized)) throw new ValidationError(`${field} is invalid.`, [`${field}_invalid`]);
  return normalized;
}
function codes(values: readonly string[], field: string, requireOne = true): readonly string[] {
  const result = values.map((value) => code(value, field));
  if (requireOne && result.length === 0) throw new ValidationError(`${field} is required.`, [`${field}_required`]);
  if (new Set(result).size !== result.length) throw new ValidationError(`${field} contains duplicates.`, [`${field}_duplicate`]);
  return result;
}
function strings(values: readonly string[], field: string, requireOne = false): readonly string[] {
  const result = values.map((value) => required(value, field, 2_000));
  if (requireOne && result.length === 0) throw new ValidationError(`${field} is required.`, [`${field}_required`]);
  if (new Set(result).size !== result.length) throw new ValidationError(`${field} contains duplicates.`, [`${field}_duplicate`]);
  return result;
}
function date(value: Date, field: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new ValidationError(`${field} is invalid.`, [`${field}_invalid`]);
  return new Date(value);
}
function decimal(value: string, field: string): bigint {
  const parsed = parseControlledDecimal(value, { allowZero: true, maximumScale: scale, maximumIntegerDigits: 12 });
  if (!parsed) throw new ValidationError(`${field} is invalid.`, [`${field}_invalid`]);
  return parsed.coefficient * 10n ** BigInt(scale - parsed.scale);
}
function format(value: bigint): string {
  const integer = value / base; const fraction = (value % base).toString().padStart(scale, "0").replace(/0+$/u, "");
  return `${integer}${fraction ? `.${fraction}` : ""}`;
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
  return { id: idFactory(), occurredAt, ...payload, canonicalSha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
}
function releasedRevision(transaction: FoundationTransaction, projectId: string, revisionId: string): string {
  const revision = transaction.revisionById(revisionId); const document = revision ? transaction.documentById(revision.documentId) : null;
  if (!revision || !document || document.projectId !== projectId || revision.state !== "released") {
    throw new ValidationError("The exact governing document revision is not released for this project.", ["governing_revision_invalid"]);
  }
  return revisionId;
}
function activeProjectOrganization(transaction: FoundationTransaction, projectId: string, organizationId: string, field: string): string {
  const normalized = required(organizationId, field, 128); const project = transaction.projectById(projectId);
  const participation = transaction.projectOrganizationByOrganization(projectId, normalized);
  if (!project || (normalized !== project.businessScopeOrganizationId && participation?.state !== "active")) {
    throw new ValidationError(`${field} must identify the business scope or an active project participant.`, [`${field}_invalid`]);
  }
  return normalized;
}
function releasedFiles(transaction: FoundationTransaction, organizationId: string, projectId: string,
  fileIds: readonly string[], field: string, requireOne = true): readonly string[] {
  const ids = strings(fileIds, field, requireOne);
  for (const fileId of ids) {
    const file = transaction.governedFileById(fileId);
    if (!file || file.businessScopeOrganizationId !== organizationId || file.projectId !== projectId
      || file.validationState !== "released" || file.malwareState !== "clean" || file.detectedSha256 !== file.sha256) {
      throw new ValidationError("Execution evidence must be an integrity-matched released project file.", ["evidence_file_invalid"]);
    }
  }
  return ids;
}
function equipment(transaction: FoundationTransaction, projectId: string, equipmentIds: readonly string[],
  capability: string, at: Date): readonly string[] {
  const ids = strings(equipmentIds, "equipmentIds", true); const requiredCapability = code(capability, "capability");
  for (const id of ids) {
    const item = transaction.equipmentById(id);
    if (!item || item.projectId !== projectId || item.state !== "active" || item.verificationState !== "passed"
      || item.validFrom.getTime() > at.getTime() || item.validTo.getTime() < at.getTime()
      || !item.methodCapabilities.map((value) => value.toUpperCase()).includes(requiredCapability)) {
      throw new ValidationError("Required equipment capability or calibration/verification is invalid at the event time.", ["equipment_invalid"]);
    }
  }
  return ids;
}
function normalizedObject(values: Readonly<Record<string, string>>, field: string): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [code(key, `${field}Key`), required(value, field, 1_000)]));
}
function procedureApplies(procedure: WeldingProcedureRevisionRecord, weld: Pick<WeldJointRecord,
  "processCode" | "materialGroupCode" | "positionCode" | "thickness" | "diameter" | "jointDesignCode">, at: Date): boolean {
  const stateApplies = procedure.state === "approved"
    || (procedure.state === "superseded" && procedure.effectiveTo !== null && at.getTime() <= procedure.effectiveTo.getTime());
  return stateApplies
    && procedure.effectiveFrom.getTime() <= at.getTime() && (procedure.effectiveTo === null || procedure.effectiveTo.getTime() >= at.getTime())
    && procedure.processCodes.includes(weld.processCode) && procedure.materialGroupCodes.includes(weld.materialGroupCode)
    && procedure.positionCodes.includes(weld.positionCode) && procedure.jointDesignCodes.includes(weld.jointDesignCode)
    && decimal(weld.thickness, "thickness") >= decimal(procedure.thicknessMinimum, "thicknessMinimum")
    && decimal(weld.thickness, "thickness") <= decimal(procedure.thicknessMaximum, "thicknessMaximum")
    && decimal(weld.diameter, "diameter") >= decimal(procedure.diameterMinimum, "diameterMinimum")
    && decimal(weld.diameter, "diameter") <= decimal(procedure.diameterMaximum, "diameterMaximum");
}
function pqrSupports(pqr: WeldingProcedureRevisionRecord, scopeRecord: {
  readonly processCodes: readonly string[]; readonly materialGroupCodes: readonly string[]; readonly positionCodes: readonly string[];
  readonly jointDesignCodes: readonly string[]; readonly thicknessMinimum: bigint; readonly thicknessMaximum: bigint;
  readonly diameterMinimum: bigint; readonly diameterMaximum: bigint;
}): boolean {
  return scopeRecord.processCodes.every((item) => pqr.processCodes.includes(item))
    && scopeRecord.materialGroupCodes.every((item) => pqr.materialGroupCodes.includes(item))
    && scopeRecord.positionCodes.every((item) => pqr.positionCodes.includes(item))
    && scopeRecord.jointDesignCodes.every((item) => pqr.jointDesignCodes.includes(item))
    && decimal(pqr.thicknessMinimum, "pqrThicknessMinimum") <= scopeRecord.thicknessMinimum
    && decimal(pqr.thicknessMaximum, "pqrThicknessMaximum") >= scopeRecord.thicknessMaximum
    && decimal(pqr.diameterMinimum, "pqrDiameterMinimum") <= scopeRecord.diameterMinimum
    && decimal(pqr.diameterMaximum, "pqrDiameterMaximum") >= scopeRecord.diameterMaximum;
}
function qualificationApplies(qualification: WelderQualificationRecord, weld: WeldJointRecord, at: Date): boolean {
  const continuityExpires = qualification.lastContinuityAt.getTime() + qualification.continuityIntervalDays * 86_400_000;
  return qualification.state === "active" && qualification.qualifiedAt.getTime() <= at.getTime()
    && qualification.validTo.getTime() >= at.getTime() && continuityExpires >= at.getTime()
    && qualification.processCodes.includes(weld.processCode) && qualification.materialGroupCodes.includes(weld.materialGroupCode)
    && qualification.positionCodes.includes(weld.positionCode)
    && decimal(weld.thickness, "thickness") >= decimal(qualification.thicknessMinimum, "thicknessMinimum")
    && decimal(weld.thickness, "thickness") <= decimal(qualification.thicknessMaximum, "thicknessMaximum")
    && decimal(weld.diameter, "diameter") >= decimal(qualification.diameterMinimum, "diameterMinimum")
    && decimal(weld.diameter, "diameter") <= decimal(qualification.diameterMaximum, "diameterMaximum");
}
function weldBlockers(transaction: FoundationTransaction, weld: WeldJointRecord): readonly string[] {
  const blockers = new Set<string>();
  if (!weld.events.some((event) => event.repairCycle === weld.repairCycle && event.eventType === "visual_examination" && event.result === "pass")) blockers.add("visual_acceptance_required");
  for (const materialId of weld.materialItemIds) {
    const material = transaction.materialById(materialId);
    if (!material || !["released", "issued", "consumed"].includes(material.state)) blockers.add(`material_not_released:${materialId}`);
  }
  for (const method of weld.requiredExaminationMethods) {
    if (!transaction.ndeRequests(weld.projectId).some((request) => request.weldId === weld.id
      && request.repairCycle === weld.repairCycle && request.methodCode === method && request.state === "accepted")) blockers.add(`nde_required:${method}`);
  }
  if (weld.pwhtRequired && !transaction.pwhtCycles(weld.projectId).some((cycle) => cycle.state === "accepted" && cycle.result === "pass" && cycle.weldIds.includes(weld.id))) blockers.add("pwht_required");
  if (transaction.ncrForObject(weld.id).some((ncr) => ncr.state !== "closed")) blockers.add("open_ncr");
  if (weld.state === "repair_required") blockers.add("repair_required");
  return [...blockers].sort();
}

export class ExecutionDisciplineService {
  public constructor(private readonly store: FoundationStore, private readonly clock: Clock = () => new Date(), private readonly idFactory: IdFactory = randomUUID) {}

  public submitProcedure(context: AccessContext, assignments: readonly RoleAssignment[], projectId: string,
    input: SubmitWeldingProcedureInput): Promise<WeldingProcedureRevisionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId); if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "welding.procedure.manage", resource: scope(project.businessScopeOrganizationId, projectId, null), requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa" }, now);
      const effectiveFrom = date(input.effectiveFrom, "effectiveFrom"); const effectiveTo = input.effectiveTo ? date(input.effectiveTo, "effectiveTo") : null;
      if (effectiveTo && effectiveTo.getTime() < effectiveFrom.getTime()) throw new ValidationError("Procedure effective interval is invalid.", ["effective_interval_invalid"]);
      const thicknessMinimum = decimal(input.thicknessMinimum, "thicknessMinimum"), thicknessMaximum = decimal(input.thicknessMaximum, "thicknessMaximum");
      const diameterMinimum = decimal(input.diameterMinimum, "diameterMinimum"), diameterMaximum = decimal(input.diameterMaximum, "diameterMaximum");
      if (thicknessMinimum > thicknessMaximum || diameterMinimum > diameterMaximum) throw new ValidationError("Procedure applicability range is invalid.", ["applicability_range_invalid"]);
      const processCodes = codes(input.processCodes, "processCode"), materialGroupCodes = codes(input.materialGroupCodes, "materialGroupCode");
      const positionCodes = codes(input.positionCodes, "positionCode"), jointDesignCodes = codes(input.jointDesignCodes, "jointDesignCode");
      const supportingPqrIds = strings(input.supportingPqrIds, "supportingPqrIds", input.procedureType === "wps");
      const supportingPqrs = supportingPqrIds.map((id) => transaction.weldingProcedureById(id));
      if (supportingPqrs.some((pqr) => !pqr || pqr.projectId !== projectId || pqr.procedureType !== "pqr" || pqr.state !== "approved")
        || (input.procedureType === "wps" && !supportingPqrs.some((pqr) => pqr && pqrSupports(pqr, {
          processCodes, materialGroupCodes, positionCodes, jointDesignCodes,
          thicknessMinimum, thicknessMaximum, diameterMinimum, diameterMaximum,
        })))) throw new ValidationError("A WPS must cite an exact approved PQR revision that supports its full applicability range.", ["supporting_pqr_invalid"]);
      const superseded = input.supersedesRevisionId ? transaction.weldingProcedureById(input.supersedesRevisionId) : null;
      if (input.supersedesRevisionId && (!superseded || superseded.projectId !== projectId || superseded.number !== code(input.number, "number") || superseded.state !== "approved")) throw new ValidationError("The superseded procedure revision is invalid.", ["supersedes_revision_invalid"]);
      const record: WeldingProcedureRevisionRecord = { id: this.idFactory(), businessScopeOrganizationId: project.businessScopeOrganizationId,
        projectId, procedureType: input.procedureType, number: code(input.number, "number"), revision: code(input.revision, "revision"),
        governingDocumentRevisionId: releasedRevision(transaction, projectId, input.governingDocumentRevisionId), supportingPqrIds,
        processCodes, materialGroupCodes, positionCodes, thicknessMinimum: format(thicknessMinimum), thicknessMaximum: format(thicknessMaximum),
        diameterMinimum: format(diameterMinimum), diameterMaximum: format(diameterMaximum), jointDesignCodes,
        consumableClassifications: codes(input.consumableClassifications, "consumableClassification", input.procedureType === "wps"),
        preheatMinimum: format(decimal(input.preheatMinimum, "preheatMinimum")), interpassMaximum: format(decimal(input.interpassMaximum, "interpassMaximum")),
        effectiveFrom, effectiveTo, state: "under_review", supersedesRevisionId: input.supersedesRevisionId,
        submittedAt: now, submittedBy: context.userId, reviewedAt: null, reviewedBy: null, reviewReason: null, version: 1 };
      transaction.insertWeldingProcedure(record); transaction.appendAudit(audit(this.idFactory, now, context, { projectId,
        action: "welding.procedure_submitted", objectType: "welding_procedure", objectId: record.id, priorState: null,
        newState: record.state, reason: null, changedFields: { number: record.number, revision: record.revision, procedureType: record.procedureType } }));
      return record;
    });
  }

  public reviewProcedure(context: AccessContext, assignments: readonly RoleAssignment[], procedureId: string, expectedVersion: number,
    decision: "approve" | "reject", reason: string): Promise<WeldingProcedureRevisionRecord> {
    const now = this.clock(); return this.store.transaction((transaction) => {
      const record = transaction.weldingProcedureById(procedureId); if (!record) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "welding.procedure.approve", resource: scope(record.businessScopeOrganizationId, record.projectId, record.id), requiredQualifications: ["welding_authority"], forbiddenActorIds: [record.submittedBy], minimumAssurance: "step-up" }, now);
      if (record.version !== expectedVersion) throw new ConflictError(); if (record.state !== "under_review") throw new ValidationError("Procedure is not under review.", ["procedure_state_invalid"]);
      if (decision === "approve" && record.procedureType === "wps" && record.supportingPqrIds.some((id) => transaction.weldingProcedureById(id)?.state !== "approved")) throw new ValidationError("Supporting PQR approval changed.", ["supporting_pqr_invalid"]);
      if (decision === "approve" && record.supersedesRevisionId) { const prior = transaction.weldingProcedureById(record.supersedesRevisionId); if (!prior || prior.state !== "approved") throw new ConflictError(); const supersededAt = new Date(now.getTime() - 1); transaction.updateWeldingProcedure({ ...prior, state: "superseded", effectiveTo: prior.effectiveTo && prior.effectiveTo.getTime() < supersededAt.getTime() ? prior.effectiveTo : supersededAt, version: prior.version + 1 }, prior.version); }
      const reviewed = { ...record, state: decision === "approve" ? "approved" as const : "rejected" as const, reviewedAt: now, reviewedBy: context.userId, reviewReason: required(reason, "reason"), version: record.version + 1 };
      transaction.updateWeldingProcedure(reviewed, expectedVersion); transaction.appendAudit(audit(this.idFactory, now, context, { projectId: record.projectId,
        action: `welding.procedure_${decision}d`, objectType: "welding_procedure", objectId: record.id, priorState: record.state,
        newState: reviewed.state, reason: reviewed.reviewReason, changedFields: { state: reviewed.state } })); return reviewed;
    });
  }

  public submitWelderQualification(context: AccessContext, assignments: readonly RoleAssignment[], projectId: string,
    input: SubmitWelderQualificationInput): Promise<WelderQualificationRecord> {
    const now = this.clock(); return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId); if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "welding.qualification.manage", resource: scope(project.businessScopeOrganizationId, projectId, null), requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa" }, now);
      const qualifiedAt = date(input.qualifiedAt, "qualifiedAt"), validTo = date(input.validTo, "validTo"), lastContinuityAt = date(input.lastContinuityAt, "lastContinuityAt");
      if (validTo.getTime() < qualifiedAt.getTime() || lastContinuityAt.getTime() < qualifiedAt.getTime() || lastContinuityAt.getTime() > now.getTime()) throw new ValidationError("Qualification validity or continuity date is invalid.", ["qualification_interval_invalid"]);
      if (!Number.isInteger(input.continuityIntervalDays) || input.continuityIntervalDays < 1 || input.continuityIntervalDays > 366) throw new ValidationError("Continuity interval is invalid.", ["continuity_interval_invalid"]);
      const thicknessMinimum = decimal(input.thicknessMinimum, "thicknessMinimum"), thicknessMaximum = decimal(input.thicknessMaximum, "thicknessMaximum");
      const diameterMinimum = decimal(input.diameterMinimum, "diameterMinimum"), diameterMaximum = decimal(input.diameterMaximum, "diameterMaximum");
      if (thicknessMinimum > thicknessMaximum || diameterMinimum > diameterMaximum) throw new ValidationError("Qualification range is invalid.", ["qualification_range_invalid"]);
      const record: WelderQualificationRecord = { id: this.idFactory(), businessScopeOrganizationId: project.businessScopeOrganizationId, projectId,
        welderUserId: required(input.welderUserId, "welderUserId", 128), employerOrganizationId: activeProjectOrganization(transaction, projectId, input.employerOrganizationId, "employerOrganizationId"),
        qualificationNumber: code(input.qualificationNumber, "qualificationNumber"), governingDocumentRevisionId: releasedRevision(transaction, projectId, input.governingDocumentRevisionId),
        processCodes: codes(input.processCodes, "processCode"), materialGroupCodes: codes(input.materialGroupCodes, "materialGroupCode"), positionCodes: codes(input.positionCodes, "positionCode"),
        thicknessMinimum: format(thicknessMinimum), thicknessMaximum: format(thicknessMaximum), diameterMinimum: format(diameterMinimum), diameterMaximum: format(diameterMaximum),
        qualifiedAt, validTo, continuityIntervalDays: input.continuityIntervalDays, lastContinuityAt,
        evidenceFileIds: releasedFiles(transaction, project.businessScopeOrganizationId, projectId, input.evidenceFileIds, "evidenceFileIds"),
        state: "under_review", submittedAt: now, submittedBy: context.userId, reviewedAt: null, reviewedBy: null, reviewReason: null, version: 1 };
      transaction.insertWelderQualification(record); transaction.appendAudit(audit(this.idFactory, now, context, { projectId,
        action: "welding.qualification_submitted", objectType: "welder_qualification", objectId: record.id, priorState: null,
        newState: record.state, reason: null, changedFields: { welderUserId: record.welderUserId, qualificationNumber: record.qualificationNumber } })); return record;
    });
  }

  public reviewWelderQualification(context: AccessContext, assignments: readonly RoleAssignment[], qualificationId: string,
    expectedVersion: number, decision: "approve" | "reject", reason: string): Promise<WelderQualificationRecord> {
    const now = this.clock(); return this.store.transaction((transaction) => {
      const record = transaction.welderQualificationById(qualificationId); if (!record) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "welding.qualification.approve", resource: scope(record.businessScopeOrganizationId, record.projectId, record.id), requiredQualifications: ["welding_authority"], forbiddenActorIds: [record.submittedBy, record.welderUserId], minimumAssurance: "step-up" }, now);
      if (record.version !== expectedVersion) throw new ConflictError(); if (record.state !== "under_review") throw new ValidationError("Qualification is not under review.", ["qualification_state_invalid"]);
      const reviewed = { ...record, state: decision === "approve" ? "active" as const : "rejected" as const, reviewedAt: now, reviewedBy: context.userId,
        reviewReason: required(reason, "reason"), version: record.version + 1 };
      transaction.updateWelderQualification(reviewed, expectedVersion); transaction.appendAudit(audit(this.idFactory, now, context, { projectId: record.projectId,
        action: `welding.qualification_${decision}d`, objectType: "welder_qualification", objectId: record.id, priorState: record.state,
        newState: reviewed.state, reason: reviewed.reviewReason, changedFields: { state: reviewed.state } })); return reviewed;
    });
  }

  public createWeld(context: AccessContext, assignments: readonly RoleAssignment[], projectId: string, input: CreateWeldInput): Promise<WeldJointRecord> {
    const now = this.clock(); return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId), wps = transaction.weldingProcedureById(input.wpsRevisionId);
      if (!project || !wps || wps.projectId !== projectId || wps.procedureType !== "wps") throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "welding.manage", resource: scope(project.businessScopeOrganizationId, projectId, null), requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa" }, now);
      for (const [type, structureCode] of [["system", input.systemCode], ["area", input.areaCode], ["work_package", input.workPackageCode]] as const) {
        if (!transaction.projectStructureByCode(projectId, type, code(structureCode, `${type}Code`))) throw new ValidationError("Weld project structure mapping is invalid.", ["structure_mapping_invalid"]);
      }
      const materialItemIds = strings(input.materialItemIds, "materialItemIds", true);
      if (materialItemIds.some((id) => transaction.materialById(id)?.projectId !== projectId)) throw new ValidationError("Weld materials must resolve inside the project.", ["material_link_invalid"]);
      const boundary = transaction.completionBoundaryById(input.completionBoundaryId);
      if (!boundary || boundary.projectId !== projectId || boundary.state !== "active") throw new ValidationError("Completion boundary is invalid.", ["completion_boundary_invalid"]);
      const partial = { processCode: code(input.processCode, "processCode"), materialGroupCode: code(input.materialGroupCode, "materialGroupCode"),
        positionCode: code(input.positionCode, "positionCode"), thickness: format(decimal(input.thickness, "thickness")),
        diameter: format(decimal(input.diameter, "diameter")), jointDesignCode: code(input.jointDesignCode, "jointDesignCode") };
      if (!procedureApplies(wps, partial, now)) throw new ValidationError("The selected WPS is not approved/effective/applicable for the weld.", ["wps_not_applicable"]);
      const weld: WeldJointRecord = { id: this.idFactory(), businessScopeOrganizationId: project.businessScopeOrganizationId, projectId,
        number: code(input.number, "number"), systemCode: code(input.systemCode, "systemCode"), areaCode: code(input.areaCode, "areaCode"),
        workPackageCode: code(input.workPackageCode, "workPackageCode"), componentReferences: strings(input.componentReferences, "componentReferences", true),
        materialItemIds, drawingRevisionId: releasedRevision(transaction, projectId, input.drawingRevisionId),
        weldMapLocation: required(input.weldMapLocation, "weldMapLocation"), wpsRevisionId: wps.id, ...partial,
        requiredExaminationMethods: codes(input.requiredExaminationMethods, "examinationMethod", false), pwhtRequired: input.pwhtRequired,
        completionBoundaryId: boundary.id, repairCycle: 0, events: [], state: "planned", releasedAt: null, releasedBy: null,
        version: 1, createdAt: now, createdBy: context.userId, updatedAt: now, updatedBy: context.userId };
      transaction.insertWeld(weld); transaction.appendAudit(audit(this.idFactory, now, context, { projectId, action: "welding.weld_created",
        objectType: "weld_joint", objectId: weld.id, priorState: null, newState: weld.state, reason: null,
        changedFields: { number: weld.number, drawingRevisionId: weld.drawingRevisionId, wpsRevisionId: weld.wpsRevisionId, materialItemIds } })); return weld;
    });
  }

  public recordWeldEvent(context: AccessContext, assignments: readonly RoleAssignment[], weldId: string,
    input: RecordWeldEventInput): Promise<WeldJointRecord> {
    const now = this.clock(); return this.store.transaction((transaction) => {
      const weld = transaction.weldById(weldId); if (!weld) throw new NotFoundError();
      const inspection = input.eventType === "visual_examination";
      requireAuthorization(context, assignments, { action: inspection ? "welding.inspect" : "welding.execute", resource: scope(weld.businessScopeOrganizationId, weld.projectId, weld.id),
        requiredQualifications: inspection ? ["welding_inspector"] : [], forbiddenActorIds: inspection ? weld.events.filter((item) => item.eventType === "weld_pass" || item.eventType === "repair_weld").map((item) => item.performedBy) : [], minimumAssurance: inspection ? "step-up" : "mfa" }, now);
      if (weld.version !== input.expectedVersion) throw new ConflictError(); if (weld.state === "released") throw new ValidationError("A released weld is immutable.", ["weld_state_invalid"]);
      const performedAt = date(input.performedAt, "performedAt"); if (performedAt.getTime() > now.getTime()) throw new ValidationError("Weld event time cannot be in the future.", ["performed_at_invalid"]);
      const wps = transaction.weldingProcedureById(weld.wpsRevisionId); if (!wps || !procedureApplies(wps, weld, performedAt)) throw new ValidationError("The exact WPS was not applicable at work time.", ["wps_not_applicable"]);
      if (weld.materialItemIds.some((id) => !["released", "issued"].includes(transaction.materialById(id)?.state ?? ""))) throw new ValidationError("Held or unreleased material blocks welding.", ["material_not_released"]);
      const qualificationIds = strings(input.welderQualificationIds, "welderQualificationIds", ["weld_pass", "repair_weld"].includes(input.eventType));
      if (["weld_pass", "repair_weld"].includes(input.eventType)) {
        const qualifications = qualificationIds.map((id) => transaction.welderQualificationById(id));
        if (qualifications.some((item) => !item || item.projectId !== weld.projectId || !qualificationApplies(item, weld, performedAt))
          || !qualifications.some((item) => item?.welderUserId === context.userId)) throw new ValidationError("An exact active applicable welder qualification with current continuity is required.", ["welder_qualification_invalid"]);
      }
      const consumable = input.consumableClassification === null ? null : code(input.consumableClassification, "consumableClassification");
      if (["weld_pass", "repair_weld"].includes(input.eventType) && consumable === null) throw new ValidationError("Weld-pass events require the exact consumable classification.", ["consumable_required"]);
      if (consumable && !wps.consumableClassifications.includes(consumable)) throw new ValidationError("Consumable is not permitted by the exact WPS.", ["consumable_invalid"]);
      const observations = normalizedObject(input.observations, "observations");
      if (input.eventType === "preheat_observation" && decimal(observations.TEMPERATURE ?? "", "temperature") < decimal(wps.preheatMinimum, "preheatMinimum")) throw new ValidationError("Observed preheat is below the WPS minimum.", ["preheat_invalid"]);
      if (["weld_pass", "repair_weld"].includes(input.eventType) && observations.INTERPASS_TEMPERATURE
        && decimal(observations.INTERPASS_TEMPERATURE, "interpassTemperature") > decimal(wps.interpassMaximum, "interpassMaximum")) throw new ValidationError("Observed interpass temperature exceeds the WPS maximum.", ["interpass_invalid"]);
      const permitted: Record<WeldExecutionEvent["eventType"], readonly WeldJointRecord["state"][]> = {
        fit_up: ["planned"], consumable_issue: ["planned", "fit_up_accepted", "welded", "repair_required"], preheat_observation: ["fit_up_accepted", "welded", "repair_required"],
        weld_pass: ["fit_up_accepted", "welded"], visual_examination: ["welded"], repair_excavation: ["repair_required"], repair_weld: ["repair_required"],
      };
      if (!permitted[input.eventType].includes(weld.state)) throw new ValidationError("Weld event is invalid for the current state.", ["weld_transition_invalid"]);
      const eventRepairCycle = input.eventType === "repair_weld"
        || (weld.state === "repair_required" && ["consumable_issue", "preheat_observation"].includes(input.eventType))
        ? weld.repairCycle + 1 : weld.repairCycle;
      if (["weld_pass", "repair_weld"].includes(input.eventType)
        && !weld.events.some((item) => item.eventType === "preheat_observation" && item.repairCycle === eventRepairCycle && item.result === "observed")) {
        throw new ValidationError("A current repair-cycle preheat observation is required before welding.", ["preheat_observation_required"]);
      }
      const event: WeldExecutionEvent = { id: this.idFactory(), eventType: input.eventType, repairCycle: eventRepairCycle, performedAt,
        performedBy: context.userId, welderQualificationIds: qualificationIds, consumableClassification: consumable,
        observations, evidenceFileIds: releasedFiles(transaction, weld.businessScopeOrganizationId, weld.projectId, input.evidenceFileIds,
          "evidenceFileIds", inspection || input.eventType.startsWith("repair_")), result: input.result };
      let state = weld.state; let repairCycle = weld.repairCycle;
      if (input.eventType === "fit_up") state = input.result === "pass" ? "fit_up_accepted" : "planned";
      if (input.eventType === "weld_pass") state = "welded";
      if (input.eventType === "visual_examination") state = input.result === "pass" ? (weld.requiredExaminationMethods.length || weld.pwhtRequired ? "pending_examination" : "ready_for_release") : "repair_required";
      if (input.eventType === "repair_weld") { repairCycle += 1; state = "welded"; }
      const updated: WeldJointRecord = { ...weld, events: [...weld.events, event], repairCycle, state, version: weld.version + 1,
        updatedAt: now, updatedBy: context.userId };
      transaction.updateWeld(updated, input.expectedVersion); transaction.appendAudit(audit(this.idFactory, now, context, { projectId: weld.projectId,
        action: `welding.${input.eventType}_recorded`, objectType: "weld_joint", objectId: weld.id, priorState: weld.state, newState: updated.state,
        reason: null, changedFields: { eventId: event.id, repairCycle: event.repairCycle, result: event.result, welderQualificationIds: qualificationIds } })); return updated;
    });
  }

  public createNdeRequest(context: AccessContext, assignments: readonly RoleAssignment[], projectId: string,
    input: CreateNdeRequestInput): Promise<NdeRequestRecord> {
    const now = this.clock(); return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId), weld = transaction.weldById(input.weldId); if (!project || !weld || weld.projectId !== projectId) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "nde.request.manage", resource: scope(project.businessScopeOrganizationId, projectId, weld.id), requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa" }, now);
      const methodCode = code(input.methodCode, "methodCode"); if (!weld.requiredExaminationMethods.includes(methodCode)) throw new ValidationError("NDE method is not required by the weld record.", ["nde_method_invalid"]);
      if (!["pending_examination", "visual_accepted", "ready_for_release"].includes(weld.state)) throw new ValidationError("The weld is not ready for an NDE request.", ["weld_state_invalid"]);
      if (transaction.ndeRequests(projectId).some((item) => item.weldId === weld.id && item.repairCycle === weld.repairCycle && item.methodCode === methodCode && item.state !== "superseded")) throw new ConflictError("An active request already exists for this method and repair cycle.");
      const request: NdeRequestRecord = { id: this.idFactory(), businessScopeOrganizationId: project.businessScopeOrganizationId, projectId,
        number: code(input.number, "number"), weldId: weld.id, repairCycle: weld.repairCycle, methodCode,
        extent: required(input.extent, "extent"), techniqueDocumentRevisionId: releasedRevision(transaction, projectId, input.techniqueDocumentRevisionId),
        acceptanceReference: required(input.acceptanceReference, "acceptanceReference"), examinationStage: required(input.examinationStage, "examinationStage"),
        requiredPersonnelQualification: code(input.requiredPersonnelQualification, "requiredPersonnelQualification"), dueAt: date(input.dueAt, "dueAt"),
        holdWitnessContext: required(input.holdWitnessContext, "holdWitnessContext"), reportRevisionIds: [], state: "requested", version: 1,
        createdAt: now, createdBy: context.userId, updatedAt: now, updatedBy: context.userId };
      transaction.insertNdeRequest(request); transaction.appendAudit(audit(this.idFactory, now, context, { projectId, action: "nde.request_created",
        objectType: "nde_request", objectId: request.id, priorState: null, newState: request.state, reason: null,
        changedFields: { weldId: weld.id, repairCycle: request.repairCycle, methodCode, techniqueDocumentRevisionId: request.techniqueDocumentRevisionId } })); return request;
    });
  }

  public submitNdeReport(context: AccessContext, assignments: readonly RoleAssignment[], requestId: string,
    input: SubmitNdeReportInput): Promise<{ readonly request: NdeRequestRecord; readonly report: NdeReportRevisionRecord }> {
    const now = this.clock(); return this.store.transaction((transaction) => {
      const request = transaction.ndeRequestById(requestId), weld = request ? transaction.weldById(request.weldId) : null; if (!request || !weld) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "nde.perform", resource: scope(request.businessScopeOrganizationId, request.projectId, request.id),
        requiredQualifications: [request.requiredPersonnelQualification], forbiddenActorIds: [], minimumAssurance: "mfa" }, now);
      if (!['requested', 'submitted'].includes(request.state) || request.repairCycle !== weld.repairCycle) throw new ValidationError("NDE request is not current for the weld repair cycle.", ["nde_request_state_invalid"]);
      const performedAt = date(input.performedAt, "performedAt"); const equipmentIds = equipment(transaction, request.projectId, input.equipmentIds, request.methodCode, performedAt);
      const report: NdeReportRevisionRecord = { id: this.idFactory(), requestId: request.id, revision: code(input.revision, "revision"), examinerUserId: context.userId,
        examinerOrganizationId: activeProjectOrganization(transaction, request.projectId, input.examinerOrganizationId, "examinerOrganizationId"), personnelQualificationReference: required(input.personnelQualificationReference, "personnelQualificationReference"),
        equipmentIds, mediaFileIds: releasedFiles(transaction, request.businessScopeOrganizationId, request.projectId, input.mediaFileIds, "mediaFileIds", false),
        performedAt, conditions: normalizedObject(input.conditions, "conditions"), indications: strings(input.indications, "indications"), result: input.result,
        evidenceFileIds: releasedFiles(transaction, request.businessScopeOrganizationId, request.projectId, input.evidenceFileIds, "evidenceFileIds"),
        repairCycle: request.repairCycle, state: "submitted", submittedAt: now, submittedBy: context.userId,
        reviewedAt: null, reviewedBy: null, reviewReason: null, version: 1 };
      const updated: NdeRequestRecord = { ...request, reportRevisionIds: [...request.reportRevisionIds, report.id], state: "submitted", version: request.version + 1,
        updatedAt: now, updatedBy: context.userId };
      transaction.insertNdeReport(report); transaction.updateNdeRequest(updated, request.version); transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: request.projectId, action: "nde.report_submitted", objectType: "nde_report", objectId: report.id,
        priorState: null, newState: report.state, reason: null, changedFields: { requestId: request.id, revision: report.revision, repairCycle: report.repairCycle, result: report.result } }));
      return { request: updated, report };
    });
  }

  public reviewNdeReport(context: AccessContext, assignments: readonly RoleAssignment[], reportId: string, expectedVersion: number,
    decision: "accept" | "reject", reason: string): Promise<{ readonly request: NdeRequestRecord; readonly report: NdeReportRevisionRecord; readonly weld: WeldJointRecord }> {
    const now = this.clock(); return this.store.transaction((transaction) => {
      const report = transaction.ndeReportById(reportId), request = report ? transaction.ndeRequestById(report.requestId) : null,
        weld = request ? transaction.weldById(request.weldId) : null; if (!report || !request || !weld) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "nde.approve", resource: scope(request.businessScopeOrganizationId, request.projectId, report.id),
        requiredQualifications: ["nde_acceptance_authority"], forbiddenActorIds: [report.examinerUserId, report.submittedBy], minimumAssurance: "step-up" }, now);
      if (report.version !== expectedVersion) throw new ConflictError(); if (report.state !== "submitted" || request.repairCycle !== weld.repairCycle) throw new ValidationError("NDE report is not current and submitted.", ["nde_report_state_invalid"]);
      const reviewedReport: NdeReportRevisionRecord = { ...report, state: decision === "accept" ? "accepted" : "rejected", reviewedAt: now, reviewedBy: context.userId,
        reviewReason: required(reason, "reason"), version: report.version + 1 };
      const acceptedResult = decision === "accept" && report.result === "accept";
      const reviewedRequest: NdeRequestRecord = { ...request, state: decision === "reject" ? "requested" : acceptedResult ? "accepted" : "rejected",
        version: request.version + 1, updatedAt: now, updatedBy: context.userId };
      let updatedWeld: WeldJointRecord = { ...weld };
      if (decision === "accept" && report.result === "reject") updatedWeld = { ...weld, state: "repair_required", version: weld.version + 1, updatedAt: now, updatedBy: context.userId };
      else if (acceptedResult) { const blockers = weldBlockers(transaction, weld).filter((blocker) => blocker !== `nde_required:${request.methodCode}`); if (blockers.length === 0) updatedWeld = { ...weld, state: "ready_for_release", version: weld.version + 1, updatedAt: now, updatedBy: context.userId }; }
      transaction.updateNdeReport(reviewedReport, expectedVersion); transaction.updateNdeRequest(reviewedRequest, request.version);
      if (updatedWeld.version !== weld.version) transaction.updateWeld(updatedWeld, weld.version);
      transaction.appendAudit(audit(this.idFactory, now, context, { projectId: request.projectId, action: `nde.report_${decision}ed`, objectType: "nde_report",
        objectId: report.id, priorState: report.state, newState: reviewedReport.state, reason: reviewedReport.reviewReason,
        changedFields: { reportResult: report.result, requestState: reviewedRequest.state, weldState: updatedWeld.state } }));
      return { request: reviewedRequest, report: reviewedReport, weld: updatedWeld };
    });
  }

  public submitPwhtCycle(context: AccessContext, assignments: readonly RoleAssignment[], projectId: string,
    input: SubmitPwhtCycleInput): Promise<PwhtCycleRecord> {
    const now = this.clock(); return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId); if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "pwht.perform", resource: scope(project.businessScopeOrganizationId, projectId, null), requiredQualifications: ["pwht_operator"], forbiddenActorIds: [], minimumAssurance: "mfa" }, now);
      const weldIds = strings(input.weldIds, "weldIds", true); const welds = weldIds.map((id) => transaction.weldById(id));
      if (welds.some((weld) => !weld || weld.projectId !== projectId || !weld.pwhtRequired || !["pending_examination", "ready_for_release"].includes(weld.state))) throw new ValidationError("PWHT weld scope is invalid or not ready.", ["pwht_scope_invalid"]);
      const performedAt = date(input.performedAt, "performedAt"), equipmentIds = equipment(transaction, projectId, input.equipmentIds, "PWHT", performedAt);
      const thermocouples = input.thermocouples.map((item) => ({ thermocoupleId: code(item.thermocoupleId, "thermocoupleId"), location: required(item.location, "location"),
        minimumTemperature: format(decimal(item.minimumTemperature, "minimumTemperature")), maximumTemperature: format(decimal(item.maximumTemperature, "maximumTemperature")), withinTolerance: item.withinTolerance }));
      if (thermocouples.length === 0 || (input.result === "pass" && thermocouples.some((item) => !item.withinTolerance))) throw new ValidationError("PWHT pass requires all thermocouples within tolerance.", ["pwht_tolerance_invalid"]);
      const cycle: PwhtCycleRecord = { id: this.idFactory(), businessScopeOrganizationId: project.businessScopeOrganizationId, projectId,
        number: code(input.number, "number"), procedureDocumentRevisionId: releasedRevision(transaction, projectId, input.procedureDocumentRevisionId), weldIds,
        heatingRate: format(decimal(input.heatingRate, "heatingRate")), coolingRate: format(decimal(input.coolingRate, "coolingRate")),
        soakTemperatureMinimum: format(decimal(input.soakTemperatureMinimum, "soakTemperatureMinimum")), soakTemperatureMaximum: format(decimal(input.soakTemperatureMaximum, "soakTemperatureMaximum")),
        soakDurationMinutes: format(decimal(input.soakDurationMinutes, "soakDurationMinutes")), thermocouples, equipmentIds,
        chartFileId: releasedFiles(transaction, project.businessScopeOrganizationId, projectId, [input.chartFileId], "chartFileId")[0]!,
        evidenceFileIds: releasedFiles(transaction, project.businessScopeOrganizationId, projectId, input.evidenceFileIds, "evidenceFileIds"),
        interruptions: strings(input.interruptions, "interruptions"), result: input.result, state: "submitted", performedAt, performedBy: context.userId,
        reviewedAt: null, reviewedBy: null, reviewReason: null, version: 1 };
      transaction.insertPwhtCycle(cycle); transaction.appendAudit(audit(this.idFactory, now, context, { projectId, action: "pwht.cycle_submitted",
        objectType: "pwht_cycle", objectId: cycle.id, priorState: null, newState: cycle.state, reason: null,
        changedFields: { weldIds, result: cycle.result, chartFileId: cycle.chartFileId, equipmentIds } })); return cycle;
    });
  }

  public reviewPwhtCycle(context: AccessContext, assignments: readonly RoleAssignment[], cycleId: string, expectedVersion: number,
    decision: "accept" | "reject", reason: string): Promise<PwhtCycleRecord> {
    const now = this.clock(); return this.store.transaction((transaction) => {
      const cycle = transaction.pwhtCycleById(cycleId); if (!cycle) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "pwht.approve", resource: scope(cycle.businessScopeOrganizationId, cycle.projectId, cycle.id), requiredQualifications: ["pwht_acceptance_authority"], forbiddenActorIds: [cycle.performedBy], minimumAssurance: "step-up" }, now);
      if (cycle.version !== expectedVersion) throw new ConflictError(); if (cycle.state !== "submitted") throw new ValidationError("PWHT cycle is not submitted.", ["pwht_state_invalid"]);
      if (decision === "accept" && cycle.result !== "pass") throw new ValidationError("A failed PWHT cycle cannot be accepted.", ["pwht_result_invalid"]);
      const reviewed = { ...cycle, state: decision === "accept" ? "accepted" as const : "rejected" as const, reviewedAt: now,
        reviewedBy: context.userId, reviewReason: required(reason, "reason"), version: cycle.version + 1 };
      transaction.updatePwhtCycle(reviewed, expectedVersion); transaction.appendAudit(audit(this.idFactory, now, context, { projectId: cycle.projectId,
        action: `pwht.cycle_${decision}ed`, objectType: "pwht_cycle", objectId: cycle.id, priorState: cycle.state,
        newState: reviewed.state, reason: reviewed.reviewReason, changedFields: { result: cycle.result } })); return reviewed;
    });
  }

  public weldReleaseReadiness(context: AccessContext, assignments: readonly RoleAssignment[], weldId: string): Promise<readonly string[]> {
    const now = this.clock(); return this.store.transaction((transaction) => {
      const weld = transaction.weldById(weldId); if (!weld) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "execution.read", resource: scope(weld.businessScopeOrganizationId, weld.projectId, weld.id), requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "standard" }, now);
      return weldBlockers(transaction, weld);
    });
  }

  public releaseWeld(context: AccessContext, assignments: readonly RoleAssignment[], weldId: string, expectedVersion: number,
    reason: string): Promise<WeldJointRecord> {
    const now = this.clock(); return this.store.transaction((transaction) => {
      const weld = transaction.weldById(weldId); if (!weld) throw new NotFoundError();
      const performers = weld.events.filter((event) => ["weld_pass", "repair_weld", "visual_examination"].includes(event.eventType)).map((event) => event.performedBy);
      requireAuthorization(context, assignments, { action: "welding.release", resource: scope(weld.businessScopeOrganizationId, weld.projectId, weld.id),
        requiredQualifications: ["welding_release_authority"], forbiddenActorIds: performers, minimumAssurance: "step-up" }, now);
      if (weld.version !== expectedVersion) throw new ConflictError(); const blockers = weldBlockers(transaction, weld);
      if (blockers.length) throw new ValidationError("Weld release prerequisites are incomplete.", blockers);
      const released: WeldJointRecord = { ...weld, state: "released", releasedAt: now, releasedBy: context.userId,
        version: weld.version + 1, updatedAt: now, updatedBy: context.userId };
      transaction.updateWeld(released, expectedVersion); transaction.appendAudit(audit(this.idFactory, now, context, { projectId: weld.projectId,
        action: "welding.weld_released", objectType: "weld_joint", objectId: weld.id, priorState: weld.state, newState: released.state,
        reason: required(reason, "reason"), changedFields: { repairCycle: weld.repairCycle } })); return released;
    });
  }

  public createTestPackage(context: AccessContext, assignments: readonly RoleAssignment[], projectId: string,
    input: CreateTestPackageInput): Promise<TestPackageRecord> {
    const now = this.clock(); return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId), boundary = transaction.completionBoundaryById(input.completionBoundaryId);
      if (!project || !boundary || boundary.projectId !== projectId || boundary.state !== "active") throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "testing.manage", resource: scope(project.businessScopeOrganizationId, projectId, boundary.id), requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa" }, now);
      const governingDocumentRevisionIds = strings(input.governingDocumentRevisionIds, "governingDocumentRevisionIds", true).map((id) => releasedRevision(transaction, projectId, id));
      const drawingRevisionIds = strings(input.drawingRevisionIds, "drawingRevisionIds", true).map((id) => releasedRevision(transaction, projectId, id));
      const gaugeEquipmentIds = equipment(transaction, projectId, input.gaugeEquipmentIds, "PRESSURE", now);
      const targetPressure = input.targetPressure === null ? null : format(decimal(input.targetPressure, "targetPressure"));
      if (input.testType !== "functional" && targetPressure === null) throw new ValidationError("Pressure/leak tests require a target pressure.", ["target_pressure_required"]);
      const record: TestPackageRecord = { id: this.idFactory(), businessScopeOrganizationId: project.businessScopeOrganizationId, projectId,
        number: code(input.number, "number"), testType: input.testType, completionBoundaryId: boundary.id, governingDocumentRevisionIds,
        drawingRevisionIds, testMedium: required(input.testMedium, "testMedium"), targetPressure,
        holdDurationMinutes: format(decimal(input.holdDurationMinutes, "holdDurationMinutes")),
        hazardPermitReferences: strings(input.hazardPermitReferences, "hazardPermitReferences", true),
        prerequisiteReferences: strings(input.prerequisiteReferences, "prerequisiteReferences", true),
        blindValveInstrumentReferences: strings(input.blindValveInstrumentReferences, "blindValveInstrumentReferences", true), gaugeEquipmentIds,
        participantUserIds: strings(input.participantUserIds, "participantUserIds", true), witnessUserIds: strings(input.witnessUserIds, "witnessUserIds", true),
        evidenceFileIds: [], result: null, deficiencyNcrIds: [], restorationConfirmation: null, state: "draft", performedAt: null, performedBy: null,
        reviewedAt: null, reviewedBy: null, reviewReason: null, version: 1, createdAt: now, createdBy: context.userId, updatedAt: now, updatedBy: context.userId };
      transaction.insertTestPackage(record); transaction.appendAudit(audit(this.idFactory, now, context, { projectId, action: "testing.package_created",
        objectType: "test_package", objectId: record.id, priorState: null, newState: record.state, reason: null,
        changedFields: { testType: record.testType, completionBoundaryId: record.completionBoundaryId, targetPressure: record.targetPressure } })); return record;
    });
  }

  private testBlockers(transaction: FoundationTransaction, record: TestPackageRecord, at: Date): readonly string[] {
    const blockers = new Set<string>(); const boundaryWelds = transaction.welds(record.projectId).filter((weld) => weld.completionBoundaryId === record.completionBoundaryId);
    if (boundaryWelds.length === 0) blockers.add("boundary_has_no_welds");
    for (const weld of boundaryWelds) if (weld.state !== "released") blockers.add(`weld_not_released:${weld.number}`);
    for (const id of record.governingDocumentRevisionIds.concat(record.drawingRevisionIds)) {
      try { releasedRevision(transaction, record.projectId, id); } catch { blockers.add(`document_not_released:${id}`); }
    }
    try { equipment(transaction, record.projectId, record.gaugeEquipmentIds, "PRESSURE", at); } catch { blockers.add("gauge_invalid"); }
    for (const ncrId of record.deficiencyNcrIds) if (transaction.ncrById(ncrId)?.state !== "closed") blockers.add(`deficiency_open:${ncrId}`);
    return [...blockers].sort();
  }

  public refreshTestReadiness(context: AccessContext, assignments: readonly RoleAssignment[], testPackageId: string,
    expectedVersion: number): Promise<{ readonly testPackage: TestPackageRecord; readonly blockers: readonly string[] }> {
    const now = this.clock(); return this.store.transaction((transaction) => {
      const record = transaction.testPackageById(testPackageId); if (!record) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "testing.manage", resource: scope(record.businessScopeOrganizationId, record.projectId, record.id), requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa" }, now);
      if (record.version !== expectedVersion) throw new ConflictError(); if (!['draft', 'ready'].includes(record.state)) throw new ValidationError("Test readiness cannot be refreshed in this state.", ["test_state_invalid"]);
      const blockers = this.testBlockers(transaction, record, now); const state = blockers.length ? "draft" as const : "ready" as const;
      if (state === record.state) return { testPackage: record, blockers };
      const updated = { ...record, state, version: record.version + 1, updatedAt: now, updatedBy: context.userId };
      transaction.updateTestPackage(updated, expectedVersion); transaction.appendAudit(audit(this.idFactory, now, context, { projectId: record.projectId,
        action: "testing.readiness_refreshed", objectType: "test_package", objectId: record.id, priorState: record.state, newState: state,
        reason: null, changedFields: { blockers } })); return { testPackage: updated, blockers };
    });
  }

  public submitTestResult(context: AccessContext, assignments: readonly RoleAssignment[], testPackageId: string,
    input: SubmitTestResultInput): Promise<TestPackageRecord> {
    const now = this.clock(); return this.store.transaction((transaction) => {
      const record = transaction.testPackageById(testPackageId); if (!record) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "testing.execute", resource: scope(record.businessScopeOrganizationId, record.projectId, record.id), requiredQualifications: ["test_director"], forbiddenActorIds: [], minimumAssurance: "mfa" }, now);
      if (record.version !== input.expectedVersion) throw new ConflictError(); if (record.state !== "ready") throw new ValidationError("Test package is not ready.", ["test_state_invalid"]);
      const performedAt = date(input.performedAt, "performedAt"), blockers = this.testBlockers(transaction, record, performedAt); if (blockers.length) throw new ValidationError("Test readiness changed before execution.", blockers);
      const deficiencyNcrIds = strings(input.deficiencyNcrIds, "deficiencyNcrIds", input.result === "fail");
      if (deficiencyNcrIds.some((id) => transaction.ncrById(id)?.projectId !== record.projectId)) throw new ValidationError("Deficiency NCR link is invalid.", ["deficiency_link_invalid"]);
      const updated: TestPackageRecord = { ...record, evidenceFileIds: releasedFiles(transaction, record.businessScopeOrganizationId, record.projectId, input.evidenceFileIds, "evidenceFileIds"),
        result: input.result, deficiencyNcrIds, restorationConfirmation: required(input.restorationConfirmation, "restorationConfirmation"),
        state: "submitted", performedAt, performedBy: context.userId, version: record.version + 1, updatedAt: now, updatedBy: context.userId };
      transaction.updateTestPackage(updated, input.expectedVersion); transaction.appendAudit(audit(this.idFactory, now, context, { projectId: record.projectId,
        action: "testing.result_submitted", objectType: "test_package", objectId: record.id, priorState: record.state, newState: updated.state,
        reason: null, changedFields: { result: updated.result, evidenceFileIds: updated.evidenceFileIds, deficiencyNcrIds, restorationConfirmation: updated.restorationConfirmation } })); return updated;
    });
  }

  public reviewTestResult(context: AccessContext, assignments: readonly RoleAssignment[], testPackageId: string, expectedVersion: number,
    decision: "accept" | "reject", reason: string): Promise<TestPackageRecord> {
    const now = this.clock(); return this.store.transaction((transaction) => {
      const record = transaction.testPackageById(testPackageId); if (!record) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "testing.approve", resource: scope(record.businessScopeOrganizationId, record.projectId, record.id), requiredQualifications: ["testing_acceptance_authority"], forbiddenActorIds: [record.performedBy ?? record.createdBy], minimumAssurance: "step-up" }, now);
      if (record.version !== expectedVersion) throw new ConflictError(); if (record.state !== "submitted") throw new ValidationError("Test result is not submitted.", ["test_state_invalid"]);
      if (decision === "accept" && (record.result !== "pass" || this.testBlockers(transaction, record, record.performedAt ?? now).length)) throw new ValidationError("A failed or blocked test cannot be accepted.", ["test_acceptance_blocked"]);
      const reviewed: TestPackageRecord = { ...record, state: decision === "accept" ? "accepted" : "rejected", reviewedAt: now,
        reviewedBy: context.userId, reviewReason: required(reason, "reason"), version: record.version + 1, updatedAt: now, updatedBy: context.userId };
      transaction.updateTestPackage(reviewed, expectedVersion); transaction.appendAudit(audit(this.idFactory, now, context, { projectId: record.projectId,
        action: `testing.result_${decision}ed`, objectType: "test_package", objectId: record.id, priorState: record.state, newState: reviewed.state,
        reason: reviewed.reviewReason, changedFields: { result: record.result, completionBoundaryId: record.completionBoundaryId } })); return reviewed;
    });
  }

  public snapshot(context: AccessContext, assignments: readonly RoleAssignment[], projectId: string): Promise<ExecutionDisciplineSnapshot> {
    const now = this.clock(); return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId); if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "execution.read", resource: scope(project.businessScopeOrganizationId, projectId, null), requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "standard" }, now);
      const welds = transaction.welds(projectId), ndeRequests = transaction.ndeRequests(projectId);
      return { procedures: transaction.weldingProcedures(projectId), welderQualifications: transaction.welderQualifications(projectId), welds,
        ndeRequests, ndeReports: ndeRequests.flatMap((request) => transaction.ndeReports(request.id)), pwhtCycles: transaction.pwhtCycles(projectId),
        testPackages: transaction.testPackages(projectId), weldReadiness: welds.map((weld) => ({ weldId: weld.id, blockers: weldBlockers(transaction, weld) })) };
    });
  }
}
