import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { databaseConnectionConfig } from "./connection.mjs";

const migrationDirectory = join(dirname(fileURLToPath(import.meta.url)), "migrations");
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required. Supply it through protected environment configuration.");
}

const pool = new pg.Pool(databaseConnectionConfig(connectionString));

async function ensureLedger(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.eiep_schema_migration (
      name text PRIMARY KEY,
      sha256 text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function loadMigrations() {
  const names = (await readdir(migrationDirectory))
    .filter((name) => name.endsWith(".up.sql"))
    .sort((left, right) => left.localeCompare(right));
  return Promise.all(
    names.map(async (name) => {
      const sql = await readFile(join(migrationDirectory, name), "utf8");
      return { name, sql, sha256: createHash("sha256").update(sql).digest("hex") };
    }),
  );
}

async function main() {
  const client = await pool.connect();
  try {
    await ensureLedger(client);
    const migrations = await loadMigrations();
    const appliedResult = await client.query("SELECT name, sha256 FROM public.eiep_schema_migration ORDER BY name");
    const applied = new Map(appliedResult.rows.map((row) => [row.name, row.sha256]));

    for (const migration of migrations) {
      const recordedHash = applied.get(migration.name);
      if (recordedHash && recordedHash !== migration.sha256) {
        throw new Error(`Applied migration checksum changed: ${migration.name}`);
      }
    }

    if (process.argv.includes("--status")) {
      for (const migration of migrations) {
        process.stdout.write(`${applied.has(migration.name) ? "applied" : "pending"} ${migration.name}\n`);
      }
      return;
    }

    for (const migration of migrations) {
      if (applied.has(migration.name)) continue;
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO public.eiep_schema_migration (name, sha256) VALUES ($1, $2)",
          [migration.name, migration.sha256],
        );
        await client.query("COMMIT");
        process.stdout.write(`applied ${migration.name}\n`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

await main();
