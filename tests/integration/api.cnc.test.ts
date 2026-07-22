import assert from "node:assert/strict";
import test from "node:test";
import {
  CncService,
  DevelopmentAuthenticator,
  FoundationService,
  InMemoryFoundationStore,
  OperationalService,
  buildServer,
} from "@eiep/api";
import { assignment, completeReadiness, scope, sequentialIds } from "../helpers/foundation-fixture.js";

const headers = (userId: string, organizationId = "org-epv") => ({
  "x-eiep-user-id": userId, "x-eiep-organization-id": organizationId, "x-eiep-assurance": "mfa",
});

test("FR-CNC-001 / AC-02, AC-03: CNC API authenticates, scopes, validates, and audits controlled profiles", async (t) => {
  const store = new InMemoryFoundationStore();
  const now = new Date("2026-07-21T18:00:00.000Z");
  await store.transaction((transaction) => transaction.insertProject({
    id: "cnc-api-project", businessScopeOrganizationId: "org-epv", number: "CNC-API-001", name: "CNC API project",
    customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "America/Denver", state: "active",
    readiness: completeReadiness, version: 2, createdAt: now, createdBy: "fixture", updatedAt: now, updatedBy: "fixture",
  }));
  store.seedAssignments([
    assignment("cnc-api-access", "cnc-user", ["cnc.read", "cnc.profile.manage"], scope("cnc-api-project"), {}, "org-epv"),
    assignment("cnc-other-access", "other-user", ["cnc.read"], scope("other-project", null, "org-other"), {}, "org-other"),
  ]);
  const clock = () => now;
  const server = await buildServer({
    service: new FoundationService(store, clock, sequentialIds("cnc-api-foundation")),
    operations: new OperationalService(store, clock, sequentialIds("cnc-api-operation")),
    cnc: new CncService(store, clock, sequentialIds("cnc-api")),
    store, authenticator: new DevelopmentAuthenticator(), environment: "test", trainingBanner: false, allowedOrigins: [],
  });
  t.after(() => server.close());

  const unauthenticated = await server.inject({ method: "GET", url: "/v1/projects/cnc-api-project/cnc" });
  assert.equal(unauthenticated.statusCode, 401, unauthenticated.body);

  const invalidProfile = await server.inject({
    method: "POST", url: "/v1/projects/cnc-api-project/cnc-machine-profiles", headers: headers("cnc-user"),
    payload: { workCenterCode: "SAW-01" },
  });
  assert.equal(invalidProfile.statusCode, 400, invalidProfile.body);
  assert.equal(invalidProfile.json().error, "invalid_request");

  const created = await server.inject({
    method: "POST", url: "/v1/projects/cnc-api-project/cnc-machine-profiles", headers: headers("cnc-user"),
    payload: {
      workCenterCode: "SAW-01", revision: "1", parentRevisionId: null, revisionReason: "Initial profile.",
      processTypes: ["saw"], stockFormCodes: ["PIPE"], supportedOperationTypes: ["cut"],
      supportedFeatureCodes: ["STRAIGHT_CUT"], unitCode: "IN", coordinateSystemCode: "XYZ_RIGHT_HAND",
      maximumLength: "240", maximumWidth: "24", maximumThickness: "4", postprocessorName: "Machine-neutral package",
      postprocessorVersion: "1.0", effectiveFrom: "2026-07-01T00:00:00.000Z", effectiveTo: null,
    },
  });
  assert.equal(created.statusCode, 201, created.body);
  assert.equal(created.json().state, "under_review");

  const visible = await server.inject({ method: "GET", url: "/v1/projects/cnc-api-project/cnc", headers: headers("cnc-user") });
  assert.equal(visible.statusCode, 200, visible.body);
  assert.equal(visible.json().machineProfiles.length, 1);
  assert.deepEqual(visible.json().programs, []);
  assert.deepEqual(visible.json().executions, []);

  const otherOrganization = await server.inject({
    method: "GET", url: "/v1/projects/cnc-api-project/cnc", headers: headers("other-user", "org-other"),
  });
  assert.equal(otherOrganization.statusCode, 403, otherOrganization.body);
  assert.equal(otherOrganization.json().error, "forbidden");
  assert.equal("details" in otherOrganization.json(), false);
  const audits = await store.transaction((transaction) => transaction.auditForProject("cnc-api-project"));
  assert.equal(audits.some((item) => item.action === "cnc.profile_submitted"), true);
});
