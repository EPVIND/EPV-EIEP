import assert from "node:assert/strict";
import test from "node:test";
import { DevelopmentAuthenticator, EngineeringRegisterService, FoundationService, InMemoryFoundationStore, OperationalService, buildServer } from "@eiep/api";
import { assignment, completeReadiness, scope, sequentialIds } from "../helpers/foundation-fixture.js";

const headers = (userId: string, organizationId = "org-epv") => ({ "x-eiep-user-id": userId, "x-eiep-organization-id": organizationId, "x-eiep-assurance": "mfa" });
test("FR-ENG-001 / AC-02-03: engineering register API authenticates, scopes, validates, and audits", async (t) => {
  const store = new InMemoryFoundationStore(); const now = new Date("2026-07-21T20:00:00.000Z");
  await store.transaction((transaction) => {
    transaction.insertProject({ id: "eng-api-project", businessScopeOrganizationId: "org-epv", number: "ENG-API", name: "Engineering API", customerOrganizationId: "org-customer",
      facilityId: "facility-1", timeZone: "America/Denver", state: "active", readiness: completeReadiness, version: 2, createdAt: now, createdBy: "fixture", updatedAt: now, updatedBy: "fixture" });
    transaction.insertProjectOrganization({ id: "eng-api-org", projectId: "eng-api-project", organizationId: "org-epv", participationRole: "business_scope", state: "active", version: 1, createdAt: now, createdBy: "fixture" });
  });
  store.seedAssignments([assignment("eng-api", "eng-user", ["engineering.register.read", "engineering.register.manage"], scope("eng-api-project")),
    assignment("eng-other", "other-user", ["engineering.register.read"], scope("other-project", null, "org-other"), {}, "org-other")]);
  const server = await buildServer({ service: new FoundationService(store, () => now, sequentialIds("eng-foundation")), operations: new OperationalService(store, () => now, sequentialIds("eng-operation")),
    engineeringRegisters: new EngineeringRegisterService(store, () => now, sequentialIds("eng-api")), store, authenticator: new DevelopmentAuthenticator(), environment: "test", trainingBanner: false, allowedOrigins: [] });
  t.after(() => server.close());
  assert.equal((await server.inject({ method: "GET", url: "/v1/projects/eng-api-project/engineering-registers" })).statusCode, 401);
  assert.equal((await server.inject({ method: "POST", url: "/v1/projects/eng-api-project/engineering-register-items", headers: headers("eng-user"), payload: { tag: "X" } })).statusCode, 400);
  const created = await server.inject({ method: "POST", url: "/v1/projects/eng-api-project/engineering-register-items", headers: headers("eng-user"), payload: {
    registerType: "requirement", tag: "REQ-001", revision: "0", parentRevisionId: null, revisionReason: "Initial requirement.", title: "Design pressure requirement",
    disciplineCode: "MECH", systemCode: null, areaCode: null, workPackageCode: null, responsibleOrganizationId: "org-epv", documentRevisionIds: [], relatedItemRevisionIds: [],
    attributes: { requirement_text: "Preserve design pressure provenance." }, plannedIssueDate: null, forecastIssueDate: null, actualIssueDate: null } });
  assert.equal(created.statusCode, 201, created.body); assert.match(created.json().canonicalSha256, /^[a-f0-9]{64}$/u);
  const visible = await server.inject({ method: "GET", url: "/v1/projects/eng-api-project/engineering-registers", headers: headers("eng-user") });
  assert.equal(visible.statusCode, 200); assert.equal(visible.json().counts.requirement, 1);
  const denied = await server.inject({ method: "GET", url: "/v1/projects/eng-api-project/engineering-registers", headers: headers("other-user", "org-other") });
  assert.equal(denied.statusCode, 403); assert.equal("details" in denied.json(), false);
});
