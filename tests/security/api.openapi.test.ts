import assert from "node:assert/strict";
import test from "node:test";
import {
  DevelopmentAuthenticator,
  FoundationService,
  InMemoryFoundationStore,
  OperationalService,
  buildServer,
} from "@eiep/api";

interface OpenApiOperation {
  readonly operationId?: string;
  readonly security?: readonly Readonly<Record<string, readonly string[]>>[];
  readonly requestBody?: unknown;
  readonly responses?: Readonly<Record<string, unknown>>;
}

test("NFR-MNT-001 / AC-01-10: the versioned OpenAPI contract inventories and secures every active v1 operation", async (t) => {
  const store = new InMemoryFoundationStore();
  const server = await buildServer({
    service: new FoundationService(store), operations: new OperationalService(store), store,
    authenticator: new DevelopmentAuthenticator(), environment: "test", trainingBanner: false,
    allowedOrigins: [],
  });
  t.after(() => server.close());

  const response = await server.inject({ method: "GET", url: "/openapi.json" });
  assert.equal(response.statusCode, 200, response.body);
  assert.match(response.headers["content-type"] ?? "", /application\/json/u);
  const specification = response.json() as {
    readonly openapi: string;
    readonly info: { readonly version: string };
    readonly paths: Readonly<Record<string, Readonly<Record<string, OpenApiOperation>>>>;
    readonly components: {
      readonly securitySchemes: Readonly<Record<string, unknown>>;
      readonly schemas: Readonly<Record<string, { readonly title?: string }>>;
    };
  };
  assert.equal(specification.openapi, "3.0.3");
  assert.equal(specification.info.version, "1.0.0-local-review");
  assert.ok(specification.components.securitySchemes.bearerAuth);
  assert.equal("/metrics" in specification.paths, false);
  assert.equal("/openapi.json" in specification.paths, false);

  const operations = Object.entries(specification.paths)
    .filter(([path]) => path.startsWith("/v1"))
    .flatMap(([path, methods]) => Object.entries(methods)
      .filter(([method]) => ["get", "post", "put", "patch", "delete"].includes(method))
      .map(([method, operation]) => ({ path, method, operation })));
  assert.ok(operations.length >= 70, `Expected at least 70 controlled v1 operations, received ${operations.length}.`);
  const operationIds = operations.map(({ operation }) => operation.operationId);
  assert.ok(operationIds.every((operationId) => typeof operationId === "string" && operationId.length > 3));
  assert.equal(new Set(operationIds).size, operationIds.length, "OpenAPI operation IDs must be stable and unique.");
  assert.ok(operations.every(({ operation }) => operation.security?.some((entry) => "bearerAuth" in entry)));
  assert.ok(operations.filter(({ operation }) => operation.requestBody).length >= 80,
    "Typed state-changing routes must publish generated request-body schemas.");
  assert.ok(operations.every(({ operation }) => operation.responses?.["401"] && operation.responses["500"]),
    "Every controlled operation must publish shared authentication and safe-failure responses.");
  assert.ok(Object.values(specification.components.schemas).some((schema) => schema.title === "ErrorResponse"));
  assert.equal(JSON.stringify(specification).includes("training-demo"), false);
  assert.equal(JSON.stringify(specification).includes("source-intake"), false);

  const invalid = await server.inject({
    method: "POST", url: "/v1/identity/accounts", payload: { displayName: "incomplete" },
  });
  assert.equal(invalid.statusCode, 400, invalid.body);
  assert.equal(invalid.json().error, "invalid_request");
});
