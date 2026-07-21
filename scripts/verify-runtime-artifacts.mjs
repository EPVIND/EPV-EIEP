import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const root = process.cwd();

async function availablePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to reserve a runtime smoke-test port.");
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return address.port;
}

function capture(child) {
  let stdout = "";
  let stderr = "";
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(-32_768); });
  child.stderr?.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-32_768); });
  return { stdout: () => stdout, stderr: () => stderr };
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const timeout = delay(2_000, "timeout", { ref: false });
  if (await Promise.race([exited.then(() => "exited"), timeout]) === "timeout") {
    child.kill("SIGKILL");
    await once(child, "exit");
  }
}

for (const artifact of [
  "services/api/dist/index.js",
  "services/job-worker/dist/index.js",
  "services/document-processing/dist/index.js",
  "services/integration/dist/index.js",
  "services/turnover-renderer/dist/index.js",
  "services/recovery/dist/index.js",
  "packages/rules-engine/dist/index.js",
  "packages/shared-types/dist/index.js",
]) {
  await import(pathToFileURL(resolve(root, artifact)).href);
}

const port = await availablePort();
const api = spawn(process.execPath, [resolve(root, "services/api/dist/main.js")], {
  cwd: root,
  env: {
    ...process.env,
    EIEP_ENV: "development",
    HOST: "127.0.0.1",
    PORT: String(port),
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
const apiOutput = capture(api);
try {
  let health = null;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (api.exitCode !== null) break;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/readyz`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) {
        health = await response.json();
        break;
      }
    } catch {
      // A short connection refusal is expected while the process starts.
    }
    await delay(100);
  }
  if (!health || health.status !== "ready") {
    throw new Error(`Compiled API failed its health smoke test.\n${apiOutput.stdout()}\n${apiOutput.stderr()}`);
  }
} finally {
  await stop(api);
}

for (const [application, publicDirectory] of [
  ["web", "apps/web/dist"],
  ["portal", "apps/portal/dist"],
]) {
  const browserPort = await availablePort();
  const browserServer = spawn(process.execPath, [resolve(root, "containers/static-server.mjs")], {
    cwd: root,
    env: {
      ...process.env,
      EIEP_ENV: "test",
      API_BASE_URL: "https://api.example.invalid",
      HOST: "127.0.0.1",
      PORT: String(browserPort),
      PUBLIC_ROOT: resolve(root, publicDirectory),
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const browserOutput = capture(browserServer);
  try {
    let healthResponse = null;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (browserServer.exitCode !== null) break;
      try {
        const response = await fetch(`http://127.0.0.1:${browserPort}/healthz`, {
          signal: AbortSignal.timeout(1_000),
        });
        if (response.ok) {
          healthResponse = response;
          break;
        }
      } catch {
        // A short connection refusal is expected while the process starts.
      }
      await delay(100);
    }
    if (!healthResponse || (await healthResponse.json()).environment !== "test") {
      throw new Error(`${application} static server failed its health smoke test.\n${browserOutput.stdout()}\n${browserOutput.stderr()}`);
    }

    const runtimeResponse = await fetch(`http://127.0.0.1:${browserPort}/runtime-config.js`);
    const runtimeBody = await runtimeResponse.text();
    if (!runtimeResponse.ok || runtimeResponse.headers.get("cache-control") !== "no-store"
      || !runtimeBody.includes('"apiBaseUrl":"https://api.example.invalid"')) {
      throw new Error(`${application} static server did not emit controlled runtime configuration.`);
    }

    const indexResponse = await fetch(`http://127.0.0.1:${browserPort}/projects/smoke-test`);
    const indexBody = await indexResponse.text();
    const contentSecurityPolicy = indexResponse.headers.get("content-security-policy") ?? "";
    if (!indexResponse.ok || !indexBody.includes('/runtime-config.js')
      || !contentSecurityPolicy.includes("connect-src https://api.example.invalid")
      || indexResponse.headers.get("x-content-type-options") !== "nosniff") {
      throw new Error(`${application} static server failed its SPA fallback or security-header checks.`);
    }

    const rejectedMethod = await fetch(`http://127.0.0.1:${browserPort}/healthz`, { method: "POST" });
    if (rejectedMethod.status !== 405 || rejectedMethod.headers.get("allow") !== "GET, HEAD") {
      throw new Error(`${application} static server did not reject an unsupported method.`);
    }
  } finally {
    await stop(browserServer);
  }
}

const worker = spawn(process.execPath, [resolve(root, "services/job-worker/dist/main.js")], {
  cwd: root,
  env: { ...process.env, EIEP_ENV: "development", DATABASE_URL: "" },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
const workerOutput = capture(worker);
const [workerExitCode] = await once(worker, "close");
if (workerExitCode === 0 || !workerOutput.stderr().includes("DATABASE_URL is required")) {
  throw new Error(`Compiled worker did not reach its controlled configuration boundary.\n${workerOutput.stdout()}\n${workerOutput.stderr()}`);
}

process.stdout.write("Compiled API and worker runtime graphs resolve; API health, browser runtime servers, and worker fail-closed startup verified.\n");
