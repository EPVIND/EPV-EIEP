import { randomBytes } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, "..");
const pilotRoot = resolve(repositoryRoot, ".eiep-pilot");
const runtimePath = join(pilotRoot, "runtime.json");
const statusPath = join(pilotRoot, "status.json");
const stopPath = join(pilotRoot, "STOP");
const command = process.argv[2] ?? "status";

function parseOptions() {
  const values = new Map();
  const optionArguments = process.argv.slice(3).filter((value, index) => !(index === 0 && value === "--"));
  for (let index = 0; index < optionArguments.length; index += 2) {
    const name = optionArguments[index];
    const value = optionArguments[index + 1];
    if (!name?.startsWith("--") || !value) throw new Error(`Invalid option near ${name ?? "end of command"}.`);
    values.set(name.slice(2), value);
  }
  return values;
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  if (!port) throw new Error("Unable to reserve a pilot PostgreSQL port.");
  return port;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function pilotWebStatus() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1_500);
  try {
    const response = await fetch("http://127.0.0.1:3200/", { signal: controller.signal });
    const body = response.ok ? await response.text() : "";
    return response.ok && body.includes("<title>EIEP</title>") && body.includes("/src/main.tsx")
      ? "ok"
      : "unexpected_response";
  } catch {
    return "unreachable";
  } finally {
    clearTimeout(timeout);
  }
}

async function openLog(path) {
  const stream = createWriteStream(path, { flags: "a" });
  await once(stream, "open");
  return stream;
}

function processIsRunning(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function reportStatus() {
  if (!await exists(statusPath)) {
    process.stdout.write(`${JSON.stringify({ state: "stopped", pilotRoot }, null, 2)}\n`);
    return;
  }
  const status = await readJson(statusPath);
  let health = null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1_500);
  try {
    const response = await fetch("http://127.0.0.1:3100/health", { signal: controller.signal });
    health = response.ok ? await response.json() : { status: response.status };
  } catch {
    health = { status: "unreachable" };
  } finally {
    clearTimeout(timeout);
  }
  process.stdout.write(`${JSON.stringify({
    ...status,
    supervisorRunning: processIsRunning(status.supervisorPid),
    health,
    web: { status: await pilotWebStatus(), managed: Boolean(status.webManaged), pid: status.webPid ?? null },
  }, null, 2)}\n`);
}

if (command === "status") {
  await reportStatus();
} else if (command === "stop") {
  await mkdir(pilotRoot, { recursive: true });
  await writeFile(stopPath, `${new Date().toISOString()}\n`, "utf8");
  process.stdout.write("Local pilot stop requested.\n");
} else {
if (command !== "run") throw new Error("Use run, status, or stop.");
const options = parseOptions();
await mkdir(join(pilotRoot, "logs"), { recursive: true });
await mkdir(join(pilotRoot, "files"), { recursive: true });
await rm(stopPath, { force: true });

if (await exists(statusPath)) {
  const current = await readJson(statusPath);
  if (processIsRunning(current.supervisorPid)) throw new Error("The local pilot runtime is already running.");
  await rm(statusPath, { force: true });
}

let runtime;
if (await exists(runtimePath)) {
  runtime = await readJson(runtimePath);
} else {
  const manifestPath = resolve(options.get("manifest") ?? "");
  const manifestSha256 = options.get("sha256")?.trim().toLowerCase();
  if (!manifestPath || !/^[0-9a-f]{64}$/u.test(manifestSha256 ?? "")) {
    throw new Error("First start requires --manifest and --sha256.");
  }
  runtime = {
    version: 1,
    initialized: false,
    postgresPort: await reservePort(),
    databaseUser: "eiep_pilot_owner",
    databaseName: "eiep_pilot",
    databasePassword: randomBytes(32).toString("base64url"),
    manifestPath,
    manifestSha256,
  };
  await writeFile(runtimePath, `${JSON.stringify(runtime, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
}

if (runtime.version !== 1 || !Number.isInteger(runtime.postgresPort) || !runtime.databasePassword
  || !runtime.manifestPath || !/^[0-9a-f]{64}$/u.test(runtime.manifestSha256)) {
  throw new Error("The local pilot runtime configuration is invalid.");
}

const manifest = await readJson(runtime.manifestPath);
const worker = manifest.users?.find((user) => user.qualificationCodes?.includes("integration_worker"));
if (!worker?.userAccountId || manifest.businessScopeOrganizationId == null) {
  throw new Error("The pilot manifest has no controlled worker identity or organization.");
}
const pilotIdentityProfiles = manifest.users
  .filter((user) => !user.qualificationCodes?.includes("integration_worker"))
  .map((user) => ({
    displayName: user.displayName,
    userId: user.userAccountId,
    organizationId: manifest.businessScopeOrganizationId,
  }));

const { default: EmbeddedPostgres } = await import("embedded-postgres");

const database = new EmbeddedPostgres({
  databaseDir: join(pilotRoot, "postgres"),
  user: runtime.databaseUser,
  password: runtime.databasePassword,
  port: runtime.postgresPort,
  persistent: true,
  authMethod: "scram-sha-256",
  postgresFlags: ["-c", "listen_addresses=127.0.0.1"],
  onLog: () => {},
  onError: (message) => process.stderr.write(`${String(message)}\n`),
});

const children = [];
let shuttingDown = false;
async function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try { child.kill(); } catch { /* Child already stopped. */ }
  }
  await Promise.all(children.map((child) => new Promise((resolveExit) => {
    if (child.exitCode !== null) resolveExit();
    else {
      const timer = setTimeout(resolveExit, 5_000);
      child.once("exit", () => { clearTimeout(timer); resolveExit(); });
    }
  })));
  try { await database.stop(); } catch { /* Preserve shutdown progress. */ }
  await rm(statusPath, { force: true });
  process.stdout.write(`${JSON.stringify({ level: "info", event: "local_pilot_stopped", reason })}\n`);
}

process.once("SIGINT", () => void shutdown("SIGINT").finally(() => process.exit(0)));
process.once("SIGTERM", () => void shutdown("SIGTERM").finally(() => process.exit(0)));

try {
  if (!runtime.initialized) await database.initialise();
  await database.start();
  if (!runtime.initialized) {
    await database.createDatabase(runtime.databaseName);
    runtime = { ...runtime, initialized: true };
    await writeFile(runtimePath, `${JSON.stringify(runtime, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  }

  const databaseUrl = `postgresql://${runtime.databaseUser}:${encodeURIComponent(runtime.databasePassword)}@127.0.0.1:${runtime.postgresPort}/${runtime.databaseName}`;
  const migration = await execFileAsync(process.execPath, [resolve(repositoryRoot, "packages/database/migrate.mjs")], {
    cwd: repositoryRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    maxBuffer: 10 * 1024 * 1024,
  });
  if (migration.stdout) process.stdout.write(migration.stdout);

  const configRoot = join(pilotRoot, "config");
  const environmentPath = join(configRoot, "config", "environments", "development.json");
  await mkdir(dirname(environmentPath), { recursive: true });
  await writeFile(environmentPath, `${JSON.stringify({
    environment: "development",
    authentication: "development",
    dataStore: "postgres",
    trainingBanner: false,
    allowSyntheticData: true,
    allowProductionData: false,
  }, null, 2)}\n`, "utf8");

  const commonEnvironment = {
    ...process.env,
    EIEP_ENV: "development",
    DATABASE_URL: databaseUrl,
    DATABASE_AUTH_MODE: "connection-string",
  };
  const tsxCli = resolve(repositoryRoot, "node_modules/tsx/dist/cli.mjs");
  const apiLog = await openLog(join(pilotRoot, "logs", "api.log"));
  const api = spawn(process.execPath, [tsxCli, "--conditions=development", resolve(repositoryRoot, "services/api/src/main.ts")], {
    cwd: repositoryRoot,
    env: {
      ...commonEnvironment,
      EIEP_CONFIG_ROOT: configRoot,
      DATABASE_RUNTIME_ROLE: "eiep_runtime",
      EIEP_LOCAL_PILOT_BOOTSTRAP_FILE: runtime.manifestPath,
      EIEP_LOCAL_PILOT_BOOTSTRAP_SHA256: runtime.manifestSha256,
      FILE_STORAGE_ROOT: join(pilotRoot, "files"),
      PORT: "3100",
    },
    stdio: ["ignore", apiLog, apiLog],
    windowsHide: true,
  });
  children.push(api);

  const healthDeadline = Date.now() + 60_000;
  let health = null;
  while (Date.now() < healthDeadline) {
    if (api.exitCode !== null) throw new Error(`The local pilot API exited with code ${api.exitCode}.`);
    try {
      const response = await fetch("http://127.0.0.1:3100/health", { signal: AbortSignal.timeout(1_000) });
      if (response.ok) { health = await response.json(); break; }
    } catch { /* Continue bounded readiness polling. */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  if (!health) throw new Error("The local pilot API did not become healthy within 60 seconds.");

  const workerLog = await openLog(join(pilotRoot, "logs", "worker.log"));
  const jobWorker = spawn(process.execPath, [tsxCli, "--conditions=development", resolve(repositoryRoot, "services/job-worker/src/main.ts")], {
    cwd: repositoryRoot,
    env: {
      ...commonEnvironment,
      DATABASE_RUNTIME_ROLE: "eiep_job_worker",
      WORKER_USER_ID: worker.userAccountId,
      WORKER_ORGANIZATION_ID: manifest.businessScopeOrganizationId,
      WORKER_POLL_INTERVAL_MS: "5000",
    },
    stdio: ["ignore", workerLog, workerLog],
    windowsHide: true,
  });
  children.push(jobWorker);

  let web = null;
  let webManaged = false;
  const currentWebStatus = await pilotWebStatus();
  if (currentWebStatus === "unexpected_response") {
    throw new Error("Port 3200 is occupied by a server that is not the EIEP local development UI.");
  }
  if (currentWebStatus === "unreachable") {
    const webLog = await openLog(join(pilotRoot, "logs", "web.log"));
    const viteCli = resolve(repositoryRoot, "apps/web/node_modules/vite/bin/vite.js");
    web = spawn(process.execPath, [viteCli, "--host", "127.0.0.1", "--port", "3200", "--strictPort"], {
      cwd: resolve(repositoryRoot, "apps/web"),
      env: {
        ...process.env,
        VITE_API_BASE_URL: "/api",
        VITE_LOCAL_PILOT_IDENTITIES: JSON.stringify(pilotIdentityProfiles),
      },
      stdio: ["ignore", webLog, webLog],
      windowsHide: true,
    });
    children.push(web);
    webManaged = true;
    const webDeadline = Date.now() + 30_000;
    while (Date.now() < webDeadline && await pilotWebStatus() !== "ok") {
      if (web.exitCode !== null) throw new Error(`The local pilot web UI exited with code ${web.exitCode}.`);
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
    if (await pilotWebStatus() !== "ok") throw new Error("The local pilot web UI did not become ready within 30 seconds.");
  }

  const status = {
    state: "running",
    supervisorPid: process.pid,
    apiPid: api.pid,
    workerPid: jobWorker.pid,
    webPid: web?.pid ?? null,
    webManaged,
    apiUrl: "http://127.0.0.1:3100",
    webUrl: "http://127.0.0.1:3200",
    postgresPort: runtime.postgresPort,
    manifestSha256: runtime.manifestSha256,
    startedAt: new Date().toISOString(),
    health,
  };
  await writeFile(statusPath, `${JSON.stringify(status, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ level: "info", event: "local_pilot_started", ...status })}\n`);

  while (!shuttingDown) {
    if (await exists(stopPath)) break;
    if (api.exitCode !== null || jobWorker.exitCode !== null || (webManaged && web?.exitCode !== null)) {
      throw new Error(`A pilot process exited unexpectedly (api=${api.exitCode}, worker=${jobWorker.exitCode}, web=${web?.exitCode ?? "external"}).`);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
  }
  await shutdown(await exists(stopPath) ? "stop_requested" : "shutdown");
} catch (error) {
  await shutdown("startup_or_runtime_error");
  throw error;
}
}
