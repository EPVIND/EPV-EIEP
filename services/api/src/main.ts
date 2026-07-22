import { DevelopmentAuthenticator } from "./auth/development-authenticator.js";
import { StoreBackedDevelopmentAuthenticator } from "./auth/store-backed-development-authenticator.js";
import { resolve } from "node:path";
import { AzureBlobStagedUploadStorage, LocalFilesystemObjectStorage } from "@eiep/document-processing";
import { OidcAuthenticator } from "./auth/oidc-authenticator.js";
import { StoreIdentityResolver } from "./auth/store-identity-resolver.js";
import { loadRuntimeConfig } from "./config.js";
import { FoundationService } from "./domain/foundation-service.js";
import { EstimatingService } from "./domain/estimating-service.js";
import { ExecutionDisciplineService } from "./domain/execution-discipline-service.js";
import { ProjectControlsService } from "./domain/project-controls-service.js";
import { DocumentCollaborationService } from "./domain/document-collaboration-service.js";
import { FabricationService } from "./domain/fabrication-service.js";
import { CncService } from "./domain/cnc-service.js";
import { EngineeringRegisterService } from "./domain/engineering-register-service.js";
import { InMemoryFoundationStore } from "./domain/in-memory-foundation-store.js";
import { OperationalService } from "./domain/operational-service.js";
import { PlatformService } from "./domain/platform-service.js";
import { PostgresFoundationStore } from "./domain/postgres-foundation-store.js";
import { ReportingService } from "./domain/reporting-service.js";
import { buildServer } from "./server.js";
import { createAzurePostgresAuthentication } from "./domain/azure-postgres-authentication.js";
import { bootstrapLocalPilotAccess, loadLocalPilotBootstrapFile } from "./domain/local-pilot-bootstrap.js";

const inferredRepositoryRoot = resolve(import.meta.dirname, "../../..");
const configurationRoot = process.env.EIEP_CONFIG_ROOT?.trim()
  ? resolve(process.env.EIEP_CONFIG_ROOT.trim())
  : inferredRepositoryRoot;
const config = await loadRuntimeConfig(configurationRoot);
const databaseAuthentication = config.environment.dataStore === "postgres"
  && config.databaseAuthentication === "azure-managed-identity"
  ? createAzurePostgresAuthentication(process.env.DATABASE_URL!, config.managedIdentityClientId!)
  : undefined;

const postgresStore = config.environment.dataStore === "postgres"
  ? await PostgresFoundationStore.connect(process.env.DATABASE_URL!, config.databaseRuntimeRole, databaseAuthentication)
  : null;
const store = postgresStore ?? new InMemoryFoundationStore();
if (config.localPilotBootstrapFile && config.localPilotBootstrapSha256) {
  const pilot = await loadLocalPilotBootstrapFile(config.localPilotBootstrapFile, config.localPilotBootstrapSha256);
  const result = await bootstrapLocalPilotAccess(store, pilot.input, pilot.manifestSha256);
  process.stdout.write(`${JSON.stringify({ level: "info", event: "local_pilot_bootstrap", ...result })}\n`);
}
const service = new FoundationService(store);
const estimating = new EstimatingService(store);
const executionDisciplines = new ExecutionDisciplineService(store);
const projectControls = new ProjectControlsService(store);
const documentCollaboration = new DocumentCollaborationService(store);
const fabrication = new FabricationService(store);
const cnc = new CncService(store);
const engineeringRegisters = new EngineeringRegisterService(store);
const operations = new OperationalService(store);
const platform = new PlatformService(store);
const reporting = new ReportingService(store, config.environment.trainingBanner);
const stagedUpload = config.storageAccountName
  ? await AzureBlobStagedUploadStorage.createWithManagedIdentity({
    accountName: config.storageAccountName,
    ...(config.managedIdentityClientId ? { managedIdentityClientId: config.managedIdentityClientId } : {}),
  })
  : new LocalFilesystemObjectStorage(resolve(
    config.fileStorageRoot ? resolve(configurationRoot, config.fileStorageRoot) : resolve(configurationRoot, ".eiep-file-storage"),
    config.environment.environment,
  ));
const authenticator =
  config.environment.authentication === "oidc"
    ? await OidcAuthenticator.create(config.oidcIssuer!, config.oidcAudience!, new StoreIdentityResolver(store))
    : config.localPilotBootstrapFile ? new StoreBackedDevelopmentAuthenticator(store) : new DevelopmentAuthenticator();
const server = await buildServer({
  service,
  estimating,
  executionDisciplines,
  projectControls,
  documentCollaboration,
  fabrication,
  cnc,
  engineeringRegisters,
  operations,
  platform,
  reporting,
  stagedUpload,
  store,
  authenticator,
  environment: config.environment.environment,
  trainingBanner: config.environment.trainingBanner,
  allowedOrigins: config.allowedOrigins,
  rateLimitMax: config.rateLimitMax,
  metricsToken: config.metricsToken,
  readiness: async () => {
    await postgresStore?.health();
    if (stagedUpload instanceof AzureBlobStagedUploadStorage) await stagedUpload.assertPrivateBoundary();
  },
});

await server.listen({ host: config.host, port: config.port });

if (postgresStore) {
  const close = async () => {
    await server.close();
    await postgresStore.close();
  };
  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());
}
