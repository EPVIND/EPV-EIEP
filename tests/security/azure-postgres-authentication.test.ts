import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import {
  azurePostgresTokenScope,
  createAzurePostgresAuthentication,
  loadRuntimeConfig,
  type AzurePostgresTokenCredential,
} from "@eiep/api";

const execute = promisify(execFile);

test("NFR-SEC-002-003 / AC-01-10: Azure PostgreSQL uses a fresh managed-identity token as the dynamic password", async () => {
  const requestedScopes: string[] = [];
  const credential: AzurePostgresTokenCredential = {
    getToken: async (scope) => {
      requestedScopes.push(scope);
      return { token: `token-${requestedScopes.length}` };
    },
  };
  const authentication = createAzurePostgresAuthentication(
    "postgresql://eiep-api@server.internal/eiep",
    "managed-identity-client-id",
    credential,
  );

  assert.equal(authentication.requireTls, true);
  assert.equal(await authentication.password(), "token-1");
  assert.equal(await authentication.password(), "token-2");
  assert.deepEqual(requestedScopes, [azurePostgresTokenScope, azurePostgresTokenScope]);
});

test("NFR-SEC-002-003 / AC-01-10: managed-identity database authentication fails closed", async () => {
  assert.throws(
    () => createAzurePostgresAuthentication(
      "postgresql://eiep-api:static-secret@server.internal/eiep",
      "managed-identity-client-id",
    ),
    /cannot contain a password/u,
  );
  assert.throws(
    () => createAzurePostgresAuthentication(
      "postgresql://eiep-api@server.internal/eiep?sslmode=disable",
      "managed-identity-client-id",
    ),
    /TLS is configured by the runtime/u,
  );
  assert.throws(
    () => createAzurePostgresAuthentication(
      "postgresql://eiep-api@server.internal/eiep",
      " ",
    ),
    /client ID is required/u,
  );

  const missingToken: AzurePostgresTokenCredential = { getToken: async () => null };
  const authentication = createAzurePostgresAuthentication(
    "postgresql://eiep-api@server.internal/eiep",
    "managed-identity-client-id",
    missingToken,
  );
  await assert.rejects(authentication.password(), /token acquisition failed/u);
});

test("NFR-SEC-002-003 / AC-01-10: production configuration requires managed-identity database authentication", async () => {
  const names = [
    "EIEP_ENV", "OIDC_ISSUER", "OIDC_AUDIENCE", "DATABASE_URL", "DATABASE_AUTH_MODE",
    "DATABASE_RUNTIME_ROLE", "CORS_ALLOWED_ORIGINS", "METRICS_TOKEN",
    "AZURE_STORAGE_ACCOUNT_NAME", "AZURE_CLIENT_ID",
  ] as const;
  const prior = new Map(names.map((name) => [name, process.env[name]]));
  Object.assign(process.env, {
    EIEP_ENV: "production",
    OIDC_ISSUER: "https://login.example.test/tenant/v2.0",
    OIDC_AUDIENCE: "api-application-id",
    DATABASE_URL: "postgresql://eiep-api@server.internal/eiep",
    DATABASE_AUTH_MODE: "connection-string",
    DATABASE_RUNTIME_ROLE: "eiep_runtime",
    CORS_ALLOWED_ORIGINS: "https://eiep.example.test",
    METRICS_TOKEN: "a".repeat(32),
    AZURE_STORAGE_ACCOUNT_NAME: "eiepstorage",
    AZURE_CLIENT_ID: "managed-identity-client-id",
  });
  try {
    await assert.rejects(loadRuntimeConfig(), /Production requires DATABASE_AUTH_MODE=azure-managed-identity/u);
    process.env.DATABASE_AUTH_MODE = "azure-managed-identity";
    const config = await loadRuntimeConfig();
    assert.equal(config.databaseAuthentication, "azure-managed-identity");
    const databaseToolProbe = [
      "import { databaseConnectionConfig } from './packages/database/connection.mjs';",
      "databaseConnectionConfig('postgresql://migration@server.internal/eiep');",
    ].join("\n");
    await assert.rejects(
      execute(process.execPath, ["--input-type=module", "--eval", databaseToolProbe], {
        cwd: process.cwd(),
        env: { ...process.env, EIEP_ENV: "production", DATABASE_AUTH_MODE: "connection-string" },
        windowsHide: true,
      }),
      (error: unknown) => error instanceof Error
        && "stderr" in error
        && String(error.stderr).includes("Production database tools require DATABASE_AUTH_MODE=azure-managed-identity"),
    );
  } finally {
    for (const [name, value] of prior) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
