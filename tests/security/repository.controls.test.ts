import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execute = promisify(execFile);

test("NFR-SEC-003, NFR-MNT-003 / AC-01-10: delivery controls pin tools, lock dependencies, and run protected gates", async () => {
  const packageJson = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8"));
  const workflow = await readFile(join(process.cwd(), ".github", "workflows", "verify.yml"), "utf8");
  const toolchain = JSON.parse(await readFile(join(process.cwd(), "infrastructure", "bicep", "toolchain.json"), "utf8"));
  const jobWorkerPackage = JSON.parse(await readFile(join(process.cwd(), "services", "job-worker", "package.json"), "utf8"));
  const appRuntime = await readFile(join(process.cwd(), "infrastructure", "bicep", "modules", "app-runtime.bicep"), "utf8");
  const proposedEnvironment = await readFile(join(process.cwd(), "infrastructure", "bicep", "proposed-environment.bicep"), "utf8");
  const storage = await readFile(join(process.cwd(), "infrastructure", "bicep", "modules", "storage.bicep"), "utf8");
  assert.equal(packageJson.packageManager, "pnpm@11.9.0");
  assert.equal(packageJson.engines.node, ">=24 <25");
  for (const script of ["verify", "build", "database:verify", "infrastructure:verify", "sbom:generate"]) {
    assert.equal(typeof packageJson.scripts[script], "string", script);
  }
  assert.match(workflow, /permissions:\s+contents: read/u);
  assert.match(workflow, /pnpm install --frozen-lockfile/u);
  assert.match(workflow, /pnpm audit --prod --audit-level high/u);
  assert.match(workflow, /sha256sum --check/u);
  const actionReferences = [...workflow.matchAll(/uses:\s+[^@\s]+@([^\s#]+)/gu)]
    .map((match) => match[1])
    .filter((reference): reference is string => Boolean(reference));
  assert.ok(actionReferences.length >= 3);
  assert.ok(actionReferences.every((reference) => /^[0-9a-f]{40}$/u.test(reference)), "CI actions must be commit-pinned");
  assert.equal(toolchain.version, "0.45.15");
  assert.match(toolchain.windowsX64Sha256, /^[0-9a-f]{64}$/u);
  assert.match(toolchain.linuxX64Sha256, /^[0-9a-f]{64}$/u);
  assert.equal(jobWorkerPackage.scripts.start, "node dist/main.js");
  assert.match(appRuntime, /name: 'eiep-\$\{environmentName\}-job-worker'/u);
  assert.match(appRuntime, /name: 'DATABASE_RUNTIME_ROLE', value: 'eiep_job_worker'/u);
  assert.match(appRuntime, /name: 'AZURE_STORAGE_ACCOUNT_NAME'/u);
  assert.match(appRuntime, /name: 'AZURE_CLIENT_ID'/u);
  assert.match(appRuntime, /name: 'CLAMAV_HOST'/u);
  assert.match(appRuntime, /userAssignedIdentities:\s*\{\s*'\$\{jobWorkerIdentityId\}'/u);
  assert.match(proposedEnvironment, /module jobWorkerIdentity /u);
  assert.match(proposedEnvironment, /module apiIdentity /u);
  assert.match(storage, /ba92f5b4-2d11-453d-a403-e96b0029c9fe/u);
  assert.match(storage, /principalId: workerPrincipalId/u);
  assert.match(storage, /principalId: apiPrincipalId/u);
  assert.match(storage, /scope: containers\[0\]/u);
  assert.match(appRuntime, /scale: \{ minReplicas: 1, maxReplicas: 5 \}/u);
});

test("NFR-SEC-003 / AC-01-10: generated CycloneDX evidence covers production packages without local paths", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "eiep-sbom-test-"));
  const output = join(temporaryDirectory, "sbom.cdx.json");
  try {
    await execute(process.execPath, ["scripts/generate-sbom.mjs", "--output", output], {
      cwd: process.cwd(), windowsHide: true,
      env: process.env,
    });
    const text = await readFile(output, "utf8");
    const bom = JSON.parse(text);
    assert.equal(bom.bomFormat, "CycloneDX");
    assert.equal(bom.specVersion, "1.6");
    assert.ok(bom.components.some((component: { name: string }) => component.name === "fastify"));
    assert.ok(bom.components.some((component: { name: string }) => component.name === "pg"));
    assert.match(bom.metadata.properties[0].value, /^[0-9a-f]{64}$/u);
    assert.equal(text.includes(process.cwd()), false);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
