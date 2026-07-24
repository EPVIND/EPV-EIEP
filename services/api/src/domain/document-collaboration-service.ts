import { createHash, randomUUID } from "node:crypto";
import type {
  AccessContext,
  AuditEvent,
  CollaborationAuthorMapping,
  CollaborationDocumentMapping,
  CollaborationItemRecord,
  CollaborationPreviewIssue,
  CollaborationReconciliationRecord,
  CollaborationSourceItem,
  CollaborationStatusMapping,
  DocumentCollaborationImportRecord,
  RoleAssignment,
} from "@eiep/shared-types";
import { requireAuthorization } from "@eiep/rules-engine";
import { ConflictError, NotFoundError, ValidationError } from "./errors.js";
import type { FoundationStore, FoundationTransaction } from "./foundation-store.js";

type Clock = () => Date;
type IdFactory = () => string;

export interface PreviewDocumentCollaborationInput {
  readonly provider: "bluebeam_export";
  readonly providerProduct: string;
  readonly providerProjectId: string;
  readonly providerSessionId: string;
  readonly sourceFileId: string;
  readonly sourceVersion: string;
  readonly sourceSha256: string;
  readonly schemaVersion: number;
  readonly mappingVersion: string;
  readonly idempotencyKey: string;
  readonly documentMappings: readonly CollaborationDocumentMapping[];
  readonly authorMappings: readonly CollaborationAuthorMapping[];
  readonly statusMappings: readonly CollaborationStatusMapping[];
  readonly items: readonly CollaborationSourceItem[];
}

export interface DocumentCollaborationSnapshot {
  readonly imports: readonly DocumentCollaborationImportRecord[];
  readonly items: readonly CollaborationItemRecord[];
  readonly reconciliations: readonly CollaborationReconciliationRecord[];
  readonly outbound: DocumentCollaborationOutboundCapability;
}

export interface DocumentCollaborationOutboundCapability {
  readonly enabled: false;
  readonly provider: "bluebeam";
  readonly blockers: readonly string[];
}

function required(value: string, field: string, maximum = 4_000): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || /[\u0000\r\n]/u.test(normalized)) {
    throw new ValidationError(`${field} is invalid.`, [`${field}_invalid`]);
  }
  return normalized;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stable(value: unknown): unknown {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "invalid-date" : value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Readonly<Record<string, unknown>>)
      .sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, stable(child)]));
  }
  return value;
}

function canonicalInput(input: PreviewDocumentCollaborationInput): string {
  return sha256(JSON.stringify(stable(input)));
}

function canonicalSource(input: PreviewDocumentCollaborationInput): string {
  const { idempotencyKey: _idempotencyKey, ...source } = input;
  return sha256(JSON.stringify(stable(source)));
}

function inputFromRecord(record: DocumentCollaborationImportRecord): PreviewDocumentCollaborationInput {
  return { provider: record.provider, providerProduct: record.providerProduct, providerProjectId: record.providerProjectId,
    providerSessionId: record.providerSessionId, sourceFileId: record.sourceFileId, sourceVersion: record.sourceVersion,
    sourceSha256: record.sourceSha256, schemaVersion: record.schemaVersion, mappingVersion: record.mappingVersion,
    idempotencyKey: record.idempotencyKey, documentMappings: record.documentMappings, authorMappings: record.authorMappings,
    statusMappings: record.statusMappings, items: record.sourceItems };
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
  return { id: idFactory(), occurredAt, ...payload, canonicalSha256: sha256(JSON.stringify(payload)) };
}

function issue(code: string, sourceObjectId: string | null, field: string | null, detail: string): CollaborationPreviewIssue {
  return { code, sourceObjectId, field, detail };
}

function uniqueMappingIssues<T>(values: readonly T[], key: (value: T) => string, code: string, field: string): CollaborationPreviewIssue[] {
  const seen = new Set<string>(); const result: CollaborationPreviewIssue[] = [];
  for (const value of values) {
    const candidate = key(value).trim();
    if (!candidate || seen.has(candidate)) result.push(issue(code, candidate || null, field, `${field} must be non-empty and unique.`));
    seen.add(candidate);
  }
  return result;
}

function regionIssues(item: CollaborationSourceItem): CollaborationPreviewIssue[] {
  if (!item.region) return [];
  const numbers = [item.region.x, item.region.y, item.region.width, item.region.height].map(Number);
  if (numbers.some((value) => !Number.isFinite(value)) || numbers[2]! < 0 || numbers[3]! < 0
    || numbers[0]! < 0 || numbers[1]! < 0) {
    return [issue("region_invalid", item.providerItemId, "region", "Region coordinates must be finite and non-negative.")];
  }
  if (item.region.units === "normalized"
    && (numbers[0]! > 1 || numbers[1]! > 1 || numbers[2]! > 1 || numbers[3]! > 1
      || numbers[0]! + numbers[2]! > 1 || numbers[1]! + numbers[3]! > 1)) {
    return [issue("region_out_of_bounds", item.providerItemId, "region", "Normalized region must remain within the page boundary.")];
  }
  return [];
}

function textIssues(item: CollaborationSourceItem): CollaborationPreviewIssue[] {
  const result: CollaborationPreviewIssue[] = [];
  for (const [field, value, maximum] of [["subject", item.subject, 1_000], ["body", item.body, 20_000], ["appearance", item.appearance ?? "", 20_000]] as const) {
    if (value.length > maximum || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(value)) {
      result.push(issue("content_invalid", item.providerItemId, field, `${field} exceeds policy or contains prohibited control characters.`));
    }
  }
  return result;
}

function previewIssues(transaction: FoundationTransaction, projectId: string, now: Date,
  input: PreviewDocumentCollaborationInput): readonly CollaborationPreviewIssue[] {
  const result: CollaborationPreviewIssue[] = [];
  result.push(...uniqueMappingIssues(input.documentMappings, (value) => value.providerDocumentId, "document_mapping_duplicate", "providerDocumentId"));
  result.push(...uniqueMappingIssues(input.authorMappings, (value) => value.providerAuthorId, "author_mapping_duplicate", "providerAuthorId"));
  result.push(...uniqueMappingIssues(input.statusMappings, (value) => value.providerStatusCode, "status_mapping_duplicate", "providerStatusCode"));
  result.push(...uniqueMappingIssues(input.items, (value) => value.providerItemId, "source_item_duplicate", "providerItemId"));

  const project = transaction.projectById(projectId);
  const documents = new Map(input.documentMappings.map((mapping) => [mapping.providerDocumentId, mapping]));
  const authors = new Map(input.authorMappings.map((mapping) => [mapping.providerAuthorId, mapping]));
  const statuses = new Map(input.statusMappings.map((mapping) => [mapping.providerStatusCode, mapping]));
  const items = new Map(input.items.map((item) => [item.providerItemId, item]));

  for (const mapping of input.documentMappings) {
    const revision = transaction.revisionById(mapping.documentRevisionId);
    const document = revision ? transaction.documentById(revision.documentId) : null;
    if (!revision || !document || document.projectId !== projectId || revision.state !== "released") {
      result.push(issue("document_revision_unmapped", mapping.providerDocumentId, "documentRevisionId", "Provider document must resolve to an exact released EIEP project revision."));
    }
  }
  for (const mapping of input.authorMappings) {
    const account = transaction.identityAccountById(mapping.userAccountId);
    const participation = transaction.projectOrganizationByOrganization(projectId, mapping.organizationId);
    if (!account || account.state !== "active") {
      result.push(issue("author_account_unmapped", mapping.providerAuthorId, "userAccountId", "Provider author must resolve to an active EIEP account."));
    }
    if (!project || (mapping.organizationId !== project.businessScopeOrganizationId && participation?.state !== "active")) {
      result.push(issue("author_organization_unmapped", mapping.providerAuthorId, "organizationId", "Provider author organization must be active on the project."));
    }
  }
  for (const mapping of input.statusMappings) {
    if (!(["open", "resolved_claim", "closed_claim", "unknown"] as const).includes(mapping.evidenceStatus)) {
      result.push(issue("status_mapping_invalid", mapping.providerStatusCode, "evidenceStatus", "Provider status may map only to collaboration evidence status."));
    }
  }

  for (const item of input.items) {
    if (!item.providerItemId.trim()) result.push(issue("source_item_id_invalid", null, "providerItemId", "Source item identifier is required."));
    if (!documents.has(item.providerDocumentId)) result.push(issue("source_document_unmapped", item.providerItemId, "providerDocumentId", "Source document has no exact revision mapping."));
    if (!authors.has(item.authorProviderId)) result.push(issue("source_author_unmapped", item.providerItemId, "authorProviderId", "Source author has no active identity mapping."));
    if (!statuses.has(item.providerStatusCode)) result.push(issue("source_status_unmapped", item.providerItemId, "providerStatusCode", "Source status has no evidence-only mapping."));
    if (!Number.isInteger(item.pageNumber) || item.pageNumber < 1) result.push(issue("page_invalid", item.providerItemId, "pageNumber", "Page number must be a positive integer."));
    result.push(...regionIssues(item), ...textIssues(item));
    if (!(item.createdAt instanceof Date) || Number.isNaN(item.createdAt.getTime())
      || !(item.updatedAt instanceof Date) || Number.isNaN(item.updatedAt.getTime())
      || item.updatedAt.getTime() < item.createdAt.getTime() || item.updatedAt.getTime() > now.getTime() + 300_000) {
      result.push(issue("source_timestamp_invalid", item.providerItemId, "updatedAt", "Source timestamps must be ordered, valid, and not materially in the future."));
    }
    if (item.parentProviderItemId !== null) {
      const parent = items.get(item.parentProviderItemId);
      if (!parent || parent.providerItemId === item.providerItemId) result.push(issue("parent_invalid", item.providerItemId, "parentProviderItemId", "Parent must identify a different source item in this import."));
    } else if (item.itemType === "reply") {
      result.push(issue("reply_parent_required", item.providerItemId, "parentProviderItemId", "Reply must identify its parent item."));
    }
    for (const unsupported of item.unsupportedContentCodes) {
      result.push(issue("unsupported_content", item.providerItemId, "unsupportedContentCodes", `Unsupported provider content type: ${unsupported.slice(0, 80)}.`));
    }
  }

  for (const item of input.items) {
    const visited = new Set<string>([item.providerItemId]); let cursor = item.parentProviderItemId;
    while (cursor) {
      if (visited.has(cursor)) { result.push(issue("parent_cycle", item.providerItemId, "parentProviderItemId", "Parent relationship contains a cycle.")); break; }
      visited.add(cursor); cursor = items.get(cursor)?.parentProviderItemId ?? null;
    }
  }
  return result;
}

function assertSourceFile(transaction: FoundationTransaction, organizationId: string, projectId: string,
  sourceFileId: string, sourceSha256: string): void {
  const file = transaction.governedFileById(sourceFileId);
  if (!file || file.businessScopeOrganizationId !== organizationId || file.projectId !== projectId
    || file.validationState !== "released" || file.malwareState !== "clean"
    || file.sha256 !== sourceSha256 || file.detectedSha256 !== file.sha256
    || file.detectedMediaType !== file.declaredMediaType || file.sizeBytes < 1 || file.sizeBytes > 250 * 1024 * 1024
    || file.activeContentDetected !== false || file.encryptedArchiveDetected !== false
    || !["application/json", "application/zip", "application/pdf", "text/csv", "application/csv",
      "application/xml", "text/xml"].includes(file.detectedMediaType ?? "")) {
    throw new ValidationError("The source must be an integrity-matched released project file with an allowed media type.", ["collaboration_source_file_invalid"]);
  }
}

export class DocumentCollaborationService {
  public constructor(private readonly store: FoundationStore, private readonly clock: Clock = () => new Date(),
    private readonly idFactory: IdFactory = randomUUID) {}

  public preview(context: AccessContext, assignments: readonly RoleAssignment[], projectId: string,
    input: PreviewDocumentCollaborationInput): Promise<DocumentCollaborationImportRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId); if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "collaboration.import.preview",
        resource: scope(project.businessScopeOrganizationId, projectId, null), requiredQualifications: [],
        forbiddenActorIds: [], minimumAssurance: "mfa" }, now);
      if (input.provider !== "bluebeam_export" || input.schemaVersion !== 1) throw new ValidationError("Provider or schema version is unsupported.", ["collaboration_schema_unsupported"]);
      if (input.items.length < 1 || input.items.length > 5_000) throw new ValidationError("Collaboration import must contain 1 through 5,000 items.", ["collaboration_item_count_invalid"]);
      const normalized = { ...input,
        providerProduct: required(input.providerProduct, "providerProduct", 128),
        providerProjectId: required(input.providerProjectId, "providerProjectId", 256),
        providerSessionId: required(input.providerSessionId, "providerSessionId", 256),
        sourceVersion: required(input.sourceVersion, "sourceVersion", 128),
        mappingVersion: required(input.mappingVersion, "mappingVersion", 128),
        idempotencyKey: required(input.idempotencyKey, "idempotencyKey", 256),
        sourceSha256: input.sourceSha256.toLowerCase() };
      if (!/^[a-f0-9]{64}$/u.test(normalized.sourceSha256)) throw new ValidationError("Source SHA-256 is invalid.", ["source_sha256_invalid"]);
      assertSourceFile(transaction, project.businessScopeOrganizationId, projectId, normalized.sourceFileId, normalized.sourceSha256);
      const canonicalSha256 = canonicalInput(normalized);
      const retry = transaction.collaborationImportByIdempotency(projectId, normalized.idempotencyKey);
      if (retry) {
        if (retry.canonicalSha256 !== canonicalSha256) throw new ConflictError("The idempotency key was already used for different collaboration input.");
        return retry;
      }
      const collision = transaction.collaborationImportBySource(projectId, normalized.providerProjectId, normalized.providerSessionId, normalized.sourceVersion);
      if (collision && collision.sourceSha256 === normalized.sourceSha256) {
        if (canonicalSource(inputFromRecord(collision)) === canonicalSource(normalized)) return collision;
        throw new ConflictError("The provider source identity was already previewed with different mappings or content.");
      }
      const issues = [...previewIssues(transaction, projectId, now, normalized)];
      if (collision && collision.sourceSha256 !== normalized.sourceSha256) {
        issues.push(issue("changed_source_collision", null, "sourceSha256", "Provider project/session/source version already exists with a different protected source hash."));
      }
      const state = collision && collision.sourceSha256 !== normalized.sourceSha256 ? "conflict" as const
        : issues.length ? "invalid" as const : "previewed" as const;
      const record: DocumentCollaborationImportRecord = { id: this.idFactory(),
        businessScopeOrganizationId: project.businessScopeOrganizationId, projectId, provider: normalized.provider,
        providerProduct: normalized.providerProduct, providerProjectId: normalized.providerProjectId,
        providerSessionId: normalized.providerSessionId, sourceFileId: normalized.sourceFileId,
        sourceVersion: normalized.sourceVersion, sourceSha256: normalized.sourceSha256, canonicalSha256,
        schemaVersion: normalized.schemaVersion, mappingVersion: normalized.mappingVersion,
        idempotencyKey: normalized.idempotencyKey, documentMappings: normalized.documentMappings,
        authorMappings: normalized.authorMappings, statusMappings: normalized.statusMappings,
        sourceItems: normalized.items, previewIssues: issues, committedItemIds: [], state,
        previewedAt: now, previewedBy: context.userId, committedAt: null, committedBy: null, version: 1 };
      transaction.insertCollaborationImport(record);
      for (const current of issues) transaction.insertCollaborationReconciliation({ id: this.idFactory(),
        businessScopeOrganizationId: project.businessScopeOrganizationId, projectId, importId: record.id,
        code: current.code, sourceObjectId: current.sourceObjectId, field: current.field, detail: current.detail,
        state: "open", resolution: null, resolvedAt: null, resolvedBy: null, version: 1,
        createdAt: now, createdBy: context.userId });
      transaction.appendAudit(audit(this.idFactory, now, context, { projectId, action: "collaboration.import_previewed",
        objectType: "collaboration_import", objectId: record.id, priorState: null, newState: state, reason: null,
        changedFields: { provider: record.provider, sourceSha256: record.sourceSha256, itemCount: record.sourceItems.length,
          issueCount: issues.length, mappingVersion: record.mappingVersion } }));
      return record;
    });
  }

  public commit(context: AccessContext, assignments: readonly RoleAssignment[], importId: string,
    expectedVersion: number): Promise<DocumentCollaborationImportRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const record = transaction.collaborationImportById(importId); if (!record) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "collaboration.import.commit",
        resource: scope(record.businessScopeOrganizationId, record.projectId, record.id),
        requiredQualifications: ["collaboration_import_authority"], forbiddenActorIds: [record.previewedBy],
        minimumAssurance: "step-up" }, now);
      if (record.version !== expectedVersion) throw new ConflictError();
      if (record.state !== "previewed" || record.previewIssues.length) throw new ValidationError("Only a valid preview can be committed.", ["collaboration_import_not_committable"]);
      assertSourceFile(transaction, record.businessScopeOrganizationId, record.projectId, record.sourceFileId, record.sourceSha256);
      const input = inputFromRecord(record);
      if (previewIssues(transaction, record.projectId, now, input).length) throw new ConflictError("Collaboration mappings changed after preview.");
      const documentMappings = new Map(record.documentMappings.map((mapping) => [mapping.providerDocumentId, mapping]));
      const authorMappings = new Map(record.authorMappings.map((mapping) => [mapping.providerAuthorId, mapping]));
      const statusMappings = new Map(record.statusMappings.map((mapping) => [mapping.providerStatusCode, mapping]));
      const ids = new Map(record.sourceItems.map((item) => [item.providerItemId, this.idFactory()]));
      for (const source of record.sourceItems) {
        const prior = transaction.collaborationItemByExternal(record.projectId, record.providerProjectId, record.providerSessionId, source.providerItemId);
        if (prior && prior.state !== "superseded") transaction.updateCollaborationItem({ ...prior, state: "superseded", version: prior.version + 1 }, prior.version);
        const author = authorMappings.get(source.authorProviderId)!;
        const item: CollaborationItemRecord = { id: ids.get(source.providerItemId)!,
          businessScopeOrganizationId: record.businessScopeOrganizationId, projectId: record.projectId,
          importId: record.id, provider: record.provider, providerProjectId: record.providerProjectId,
          providerSessionId: record.providerSessionId, providerItemId: source.providerItemId,
          providerDocumentId: source.providerDocumentId, sourceVersion: record.sourceVersion,
          sourceSha256: record.sourceSha256, documentRevisionId: documentMappings.get(source.providerDocumentId)!.documentRevisionId,
          parentItemId: source.parentProviderItemId ? ids.get(source.parentProviderItemId) ?? null : null,
          itemType: source.itemType, pageNumber: source.pageNumber, region: source.region,
          authorUserId: author.userAccountId, authorOrganizationId: author.organizationId,
          providerStatusCode: source.providerStatusCode, evidenceStatus: statusMappings.get(source.providerStatusCode)!.evidenceStatus,
          subject: source.subject, body: source.body, appearance: source.appearance,
          sourceCreatedAt: source.createdAt, sourceUpdatedAt: source.updatedAt, state: "submitted",
          reviewedAt: null, reviewedBy: null, reviewReason: null, version: 1,
          createdAt: now, createdBy: context.userId };
        transaction.insertCollaborationItem(item);
      }
      const committed = { ...record, committedItemIds: [...ids.values()], state: "committed" as const,
        committedAt: now, committedBy: context.userId, version: record.version + 1 };
      transaction.updateCollaborationImport(committed, expectedVersion);
      transaction.appendAudit(audit(this.idFactory, now, context, { projectId: record.projectId,
        action: "collaboration.import_committed", objectType: "collaboration_import", objectId: record.id,
        priorState: record.state, newState: committed.state, reason: null,
        changedFields: { itemCount: committed.committedItemIds.length, sourceSha256: record.sourceSha256 } }));
      return committed;
    });
  }

  public reviewItem(context: AccessContext, assignments: readonly RoleAssignment[], itemId: string,
    expectedVersion: number, decision: "accept" | "reject", reason: string): Promise<CollaborationItemRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const item = transaction.collaborationItemById(itemId); if (!item) throw new NotFoundError();
      const sourceImport = transaction.collaborationImportById(item.importId); if (!sourceImport) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "collaboration.review",
        resource: scope(item.businessScopeOrganizationId, item.projectId, item.id),
        requiredQualifications: ["document_collaboration_authority"],
        forbiddenActorIds: [item.authorUserId, item.createdBy, sourceImport.previewedBy, sourceImport.committedBy ?? ""],
        minimumAssurance: "step-up" }, now);
      if (item.version !== expectedVersion) throw new ConflictError();
      if (item.state !== "submitted") throw new ValidationError("Only submitted collaboration evidence can be reviewed.", ["collaboration_item_state_invalid"]);
      const reviewed = { ...item, state: decision === "accept" ? "accepted" as const : "rejected" as const,
        reviewedAt: now, reviewedBy: context.userId, reviewReason: required(reason, "reason", 2_000), version: item.version + 1 };
      transaction.updateCollaborationItem(reviewed, expectedVersion);
      transaction.appendAudit(audit(this.idFactory, now, context, { projectId: item.projectId,
        action: `collaboration.item_${decision}ed`, objectType: "collaboration_item", objectId: item.id,
        priorState: item.state, newState: reviewed.state, reason: reviewed.reviewReason,
        changedFields: { state: reviewed.state, documentRevisionId: item.documentRevisionId,
          providerStatusCode: item.providerStatusCode, evidenceStatus: item.evidenceStatus } }));
      return reviewed;
    });
  }

  public resolveIssue(context: AccessContext, assignments: readonly RoleAssignment[], issueId: string,
    expectedVersion: number, decision: "resolved" | "waived", resolution: string): Promise<CollaborationReconciliationRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const record = transaction.collaborationReconciliationById(issueId); if (!record) throw new NotFoundError();
      const sourceImport = transaction.collaborationImportById(record.importId); if (!sourceImport) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "collaboration.reconcile",
        resource: scope(record.businessScopeOrganizationId, record.projectId, record.id),
        requiredQualifications: ["integration_authority"],
        forbiddenActorIds: [record.createdBy, sourceImport.previewedBy], minimumAssurance: "step-up" }, now);
      if (record.version !== expectedVersion) throw new ConflictError();
      if (record.state !== "open") throw new ValidationError("Reconciliation issue is already closed.", ["reconciliation_state_invalid"]);
      const updated = { ...record, state: decision, resolution: required(resolution, "resolution", 2_000),
        resolvedAt: now, resolvedBy: context.userId, version: record.version + 1 };
      transaction.updateCollaborationReconciliation(updated, expectedVersion);
      transaction.appendAudit(audit(this.idFactory, now, context, { projectId: record.projectId,
        action: `collaboration.reconciliation_${decision}`, objectType: "collaboration_reconciliation", objectId: record.id,
        priorState: record.state, newState: updated.state, reason: updated.resolution,
        changedFields: { code: record.code, state: updated.state } }));
      return updated;
    });
  }

  public snapshot(context: AccessContext, assignments: readonly RoleAssignment[], projectId: string): Promise<DocumentCollaborationSnapshot> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId); if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "collaboration.read",
        resource: scope(project.businessScopeOrganizationId, projectId, null), requiredQualifications: [],
        forbiddenActorIds: [], minimumAssurance: "standard" }, now);
      return { imports: transaction.collaborationImports(projectId), items: transaction.collaborationItems(projectId),
        reconciliations: transaction.collaborationReconciliations(projectId), outbound: this.outboundCapabilityValue() };
    });
  }

  public outboundCapability(context: AccessContext, assignments: readonly RoleAssignment[], projectId: string): Promise<DocumentCollaborationOutboundCapability> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId); if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, { action: "collaboration.read",
        resource: scope(project.businessScopeOrganizationId, projectId, null), requiredQualifications: [],
        forbiddenActorIds: [], minimumAssurance: "standard" }, now);
      return this.outboundCapabilityValue();
    });
  }

  private outboundCapabilityValue(): DocumentCollaborationOutboundCapability {
    return { enabled: false, provider: "bluebeam", blockers: ["live_provider_contract_unapproved",
      "sandbox_not_verified", "outbound_identity_not_configured", "rate_retry_reconciliation_not_accepted",
      "tenant_project_ownership_not_verified", "vendor_terms_and_retention_not_accepted"] };
  }
}
