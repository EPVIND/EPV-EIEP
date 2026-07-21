import assert from "node:assert/strict";
import test from "node:test";
import {
  DevelopmentAuthenticator,
  FoundationService,
  InMemoryFoundationStore,
  OperationalService,
  buildServer,
  sensitiveLogPaths,
} from "@eiep/api";
import { assignment, readinessDeclaration, scope, sequentialIds } from "../helpers/foundation-fixture.js";

test("NFR-MNT-004 / AC-10: request correlation propagates to response and durable audit without credentials", async (t) => {
  const store = new InMemoryFoundationStore();
  store.seedAssignments([assignment("correlation-role", "correlation-user", ["project.create"], scope())]);
  const now = () => new Date("2026-07-20T22:00:00.000Z");
  const server = await buildServer({
    service: new FoundationService(store, now, sequentialIds("correlation")),
    operations: new OperationalService(store, now, sequentialIds("operation")),
    store,
    authenticator: new DevelopmentAuthenticator(),
    environment: "test",
    trainingBanner: false,
    allowedOrigins: [],
  });
  t.after(() => server.close());

  const correlationId = "trace-01HTESTCONTROLLED";
  const response = await server.inject({
    method: "POST",
    url: "/v1/projects",
    headers: {
      "x-correlation-id": correlationId,
      "x-eiep-user-id": "correlation-user",
      "x-eiep-organization-id": "org-epv",
      "x-eiep-assurance": "mfa",
    },
    payload: {
      businessScopeOrganizationId: "org-epv",
      number: "TRACE-001",
      name: "Correlation evidence",
      customerOrganizationId: "org-customer",
      facilityId: "facility-1",
      timeZone: "UTC",
      readiness: readinessDeclaration,
    },
  });

  assert.equal(response.statusCode, 201, response.body);
  assert.equal(response.headers["x-correlation-id"], correlationId);
  const events = store.snapshot().audits;
  assert.equal(events.length, 1);
  assert.equal(events[0]?.correlationId, correlationId);
  assert.equal(JSON.stringify(events).includes("authorization"), false);
  assert.ok(sensitiveLogPaths.includes("req.headers.authorization"));
  assert.ok(sensitiveLogPaths.includes("req.headers.cookie"));
});
