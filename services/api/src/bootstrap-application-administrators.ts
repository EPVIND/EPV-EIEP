import {
  bootstrapInitialApplicationAdministrators,
  parseApplicationIdentityBootstrapJson,
} from "./domain/application-identity-bootstrap.js";
import { createAzurePostgresAuthentication } from "./domain/azure-postgres-authentication.js";
import { PostgresFoundationStore } from "./domain/postgres-foundation-store.js";

const authorized = process.env.APPLICATION_IDENTITY_BOOTSTRAP_AUTHORIZED?.trim();
if (authorized !== "true") {
  throw new Error("APPLICATION_IDENTITY_BOOTSTRAP_AUTHORIZED=true is required for the one-time bootstrap.");
}

const environment = process.env.EIEP_ENV?.trim();
if (!environment || !["development", "test", "training", "production"].includes(environment)) {
  throw new Error("EIEP_ENV must identify development, test, training, or production.");
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required for the application-identity bootstrap.");
if (process.env.DATABASE_RUNTIME_ROLE?.trim() !== "eiep_runtime") {
  throw new Error("DATABASE_RUNTIME_ROLE=eiep_runtime is required for the application-identity bootstrap.");
}

const authenticationMode = process.env.DATABASE_AUTH_MODE?.trim();
if (authenticationMode !== "connection-string" && authenticationMode !== "azure-managed-identity") {
  throw new Error("DATABASE_AUTH_MODE must be connection-string or azure-managed-identity.");
}
if (environment === "production" && authenticationMode !== "azure-managed-identity") {
  throw new Error("Production application-identity bootstrap requires DATABASE_AUTH_MODE=azure-managed-identity.");
}

const managedIdentityClientId = process.env.AZURE_CLIENT_ID?.trim();
if (authenticationMode === "azure-managed-identity" && !managedIdentityClientId) {
  throw new Error("AZURE_CLIENT_ID is required for Azure managed-identity database authentication.");
}

const oidcIssuer = process.env.OIDC_ISSUER?.trim();
if (!oidcIssuer) throw new Error("OIDC_ISSUER is required for the application-identity bootstrap.");
const bootstrapJson = process.env.APPLICATION_IDENTITY_BOOTSTRAP_JSON;
if (!bootstrapJson) throw new Error("APPLICATION_IDENTITY_BOOTSTRAP_JSON is required.");
const input = parseApplicationIdentityBootstrapJson(bootstrapJson);
if (input.issuer !== oidcIssuer) {
  throw new Error("The bootstrap issuer must exactly match OIDC_ISSUER.");
}

const authentication = authenticationMode === "azure-managed-identity"
  ? createAzurePostgresAuthentication(databaseUrl, managedIdentityClientId!)
  : undefined;
const store = await PostgresFoundationStore.connect(databaseUrl, "eiep_runtime", authentication);
try {
  const result = await bootstrapInitialApplicationAdministrators(store, input);
  process.stdout.write(`${JSON.stringify({
    status: result.status,
    administratorCount: result.administratorCount,
    authorizationReferenceSha256: result.authorizationReferenceSha256,
    effectiveTo: result.effectiveTo.toISOString(),
  })}\n`);
} finally {
  await store.close();
}
