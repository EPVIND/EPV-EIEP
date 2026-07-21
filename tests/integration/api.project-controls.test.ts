import assert from "node:assert/strict";
import test from "node:test";
import {
  DevelopmentAuthenticator,
  FoundationService,
  InMemoryFoundationStore,
  OperationalService,
  ProjectControlsService,
  buildServer,
} from "@eiep/api";
import { assignment, completeReadiness, scope, sequentialIds } from "../helpers/foundation-fixture.js";

const headers = (userId: string, organizationId = "org-epv") => ({
  "x-eiep-user-id": userId,
  "x-eiep-organization-id": organizationId,
  "x-eiep-assurance": "mfa",
});

test("FR-PJC-001, FR-PRC-001, FR-SCH-001 / AC-02, EX-AC-04-05: project-controls API authenticates and scopes the integrated workspace", async (t) => {
  const store = new InMemoryFoundationStore();
  const now = new Date("2026-07-21T12:00:00.000Z");
  await store.transaction((transaction) => transaction.insertProject({
    id: "controls-api-project", businessScopeOrganizationId: "org-epv", number: "PJC-API-001",
    name: "Controls API project", customerOrganizationId: "org-customer", facilityId: "facility-1",
    timeZone: "America/Denver", state: "active", readiness: completeReadiness, version: 2,
    createdAt: now, createdBy: "fixture", updatedAt: now, updatedBy: "fixture",
  }));
  store.seedAssignments([
    assignment(
      "controls-api-access", "controls-user", ["controls.read", "schedule.manage"],
      scope("controls-api-project"), {}, "org-epv",
    ),
    assignment(
      "controls-other-access", "other-user", ["controls.read"],
      scope("other-project", null, "org-other"), {}, "org-other",
    ),
  ]);
  const clock = () => now;
  const service = new FoundationService(store, clock, sequentialIds("controls-api-foundation"));
  const operations = new OperationalService(store, clock, sequentialIds("controls-api-operation"));
  const projectControls = new ProjectControlsService(store, clock, sequentialIds("controls-api"));
  const server = await buildServer({
    service, operations, projectControls, store, authenticator: new DevelopmentAuthenticator(),
    environment: "test", trainingBanner: false, allowedOrigins: [],
  });
  t.after(() => server.close());

  const unauthenticated = await server.inject({
    method: "GET", url: "/v1/projects/controls-api-project/controls",
  });
  assert.equal(unauthenticated.statusCode, 401, unauthenticated.body);

  const schedule = await server.inject({
    method: "POST", url: "/v1/projects/controls-api-project/schedules", headers: headers("controls-user"),
    payload: { number: "SCH-API-001", name: "API schedule", timeZone: "America/Denver" },
  });
  assert.equal(schedule.statusCode, 201, schedule.body);
  assert.equal(schedule.json().number, "SCH-API-001");

  const snapshot = await server.inject({
    method: "GET", url: "/v1/projects/controls-api-project/controls", headers: headers("controls-user"),
  });
  assert.equal(snapshot.statusCode, 200, snapshot.body);
  assert.deepEqual(snapshot.json().schedules.map((item: { number: string }) => item.number), ["SCH-API-001"]);

  const otherOrganization = await server.inject({
    method: "GET", url: "/v1/projects/controls-api-project/controls", headers: headers("other-user", "org-other"),
  });
  assert.equal(otherOrganization.statusCode, 403, otherOrganization.body);
  assert.equal(otherOrganization.json().error, "forbidden");
  assert.equal("details" in otherOrganization.json(), false);

  assert.deepEqual(
    store.snapshot().audits.filter((audit) => audit.objectId === schedule.json().id).map((audit) => audit.action),
    ["schedule.created"],
  );
});
