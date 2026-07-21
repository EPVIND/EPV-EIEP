import assert from "node:assert/strict";
import test from "node:test";
import {
  DevelopmentAuthenticator,
  FoundationService,
  InMemoryFoundationStore,
  OperationalService,
  buildServer,
} from "@eiep/api";

async function serverFor(environment: string) {
  const store = new InMemoryFoundationStore();
  return buildServer({
    service: new FoundationService(store),
    operations: new OperationalService(store),
    store,
    authenticator: new DevelopmentAuthenticator(),
    environment,
    trainingBanner: false,
    allowedOrigins: [],
  });
}

test("NFR-SEC-001 / AC-10: production rejects plaintext transport and emits strict transport policy", async (t) => {
  const server = await serverFor("production");
  t.after(() => server.close());

  const plaintext = await server.inject({ method: "GET", url: "/health" });
  assert.equal(plaintext.statusCode, 426);
  assert.equal(plaintext.json().error, "https_required");

  const protectedRequest = await server.inject({
    method: "GET",
    url: "/health",
    headers: { "x-forwarded-proto": "https" },
  });
  assert.equal(protectedRequest.statusCode, 200, protectedRequest.body);
  assert.equal(protectedRequest.headers["strict-transport-security"], "max-age=31536000; includeSubDomains");
  assert.equal(protectedRequest.headers["x-content-type-options"], "nosniff");
  assert.equal(protectedRequest.headers["x-frame-options"], "DENY");
  assert.equal(protectedRequest.headers["referrer-policy"], "no-referrer");
  assert.match(String(protectedRequest.headers["content-security-policy"]), /frame-ancestors 'none'/u);
});

test("NFR-SEC-001 / AC-10: nonproduction does not claim HSTS while retaining safe response headers", async (t) => {
  const server = await serverFor("test");
  t.after(() => server.close());
  const response = await server.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["strict-transport-security"], undefined);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.match(String(response.headers["permissions-policy"]), /camera=\(\)/u);
});
