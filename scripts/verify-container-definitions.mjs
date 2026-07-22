import { readFile } from "node:fs/promises";

const dockerfile = await readFile("containers/Dockerfile", "utf8");
const dockerignore = await readFile(".dockerignore", "utf8");
const workspace = await readFile("pnpm-workspace.yaml", "utf8");
const appRuntime = await readFile("infrastructure/bicep/modules/app-runtime.bicep", "utf8");
const staticServer = await readFile("containers/static-server.mjs", "utf8");
const webVite = await readFile("apps/web/vite.config.ts", "utf8");
const portalVite = await readFile("apps/portal/vite.config.ts", "utf8");

if (!dockerfile.startsWith("# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e\n")) {
  throw new Error("The Dockerfile frontend must be pinned by digest.");
}
if (!/^ARG NODE_IMAGE=node:24\.14\.0-bookworm-slim@sha256:[0-9a-f]{64}$/mu.test(dockerfile)) {
  throw new Error("The container build must pin the approved Node 24 base image by digest.");
}
for (const target of ["api", "job-worker", "web", "portal"]) {
  if (!dockerfile.includes("FROM ${NODE_IMAGE} AS " + target)) {
    throw new Error(`The container build is missing the ${target} target.`);
  }
}
if ((dockerfile.match(/^USER node$/gmu) ?? []).length !== 4) {
  throw new Error("Every production container target must run as the unprivileged node user.");
}
for (const control of [
  "corepack prepare pnpm@11.9.0 --activate",
  "pnpm install --frozen-lockfile",
  "pnpm --filter @eiep/api --prod deploy /out/api",
  "pnpm --filter @eiep/job-worker --prod deploy /out/job-worker",
  "PLAYWRIGHT_BROWSERS_PATH=/ms-playwright",
  "org.opencontainers.image.revision",
]) {
  if (!dockerfile.includes(control)) throw new Error(`The container build is missing ${control}.`);
}
for (const excluded of [".git", ".env", "source-intake", "training-demo", "tests", "docs"]) {
  if (!dockerignore.split(/\r?\n/u).includes(excluded)) {
    throw new Error(`The Docker context must exclude ${excluded}.`);
  }
}
if (!workspace.includes("injectWorkspacePackages: true") || !workspace.includes("syncInjectedDepsAfterScripts:")) {
  throw new Error("Portable pnpm workspace deployment settings are missing.");
}
if (!staticServer.includes("API_BASE_URL") || !staticServer.includes("API_UPSTREAM_URL")
  || !staticServer.includes("/runtime-config.js")
  || !staticServer.includes("content-security-policy") || !staticServer.includes("/healthz")
  || !staticServer.includes('decoded.endsWith(".map")')) {
  throw new Error("Browser containers require validated runtime API/proxy configuration, health, and security headers.");
}
if (webVite.includes("sourcemap: true") || portalVite.includes("sourcemap: true")) {
  throw new Error("Production browser bundles must not publish source maps.");
}
if ((appRuntime.match(/name: 'API_BASE_URL'/gu) ?? []).length !== 2
  || !appRuntime.includes("name: 'EIEP_CONFIG_ROOT', value: '/app'")) {
  throw new Error("Container Apps must supply runtime API and configuration-root values.");
}

process.stdout.write("Four digest-pinned, rootless production container targets and runtime configuration boundaries verified.\n");
