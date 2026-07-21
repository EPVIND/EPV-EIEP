import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const root = process.cwd();
const bicepRoot = resolve(root, "infrastructure", "bicep");
const toolchain = JSON.parse(await readFile(join(bicepRoot, "toolchain.json"), "utf8"));
const candidates = [
  process.env.BICEP_PATH,
  process.platform === "win32" ? join(homedir(), ".bicep", "bicep.exe") : null,
  "bicep",
].filter(Boolean);

let bicep = null;
for (const candidate of candidates) {
  try {
    const version = await execute(candidate, ["--version"], { windowsHide: true });
    if (!version.stdout.includes(toolchain.version)) {
      throw new Error(`Bicep ${toolchain.version} is required; ${candidate} reported ${version.stdout.trim()}.`);
    }
    bicep = candidate;
    break;
  } catch (error) {
    if (error instanceof Error && error.message.includes("is required")) throw error;
  }
}
if (!bicep) throw new Error(`Bicep ${toolchain.version} is required. Set BICEP_PATH or install the pinned toolchain.`);

async function bicepFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? bicepFiles(path) : entry.name.endsWith(".bicep") ? [path] : [];
  }));
  return nested.flat();
}

const templates = new Map();
for (const path of await bicepFiles(bicepRoot)) {
  const result = await execute(bicep, ["build", path, "--stdout"], {
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (/\b(?:Warning|Error)\s+[A-Z0-9]+:/u.test(result.stderr)) {
    throw new Error(`Bicep diagnostics for ${basename(path)}:\n${result.stderr}`);
  }
  templates.set(path, JSON.parse(result.stdout));
}

const main = templates.get(join(bicepRoot, "main.bicep"));
const proposed = templates.get(join(bicepRoot, "proposed-environment.bicep"));
if (!main || !proposed) throw new Error("Infrastructure entry-point templates are missing.");
if (!Array.isArray(main.resources) || main.resources.length !== 0) {
  throw new Error("Review-only main.bicep must remain non-deploying until ADR-0009 approval.");
}
if (!Array.isArray(proposed.resources) || proposed.resources.length < 8
  || proposed.resources.some((resource) => resource.condition !== "[variables('deploymentEnabled')]")) {
  throw new Error("Proposed environment modules must all use the production authorization guard.");
}
const compiled = JSON.stringify(proposed);
if (!compiled.includes("@sha256:") || !compiled.includes("imageReferencesAreImmutable")) {
  throw new Error("Proposed deployments must fail closed unless every image is addressed by digest.");
}
const requiredControls = [
  '"allowBlobPublicAccess":false',
  '"allowSharedKeyAccess":false',
  '"supportsHttpsTrafficOnly":true',
  '"passwordAuth":"Disabled"',
  '"activeDirectoryAuth":"Enabled"',
  '"publicNetworkAccess":"Disabled"',
  '"version":"18"',
  '"disableLocalAuth":true',
  '"zoneRedundant":true',
  'ba92f5b4-2d11-453d-a403-e96b0029c9fe',
  'AZURE_STORAGE_ACCOUNT_NAME',
  'AZURE_CLIENT_ID',
  'CLAMAV_HOST',
  'job-worker-identity',
  'api-identity',
];
for (const control of requiredControls) {
  if (!compiled.includes(control)) throw new Error(`Compiled infrastructure is missing control ${control}.`);
}
if (compiled.includes("administratorLoginPassword")) throw new Error("Compiled infrastructure contains a database password surface.");
const storage = templates.get(join(bicepRoot, "modules", "storage.bicep"));
const storageCompiled = JSON.stringify(storage);
const storageRoles = storage?.resources?.filter((resource) => resource.type === "Microsoft.Authorization/roleAssignments") ?? [];
if (storageRoles.length !== 2
  || !storageRoles.some((resource) => resource.scope.includes("storageAccounts/blobServices/containers"))
  || !storageRoles.some((resource) => resource.scope === "[resourceId('Microsoft.Storage/storageAccounts', parameters('name'))]")
  || !storageCompiled.includes("parameters('apiPrincipalId')")
  || !storageCompiled.includes("parameters('workerPrincipalId')")) {
  throw new Error("Storage roles must isolate the API to the staged container while retaining worker account access.");
}

process.stdout.write(
  `Bicep ${toolchain.version} compiled ${templates.size} templates; review-only entry point and guarded private-service baseline verified.\n`,
);
