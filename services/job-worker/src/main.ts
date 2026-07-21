import { randomUUID } from "node:crypto";
import { PlatformService, PostgresFoundationStore, createAzurePostgresAuthentication } from "@eiep/api";
import { AzureBlobObjectStorage, ClamAvTcpScanner, FileProcessingWorker } from "@eiep/document-processing";
import type { AccessContext } from "@eiep/shared-types";
import { TurnoverPdfRenderer } from "@eiep/turnover-renderer";
import { JobWorker } from "./index.js";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function boundedInteger(name: string, fallback: number, minimum: number, maximum: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

const databaseUrl = requiredEnvironment("DATABASE_URL");
if (process.env.DATABASE_RUNTIME_ROLE?.trim() !== "eiep_job_worker") {
  throw new Error("The job worker requires DATABASE_RUNTIME_ROLE=eiep_job_worker.");
}
const workerUserId = requiredEnvironment("WORKER_USER_ID");
const workerOrganizationId = requiredEnvironment("WORKER_ORGANIZATION_ID");
const batchSize = boundedInteger("WORKER_BATCH_SIZE", 25, 1, 100);
const pollMilliseconds = boundedInteger("WORKER_POLL_INTERVAL_MS", 5_000, 250, 60_000);
const leaseDurationMs = boundedInteger("WORKER_LEASE_DURATION_MS", 60_000, 1_000, 900_000);
const runOnce = process.env.WORKER_RUN_ONCE === "true";
const workerInstanceId = process.env.WORKER_INSTANCE_ID?.trim() || process.env.HOSTNAME?.trim() || randomUUID();
const environmentName = process.env.EIEP_ENV?.trim() || "development";
const storageAccountName = process.env.AZURE_STORAGE_ACCOUNT_NAME?.trim() || null;
const managedIdentityClientId = process.env.AZURE_CLIENT_ID?.trim() || undefined;
const databaseAuthenticationMode = process.env.DATABASE_AUTH_MODE?.trim() || "connection-string";
if (databaseAuthenticationMode !== "connection-string" && databaseAuthenticationMode !== "azure-managed-identity") {
  throw new Error("DATABASE_AUTH_MODE must be connection-string or azure-managed-identity.");
}
const clamAvHost = process.env.CLAMAV_HOST?.trim() || null;
const clamAvPort = boundedInteger("CLAMAV_PORT", 3310, 1, 65_535);
if ((storageAccountName === null) !== (clamAvHost === null)) {
  throw new Error("AZURE_STORAGE_ACCOUNT_NAME and CLAMAV_HOST must be configured together.");
}
if (environmentName === "production" && (!storageAccountName || !clamAvHost || !managedIdentityClientId)) {
  throw new Error("Production job workers require a managed identity, managed Blob storage, and a malware scanner.");
}
if (environmentName === "production" && databaseAuthenticationMode !== "azure-managed-identity") {
  throw new Error("Production job workers require DATABASE_AUTH_MODE=azure-managed-identity.");
}
if (databaseAuthenticationMode === "azure-managed-identity" && !managedIdentityClientId) {
  throw new Error("Azure PostgreSQL authentication requires AZURE_CLIENT_ID.");
}

const objectStorage = storageAccountName
  ? await AzureBlobObjectStorage.createWithManagedIdentity({
      accountName: storageAccountName,
      ...(managedIdentityClientId ? { managedIdentityClientId } : {}),
    })
  : undefined;
const fileProcessing = objectStorage && clamAvHost
  ? new FileProcessingWorker(objectStorage, new ClamAvTcpScanner(clamAvHost, clamAvPort))
  : undefined;
const turnoverRenderer = objectStorage ? new TurnoverPdfRenderer() : undefined;

const databaseAuthentication = databaseAuthenticationMode === "azure-managed-identity"
  ? createAzurePostgresAuthentication(databaseUrl, managedIdentityClientId!)
  : undefined;
const store = await PostgresFoundationStore.connect(databaseUrl, "eiep_job_worker", databaseAuthentication);
const worker = new JobWorker(store, new PlatformService(store), {
  batchSize,
  workerId: workerInstanceId,
  leaseDurationMs,
  ...(objectStorage ? { objectStorage } : {}),
  ...(fileProcessing ? { fileProcessing } : {}),
  ...(turnoverRenderer ? { turnoverRenderer } : {}),
});
let stopping = false;
let releaseWait: (() => void) | null = null;
const stop = () => {
  stopping = true;
  releaseWait?.();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

function wait(): Promise<void> {
  return new Promise<void>((resolve) => {
    const complete = () => {
      clearTimeout(timer);
      if (releaseWait === complete) releaseWait = null;
      resolve();
    };
    const timer = setTimeout(complete, pollMilliseconds);
    releaseWait = complete;
  });
}

try {
  do {
    const identity = await store.transaction((transaction) => ({
      account: transaction.identityAccountById(workerUserId),
      assignments: transaction.assignmentsFor(workerUserId),
    }));
    if (!identity.account || identity.account.state !== "active") {
      throw new Error("The configured job-worker account is not active.");
    }
    const context: AccessContext = {
      userId: identity.account.id,
      actingOrganizationId: workerOrganizationId,
      assurance: "mfa",
      qualifications: identity.account.qualificationCodes,
      sessionId: "service:job-worker",
      correlationId: randomUUID(),
      authenticatedAt: new Date(),
    };
    const result = await worker.runOnce(context, identity.assignments);
    process.stdout.write(`${JSON.stringify({ level: "info", event: "job_worker_batch", ...result })}\n`);
    if (!runOnce && !stopping) await wait();
  } while (!runOnce && !stopping);
} finally {
  await store.close();
}
