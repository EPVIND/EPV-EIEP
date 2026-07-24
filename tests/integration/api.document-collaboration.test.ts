import assert from "node:assert/strict";
import test from "node:test";
import {
  DevelopmentAuthenticator,
  DocumentCollaborationService,
  FoundationService,
  InMemoryFoundationStore,
  OperationalService,
  buildServer,
} from "@eiep/api";
import { assignment, completeReadiness, scope, sequentialIds } from "../helpers/foundation-fixture.js";

const headers = (userId: string, organizationId = "org-epv") => ({
  "x-eiep-user-id": userId, "x-eiep-organization-id": organizationId, "x-eiep-assurance": "mfa",
});

test("FR-BBM-001-005 / AC-02, EX-AC-08: collaboration API authenticates, scopes, validates, and exposes the outbound boundary", async (t) => {
  const store = new InMemoryFoundationStore(); const now = new Date("2026-07-21T18:00:00.000Z");
  await store.transaction((transaction) => {
    transaction.insertProject({ id: "collaboration-api-project", businessScopeOrganizationId: "org-epv", number: "BBM-API-001",
      name: "Collaboration API project", customerOrganizationId: "org-customer", facilityId: "facility-1",
      timeZone: "America/Denver", state: "active", readiness: completeReadiness, version: 2,
      createdAt: now, createdBy: "fixture", updatedAt: now, updatedBy: "fixture" });
    transaction.insertDocument({ id: "collaboration-api-document", projectId: "collaboration-api-project", number: "P-100",
      title: "Piping arrangement", type: "drawing", discipline: "piping", currentRevisionId: "collaboration-api-revision",
      version: 1, createdAt: now, createdBy: "fixture", updatedAt: now, updatedBy: "fixture" });
    transaction.insertRevision({ id: "collaboration-api-revision", documentId: "collaboration-api-document", revision: "B",
      state: "released", purpose: "construction", source: "controlled upload", fileId: "collaboration-api-drawing-file",
      fileValidationState: "released", approvalCount: 1, requiredApprovalCount: 1, supersedesRevisionId: null,
      version: 3, createdAt: now, createdBy: "fixture", updatedAt: now, updatedBy: "fixture" });
    transaction.insertGovernedFile({ id: "collaboration-api-drawing-file", businessScopeOrganizationId: "org-epv",
      projectId: "collaboration-api-project", storageKey: "collaboration-api-project/P-100.pdf",
      originalFilename: "P-100.pdf", declaredMediaType: "application/pdf", detectedMediaType: "application/pdf",
      sha256: "a".repeat(64), detectedSha256: "a".repeat(64), sizeBytes: 1024, validationState: "released",
      malwareState: "clean", validatorVersion: "fixture-validator-1", retentionClass: "project-record",
      activeContentDetected: false, encryptedArchiveDetected: false, version: 3, uploadedAt: now,
      uploadedBy: "fixture", validatedAt: now, validatedBy: "fixture", releasedAt: now, releasedBy: "fixture" });
  });
  store.seedAssignments([
    assignment("collaboration-api-read", "collaboration-reader",
      ["collaboration.read", "document.read_current"], scope("collaboration-api-project")),
    assignment("collaboration-api-preview", "collaboration-previewer", ["collaboration.import.preview"], scope("collaboration-api-project")),
    assignment("collaboration-api-other", "other-user", ["collaboration.read"], scope("other-project", null, "org-other"), {}, "org-other"),
  ]);
  const clock = () => now;
  const server = await buildServer({
    service: new FoundationService(store, clock, sequentialIds("collaboration-api-foundation")),
    operations: new OperationalService(store, clock, sequentialIds("collaboration-api-operation")),
    documentCollaboration: new DocumentCollaborationService(store, clock, sequentialIds("collaboration-api")),
    store, authenticator: new DevelopmentAuthenticator(), environment: "test", trainingBanner: false, allowedOrigins: [],
  });
  t.after(() => server.close());

  const unauthenticated = await server.inject({ method: "GET", url: "/v1/projects/collaboration-api-project/collaboration" });
  assert.equal(unauthenticated.statusCode, 401, unauthenticated.body);
  const visible = await server.inject({ method: "GET", url: "/v1/projects/collaboration-api-project/collaboration", headers: headers("collaboration-reader") });
  assert.equal(visible.statusCode, 200, visible.body);
  assert.deepEqual(visible.json(), { imports: [], items: [], reconciliations: [], outbound: { enabled: false, provider: "bluebeam",
    blockers: ["live_provider_contract_unapproved", "sandbox_not_verified", "outbound_identity_not_configured",
      "rate_retry_reconciliation_not_accepted", "tenant_project_ownership_not_verified", "vendor_terms_and_retention_not_accepted"] } });
  const revisions = await server.inject({ method: "GET",
    url: "/v1/projects/collaboration-api-project/current-document-revisions", headers: headers("collaboration-reader") });
  assert.equal(revisions.statusCode, 200, revisions.body);
  assert.deepEqual(revisions.json(), [{
    documentId: "collaboration-api-document", documentNumber: "P-100", documentTitle: "Piping arrangement",
    revisionId: "collaboration-api-revision", revision: "B", sourceFilename: "P-100.pdf",
  }]);

  const malformed = await server.inject({ method: "POST", url: "/v1/projects/collaboration-api-project/collaboration-imports/preview",
    headers: headers("collaboration-previewer"), payload: { provider: "bluebeam_export" } });
  assert.equal(malformed.statusCode, 400, malformed.body);
  assert.equal(malformed.json().error, "invalid_request");

  const otherOrganization = await server.inject({ method: "GET", url: "/v1/projects/collaboration-api-project/collaboration",
    headers: headers("other-user", "org-other") });
  assert.equal(otherOrganization.statusCode, 403, otherOrganization.body);
  assert.equal(otherOrganization.json().error, "forbidden");
  assert.equal("details" in otherOrganization.json(), false);
});
