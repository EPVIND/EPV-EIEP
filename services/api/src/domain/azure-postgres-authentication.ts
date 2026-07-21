import { ManagedIdentityCredential } from "@azure/identity";

export const azurePostgresTokenScope = "https://ossrdbms-aad.database.windows.net/.default";

export interface AzurePostgresTokenCredential {
  getToken(scope: string): Promise<{ readonly token: string } | null>;
}

export interface PostgresConnectionAuthentication {
  readonly password: () => Promise<string>;
  readonly requireTls: true;
}

function validatePasswordlessConnectionString(connectionString: string): void {
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error("The Azure PostgreSQL connection string is invalid.");
  }
  if (!(["postgres:", "postgresql:"] as const).includes(parsed.protocol as "postgres:" | "postgresql:")) {
    throw new Error("The Azure PostgreSQL connection string must use the PostgreSQL protocol.");
  }
  if (!parsed.hostname || !parsed.username || parsed.pathname.length <= 1) {
    throw new Error("The Azure PostgreSQL connection string requires a host, managed-identity role, and database.");
  }
  if (parsed.password) {
    throw new Error("Managed-identity PostgreSQL connection strings cannot contain a password.");
  }
  const conflictingTlsParameters = ["sslmode", "sslcert", "sslkey", "sslrootcert"]
    .filter((parameter) => parsed.searchParams.has(parameter));
  if (conflictingTlsParameters.length > 0) {
    throw new Error("Azure PostgreSQL TLS is configured by the runtime and cannot be overridden in DATABASE_URL.");
  }
}

export function createAzurePostgresAuthentication(
  connectionString: string,
  managedIdentityClientId: string,
  credential?: AzurePostgresTokenCredential,
): PostgresConnectionAuthentication {
  validatePasswordlessConnectionString(connectionString);
  const clientId = managedIdentityClientId.trim();
  if (!clientId) throw new Error("A user-assigned managed-identity client ID is required for Azure PostgreSQL.");
  const tokenCredential = credential ?? new ManagedIdentityCredential(clientId);
  return {
    requireTls: true,
    password: async () => {
      const accessToken = await tokenCredential.getToken(azurePostgresTokenScope);
      if (!accessToken?.token.trim()) throw new Error("Azure PostgreSQL managed-identity token acquisition failed.");
      return accessToken.token;
    },
  };
}
