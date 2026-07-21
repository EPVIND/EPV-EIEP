import assert from "node:assert/strict";
import test from "node:test";
import {
  DevelopmentAuthenticator,
  FoundationService,
  InMemoryFoundationStore,
  OperationalService,
  buildServer,
} from "@eiep/api";

test("NFR-MNT-001, NFR-MNT-004 / AC-10: metrics are bounded, low-cardinality, and secret protected", async (t) => {
  const store = new InMemoryFoundationStore();
  const token = "local-metrics-token-with-more-than-32-characters";
  const server = await buildServer({
    service: new FoundationService(store), operations: new OperationalService(store), store,
    authenticator: new DevelopmentAuthenticator(), environment: "test", trainingBanner: false,
    allowedOrigins: [], metricsToken: token,
  });
  t.after(() => server.close());

  assert.equal((await server.inject({ method: "GET", url: "/metrics" })).statusCode, 404);
  await server.inject({ method: "GET", url: "/health", headers: { "x-correlation-id": "must-not-be-a-label" } });
  const response = await server.inject({ method: "GET", url: "/metrics", headers: { "x-eiep-metrics-token": token } });
  assert.equal(response.statusCode, 200, response.body);
  assert.match(response.headers["content-type"] ?? "", /application\/openmetrics-text/);
  assert.match(response.body, /eiep_http_requests_total\{method="GET",status_class="2xx"\} 1/);
  assert.match(response.body, /eiep_http_request_duration_seconds_count 2/);
  assert.doesNotMatch(response.body, /must-not-be-a-label|correlation|user|organization|route=/iu);
});
