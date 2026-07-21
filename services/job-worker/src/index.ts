import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { ConflictError, type FoundationStore, type PlatformService } from "@eiep/api";
import type { FileProcessingWorker, ObjectStoragePort } from "@eiep/document-processing";
import type { OutboundTransport } from "@eiep/integration";
import type { AccessContext, IntegrationMessageRecord, NotificationRecord, RoleAssignment } from "@eiep/shared-types";
import {
  createTurnoverGenerationLog,
  type TurnoverRenderArtifacts,
  type TurnoverRenderInput,
} from "@eiep/turnover-renderer";

export interface NotificationDeliveryPort {
  deliver(notification: NotificationRecord): Promise<{ readonly outcome: "success" | "failure"; readonly errorReason: string | null }>;
}

export interface WorkerRunResult {
  readonly inspected: number;
  readonly completed: readonly string[];
  readonly retried: readonly string[];
  readonly deadLettered: readonly string[];
  readonly skipped: readonly string[];
  readonly conflicted: readonly string[];
}

export interface JobWorkerOptions {
  readonly batchSize: number;
  readonly workerId?: string;
  readonly leaseDurationMs?: number;
  readonly transports?: Readonly<Record<string, OutboundTransport>>;
  readonly notificationDelivery?: NotificationDeliveryPort;
  readonly fileProcessing?: Pick<FileProcessingWorker, "process">;
  readonly objectStorage?: ObjectStoragePort;
  readonly turnoverRenderer?: { render(input: TurnoverRenderInput): Promise<TurnoverRenderArtifacts> };
}

type MessageOutcome = "completed" | "retried" | "deadLettered" | "skipped";

function requiredPayloadId(message: IntegrationMessageRecord, key: string): string | null {
  const value = message.payload[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function sha256(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function turnoverArtifactKeys(projectId: string, versionId: string) {
  const prefix = `${projectId}/${versionId}`;
  return {
    pdf: `${prefix}/turnoverpdf`, manifest: `${prefix}/manifestjson`,
    csv: `${prefix}/manifestcsv`, log: `${prefix}/generationlog`,
  } as const;
}

const maximumTurnoverArtifactBytes = 512 * 1024 * 1024;

export class JobWorker {
  private readonly workerId: string;
  private readonly leaseDurationMs: number;

  public constructor(
    private readonly store: FoundationStore,
    private readonly platform: PlatformService,
    private readonly options: JobWorkerOptions,
  ) {
    if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 100) {
      throw new Error("Worker batch size must be between 1 and 100.");
    }
    this.workerId = options.workerId?.trim() || randomUUID();
    this.leaseDurationMs = options.leaseDurationMs ?? 60_000;
    if (!Number.isInteger(this.leaseDurationMs) || this.leaseDurationMs < 1_000 || this.leaseDurationMs > 900_000) {
      throw new Error("Worker lease duration must be between 1 second and 15 minutes.");
    }
  }

  public async runOnce(context: AccessContext, assignments: readonly RoleAssignment[]): Promise<WorkerRunResult> {
    const supportedInterfaces = new Set([
      "export.worker",
      ...(this.options.notificationDelivery ? ["notification.worker"] : []),
      ...(this.options.fileProcessing && this.options.objectStorage ? ["document-processing.worker"] : []),
      ...(this.options.objectStorage ? ["file-release.worker"] : []),
      ...(this.options.turnoverRenderer && this.options.objectStorage ? ["turnover-render.worker"] : []),
      ...Object.keys(this.options.transports ?? {}),
    ]);
    const leases = await this.store.claimIntegrationWork({
      ownerId: this.workerId,
      interfaceCodes: supportedInterfaces,
      limit: this.options.batchSize,
      now: new Date(),
      leaseDurationMs: this.leaseDurationMs,
    });
    const completed: string[] = [];
    const retried: string[] = [];
    const deadLettered: string[] = [];
    const skipped: string[] = [];
    const conflicted: string[] = [];
    const outcomes: Record<MessageOutcome, string[]> = { completed, retried, deadLettered, skipped };

    for (const lease of leases) {
      const message = lease.message;
      const heartbeat = this.startLeaseHeartbeat(message.id, lease.leaseToken);
      try {
        const outcome = await this.processMessage(context, assignments, message);
        await heartbeat.stop();
        if (heartbeat.lost()) throw new ConflictError("The worker lease expired or could not be renewed.");
        outcomes[outcome].push(message.id);
      } catch (error) {
        if (error instanceof Error && error.name === "ConflictError") conflicted.push(message.id);
        else throw error;
      } finally {
        await heartbeat.stop();
        await this.store.releaseIntegrationWorkLease(message.id, lease.leaseToken);
      }
    }

    return { inspected: leases.length, completed, retried, deadLettered, skipped, conflicted };
  }

  private async processMessage(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    message: IntegrationMessageRecord,
  ): Promise<MessageOutcome> {
    if (message.interfaceCode === "document-processing.worker") {
      return this.processFileValidation(context, assignments, message);
    }

    if (message.interfaceCode === "file-release.worker") {
      return this.processFileRelease(context, assignments, message);
    }

    if (message.interfaceCode === "turnover-render.worker") {
      return this.processTurnoverRender(context, assignments, message);
    }

    if (message.interfaceCode === "export.worker") {
      const exportJobId = requiredPayloadId(message, "exportJobId");
      const job = exportJobId
        ? await this.store.transaction((transaction) => transaction.exportJobById(exportJobId))
        : null;
      if (!job) {
        await this.platform.processIntegration(
          context, assignments, message.id, message.version, "permanent_failure", "export_job_missing",
        );
        return "deadLettered";
      }
      await this.platform.processExport(context, assignments, job.id, job.version);
      return "completed";
    }

    if (message.interfaceCode === "notification.worker") {
      const notificationId = requiredPayloadId(message, "notificationId");
      const notification = notificationId
        ? await this.store.transaction((transaction) => transaction.notificationById(notificationId))
        : null;
      if (!notification || !this.options.notificationDelivery) return "skipped";
      const delivery = await this.options.notificationDelivery.deliver(notification);
      const updated = await this.platform.processNotification(
        context, assignments, notification.id, notification.version, delivery.outcome, delivery.errorReason,
      );
      return updated.state === "delivered" ? "completed" : updated.state === "retry" ? "retried" : "deadLettered";
    }

    const transport = this.options.transports?.[message.interfaceCode];
    if (!transport) return "skipped";
    const result = await transport.deliver({
      messageId: message.id,
      schemaVersion: message.schemaVersion,
      idempotencyKey: message.idempotencyKey,
      correlationId: message.correlationId,
      causationId: null,
      occurredAtUtc: message.createdAt.toISOString(),
      payload: message.payload,
    });
    const outcome = result.disposition === "accepted" ? "success"
      : result.disposition === "permanent_failure" ? "permanent_failure" : "failure";
    const updated = await this.platform.processIntegration(
      context, assignments, message.id, message.version, outcome, result.errorCode,
    );
    return updated.state === "processed" ? "completed" : updated.state === "retry" ? "retried" : "deadLettered";
  }

  private async processFileValidation(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    message: IntegrationMessageRecord,
  ): Promise<MessageOutcome> {
    const fileId = requiredPayloadId(message, "fileId");
    const processor = this.options.fileProcessing;
    if (!fileId || !processor) {
      return this.failMessage(context, assignments, message, "document_processing_payload_invalid", true);
    }
    try {
      const file = await this.store.transaction((transaction) => transaction.governedFileById(fileId));
      if (!file) return this.failMessage(context, assignments, message, "governed_file_missing", true);
      if (file.validationState !== "staged") return this.completeMessage(context, assignments, message);
      const result = await processor.process({
        jobId: message.id, fileId: file.id, storageKey: file.storageKey,
        expectedSha256: file.sha256, declaredMediaType: file.declaredMediaType,
        maximumSizeBytes: file.sizeBytes, correlationId: message.correlationId,
      });
      if (!result.detectedMediaType || !result.detectedSha256) {
        return this.failMessage(context, assignments, message, "document_processing_storage_unavailable", true);
      }
      await this.platform.validateFile(context, assignments, file.id, file.version, {
        detectedMediaType: result.detectedMediaType,
        detectedSha256: result.detectedSha256,
        malwareState: result.malwareState,
        validatorVersion: `${result.validatorVersion}:${result.scanProvider}:${result.scanVersion}`,
        activeContentDetected: result.activeContentDetected,
        encryptedArchiveDetected: result.encryptedArchiveDetected,
      });
      return this.completeMessage(context, assignments, message);
    } catch {
      return this.failMessage(context, assignments, message, "document_processing_failed", false);
    }
  }

  private async processFileRelease(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    message: IntegrationMessageRecord,
  ): Promise<MessageOutcome> {
    const fileId = requiredPayloadId(message, "fileId");
    const storage = this.options.objectStorage;
    if (!fileId || !storage) return this.failMessage(context, assignments, message, "file_release_payload_invalid", true);
    try {
      const file = await this.store.transaction((transaction) => transaction.governedFileById(fileId));
      if (!file || file.validationState !== "released") {
        return this.failMessage(context, assignments, message, "released_file_missing", true);
      }
      await storage.release(file.storageKey);
      return this.completeMessage(context, assignments, message);
    } catch {
      return this.failMessage(context, assignments, message, "file_release_storage_failed", false);
    }
  }

  private async processTurnoverRender(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    message: IntegrationMessageRecord,
  ): Promise<MessageOutcome> {
    const versionId = requiredPayloadId(message, "turnoverPackageVersionId");
    const renderer = this.options.turnoverRenderer;
    const storage = this.options.objectStorage;
    if (!versionId || !renderer || !storage) {
      return this.failMessage(context, assignments, message, "turnover_render_payload_invalid", true);
    }
    try {
      const renderInput = await this.store.transaction((transaction): TurnoverRenderInput | null => {
        const version = transaction.turnoverVersionById(versionId);
        const turnoverPackage = version ? transaction.turnoverPackageById(version.packageId) : null;
        const boundary = turnoverPackage ? transaction.completionBoundaryById(turnoverPackage.completionBoundaryId) : null;
        const project = version ? transaction.projectById(version.projectId) : null;
        if (!version || !turnoverPackage || !boundary || !project) return null;
        const priorVersion = transaction.turnoverVersions(version.packageId)
          .filter((candidate) => candidate.versionNumber < version.versionNumber)
          .sort((left, right) => right.versionNumber - left.versionNumber)[0];
        return {
          version, ...(priorVersion ? { priorVersion } : {}),
          projectNumber: project.number, projectName: project.name,
          packageCode: turnoverPackage.code, boundaryCode: boundary.code, boundaryName: boundary.name,
        };
      });
      if (!renderInput) return this.failMessage(context, assignments, message, "turnover_render_source_missing", true);
      const keys = turnoverArtifactKeys(renderInput.version.projectId, renderInput.version.id);
      const existingLog = await storage.readGenerated(keys.log, 1024 * 1024);
      if (existingLog) {
        await this.verifyExistingTurnoverArtifacts(storage, keys, renderInput.version.id, existingLog);
        return this.completeMessage(context, assignments, message);
      }
      const existingPdf = await storage.readGenerated(keys.pdf, maximumTurnoverArtifactBytes);
      const rendered = await renderer.render(renderInput);
      const pdf = existingPdf ?? rendered.pdf;
      if (pdf.length < 5 || Buffer.from(pdf.subarray(0, 5)).toString("ascii") !== "%PDF-") {
        throw new Error("The turnover renderer did not produce a PDF artifact.");
      }
      const hashes = {
        pdfSha256: sha256(pdf), manifestJsonSha256: sha256(rendered.manifestJson),
        manifestCsvSha256: sha256(rendered.manifestCsv),
      };
      const generationLog = createTurnoverGenerationLog(renderInput.version, hashes);
      await storage.putGenerated(keys.manifest, rendered.manifestJson);
      await storage.putGenerated(keys.csv, rendered.manifestCsv);
      await storage.putGenerated(keys.pdf, pdf);
      await storage.putGenerated(keys.log, generationLog);
      return this.completeMessage(context, assignments, message);
    } catch {
      return this.failMessage(context, assignments, message, "turnover_render_failed", false);
    }
  }

  private async verifyExistingTurnoverArtifacts(
    storage: ObjectStoragePort,
    keys: ReturnType<typeof turnoverArtifactKeys>,
    versionId: string,
    generationLog: Uint8Array,
  ): Promise<void> {
    const parsed = JSON.parse(Buffer.from(generationLog).toString("utf8")) as {
      packageVersionId?: unknown;
      artifacts?: { pdfSha256?: unknown; manifestJsonSha256?: unknown; manifestCsvSha256?: unknown };
    };
    if (parsed.packageVersionId !== versionId || !parsed.artifacts) {
      throw new Error("The stored turnover generation log does not match the package version.");
    }
    const [pdf, manifest, csv] = await Promise.all([
      storage.readGenerated(keys.pdf, maximumTurnoverArtifactBytes),
      storage.readGenerated(keys.manifest, maximumTurnoverArtifactBytes),
      storage.readGenerated(keys.csv, maximumTurnoverArtifactBytes),
    ]);
    if (!pdf || !manifest || !csv
      || parsed.artifacts.pdfSha256 !== sha256(pdf)
      || parsed.artifacts.manifestJsonSha256 !== sha256(manifest)
      || parsed.artifacts.manifestCsvSha256 !== sha256(csv)) {
      throw new Error("The stored turnover artifact set failed its generation-log hash verification.");
    }
  }

  private async completeMessage(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    message: IntegrationMessageRecord,
  ): Promise<MessageOutcome> {
    await this.platform.processIntegration(context, assignments, message.id, message.version, "success", null);
    return "completed";
  }

  private async failMessage(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    message: IntegrationMessageRecord,
    errorCode: string,
    permanent: boolean,
  ): Promise<MessageOutcome> {
    const updated = await this.platform.processIntegration(
      context, assignments, message.id, message.version,
      permanent ? "permanent_failure" : "failure", errorCode,
    );
    return updated.state === "retry" ? "retried" : "deadLettered";
  }

  private startLeaseHeartbeat(messageId: string, leaseToken: string): {
    readonly lost: () => boolean;
    readonly stop: () => Promise<void>;
  } {
    const intervalMs = Math.max(250, Math.floor(this.leaseDurationMs / 3));
    let stopped = false;
    let leaseLost = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let activeRenewal: Promise<void> = Promise.resolve();
    const schedule = () => {
      if (stopped || leaseLost) return;
      timer = setTimeout(() => {
        activeRenewal = this.store.renewIntegrationWorkLease(
          messageId, leaseToken, new Date(), this.leaseDurationMs,
        ).then((renewedUntil) => {
          if (!renewedUntil) leaseLost = true;
        }).catch(() => {
          leaseLost = true;
        }).finally(schedule);
      }, intervalMs);
    };
    schedule();
    return {
      lost: () => leaseLost,
      stop: async () => {
        stopped = true;
        if (timer) clearTimeout(timer);
        await activeRenewal;
      },
    };
  }
}
