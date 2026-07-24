import assert from "node:assert/strict";
import test from "node:test";
import { DevelopmentAuthenticator, FoundationService, InMemoryFoundationStore, OperationalService, buildServer } from "@eiep/api";
import { approveMaterialConfiguration, assignment, readinessDeclaration, scope, seedAuthoritativeProjectReadiness, sequentialIds } from "../helpers/foundation-fixture.js";

test("FR-IAM-001, FR-PRJ-001 / AC-02-04: API requires identity and applies stored scope assignments", async (t) => {
  const store = new InMemoryFoundationStore();
  store.seedAssignments([
    assignment("api-operations", "api-user", ["project.create", "project.read", "project.activate", "material.receive", "material.read", "inspection.read", "ncr.read", "punch.read", "turnover.read"], scope()),
  ]);
  const service = new FoundationService(store, () => new Date("2026-07-20T22:00:00.000Z"), sequentialIds("api"));
  const operations = new OperationalService(store, () => new Date("2026-07-20T22:00:00.000Z"), sequentialIds("api-operation"));
  const server = await buildServer({
    service,
    operations,
    store,
    authenticator: new DevelopmentAuthenticator(),
    environment: "test",
    trainingBanner: false,
    allowedOrigins: ["https://review.example.test"],
  });
  t.after(() => server.close());

  const unauthenticated = await server.inject({ method: "GET", url: "/v1/session" });
  assert.equal(unauthenticated.statusCode, 401);

  const created = await server.inject({
    method: "POST",
    url: "/v1/projects",
    headers: {
      "x-eiep-user-id": "api-user",
      "x-eiep-organization-id": "org-epv",
      "x-eiep-assurance": "mfa",
    },
    payload: {
      businessScopeOrganizationId: "org-epv",
      number: "API-001",
      name: "API project",
      customerOrganizationId: "org-customer",
      facilityId: "facility-1",
      timeZone: "UTC",
      readiness: readinessDeclaration,
    },
  });
  assert.equal(created.statusCode, 201, created.body);
  assert.equal(created.json().number, "API-001");

  const visibleProjects = await server.inject({
    method: "GET", url: "/v1/projects",
    headers: {
      "x-eiep-user-id": "api-user", "x-eiep-organization-id": "org-epv", "x-eiep-assurance": "mfa",
    },
  });
  assert.equal(visibleProjects.statusCode, 200, visibleProjects.body);
  assert.deepEqual(visibleProjects.json().map((project: { id: string }) => project.id), [created.json().id]);

  const preflight = await server.inject({
    method: "OPTIONS", url: "/v1/projects",
    headers: {
      origin: "https://review.example.test", "access-control-request-method": "GET",
      "access-control-request-headers": "x-eiep-user-id,x-eiep-organization-id,x-eiep-assurance",
    },
  });
  assert.equal(preflight.statusCode, 204, preflight.body);
  assert.equal(preflight.headers["access-control-allow-origin"], "https://review.example.test");

  const readiness = await server.inject({
    method: "GET", url: `/v1/projects/${created.json().id}/readiness`,
    headers: { "x-eiep-user-id": "api-user", "x-eiep-organization-id": "org-epv", "x-eiep-assurance": "mfa" },
  });
  assert.equal(readiness.statusCode, 200, readiness.body);
  assert.ok(readiness.json().blockers.includes("project_authority_required"));

  const deniedActivation = await server.inject({
    method: "POST", url: `/v1/projects/${created.json().id}/activate`,
    headers: { "x-eiep-user-id": "api-user", "x-eiep-organization-id": "org-epv", "x-eiep-assurance": "step-up" },
    payload: { expectedVersion: 1 },
  });
  assert.equal(deniedActivation.statusCode, 422, deniedActivation.body);
  assert.ok(deniedActivation.json().details.includes("project_authority_required"));
  await seedAuthoritativeProjectReadiness(store, created.json().id, new Date("2026-07-20T22:00:00.000Z"));

  const activated = await server.inject({
    method: "POST",
    url: `/v1/projects/${created.json().id}/activate`,
    headers: {
      "x-eiep-user-id": "api-user",
      "x-eiep-organization-id": "org-epv",
      "x-eiep-assurance": "step-up",
    },
    payload: { expectedVersion: 1 },
  });
  assert.equal(activated.statusCode, 200, activated.body);

  const materialConfiguration = await approveMaterialConfiguration(service, store, created.json().id, "1", {
    mtrRequired: false, receivingInspectionRequired: false, pmiRequired: false,
  });

  const material = await server.inject({
    method: "POST",
    url: `/v1/projects/${created.json().id}/materials`,
    headers: {
      "x-eiep-user-id": "api-user",
      "x-eiep-organization-id": "org-epv",
      "x-eiep-assurance": "step-up",
    },
    payload: {
      projectConfigurationRevisionId: materialConfiguration.id,
      identifier: "API-MAT-001",
      receiptNumber: "API-RCV-001",
      purchaseReference: "API-PO-001",
      vendorOrganizationId: "org-vendor",
      specification: "project-specification",
      grade: "configured-grade",
      form: "pipe",
      dimensions: "configured-dimensions",
      quantity: "1.000",
      unitCode: "EA",
      heatLot: "API-HEAT-001",
      mtrDocumentRevisionId: null,
      receiptEvidenceFileIds: ["api-receipt-evidence"],
      storageLocation: "API-RACK",
      mtrRequired: false,
      receivingInspectionRequired: false,
      pmiRequired: false,
      governingPmiRule: null,
    },
  });
  assert.equal(material.statusCode, 201, material.body);
  assert.equal(material.json().state, "received_pending");

  const visibleMaterials = await server.inject({
    method: "GET", url: `/v1/projects/${created.json().id}/materials`,
    headers: { "x-eiep-user-id": "api-user", "x-eiep-organization-id": "org-epv", "x-eiep-assurance": "mfa" },
  });
  assert.equal(visibleMaterials.statusCode, 200, visibleMaterials.body);
  assert.deepEqual(visibleMaterials.json().map((item: { id: string }) => item.id), [material.json().id]);

  const qualityExecution = await server.inject({
    method: "GET", url: `/v1/projects/${created.json().id}/quality-execution`,
    headers: { "x-eiep-user-id": "api-user", "x-eiep-organization-id": "org-epv", "x-eiep-assurance": "mfa" },
  });
  assert.equal(qualityExecution.statusCode, 200, qualityExecution.body);
  assert.deepEqual(qualityExecution.json(), { inspections: [], ncrs: [], punches: [], turnoverPackages: [] });

  const health = await server.inject({ method: "GET", url: "/health" });
  assert.equal(health.statusCode, 200);
  assert.equal(health.json().productionReady, false);
});
