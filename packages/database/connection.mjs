import { DefaultAzureCredential } from "@azure/identity";

const azurePostgresTokenScope = "https://ossrdbms-aad.database.windows.net/.default";

function validatePasswordlessConnectionString(connectionString) {
  let parsed;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error("The Azure PostgreSQL connection string is invalid.");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("The Azure PostgreSQL connection string must use the PostgreSQL protocol.");
  }
  if (!parsed.hostname || !parsed.username || parsed.pathname.length <= 1) {
    throw new Error("The Azure PostgreSQL connection string requires a host, managed-identity role, and database.");
  }
  if (parsed.password) throw new Error("Managed-identity PostgreSQL connection strings cannot contain a password.");
  if (["sslmode", "sslcert", "sslkey", "sslrootcert"].some((parameter) => parsed.searchParams.has(parameter))) {
    throw new Error("Azure PostgreSQL TLS is configured by the runtime and cannot be overridden in DATABASE_URL.");
  }
}

export function databaseConnectionConfig(connectionString) {
  const authenticationMode = process.env.DATABASE_AUTH_MODE?.trim() || "connection-string";
  if (authenticationMode === "connection-string") {
    if (process.env.EIEP_ENV?.trim() === "production") {
      throw new Error("Production database tools require DATABASE_AUTH_MODE=azure-managed-identity.");
    }
    return { connectionString };
  }
  if (authenticationMode !== "azure-managed-identity") {
    throw new Error("DATABASE_AUTH_MODE must be connection-string or azure-managed-identity.");
  }
  validatePasswordlessConnectionString(connectionString);
  const managedIdentityClientId = process.env.AZURE_CLIENT_ID?.trim();
  const credential = new DefaultAzureCredential(managedIdentityClientId ? { managedIdentityClientId } : {});
  return {
    connectionString,
    password: async () => {
      const accessToken = await credential.getToken(azurePostgresTokenScope);
      if (!accessToken?.token.trim()) throw new Error("Azure PostgreSQL managed-identity token acquisition failed.");
      return accessToken.token;
    },
    ssl: { rejectUnauthorized: true },
  };
}
