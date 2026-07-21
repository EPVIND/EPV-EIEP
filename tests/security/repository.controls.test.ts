import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execute = promisify(execFile);

test("NFR-SEC-003, NFR-MNT-001, NFR-MNT-003 / AC-01-10: delivery controls pin tools, lock dependencies, and run protected gates", async () => {
  const packageJson = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8"));
  const workflow = await readFile(join(process.cwd(), ".github", "workflows", "verify.yml"), "utf8");
  const toolchain = JSON.parse(await readFile(join(process.cwd(), "infrastructure", "bicep", "toolchain.json"), "utf8"));
  const jobWorkerPackage = JSON.parse(await readFile(join(process.cwd(), "services", "job-worker", "package.json"), "utf8"));
  const apiPackage = JSON.parse(await readFile(join(process.cwd(), "services", "api", "package.json"), "utf8"));
  const databaseConnection = await readFile(join(process.cwd(), "packages", "database", "connection.mjs"), "utf8");
  const databaseBootstrap = await readFile(join(process.cwd(), "packages", "database", "bootstrap-azure-identities.mjs"), "utf8");
  const azureBlobStorage = await readFile(join(process.cwd(), "services", "document-processing", "src", "azure-blob-object-storage.ts"), "utf8");
  const appRuntime = await readFile(join(process.cwd(), "infrastructure", "bicep", "modules", "app-runtime.bicep"), "utf8");
  const alerts = await readFile(join(process.cwd(), "infrastructure", "bicep", "modules", "alerts.bicep"), "utf8");
  const proposedEnvironment = await readFile(join(process.cwd(), "infrastructure", "bicep", "proposed-environment.bicep"), "utf8");
  const privateEndpoints = await readFile(join(process.cwd(), "infrastructure", "bicep", "modules", "private-endpoints.bicep"), "utf8");
  const network = await readFile(join(process.cwd(), "infrastructure", "bicep", "modules", "network.bicep"), "utf8");
  const storage = await readFile(join(process.cwd(), "infrastructure", "bicep", "modules", "storage.bicep"), "utf8");
  const keyVault = await readFile(join(process.cwd(), "infrastructure", "bicep", "modules", "key-vault.bicep"), "utf8");
  const postgresql = await readFile(join(process.cwd(), "infrastructure", "bicep", "modules", "postgresql.bicep"), "utf8");
  const traceabilityCheck = await readFile(join(process.cwd(), "scripts", "check-traceability.mjs"), "utf8");
  assert.equal(packageJson.packageManager, "pnpm@11.9.0");
  assert.equal(packageJson.engines.node, ">=24 <25");
  for (const script of ["verify", "build", "runtime:verify", "database:verify", "infrastructure:verify", "sbom:generate"]) {
    assert.equal(typeof packageJson.scripts[script], "string", script);
  }
  assert.match(workflow, /permissions:\s+contents: read/u);
  assert.match(workflow, /pnpm install --frozen-lockfile/u);
  assert.match(workflow, /pnpm audit --prod --audit-level high/u);
  assert.match(workflow, /SOURCE_REVISION: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/u);
  assert.match(workflow, /sha256sum --check/u);
  assert.match(workflow, /sha256sum artifacts\/sbom\.cdx\.json artifacts\/container-build\.json > artifacts\/evidence\.sha256/u);
  assert.match(workflow, /sha256sum --check artifacts\/evidence\.sha256/u);
  assert.match(workflow, /artifacts\/evidence\.sha256/u);
  const actionReferences = [...workflow.matchAll(/uses:\s+[^@\s]+@([^\s#]+)/gu)]
    .map((match) => match[1])
    .filter((reference): reference is string => Boolean(reference));
  assert.ok(actionReferences.length >= 3);
  assert.ok(actionReferences.every((reference) => /^[0-9a-f]{40}$/u.test(reference)), "CI actions must be commit-pinned");
  assert.equal(toolchain.version, "0.45.15");
  assert.match(toolchain.windowsX64Sha256, /^[0-9a-f]{64}$/u);
  assert.match(toolchain.linuxX64Sha256, /^[0-9a-f]{64}$/u);
  assert.equal(jobWorkerPackage.scripts.start, "node dist/main.js");
  assert.equal(apiPackage.scripts.dev, "tsx watch --conditions=development src/main.ts");
  assert.equal(jobWorkerPackage.dependencies.playwright, "1.61.1");
  assert.equal(apiPackage.exports["."].default, "./dist/index.js");
  assert.equal(jobWorkerPackage.exports["."].default, "./dist/index.js");
  assert.match(packageJson.scripts.verify, /runtime:verify/u);
  assert.match(databaseConnection, /DefaultAzureCredential/u);
  assert.match(databaseConnection, /ossrdbms-aad\.database\.windows\.net\/\.default/u);
  assert.match(databaseConnection, /rejectUnauthorized: true/u);
  assert.match(databaseBootstrap, /pgaadauth_create_principal_with_oid/u);
  assert.match(databaseBootstrap, /pgaadauth_list_principals/u);
  assert.match(databaseBootstrap, /The API and job worker require distinct managed identities/u);
  assert.match(azureBlobStorage, /ManagedIdentityCredential/u);
  assert.doesNotMatch(azureBlobStorage, /DefaultAzureCredential/u);
  assert.match(appRuntime, /name: 'eiep-\$\{environmentName\}-job-worker'/u);
  assert.match(appRuntime, /name: 'DATABASE_RUNTIME_ROLE', value: 'eiep_job_worker'/u);
  assert.equal((appRuntime.match(/name: 'DATABASE_AUTH_MODE', value: 'azure-managed-identity'/gu) ?? []).length, 2);
  assert.equal((appRuntime.match(/name: 'DATABASE_URL', value:/gu) ?? []).length, 2);
  assert.equal((appRuntime.match(/keyVaultUrl:/gu) ?? []).length, 1);
  assert.match(appRuntime, /name: 'AZURE_STORAGE_ACCOUNT_NAME'/u);
  assert.match(appRuntime, /name: 'AZURE_CLIENT_ID'/u);
  assert.match(appRuntime, /name: 'CLAMAV_HOST'/u);
  assert.match(appRuntime, /path: '\/livez'/u);
  assert.match(appRuntime, /path: '\/readyz'/u);
  assert.match(appRuntime, /Microsoft\.Insights\/diagnosticSettings@2021-05-01-preview/u);
  assert.match(appRuntime, /categoryGroup: 'allLogs'/u);
  assert.match(appRuntime, /workspaceId: logAnalyticsWorkspaceId/u);
  assert.match(appRuntime, /userAssignedIdentities:\s*\{\s*'\$\{jobWorkerIdentityId\}'/u);
  assert.match(proposedEnvironment, /module jobWorkerIdentity /u);
  assert.match(proposedEnvironment, /module apiIdentity /u);
  assert.match(proposedEnvironment, /var alertConfigurationPresent = !empty\(alertConfigurationReference\).*microsoft\.insights\/actiongroups/u);
  assert.match(proposedEnvironment, /var runtimeEnabled = deploymentEnabled && runtimeAuthorized && !empty\(runtimeAuthorizationReference\) && alertConfigurationPresent/u);
  assert.match(proposedEnvironment, /module runtime .* = if \(runtimeEnabled\)/u);
  assert.match(proposedEnvironment, /module alerts .* = if \(runtimeEnabled\)/u);
  assert.match(alerts, /Microsoft\.Insights\/metricAlerts@2026-01-01/u);
  for (const metric of ["Replicas", "RestartCount", "ResiliencyRequestTimeouts", "is_db_alive", "storage_percent", "Availability"]) {
    assert.match(alerts, new RegExp(`metricName: '${metric}'`, "u"));
  }
  assert.equal((alerts.match(/skipMetricValidation: false/gu) ?? []).length, 6);
  assert.equal((alerts.match(/actionGroupId: actionGroupResourceId/gu) ?? []).length, 1);
  assert.doesNotMatch(proposedEnvironment, /module messaging /u);
  assert.doesNotMatch(privateEndpoints, /servicebus/iu);
  assert.doesNotMatch(network, /servicebus/iu);
  assert.match(traceabilityCheck, /no executable test title references/u);
  assert.match(traceabilityCheck, /evidence does not exist/u);
  assert.match(storage, /ba92f5b4-2d11-453d-a403-e96b0029c9fe/u);
  assert.match(storage, /principalId: workerPrincipalId/u);
  assert.match(storage, /principalId: apiPrincipalId/u);
  assert.match(storage, /scope: containers\[0\]/u);
  assert.equal((keyVault.match(/4633458b-17de-408a-b874-0445c86b69e6/gu) ?? []).length, 1);
  assert.match(keyVault, /scope: metricsSecret/u);
  assert.match(keyVault, /principalId: apiPrincipalId/u);
  assert.doesNotMatch(keyVault, /jobWorkerPrincipalId/u);
  assert.match(proposedEnvironment, /apiDatabaseUrl: 'postgresql:\/\/\$\{uriComponent\(apiIdentity!/u);
  assert.match(proposedEnvironment, /jobWorkerDatabaseUrl: 'postgresql:\/\/\$\{uriComponent\(jobWorkerIdentity!/u);
  assert.match(postgresql, /flexibleServers\/administrators@2025-08-01/u);
  assert.match(postgresql, /name: administratorObjectId/u);
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
    const coreAuth = bom.dependencies.find((dependency: { ref: string }) => dependency.ref.startsWith("@azure/core-auth@"));
    assert.ok(coreAuth?.dependsOn.some((reference: string) => reference.startsWith("@azure/core-util@")));
    const database = bom.dependencies.find((dependency: { ref: string }) => dependency.ref === "@eiep/database@0.1.0");
    assert.ok(database?.dependsOn.includes("@azure/identity@4.13.1"));
    assert.match(bom.metadata.properties[0].value, /^[0-9a-f]{64}$/u);
    assert.equal(text.includes(process.cwd()), false);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
