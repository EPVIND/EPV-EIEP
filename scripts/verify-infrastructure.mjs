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
if (!Array.isArray(proposed.resources) || proposed.resources.length < 8) {
  throw new Error("Proposed environment modules are incomplete.");
}
const runtimeModule = proposed.resources.find((resource) => resource.name === "[format('{0}-runtime', deployment().name)]");
const alertsModule = proposed.resources.find((resource) => resource.name === "[format('{0}-alerts', deployment().name)]");
const foundationModules = proposed.resources.filter((resource) => resource !== runtimeModule && resource !== alertsModule);
if (!runtimeModule || runtimeModule.condition !== "[variables('runtimeEnabled')]"
  || !alertsModule || alertsModule.condition !== "[variables('runtimeEnabled')]"
  || foundationModules.some((resource) => resource.condition !== "[variables('deploymentEnabled')]")) {
  throw new Error("Foundation, application runtime, and alerting must retain their authorization guards.");
}
const compiled = JSON.stringify(proposed);
if (!compiled.includes("@sha256:") || !compiled.includes("imageReferencesAreImmutable")) {
  throw new Error("Proposed deployments must fail closed unless every image is addressed by digest.");
}
if (!compiled.includes("runtimeAuthorizationReference") || !compiled.includes("runtimeEnabled")
  || !compiled.includes("alertConfigurationReference") || !compiled.includes("alertConfigurationPresent")
  || !compiled.includes("microsoft.insights/actiongroups")) {
  throw new Error("Application startup requires controlled post-migration and alert-routing authorization references.");
}
if (proposed.resources.some((resource) => JSON.stringify(resource).includes("-messaging"))
  || compiled.includes("Microsoft.ServiceBus/namespaces")
  || compiled.includes("privatelink.servicebus.windows.net")) {
  throw new Error("The MVP environment must not provision the optional Service Bus boundary before separate approval.");
}
if (proposed.parameters?.metricsToken?.type !== "securestring"
  || proposed.parameters.metricsToken.minLength !== 32
  || proposed.parameters.metricsToken.maxLength !== 256
  || proposed.parameters?.databaseSecretUri) {
  throw new Error("Deployment must accept only a secure metrics token and construct separate passwordless database URLs.");
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
  'DATABASE_AUTH_MODE',
  'azure-managed-identity',
  'CLAMAV_HOST',
  'job-worker-identity',
  'api-identity',
  '4633458b-17de-408a-b874-0445c86b69e6',
  'Microsoft.DBforPostgreSQL/flexibleServers/administrators',
  'Microsoft.Insights/metricAlerts',
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
const keyVault = templates.get(join(bicepRoot, "modules", "key-vault.bicep"));
const keyVaultCompiled = JSON.stringify(keyVault);
const keyVaultRoles = keyVault?.resources?.filter((resource) => resource.type === "Microsoft.Authorization/roleAssignments") ?? [];
if (keyVaultRoles.length !== 1
  || !keyVaultCompiled.includes("parameters('apiPrincipalId')")
  || !keyVaultCompiled.includes("vaults/secrets")
  || !keyVaultCompiled.includes("metrics-token")) {
  throw new Error("Key Vault access must be limited to the API's generated metrics secret.");
}
const postgresql = templates.get(join(bicepRoot, "modules", "postgresql.bicep"));
if (!postgresql?.resources?.some((resource) => resource.type === "Microsoft.DBforPostgreSQL/flexibleServers/administrators")) {
  throw new Error("Entra-only PostgreSQL must declare an independently supplied administrator principal.");
}
const messaging = templates.get(join(bicepRoot, "modules", "messaging.bicep"));
const messagingCompiled = JSON.stringify(messaging);
if (!messagingCompiled.includes("Microsoft.ServiceBus/namespaces")
  || !messagingCompiled.includes('"disableLocalAuth":true')
  || !messagingCompiled.includes('"publicNetworkAccess":"Disabled"')
  || !messagingCompiled.includes('"requiresDuplicateDetection":true')) {
  throw new Error("The uninstantiated optional Service Bus blueprint must retain secure managed-queue controls.");
}
const alerts = templates.get(join(bicepRoot, "modules", "alerts.bicep"));
const alertResources = alerts?.resources?.filter((resource) => resource.type === "Microsoft.Insights/metricAlerts") ?? [];
const alertMetrics = new Set(alertResources.flatMap((resource) => (
  resource.properties?.criteria?.allOf ?? []
).map((criterion) => criterion.metricName)));
const requiredAlertMetrics = [
  "Replicas", "RestartCount", "ResiliencyRequestTimeouts", "is_db_alive", "storage_percent", "Availability",
];
const allowedEvaluationMinutes = [1, 5, 15, 30, 60];
const allowedWindowMinutes = [1, 5, 15, 30, 60, 360, 720, 1440];
const configuredContainerApps = alertsModule.properties?.parameters?.containerApps?.value ?? [];
if (alertResources.length !== 6
  || requiredAlertMetrics.some((metric) => !alertMetrics.has(metric))
  || configuredContainerApps.map((app) => app.code).join(",") !== "api,web,portal,job-worker"
  || alerts?.outputs?.alertRuleCount?.value !== "[add(mul(length(parameters('containerApps')), 2), 4)]"
  || alerts?.variables?.actions?.[0]?.actionGroupId !== "[parameters('actionGroupResourceId')]"
  || alertResources.some((resource) => resource.apiVersion !== "2026-01-01"
    || resource.properties?.enabled !== true
    || resource.properties?.autoMitigate !== true
    || resource.properties?.actions !== "[variables('actions')]"
    || resource.properties?.criteria?.allOf?.some((criterion) => criterion.skipMetricValidation !== false))) {
  throw new Error("Runtime alerts must route approved, validated availability, restart, timeout, database, and storage metrics.");
}
if (JSON.stringify(alerts?.parameters?.evaluationFrequencyMinutes?.allowedValues) !== JSON.stringify(allowedEvaluationMinutes)
  || JSON.stringify(alerts?.parameters?.availabilityWindowMinutes?.allowedValues) !== JSON.stringify(allowedWindowMinutes)
  || JSON.stringify(alerts?.parameters?.degradationWindowMinutes?.allowedValues) !== JSON.stringify(allowedWindowMinutes)) {
  throw new Error("Alert evaluation and aggregation periods must use Azure Monitor-supported durations.");
}
for (const parameter of [
  "evaluationFrequencyMinutes", "availabilityWindowMinutes", "degradationWindowMinutes",
  "apiRequestTimeoutCountThreshold", "containerRestartCountThreshold", "postgresqlStoragePercentThreshold",
  "storageAvailabilityPercentThreshold", "pagingSeverity", "ticketSeverity",
]) {
  if (alerts?.parameters?.[parameter]?.defaultValue !== undefined) {
    throw new Error(`Alert parameter ${parameter} must require an approved value rather than an invented default.`);
  }
}
const appRuntime = templates.get(join(bicepRoot, "modules", "app-runtime.bicep"));
const managedEnvironmentDiagnostics = appRuntime?.resources?.find(
  (resource) => resource.type === "Microsoft.Insights/diagnosticSettings",
);
if (!managedEnvironmentDiagnostics
  || managedEnvironmentDiagnostics.properties?.workspaceId !== "[parameters('logAnalyticsWorkspaceId')]"
  || managedEnvironmentDiagnostics.properties?.logAnalyticsDestinationType !== "Dedicated"
  || !JSON.stringify(managedEnvironmentDiagnostics.properties.logs).includes("allLogs")) {
  throw new Error("Container Apps console, system, and HTTP logs must be routed to the controlled workspace.");
}
const runtimeDependencies = JSON.stringify(runtimeModule.dependsOn ?? []);
for (const dependency of ["-vault", "-postgresql", "-private-endpoints", "-observability"]) {
  if (!runtimeDependencies.includes(dependency)) {
    throw new Error(`Application runtime must wait for ${dependency.slice(1)} controls.`);
  }
}

process.stdout.write(
  `Bicep ${toolchain.version} compiled ${templates.size} templates; guarded private-service and approved-alert baseline verified with the optional Service Bus boundary uninstantiated.\n`,
);
