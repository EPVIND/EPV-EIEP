import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import Fastify, { type FastifyRequest, type FastifySchema } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import { ImmutableStorageConflictError, type StagedUploadStoragePort } from "@eiep/document-processing";
import { AuthorizationDeniedError } from "@eiep/rules-engine";
import type { AccessContext, ProcurementOffer, ProcurementRequisitionItem, RoleAssignment, ScheduleActivity } from "@eiep/shared-types";
import { AuthenticationError, type Authenticator } from "./auth/authenticator.js";
import { ConflictError, NotFoundError, ValidationError } from "./domain/errors.js";
import { generatedRouteSchemas } from "./generated-route-schemas.js";
import type {
  CreateProjectInput,
  CreateProjectStructureInput,
  AddProjectOrganizationInput,
  AssignResponsibilityInput,
  SubmitProjectConfigurationInput,
  DistributeDocumentRevisionInput,
  FoundationService,
  GrantAccessAssignmentInput,
  ProposeDelegationInput,
  ProposeRetentionPolicyInput,
  LinkGoverningDocumentInput,
  RegisterDocumentInput,
  SubmitDocumentRevisionInput,
} from "./domain/foundation-service.js";
import type { FoundationStore } from "./domain/foundation-store.js";
import {
  IdentityAdministrationService,
  type LinkExternalIdentityInput,
  type ProvisionIdentityAccountInput,
} from "./domain/identity-administration-service.js";
import type {
  CreateNcrInput,
  CreatePunchInput,
  CreateSubcontractorProfileInput,
  AssignSubcontractorInput,
  ConfigureMobilizationRequirementInput,
  ConfigureCompletionBoundaryInput,
  ConfigureTurnoverRequirementInput,
  CreateTurnoverPackageInput,
  GenerateTurnoverInput,
  OperationalService,
  ProposePmiOverrideInput,
  MoveMaterialInput,
  ReceiveMaterialInput,
  RecordPmiInput,
  ProposeNcrDispositionInput,
  ReviewMtrInput,
  RegisterEquipmentInput,
  SplitMaterialInput,
  SubmitInspectionInput,
  SubmitInspectionPlanInput,
  SubmitMobilizationEvidenceInput,
  SubmitSubcontractorRecordInput,
  VerifySubcontractorQualificationInput,
} from "./domain/operational-service.js";
import {
  PlatformService,
  type ConfigureNotificationSubscriptionInput,
  type DispatchNotificationInput,
  type QueueOfflineDraftInput,
  type ReceiveIntegrationInput,
  type RequestExportInput,
  type StageImportInput,
  type ValidateFileInput,
} from "./domain/platform-service.js";
import { ApiMetrics } from "./observability/api-metrics.js";
import { ReportingService, type GenerateControlledReportInput } from "./domain/reporting-service.js";
import {
  EstimatingService,
  type CreateEstimateInput,
  type CreateEstimateRevisionInput,
  type EstimateHandoffInput,
  type GenerateEstimateProposalInput,
  type ProposeEstimateAssemblyInput,
  type ProposeEstimateAuthorityPolicyInput,
  type ProposeProductivityFactorInput,
  type ReceiveEstimateQuoteInput,
  type UpsertEstimateLineInput,
} from "./domain/estimating-service.js";
import {
  ProjectControlsService,
  type AwardProcurementInput,
  type CreateControlBaselineFromChangeInput,
  type CreateProcurementBidPackageInput,
  type CreateProcurementRequisitionInput,
  type CreateProjectChangeInput,
  type CreateProjectControlBaselineInput,
  type CreateScheduleProgramInput,
  type CreateScheduleRevisionInput,
  type PreviewScheduleImportInput,
  type ProposeProjectControlsAuthorityPolicyInput,
  type RecordProcurementStatusInput,
  type SubmitProjectCostEntryInput,
  type SubmitProjectProgressClaimInput,
} from "./domain/project-controls-service.js";

export interface ServerDependencies {
  readonly service: FoundationService;
  readonly operations: OperationalService;
  readonly platform?: PlatformService;
  readonly stagedUpload?: StagedUploadStoragePort;
  readonly identityAdministration?: IdentityAdministrationService;
  readonly reporting?: ReportingService;
  readonly estimating?: EstimatingService;
  readonly projectControls?: ProjectControlsService;
  readonly store: FoundationStore;
  readonly authenticator: Authenticator;
  readonly environment: string;
  readonly trainingBanner: boolean;
  readonly allowedOrigins?: readonly string[];
  readonly rateLimitMax?: number;
  readonly metricsToken?: string | null;
  readonly readiness?: () => Promise<void>;
}

export const sensitiveLogPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['x-eiep-user-id']",
  "req.headers['x-eiep-organization-id']",
  "request.headers.authorization",
  "request.headers.cookie",
  "request.headers['x-eiep-user-id']",
  "request.headers['x-eiep-organization-id']",
  "headers.authorization",
  "headers.cookie",
  "req.headers['x-eiep-metrics-token']",
  "request.headers['x-eiep-metrics-token']",
  "headers['x-eiep-metrics-token']",
] as const;

interface AccessEnvelope {
  readonly context: AccessContext;
  readonly assignments: readonly RoleAssignment[];
}

function requestCorrelationId(value: string | string[] | undefined): string {
  const supplied = Array.isArray(value) ? value[0] : value;
  return supplied && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(supplied) ? supplied : randomUUID();
}

function openApiOperationId(method: string | readonly string[], url: string): string {
  const verb = (Array.isArray(method) ? method[0] : method).toLowerCase();
  const words = url.replace(/^\/v1\/?/u, "")
    .replace(/:([A-Za-z0-9_]+)/gu, " by $1 ")
    .split(/[^A-Za-z0-9]+/u)
    .filter(Boolean);
  return `${verb}${words.map((word) => word[0]!.toUpperCase() + word.slice(1)).join("") || "ApiRoot"}`;
}

function openApiTag(url: string): string {
  const first = url.replace(/^\/v1\/?/u, "").split("/")[0] ?? "platform";
  const aliases: Readonly<Record<string, string>> = {
    revisions: "documents", "document-distributions": "documents", files: "files", organizations: "files",
    imports: "interchange", exports: "interchange", integrations: "interchange",
    notifications: "notifications", connectivity: "offline", "connectivity-policy": "offline",
    "offline-drafts": "offline", materials: "materials", pmi: "quality", ncrs: "quality",
    punches: "quality", turnover: "turnover", "turnover-packages": "turnover",
    subcontractors: "subcontractors", portal: "portal", identity: "identity", reports: "reports",
    estimates: "estimating", "estimate-assemblies": "estimating", "estimate-productivity-factors": "estimating",
    "estimate-authority-policies": "estimating",
    "estimate-revisions": "estimating", "estimate-lines": "estimating", "estimate-quotes": "estimating",
    "estimate-proposals": "estimating",
    "project-controls-authority-policies": "project-controls",
    "project-control-baselines": "project-controls", "project-changes": "project-controls",
    "project-cost-entries": "project-controls", "project-progress-claims": "project-controls",
    "procurement-requisitions": "procurement", "procurement-bid-packages": "procurement",
    "procurement-commitments": "procurement", schedules: "scheduling", "schedule-revisions": "scheduling",
    "schedule-imports": "scheduling",
  };
  return (aliases[first] ?? first) || "platform";
}

async function accessFor(request: FastifyRequest, dependencies: ServerDependencies): Promise<AccessEnvelope> {
  const correlationId = request.id || randomUUID();
  const context = await dependencies.authenticator.authenticate({
    authorizationHeader: request.headers.authorization,
    developmentUserId: request.headers["x-eiep-user-id"] as string | undefined,
    requestedOrganizationId: request.headers["x-eiep-organization-id"] as string | undefined,
    developmentAssurance: request.headers["x-eiep-assurance"] as string | undefined,
    correlationId,
  });
  const assignments = await dependencies.store.transaction((transaction) => transaction.assignmentsFor(context.userId));
  return { context, assignments };
}

const projectReadinessSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "scopeStatement",
    "governingRequirementReferences",
    "plannedStartDate",
    "plannedFinishDate",
    "responsibleRoleCodes",
  ],
  properties: {
    scopeStatement: { type: "string", minLength: 1, maxLength: 4000 },
    governingRequirementReferences: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 256 } },
    plannedStartDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    plannedFinishDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    responsibleRoleCodes: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 128 } },
  },
} as const;

type ProcurementRequisitionItemHttp = Omit<ProcurementRequisitionItem, "needBy"> & { readonly needBy: string };
type CreateProcurementRequisitionHttp = Omit<CreateProcurementRequisitionInput, "items"> & {
  readonly items: readonly ProcurementRequisitionItemHttp[];
};
type ProcurementOfferHttp = Omit<ProcurementOffer, "validUntil" | "promisedDate" | "receivedAt" | "receivedBy"> & {
  readonly validUntil: string;
  readonly promisedDate: string;
};
type ScheduleActivityHttp = Omit<ScheduleActivity, "plannedStart" | "plannedFinish" | "actualStart" | "actualFinish"> & {
  readonly plannedStart: string;
  readonly plannedFinish: string;
  readonly actualStart: string | null;
  readonly actualFinish: string | null;
};
type CreateScheduleRevisionHttp = Omit<CreateScheduleRevisionInput, "dataDate" | "activities"> & {
  readonly dataDate: string;
  readonly activities: readonly ScheduleActivityHttp[];
};
type PreviewScheduleImportHttp = Omit<PreviewScheduleImportInput, "dataDate" | "activities"> & {
  readonly dataDate: string;
  readonly activities: readonly ScheduleActivityHttp[];
};

function scheduleActivityFromHttp(activity: ScheduleActivityHttp): ScheduleActivity {
  return {
    ...activity, plannedStart: new Date(activity.plannedStart), plannedFinish: new Date(activity.plannedFinish),
    actualStart: activity.actualStart ? new Date(activity.actualStart) : null,
    actualFinish: activity.actualFinish ? new Date(activity.actualFinish) : null,
  };
}

export async function buildServer(dependencies: ServerDependencies) {
  const platform = dependencies.platform ?? new PlatformService(dependencies.store);
  const identityAdministration = dependencies.identityAdministration ?? new IdentityAdministrationService(dependencies.store);
  const reporting = dependencies.reporting ?? new ReportingService(dependencies.store, dependencies.trainingBanner);
  const estimating = dependencies.estimating ?? new EstimatingService(dependencies.store);
  const projectControls = dependencies.projectControls ?? new ProjectControlsService(dependencies.store);
  const metrics = new ApiMetrics();
  const server = Fastify({
    logger: {
      redact: {
        paths: [...sensitiveLogPaths],
        censor: "[REDACTED]",
      },
    },
    trustProxy: dependencies.environment === "production",
    genReqId: (request) => requestCorrelationId(request.headers["x-correlation-id"]),
    bodyLimit: 1024 * 1024,
  });

  const errorResponseSchema = {
    $id: "ErrorResponse",
    type: "object",
    additionalProperties: false,
    required: ["error", "correlationId"],
    properties: {
      error: { type: "string" }, correlationId: { type: "string" },
      details: { type: "array", items: { type: "string" } },
      retryAfterSeconds: { type: "number", minimum: 0 },
    },
  } as const;
  server.addSchema(errorResponseSchema);
  const errorResponses = Object.fromEntries([400, 401, 403, 404, 409, 413, 422, 429, 500, 503]
    .map((status) => [status, { $ref: "ErrorResponse#" }]));
  server.addHook("onRoute", (routeOptions) => {
    if (!routeOptions.url.startsWith("/v1")) return;
    const rawMethod = Array.isArray(routeOptions.method) ? routeOptions.method[0] : routeOptions.method;
    if (!rawMethod) return;
    const method = rawMethod.toUpperCase();
    const generated = generatedRouteSchemas[`${method} ${routeOptions.url}`] as FastifySchema | undefined;
    const existing = routeOptions.schema ?? {};
    routeOptions.schema = {
      ...(generated ?? {}), ...existing,
      response: { ...errorResponses, ...(generated?.response ?? {}), ...(existing.response ?? {}) },
    };
  });

  void server.register(cors, {
    origin: [...(dependencies.allowedOrigins ?? [])],
    credentials: false,
    methods: ["GET", "POST", "PUT", "OPTIONS"],
    allowedHeaders: [
      "authorization", "content-type", "x-correlation-id", "x-eiep-user-id",
      "x-eiep-organization-id", "x-eiep-assurance", "x-eiep-retention-class", "x-idempotency-key",
    ],
    exposedHeaders: ["x-correlation-id"],
    maxAge: 600,
  });

  await server.register(multipart, {
    limits: {
      files: 1,
      fields: 0,
      fileSize: 250 * 1024 * 1024,
      parts: 1,
      headerPairs: 32,
    },
  });

  void server.register(rateLimit, {
    global: false,
    max: dependencies.rateLimitMax ?? 300,
    timeWindow: 60_000,
    hook: "onRequest",
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: (request, context) => ({
      statusCode: context.statusCode,
      error: "rate_limit_exceeded",
      correlationId: request.id,
      retryAfterSeconds: Math.max(1, Math.ceil(context.ttl / 1000)),
    }),
  });

  await server.register(swagger, {
    openapi: {
      openapi: "3.0.3",
      info: {
        title: "EPV Industrial Enterprise Platform API",
        description: "Versioned controlled API contract for the EIEP first-release operational chain.",
        version: "1.0.0-local-review",
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        },
      },
      tags: [
        "identity", "projects", "documents", "files", "materials", "quality", "turnover",
        "subcontractors", "portal", "interchange", "notifications", "offline", "reports", "estimating",
      ].map((name) => ({ name })),
    },
    exposeHeadRoutes: false,
    transform: ({ schema, url, route }) => {
      if (!url.startsWith("/v1")) return { schema, url };
      const routeSchema = url === "/v1/projects/:projectId/file-uploads"
        || url === "/v1/organizations/:organizationId/file-uploads"
        ? {
          ...(schema ?? {}),
          body: {
            type: "object", required: ["file"],
            properties: { file: { type: "string", format: "binary" } },
          },
        }
        : (schema ?? {});
      return {
        url,
        schema: {
          ...routeSchema,
          operationId: routeSchema.operationId ?? openApiOperationId(route.method, url),
          tags: routeSchema.tags ?? [openApiTag(url)],
          security: routeSchema.security ?? [{ bearerAuth: [] }],
        },
      };
    },
  });

  // The plugin installs its route hook during asynchronous registration. Registering
  // a single application hook after it is ready makes the limit cover routes that are
  // declared synchronously below while retaining the plugin's bounded local store.
  server.after((error) => {
    if (error) throw error;
    const enforceRateLimit = server.rateLimit.call(server);
    server.addHook("onRequest", async (request, reply) => {
      if (["/health", "/livez", "/readyz", "/metrics"].includes(request.url)) return;
      return enforceRateLimit.call(server, request, reply);
    });
  });

  server.addHook("onRequest", async (request) => {
    metrics.start(request);
  });

  server.addHook("onResponse", async (request, reply) => {
    metrics.finish(request, reply.statusCode);
  });

  server.addHook("onRequest", async (request, reply) => {
    const internalTransportEndpoint = request.url === "/livez" || request.url === "/readyz" || request.url === "/metrics";
    if (dependencies.environment === "production" && request.protocol !== "https" && !internalTransportEndpoint) {
      return reply.code(426).send({ error: "https_required", correlationId: request.id });
    }
  });

  server.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-correlation-id", request.id);
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "no-referrer");
    reply.header("permissions-policy", "camera=(), geolocation=(), microphone=(), payment=(), usb=()");
    reply.header("content-security-policy", "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    reply.header("cache-control", "no-store");
    if (dependencies.environment === "production") {
      reply.header("strict-transport-security", "max-age=31536000; includeSubDomains");
    }
    return payload;
  });

  server.setErrorHandler((error, request, reply) => {
    if (error instanceof AuthenticationError) {
      request.log.warn("authentication failed");
      return reply.code(401).send({ error: "authentication_failed", correlationId: request.id });
    }
    if (error instanceof AuthorizationDeniedError) {
      request.log.warn({ reasonCode: error.reasonCode }, "authorization denied");
      return reply.code(403).send({ error: "forbidden", correlationId: request.id });
    }
    if (error instanceof NotFoundError) return reply.code(404).send({ error: "not_found", correlationId: request.id });
    if (error instanceof ConflictError) return reply.code(409).send({ error: "conflict", correlationId: request.id });
    if (error instanceof ImmutableStorageConflictError) {
      return reply.code(409).send({ error: "conflict", correlationId: request.id });
    }
    if (error instanceof ValidationError) {
      return reply.code(422).send({ error: "validation_failed", details: error.details, correlationId: request.id });
    }
    if (typeof error === "object" && error !== null && "validation" in error) {
      return reply.code(400).send({ error: "invalid_request", correlationId: request.id });
    }
    if (typeof error === "object" && error !== null && "statusCode" in error && error.statusCode === 429) {
      const retryAfterSeconds = "retryAfterSeconds" in error && typeof error.retryAfterSeconds === "number"
        ? error.retryAfterSeconds
        : 60;
      return reply.code(429).send({ error: "rate_limit_exceeded", correlationId: request.id, retryAfterSeconds });
    }
    if (typeof error === "object" && error !== null && "statusCode" in error && error.statusCode === 413) {
      return reply.code(413).send({ error: "payload_too_large", correlationId: request.id });
    }
    request.log.error({ err: error }, "request failed");
    return reply.code(500).send({ error: "internal_error", correlationId: request.id });
  });

  server.get("/openapi.json", { schema: { hide: true } }, async (_request, reply) =>
    reply.type("application/json; charset=utf-8").send(server.swagger()));

  server.get("/health", { schema: { security: [] } }, async () => ({
    status: "ok",
    environment: dependencies.environment,
    training: dependencies.trainingBanner,
    productionReady: false,
    blockers: [
      "controlled_adrs_unapproved",
      "managed_external_services_not_validated",
      "pilot_acceptance_and_production_approvals_missing",
    ],
  }));

  server.get("/livez", { schema: { hide: true } }, async () => ({ status: "ok" }));

  server.get("/readyz", { schema: { hide: true } }, async (request, reply) => {
    try {
      await dependencies.readiness?.();
      return { status: "ready" };
    } catch {
      request.log.error("readiness check failed");
      return reply.code(503).send({ status: "unavailable" });
    }
  });

  server.get("/metrics", { schema: { hide: true } }, async (request, reply) => {
    const supplied = request.headers["x-eiep-metrics-token"];
    const expected = dependencies.metricsToken;
    const suppliedValue = typeof supplied === "string" ? supplied : "";
    const expectedDigest = createHash("sha256").update(expected ?? "").digest();
    const suppliedDigest = createHash("sha256").update(suppliedValue).digest();
    if (!expected || !suppliedValue || !timingSafeEqual(expectedDigest, suppliedDigest)) {
      return reply.code(404).send({ error: "not_found", correlationId: request.id });
    }
    return reply.type("application/openmetrics-text; version=1.0.0; charset=utf-8").send(metrics.render());
  });

  server.post<{ Body: ProvisionIdentityAccountInput }>("/v1/identity/accounts", async (request, reply) => {
    const access = await accessFor(request, dependencies);
    return reply.code(201).send(await identityAdministration.provisionAccount(access.context, access.assignments, request.body));
  });

  server.post<{
    Params: { accountId: string };
    Body: { businessScopeOrganizationId: string; expectedVersion: number };
  }>("/v1/identity/accounts/:accountId/activate", async (request) => {
    const access = await accessFor(request, dependencies);
    return identityAdministration.activateAccount(
      access.context, access.assignments, request.body.businessScopeOrganizationId,
      request.params.accountId, request.body.expectedVersion,
    );
  });

  server.post<{ Params: { accountId: string }; Body: LinkExternalIdentityInput }>(
    "/v1/identity/accounts/:accountId/external-identities",
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      return reply.code(201).send(await identityAdministration.linkExternalIdentity(
        access.context, access.assignments, request.params.accountId, request.body,
      ));
    },
  );

  server.post<{
    Params: { organizationId: string };
    Headers: { "x-eiep-retention-class"?: string; "x-idempotency-key"?: string };
  }>(
    "/v1/organizations/:organizationId/file-uploads",
    {
      schema: {
        consumes: ["multipart/form-data"],
        params: {
          type: "object", additionalProperties: false, required: ["organizationId"],
          properties: { organizationId: { type: "string", minLength: 1 } },
        },
        headers: {
          type: "object",
          required: ["x-eiep-retention-class"],
          properties: {
            "x-eiep-retention-class": { type: "string", minLength: 1, maxLength: 128 },
            "x-idempotency-key": { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$" },
          },
        },
      },
    },
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      platform.authorizeOrganizationFileUpload(access.context, access.assignments, request.params.organizationId);
      if (!dependencies.stagedUpload) {
        return reply.code(503).send({ error: "file_storage_unavailable", correlationId: request.id });
      }
      const part = await request.file();
      if (!part || part.fieldname !== "file") {
        throw new ValidationError("A single multipart file field named file is required.", ["upload_file_required"]);
      }
      if (!part.filename || part.filename.length > 255 || /[\u0000-\u001f\u007f]/u.test(part.filename)) {
        throw new ValidationError("The uploaded filename is invalid.", ["upload_filename_invalid"]);
      }
      const content = await part.toBuffer();
      if (part.file.truncated || content.length < 1 || content.length > 250 * 1024 * 1024) {
        return reply.code(413).send({ error: "payload_too_large", correlationId: request.id });
      }
      const idempotencyKey = request.headers["x-idempotency-key"];
      const objectId = idempotencyKey
        ? createHash("sha256").update(`${access.context.userId}\n${request.params.organizationId}\n${idempotencyKey}`).digest("hex")
        : randomUUID();
      const storageKey = `organizations/${request.params.organizationId}/${objectId}`;
      const sha256 = createHash("sha256").update(content).digest("hex");
      await dependencies.stagedUpload.putStaged(storageKey, content);
      const staged = await platform.stageOrganizationFile(
        access.context, access.assignments, request.params.organizationId,
        {
          storageKey, originalFilename: part.filename, declaredMediaType: part.mimetype,
          sha256, sizeBytes: content.length, retentionClass: request.headers["x-eiep-retention-class"]!,
        },
      );
      return reply.code(201).send(staged);
    },
  );

  server.post<{
    Params: { accountId: string };
    Body: { businessScopeOrganizationId: string; expectedVersion: number; reason: string };
  }>("/v1/identity/accounts/:accountId/disable", async (request) => {
    const access = await accessFor(request, dependencies);
    return identityAdministration.disableAccount(
      access.context, access.assignments, request.body.businessScopeOrganizationId,
      request.params.accountId, request.body.expectedVersion, request.body.reason,
    );
  });

  server.post<{
    Body: Omit<GrantAccessAssignmentInput, "effectiveFrom" | "effectiveTo"> & { effectiveFrom: string; effectiveTo: string };
  }>("/v1/access/assignments", async (request, reply) => {
    const access = await accessFor(request, dependencies);
    return reply.code(201).send(await dependencies.service.grantAccessAssignment(
      access.context, access.assignments,
      { ...request.body, effectiveFrom: new Date(request.body.effectiveFrom), effectiveTo: new Date(request.body.effectiveTo) },
    ));
  });

  server.post<{ Params: { assignmentId: string }; Body: { expectedVersion: number } }>(
    "/v1/access/assignments/:assignmentId/review",
    async (request) => {
      const access = await accessFor(request, dependencies);
      return dependencies.service.reviewAccessAssignment(
        access.context, access.assignments, request.params.assignmentId, request.body.expectedVersion,
      );
    },
  );

  server.post<{ Params: { assignmentId: string }; Body: { expectedVersion: number; reason: string } }>(
    "/v1/access/assignments/:assignmentId/revoke",
    async (request) => {
      const access = await accessFor(request, dependencies);
      return dependencies.service.revokeAccessAssignment(
        access.context, access.assignments, request.params.assignmentId, request.body.expectedVersion, request.body.reason,
      );
    },
  );

  server.post<{
    Body: Omit<ProposeDelegationInput, "effectiveFrom" | "effectiveTo"> & { effectiveFrom: string; effectiveTo: string };
  }>("/v1/access/delegations", async (request, reply) => {
    const access = await accessFor(request, dependencies);
    return reply.code(201).send(await dependencies.service.proposeDelegation(
      access.context, access.assignments,
      { ...request.body, effectiveFrom: new Date(request.body.effectiveFrom), effectiveTo: new Date(request.body.effectiveTo) },
    ));
  });

  server.post<{ Params: { delegationId: string }; Body: { expectedVersion: number } }>(
    "/v1/access/delegations/:delegationId/approve",
    async (request) => {
      const access = await accessFor(request, dependencies);
      return dependencies.service.approveDelegation(
        access.context, access.assignments, request.params.delegationId, request.body.expectedVersion,
      );
    },
  );

  server.post<{ Params: { delegationId: string }; Body: { expectedVersion: number } }>(
    "/v1/access/delegations/:delegationId/review",
    async (request) => {
      const access = await accessFor(request, dependencies);
      return dependencies.service.reviewDelegation(
        access.context, access.assignments, request.params.delegationId, request.body.expectedVersion,
      );
    },
  );

  server.post<{ Params: { delegationId: string }; Body: { expectedVersion: number; reason: string } }>(
    "/v1/access/delegations/:delegationId/revoke",
    async (request) => {
      const access = await accessFor(request, dependencies);
      return dependencies.service.revokeDelegation(
        access.context, access.assignments, request.params.delegationId, request.body.expectedVersion, request.body.reason,
      );
    },
  );

  server.post<{ Params: { projectId: string }; Body: CreateProjectStructureInput }>(
    "/v1/projects/:projectId/structure",
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      return reply.code(201).send(await dependencies.service.createProjectStructureElement(
        access.context, access.assignments, request.params.projectId, request.body,
      ));
    },
  );

  server.post<{ Params: { projectId: string }; Body: AddProjectOrganizationInput }>(
    "/v1/projects/:projectId/organizations",
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      return reply.code(201).send(await dependencies.service.addProjectOrganization(
        access.context, access.assignments, request.params.projectId, request.body,
      ));
    },
  );

  server.post<{
    Params: { projectId: string };
    Body: Omit<AssignResponsibilityInput, "effectiveFrom" | "effectiveTo"> & { effectiveFrom: string; effectiveTo: string | null };
  }>("/v1/projects/:projectId/responsibilities", async (request, reply) => {
    const access = await accessFor(request, dependencies);
    return reply.code(201).send(await dependencies.service.assignProjectResponsibility(
      access.context, access.assignments, request.params.projectId,
      { ...request.body, effectiveFrom: new Date(request.body.effectiveFrom),
        effectiveTo: request.body.effectiveTo ? new Date(request.body.effectiveTo) : null },
    ));
  });

  server.post<{
    Params: { projectId: string };
    Body: Omit<SubmitProjectConfigurationInput, "effectiveFrom"> & { effectiveFrom: string };
  }>("/v1/projects/:projectId/configurations", async (request, reply) => {
    const access = await accessFor(request, dependencies);
    return reply.code(201).send(await dependencies.service.submitProjectConfiguration(
      access.context, access.assignments, request.params.projectId,
      { ...request.body, effectiveFrom: new Date(request.body.effectiveFrom) },
    ));
  });

  server.post<{ Params: { configurationId: string }; Body: { expectedVersion: number } }>(
    "/v1/project-configurations/:configurationId/approve",
    async (request) => {
      const access = await accessFor(request, dependencies);
      return dependencies.service.approveProjectConfiguration(
        access.context, access.assignments, request.params.configurationId, request.body.expectedVersion,
      );
    },
  );

  server.get<{ Params: { projectId: string; configurationCode: string } }>(
    "/v1/projects/:projectId/configurations/:configurationCode/current",
    async (request) => {
      const access = await accessFor(request, dependencies);
      return dependencies.service.currentProjectConfiguration(
        access.context, access.assignments, request.params.projectId, request.params.configurationCode,
      );
    },
  );

  server.post<{ Body: ProposeEstimateAssemblyInput }>("/v1/estimate-assemblies", async (request, reply) => {
    const access = await accessFor(request, dependencies);
    return reply.code(201).send(await estimating.proposeAssembly(access.context, access.assignments, request.body));
  });

  server.get<{ Querystring: { code?: string } }>("/v1/estimate-assemblies", async (request) => {
    const access = await accessFor(request, dependencies);
    return estimating.listAssemblies(access.context, access.assignments, request.query.code);
  });

  server.post<{
    Params: { assemblyId: string };
    Body: { expectedVersion: number; decision: "approve" | "reject"; reason: string };
  }>("/v1/estimate-assemblies/:assemblyId/review", async (request) => {
    const access = await accessFor(request, dependencies);
    return estimating.reviewAssembly(
      access.context, access.assignments, request.params.assemblyId,
      request.body.expectedVersion, request.body.decision, request.body.reason,
    );
  });

  server.post<{
    Body: Omit<ProposeProductivityFactorInput, "effectiveFrom" | "effectiveTo">
      & { effectiveFrom: string; effectiveTo: string | null };
  }>("/v1/estimate-productivity-factors", async (request, reply) => {
    const access = await accessFor(request, dependencies);
    return reply.code(201).send(await estimating.proposeProductivityFactor(access.context, access.assignments, {
      ...request.body, effectiveFrom: new Date(request.body.effectiveFrom),
      effectiveTo: request.body.effectiveTo ? new Date(request.body.effectiveTo) : null,
    }));
  });

  server.post<{
    Params: { factorId: string };
    Body: { expectedVersion: number; decision: "approve" | "reject"; reason: string };
  }>("/v1/estimate-productivity-factors/:factorId/review", async (request) => {
    const access = await accessFor(request, dependencies);
    return estimating.reviewProductivityFactor(
      access.context, access.assignments, request.params.factorId,
      request.body.expectedVersion, request.body.decision, request.body.reason,
    );
  });

  server.get<{ Querystring: { code?: string } }>("/v1/estimate-productivity-factors", async (request) => {
    const access = await accessFor(request, dependencies);
    return estimating.listProductivityFactors(access.context, access.assignments, request.query.code);
  });

  server.post<{ Body: ProposeEstimateAuthorityPolicyInput }>(
    "/v1/estimate-authority-policies",
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      return reply.code(201).send(await estimating.proposeAuthorityPolicy(access.context, access.assignments, request.body));
    },
  );

  server.get<{ Querystring: { currency?: string } }>("/v1/estimate-authority-policies", async (request) => {
    const access = await accessFor(request, dependencies);
    return estimating.listAuthorityPolicies(access.context, access.assignments, request.query.currency);
  });

  server.post<{
    Params: { policyId: string };
    Body: { expectedVersion: number; decision: "approve" | "reject"; reason: string };
  }>("/v1/estimate-authority-policies/:policyId/review", async (request) => {
    const access = await accessFor(request, dependencies);
    return estimating.reviewAuthorityPolicy(
      access.context, access.assignments, request.params.policyId,
      request.body.expectedVersion, request.body.decision, request.body.reason,
    );
  });

  server.post<{
    Body: Omit<CreateEstimateInput, "dueAt"> & { dueAt: string };
  }>("/v1/estimates", async (request, reply) => {
    const access = await accessFor(request, dependencies);
    return reply.code(201).send(await estimating.createEstimate(access.context, access.assignments, {
      ...request.body, dueAt: new Date(request.body.dueAt),
    }));
  });

  server.get("/v1/estimates", async (request) => {
    const access = await accessFor(request, dependencies);
    return estimating.listEstimates(access.context, access.assignments);
  });

  server.get<{ Params: { estimateId: string } }>("/v1/estimates/:estimateId", async (request) => {
    const access = await accessFor(request, dependencies);
    return estimating.estimateDetail(access.context, access.assignments, request.params.estimateId);
  });

  server.post<{ Params: { revisionId: string }; Body: UpsertEstimateLineInput }>(
    "/v1/estimate-revisions/:revisionId/lines",
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      return reply.code(201).send(await estimating.upsertLine(
        access.context, access.assignments, request.params.revisionId, null, null, request.body,
      ));
    },
  );

  server.put<{
    Params: { lineId: string };
    Body: UpsertEstimateLineInput & { expectedVersion: number };
  }>("/v1/estimate-lines/:lineId", async (request) => {
    const access = await accessFor(request, dependencies);
    const { expectedVersion, ...input } = request.body;
    const current = await dependencies.store.transaction((transaction) => transaction.estimateLineById(request.params.lineId));
    if (!current) throw new NotFoundError();
    return estimating.upsertLine(
      access.context, access.assignments, current.revisionId, request.params.lineId, expectedVersion, input,
    );
  });

  server.post<{
    Params: { lineId: string };
    Body: { expectedVersion: number; reason: string };
  }>("/v1/estimate-lines/:lineId/remove", async (request) => {
    const access = await accessFor(request, dependencies);
    return estimating.removeLine(
      access.context, access.assignments, request.params.lineId, request.body.expectedVersion, request.body.reason,
    );
  });

  server.post<{
    Params: { revisionId: string };
    Body: { expectedVersion: number };
  }>("/v1/estimate-revisions/:revisionId/submit", async (request) => {
    const access = await accessFor(request, dependencies);
    return estimating.submitRevision(
      access.context, access.assignments, request.params.revisionId, request.body.expectedVersion,
    );
  });

  server.post<{
    Params: { revisionId: string };
    Body: { expectedVersion: number; decision: "approve" | "reject"; reason: string };
  }>("/v1/estimate-revisions/:revisionId/review", async (request) => {
    const access = await accessFor(request, dependencies);
    return estimating.reviewRevision(
      access.context, access.assignments, request.params.revisionId,
      request.body.expectedVersion, request.body.decision, request.body.reason,
    );
  });

  server.post<{
    Params: { estimateId: string };
    Body: CreateEstimateRevisionInput & { expectedEstimateVersion: number };
  }>("/v1/estimates/:estimateId/revisions", async (request, reply) => {
    const access = await accessFor(request, dependencies);
    const { expectedEstimateVersion, ...input } = request.body;
    return reply.code(201).send(await estimating.createRevision(
      access.context, access.assignments, request.params.estimateId, expectedEstimateVersion, input,
    ));
  });

  server.get<{ Params: { revisionId: string } }>("/v1/estimate-revisions/:revisionId/delta", async (request) => {
    const access = await accessFor(request, dependencies);
    return estimating.revisionDelta(access.context, access.assignments, request.params.revisionId);
  });

  server.post<{
    Params: { revisionId: string };
    Body: Omit<ReceiveEstimateQuoteInput, "validUntil"> & { validUntil: string };
  }>("/v1/estimate-revisions/:revisionId/quotes", async (request, reply) => {
    const access = await accessFor(request, dependencies);
    return reply.code(201).send(await estimating.receiveQuote(access.context, access.assignments, request.params.revisionId, {
      ...request.body, validUntil: new Date(request.body.validUntil),
    }));
  });

  server.get<{ Params: { revisionId: string } }>(
    "/v1/estimate-revisions/:revisionId/quote-comparison",
    async (request) => {
      const access = await accessFor(request, dependencies);
      return estimating.quoteComparison(access.context, access.assignments, request.params.revisionId);
    },
  );

  server.post<{
    Params: { quoteId: string };
    Body: { expectedVersion: number; reason: string };
  }>("/v1/estimate-quotes/:quoteId/select", async (request) => {
    const access = await accessFor(request, dependencies);
    return estimating.selectQuote(
      access.context, access.assignments, request.params.quoteId, request.body.expectedVersion, request.body.reason,
    );
  });

  server.post<{
    Params: { revisionId: string };
    Body: Omit<GenerateEstimateProposalInput, "validUntil"> & { validUntil: string };
  }>("/v1/estimate-revisions/:revisionId/proposals", async (request, reply) => {
    const access = await accessFor(request, dependencies);
    return reply.code(201).send(await estimating.generateProposal(access.context, access.assignments, request.params.revisionId, {
      ...request.body, validUntil: new Date(request.body.validUntil),
    }));
  });

  server.post<{
    Params: { proposalId: string };
    Body: { expectedVersion: number; decision: "approve" | "reject"; reason: string };
  }>("/v1/estimate-proposals/:proposalId/review", async (request) => {
    const access = await accessFor(request, dependencies);
    return estimating.reviewProposal(
      access.context, access.assignments, request.params.proposalId,
      request.body.expectedVersion, request.body.decision, request.body.reason,
    );
  });

  server.post<{
    Params: { proposalId: string };
    Body: { expectedVersion: number };
  }>("/v1/estimate-proposals/:proposalId/issue", async (request) => {
    const access = await accessFor(request, dependencies);
    return estimating.issueProposal(
      access.context, access.assignments, request.params.proposalId, request.body.expectedVersion,
    );
  });

  server.get<{ Params: { proposalId: string } }>("/v1/estimate-proposals/:proposalId/download", async (request, reply) => {
    const access = await accessFor(request, dependencies);
    const proposal = await estimating.downloadProposal(access.context, access.assignments, request.params.proposalId);
    return reply.type(proposal.artifactMediaType)
      .header("content-disposition", `attachment; filename="${proposal.artifactFilename}"`)
      .send(proposal.artifactContent);
  });

  server.post<{
    Params: { proposalId: string };
    Body: EstimateHandoffInput;
  }>("/v1/estimate-proposals/:proposalId/handoff", async (request, reply) => {
    const access = await accessFor(request, dependencies);
    return reply.code(201).send(await estimating.handoffProposal(
      access.context, access.assignments, request.params.proposalId, request.body,
    ));
  });

  server.post<{ Body: ProposeProjectControlsAuthorityPolicyInput }>(
    "/v1/project-controls-authority-policies",
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      return reply.code(201).send(await projectControls.proposeAuthorityPolicy(
        access.context, access.assignments, request.body,
      ));
    },
  );

  server.get("/v1/project-controls-authority-policies", async (request) => {
    const access = await accessFor(request, dependencies);
    return projectControls.listAuthorityPolicies(
      access.context, access.assignments, access.context.actingOrganizationId,
    );
  });

  server.post<{
    Params: { policyId: string };
    Body: { expectedVersion: number; decision: "approve" | "reject"; reason: string };
  }>("/v1/project-controls-authority-policies/:policyId/review", async (request) => {
    const access = await accessFor(request, dependencies);
    return projectControls.reviewAuthorityPolicy(
      access.context, access.assignments, request.params.policyId,
      request.body.expectedVersion, request.body.decision, request.body.reason,
    );
  });

  server.get<{ Params: { projectId: string } }>("/v1/projects/:projectId/controls", async (request) => {
    const access = await accessFor(request, dependencies);
    return projectControls.projectSnapshot(access.context, access.assignments, request.params.projectId);
  });

  server.get<{ Params: { projectId: string } }>("/v1/projects/:projectId/cost-summary", async (request) => {
    const access = await accessFor(request, dependencies);
    return projectControls.costSummary(access.context, access.assignments, request.params.projectId);
  });

  server.post<{
    Params: { projectId: string };
    Body: Omit<CreateProjectControlBaselineInput, "periodStart" | "periodFinish"> & {
      periodStart: string; periodFinish: string;
    };
  }>("/v1/projects/:projectId/control-baselines", async (request, reply) => {
    const access = await accessFor(request, dependencies);
    return reply.code(201).send(await projectControls.createBaselineFromHandoff(
      access.context, access.assignments, request.params.projectId,
      { ...request.body, periodStart: new Date(request.body.periodStart), periodFinish: new Date(request.body.periodFinish) },
    ));
  });

  server.post<{
    Params: { baselineId: string };
    Body: { expectedVersion: number };
  }>("/v1/project-control-baselines/:baselineId/submit", async (request) => {
    const access = await accessFor(request, dependencies);
    return projectControls.submitBaseline(
      access.context, access.assignments, request.params.baselineId, request.body.expectedVersion,
    );
  });

  server.post<{
    Params: { baselineId: string };
    Body: { expectedVersion: number; decision: "approve" | "reject"; reason: string };
  }>("/v1/project-control-baselines/:baselineId/review", async (request) => {
    const access = await accessFor(request, dependencies);
    return projectControls.reviewBaseline(
      access.context, access.assignments, request.params.baselineId,
      request.body.expectedVersion, request.body.decision, request.body.reason,
    );
  });

  server.post<{ Params: { projectId: string }; Body: CreateProjectChangeInput }>(
    "/v1/projects/:projectId/changes",
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      return reply.code(201).send(await projectControls.createChangeRequest(
        access.context, access.assignments, request.params.projectId, request.body,
      ));
    },
  );

  server.post<{
    Params: { changeId: string };
    Body: { expectedVersion: number; decision: "approve" | "reject"; reason: string };
  }>("/v1/project-changes/:changeId/review", async (request) => {
    const access = await accessFor(request, dependencies);
    return projectControls.reviewChangeRequest(
      access.context, access.assignments, request.params.changeId,
      request.body.expectedVersion, request.body.decision, request.body.reason,
    );
  });

  server.post<{
    Params: { changeId: string };
    Body: Omit<CreateControlBaselineFromChangeInput, "periodStart" | "periodFinish"> & {
      periodStart: string; periodFinish: string;
    };
  }>("/v1/project-changes/:changeId/baseline", async (request, reply) => {
    const access = await accessFor(request, dependencies);
    return reply.code(201).send(await projectControls.createBaselineFromChange(
      access.context, access.assignments, request.params.changeId,
      { ...request.body, periodStart: new Date(request.body.periodStart), periodFinish: new Date(request.body.periodFinish) },
    ));
  });

  server.post<{
    Params: { projectId: string };
    Body: Omit<SubmitProjectCostEntryInput, "periodStart" | "periodFinish"> & {
      periodStart: string; periodFinish: string;
    };
  }>("/v1/projects/:projectId/cost-entries", async (request, reply) => {
    const access = await accessFor(request, dependencies);
    return reply.code(201).send(await projectControls.submitCostEntry(
      access.context, access.assignments, request.params.projectId,
      { ...request.body, periodStart: new Date(request.body.periodStart), periodFinish: new Date(request.body.periodFinish) },
    ));
  });

  server.post<{
    Params: { entryId: string };
    Body: { expectedVersion: number; decision: "accept" | "reject"; reason: string };
  }>("/v1/project-cost-entries/:entryId/review", async (request) => {
    const access = await accessFor(request, dependencies);
    return projectControls.reviewCostEntry(
      access.context, access.assignments, request.params.entryId,
      request.body.expectedVersion, request.body.decision, request.body.reason,
    );
  });

  server.post<{
    Params: { projectId: string };
    Body: Omit<SubmitProjectProgressClaimInput, "periodStart" | "periodFinish"> & {
      periodStart: string; periodFinish: string;
    };
  }>("/v1/projects/:projectId/progress-claims", async (request, reply) => {
    const access = await accessFor(request, dependencies);
    return reply.code(201).send(await projectControls.submitProgressClaim(
      access.context, access.assignments, request.params.projectId,
      { ...request.body, periodStart: new Date(request.body.periodStart), periodFinish: new Date(request.body.periodFinish) },
    ));
  });

  server.post<{
    Params: { claimId: string };
    Body: { expectedVersion: number; decision: "accept" | "reject"; reason: string };
  }>("/v1/project-progress-claims/:claimId/review", async (request) => {
    const access = await accessFor(request, dependencies);
    return projectControls.reviewProgressClaim(
      access.context, access.assignments, request.params.claimId,
      request.body.expectedVersion, request.body.decision, request.body.reason,
    );
  });

  server.post<{ Params: { projectId: string }; Body: CreateProcurementRequisitionHttp }>(
    "/v1/projects/:projectId/procurement-requisitions",
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      return reply.code(201).send(await projectControls.createProcurementRequisition(
        access.context, access.assignments, request.params.projectId,
        { ...request.body, items: request.body.items.map((item) => ({ ...item, needBy: new Date(item.needBy) })) },
      ));
    },
  );

  server.post<{
    Params: { requisitionId: string };
    Body: { expectedVersion: number };
  }>("/v1/procurement-requisitions/:requisitionId/submit", async (request) => {
    const access = await accessFor(request, dependencies);
    return projectControls.submitProcurementRequisition(
      access.context, access.assignments, request.params.requisitionId, request.body.expectedVersion,
    );
  });

  server.post<{
    Params: { requisitionId: string };
    Body: { expectedVersion: number; decision: "approve" | "reject"; reason: string };
  }>("/v1/procurement-requisitions/:requisitionId/review", async (request) => {
    const access = await accessFor(request, dependencies);
    return projectControls.reviewProcurementRequisition(
      access.context, access.assignments, request.params.requisitionId,
      request.body.expectedVersion, request.body.decision, request.body.reason,
    );
  });

  server.post<{ Params: { projectId: string }; Body: CreateProcurementBidPackageInput }>(
    "/v1/projects/:projectId/procurement-bid-packages",
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      return reply.code(201).send(await projectControls.createProcurementBidPackage(
        access.context, access.assignments, request.params.projectId, request.body,
      ));
    },
  );

  server.post<{
    Params: { bidPackageId: string };
    Body: ProcurementOfferHttp & { expectedVersion: number };
  }>("/v1/procurement-bid-packages/:bidPackageId/offers", async (request) => {
    const access = await accessFor(request, dependencies);
    const { expectedVersion, ...offer } = request.body;
    return projectControls.recordProcurementOffer(
      access.context, access.assignments, request.params.bidPackageId, expectedVersion,
      { ...offer, validUntil: new Date(offer.validUntil), promisedDate: new Date(offer.promisedDate) },
    );
  });

  server.post<{
    Params: { bidPackageId: string };
    Body: { expectedVersion: number; offerKey: string; reason: string };
  }>("/v1/procurement-bid-packages/:bidPackageId/recommend", async (request) => {
    const access = await accessFor(request, dependencies);
    return projectControls.recommendProcurementOffer(
      access.context, access.assignments, request.params.bidPackageId,
      request.body.expectedVersion, request.body.offerKey, request.body.reason,
    );
  });

  server.post<{ Params: { bidPackageId: string }; Body: AwardProcurementInput }>(
    "/v1/procurement-bid-packages/:bidPackageId/award",
    async (request) => {
      const access = await accessFor(request, dependencies);
      return projectControls.awardProcurementOffer(
        access.context, access.assignments, request.params.bidPackageId, request.body,
      );
    },
  );

  server.post<{
    Params: { commitmentId: string };
    Body: Omit<RecordProcurementStatusInput, "promisedAt" | "forecastAt" | "actualAt"> & {
      promisedAt: string | null; forecastAt: string | null; actualAt: string | null;
    };
  }>("/v1/procurement-commitments/:commitmentId/status-events", async (request) => {
    const access = await accessFor(request, dependencies);
    return projectControls.recordProcurementStatus(
      access.context, access.assignments, request.params.commitmentId,
      { ...request.body,
        promisedAt: request.body.promisedAt ? new Date(request.body.promisedAt) : null,
        forecastAt: request.body.forecastAt ? new Date(request.body.forecastAt) : null,
        actualAt: request.body.actualAt ? new Date(request.body.actualAt) : null },
    );
  });

  server.post<{ Params: { projectId: string }; Body: CreateScheduleProgramInput }>(
    "/v1/projects/:projectId/schedules",
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      return reply.code(201).send(await projectControls.createScheduleProgram(
        access.context, access.assignments, request.params.projectId, request.body,
      ));
    },
  );

  server.post<{
    Params: { scheduleId: string };
    Body: CreateScheduleRevisionHttp & { expectedScheduleVersion: number };
  }>("/v1/schedules/:scheduleId/revisions", async (request, reply) => {
    const access = await accessFor(request, dependencies);
    const { expectedScheduleVersion, ...body } = request.body;
    return reply.code(201).send(await projectControls.createScheduleRevision(
      access.context, access.assignments, request.params.scheduleId, expectedScheduleVersion,
      { ...body, dataDate: new Date(body.dataDate), activities: body.activities.map(scheduleActivityFromHttp) },
    ));
  });

  server.post<{
    Params: { revisionId: string };
    Body: { expectedVersion: number };
  }>("/v1/schedule-revisions/:revisionId/submit", async (request) => {
    const access = await accessFor(request, dependencies);
    return projectControls.submitScheduleRevision(
      access.context, access.assignments, request.params.revisionId, request.body.expectedVersion,
    );
  });

  server.post<{
    Params: { revisionId: string };
    Body: { expectedVersion: number; decision: "approve" | "reject"; reason: string };
  }>("/v1/schedule-revisions/:revisionId/review", async (request) => {
    const access = await accessFor(request, dependencies);
    return projectControls.reviewScheduleRevision(
      access.context, access.assignments, request.params.revisionId,
      request.body.expectedVersion, request.body.decision, request.body.reason,
    );
  });

  server.get<{
    Params: { scheduleId: string };
    Querystring: { windowDays: number };
  }>("/v1/schedules/:scheduleId/look-ahead", async (request) => {
    const access = await accessFor(request, dependencies);
    return projectControls.scheduleLookAhead(
      access.context, access.assignments, request.params.scheduleId, Number(request.query.windowDays),
    );
  });

  server.post<{ Params: { scheduleId: string }; Body: PreviewScheduleImportHttp }>(
    "/v1/schedules/:scheduleId/imports/preview",
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      return reply.code(201).send(await projectControls.previewScheduleImport(
        access.context, access.assignments, request.params.scheduleId,
        { ...request.body, dataDate: new Date(request.body.dataDate),
          activities: request.body.activities.map(scheduleActivityFromHttp) },
      ));
    },
  );

  server.post<{
    Params: { importId: string };
    Body: { expectedVersion: number };
  }>("/v1/schedule-imports/:importId/commit", async (request) => {
    const access = await accessFor(request, dependencies);
    return projectControls.commitScheduleImport(
      access.context, access.assignments, request.params.importId, request.body.expectedVersion,
    );
  });

  server.get("/v1/session", async (request) => {
    const access = await accessFor(request, dependencies);
    return {
      userId: access.context.userId,
      actingOrganizationId: access.context.actingOrganizationId,
      assurance: access.context.assurance,
      assignmentCount: access.assignments.length,
      environment: dependencies.environment,
      training: dependencies.trainingBanner,
    };
  });

  server.post<{ Body: CreateProjectInput }>(
    "/v1/projects",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: [
            "businessScopeOrganizationId",
            "number",
            "name",
            "customerOrganizationId",
            "facilityId",
            "timeZone",
            "readiness",
          ],
          properties: {
            businessScopeOrganizationId: { type: "string", minLength: 1 },
            number: { type: "string", minLength: 1 },
            name: { type: "string", minLength: 1 },
            customerOrganizationId: { type: "string", minLength: 1 },
            facilityId: { type: "string", minLength: 1 },
            timeZone: { type: "string", minLength: 1 },
            readiness: projectReadinessSchema,
          },
        },
      },
    },
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      const project = await dependencies.service.createProject(access.context, access.assignments, request.body);
      return reply.code(201).send(project);
    },
  );

  server.get("/v1/projects", async (request) => {
    const access = await accessFor(request, dependencies);
    return dependencies.service.listProjects(access.context, access.assignments);
  });

  server.get<{ Params: { projectId: string } }>("/v1/projects/:projectId/readiness", async (request) => {
    const access = await accessFor(request, dependencies);
    return dependencies.service.projectReadiness(access.context, access.assignments, request.params.projectId);
  });

  server.post<{ Params: { projectId: string }; Body: { expectedVersion: number } }>(
    "/v1/projects/:projectId/activate",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["projectId"],
          properties: { projectId: { type: "string", minLength: 1 } },
        },
        body: {
          type: "object",
          additionalProperties: false,
          required: ["expectedVersion"],
          properties: { expectedVersion: { type: "integer", minimum: 1 } },
        },
      },
    },
    async (request) => {
      const access = await accessFor(request, dependencies);
      return dependencies.service.activateProject(
        access.context,
        access.assignments,
        request.params.projectId,
        request.body.expectedVersion,
      );
    },
  );

  server.post<{ Params: { projectId: string }; Body: RegisterDocumentInput }>(
    "/v1/projects/:projectId/documents",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["projectId"],
          properties: { projectId: { type: "string", minLength: 1 } },
        },
        body: {
          type: "object",
          additionalProperties: false,
          required: ["number", "title", "type", "discipline"],
          properties: {
            number: { type: "string", minLength: 1 },
            title: { type: "string", minLength: 1 },
            type: { type: "string", minLength: 1 },
            discipline: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      const document = await dependencies.service.registerDocument(
        access.context,
        access.assignments,
        request.params.projectId,
        request.body,
      );
      return reply.code(201).send(document);
    },
  );

  server.post<{ Params: { documentId: string }; Body: SubmitDocumentRevisionInput }>(
    "/v1/documents/:documentId/revisions",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["documentId"],
          properties: { documentId: { type: "string", minLength: 1 } },
        },
        body: {
          type: "object",
          additionalProperties: false,
          required: ["revision", "purpose", "source", "fileId", "requiredApprovalCount"],
          properties: {
            revision: { type: "string", minLength: 1 },
            purpose: { type: "string", minLength: 1 },
            source: { type: "string", minLength: 1 },
            fileId: { type: "string", minLength: 1 },
            requiredApprovalCount: { type: "integer", minimum: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      const revision = await dependencies.service.submitDocumentRevision(
        access.context,
        access.assignments,
        request.params.documentId,
        request.body,
      );
      return reply.code(201).send(revision);
    },
  );

  server.post<{
    Params: { revisionId: string };
    Body: { expectedVersion: number; independentApprovalRequired: boolean };
  }>("/v1/revisions/:revisionId/approve", async (request) => {
    const access = await accessFor(request, dependencies);
    return dependencies.service.approveDocumentRevision(
      access.context,
      access.assignments,
      request.params.revisionId,
      request.body.expectedVersion,
      request.body.independentApprovalRequired,
    );
  });

  server.post<{
    Params: { projectId: string };
    Headers: { "x-eiep-retention-class"?: string; "x-idempotency-key"?: string };
  }>(
    "/v1/projects/:projectId/file-uploads",
    {
      schema: {
        consumes: ["multipart/form-data"],
        params: {
          type: "object", additionalProperties: false, required: ["projectId"],
          properties: { projectId: { type: "string", minLength: 1 } },
        },
        headers: {
          type: "object",
          required: ["x-eiep-retention-class"],
          properties: {
            "x-eiep-retention-class": { type: "string", minLength: 1, maxLength: 128 },
            "x-idempotency-key": { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$" },
          },
        },
      },
    },
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      await platform.authorizeFileUpload(access.context, access.assignments, request.params.projectId);
      if (!dependencies.stagedUpload) {
        return reply.code(503).send({ error: "file_storage_unavailable", correlationId: request.id });
      }
      const part = await request.file();
      if (!part || part.fieldname !== "file") {
        throw new ValidationError("A single multipart file field named file is required.", ["upload_file_required"]);
      }
      if (!part.filename || part.filename.length > 255 || /[\u0000-\u001f\u007f]/u.test(part.filename)) {
        throw new ValidationError("The uploaded filename is invalid.", ["upload_filename_invalid"]);
      }
      const content = await part.toBuffer();
      if (part.file.truncated || content.length < 1 || content.length > 250 * 1024 * 1024) {
        return reply.code(413).send({ error: "payload_too_large", correlationId: request.id });
      }
      const idempotencyKey = request.headers["x-idempotency-key"];
      const objectId = idempotencyKey
        ? createHash("sha256").update(`${access.context.userId}\n${request.params.projectId}\n${idempotencyKey}`).digest("hex")
        : randomUUID();
      const storageKey = `${request.params.projectId}/${objectId}`;
      const sha256 = createHash("sha256").update(content).digest("hex");
      await dependencies.stagedUpload.putStaged(storageKey, content);
      const staged = await platform.stageFile(access.context, access.assignments, request.params.projectId, {
        storageKey,
        originalFilename: part.filename,
        declaredMediaType: part.mimetype,
        sha256,
        sizeBytes: content.length,
        retentionClass: request.headers["x-eiep-retention-class"]!,
      });
      return reply.code(201).send(staged);
    },
  );

  server.post<{ Params: { fileId: string }; Body: ValidateFileInput & { expectedVersion: number } }>(
    "/v1/files/:fileId/validation",
    async (request) => {
      const access = await accessFor(request, dependencies);
      const { expectedVersion, ...input } = request.body;
      return platform.validateFile(access.context, access.assignments, request.params.fileId, expectedVersion, input);
    },
  );

  server.get<{ Params: { fileId: string } }>("/v1/files/:fileId", async (request) => {
    const access = await accessFor(request, dependencies);
    return platform.fileStatus(access.context, access.assignments, request.params.fileId);
  });

  server.post<{ Params: { fileId: string }; Body: { expectedVersion: number } }>(
    "/v1/files/:fileId/release",
    async (request) => {
      const access = await accessFor(request, dependencies);
      return platform.releaseFile(access.context, access.assignments, request.params.fileId, request.body.expectedVersion);
    },
  );

  server.get<{ Params: { fileId: string } }>("/v1/files/:fileId/download", async (request) => {
    const access = await accessFor(request, dependencies);
    return platform.downloadFile(access.context, access.assignments, request.params.fileId);
  });

  server.post<{ Params: { projectId: string }; Body: StageImportInput }>(
    "/v1/projects/:projectId/imports",
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      return reply.code(201).send(await platform.stageImport(
        access.context, access.assignments, request.params.projectId, request.body,
      ));
    },
  );

  server.post<{ Params: { importJobId: string }; Body: { expectedVersion: number } }>(
    "/v1/imports/:importJobId/validate",
    async (request) => {
      const access = await accessFor(request, dependencies);
      return platform.validateImport(access.context, access.assignments, request.params.importJobId, request.body.expectedVersion);
    },
  );

  server.post<{ Params: { importJobId: string }; Body: { expectedVersion: number } }>(
    "/v1/imports/:importJobId/commit",
    async (request) => {
      const access = await accessFor(request, dependencies);
      return platform.commitImport(access.context, access.assignments, request.params.importJobId, request.body.expectedVersion);
    },
  );

  server.post<{ Params: { projectId: string }; Body: RequestExportInput }>(
    "/v1/projects/:projectId/exports",
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      return reply.code(202).send(await platform.requestExport(
        access.context, access.assignments, request.params.projectId, request.body,
      ));
    },
  );

  server.post<{ Params: { exportJobId: string }; Body: { expectedVersion: number } }>(
    "/v1/exports/:exportJobId/process",
    async (request) => {
      const access = await accessFor(request, dependencies);
      return platform.processExport(access.context, access.assignments, request.params.exportJobId, request.body.expectedVersion);
    },
  );

  server.get<{ Params: { exportJobId: string } }>("/v1/exports/:exportJobId/download", async (request) => {
    const access = await accessFor(request, dependencies);
    return platform.downloadExport(access.context, access.assignments, request.params.exportJobId);
  });

  server.post<{ Params: { projectId: string }; Body: ReceiveIntegrationInput }>(
    "/v1/projects/:projectId/integrations/inbox",
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      return reply.code(202).send(await platform.receiveIntegration(
        access.context, access.assignments, request.params.projectId, request.body,
      ));
    },
  );

  server.post<{
    Params: { messageId: string };
    Body: { expectedVersion: number; outcome: "success" | "failure"; errorReason: string | null };
  }>("/v1/integrations/:messageId/process", async (request) => {
    const access = await accessFor(request, dependencies);
    return platform.processIntegration(
      access.context, access.assignments, request.params.messageId, request.body.expectedVersion,
      request.body.outcome, request.body.errorReason,
    );
  });

  server.post<{
    Params: { messageId: string };
    Body: { expectedVersion: number; resolution: "accept" | "replay"; reason: string };
  }>("/v1/integrations/:messageId/reconcile", async (request) => {
    const access = await accessFor(request, dependencies);
    return platform.reconcileIntegration(
      access.context, access.assignments, request.params.messageId, request.body.expectedVersion,
      request.body.resolution, request.body.reason,
    );
  });

  server.put<{
    Params: { projectId: string };
    Body: ConfigureNotificationSubscriptionInput;
  }>("/v1/projects/:projectId/notification-subscription", async (request) => {
    const access = await accessFor(request, dependencies);
    return platform.configureNotificationSubscription(
      access.context, access.assignments, request.params.projectId, request.body,
    );
  });

  server.post<{
    Params: { projectId: string };
    Body: DispatchNotificationInput;
  }>("/v1/projects/:projectId/notifications/dispatch", async (request, reply) => {
    const access = await accessFor(request, dependencies);
    return reply.code(202).send(await platform.dispatchNotification(
      access.context, access.assignments, request.params.projectId, request.body,
    ));
  });

  server.post<{
    Params: { notificationId: string };
    Body: { expectedVersion: number; outcome: "success" | "failure"; errorReason: string | null };
  }>("/v1/notifications/:notificationId/process", async (request) => {
    const access = await accessFor(request, dependencies);
    return platform.processNotification(
      access.context, access.assignments, request.params.notificationId, request.body.expectedVersion,
      request.body.outcome, request.body.errorReason,
    );
  });

  server.get<{ Params: { projectId: string } }>("/v1/projects/:projectId/notifications", async (request) => {
    const access = await accessFor(request, dependencies);
    return platform.listNotifications(access.context, access.assignments, request.params.projectId);
  });

  server.get<{ Params: { projectId: string }; Querystring: { q: string } }>(
    "/v1/projects/:projectId/search",
    async (request) => {
      const access = await accessFor(request, dependencies);
      return platform.searchProjectRecords(access.context, access.assignments, request.params.projectId, request.query.q);
    },
  );

  server.get<{ Querystring: { operation: string } }>("/v1/connectivity-policy", async (request) =>
    platform.connectivityPolicy(request.query.operation));

  server.post<{
    Params: { projectId: string };
    Body: Omit<QueueOfflineDraftInput, "originalAt"> & { originalAt: string };
  }>("/v1/projects/:projectId/offline-drafts", async (request, reply) => {
    const access = await accessFor(request, dependencies);
    return reply.code(202).send(await platform.queueOfflineDraft(
      access.context, access.assignments, request.params.projectId,
      { ...request.body, originalAt: new Date(request.body.originalAt) },
    ));
  });

  server.post<{
    Params: { draftId: string };
    Body: { expectedVersion: number; outcome: "accept" | "conflict" | "reject"; conflictReason: string | null };
  }>("/v1/offline-drafts/:draftId/synchronize", async (request) => {
    const access = await accessFor(request, dependencies);
    return platform.synchronizeOfflineDraft(
      access.context, access.assignments, request.params.draftId, request.body.expectedVersion,
      request.body.outcome, request.body.conflictReason,
    );
  });

  server.post<{ Params: { revisionId: string }; Body: DistributeDocumentRevisionInput }>(
    "/v1/revisions/:revisionId/distributions",
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      return reply.code(201).send(await dependencies.service.distributeDocumentRevision(
        access.context, access.assignments, request.params.revisionId, request.body,
      ));
    },
  );

  server.post<{ Params: { distributionId: string }; Body: { expectedVersion: number } }>(
    "/v1/document-distributions/:distributionId/download",
    async (request) => {
      const access = await accessFor(request, dependencies);
      return dependencies.service.downloadDistributedDocument(
        access.context, access.assignments, request.params.distributionId, request.body.expectedVersion,
      );
    },
  );

  server.post<{ Params: { distributionId: string }; Body: { expectedVersion: number; meaning: string } }>(
    "/v1/document-distributions/:distributionId/acknowledge",
    async (request) => {
      const access = await accessFor(request, dependencies);
      return dependencies.service.acknowledgeDocumentDistribution(
        access.context, access.assignments, request.params.distributionId, request.body.expectedVersion, request.body.meaning,
      );
    },
  );

  server.post<{ Params: { projectId: string }; Body: LinkGoverningDocumentInput }>(
    "/v1/projects/:projectId/governing-document-links",
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      return reply.code(201).send(await dependencies.service.linkGoverningDocumentRevision(
        access.context, access.assignments, request.params.projectId, request.body,
      ));
    },
  );

  server.post<{
    Params: { revisionId: string };
    Body: { expectedRevisionVersion: number; expectedDocumentVersion: number };
  }>("/v1/revisions/:revisionId/release", async (request) => {
    const access = await accessFor(request, dependencies);
    return dependencies.service.releaseDocumentRevision(
      access.context,
      access.assignments,
      request.params.revisionId,
      request.body.expectedRevisionVersion,
      request.body.expectedDocumentVersion,
    );
  });

  server.get<{ Params: { documentId: string } }>("/v1/documents/:documentId/current", async (request) => {
    const access = await accessFor(request, dependencies);
    return dependencies.service.currentDocumentRevision(
      access.context,
      access.assignments,
      request.params.documentId,
    );
  });

  server.get<{ Params: { projectId: string } }>("/v1/projects/:projectId/audit", async (request) => {
    const access = await accessFor(request, dependencies);
    return dependencies.service.auditHistory(access.context, access.assignments, request.params.projectId);
  });

  server.post<{ Params: { projectId: string }; Body: ProposeRetentionPolicyInput }>(
    "/v1/projects/:projectId/retention-policies",
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      return reply.code(201).send(await dependencies.service.proposeRetentionPolicy(
        access.context, access.assignments, request.params.projectId, request.body,
      ));
    },
  );

  server.post<{ Params: { policyId: string }; Body: { expectedVersion: number } }>(
    "/v1/retention-policies/:policyId/approve",
    async (request) => {
      const access = await accessFor(request, dependencies);
      return dependencies.service.approveRetentionPolicy(
        access.context, access.assignments, request.params.policyId, request.body.expectedVersion,
      );
    },
  );

  server.post<{
    Params: { projectId: string };
    Body: { targetType: string; targetId: string; reason: string };
  }>("/v1/projects/:projectId/legal-holds", async (request, reply) => {
    const access = await accessFor(request, dependencies);
    return reply.code(201).send(await dependencies.service.placeLegalHold(
      access.context, access.assignments, request.params.projectId,
      request.body.targetType, request.body.targetId, request.body.reason,
    ));
  });

  server.post<{ Params: { holdId: string }; Body: { expectedVersion: number; reason: string } }>(
    "/v1/legal-holds/:holdId/release",
    async (request) => {
      const access = await accessFor(request, dependencies);
      return dependencies.service.releaseLegalHold(
        access.context, access.assignments, request.params.holdId, request.body.expectedVersion, request.body.reason,
      );
    },
  );

  server.post<{
    Params: { projectId: string };
    Body: { recordClass: string; targetId: string; reason: string };
  }>("/v1/projects/:projectId/retention-dispositions", async (request, reply) => {
    const access = await accessFor(request, dependencies);
    return reply.code(201).send(await dependencies.service.requestRetentionDisposition(
      access.context, access.assignments, request.params.projectId,
      request.body.recordClass, request.body.targetId, request.body.reason,
    ));
  });

  server.post<{ Params: { dispositionId: string }; Body: { expectedVersion: number } }>(
    "/v1/retention-dispositions/:dispositionId/approve",
    async (request) => {
      const access = await accessFor(request, dependencies);
      return dependencies.service.approveRetentionDisposition(
        access.context, access.assignments, request.params.dispositionId, request.body.expectedVersion,
      );
    },
  );

  server.post<{ Params: { dispositionId: string }; Body: { expectedVersion: number } }>(
    "/v1/retention-dispositions/:dispositionId/execute",
    async (request) => {
      const access = await accessFor(request, dependencies);
      return dependencies.service.executeRetentionDisposition(
        access.context, access.assignments, request.params.dispositionId, request.body.expectedVersion,
      );
    },
  );

  server.post<{ Params: { projectId: string }; Body: ReceiveMaterialInput }>(
    "/v1/projects/:projectId/materials",
    {
      schema: {
        params: { type: "object", additionalProperties: false, required: ["projectId"], properties: { projectId: { type: "string", minLength: 1 } } },
        body: {
          type: "object", additionalProperties: false,
          required: ["projectConfigurationRevisionId", "identifier", "receiptNumber", "purchaseReference", "vendorOrganizationId", "specification", "grade", "form", "dimensions", "quantity", "unitCode", "heatLot", "mtrDocumentRevisionId", "receiptEvidenceFileIds", "storageLocation", "mtrRequired", "receivingInspectionRequired", "pmiRequired", "governingPmiRule"],
          properties: {
            projectConfigurationRevisionId: { type: "string", minLength: 1 },
            identifier: { type: "string", minLength: 1 }, receiptNumber: { type: "string", minLength: 1 },
            purchaseReference: { type: "string", minLength: 1 }, vendorOrganizationId: { type: "string", minLength: 1 },
            specification: { type: "string", minLength: 1 }, grade: { type: "string", minLength: 1 },
            form: { type: "string", minLength: 1 }, dimensions: { type: "string", minLength: 1 },
            quantity: { type: "string", pattern: "^(0|[1-9]\\d*)(?:\\.\\d+)?$" }, unitCode: { type: "string", minLength: 1 },
            heatLot: { type: "string", minLength: 1 }, mtrDocumentRevisionId: { type: ["string", "null"] },
            receiptEvidenceFileIds: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", minLength: 1 } },
            storageLocation: { type: "string", minLength: 1 }, mtrRequired: { type: "boolean" },
            receivingInspectionRequired: { type: "boolean" }, pmiRequired: { type: "boolean" },
            governingPmiRule: { type: ["string", "null"] },
          },
        },
      },
    },
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      return reply.code(201).send(await dependencies.operations.receiveMaterial(access.context, access.assignments, request.params.projectId, request.body));
    },
  );

  server.post<{ Params: { materialId: string }; Body: { expectedVersion: number } }>(
    "/v1/materials/:materialId/receiving-inspection/accept",
    async (request) => {
      const access = await accessFor(request, dependencies);
      return dependencies.operations.acceptReceivingInspection(access.context, access.assignments, request.params.materialId, request.body.expectedVersion);
    },
  );

  server.get<{ Params: { materialId: string } }>("/v1/materials/:materialId/mtr-reviews", async (request) => {
    const access = await accessFor(request, dependencies);
    return dependencies.operations.mtrReviews(access.context, access.assignments, request.params.materialId);
  });

  server.post<{ Params: { materialId: string }; Body: ReviewMtrInput & { expectedVersion: number } }>(
    "/v1/materials/:materialId/mtr-reviews",
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      const { expectedVersion, ...input } = request.body;
      return reply.code(201).send(await dependencies.operations.reviewMtr(
        access.context, access.assignments, request.params.materialId, expectedVersion, input,
      ));
    },
  );

  server.get<{ Params: { materialId: string } }>("/v1/materials/:materialId/movements", async (request) => {
    const access = await accessFor(request, dependencies);
    return dependencies.operations.materialMovements(access.context, access.assignments, request.params.materialId);
  });

  server.post<{ Params: { materialId: string }; Body: MoveMaterialInput & { expectedVersion: number } }>(
    "/v1/materials/:materialId/move",
    async (request) => {
      const access = await accessFor(request, dependencies);
      const { expectedVersion, ...input } = request.body;
      return dependencies.operations.moveMaterial(access.context, access.assignments, request.params.materialId, expectedVersion, input);
    },
  );

  server.post<{ Params: { materialId: string }; Body: MoveMaterialInput & { expectedVersion: number } }>(
    "/v1/materials/:materialId/return",
    async (request) => {
      const access = await accessFor(request, dependencies);
      const { expectedVersion, ...input } = request.body;
      return dependencies.operations.returnMaterial(access.context, access.assignments, request.params.materialId, expectedVersion, input);
    },
  );

  server.post<{ Params: { materialId: string }; Body: SplitMaterialInput & { expectedVersion: number } }>(
    "/v1/materials/:materialId/split",
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      const { expectedVersion, ...input } = request.body;
      return reply.code(201).send(await dependencies.operations.splitMaterial(access.context, access.assignments, request.params.materialId, expectedVersion, input));
    },
  );

  server.post<{ Params: { projectId: string }; Body: Omit<RegisterEquipmentInput, "validFrom" | "validTo"> & { validFrom: string; validTo: string } }>(
    "/v1/projects/:projectId/inspection-equipment",
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      const input: RegisterEquipmentInput = { ...request.body, validFrom: new Date(request.body.validFrom), validTo: new Date(request.body.validTo) };
      if (Number.isNaN(input.validFrom.getTime()) || Number.isNaN(input.validTo.getTime())) throw new ValidationError("Equipment validity timestamps are invalid.", ["equipment_validity_invalid"]);
      return reply.code(201).send(await dependencies.operations.registerEquipment(access.context, access.assignments, request.params.projectId, input));
    },
  );

  server.post<{ Params: { projectId: string }; Body: SubmitInspectionPlanInput }>(
    "/v1/projects/:projectId/inspection-plans/revisions",
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      return reply.code(201).send(await dependencies.operations.submitInspectionPlanRevision(
        access.context, access.assignments, request.params.projectId, request.body,
      ));
    },
  );

  server.post<{ Params: { planRevisionId: string }; Body: { expectedVersion: number } }>(
    "/v1/inspection-plans/:planRevisionId/approve",
    async (request) => {
      const access = await accessFor(request, dependencies);
      return dependencies.operations.approveInspectionPlanRevision(
        access.context, access.assignments, request.params.planRevisionId, request.body.expectedVersion,
      );
    },
  );

  server.post<{ Params: { projectId: string }; Body: Omit<SubmitInspectionInput, "performedAt"> & { performedAt: string } }>(
    "/v1/projects/:projectId/inspections",
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      const input: SubmitInspectionInput = { ...request.body, performedAt: new Date(request.body.performedAt) };
      return reply.code(201).send(await dependencies.operations.submitInspection(
        access.context, access.assignments, request.params.projectId, input,
      ));
    },
  );

  server.post<{ Params: { inspectionId: string }; Body: { expectedVersion: number; decision: "accept" | "reject"; meaningOrReason: string } }>(
    "/v1/inspections/:inspectionId/review",
    async (request) => {
      const access = await accessFor(request, dependencies);
      return dependencies.operations.reviewInspection(
        access.context, access.assignments, request.params.inspectionId, request.body.expectedVersion,
        request.body.decision, request.body.meaningOrReason,
      );
    },
  );

  server.get<{ Params: { materialId: string } }>("/v1/materials/:materialId/pmi-requirement", async (request) => {
    const access = await accessFor(request, dependencies);
    return dependencies.operations.pmiRequirement(access.context, access.assignments, request.params.materialId);
  });

  server.post<{ Params: { materialId: string }; Body: ProposePmiOverrideInput }>(
    "/v1/materials/:materialId/pmi-overrides",
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      const override = await dependencies.operations.proposePmiOverride(
        access.context, access.assignments, request.params.materialId, request.body,
      );
      return reply.code(201).send(override);
    },
  );

  server.post<{
    Params: { overrideId: string };
    Body: { expectedVersion: number; expectedMaterialVersion: number };
  }>("/v1/pmi-overrides/:overrideId/approve", async (request) => {
    const access = await accessFor(request, dependencies);
    return dependencies.operations.approvePmiOverride(
      access.context, access.assignments, request.params.overrideId,
      request.body.expectedVersion, request.body.expectedMaterialVersion,
    );
  });

  server.post<{ Params: { materialId: string }; Body: Omit<RecordPmiInput, "inspectedAt"> & { inspectedAt: string } }>(
    "/v1/materials/:materialId/pmi",
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      const input: RecordPmiInput = { ...request.body, inspectedAt: new Date(request.body.inspectedAt) };
      if (Number.isNaN(input.inspectedAt.getTime())) throw new ValidationError("The inspection timestamp is invalid.", ["inspection_time_invalid"]);
      return reply.code(201).send(await dependencies.operations.recordPmi(access.context, access.assignments, request.params.materialId, input));
    },
  );

  server.post<{ Params: { pmiId: string }; Body: { expectedVersion: number } }>("/v1/pmi/:pmiId/accept", async (request) => {
    const access = await accessFor(request, dependencies);
    return dependencies.operations.acceptPmi(access.context, access.assignments, request.params.pmiId, request.body.expectedVersion);
  });

  server.post<{ Params: { materialId: string }; Body: { expectedVersion: number } }>("/v1/materials/:materialId/release", async (request) => {
    const access = await accessFor(request, dependencies);
    return dependencies.operations.releaseMaterial(access.context, access.assignments, request.params.materialId, request.body.expectedVersion);
  });

  server.post<{ Params: { materialId: string }; Body: { expectedVersion: number } }>("/v1/materials/:materialId/issue", async (request) => {
    const access = await accessFor(request, dependencies);
    return dependencies.operations.issueMaterial(access.context, access.assignments, request.params.materialId, request.body.expectedVersion);
  });

  server.get<{ Params: { projectId: string } }>("/v1/projects/:projectId/reports", async (request) => {
    const access = await accessFor(request, dependencies);
    return reporting.reportsForProject(access.context, access.assignments, request.params.projectId);
  });

  server.get<{ Params: { projectId: string } }>("/v1/projects/:projectId/report-dashboard", async (request) => {
    const access = await accessFor(request, dependencies);
    return reporting.dashboard(access.context, access.assignments, request.params.projectId);
  });

  server.post<{ Params: { projectId: string }; Body: GenerateControlledReportInput }>(
    "/v1/projects/:projectId/reports",
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      return reply.code(201).send(await reporting.generate(
        access.context, access.assignments, request.params.projectId, request.body,
      ));
    },
  );

  server.get<{ Params: { reportId: string } }>("/v1/reports/:reportId", async (request) => {
    const access = await accessFor(request, dependencies);
    return reporting.report(access.context, access.assignments, request.params.reportId);
  });

  server.get<{ Params: { reportId: string }; Querystring: { format: "html" | "json" } }>(
    "/v1/reports/:reportId/download",
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      const report = await reporting.download(access.context, access.assignments, request.params.reportId, request.query.format);
      if (request.query.format === "html") {
        return reply.type("text/html; charset=utf-8")
          .header("content-disposition", `attachment; filename="${report.filenameStem}.html"`)
          .send(report.printableHtml);
      }
      return reply.type("application/json; charset=utf-8")
        .header("content-disposition", `attachment; filename="${report.filenameStem}.json"`)
        .send(JSON.stringify(report.structuredContent));
    },
  );

  server.post<{ Params: { projectId: string }; Body: CreateNcrInput }>("/v1/projects/:projectId/ncrs", async (request, reply) => {
    const access = await accessFor(request, dependencies);
    return reply.code(201).send(await dependencies.operations.createNcr(access.context, access.assignments, request.params.projectId, request.body));
  });

  server.post<{ Params: { ncrId: string }; Body: { expectedVersion: number } & ProposeNcrDispositionInput }>("/v1/ncrs/:ncrId/disposition", async (request) => {
    const access = await accessFor(request, dependencies);
    return dependencies.operations.proposeNcrDisposition(access.context, access.assignments, request.params.ncrId,
      request.body.expectedVersion, { disposition: request.body.disposition, correctiveAction: request.body.correctiveAction });
  });

  server.post<{ Params: { ncrId: string }; Body: { expectedVersion: number } }>("/v1/ncrs/:ncrId/disposition/approve", async (request) => {
    const access = await accessFor(request, dependencies);
    return dependencies.operations.approveNcrDisposition(access.context, access.assignments, request.params.ncrId, request.body.expectedVersion);
  });

  server.post<{ Params: { ncrId: string }; Body: { expectedVersion: number; evidenceFileId: string } }>("/v1/ncrs/:ncrId/reinspection", async (request) => {
    const access = await accessFor(request, dependencies);
    return dependencies.operations.recordNcrReinspection(access.context, access.assignments, request.params.ncrId, request.body.expectedVersion, request.body.evidenceFileId);
  });

  server.post<{ Params: { ncrId: string }; Body: { expectedVersion: number } }>("/v1/ncrs/:ncrId/close", async (request) => {
    const access = await accessFor(request, dependencies);
    return dependencies.operations.closeNcr(access.context, access.assignments, request.params.ncrId, request.body.expectedVersion);
  });

  server.post<{ Params: { projectId: string }; Body: Omit<CreatePunchInput, "targetAt"> & { targetAt: string | null } }>(
    "/v1/projects/:projectId/punch-items",
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      const input: CreatePunchInput = { ...request.body, targetAt: request.body.targetAt ? new Date(request.body.targetAt) : null };
      return reply.code(201).send(await dependencies.operations.createPunch(
        access.context, access.assignments, request.params.projectId, input,
      ));
    },
  );

  server.post<{ Params: { punchId: string }; Body: { expectedVersion: number; evidenceFileIds: string[]; readyForVerification: boolean } }>(
    "/v1/punch-items/:punchId/owner-update",
    async (request) => {
      const access = await accessFor(request, dependencies);
      return dependencies.operations.updateOwnedPunch(
        access.context, access.assignments, request.params.punchId, request.body.expectedVersion,
        request.body.evidenceFileIds, request.body.readyForVerification,
      );
    },
  );

  server.post<{ Params: { punchId: string }; Body: { expectedVersion: number; verificationEvidenceFileId: string } }>(
    "/v1/punch-items/:punchId/verify",
    async (request) => {
      const access = await accessFor(request, dependencies);
      return dependencies.operations.verifyPunch(
        access.context, access.assignments, request.params.punchId, request.body.expectedVersion,
        request.body.verificationEvidenceFileId,
      );
    },
  );

  server.post<{ Params: { punchId: string }; Body: { expectedVersion: number; closureMeaning: string } }>(
    "/v1/punch-items/:punchId/close",
    async (request) => {
      const access = await accessFor(request, dependencies);
      return dependencies.operations.closePunch(
        access.context, access.assignments, request.params.punchId, request.body.expectedVersion,
        request.body.closureMeaning,
      );
    },
  );

  server.post<{ Body: GenerateTurnoverInput }>("/v1/turnover/generate", async (request, reply) => {
    const access = await accessFor(request, dependencies);
    return reply.code(201).send(await dependencies.operations.generateTurnover(access.context, access.assignments, request.body));
  });

  server.post<{ Params: { projectId: string }; Body: ConfigureCompletionBoundaryInput }>(
    "/v1/projects/:projectId/completion-boundaries",
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      return reply.code(201).send(await dependencies.operations.createCompletionBoundary(
        access.context, access.assignments, request.params.projectId, request.body,
      ));
    },
  );

  server.post<{ Params: { boundaryId: string }; Body: ConfigureTurnoverRequirementInput }>(
    "/v1/completion-boundaries/:boundaryId/turnover-requirements",
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      return reply.code(201).send(await dependencies.operations.configureTurnoverRequirement(
        access.context, access.assignments, request.params.boundaryId, request.body,
      ));
    },
  );

  server.post<{ Params: { boundaryId: string }; Body: CreateTurnoverPackageInput }>(
    "/v1/completion-boundaries/:boundaryId/turnover-packages",
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      return reply.code(201).send(await dependencies.operations.createTurnoverPackage(
        access.context, access.assignments, request.params.boundaryId, request.body,
      ));
    },
  );

  server.get<{ Params: { packageId: string } }>("/v1/turnover-packages/:packageId/readiness", async (request) => {
    const access = await accessFor(request, dependencies);
    return dependencies.operations.turnoverReadiness(access.context, access.assignments, request.params.packageId);
  });

  server.get<{ Params: { projectId: string; packageId: string }; Querystring: { from: string; to: string } }>(
    "/v1/projects/:projectId/turnover/:packageId/compare",
    async (request) => {
      const access = await accessFor(request, dependencies);
      return dependencies.operations.compareTurnoverVersions(access.context, access.assignments, request.params.projectId, request.params.packageId, Number(request.query.from), Number(request.query.to));
    },
  );

  server.post<{ Body: CreateSubcontractorProfileInput }>("/v1/subcontractors", async (request, reply) => {
    const access = await accessFor(request, dependencies);
    return reply.code(201).send(await dependencies.operations.createSubcontractorProfile(
      access.context, access.assignments, request.body,
    ));
  });

  server.post<{
    Params: { profileId: string };
    Body: Omit<VerifySubcontractorQualificationInput, "effectiveAt" | "expiresAt"> & {
      expectedProfileVersion: number; effectiveAt: string; expiresAt: string;
    };
  }>("/v1/subcontractors/:profileId/qualifications", async (request, reply) => {
    const access = await accessFor(request, dependencies);
    const { expectedProfileVersion, effectiveAt, expiresAt, ...body } = request.body;
    return reply.code(201).send(await dependencies.operations.verifySubcontractorQualification(
      access.context, access.assignments, request.params.profileId, expectedProfileVersion,
      { ...body, effectiveAt: new Date(effectiveAt), expiresAt: new Date(expiresAt) },
    ));
  });

  server.post<{ Params: { projectId: string; profileId: string }; Body: AssignSubcontractorInput }>(
    "/v1/projects/:projectId/subcontractors/:profileId/assignments",
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      return reply.code(201).send(await dependencies.operations.assignSubcontractorToProject(
        access.context, access.assignments, request.params.projectId, request.params.profileId, request.body,
      ));
    },
  );

  server.post<{ Params: { assignmentId: string }; Body: ConfigureMobilizationRequirementInput }>(
    "/v1/subcontractor-assignments/:assignmentId/mobilization-requirements",
    async (request, reply) => {
      const access = await accessFor(request, dependencies);
      return reply.code(201).send(await dependencies.operations.configureMobilizationRequirement(
        access.context, access.assignments, request.params.assignmentId, request.body,
      ));
    },
  );

  server.post<{ Params: { requirementId: string }; Body: SubmitMobilizationEvidenceInput & { expectedVersion: number } }>(
    "/v1/mobilization-requirements/:requirementId/submission",
    async (request) => {
      const access = await accessFor(request, dependencies);
      return dependencies.operations.submitMobilizationEvidence(
        access.context, access.assignments, request.params.requirementId, request.body.expectedVersion,
        { qualificationId: request.body.qualificationId, evidenceFileId: request.body.evidenceFileId },
      );
    },
  );

  server.post<{
    Params: { requirementId: string };
    Body: { expectedVersion: number; decision: "accept" | "reject"; reason: string };
  }>("/v1/mobilization-requirements/:requirementId/review", async (request) => {
    const access = await accessFor(request, dependencies);
    return dependencies.operations.reviewMobilizationRequirement(
      access.context, access.assignments, request.params.requirementId, request.body.expectedVersion,
      request.body.decision, request.body.reason,
    );
  });

  server.get<{ Params: { assignmentId: string } }>(
    "/v1/subcontractor-assignments/:assignmentId/mobilization-readiness",
    async (request) => {
      const access = await accessFor(request, dependencies);
      return dependencies.operations.evaluateMobilization(access.context, access.assignments, request.params.assignmentId);
    },
  );

  server.post<{ Params: { assignmentId: string }; Body: { expectedVersion: number } }>(
    "/v1/subcontractor-assignments/:assignmentId/mobilization-release",
    async (request) => {
      const access = await accessFor(request, dependencies);
      return dependencies.operations.releaseMobilization(
        access.context, access.assignments, request.params.assignmentId, request.body.expectedVersion,
      );
    },
  );

  server.get("/v1/portal/assigned-work", async (request) => {
    const access = await accessFor(request, dependencies);
    return dependencies.operations.portalAssignedWork(access.context, access.assignments);
  });

  server.post<{
    Params: { projectId: string; workPackageId: string };
    Body: SubmitSubcontractorRecordInput;
  }>("/v1/portal/projects/:projectId/work-packages/:workPackageId/submissions", async (request, reply) => {
    const access = await accessFor(request, dependencies);
    return reply.code(201).send(await dependencies.operations.submitSubcontractorRecord(
      access.context, access.assignments, request.params.projectId, request.params.workPackageId, request.body,
    ));
  });

  server.post<{
    Params: { submissionId: string };
    Body: { expectedVersion: number; decision: "accept" | "reject"; meaningOrReason: string };
  }>("/v1/subcontractor-submissions/:submissionId/review", async (request) => {
    const access = await accessFor(request, dependencies);
    return dependencies.operations.reviewSubcontractorSubmission(
      access.context, access.assignments, request.params.submissionId, request.body.expectedVersion,
      request.body.decision, request.body.meaningOrReason,
    );
  });

  return server;
}
