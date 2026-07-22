import { createHash, randomUUID } from "node:crypto";
import type {
  AccessContext,
  AuditEvent,
  ExportJobRecord,
  GovernedFileRecord,
  ImportJobRecord,
  ImportedRecord,
  IntegrationMessageRecord,
  NotificationRecord,
  NotificationSubscriptionRecord,
  OfflineDraftRecord,
  RoleAssignment,
  ScopedSearchResult,
  WorkflowConnectivityPolicyRecord,
} from "@eiep/shared-types";
import { authorize, AuthorizationDeniedError, requireAuthorization } from "@eiep/rules-engine";
import { ConflictError, NotFoundError, ValidationError } from "./errors.js";
import type { FoundationStore, FoundationTransaction } from "./foundation-store.js";

type IdFactory = () => string;
type Clock = () => Date;

const sha256Pattern = /^[0-9a-f]{64}$/u;
const supportedMediaTypes = new Set(["application/pdf", "image/jpeg", "image/png", "text/csv", "application/json"]);
const maximumFileSizeBytes = 250 * 1024 * 1024;

export interface StageFileInput {
  readonly storageKey: string;
  readonly originalFilename: string;
  readonly declaredMediaType: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly retentionClass: string;
}

export interface ValidateFileInput {
  readonly detectedMediaType: string;
  readonly detectedSha256: string;
  readonly malwareState: "clean" | "malicious" | "error";
  readonly validatorVersion: string;
  readonly activeContentDetected: boolean;
  readonly encryptedArchiveDetected: boolean;
}

export interface StageImportInput {
  readonly schemaName: "material_receipt" | "punch";
  readonly schemaVersion: number;
  readonly sourceSystem: string;
  readonly rows: readonly {
    readonly externalId: string;
    readonly payload: Readonly<Record<string, string>>;
  }[];
}

export interface RequestExportInput {
  readonly recordClass: "document" | "material" | "ncr" | "punch" | "imported" | "collaboration";
  readonly recordIds: readonly string[];
  readonly format: "csv" | "jsonl";
  readonly recipientOrganizationId: string;
}

export interface ReceiveIntegrationInput {
  readonly interfaceCode: string;
  readonly idempotencyKey: string;
  readonly externalId: string;
  readonly schemaVersion: number;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface QueueOfflineDraftInput {
  readonly operation: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly idempotencyKey: string;
  readonly originalAt: Date;
  readonly deviceId: string;
}

export interface ConfigureNotificationSubscriptionInput {
  readonly eventTypes: readonly string[];
  readonly channel: "in_app" | "email";
  readonly enabled: boolean;
}

export interface DispatchNotificationInput {
  readonly eventType: string;
  readonly recordClass: "document" | "material" | "ncr" | "punch" | "imported" | "collaboration";
  readonly recordId: string;
  readonly recipientUserIds: readonly string[];
  readonly templateCode: string;
  readonly idempotencyKey: string;
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new ValidationError(`${field} is required.`, [`${field}_required`]);
  return normalized;
}

function uniqueRequired(values: readonly string[], field: string): readonly string[] {
  const normalized = values.map((value) => required(value, field));
  if (normalized.length === 0) throw new ValidationError(`${field} is required.`, [`${field}_required`]);
  if (new Set(normalized).size !== normalized.length) throw new ValidationError(`${field} contains duplicates.`, [`${field}_duplicate`]);
  return normalized;
}

function canonicalValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((entry) => canonicalValue(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalValue(entry)]));
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function resource(organizationId: string | null, projectId: string | null, objectId: string | null) {
  return { organizationId, projectId, workPackageId: null, objectId };
}

function audit(
  idFactory: IdFactory,
  now: Date,
  context: AccessContext,
  input: Omit<AuditEvent, "id" | "occurredAt" | "actorUserId" | "actingOrganizationId" | "correlationId" | "canonicalSha256">,
): AuditEvent {
  const payload = {
    actorUserId: context.userId, actingOrganizationId: context.actingOrganizationId,
    projectId: input.projectId, action: input.action, objectType: input.objectType, objectId: input.objectId,
    priorState: input.priorState, newState: input.newState, reason: input.reason,
    correlationId: context.correlationId, changedFields: input.changedFields,
  };
  return { id: idFactory(), occurredAt: now, ...payload, canonicalSha256: canonicalHash(payload) };
}

const connectivityPolicies: readonly WorkflowConnectivityPolicyRecord[] = [
  { operation: "document.read_assigned", classification: "read_only_cache", authoritativeClaimAllowedOffline: false,
    rationale: "Only explicitly assigned exact revisions may be cached with expiry and an offline warning." },
  { operation: "punch.draft.capture", classification: "queued_draft", authoritativeClaimAllowedOffline: false,
    rationale: "A draft may preserve observations but cannot become verified or accepted until synchronized." },
  ...[
    "project.activate", "access.assignment.manage", "document.current_for_work", "document.release", "document.approve",
    "inspection.accept", "material.release", "material.issue", "ncr.disposition.approve", "ncr.close", "turnover.generate",
  ].map((operation): WorkflowConnectivityPolicyRecord => ({
    operation, classification: "online_required", authoritativeClaimAllowedOffline: false,
    rationale: "Authoritative state, authorization, and concurrency must be revalidated online.",
  })),
];

export class PlatformService {
  public constructor(
    private readonly store: FoundationStore,
    private readonly clock: Clock = () => new Date(),
    private readonly idFactory: IdFactory = randomUUID,
  ) {}

  public authorizeFileUpload(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
  ): Promise<void> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "file.upload", resource: resource(project.businessScopeOrganizationId, project.id, null),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
    });
  }

  public stageFile(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    input: StageFileInput,
  ): Promise<GovernedFileRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "file.upload", resource: resource(project.businessScopeOrganizationId, project.id, null),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (!sha256Pattern.test(input.sha256)) throw new ValidationError("File SHA-256 is invalid.", ["file_sha256_invalid"]);
      if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > maximumFileSizeBytes) {
        throw new ValidationError("File size exceeds the configured staging policy.", ["file_size_invalid"]);
      }
      const storageKey = required(input.storageKey, "storageKey");
      const existing = transaction.governedFileByStorageKey(storageKey);
      if (existing) {
        const exactRetry = existing.projectId === project.id
          && existing.uploadedBy === context.userId
          && existing.originalFilename === input.originalFilename.trim()
          && existing.declaredMediaType === input.declaredMediaType.trim()
          && existing.sha256 === input.sha256
          && existing.sizeBytes === input.sizeBytes
          && existing.retentionClass === input.retentionClass.trim();
        if (!exactRetry) throw new ConflictError();
        return existing;
      }
      const file: GovernedFileRecord = {
        id: this.idFactory(), businessScopeOrganizationId: project.businessScopeOrganizationId,
        projectId: project.id, storageKey,
        originalFilename: required(input.originalFilename, "originalFilename"),
        declaredMediaType: required(input.declaredMediaType, "declaredMediaType"), detectedMediaType: null,
        sha256: input.sha256, detectedSha256: null, sizeBytes: input.sizeBytes, validationState: "staged",
        malwareState: "pending", validatorVersion: null, retentionClass: required(input.retentionClass, "retentionClass"),
        activeContentDetected: null, encryptedArchiveDetected: null, version: 1,
        uploadedAt: now, uploadedBy: context.userId, validatedAt: null, validatedBy: null,
        releasedAt: null, releasedBy: null,
      };
      transaction.insertGovernedFile(file);
      const processingPayload = { fileId: file.id, storageKey: file.storageKey };
      transaction.insertIntegrationMessage({
        id: this.idFactory(), direction: "outbox", businessScopeOrganizationId: project.businessScopeOrganizationId,
        projectId: project.id,
        interfaceCode: "document-processing.worker", idempotencyKey: file.id, externalId: file.id,
        schemaVersion: 1, payload: processingPayload, payloadSha256: canonicalHash(processingPayload),
        correlationId: context.correlationId, state: "pending", attemptCount: 0, lastError: null,
        createdAt: now, processedAt: null, version: 1,
      });
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "file.upload_staged", objectType: "file_object", objectId: file.id,
        priorState: null, newState: file.validationState, reason: file.declaredMediaType,
        changedFields: { storageKey: file.storageKey, sha256: file.sha256, sizeBytes: file.sizeBytes,
          originalFilename: file.originalFilename },
      }));
      return file;
    });
  }

  public authorizeOrganizationFileUpload(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    organizationId: string,
  ): void {
    const normalizedOrganizationId = required(organizationId, "organizationId");
    requireAuthorization(context, assignments, {
      action: "file.upload", resource: resource(normalizedOrganizationId, null, null),
      requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
    }, this.clock());
  }

  public stageOrganizationFile(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    organizationId: string,
    input: StageFileInput,
  ): Promise<GovernedFileRecord> {
    const now = this.clock();
    const normalizedOrganizationId = required(organizationId, "organizationId");
    requireAuthorization(context, assignments, {
      action: "file.upload", resource: resource(normalizedOrganizationId, null, null),
      requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
    }, now);
    if (!sha256Pattern.test(input.sha256)) throw new ValidationError("File SHA-256 is invalid.", ["file_sha256_invalid"]);
    if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > maximumFileSizeBytes) {
      throw new ValidationError("File size exceeds the configured staging policy.", ["file_size_invalid"]);
    }
    const storageKey = required(input.storageKey, "storageKey");
    return this.store.transaction((transaction) => {
      const existing = transaction.governedFileByStorageKey(storageKey);
      if (existing) {
        const exactRetry = existing.businessScopeOrganizationId === normalizedOrganizationId
          && existing.projectId === null && existing.uploadedBy === context.userId
          && existing.originalFilename === input.originalFilename.trim()
          && existing.declaredMediaType === input.declaredMediaType.trim()
          && existing.sha256 === input.sha256 && existing.sizeBytes === input.sizeBytes
          && existing.retentionClass === input.retentionClass.trim();
        if (!exactRetry) throw new ConflictError();
        return existing;
      }
      const file: GovernedFileRecord = {
        id: this.idFactory(), businessScopeOrganizationId: normalizedOrganizationId, projectId: null, storageKey,
        originalFilename: required(input.originalFilename, "originalFilename"),
        declaredMediaType: required(input.declaredMediaType, "declaredMediaType"), detectedMediaType: null,
        sha256: input.sha256, detectedSha256: null, sizeBytes: input.sizeBytes, validationState: "staged",
        malwareState: "pending", validatorVersion: null, retentionClass: required(input.retentionClass, "retentionClass"),
        activeContentDetected: null, encryptedArchiveDetected: null, version: 1,
        uploadedAt: now, uploadedBy: context.userId, validatedAt: null, validatedBy: null,
        releasedAt: null, releasedBy: null,
      };
      transaction.insertGovernedFile(file);
      const processingPayload = { fileId: file.id, storageKey: file.storageKey };
      transaction.insertIntegrationMessage({
        id: this.idFactory(), direction: "outbox", businessScopeOrganizationId: normalizedOrganizationId,
        projectId: null, interfaceCode: "document-processing.worker", idempotencyKey: file.id, externalId: file.id,
        schemaVersion: 1, payload: processingPayload, payloadSha256: canonicalHash(processingPayload),
        correlationId: context.correlationId, state: "pending", attemptCount: 0, lastError: null,
        createdAt: now, processedAt: null, version: 1,
      });
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: null, action: "file.organization_upload_staged", objectType: "file_object", objectId: file.id,
        priorState: null, newState: file.validationState, reason: file.declaredMediaType,
        changedFields: { businessScopeOrganizationId: normalizedOrganizationId, storageKey: file.storageKey,
          sha256: file.sha256, sizeBytes: file.sizeBytes, originalFilename: file.originalFilename },
      }));
      return file;
    });
  }

  public validateFile(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    fileId: string,
    expectedVersion: number,
    input: ValidateFileInput,
  ): Promise<GovernedFileRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const file = transaction.governedFileById(fileId);
      const project = file?.projectId ? transaction.projectById(file.projectId) : null;
      if (!file || (file.projectId !== null && !project) || file.validationState !== "staged") throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "file.validate", resource: resource(file.businessScopeOrganizationId, file.projectId, file.id),
        requiredQualifications: ["file_validation_worker"], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (file.version !== expectedVersion) throw new ConflictError();
      const detectedMediaType = required(input.detectedMediaType, "detectedMediaType");
      const validatorVersion = required(input.validatorVersion, "validatorVersion");
      const hashMismatch = !sha256Pattern.test(input.detectedSha256) || input.detectedSha256 !== file.sha256;
      const typeRejected = !supportedMediaTypes.has(detectedMediaType) || detectedMediaType !== file.declaredMediaType;
      const unsafeContainer = input.activeContentDetected || input.encryptedArchiveDetected;
      const validationState = input.malwareState === "malicious" ? "quarantined"
        : input.malwareState === "error" || hashMismatch || typeRejected || unsafeContainer ? "rejected" : "validated";
      const validated: GovernedFileRecord = {
        ...file, detectedMediaType, detectedSha256: input.detectedSha256,
        malwareState: input.malwareState, validatorVersion,
        activeContentDetected: input.activeContentDetected, encryptedArchiveDetected: input.encryptedArchiveDetected,
        validationState, version: file.version + 1, validatedAt: now, validatedBy: context.userId,
      };
      transaction.updateGovernedFile(validated, expectedVersion);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: file.projectId, action: validationState === "validated" ? "file.validation_passed"
          : validationState === "quarantined" ? "file.quarantined" : "file.validation_rejected",
        objectType: "file_object", objectId: file.id, priorState: file.validationState, newState: validationState,
        reason: [hashMismatch && "hash_mismatch", typeRejected && "type_mismatch", unsafeContainer && "unsafe_container",
          input.malwareState !== "clean" && `malware_${input.malwareState}`].filter(Boolean).join(",") || "validation_passed",
        changedFields: { detectedMediaType, validatorVersion, malwareState: input.malwareState },
      }));
      return validated;
    });
  }

  public fileStatus(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    fileId: string,
  ): Promise<GovernedFileRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const file = transaction.governedFileById(fileId);
      const project = file?.projectId ? transaction.projectById(file.projectId) : null;
      if (!file || (file.projectId !== null && !project)) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "file.read", resource: resource(file.businessScopeOrganizationId, file.projectId, file.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      return file;
    });
  }

  public releaseFile(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    fileId: string,
    expectedVersion: number,
  ): Promise<GovernedFileRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const file = transaction.governedFileById(fileId);
      const project = file?.projectId ? transaction.projectById(file.projectId) : null;
      if (!file || (file.projectId !== null && !project)) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "file.release", resource: resource(file.businessScopeOrganizationId, file.projectId, file.id),
        requiredQualifications: ["file_release_authority"],
        forbiddenActorIds: [file.uploadedBy, file.validatedBy ?? ""], minimumAssurance: "step-up",
      }, now);
      if (file.version !== expectedVersion) throw new ConflictError();
      if (file.validationState !== "validated" || file.malwareState !== "clean"
        || file.detectedSha256 !== file.sha256 || file.detectedMediaType !== file.declaredMediaType) {
        throw new ValidationError("Only a clean, integrity-matched validated file can be released.", ["file_not_validated"]);
      }
      const released: GovernedFileRecord = {
        ...file, validationState: "released", releasedAt: now, releasedBy: context.userId, version: file.version + 1,
      };
      transaction.updateGovernedFile(released, expectedVersion);
      const releasePayload = { fileId: file.id, storageKey: file.storageKey };
      transaction.insertIntegrationMessage({
        id: this.idFactory(), direction: "outbox", businessScopeOrganizationId: file.businessScopeOrganizationId,
        projectId: file.projectId,
        interfaceCode: "file-release.worker", idempotencyKey: file.id, externalId: file.id,
        schemaVersion: 1, payload: releasePayload, payloadSha256: canonicalHash(releasePayload),
        correlationId: context.correlationId, state: "pending", attemptCount: 0, lastError: null,
        createdAt: now, processedAt: null, version: 1,
      });
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: file.projectId, action: "file.released", objectType: "file_object", objectId: file.id,
        priorState: file.validationState, newState: released.validationState, reason: file.validatorVersion,
        changedFields: { sha256: file.sha256, detectedMediaType: file.detectedMediaType, releasedBy: context.userId },
      }));
      return released;
    });
  }

  public downloadFile(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    fileId: string,
  ): Promise<GovernedFileRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const file = transaction.governedFileById(fileId);
      const project = file?.projectId ? transaction.projectById(file.projectId) : null;
      if (!file || (file.projectId !== null && !project) || file.validationState !== "released") throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "file.download", resource: resource(file.businessScopeOrganizationId, file.projectId, file.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: file.projectId, action: "file.downloaded", objectType: "file_object", objectId: file.id,
        priorState: file.validationState, newState: file.validationState, reason: null,
        changedFields: { sha256: file.sha256, storageKey: file.storageKey },
      }));
      return file;
    });
  }

  public stageImport(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    input: StageImportInput,
  ): Promise<ImportJobRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "import.create", resource: resource(project.businessScopeOrganizationId, project.id, null),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (input.schemaVersion !== 1) throw new ValidationError("The import schema version is unsupported.", ["import_schema_unsupported"]);
      if (input.rows.length === 0 || input.rows.length > 10_000) {
        throw new ValidationError("Import row count is outside the configured policy.", ["import_row_count_invalid"]);
      }
      const sourceSystem = required(input.sourceSystem, "sourceSystem");
      const rows = input.rows.map((row, index) => ({
        rowNumber: index + 1, externalId: required(row.externalId, "externalId"),
        payload: structuredClone(row.payload), errors: [] as readonly string[],
      }));
      const job: ImportJobRecord = {
        id: this.idFactory(), projectId: project.id, schemaName: input.schemaName, schemaVersion: input.schemaVersion,
        sourceSystem, state: "staged", rows, createdAt: now, createdBy: context.userId,
        validatedAt: null, committedAt: null, version: 1,
      };
      transaction.insertImportJob(job);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "import.staged", objectType: "import_job", objectId: job.id,
        priorState: null, newState: job.state, reason: `${job.schemaName}:v${job.schemaVersion}`,
        changedFields: { sourceSystem, rowCount: rows.length },
      }));
      return job;
    });
  }

  public validateImport(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    importJobId: string,
    expectedVersion: number,
  ): Promise<ImportJobRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const job = transaction.importJobById(importJobId);
      const project = job ? transaction.projectById(job.projectId) : null;
      if (!job || !project || job.state !== "staged") throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "import.validate", resource: resource(project.businessScopeOrganizationId, project.id, job.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (job.version !== expectedVersion) throw new ConflictError();
      const seen = new Set<string>();
      const requiredFields = job.schemaName === "material_receipt"
        ? ["projectId", "identifier", "quantity", "heatLot"] : ["projectId", "number", "description"];
      const rows = job.rows.map((row) => {
        const errors: string[] = [];
        if (seen.has(row.externalId)) errors.push("duplicate_external_id_in_file");
        seen.add(row.externalId);
        if (transaction.externalIdentifier(job.sourceSystem, row.externalId)) errors.push("external_id_already_committed");
        if (row.payload.projectId !== project.id) errors.push("project_context_mismatch");
        for (const field of requiredFields) if (!row.payload[field]?.trim()) errors.push(`${field}_required`);
        if (job.schemaName === "material_receipt" && row.payload.quantity
          && !/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(row.payload.quantity)) errors.push("quantity_invalid");
        return { ...row, errors };
      });
      const valid = rows.every((row) => row.errors.length === 0);
      const validated: ImportJobRecord = {
        ...job, rows, state: valid ? "validated" : "invalid", validatedAt: now, version: job.version + 1,
      };
      transaction.updateImportJob(validated, expectedVersion);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: valid ? "import.validated" : "import.failed", objectType: "import_job", objectId: job.id,
        priorState: job.state, newState: validated.state, reason: valid ? null : "row_validation_failed",
        changedFields: { validRows: rows.filter((row) => row.errors.length === 0).length,
          invalidRows: rows.filter((row) => row.errors.length > 0).length },
      }));
      return validated;
    });
  }

  public commitImport(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    importJobId: string,
    expectedVersion: number,
  ): Promise<ImportJobRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const job = transaction.importJobById(importJobId);
      const project = job ? transaction.projectById(job.projectId) : null;
      if (!job || !project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "import.commit", resource: resource(project.businessScopeOrganizationId, project.id, job.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "step-up",
      }, now);
      if (job.version !== expectedVersion) throw new ConflictError();
      if (job.state !== "validated" || job.rows.some((row) => row.errors.length > 0)) {
        throw new ValidationError("Only a fully validated import may be committed.", ["import_not_validated"]);
      }
      for (const row of job.rows) {
        if (transaction.externalIdentifier(job.sourceSystem, row.externalId)) throw new ConflictError("External identifier was committed concurrently.");
        const record: ImportedRecord = {
          id: this.idFactory(), projectId: project.id, recordType: job.schemaName,
          payload: row.payload, importJobId: job.id, externalId: row.externalId,
          createdAt: now, createdBy: context.userId,
        };
        transaction.insertImportedRecord(record);
        transaction.insertExternalIdentifier({
          id: this.idFactory(), projectId: project.id, sourceSystem: job.sourceSystem, externalId: row.externalId,
          recordType: record.recordType, recordId: record.id, createdAt: now,
        });
      }
      const committed: ImportJobRecord = { ...job, state: "committed", committedAt: now, version: job.version + 1 };
      transaction.updateImportJob(committed, expectedVersion);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "import.committed", objectType: "import_job", objectId: job.id,
        priorState: job.state, newState: committed.state, reason: job.sourceSystem,
        changedFields: { committedRows: job.rows.length, externalIds: job.rows.map((row) => row.externalId) },
      }));
      return committed;
    });
  }

  public requestExport(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    input: RequestExportInput,
  ): Promise<ExportJobRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "export.create", resource: resource(project.businessScopeOrganizationId, project.id, null),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (input.recipientOrganizationId !== context.actingOrganizationId) throw new AuthorizationDeniedError("scope_denied");
      const recordIds = uniqueRequired(input.recordIds, "recordIds");
      const available = new Map(this.recordsForClass(transaction, project.id, input.recordClass).map((record) => [record.recordId, record]));
      const readPermission = this.readPermission(input.recordClass);
      for (const recordId of recordIds) {
        if (!available.has(recordId)) throw new NotFoundError();
        requireAuthorization(context, assignments, {
          action: readPermission, resource: resource(project.businessScopeOrganizationId, project.id, recordId),
          requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "standard",
        }, now);
      }
      const job: ExportJobRecord = {
        id: this.idFactory(), projectId: project.id, recordClass: input.recordClass, recordIds,
        format: input.format, recipientOrganizationId: input.recipientOrganizationId,
        state: "queued", requestedAt: now, requestedBy: context.userId, correlationId: context.correlationId,
        formatSchemaVersion: 1, resultSha256: null, resultManifest: [], resultMediaType: null,
        resultStorageKey: null, resultSizeBytes: null, resultContent: null,
        completedAt: null, expiresAt: null, failureReason: null, version: 1,
      };
      transaction.insertExportJob(job);
      transaction.insertIntegrationMessage({
        id: this.idFactory(), direction: "outbox", businessScopeOrganizationId: project.businessScopeOrganizationId,
        projectId: project.id, interfaceCode: "export.worker",
        idempotencyKey: job.id, externalId: job.id, schemaVersion: 1, payloadSha256: canonicalHash({ exportJobId: job.id }),
        payload: { exportJobId: job.id },
        correlationId: context.correlationId, state: "pending", attemptCount: 0, lastError: null,
        createdAt: now, processedAt: null, version: 1,
      });
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "export.requested", objectType: "export_job", objectId: job.id,
        priorState: null, newState: job.state, reason: `${job.recordClass}:${job.format}`,
        changedFields: { recordIds, recipientOrganizationId: job.recipientOrganizationId },
      }));
      return job;
    });
  }

  public processExport(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    exportJobId: string,
    expectedVersion: number,
  ): Promise<ExportJobRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const job = transaction.exportJobById(exportJobId);
      const project = job ? transaction.projectById(job.projectId) : null;
      if (!job || !project || (job.state !== "queued" && job.state !== "processing")) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "export.process", resource: resource(project.businessScopeOrganizationId, project.id, job.id),
        requiredQualifications: ["export_worker"], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (job.version !== expectedVersion) throw new ConflictError();
      const records = new Map(this.recordsForClass(transaction, project.id, job.recordClass).map((record) => [record.recordId, record]));
      const snapshots = job.recordIds.map((id) => records.get(id)).filter((record): record is ScopedSearchResult => Boolean(record));
      if (snapshots.length !== job.recordIds.length) throw new ConflictError("An export source disappeared before processing.");
      const manifest = snapshots.map((record) => `${record.recordType}:${record.recordId}:v${record.version}`).sort();
      const portableRecords = snapshots.map((record) => ({
        schemaVersion: job.formatSchemaVersion, recordType: record.recordType, recordId: record.recordId,
        projectId: record.projectId, label: record.label, state: record.state, version: record.version,
      }));
      const resultContent = job.format === "jsonl"
        ? `${portableRecords.map((record) => canonicalJson(record)).join("\n")}\n`
        : [
          "schema_version,record_type,record_id,project_id,label,state,version",
          ...portableRecords.map((record) => [
            record.schemaVersion, record.recordType, record.recordId, record.projectId, record.label, record.state, record.version,
          ].map(csvCell).join(",")),
        ].join("\r\n") + "\r\n";
      const resultMediaType = job.format === "jsonl" ? "application/x-ndjson" : "text/csv";
      const completed: ExportJobRecord = {
        ...job, state: "completed", resultManifest: manifest,
        resultSha256: createHash("sha256").update(resultContent).digest("hex"),
        resultMediaType, resultStorageKey: `exports/${job.projectId}/${job.id}.${job.format}`,
        resultSizeBytes: Buffer.byteLength(resultContent, "utf8"), resultContent,
        completedAt: now, expiresAt: new Date(now.getTime() + 7 * 86_400_000), version: job.version + 1,
      };
      transaction.updateExportJob(completed, expectedVersion);
      const outbox = transaction.integrationMessageByKey("export.worker", job.id);
      if (!outbox) throw new ConflictError("The export outbox message is missing.");
      transaction.updateIntegrationMessage({
        ...outbox, state: "processed", attemptCount: outbox.attemptCount + 1, processedAt: now,
        version: outbox.version + 1,
      }, outbox.version);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "export.completed", objectType: "export_job", objectId: job.id,
        priorState: job.state, newState: completed.state, reason: null,
        changedFields: { resultSha256: completed.resultSha256, resultManifest: manifest,
          resultMediaType, resultSizeBytes: completed.resultSizeBytes, resultStorageKey: completed.resultStorageKey,
          formatSchemaVersion: completed.formatSchemaVersion, expiresAt: completed.expiresAt?.toISOString() },
      }));
      return completed;
    });
  }

  public downloadExport(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    exportJobId: string,
  ): Promise<ExportJobRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const job = transaction.exportJobById(exportJobId);
      const project = job ? transaction.projectById(job.projectId) : null;
      if (!job || !project || job.state !== "completed" || !job.expiresAt || job.expiresAt.getTime() <= now.getTime()) throw new NotFoundError();
      if (job.recipientOrganizationId !== context.actingOrganizationId) throw new AuthorizationDeniedError("scope_denied");
      requireAuthorization(context, assignments, {
        action: "export.download", resource: resource(project.businessScopeOrganizationId, project.id, job.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      const readPermission = this.readPermission(job.recordClass);
      for (const recordId of job.recordIds) requireAuthorization(context, assignments, {
        action: readPermission, resource: resource(project.businessScopeOrganizationId, project.id, recordId),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "standard",
      }, now);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "export.downloaded", objectType: "export_job", objectId: job.id,
        priorState: job.state, newState: job.state, reason: null,
        changedFields: { resultSha256: job.resultSha256, recipientOrganizationId: job.recipientOrganizationId },
      }));
      return job;
    });
  }

  public receiveIntegration(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    input: ReceiveIntegrationInput,
  ): Promise<IntegrationMessageRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "integration.receive", resource: resource(project.businessScopeOrganizationId, project.id, null),
        requiredQualifications: ["integration_service"], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      const interfaceCode = required(input.interfaceCode, "interfaceCode");
      const idempotencyKey = required(input.idempotencyKey, "idempotencyKey");
      const payloadSha256 = canonicalHash(input.payload);
      const existing = transaction.integrationMessageByKey(interfaceCode, idempotencyKey);
      if (existing) {
        if (existing.payloadSha256 !== payloadSha256 || existing.externalId !== input.externalId) {
          throw new ConflictError("The idempotency key was reused with different content.");
        }
        return existing;
      }
      if (!Number.isInteger(input.schemaVersion) || input.schemaVersion < 1) {
        throw new ValidationError("Integration schema version is invalid.", ["integration_schema_invalid"]);
      }
      const message: IntegrationMessageRecord = {
        id: this.idFactory(), direction: "inbox", businessScopeOrganizationId: project.businessScopeOrganizationId,
        projectId: project.id, interfaceCode, idempotencyKey,
        externalId: required(input.externalId, "externalId"), schemaVersion: input.schemaVersion,
        payload: structuredClone(input.payload), payloadSha256, correlationId: context.correlationId, state: "received", attemptCount: 0,
        lastError: null, createdAt: now, processedAt: null, version: 1,
      };
      transaction.insertIntegrationMessage(message);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "integration.received", objectType: "integration_message", objectId: message.id,
        priorState: null, newState: message.state, reason: message.interfaceCode,
        changedFields: { externalId: message.externalId, schemaVersion: message.schemaVersion,
          idempotencyKey: message.idempotencyKey, payloadSha256 },
      }));
      return message;
    });
  }

  public configureNotificationSubscription(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    input: ConfigureNotificationSubscriptionInput,
  ): Promise<NotificationSubscriptionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "notification.subscription.manage", resource: resource(project.businessScopeOrganizationId, project.id, null),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      const eventTypes = [...uniqueRequired(input.eventTypes, "eventTypes")].sort();
      const existing = transaction.notificationSubscriptionForUser(project.id, context.userId, input.channel);
      if (existing) {
        const updated: NotificationSubscriptionRecord = {
          ...existing, eventTypes, state: input.enabled ? "active" : "revoked",
          revokedAt: input.enabled ? null : now, version: existing.version + 1,
        };
        transaction.updateNotificationSubscription(updated, existing.version);
        transaction.appendAudit(audit(this.idFactory, now, context, {
          projectId: project.id, action: input.enabled ? "notification.subscription_updated" : "notification.subscription_revoked",
          objectType: "notification_subscription", objectId: existing.id, priorState: existing.state,
          newState: updated.state, reason: input.channel, changedFields: { eventTypes },
        }));
        return updated;
      }
      if (!input.enabled) throw new ValidationError("An absent notification subscription cannot be revoked.", ["subscription_not_found"]);
      const subscription: NotificationSubscriptionRecord = {
        id: this.idFactory(), projectId: project.id, userId: context.userId,
        actingOrganizationId: context.actingOrganizationId, eventTypes, channel: input.channel,
        state: "active", createdAt: now, createdBy: context.userId, revokedAt: null, version: 1,
      };
      transaction.insertNotificationSubscription(subscription);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "notification.subscription_created", objectType: "notification_subscription",
        objectId: subscription.id, priorState: null, newState: subscription.state, reason: input.channel,
        changedFields: { eventTypes },
      }));
      return subscription;
    });
  }

  public dispatchNotification(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    input: DispatchNotificationInput,
  ): Promise<readonly NotificationRecord[]> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "notification.dispatch", resource: resource(project.businessScopeOrganizationId, project.id, input.recordId),
        requiredQualifications: ["notification_worker"], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      const eventType = required(input.eventType, "eventType");
      const templateCode = required(input.templateCode, "templateCode");
      const baseKey = required(input.idempotencyKey, "idempotencyKey");
      const record = this.recordsForClass(transaction, project.id, input.recordClass)
        .find((candidate) => candidate.recordId === input.recordId);
      if (!record) throw new NotFoundError();
      const recipients = uniqueRequired(input.recipientUserIds, "recipientUserIds");
      const notifications: NotificationRecord[] = [];
      for (const recipientUserId of recipients) {
        const subscriptions = transaction.notificationSubscriptionsForProject(project.id)
          .filter((subscription) => subscription.userId === recipientUserId && subscription.state === "active"
            && subscription.eventTypes.includes(eventType));
        for (const subscription of subscriptions) {
          const idempotencyKey = `${baseKey}:${recipientUserId}:${subscription.channel}`;
          const existing = transaction.notificationByKey(idempotencyKey);
          if (existing) {
            notifications.push(existing);
            continue;
          }
          const recipientContext: AccessContext = {
            userId: recipientUserId, actingOrganizationId: subscription.actingOrganizationId,
            assurance: "standard", qualifications: [], sessionId: "notification-scope-check",
            correlationId: context.correlationId, authenticatedAt: now,
          };
          const readable = authorize(recipientContext, transaction.assignmentsFor(recipientUserId), {
            action: this.readPermission(input.recordClass),
            resource: resource(project.businessScopeOrganizationId, project.id, record.recordId),
            requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "standard",
          }, now).allowed;
          const notification: NotificationRecord = {
            id: this.idFactory(), projectId: project.id, recipientUserId,
            recipientOrganizationId: subscription.actingOrganizationId, eventType, recordClass: input.recordClass,
            recordId: record.recordId, channel: subscription.channel, templateCode, idempotencyKey,
            correlationId: context.correlationId, state: readable ? "queued" : "suppressed", attemptCount: 0,
            lastError: readable ? null : "recipient_scope_denied", createdAt: now, deliveredAt: null, version: 1,
          };
          transaction.insertNotification(notification);
          if (readable) transaction.insertIntegrationMessage({
            id: this.idFactory(), direction: "outbox", businessScopeOrganizationId: project.businessScopeOrganizationId,
            projectId: project.id, interfaceCode: "notification.worker",
            idempotencyKey: notification.id, externalId: notification.id, schemaVersion: 1,
            payload: { notificationId: notification.id, templateCode, channel: subscription.channel },
            payloadSha256: canonicalHash({ notificationId: notification.id, templateCode, channel: subscription.channel }),
            correlationId: context.correlationId, state: "pending", attemptCount: 0, lastError: null,
            createdAt: now, processedAt: null, version: 1,
          });
          transaction.appendAudit(audit(this.idFactory, now, context, {
            projectId: project.id, action: readable ? "notification.queued" : "notification.suppressed",
            objectType: "notification", objectId: notification.id, priorState: null, newState: notification.state,
            reason: readable ? eventType : "recipient_scope_denied",
            changedFields: { recipientUserId, channel: subscription.channel, templateCode, recordClass: input.recordClass,
              recordId: record.recordId },
          }));
          notifications.push(notification);
        }
      }
      return notifications;
    });
  }

  public processNotification(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    notificationId: string,
    expectedVersion: number,
    outcome: "success" | "failure",
    errorReason: string | null,
  ): Promise<NotificationRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const notification = transaction.notificationById(notificationId);
      const project = notification ? transaction.projectById(notification.projectId) : null;
      if (!notification || !project || !["queued", "retry"].includes(notification.state)) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "notification.deliver", resource: resource(project.businessScopeOrganizationId, project.id, notification.id),
        requiredQualifications: ["notification_worker"], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (notification.version !== expectedVersion) throw new ConflictError();
      const recipientContext: AccessContext = {
        userId: notification.recipientUserId, actingOrganizationId: notification.recipientOrganizationId,
        assurance: "standard", qualifications: [], sessionId: "notification-delivery-scope-check",
        correlationId: notification.correlationId, authenticatedAt: now,
      };
      const stillReadable = authorize(recipientContext, transaction.assignmentsFor(notification.recipientUserId), {
        action: this.readPermission(notification.recordClass),
        resource: resource(project.businessScopeOrganizationId, project.id, notification.recordId),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "standard",
      }, now).allowed;
      const attemptCount = notification.attemptCount + 1;
      const state = !stillReadable ? "suppressed"
        : outcome === "success" ? "delivered" : attemptCount >= 3 ? "failed" : "retry";
      const lastError = !stillReadable ? "recipient_scope_denied"
        : outcome === "failure" ? required(errorReason ?? "", "errorReason") : null;
      const updated: NotificationRecord = {
        ...notification, state, attemptCount, lastError,
        deliveredAt: state === "delivered" ? now : null, version: notification.version + 1,
      };
      transaction.updateNotification(updated, expectedVersion);
      const outbox = transaction.integrationMessageByKey("notification.worker", notification.id);
      if (!outbox) throw new ConflictError("The notification outbox message is missing.");
      transaction.updateIntegrationMessage({
        ...outbox, state: state === "delivered" ? "processed" : state === "failed" ? "dead_letter"
          : state === "suppressed" ? "reconciled" : "retry",
        attemptCount, lastError, processedAt: state === "delivered" || state === "suppressed" ? now : null,
        version: outbox.version + 1,
      }, outbox.version);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: state === "delivered" ? "notification.delivered"
          : state === "retry" ? "notification.retried" : state === "suppressed" ? "notification.suppressed" : "notification.failed",
        objectType: "notification", objectId: notification.id, priorState: notification.state, newState: state,
        reason: lastError, changedFields: { attemptCount, recipientUserId: notification.recipientUserId,
          channel: notification.channel, templateCode: notification.templateCode },
      }));
      return updated;
    });
  }

  public listNotifications(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
  ): Promise<readonly NotificationRecord[]> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      return transaction.notificationsForRecipient(project.id, context.userId)
        .filter((notification) => notification.state !== "suppressed")
        .filter((notification) => authorize(context, assignments, {
          action: this.readPermission(notification.recordClass),
          resource: resource(project.businessScopeOrganizationId, project.id, notification.recordId),
          requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "standard",
        }, now).allowed);
    });
  }

  public processIntegration(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    messageId: string,
    expectedVersion: number,
    outcome: "success" | "failure" | "permanent_failure",
    errorReason: string | null,
  ): Promise<IntegrationMessageRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const message = transaction.integrationMessageById(messageId);
      const project = message?.projectId ? transaction.projectById(message.projectId) : null;
      if (!message || (message.projectId !== null && !project)
        || !["received", "pending", "retry"].includes(message.state)) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "integration.process", resource: resource(message.businessScopeOrganizationId, message.projectId, message.id),
        requiredQualifications: ["integration_worker"], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (message.version !== expectedVersion) throw new ConflictError();
      const attemptCount = outcome === "permanent_failure" ? 3 : message.attemptCount + 1;
      const state = outcome === "success" ? "processed" : attemptCount >= 3 ? "dead_letter" : "retry";
      const updated: IntegrationMessageRecord = {
        ...message, state, attemptCount, lastError: outcome === "success" ? null : required(errorReason ?? "", "errorReason"),
        processedAt: outcome === "success" ? now : null, version: message.version + 1,
      };
      transaction.updateIntegrationMessage(updated, expectedVersion);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: message.projectId, action: outcome === "success" ? "integration.processed"
          : state === "dead_letter" ? "integration.dead_lettered" : "integration.retried",
        objectType: "integration_message", objectId: message.id, priorState: message.state, newState: state,
        reason: updated.lastError, changedFields: { attemptCount, externalId: message.externalId },
      }));
      return updated;
    });
  }

  public reconcileIntegration(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    messageId: string,
    expectedVersion: number,
    resolution: "accept" | "replay",
    reason: string,
  ): Promise<IntegrationMessageRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const message = transaction.integrationMessageById(messageId);
      const project = message?.projectId ? transaction.projectById(message.projectId) : null;
      if (!message || (message.projectId !== null && !project) || message.state !== "dead_letter") throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "integration.manage", resource: resource(message.businessScopeOrganizationId, message.projectId, message.id),
        requiredQualifications: ["integration_reconciliation_authority"], forbiddenActorIds: [], minimumAssurance: "step-up",
      }, now);
      if (message.version !== expectedVersion) throw new ConflictError();
      const updated: IntegrationMessageRecord = {
        ...message, state: resolution === "accept" ? "reconciled" : "retry",
        attemptCount: resolution === "replay" ? 0 : message.attemptCount,
        lastError: resolution === "replay" ? null : message.lastError, version: message.version + 1,
      };
      transaction.updateIntegrationMessage(updated, expectedVersion);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: message.projectId, action: "integration.reconciled", objectType: "integration_message", objectId: message.id,
        priorState: message.state, newState: updated.state, reason: required(reason, "reason"),
        changedFields: { resolution, externalId: message.externalId },
      }));
      return updated;
    });
  }

  public searchProjectRecords(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    query: string,
  ): Promise<readonly ScopedSearchResult[]> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      const needle = required(query, "query").toLocaleLowerCase();
      if (needle.length < 2) throw new ValidationError("Search query is too short.", ["search_query_too_short"]);
      const candidates = [
        ...this.recordsForClass(transaction, project.id, "document"),
        ...this.recordsForClass(transaction, project.id, "material"),
        ...this.recordsForClass(transaction, project.id, "ncr"),
        ...this.recordsForClass(transaction, project.id, "punch"),
        ...this.recordsForClass(transaction, project.id, "imported"),
        ...this.recordsForClass(transaction, project.id, "collaboration"),
      ];
      const results = candidates.filter((candidate) => candidate.label.toLocaleLowerCase().includes(needle))
        .filter((candidate) => authorize(context, assignments, {
          action: this.readPermission(candidate.recordType),
          resource: resource(project.businessScopeOrganizationId, project.id, candidate.recordId),
          requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "standard",
        }, now).allowed)
        .sort((left, right) => `${left.recordType}:${left.label}`.localeCompare(`${right.recordType}:${right.label}`))
        .slice(0, 100);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "search.executed", objectType: "project", objectId: project.id,
        priorState: null, newState: null, reason: null, changedFields: { querySha256: canonicalHash(needle), resultCount: results.length },
      }));
      return results;
    });
  }

  public connectivityPolicy(operation: string): WorkflowConnectivityPolicyRecord {
    const normalized = required(operation, "operation");
    return connectivityPolicies.find((policy) => policy.operation === normalized) ?? {
      operation: normalized, classification: "online_required", authoritativeClaimAllowedOffline: false,
      rationale: "Unclassified operations fail safe as online-required.",
    };
  }

  public async assertConnectivity(
    context: AccessContext,
    projectId: string,
    operation: string,
    online: boolean,
  ): Promise<WorkflowConnectivityPolicyRecord> {
    const policy = this.connectivityPolicy(operation);
    if (online || policy.classification !== "online_required") return policy;
    const now = this.clock();
    await this.store.transaction((transaction) => {
      if (!transaction.projectById(projectId)) throw new NotFoundError();
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId, action: "offline.authority_denied", objectType: "project", objectId: projectId,
        priorState: null, newState: null, reason: policy.operation,
        changedFields: { classification: policy.classification, authoritativeClaimAllowedOffline: false },
      }));
    });
    throw new ValidationError("This operation requires authoritative online state.", ["authoritative_state_unavailable_offline"]);
  }

  public queueOfflineDraft(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    input: QueueOfflineDraftInput,
  ): Promise<OfflineDraftRecord> {
    const now = this.clock();
    const policy = this.connectivityPolicy(input.operation);
    if (policy.classification !== "queued_draft") {
      throw new ValidationError("This operation is not approved for offline queuing.", ["offline_queue_not_allowed"]);
    }
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "offline.draft.create", resource: resource(project.businessScopeOrganizationId, project.id, null),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      const idempotencyKey = required(input.idempotencyKey, "idempotencyKey");
      const existing = transaction.offlineDraftByKey(project.id, idempotencyKey);
      const payloadSha256 = canonicalHash(input.payload);
      if (existing) {
        if (existing.payloadSha256 !== payloadSha256) throw new ConflictError("Offline idempotency key content changed.");
        return existing;
      }
      const draft: OfflineDraftRecord = {
        id: this.idFactory(), projectId: project.id, operation: policy.operation, payloadSha256, idempotencyKey,
        originalAt: input.originalAt, originalBy: context.userId, actingOrganizationId: context.actingOrganizationId,
        deviceId: required(input.deviceId, "deviceId"), synchronizedAt: null, state: "queued",
        conflictReason: null, version: 1,
      };
      transaction.insertOfflineDraft(draft);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "offline.draft_queued", objectType: "offline_draft", objectId: draft.id,
        priorState: null, newState: draft.state, reason: draft.operation,
        changedFields: { deviceId: draft.deviceId, originalAt: draft.originalAt.toISOString(), idempotencyKey },
      }));
      return draft;
    });
  }

  public synchronizeOfflineDraft(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    draftId: string,
    expectedVersion: number,
    outcome: "accept" | "conflict" | "reject",
    conflictReason: string | null,
  ): Promise<OfflineDraftRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const draft = transaction.offlineDraftById(draftId);
      const project = draft ? transaction.projectById(draft.projectId) : null;
      if (!draft || !project || draft.state !== "queued") throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "offline.draft.sync", resource: resource(project.businessScopeOrganizationId, project.id, draft.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (draft.version !== expectedVersion) throw new ConflictError();
      const reason = outcome === "accept" ? null : required(conflictReason ?? "", "conflictReason");
      const updated: OfflineDraftRecord = {
        ...draft, synchronizedAt: now, state: outcome === "accept" ? "synchronized" : outcome === "conflict" ? "conflict" : "rejected",
        conflictReason: reason, version: draft.version + 1,
      };
      transaction.updateOfflineDraft(updated, expectedVersion);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: outcome === "accept" ? "offline.draft_synchronized" : "offline.sync_conflict",
        objectType: "offline_draft", objectId: draft.id, priorState: draft.state, newState: updated.state,
        reason, changedFields: { originalAt: draft.originalAt.toISOString(), synchronizedAt: now.toISOString(),
          deviceId: draft.deviceId, idempotencyKey: draft.idempotencyKey },
      }));
      return updated;
    });
  }

  private readPermission(recordClass: string): string {
    return recordClass === "document" ? "document.read_current"
      : recordClass === "material" ? "material.read"
      : recordClass === "ncr" ? "ncr.read"
      : recordClass === "punch" ? "punch.read"
      : recordClass === "collaboration" ? "collaboration.read"
      : "project.read";
  }

  private recordsForClass(
    transaction: FoundationTransaction,
    projectId: string,
    recordClass: string,
  ): readonly ScopedSearchResult[] {
    if (recordClass === "document") return transaction.documentsForProject(projectId).map((document) => ({
      recordType: "document", recordId: document.id, projectId, label: `${document.number} ${document.title}`,
      state: document.currentRevisionId ? "current_released" : "registered", version: document.version,
    }));
    if (recordClass === "material") return transaction.materialsForProject(projectId).map((material) => ({
      recordType: "material", recordId: material.id, projectId, label: `${material.identifier} ${material.heatLot} ${material.grade}`,
      state: material.state, version: material.version,
    }));
    if (recordClass === "ncr") return transaction.ncrForProject(projectId).map((ncr) => ({
      recordType: "ncr", recordId: ncr.id, projectId, label: `${ncr.number} ${ncr.description}`,
      state: ncr.state, version: ncr.version,
    }));
    if (recordClass === "punch") return transaction.punchForProject(projectId).map((punch) => ({
      recordType: "punch", recordId: punch.id, projectId, label: `${punch.number} ${punch.description}`,
      state: punch.state, version: punch.version,
    }));
    if (recordClass === "imported") return transaction.importedRecordsForProject(projectId).map((record) => ({
      recordType: "imported", recordId: record.id, projectId,
      label: `${record.recordType} ${record.externalId} ${Object.values(record.payload).join(" ")}`,
      state: "committed", version: 1,
    }));
    if (recordClass === "collaboration") return transaction.collaborationItems(projectId).map((record) => ({
      recordType: "collaboration", recordId: record.id, projectId,
      label: `${record.providerItemId} ${record.subject} ${record.itemType} ${record.providerStatusCode}`,
      state: record.state, version: record.version,
    }));
    throw new ValidationError("The record class is unsupported.", ["record_class_unsupported"]);
  }
}
