import pg from "pg";
import { databaseConnectionConfig } from "./connection.mjs";

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function requiredObjectId(name) {
  const value = requiredEnvironment(name);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new Error(`${name} must be a Microsoft Entra object ID.`);
  }
  return value.toLowerCase();
}

if (process.env.DATABASE_AUTH_MODE?.trim() !== "azure-managed-identity") {
  throw new Error("Azure identity bootstrap requires DATABASE_AUTH_MODE=azure-managed-identity.");
}

const connectionString = requiredEnvironment("DATABASE_ADMIN_URL");
const principals = [
  {
    name: requiredEnvironment("API_DATABASE_PRINCIPAL_NAME"),
    objectId: requiredObjectId("API_DATABASE_PRINCIPAL_OBJECT_ID"),
    role: "eiep_runtime",
  },
  {
    name: requiredEnvironment("WORKER_DATABASE_PRINCIPAL_NAME"),
    objectId: requiredObjectId("WORKER_DATABASE_PRINCIPAL_OBJECT_ID"),
    role: "eiep_job_worker",
  },
];
if (principals[0].name === principals[1].name || principals[0].objectId === principals[1].objectId) {
  throw new Error("The API and job worker require distinct managed identities.");
}

const client = new pg.Client(databaseConnectionConfig(connectionString));
try {
  await client.connect();
  const boundary = await client.query(`
    SELECT current_database() AS database_name,
      current_setting('server_version_num')::integer AS server_version_number
  `);
  if (boundary.rows[0]?.database_name !== "postgres") {
    throw new Error("DATABASE_ADMIN_URL must target the postgres administration database.");
  }
  if (boundary.rows[0]?.server_version_number < 180000 || boundary.rows[0]?.server_version_number >= 190000) {
    throw new Error("Azure identity bootstrap requires PostgreSQL 18.x.");
  }
  const applicationRoles = await client.query(
    `SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole
      FROM pg_roles WHERE rolname = ANY($1::text[]) ORDER BY rolname`,
    [["eiep_job_worker", "eiep_runtime"]],
  );
  if (applicationRoles.rows.length !== 2
    || applicationRoles.rows.some((role) => role.rolcanlogin || role.rolsuper || role.rolcreatedb || role.rolcreaterole)) {
    throw new Error("Apply the controlled migrations before mapping Azure managed identities.");
  }

  await client.query("BEGIN");
  try {
    const mapped = await client.query(`
      SELECT rolename::text, principaltype::text, objectid::text, isadmin::integer
      FROM pg_catalog.pgaadauth_list_principals(false)
    `);
    for (const principal of principals) {
      const existing = mapped.rows.find((row) => row.rolename === principal.name);
      if (existing && (existing.principaltype !== "service"
        || String(existing.objectid).toLowerCase() !== principal.objectId || existing.isadmin !== 0)) {
        throw new Error(`Existing Microsoft Entra mapping for ${principal.name} does not match the controlled object ID.`);
      }
      const existingAlias = mapped.rows.find((row) => String(row.objectid).toLowerCase() === principal.objectId);
      if (existingAlias && existingAlias.rolename !== principal.name) {
        throw new Error(`Microsoft Entra object for ${principal.name} is already mapped under another PostgreSQL role.`);
      }
      if (!existing) {
        const localRole = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [principal.name]);
        if (localRole.rowCount) {
          throw new Error(`Existing PostgreSQL role ${principal.name} is not a verified Microsoft Entra principal.`);
        }
        await client.query(
          "SELECT pg_catalog.pgaadauth_create_principal_with_oid($1, $2, 'service', false, false)",
          [principal.name, principal.objectId],
        );
      }
      await client.query(`GRANT ${pg.escapeIdentifier(principal.role)} TO ${pg.escapeIdentifier(principal.name)}`);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  const verifiedMappings = await client.query(`
    SELECT rolename::text, principaltype::text, objectid::text, isadmin::integer
    FROM pg_catalog.pgaadauth_list_principals(false)
  `);
  for (const principal of principals) {
    const mapping = verifiedMappings.rows.find((row) => row.rolename === principal.name);
    if (!mapping || mapping.principaltype !== "service"
      || String(mapping.objectid).toLowerCase() !== principal.objectId || mapping.isadmin !== 0) {
      throw new Error(`Managed identity ${principal.name} failed exact Entra mapping verification.`);
    }
    const membership = await client.query("SELECT pg_has_role($1, $2, 'member') AS member", [principal.name, principal.role]);
    if (membership.rows[0]?.member !== true) throw new Error(`Managed identity ${principal.name} lacks ${principal.role}.`);
  }
  process.stdout.write("Azure PostgreSQL API and job-worker identities mapped to distinct least-privilege roles.\n");
} finally {
  await client.end();
}
