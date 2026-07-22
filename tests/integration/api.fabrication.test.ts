import assert from "node:assert/strict";
import test from "node:test";
import {
  DevelopmentAuthenticator,
  FabricationService,
  FoundationService,
  InMemoryFoundationStore,
  OperationalService,
  buildServer,
} from "@eiep/api";
import { assignment, completeReadiness, scope, sequentialIds } from "../helpers/foundation-fixture.js";

const headers = (userId: string, organizationId = "org-epv") => ({
  "x-eiep-user-id": userId, "x-eiep-organization-id": organizationId, "x-eiep-assurance": "mfa",
});

test("FR-FAB-001 / AC-02, AC-03: fabrication API authenticates and scopes the controlled workspace", async (t) => {
  const store = new InMemoryFoundationStore();
  const now = new Date("2026-07-21T18:00:00.000Z");
  await store.transaction((transaction) => transaction.insertProject({
    id: "fabrication-api-project", businessScopeOrganizationId: "org-epv", number: "FAB-API-001",
    name: "Fabrication API project", customerOrganizationId: "org-customer", facilityId: "facility-1",
    timeZone: "America/Denver", state: "active", readiness: completeReadiness, version: 2,
    createdAt: now, createdBy: "fixture", updatedAt: now, updatedBy: "fixture",
  }));
  store.seedAssignments([
    assignment("fabrication-api-access", "fabrication-user", ["fabrication.read"], scope("fabrication-api-project"), {}, "org-epv"),
    assignment("fabrication-other-access", "other-user", ["fabrication.read"], scope("other-project", null, "org-other"), {}, "org-other"),
  ]);
  const clock = () => now;
  const server = await buildServer({
    service: new FoundationService(store, clock, sequentialIds("fabrication-api-foundation")),
    operations: new OperationalService(store, clock, sequentialIds("fabrication-api-operation")),
    fabrication: new FabricationService(store, clock, sequentialIds("fabrication-api")),
    store, authenticator: new DevelopmentAuthenticator(), environment: "test", trainingBanner: false, allowedOrigins: [],
  });
  t.after(() => server.close());

  const unauthenticated = await server.inject({ method: "GET", url: "/v1/projects/fabrication-api-project/fabrication" });
  assert.equal(unauthenticated.statusCode, 401, unauthenticated.body);

  const visible = await server.inject({
    method: "GET", url: "/v1/projects/fabrication-api-project/fabrication", headers: headers("fabrication-user"),
  });
  assert.equal(visible.statusCode, 200, visible.body);
  assert.deepEqual(visible.json(), {
    assemblies: [], travelers: [], events: [], releaseReadiness: [], acceptanceReadiness: [],
  });

  const otherOrganization = await server.inject({
    method: "GET", url: "/v1/projects/fabrication-api-project/fabrication", headers: headers("other-user", "org-other"),
  });
  assert.equal(otherOrganization.statusCode, 403, otherOrganization.body);
  assert.equal(otherOrganization.json().error, "forbidden");
  assert.equal("details" in otherOrganization.json(), false);
});
