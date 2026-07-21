import assert from "node:assert/strict";
import test from "node:test";
import {
  DevelopmentAuthenticator,
  EstimatingService,
  FoundationService,
  InMemoryFoundationStore,
  OperationalService,
  buildServer,
} from "@eiep/api";
import { assignment, scope, sequentialIds } from "../helpers/foundation-fixture.js";

const headers = (userId: string, organizationId = "org-epv") => ({
  "x-eiep-user-id": userId,
  "x-eiep-organization-id": organizationId,
  "x-eiep-assurance": "mfa",
});

test("FR-EST-001, FR-EST-008 / AC-02, AC-03, AC-11: estimating API authenticates, scopes list/detail, and audits creation", async (t) => {
  const store = new InMemoryFoundationStore();
  store.seedAssignments([
    assignment(
      "estimator-access", "estimator", ["estimate.create", "estimate.read", "estimate.edit"],
      scope(null, null, "org-epv"), {}, "org-epv",
    ),
    assignment(
      "other-org-access", "other-estimator", ["estimate.read"],
      scope(null, null, "org-other"), {}, "org-other",
    ),
  ]);
  const clock = () => new Date("2026-07-21T12:00:00.000Z");
  const service = new FoundationService(store, clock, sequentialIds("api-estimate-foundation"));
  const operations = new OperationalService(store, clock, sequentialIds("api-estimate-operation"));
  const estimating = new EstimatingService(store, clock, sequentialIds("api-estimate"));
  const server = await buildServer({
    service, operations, estimating, store, authenticator: new DevelopmentAuthenticator(),
    environment: "test", trainingBanner: false, allowedOrigins: [],
  });
  t.after(() => server.close());

  const unauthenticated = await server.inject({ method: "GET", url: "/v1/estimates" });
  assert.equal(unauthenticated.statusCode, 401, unauthenticated.body);

  const created = await server.inject({
    method: "POST", url: "/v1/estimates", headers: headers("estimator"),
    payload: {
      businessScopeOrganizationId: "org-epv", number: "EST-API-001", name: "API controlled estimate",
      customerOrganizationId: "org-customer", facilityId: "facility-1", opportunityReference: "RFQ-101",
      scopeStatement: "Piping fabrication and field installation.", dueAt: "2026-08-15T17:00:00.000Z",
      originatingTimeZone: "America/Denver", currency: "USD", basisReferences: ["RFQ-101-REV-0"],
      initialRevision: "A", assumptions: ["Single shift"], exclusions: ["Owner testing"], alternates: [],
      contingencyPercent: "5", escalationPercent: "2", markupPercent: "10", taxPercent: "8",
    },
  });
  assert.equal(created.statusCode, 201, created.body);
  const estimateId = created.json().estimate.id as string;

  const visible = await server.inject({ method: "GET", url: "/v1/estimates", headers: headers("estimator") });
  assert.equal(visible.statusCode, 200, visible.body);
  assert.deepEqual(visible.json().map((estimate: { id: string }) => estimate.id), [estimateId]);

  const otherOrganizationList = await server.inject({
    method: "GET", url: "/v1/estimates", headers: headers("other-estimator", "org-other"),
  });
  assert.equal(otherOrganizationList.statusCode, 200, otherOrganizationList.body);
  assert.deepEqual(otherOrganizationList.json(), []);

  const otherOrganizationDetail = await server.inject({
    method: "GET", url: `/v1/estimates/${estimateId}`, headers: headers("other-estimator", "org-other"),
  });
  assert.equal(otherOrganizationDetail.statusCode, 403, otherOrganizationDetail.body);
  assert.equal(otherOrganizationDetail.json().error, "forbidden");
  assert.equal("details" in otherOrganizationDetail.json(), false);

  const audits = store.snapshot().audits.filter((audit) => audit.objectId === estimateId);
  assert.deepEqual(audits.map((audit) => audit.action), ["estimate.created"]);
  assert.equal(audits[0]?.actorUserId, "estimator");
});
