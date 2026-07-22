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
  });
  store.seedAssignments([
    assignment("collaboration-api-read", "collaboration-reader", ["collaboration.read"], scope("collaboration-api-project")),
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
