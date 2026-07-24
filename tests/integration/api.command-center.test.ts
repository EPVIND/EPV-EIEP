import assert from "node:assert/strict";
import test from "node:test";
import {
  DevelopmentAuthenticator,
  FoundationService,
  InMemoryFoundationStore,
  OperationalService,
  buildServer,
} from "@eiep/api";
import { assignment, completeReadiness, scope } from "../helpers/foundation-fixture.js";

const headers = (userId: string, organizationId = "org-epv") => ({
  "x-eiep-user-id": userId, "x-eiep-organization-id": organizationId, "x-eiep-assurance": "mfa",
});

test("FR-CMD-001-004 / AC-02, AC-15: command-center API authenticates and keeps underlying records scope-filtered", async (t) => {
  const store = new InMemoryFoundationStore();
  const now = new Date("2026-07-21T18:00:00.000Z");
  await store.transaction((transaction) => transaction.insertProject({
    id: "command-api-project", businessScopeOrganizationId: "org-epv", number: "CMD-API-001",
    name: "Command API project", customerOrganizationId: "org-customer", facilityId: "facility-1",
    timeZone: "America/Denver", state: "active", readiness: completeReadiness, version: 2,
    createdAt: now, createdBy: "fixture", updatedAt: now, updatedBy: "fixture",
  }));
  store.seedAssignments([
    assignment("command-api-report", "command-reader", ["report.read"], scope("command-api-project")),
    assignment("command-api-other", "other-reader", ["report.read"], scope("other-project", null, "org-other"), {}, "org-other"),
  ]);
  const server = await buildServer({
    service: new FoundationService(store), operations: new OperationalService(store), store,
    authenticator: new DevelopmentAuthenticator(), environment: "test", trainingBanner: false, allowedOrigins: [],
  });
  t.after(() => server.close());

  const unauthenticated = await server.inject({ method: "GET", url: "/v1/projects/command-api-project/command-center" });
  assert.equal(unauthenticated.statusCode, 401, unauthenticated.body);

  const response = await server.inject({ method: "GET", url: "/v1/projects/command-api-project/command-center", headers: headers("command-reader") });
  assert.equal(response.statusCode, 200, response.body);
  const snapshot = response.json();
  assert.equal(snapshot.project.number, "CMD-API-001");
  assert.equal(snapshot.metrics.openTasks, 0);
  assert.equal(snapshot.metrics.scheduleProgressPercent, null);
  assert.equal(snapshot.activityVisible, false);
  assert.equal(snapshot.modules.every((module: { total: number }) => module.total === 0), true);

  const other = await server.inject({ method: "GET", url: "/v1/projects/command-api-project/command-center", headers: headers("other-reader", "org-other") });
  assert.equal(other.statusCode, 403, other.body);
  assert.equal(other.json().error, "forbidden");
  assert.equal("details" in other.json(), false);
});
