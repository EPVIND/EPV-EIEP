import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

function execute(command, arguments_, options = {}) {
  return execFileSync(command, arguments_, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, DOCKER_BUILDKIT: "1" },
    windowsHide: true,
    ...options,
  });
}

let revision = process.env.SOURCE_REVISION?.trim();
if (!revision) {
  const dirty = execute("git", ["status", "--porcelain"]).trim();
  if (dirty) throw new Error("SOURCE_REVISION is required when building containers from a dirty worktree.");
  revision = execute("git", ["rev-parse", "HEAD"]).trim();
}
if (!/^[0-9a-f]{40}$/u.test(revision)) throw new Error("SOURCE_REVISION must be a full Git commit SHA.");

try {
  execute("docker", ["version"], { stdio: "ignore" });
} catch {
  throw new Error("Docker with BuildKit is required for the production container build.");
}

const shortRevision = revision.slice(0, 12);
const targets = ["api", "job-worker", "web", "portal"];
const tags = Object.fromEntries(targets.map((target) => [target, `eiep-${target}:${shortRevision}`]));
for (const target of targets) {
  execute("docker", [
    "build", "--file", "containers/Dockerfile", "--target", target,
    "--build-arg", `SOURCE_REVISION=${revision}`, "--tag", tags[target], ".",
  ], { stdio: "inherit" });
}

const temporaryContainers = [];
function start(name, tag, environment) {
  execute("docker", ["run", "--detach", "--rm", "--name", name,
    ...Object.entries(environment).flatMap(([key, value]) => ["--env", `${key}=${value}`]), tag], { stdio: "ignore" });
  temporaryContainers.push(name);
}
function inContainer(name, source) {
  return execute("docker", ["exec", name, "node", "--input-type=module", "--eval", source]);
}
async function waitFor(name, url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      return inContainer(name, `const response=await fetch(${JSON.stringify(url)}); if(!response.ok) process.exit(1); process.stdout.write(await response.text())`);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`${name} did not become healthy.`);
}

try {
  const suffix = `${process.pid}-${shortRevision}`;
  const apiName = `eiep-api-smoke-${suffix}`;
  start(apiName, tags.api, { EIEP_ENV: "development", HOST: "0.0.0.0", PORT: "3100" });
  const apiReadiness = JSON.parse(await waitFor(apiName, "http://127.0.0.1:3100/readyz"));
  if (apiReadiness.status !== "ready") throw new Error("The API container readiness response is invalid.");

  for (const target of ["web", "portal"]) {
    const name = `eiep-${target}-smoke-${suffix}`;
    start(name, tags[target], {
      EIEP_ENV: "test", API_BASE_URL: "https://api.example.invalid", HOST: "0.0.0.0", PORT: "8080",
    });
    const health = JSON.parse(await waitFor(name, "http://127.0.0.1:8080/healthz"));
    if (health.status !== "ok" || health.environment !== "test") throw new Error(`${target} health response is invalid.`);
    const runtimeConfiguration = await waitFor(name, "http://127.0.0.1:8080/runtime-config.js");
    if (!runtimeConfiguration.includes("https://api.example.invalid")) {
      throw new Error(`${target} did not serve its controlled runtime API origin.`);
    }
  }

  execute("docker", ["run", "--rm", "--entrypoint", "node", tags["job-worker"],
    "--input-type=module", "--eval", "await import('./dist/index.js')"], { stdio: "inherit" });
} finally {
  for (const name of temporaryContainers.reverse()) {
    try { execute("docker", ["rm", "--force", name], { stdio: "ignore" }); } catch { /* already removed */ }
  }
}

const images = targets.map((target) => {
  const inspected = JSON.parse(execute("docker", ["image", "inspect", tags[target]]))[0];
  if (inspected.Config?.User !== "node") throw new Error(`${target} image is not configured as the node user.`);
  if (inspected.Config?.Labels?.["org.opencontainers.image.revision"] !== revision) {
    throw new Error(`${target} image lacks the controlled source revision.`);
  }
  return { target, tag: tags[target], imageId: inspected.Id, sourceRevision: revision };
});

const evidence = `${JSON.stringify({ schemaVersion: 1, images }, null, 2)}\n`;
if (process.env.CONTAINER_BUILD_EVIDENCE?.trim()) {
  await writeFile(process.env.CONTAINER_BUILD_EVIDENCE.trim(), evidence, { encoding: "utf8", flag: "w" });
}
process.stdout.write(evidence);
