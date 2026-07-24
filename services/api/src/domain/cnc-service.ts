import { createHash, randomUUID } from "node:crypto";
import type {
  AccessContext,
  AuditEvent,
  CncExecutionRecord,
  CncMachineProfileRevisionRecord,
  CncNormalizedOperation,
  CncProcessType,
  CncProgramRevisionRecord,
  CncStockDefinition,
  CncValidationFinding,
  RoleAssignment,
} from "@eiep/shared-types";
import { parseControlledDecimal, requireAuthorization } from "@eiep/rules-engine";
import { ConflictError, NotFoundError, ValidationError } from "./errors.js";
import type { FoundationStore, FoundationTransaction } from "./foundation-store.js";

type Clock = () => Date;
type IdFactory = () => string;

export interface CreateCncMachineProfileInput {
  readonly workCenterCode: string;
  readonly revision: string;
  readonly parentRevisionId: string | null;
  readonly revisionReason: string;
  readonly processTypes: readonly CncProcessType[];
  readonly stockFormCodes: readonly string[];
  readonly supportedOperationTypes: readonly CncNormalizedOperation["operationType"][];
  readonly supportedFeatureCodes: readonly string[];
  readonly unitCode: string;
  readonly coordinateSystemCode: string;
  readonly maximumLength: string;
  readonly maximumWidth: string;
  readonly maximumThickness: string;
  readonly postprocessorName: string;
  readonly postprocessorVersion: string;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
}

export interface CreateCncProgramInput {
  readonly number: string;
  readonly revision: string;
  readonly parentRevisionId: string | null;
  readonly revisionReason: string;
  readonly processType: CncProcessType;
  readonly sourceFormat: CncProgramRevisionRecord["sourceFormat"];
  readonly sourceVersion: string;
  readonly sourceSha256: string;
  readonly sourceFileId: string;
  readonly sourceDocumentRevisionId: string;
  readonly assemblyRevisionId: string;
  readonly travelerId: string;
  readonly travelerOperationKey: string;
  readonly machineProfileRevisionId: string;
  readonly materialItemId: string;
  readonly pieceMark: string;
  readonly quantity: string;
  readonly stock: CncStockDefinition;
  readonly coordinateSystemCode: string;
  readonly operations: readonly CncNormalizedOperation[];
  readonly warningDispositions: Readonly<Record<string, string>>;
}

export interface RecordCncExecutionInput {
  readonly expectedProgramVersion: number;
  readonly releasedArtifactSha256: string;
  readonly workCenterCode: string;
  readonly machineIdentifier: string;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly actualQuantity: string;
  readonly scrapQuantity: string;
  readonly producedMaterialItemIds: readonly string[];
  readonly remnantMaterialItemIds: readonly string[];
  readonly evidenceFileIds: readonly string[];
  readonly exceptionNcrIds: readonly string[];
  readonly result: CncExecutionRecord["result"];
}

export interface CncSnapshot {
  readonly machineProfiles: readonly CncMachineProfileRevisionRecord[];
  readonly programs: readonly CncProgramRevisionRecord[];
  readonly executions: readonly CncExecutionRecord[];
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

function codes(values: readonly string[], field: string, requireOne = false): readonly string[] {
  const normalized = values.map((value) => code(value, field));
  if (requireOne && normalized.length === 0) throw new ValidationError(`${field} is required.`, [`${field}_required`]);
  if (new Set(normalized).size !== normalized.length) throw new ValidationError(`${field} contains duplicates.`, [`${field}_duplicate`]);
  return normalized;
}

function strings(values: readonly string[], field: string, requireOne = false): readonly string[] {
  const normalized = values.map((value) => required(value, field, 256));
  if (requireOne && normalized.length === 0) throw new ValidationError(`${field} is required.`, [`${field}_required`]);
  if (new Set(normalized).size !== normalized.length) throw new ValidationError(`${field} contains duplicates.`, [`${field}_duplicate`]);
  return normalized;
}

function decimal(value: string, field: string, allowZero = false): string {
  const parsed = parseControlledDecimal(value, { allowZero, maximumScale: 6, maximumIntegerDigits: 12 });
  if (!parsed) throw new ValidationError(`${field} is invalid.`, [`${field}_invalid`]);
  return parsed.canonical;
}

function decimalNumber(value: string): number {
  return Number.parseFloat(value);
}

function timestamp(value: Date, field: string, now: Date, futureAllowed = false): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime()) || (!futureAllowed && value.getTime() > now.getTime() + 300_000)) {
    throw new ValidationError(`${field} is invalid.`, [`${field}_invalid`]);
  }
  return new Date(value);
}

function optionalTimestamp(value: Date | null, field: string, now: Date): Date | null {
  return value === null ? null : timestamp(value, field, now, true);
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sha256(value: string, field: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(normalized)) throw new ValidationError(`${field} is invalid.`, [`${field}_invalid`]);
  return normalized;
}

function canonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map((entry) => canonical(entry)).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
  return JSON.stringify(value);
}

function normalizedObject(values: Readonly<Record<string, string>>, field: string): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [code(key, `${field}Key`), required(value, field, 2_000)]));
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
  return { id: idFactory(), occurredAt, ...payload, canonicalSha256: sha256Text(JSON.stringify(payload)) };
}

function releasedFile(transaction: FoundationTransaction, organizationId: string, projectId: string, fileId: string) {
  const file = transaction.governedFileById(fileId);
  if (!file || file.businessScopeOrganizationId !== organizationId || file.projectId !== projectId
    || file.validationState !== "released" || file.malwareState !== "clean" || file.detectedSha256 !== file.sha256) {
    throw new ValidationError("CNC source and evidence files must be released, clean, and integrity matched.", ["cnc_file_invalid"]);
  }
  return file;
}

function findingsFor(transaction: FoundationTransaction, organizationId: string, projectId: string,
  input: CreateCncProgramInput, now: Date): readonly CncValidationFinding[] {
  const findings: CncValidationFinding[] = [];
  const add = (codeValue: string, detail: string, operationKey: string | null = null, severity: "error" | "warning" = "error") => {
    if (!findings.some((item) => item.code === codeValue && item.operationKey === operationKey)) {
      findings.push({ code: codeValue, severity, operationKey, detail });
    }
  };
  const file = transaction.governedFileById(input.sourceFileId);
  if (!file || file.businessScopeOrganizationId !== organizationId || file.projectId !== projectId
    || file.validationState !== "released" || file.malwareState !== "clean" || file.detectedSha256 !== file.sha256) {
    add("source_file_not_released", "The protected source file is not released, clean, and integrity matched.");
  } else if (file.sha256 !== input.sourceSha256.toLowerCase()) add("source_hash_mismatch", "The declared source hash differs from the released file.");
  const revision = transaction.revisionById(input.sourceDocumentRevisionId);
  const document = revision ? transaction.documentById(revision.documentId) : null;
  if (!revision || !document || document.projectId !== projectId || revision.state !== "released" || revision.fileId !== input.sourceFileId) {
    add("source_revision_not_released", "The exact source document revision is not released for this file and project.");
  }
  const assembly = transaction.fabricationAssemblyById(input.assemblyRevisionId);
  if (!assembly || assembly.projectId !== projectId || !["approved", "released_to_fabrication", "in_fabrication"].includes(assembly.state)) {
    add("assembly_not_approved", "The fabrication assembly revision is not approved/current for CNC preparation.");
  }
  const traveler = transaction.fabricationTravelerById(input.travelerId);
  const travelerOperation = traveler?.operations.find((operation) => operation.operationKey === input.travelerOperationKey);
  if (!traveler || traveler.projectId !== projectId || traveler.assemblyRevisionId !== input.assemblyRevisionId || !travelerOperation) {
    add("traveler_operation_mismatch", "The traveler operation is not an exact operation of the fabrication assembly.");
  }
  const material = transaction.materialById(input.materialItemId);
  if (!material || material.projectId !== projectId || !["released", "issued"].includes(material.state)
    || !assembly?.materialItemIds.includes(input.materialItemId)) add("material_scope_mismatch", "Material is not released/issued in the assembly scope.");
  const bomLine = assembly?.bomLines.find((line) => line.pieceMark === input.pieceMark && line.materialItemId === input.materialItemId);
  if (!bomLine) add("piece_not_in_bom", "Piece mark and material do not reconcile to the exact assembly BOM.");
  else if (decimalNumber(input.quantity) > decimalNumber(bomLine.quantity)) add("quantity_mismatch", "Program quantity exceeds the exact assembly BOM quantity.");
  const profile = transaction.cncMachineProfileById(input.machineProfileRevisionId);
  if (!profile || profile.projectId !== projectId || profile.state !== "approved" || profile.effectiveFrom.getTime() > now.getTime()
    || (profile.effectiveTo && profile.effectiveTo.getTime() <= now.getTime())) add("machine_profile_not_active", "Machine profile is not approved and effective.");
  if (profile) {
    if (!profile.processTypes.includes(input.processType)) add("process_unsupported", "Process is outside the machine profile.");
    if (!profile.stockFormCodes.includes(input.stock.formCode.toUpperCase())) add("stock_form_unsupported", "Stock form is outside the machine profile.");
    if (profile.unitCode !== input.stock.unitCode.toUpperCase() || profile.coordinateSystemCode !== input.coordinateSystemCode.toUpperCase()) {
      add("unit_or_coordinate_unsupported", "Units or coordinate convention differ from the machine profile.");
    }
    if (decimalNumber(input.stock.length) > decimalNumber(profile.maximumLength)
      || decimalNumber(input.stock.width) > decimalNumber(profile.maximumWidth)
      || decimalNumber(input.stock.thickness) > decimalNumber(profile.maximumThickness)) {
      add("stock_envelope_exceeded", "Declared stock dimensions exceed the approved machine profile.");
    }
    for (const operation of input.operations) {
      if (!profile.supportedOperationTypes.includes(operation.operationType)) add("operation_unsupported", "Operation type is outside the machine profile.", operation.operationKey);
      if (!profile.supportedFeatureCodes.includes(operation.featureCode.toUpperCase())) add("feature_unsupported", "Feature is outside the machine profile.", operation.operationKey);
      if (decimalNumber(operation.x) > decimalNumber(input.stock.length) || decimalNumber(operation.y) > decimalNumber(input.stock.width)
        || decimalNumber(operation.z) > decimalNumber(input.stock.thickness)) add("geometry_out_of_bounds", "Operation origin exceeds declared stock bounds.", operation.operationKey);
    }
  }
  if (input.operations.length === 0) add("operations_required", "At least one normalized operation is required.");
  const keys = input.operations.map((operation) => operation.operationKey);
  const sequences = input.operations.map((operation) => operation.sequence);
  if (new Set(keys).size !== keys.length || new Set(sequences).size !== sequences.length
    || sequences.some((sequence, index) => index > 0 && sequence <= sequences[index - 1]!)) {
    add("operation_sequence_invalid", "Operation keys and ascending sequence values must be unique.");
  }
  return findings;
}

function normalizeStock(stock: CncStockDefinition): CncStockDefinition {
  return { formCode: code(stock.formCode, "stockFormCode"), unitCode: code(stock.unitCode, "stockUnitCode"),
    length: decimal(stock.length, "stockLength"), width: decimal(stock.width, "stockWidth", true),
    thickness: decimal(stock.thickness, "stockThickness", true),
    diameter: stock.diameter === null ? null : decimal(stock.diameter, "stockDiameter", true) };
}

function normalizeOperations(operations: readonly CncNormalizedOperation[]): readonly CncNormalizedOperation[] {
  return operations.map((operation) => ({ ...operation, operationKey: code(operation.operationKey, "operationKey"),
    sequence: Number.isSafeInteger(operation.sequence) && operation.sequence > 0 ? operation.sequence
      : (() => { throw new ValidationError("operationSequence is invalid.", ["operation_sequence_invalid"]); })(),
    featureCode: code(operation.featureCode, "featureCode"), x: decimal(operation.x, "operationX", true),
    y: decimal(operation.y, "operationY", true), z: decimal(operation.z, "operationZ", true),
    length: decimal(operation.length, "operationLength", true), width: decimal(operation.width, "operationWidth", true),
    depth: decimal(operation.depth, "operationDepth", true), diameter: decimal(operation.diameter, "operationDiameter", true),
    angleDegrees: decimal(operation.angleDegrees, "operationAngle", true),
    toolCode: operation.toolCode === null ? null : code(operation.toolCode, "toolCode"),
    instruction: required(operation.instruction, "operationInstruction", 2_000) }));
}

export class CncService {
  public constructor(private readonly store: FoundationStore, private readonly clock: Clock = () => new Date(),
    private readonly idFactory: IdFactory = randomUUID) {}

  public createMachineProfile(context: AccessContext, assignments: readonly RoleAssignment[], projectId: string,
    input: CreateCncMachineProfileInput): Promise<CncMachineProfileRevisionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId); if (!project || project.state !== "active") throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "cnc.profile.manage", resource: scope(project.businessScopeOrganizationId, projectId, null),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa" }, now);
      const workCenterCode = code(input.workCenterCode, "workCenterCode"); const revision = code(input.revision, "revision");
      if (transaction.cncMachineProfileByRevision(projectId, workCenterCode, revision)) throw new ConflictError();
      const parent = input.parentRevisionId ? transaction.cncMachineProfileById(input.parentRevisionId) : null;
      if ((input.parentRevisionId && (!parent || parent.projectId !== projectId || parent.workCenterCode !== workCenterCode || parent.state !== "approved"))
        || (!input.parentRevisionId && transaction.cncMachineProfiles(projectId).some((item) => item.workCenterCode === workCenterCode))) {
        throw new ValidationError("Machine profile parent lineage is invalid.", ["cnc_profile_parent_invalid"]);
      }
      const effectiveFrom = timestamp(input.effectiveFrom, "effectiveFrom", now, true);
      const effectiveTo = optionalTimestamp(input.effectiveTo, "effectiveTo", now);
      if (effectiveTo && effectiveTo.getTime() <= effectiveFrom.getTime()) throw new ValidationError("Machine profile interval is invalid.", ["cnc_profile_interval_invalid"]);
      const profile: CncMachineProfileRevisionRecord = { id: this.idFactory(), businessScopeOrganizationId: project.businessScopeOrganizationId,
        projectId, workCenterCode, revision, parentRevisionId: parent?.id ?? null, revisionReason: required(input.revisionReason, "revisionReason"),
        processTypes: [...new Set(input.processTypes)], stockFormCodes: codes(input.stockFormCodes, "stockFormCode", true),
        supportedOperationTypes: [...new Set(input.supportedOperationTypes)], supportedFeatureCodes: codes(input.supportedFeatureCodes, "featureCode", true),
        unitCode: code(input.unitCode, "unitCode"), coordinateSystemCode: code(input.coordinateSystemCode, "coordinateSystemCode"),
        maximumLength: decimal(input.maximumLength, "maximumLength"), maximumWidth: decimal(input.maximumWidth, "maximumWidth", true),
        maximumThickness: decimal(input.maximumThickness, "maximumThickness", true), postprocessorName: required(input.postprocessorName, "postprocessorName", 128),
        postprocessorVersion: required(input.postprocessorVersion, "postprocessorVersion", 64), effectiveFrom, effectiveTo,
        state: "under_review", reviewedAt: null, reviewedBy: null, reviewReason: null, version: 1,
        createdAt: now, createdBy: context.userId, updatedAt: now, updatedBy: context.userId };
      if (profile.processTypes.length === 0 || profile.supportedOperationTypes.length === 0) throw new ValidationError("Machine capability scope is required.", ["cnc_profile_capability_required"]);
      transaction.insertCncMachineProfile(profile);
      transaction.appendAudit(audit(this.idFactory, now, context, { projectId, action: "cnc.profile_submitted", objectType: "cnc_machine_profile_revision",
        objectId: profile.id, priorState: null, newState: profile.state, reason: profile.revisionReason,
        changedFields: { workCenterCode, revision, processTypes: profile.processTypes, postprocessorVersion: profile.postprocessorVersion } }));
      return profile;
    });
  }

  public reviewMachineProfile(context: AccessContext, assignments: readonly RoleAssignment[], profileId: string,
    expectedVersion: number, decision: "approve" | "reject", reason: string): Promise<CncMachineProfileRevisionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const profile = transaction.cncMachineProfileById(profileId); if (!profile) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "cnc.profile.approve", resource: scope(profile.businessScopeOrganizationId, profile.projectId, profile.id),
        requiredQualifications: ["cnc_profile_authority"], forbiddenActorIds: [profile.createdBy], minimumAssurance: "step-up" }, now);
      if (profile.version !== expectedVersion) throw new ConflictError();
      if (profile.state !== "under_review") throw new ValidationError("Machine profile is not under review.", ["cnc_profile_state_invalid"]);
      if (decision === "approve" && profile.parentRevisionId) {
        const parent = transaction.cncMachineProfileById(profile.parentRevisionId);
        if (!parent || parent.state !== "approved") throw new ConflictError();
        transaction.updateCncMachineProfile({ ...parent, state: "superseded", version: parent.version + 1, updatedAt: now, updatedBy: context.userId }, parent.version);
      }
      const reviewed: CncMachineProfileRevisionRecord = { ...profile, state: decision === "approve" ? "approved" : "rejected",
        reviewedAt: now, reviewedBy: context.userId, reviewReason: required(reason, "reason"), version: profile.version + 1,
        updatedAt: now, updatedBy: context.userId };
      transaction.updateCncMachineProfile(reviewed, expectedVersion);
      transaction.appendAudit(audit(this.idFactory, now, context, { projectId: profile.projectId,
        action: decision === "approve" ? "cnc.profile_approved" : "cnc.profile_rejected",
        objectType: "cnc_machine_profile_revision", objectId: profile.id, priorState: profile.state, newState: reviewed.state,
        reason: reviewed.reviewReason, changedFields: { decision, revision: profile.revision } }));
      return reviewed;
    });
  }

  public createProgram(context: AccessContext, assignments: readonly RoleAssignment[], projectId: string,
    rawInput: CreateCncProgramInput): Promise<CncProgramRevisionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId); if (!project || project.state !== "active") throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "cnc.program.plan", resource: scope(project.businessScopeOrganizationId, projectId, null),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa" }, now);
      const number = code(rawInput.number, "number"); const revision = code(rawInput.revision, "revision");
      if (transaction.cncProgramByRevision(projectId, number, revision)) throw new ConflictError();
      const parent = rawInput.parentRevisionId ? transaction.cncProgramById(rawInput.parentRevisionId) : null;
      if ((rawInput.parentRevisionId && (!parent || parent.projectId !== projectId || parent.number !== number
        || !["approved", "rejected", "released", "reconciled"].includes(parent.state)))
        || (!rawInput.parentRevisionId && transaction.cncPrograms(projectId).some((item) => item.number === number))) {
        throw new ValidationError("CNC program parent lineage is invalid.", ["cnc_program_parent_invalid"]);
      }
      const input: CreateCncProgramInput = { ...rawInput, number, revision, sourceVersion: required(rawInput.sourceVersion, "sourceVersion", 128),
        sourceSha256: sha256(rawInput.sourceSha256, "sourceSha256"), sourceFileId: required(rawInput.sourceFileId, "sourceFileId", 256),
        sourceDocumentRevisionId: required(rawInput.sourceDocumentRevisionId, "sourceDocumentRevisionId", 256),
        assemblyRevisionId: required(rawInput.assemblyRevisionId, "assemblyRevisionId", 256), travelerId: required(rawInput.travelerId, "travelerId", 256),
        travelerOperationKey: code(rawInput.travelerOperationKey, "travelerOperationKey"), machineProfileRevisionId: required(rawInput.machineProfileRevisionId, "machineProfileRevisionId", 256),
        materialItemId: required(rawInput.materialItemId, "materialItemId", 256), pieceMark: code(rawInput.pieceMark, "pieceMark"),
        quantity: decimal(rawInput.quantity, "quantity"), stock: normalizeStock(rawInput.stock), coordinateSystemCode: code(rawInput.coordinateSystemCode, "coordinateSystemCode"),
        operations: normalizeOperations(rawInput.operations), warningDispositions: normalizedObject(rawInput.warningDispositions, "warningDisposition") };
      const validationFindings = findingsFor(transaction, project.businessScopeOrganizationId, projectId, input, now);
      const normalizedPackage = { schema: "eiep-machine-neutral-v1", projectId, program: { number, revision }, processType: input.processType,
        source: { format: input.sourceFormat, version: input.sourceVersion, sha256: input.sourceSha256, fileId: input.sourceFileId,
          documentRevisionId: input.sourceDocumentRevisionId }, assemblyRevisionId: input.assemblyRevisionId,
        traveler: { id: input.travelerId, operationKey: input.travelerOperationKey }, machineProfileRevisionId: input.machineProfileRevisionId,
        materialItemId: input.materialItemId, pieceMark: input.pieceMark, quantity: input.quantity, stock: input.stock,
        coordinateSystemCode: input.coordinateSystemCode, operations: input.operations, validationRuleVersion: "cnc-validation-v1",
        findings: validationFindings, warningDispositions: input.warningDispositions };
      const normalizedPackageJson = canonical(normalizedPackage);
      const program: CncProgramRevisionRecord = { id: this.idFactory(), businessScopeOrganizationId: project.businessScopeOrganizationId,
        projectId, number, revision, parentRevisionId: parent?.id ?? null, revisionReason: required(input.revisionReason, "revisionReason"),
        processType: input.processType, sourceFormat: input.sourceFormat, sourceVersion: input.sourceVersion, sourceSha256: input.sourceSha256,
        sourceFileId: input.sourceFileId, sourceDocumentRevisionId: input.sourceDocumentRevisionId, assemblyRevisionId: input.assemblyRevisionId,
        travelerId: input.travelerId, travelerOperationKey: input.travelerOperationKey, machineProfileRevisionId: input.machineProfileRevisionId,
        materialItemId: input.materialItemId, pieceMark: input.pieceMark, quantity: input.quantity, stock: input.stock,
        coordinateSystemCode: input.coordinateSystemCode, operations: input.operations, validationRuleVersion: "cnc-validation-v1",
        validationFindings, warningDispositions: input.warningDispositions, normalizedPackageJson,
        normalizedPackageSha256: sha256Text(normalizedPackageJson), releasedArtifactJson: null, releasedArtifactSha256: null,
        state: validationFindings.some((finding) => finding.severity === "error") ? "draft" : "validated",
        submittedAt: null, submittedBy: null, reviewedAt: null, reviewedBy: null, reviewReason: null,
        releasedAt: null, releasedBy: null, releaseReason: null, version: 1, createdAt: now, createdBy: context.userId,
        updatedAt: now, updatedBy: context.userId };
      transaction.insertCncProgram(program);
      transaction.appendAudit(audit(this.idFactory, now, context, { projectId, action: "cnc.program_previewed", objectType: "cnc_program_revision",
        objectId: program.id, priorState: null, newState: program.state, reason: program.revisionReason,
        changedFields: { number, revision, findingCodes: validationFindings.map((finding) => finding.code), normalizedPackageSha256: program.normalizedPackageSha256 } }));
      return program;
    });
  }

  public submitProgram(context: AccessContext, assignments: readonly RoleAssignment[], programId: string,
    expectedVersion: number): Promise<CncProgramRevisionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const program = transaction.cncProgramById(programId); if (!program) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "cnc.program.submit", resource: scope(program.businessScopeOrganizationId, program.projectId, program.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa" }, now);
      if (program.version !== expectedVersion) throw new ConflictError();
      if (program.state !== "validated" || program.validationFindings.some((finding) => finding.severity === "error")
        || program.validationFindings.filter((finding) => finding.severity === "warning")
          .some((finding) => !program.warningDispositions[finding.code])) {
        throw new ValidationError("CNC program preview is not ready for independent review.", ["cnc_program_validation_incomplete"]);
      }
      const submitted: CncProgramRevisionRecord = { ...program, state: "under_review", submittedAt: now, submittedBy: context.userId,
        version: program.version + 1, updatedAt: now, updatedBy: context.userId };
      transaction.updateCncProgram(submitted, expectedVersion);
      transaction.appendAudit(audit(this.idFactory, now, context, { projectId: program.projectId, action: "cnc.program_submitted",
        objectType: "cnc_program_revision", objectId: program.id, priorState: program.state, newState: submitted.state, reason: null,
        changedFields: { normalizedPackageSha256: program.normalizedPackageSha256 } }));
      return submitted;
    });
  }

  public reviewProgram(context: AccessContext, assignments: readonly RoleAssignment[], programId: string,
    expectedVersion: number, decision: "approve" | "reject", reason: string): Promise<CncProgramRevisionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const program = transaction.cncProgramById(programId); if (!program) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "cnc.program.approve", resource: scope(program.businessScopeOrganizationId, program.projectId, program.id),
        requiredQualifications: ["cnc_technical_authority"], forbiddenActorIds: [program.createdBy, program.submittedBy ?? program.createdBy],
        minimumAssurance: "step-up" }, now);
      if (program.version !== expectedVersion) throw new ConflictError();
      if (program.state !== "under_review") throw new ValidationError("CNC program is not under review.", ["cnc_program_state_invalid"]);
      if (decision === "approve" && program.parentRevisionId) {
        const parent = transaction.cncProgramById(program.parentRevisionId);
        if (!parent || !["approved", "rejected", "released", "reconciled"].includes(parent.state)) throw new ConflictError();
        if (parent.state !== "rejected") transaction.updateCncProgram({ ...parent, state: "superseded", version: parent.version + 1,
          updatedAt: now, updatedBy: context.userId }, parent.version);
      }
      const reviewed: CncProgramRevisionRecord = { ...program, state: decision === "approve" ? "approved" : "rejected",
        reviewedAt: now, reviewedBy: context.userId, reviewReason: required(reason, "reason"), version: program.version + 1,
        updatedAt: now, updatedBy: context.userId };
      transaction.updateCncProgram(reviewed, expectedVersion);
      transaction.appendAudit(audit(this.idFactory, now, context, { projectId: program.projectId,
        action: decision === "approve" ? "cnc.program_approved" : "cnc.program_rejected",
        objectType: "cnc_program_revision", objectId: program.id, priorState: program.state, newState: reviewed.state,
        reason: reviewed.reviewReason, changedFields: { normalizedPackageSha256: program.normalizedPackageSha256 } }));
      return reviewed;
    });
  }

  public releaseProgram(context: AccessContext, assignments: readonly RoleAssignment[], programId: string,
    expectedVersion: number, reason: string): Promise<CncProgramRevisionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const program = transaction.cncProgramById(programId); if (!program) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "cnc.job.release", resource: scope(program.businessScopeOrganizationId, program.projectId, program.id),
        requiredQualifications: ["cnc_release_authority"], forbiddenActorIds: [program.createdBy, program.submittedBy ?? "", program.reviewedBy ?? ""],
        minimumAssurance: "step-up" }, now);
      if (program.version !== expectedVersion) throw new ConflictError();
      if (program.state !== "approved") throw new ValidationError("CNC program is not approved for release.", ["cnc_program_state_invalid"]);
      const file = releasedFile(transaction, program.businessScopeOrganizationId, program.projectId, program.sourceFileId);
      const profile = transaction.cncMachineProfileById(program.machineProfileRevisionId);
      const material = transaction.materialById(program.materialItemId);
      const assembly = transaction.fabricationAssemblyById(program.assemblyRevisionId);
      const traveler = transaction.fabricationTravelerById(program.travelerId);
      if (file.sha256 !== program.sourceSha256 || !profile || profile.state !== "approved"
        || !profile.processTypes.includes(program.processType) || profile.workCenterCode.length === 0
        || !material || !["released", "issued"].includes(material.state)
        || !assembly || !["approved", "released_to_fabrication", "in_fabrication"].includes(assembly.state)
        || !traveler || traveler.assemblyRevisionId !== assembly.id
        || !traveler.operations.some((operation) => operation.operationKey === program.travelerOperationKey)) {
        throw new ValidationError("CNC release prerequisites changed after approval.", ["cnc_release_prerequisite_invalid"]);
      }
      const releaseReason = required(reason, "reason");
      const releasedArtifactJson = canonical({ schema: "eiep-machine-neutral-release-v1", normalizedPackageSha256: program.normalizedPackageSha256,
        normalizedPackage: JSON.parse(program.normalizedPackageJson) as unknown, programRevisionId: program.id,
        machineProfile: { id: profile.id, workCenterCode: profile.workCenterCode, postprocessorName: profile.postprocessorName,
          postprocessorVersion: profile.postprocessorVersion }, approvedAt: program.reviewedAt, approvedBy: program.reviewedBy,
        releasedAt: now, releasedBy: context.userId, releaseReason, controlBoundary: "NO_DIRECT_MACHINE_CONTROL" });
      const released: CncProgramRevisionRecord = { ...program, state: "released", releasedArtifactJson,
        releasedArtifactSha256: sha256Text(releasedArtifactJson), releasedAt: now, releasedBy: context.userId, releaseReason,
        version: program.version + 1, updatedAt: now, updatedBy: context.userId };
      transaction.updateCncProgram(released, expectedVersion);
      transaction.appendAudit(audit(this.idFactory, now, context, { projectId: program.projectId, action: "cnc.job_released",
        objectType: "cnc_program_revision", objectId: program.id, priorState: program.state, newState: released.state, reason: releaseReason,
        changedFields: { releasedArtifactSha256: released.releasedArtifactSha256, workCenterCode: profile.workCenterCode,
          controlBoundary: "NO_DIRECT_MACHINE_CONTROL" } }));
      return released;
    });
  }

  public artifact(context: AccessContext, assignments: readonly RoleAssignment[], programId: string): Promise<{
    readonly filename: string; readonly mediaType: "application/json"; readonly sha256: string; readonly content: string;
  }> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const program = transaction.cncProgramById(programId); if (!program) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "cnc.job.download", resource: scope(program.businessScopeOrganizationId, program.projectId, program.id),
        requiredQualifications: [`CNC_${program.processType.toUpperCase()}_OPERATOR`], forbiddenActorIds: [], minimumAssurance: "mfa" }, now);
      if (!program.releasedArtifactJson || !program.releasedArtifactSha256 || !["released", "execution_recorded", "reconciled", "superseded"].includes(program.state)
        || sha256Text(program.releasedArtifactJson) !== program.releasedArtifactSha256) {
        throw new ValidationError("Released CNC artifact is unavailable or failed integrity verification.", ["cnc_artifact_unavailable"]);
      }
      transaction.appendAudit(audit(this.idFactory, now, context, { projectId: program.projectId, action: "cnc.job_downloaded",
        objectType: "cnc_program_revision", objectId: program.id, priorState: program.state, newState: program.state, reason: null,
        changedFields: { releasedArtifactSha256: program.releasedArtifactSha256 } }));
      return { filename: `${program.number}_${program.revision}_machine-neutral.json`, mediaType: "application/json",
        sha256: program.releasedArtifactSha256, content: program.releasedArtifactJson };
    });
  }

  public recordExecution(context: AccessContext, assignments: readonly RoleAssignment[], programId: string,
    input: RecordCncExecutionInput): Promise<{ readonly program: CncProgramRevisionRecord; readonly execution: CncExecutionRecord }> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const program = transaction.cncProgramById(programId); if (!program) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "cnc.execute", resource: scope(program.businessScopeOrganizationId, program.projectId, program.id),
        requiredQualifications: [`CNC_${program.processType.toUpperCase()}_OPERATOR`], forbiddenActorIds: [], minimumAssurance: "mfa" }, now);
      if (program.version !== input.expectedProgramVersion) throw new ConflictError();
      if (program.state !== "released" || !program.releasedArtifactSha256 || transaction.cncExecutionForProgram(program.id)) {
        throw new ValidationError("CNC job is not open for one exact execution record.", ["cnc_execution_state_invalid"]);
      }
      const profile = transaction.cncMachineProfileById(program.machineProfileRevisionId);
      const artifactSha256 = sha256(input.releasedArtifactSha256, "releasedArtifactSha256");
      if (!profile || profile.workCenterCode !== code(input.workCenterCode, "workCenterCode") || artifactSha256 !== program.releasedArtifactSha256) {
        throw new ValidationError("Execution work center or downloaded artifact hash differs from the release.", ["cnc_execution_release_mismatch"]);
      }
      const startedAt = timestamp(input.startedAt, "startedAt", now); const completedAt = timestamp(input.completedAt, "completedAt", now);
      if (completedAt.getTime() < startedAt.getTime()) throw new ValidationError("Execution time interval is invalid.", ["cnc_execution_time_invalid"]);
      const actualQuantity = decimal(input.actualQuantity, "actualQuantity", true); const scrapQuantity = decimal(input.scrapQuantity, "scrapQuantity", true);
      if (decimalNumber(actualQuantity) + decimalNumber(scrapQuantity) > decimalNumber(program.quantity)) {
        throw new ValidationError("Actual plus scrap quantity exceeds the released job quantity.", ["cnc_execution_quantity_invalid"]);
      }
      const evidenceFileIds = strings(input.evidenceFileIds, "evidenceFileIds", true);
      for (const fileId of evidenceFileIds) releasedFile(transaction, program.businessScopeOrganizationId, program.projectId, fileId);
      const producedMaterialItemIds = strings(input.producedMaterialItemIds, "producedMaterialItemIds");
      const remnantMaterialItemIds = strings(input.remnantMaterialItemIds, "remnantMaterialItemIds");
      for (const itemId of [...producedMaterialItemIds, ...remnantMaterialItemIds]) {
        const item = transaction.materialById(itemId);
        if (!item || item.projectId !== program.projectId || item.parentItemId !== program.materialItemId) {
          throw new ValidationError("Produced pieces and remnants must retain source-material genealogy.", ["cnc_material_genealogy_invalid"]);
        }
      }
      const exceptionNcrIds = strings(input.exceptionNcrIds, "exceptionNcrIds");
      for (const ncrId of exceptionNcrIds) if (transaction.ncrById(ncrId)?.projectId !== program.projectId) {
        throw new ValidationError("Execution exception NCR is outside the project.", ["cnc_exception_ncr_invalid"]);
      }
      if ((input.result === "complete" && (exceptionNcrIds.length > 0 || decimalNumber(actualQuantity) !== decimalNumber(program.quantity)))
        || (input.result === "complete_with_exception" && exceptionNcrIds.length === 0)
        || (input.result === "aborted" && decimalNumber(actualQuantity) !== 0)) {
        throw new ValidationError("Execution result, quantity, and exception meaning are inconsistent.", ["cnc_execution_result_invalid"]);
      }
      const execution: CncExecutionRecord = { id: this.idFactory(), businessScopeOrganizationId: program.businessScopeOrganizationId,
        projectId: program.projectId, programRevisionId: program.id, releasedArtifactSha256: artifactSha256,
        workCenterCode: profile.workCenterCode, machineIdentifier: code(input.machineIdentifier, "machineIdentifier"),
        operatorUserId: context.userId, startedAt, completedAt, actualQuantity, scrapQuantity, producedMaterialItemIds,
        remnantMaterialItemIds, evidenceFileIds, exceptionNcrIds, result: input.result, state: "submitted", reviewedAt: null,
        reviewedBy: null, reviewReason: null, version: 1, createdAt: now, createdBy: context.userId, updatedAt: now, updatedBy: context.userId };
      const updatedProgram: CncProgramRevisionRecord = { ...program, state: "execution_recorded", version: program.version + 1,
        updatedAt: now, updatedBy: context.userId };
      transaction.insertCncExecution(execution); transaction.updateCncProgram(updatedProgram, input.expectedProgramVersion);
      transaction.appendAudit(audit(this.idFactory, now, context, { projectId: program.projectId, action: "cnc.execution_recorded",
        objectType: "cnc_execution", objectId: execution.id, priorState: program.state, newState: execution.state, reason: null,
        changedFields: { programRevisionId: program.id, releasedArtifactSha256: artifactSha256, actualQuantity, scrapQuantity, result: input.result } }));
      return { program: updatedProgram, execution };
    });
  }

  public reconcileExecution(context: AccessContext, assignments: readonly RoleAssignment[], executionId: string,
    expectedExecutionVersion: number, expectedProgramVersion: number, decision: "accept" | "reject", reason: string): Promise<{
      readonly program: CncProgramRevisionRecord; readonly execution: CncExecutionRecord;
    }> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const execution = transaction.cncExecutionById(executionId);
      const program = execution ? transaction.cncProgramById(execution.programRevisionId) : null;
      if (!execution || !program) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "cnc.execution.reconcile", resource: scope(program.businessScopeOrganizationId, program.projectId, execution.id),
        requiredQualifications: ["cnc_reconciliation_authority"], forbiddenActorIds: [program.createdBy, program.submittedBy ?? "",
          program.reviewedBy ?? "", program.releasedBy ?? "", execution.operatorUserId], minimumAssurance: "step-up" }, now);
      if (execution.version !== expectedExecutionVersion || program.version !== expectedProgramVersion) throw new ConflictError();
      if (execution.state !== "submitted" || program.state !== "execution_recorded") {
        throw new ValidationError("CNC execution is not awaiting reconciliation.", ["cnc_reconciliation_state_invalid"]);
      }
      if (decision === "accept" && (execution.result !== "complete" || execution.exceptionNcrIds.some((id) => transaction.ncrById(id)?.state !== "closed"))) {
        throw new ValidationError("Only conforming execution with closed exceptions can be accepted.", ["cnc_reconciliation_blocked"]);
      }
      const reviewedExecution: CncExecutionRecord = { ...execution, state: decision === "accept" ? "accepted" : "rejected",
        reviewedAt: now, reviewedBy: context.userId, reviewReason: required(reason, "reason"), version: execution.version + 1,
        updatedAt: now, updatedBy: context.userId };
      const reviewedProgram: CncProgramRevisionRecord = { ...program, state: decision === "accept" ? "reconciled" : "execution_recorded",
        version: program.version + 1, updatedAt: now, updatedBy: context.userId };
      transaction.updateCncExecution(reviewedExecution, expectedExecutionVersion);
      transaction.updateCncProgram(reviewedProgram, expectedProgramVersion);
      transaction.appendAudit(audit(this.idFactory, now, context, { projectId: program.projectId, action: `cnc.execution_${decision}ed`,
        objectType: "cnc_execution", objectId: execution.id, priorState: execution.state, newState: reviewedExecution.state,
        reason: reviewedExecution.reviewReason, changedFields: { programState: reviewedProgram.state, result: execution.result } }));
      return { program: reviewedProgram, execution: reviewedExecution };
    });
  }

  public snapshot(context: AccessContext, assignments: readonly RoleAssignment[], projectId: string): Promise<CncSnapshot> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId); if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "cnc.read", resource: scope(project.businessScopeOrganizationId, projectId, null),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "standard" }, now);
      return { machineProfiles: transaction.cncMachineProfiles(projectId), programs: transaction.cncPrograms(projectId),
        executions: transaction.cncExecutions(projectId) };
    });
  }
}
