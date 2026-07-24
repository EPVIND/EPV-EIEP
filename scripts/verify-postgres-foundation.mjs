import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import EmbeddedPostgres from "embedded-postgres";

const execFileAsync = promisify(execFile);

async function reservePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  if (!port) throw new Error("Unable to reserve a local PostgreSQL verification port.");
  return port;
}

const root = await mkdtemp(join(tmpdir(), "eiep-postgres-"));
const password = randomBytes(32).toString("base64url");
const user = "eiep_verify";
const databaseName = "eiep_verify";
const port = await reservePort();
const database = new EmbeddedPostgres({
  databaseDir: join(root, "data"),
  user,
  password,
  port,
  persistent: false,
  authMethod: "scram-sha-256",
  postgresFlags: ["-c", "listen_addresses=127.0.0.1"],
  onLog: () => {},
  onError: (message) => process.stderr.write(`${String(message)}\n`),
});

try {
  await database.initialise();
  await database.start();
  await database.createDatabase(databaseName);

  const connection = `postgresql://${user}:${encodeURIComponent(password)}@127.0.0.1:${port}/${databaseName}`;
  const environment = { ...process.env, DATABASE_URL: connection };
  const migrationRunner = resolve("packages/database/migrate.mjs");
  const foundationVerifier = resolve("packages/database/verify-foundation.mjs");
  const repositoryVerifier = resolve("tests/postgres/repository.integration.ts");
  const tsxCli = resolve("node_modules/tsx/dist/cli.mjs");

  const migration = await execFileAsync(process.execPath, [migrationRunner], { env: environment });
  process.stdout.write(migration.stdout);
  const status = await execFileAsync(process.execPath, [migrationRunner, "--status"], { env: environment });
  process.stdout.write(status.stdout);
  const verification = await execFileAsync(process.execPath, [foundationVerifier], { env: environment });
  process.stdout.write(verification.stdout);
  const repositoryVerification = await execFileAsync(
    process.execPath,
    [tsxCli, "--conditions=development", repositoryVerifier],
    { env: environment },
  );
  process.stdout.write(repositoryVerification.stdout);
} finally {
  try {
    await database.stop();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
