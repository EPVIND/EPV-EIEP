import assert from "node:assert/strict";
import test from "node:test";
import {
  DevelopmentAuthenticator,
  FoundationService,
  InMemoryFoundationStore,
  OperationalService,
  buildServer,
} from "@eiep/api";

async function createServer(rateLimitMax: number) {
  const store = new InMemoryFoundationStore();
  return buildServer({
    service: new FoundationService(store),
    operations: new OperationalService(store),
    store,
    authenticator: new DevelopmentAuthenticator(),
    environment: "test",
    trainingBanner: false,
    allowedOrigins: [],
    rateLimitMax,
  });
}

test("NFR-SEC-003 / AC-10: API bounds request rate without limiting health probes", async (t) => {
  const server = await createServer(2);
  t.after(() => server.close());
  const headers = {
    "x-eiep-user-id": "rate-user",
    "x-eiep-organization-id": "org-epv",
    "x-eiep-assurance": "standard",
    "x-correlation-id": "rate-correlation",
  };
  assert.equal((await server.inject({ method: "GET", url: "/v1/session", headers })).statusCode, 200);
  assert.equal((await server.inject({ method: "GET", url: "/v1/session", headers })).statusCode, 200);
  const limited = await server.inject({ method: "GET", url: "/v1/session", headers });
  assert.equal(limited.statusCode, 429, limited.body);
  assert.equal(limited.json().error, "rate_limit_exceeded");
  assert.equal(limited.json().correlationId, "rate-correlation");
  for (let index = 0; index < 4; index += 1) {
    assert.equal((await server.inject({ method: "GET", url: "/health" })).statusCode, 200);
  }
});

test("NFR-SEC-003 / AC-10: authentication and oversized payload failures use accurate non-leaking status", async (t) => {
  const server = await createServer(100);
  t.after(() => server.close());
  const unauthenticated = await server.inject({ method: "GET", url: "/v1/session" });
  assert.equal(unauthenticated.statusCode, 401);
  assert.deepEqual(Object.keys(unauthenticated.json()).sort(), ["correlationId", "error"]);

  const oversized = await server.inject({
    method: "POST",
    url: "/v1/projects",
    headers: {
      "content-type": "application/json",
      "x-eiep-user-id": "payload-user",
      "x-eiep-organization-id": "org-epv",
      "x-eiep-assurance": "mfa",
    },
    payload: JSON.stringify({ value: "x".repeat(1024 * 1024) }),
  });
  assert.equal(oversized.statusCode, 413, oversized.body);
  assert.equal(oversized.json().error, "payload_too_large");

  const invalidCorrelation = await server.inject({
    method: "GET", url: "/health", headers: { "x-correlation-id": `bad value ${"x".repeat(200)}` },
  });
  const returnedCorrelation = String(invalidCorrelation.headers["x-correlation-id"] ?? "");
  assert.match(returnedCorrelation, /^[0-9a-f-]{36}$/u);
  assert.notEqual(returnedCorrelation, `bad value ${"x".repeat(200)}`);
});
