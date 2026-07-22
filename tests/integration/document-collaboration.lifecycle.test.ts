import assert from "node:assert/strict";
import test from "node:test";
import { DocumentCollaborationService, InMemoryFoundationStore, PlatformService } from "@eiep/api";
import { AuthorizationDeniedError } from "@eiep/rules-engine";
import { assignment, completeReadiness, context, scope, sequentialIds } from "../helpers/foundation-fixture.js";

const now = new Date("2026-07-21T18:00:00.000Z");
const sourceSha256 = "b".repeat(64);
const projectId = "bluebeam-project";
const organizationId = "org-epv";

function access(userId: string, permissions: readonly string[], qualifications: readonly string[] = [], targetProjectId = projectId) {
  return { context: context(userId, "step-up", qualifications, organizationId),
    assignments: [assignment(`${userId}-collaboration-access`, userId, permissions, scope(targetProjectId), {}, organizationId)] };
}

async function configuredCollaboration() {
  const store = new InMemoryFoundationStore();
  const service = new DocumentCollaborationService(store, () => now, sequentialIds("collaboration"));
  await store.transaction((transaction) => {
    transaction.insertProject({ id: projectId, businessScopeOrganizationId: organizationId, number: "BBM-001",
      name: "Bluebeam controlled pilot", customerOrganizationId: "org-customer", facilityId: "facility-1",
      timeZone: "America/Denver", state: "active", readiness: completeReadiness, version: 2,
      createdAt: now, createdBy: "project-authority", updatedAt: now, updatedBy: "project-authority" });
    transaction.insertProject({ id: "other-project", businessScopeOrganizationId: organizationId, number: "BBM-002",
      name: "Other project", customerOrganizationId: "org-customer", facilityId: "facility-2",
      timeZone: "America/Denver", state: "active", readiness: completeReadiness, version: 2,
      createdAt: now, createdBy: "project-authority", updatedAt: now, updatedBy: "project-authority" });
    transaction.insertProjectOrganization({ id: "bluebeam-project-author-org", projectId, organizationId: "org-designer",
      participationRole: "supplier", state: "active", version: 1, createdAt: now, createdBy: "project-authority" });
    transaction.insertDocument({ id: "bluebeam-document", projectId, number: "P-100", title: "Process drawing",
      type: "drawing", discipline: "piping", currentRevisionId: "bluebeam-revision", version: 1,
      createdAt: now, createdBy: "document-control", updatedAt: now, updatedBy: "document-control" });
    transaction.insertRevision({ id: "bluebeam-revision", documentId: "bluebeam-document", revision: "2",
      state: "released", purpose: "construction", source: "controlled source", fileId: "drawing-file",
      fileValidationState: "released", approvalCount: 1, requiredApprovalCount: 1, supersedesRevisionId: null,
      version: 3, createdAt: now, createdBy: "document-control", updatedAt: now, updatedBy: "document-control" });
    transaction.insertGovernedFile({ id: "bluebeam-source", businessScopeOrganizationId: organizationId, projectId,
      storageKey: `${projectId}/bluebeam-source`, originalFilename: "session-export.json", declaredMediaType: "application/json",
      detectedMediaType: "application/json", sha256: sourceSha256, detectedSha256: sourceSha256, sizeBytes: 4096,
      validationState: "released", malwareState: "clean", validatorVersion: "fixture-validator-1",
      retentionClass: "project-record", activeContentDetected: false, encryptedArchiveDetected: false, version: 3,
      uploadedAt: now, uploadedBy: "source-uploader", validatedAt: now, validatedBy: "source-validator",
      releasedAt: now, releasedBy: "file-release-authority" });
    transaction.insertIdentityAccount({ id: "designer-account", personId: "designer-person", displayName: "Designer",
      state: "active", qualificationCodes: [], version: 1, createdAt: now, createdBy: "identity-authority",
      updatedAt: now, updatedBy: "identity-authority" });
  });
  const input = {
    provider: "bluebeam_export" as const, providerProduct: "Bluebeam Revu Studio export", providerProjectId: "BB-PROJECT-1",
    providerSessionId: "BB-SESSION-10", sourceFileId: "bluebeam-source", sourceVersion: "2026-07-21T17:30Z",
    sourceSha256, schemaVersion: 1, mappingVersion: "mapping-1", idempotencyKey: "preview-1",
    documentMappings: [{ providerDocumentId: "BB-DOC-1", documentRevisionId: "bluebeam-revision" }],
    authorMappings: [{ providerAuthorId: "BB-USER-7", userAccountId: "designer-account", organizationId: "org-designer" }],
    statusMappings: [{ providerStatusCode: "Accepted", evidenceStatus: "closed_claim" as const }],
    items: [
      { providerItemId: "BB-MARKUP-1", providerDocumentId: "BB-DOC-1", parentProviderItemId: null,
        itemType: "markup" as const, pageNumber: 3, region: { x: "0.1", y: "0.2", width: "0.3", height: "0.1", units: "normalized" as const },
        authorProviderId: "BB-USER-7", providerStatusCode: "Accepted", subject: "Valve orientation",
        body: "Rotate valve operator for access.", appearance: "cloud:red", createdAt: new Date("2026-07-21T16:00:00.000Z"),
        updatedAt: new Date("2026-07-21T16:30:00.000Z"), unsupportedContentCodes: [] },
      { providerItemId: "BB-REPLY-1", providerDocumentId: "BB-DOC-1", parentProviderItemId: "BB-MARKUP-1",
        itemType: "reply" as const, pageNumber: 3, region: null, authorProviderId: "BB-USER-7",
        providerStatusCode: "Accepted", subject: "Field reply", body: "Access confirmed in model review.", appearance: null,
        createdAt: new Date("2026-07-21T16:45:00.000Z"), updatedAt: new Date("2026-07-21T16:45:00.000Z"), unsupportedContentCodes: [] },
    ],
  };
  return { store, service, input };
}

test("FR-BBM-001-003 / EX-AC-08: Bluebeam export preview and atomic commit preserve source, revision, identity, status, region, and reply fidelity", async () => {
  const { store, service, input } = await configuredCollaboration();
  const previewer = access("collaboration-previewer", ["collaboration.import.preview"]);
  const preview = await service.preview(previewer.context, previewer.assignments, projectId, input);
  assert.equal(preview.state, "previewed");
  assert.equal(preview.previewIssues.length, 0);
  assert.deepEqual(await service.preview(previewer.context, previewer.assignments, projectId, input), preview);
  assert.deepEqual(await service.preview(previewer.context, previewer.assignments, projectId,
    { ...input, idempotencyKey: "same-source-new-delivery-key" }), preview);
  await assert.rejects(service.preview(previewer.context, previewer.assignments, projectId,
    { ...input, idempotencyKey: "same-source-changed-mapping", mappingVersion: "mapping-2" }), /different mappings or content/u);

  const committer = access("collaboration-committer", ["collaboration.import.commit"], ["collaboration_import_authority"]);
  const committed = await service.commit(committer.context, committer.assignments, preview.id, preview.version);
  assert.equal(committed.state, "committed");
  assert.equal(committed.committedItemIds.length, 2);
  const snapshot = await service.snapshot(access("collaboration-reader", ["collaboration.read"]).context,
    access("collaboration-reader", ["collaboration.read"]).assignments, projectId);
  const markup = snapshot.items.find((item) => item.providerItemId === "BB-MARKUP-1")!;
  const reply = snapshot.items.find((item) => item.providerItemId === "BB-REPLY-1")!;
  assert.equal(markup.documentRevisionId, "bluebeam-revision");
  assert.equal(markup.providerDocumentId, "BB-DOC-1");
  assert.equal(markup.authorUserId, "designer-account");
  assert.equal(markup.providerStatusCode, "Accepted");
  assert.equal(markup.evidenceStatus, "closed_claim");
  assert.equal(reply.parentItemId, markup.id);
  assert.equal(snapshot.outbound.enabled, false);
  assert.equal(snapshot.outbound.blockers.includes("live_provider_contract_unapproved"), true);

  const reviewer = access("collaboration-reviewer", ["collaboration.review"], ["document_collaboration_authority"]);
  const accepted = await service.reviewItem(reviewer.context, reviewer.assignments, markup.id, markup.version,
    "accept", "Markup is accepted as collaboration evidence only.");
  assert.equal(accepted.state, "accepted");
  const document = await store.transaction((transaction) => transaction.documentById("bluebeam-document"));
  const revision = await store.transaction((transaction) => transaction.revisionById("bluebeam-revision"));
  assert.equal(document?.version, 1);
  assert.equal(revision?.state, "released");
  assert.equal(revision?.version, 3);
  const platform = new PlatformService(store, () => now, sequentialIds("collaboration-platform"));
  const discoverer = access("collaboration-discoverer", ["collaboration.read", "export.create"]);
  const search = await platform.searchProjectRecords(discoverer.context, discoverer.assignments, projectId, "valve");
  assert.deepEqual(search.map((record) => record.recordId), [markup.id]);
  const exportJob = await platform.requestExport(discoverer.context, discoverer.assignments, projectId, {
    recordClass: "collaboration", recordIds: [markup.id], format: "jsonl", recipientOrganizationId: organizationId,
  });
  assert.equal(exportJob.recordClass, "collaboration");
  assert.equal(exportJob.state, "queued");
});

test("FR-BBM-004: invalid mappings, unsupported content, parent errors, changed retries, and changed-source collisions remain explicit reconciliation work", async () => {
  const { store, service, input } = await configuredCollaboration();
  const previewer = access("invalid-previewer", ["collaboration.import.preview"]);
  const invalid = await service.preview(previewer.context, previewer.assignments, projectId, {
    ...input, idempotencyKey: "invalid-preview", providerSessionId: "BB-SESSION-INVALID",
    documentMappings: [], authorMappings: [], statusMappings: [],
    items: [{ ...input.items[1]!, providerItemId: "BROKEN-1", providerDocumentId: "UNKNOWN-DOC",
      authorProviderId: "UNKNOWN-AUTHOR", providerStatusCode: "UNKNOWN-STATUS", parentProviderItemId: "MISSING",
      pageNumber: 0, unsupportedContentCodes: ["measurement-calibration"] }],
  });
  assert.equal(invalid.state, "invalid");
  assert.equal(invalid.previewIssues.some((value) => value.code === "unsupported_content"), true);
  assert.equal(invalid.previewIssues.some((value) => value.code === "source_document_unmapped"), true);
  const committer = access("invalid-committer", ["collaboration.import.commit"], ["collaboration_import_authority"]);
  await assert.rejects(service.commit(committer.context, committer.assignments, invalid.id, invalid.version), /valid preview/u);
  await assert.rejects(service.preview(previewer.context, previewer.assignments, projectId,
    { ...input, idempotencyKey: "invalid-preview", providerSessionId: "BB-SESSION-INVALID" }), /idempotency key/u);

  await service.preview(previewer.context, previewer.assignments, projectId, { ...input, idempotencyKey: "source-original" });
  const changedSha256 = "c".repeat(64);
  await store.transaction((transaction) => transaction.insertGovernedFile({
    id: "bluebeam-source-changed", businessScopeOrganizationId: organizationId, projectId,
    storageKey: `${projectId}/bluebeam-source-changed`, originalFilename: "session-export-changed.json",
    declaredMediaType: "application/json", detectedMediaType: "application/json", sha256: changedSha256,
    detectedSha256: changedSha256, sizeBytes: 4097, validationState: "released", malwareState: "clean",
    validatorVersion: "fixture-validator-1", retentionClass: "project-record", activeContentDetected: false,
    encryptedArchiveDetected: false, version: 3, uploadedAt: now, uploadedBy: "source-uploader",
    validatedAt: now, validatedBy: "source-validator", releasedAt: now, releasedBy: "file-release-authority",
  }));
  const collision = await service.preview(previewer.context, previewer.assignments, projectId, {
    ...input, idempotencyKey: "source-collision", sourceFileId: "bluebeam-source-changed", sourceSha256: changedSha256,
  });
  assert.equal(collision.state, "conflict");
  assert.equal(collision.previewIssues.some((value) => value.code === "changed_source_collision"), true);
  const reconciliations = await service.snapshot(access("reconciliation-reader", ["collaboration.read"]).context,
    access("reconciliation-reader", ["collaboration.read"]).assignments, projectId);
  assert.equal(reconciliations.reconciliations.length >= invalid.previewIssues.length, true);
});

test("FR-BBM-005: separation of duty, scoped direct access, and the outbound safety boundary fail closed", async () => {
  const { service, input } = await configuredCollaboration();
  const previewer = access("same-actor", ["collaboration.import.preview", "collaboration.import.commit"], ["collaboration_import_authority"]);
  const preview = await service.preview(previewer.context, previewer.assignments, projectId, input);
  await assert.rejects(service.commit(previewer.context, previewer.assignments, preview.id, preview.version),
    (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "separation_of_duty");
  const wrongScope = access("wrong-scope-reader", ["collaboration.read"], [], "other-project");
  await assert.rejects(service.snapshot(wrongScope.context, wrongScope.assignments, projectId),
    (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "scope_denied");
  const capability = await service.outboundCapability(access("reader", ["collaboration.read"]).context,
    access("reader", ["collaboration.read"]).assignments, projectId);
  assert.deepEqual(capability, { enabled: false, provider: "bluebeam", blockers: ["live_provider_contract_unapproved",
    "sandbox_not_verified", "outbound_identity_not_configured", "rate_retry_reconciliation_not_accepted",
    "tenant_project_ownership_not_verified", "vendor_terms_and_retention_not_accepted"] });
});
