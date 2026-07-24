import assert from "node:assert/strict";
import test from "node:test";
import {
  DevelopmentAuthenticator,
  ExecutionDisciplineService,
  FoundationService,
  InMemoryFoundationStore,
  OperationalService,
  buildServer,
} from "@eiep/api";
import { assignment, completeReadiness, scope, sequentialIds } from "../helpers/foundation-fixture.js";

const headers = (userId: string, organizationId = "org-epv") => ({
  "x-eiep-user-id": userId, "x-eiep-organization-id": organizationId, "x-eiep-assurance": "mfa",
});

test("FR-WLD-001, FR-NDE-001, FR-PWH-001, FR-TST-001 / AC-02, AC-03: execution API authenticates and scopes the integrated workspace", async (t) => {
  const store = new InMemoryFoundationStore();
  const now = new Date("2026-07-21T12:00:00.000Z");
  await store.transaction((transaction) => transaction.insertProject({
    id: "execution-api-project", businessScopeOrganizationId: "org-epv", number: "EXE-API-001",
    name: "Execution API project", customerOrganizationId: "org-customer", facilityId: "facility-1",
    timeZone: "America/Denver", state: "active", readiness: completeReadiness, version: 2,
    createdAt: now, createdBy: "fixture", updatedAt: now, updatedBy: "fixture",
  }));
  store.seedAssignments([
    assignment("execution-api-access", "execution-user", ["execution.read"], scope("execution-api-project"), {}, "org-epv"),
    assignment("execution-other-access", "other-user", ["execution.read"], scope("other-project", null, "org-other"), {}, "org-other"),
  ]);
  const clock = () => now;
  const server = await buildServer({
    service: new FoundationService(store, clock, sequentialIds("execution-api-foundation")),
    operations: new OperationalService(store, clock, sequentialIds("execution-api-operation")),
    executionDisciplines: new ExecutionDisciplineService(store, clock, sequentialIds("execution-api")),
    store, authenticator: new DevelopmentAuthenticator(), environment: "test", trainingBanner: false, allowedOrigins: [],
  });
  t.after(() => server.close());

  const unauthenticated = await server.inject({ method: "GET", url: "/v1/projects/execution-api-project/execution-disciplines" });
  assert.equal(unauthenticated.statusCode, 401, unauthenticated.body);

  const visible = await server.inject({
    method: "GET", url: "/v1/projects/execution-api-project/execution-disciplines", headers: headers("execution-user"),
  });
  assert.equal(visible.statusCode, 200, visible.body);
  assert.deepEqual(visible.json(), {
    procedures: [], welderQualifications: [], welds: [], ndeRequests: [], ndeReports: [], pwhtCycles: [],
    testPackages: [], weldReadiness: [],
  });

  const otherOrganization = await server.inject({
    method: "GET", url: "/v1/projects/execution-api-project/execution-disciplines", headers: headers("other-user", "org-other"),
  });
  assert.equal(otherOrganization.statusCode, 403, otherOrganization.body);
  assert.equal(otherOrganization.json().error, "forbidden");
  assert.equal("details" in otherOrganization.json(), false);
});
