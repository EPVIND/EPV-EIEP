import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FoundationService, InMemoryFoundationStore, PlatformService } from "@eiep/api";
import {
  FileProcessingWorker,
  LocalFilesystemObjectStorage,
  MarkerMalwareScanner,
} from "@eiep/document-processing";
import { JobWorker } from "@eiep/job-worker";
import type { TurnoverManifestEntry } from "@eiep/shared-types";
import type { TurnoverRenderArtifacts, TurnoverRenderInput } from "@eiep/turnover-renderer";
import { assignment, completeReadiness, context, scope, sequentialIds } from "../helpers/foundation-fixture.js";

const now = new Date("2026-07-21T17:00:00.000Z");

function digest(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

test("FR-DOC-001, NFR-SEC-005, NFR-REL-004 / AC-03-04-10: staged files are scanned and released through durable idempotent jobs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "eiep-governed-file-job-"));
  try {
    const store = new InMemoryFoundationStore();
    const ids = sequentialIds("file-job");
    const foundation = new FoundationService(store, () => now, ids);
    const platform = new PlatformService(store, () => now, ids);
    const project = await foundation.createProject(
      context("file-project-creator"),
      [assignment("file-create", "file-project-creator", ["project.create"], scope())],
      {
        businessScopeOrganizationId: "org-epv", number: "FILE-001", name: "Governed file job",
        customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "UTC",
        readiness: completeReadiness,
      },
    );
    const storage = new LocalFilesystemObjectStorage(directory);
    const content = Buffer.from("%PDF-1.4\ncontrolled inspection evidence\n%%EOF\n", "utf8");
    const storageKey = "project_00000001/object_00000001";
    await storage.putStaged(storageKey, content);
    const uploader = context("file-uploader", "mfa");
    const staged = await platform.stageFile(
      uploader,
      [assignment("file-upload", uploader.userId, ["file.upload"], scope(project.id))],
      project.id,
      {
        storageKey, originalFilename: "inspection.pdf", declaredMediaType: "application/pdf",
        sha256: digest(content), sizeBytes: content.length, retentionClass: "project-quality-record",
      },
    );
    const validationMessage = await store.transaction((transaction) =>
      transaction.integrationMessageByKey("document-processing.worker", staged.id));
    assert.equal(validationMessage?.state, "pending");

    const workerContext = context("file-worker-user", "mfa", ["file_validation_worker", "integration_worker"]);
    const workerAssignments = [assignment(
      "file-worker-role", workerContext.userId, ["file.validate", "integration.process"], scope(project.id),
    )];
    const worker = new JobWorker(store, platform, {
      batchSize: 10, objectStorage: storage,
      fileProcessing: new FileProcessingWorker(storage, new MarkerMalwareScanner()),
    });
    const validationResult = await worker.runOnce(workerContext, workerAssignments);
    assert.deepEqual(validationResult.completed, [validationMessage?.id]);
    const validated = await store.transaction((transaction) => transaction.governedFileById(staged.id));
    assert.equal(validated?.validationState, "validated");
    assert.equal(validated?.detectedSha256, digest(content));
    assert.equal((await store.transaction((transaction) =>
      transaction.integrationMessageByKey("document-processing.worker", staged.id)))?.state, "processed");

    const releaser = context("file-releaser", "step-up", ["file_release_authority"]);
    const released = await platform.releaseFile(
      releaser,
      [assignment("file-release", releaser.userId, ["file.release"], scope(project.id))],
      staged.id,
      validated?.version ?? 0,
    );
    assert.equal(released.validationState, "released");
    const releaseResult = await worker.runOnce(workerContext, workerAssignments);
    assert.equal(releaseResult.completed.length, 1);
    assert.deepEqual(Buffer.from(await storage.readReleased(storageKey, content.length)), content);
    assert.equal((await store.transaction((transaction) =>
      transaction.integrationMessageByKey("file-release.worker", staged.id)))?.state, "processed");
    await storage.release(storageKey);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("FR-TOV-003-004, NFR-PER-003, NFR-REL-004 / AC-09-10: turnover rendering persists a hash-verified immutable artifact set and resumes without rerender", async () => {
  const directory = await mkdtemp(join(tmpdir(), "eiep-turnover-job-"));
  try {
    const store = new InMemoryFoundationStore();
    const ids = sequentialIds("turnover-job");
    const foundation = new FoundationService(store, () => now, ids);
    const platform = new PlatformService(store, () => now, ids);
    const project = await foundation.createProject(
      context("turnover-project-creator"),
      [assignment("turnover-create", "turnover-project-creator", ["project.create"], scope())],
      {
        businessScopeOrganizationId: "org-epv", number: "TOV-001", name: "Durable turnover render",
        customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "UTC",
        readiness: completeReadiness,
      },
    );
    const sourceJson = JSON.stringify({ id: "material_00000001", state: "released", version: 1 });
    const manifest: readonly TurnoverManifestEntry[] = [{
      sourceType: "material", sourceId: "material_00000001", sourceVersion: 1,
      sourceState: "released", inclusionReason: "released_material_traceability",
      filename: "material-material_00000001.json", sizeBytes: Buffer.byteLength(sourceJson),
      canonicalJson: sourceJson, canonicalSha256: digest(sourceJson),
    }];
    const boundaryId = "boundary_00000001";
    const packageId = "package_00000001";
    const versionId = "turnoverversion_00000001";
    const messageId = "turnovermessage_00000001";
    await store.transaction((transaction) => {
      transaction.insertCompletionBoundary({
        id: boundaryId, projectId: project.id, boundaryType: "system", code: "SYS-01",
        name: "System one", state: "active", version: 1, createdAt: now, createdBy: "turnover-generator",
      });
      transaction.insertTurnoverPackage({
        id: packageId, projectId: project.id, completionBoundaryId: boundaryId, code: "PKG-001",
        recipientScope: "client-final", materialItemIds: ["material_00000001"], state: "generated", version: 1,
        createdAt: now, createdBy: "turnover-generator", updatedAt: now, updatedBy: "turnover-generator",
      });
      transaction.insertTurnoverVersion({
        id: versionId, packageId, projectId: project.id, versionNumber: 1, recipientScope: "client-final",
        generatedAt: now, generatedBy: "turnover-generator", manifest,
        manifestSha256: digest(JSON.stringify(manifest)),
      });
      transaction.insertIntegrationMessage({
        id: messageId, direction: "outbox", businessScopeOrganizationId: "org-epv",
        projectId: project.id, interfaceCode: "turnover-render.worker",
        idempotencyKey: versionId, externalId: versionId, schemaVersion: 1,
        payload: { turnoverPackageVersionId: versionId }, payloadSha256: "a".repeat(64),
        correlationId: "turnover-render-correlation", state: "pending", attemptCount: 0,
        lastError: null, createdAt: now, processedAt: null, version: 1,
      });
    });

    let renderCount = 0;
    const renderer = {
      async render(input: TurnoverRenderInput): Promise<TurnoverRenderArtifacts> {
        renderCount += 1;
        assert.equal(input.version.id, versionId);
        const pdf = Buffer.from("%PDF-1.4\ndurable turnover render\n%%EOF\n", "utf8");
        const manifestJson = Buffer.from(`${JSON.stringify({ packageVersionId: versionId, entries: manifest })}\n`, "utf8");
        const manifestCsv = Buffer.from("source_type,source_id\r\nmaterial,material_00000001\r\n", "utf8");
        const generationLogJson = Buffer.from("{}\n", "utf8");
        return {
          artifactPrefix: `${packageId}/version-0001`, pdf, manifestJson, manifestCsv, generationLogJson,
          hashes: {
            pdfSha256: digest(pdf), manifestJsonSha256: digest(manifestJson),
            manifestCsvSha256: digest(manifestCsv), generationLogSha256: digest(generationLogJson),
          },
          delta: { added: ["material:material_00000001"], removed: [], changed: [] },
          rendererVersion: "test-renderer/1", templateVersion: "test-template/1",
          preservationConformance: "not_claimed",
        };
      },
    };
    const storage = new LocalFilesystemObjectStorage(directory);
    const workerContext = context("turnover-worker-user", "mfa", ["integration_worker"]);
    const workerAssignments = [assignment(
      "turnover-worker-role", workerContext.userId, ["integration.process"], scope(project.id),
    )];
    const worker = new JobWorker(store, platform, {
      batchSize: 1, objectStorage: storage, turnoverRenderer: renderer,
    });
    assert.deepEqual((await worker.runOnce(workerContext, workerAssignments)).completed, [messageId]);
    const prefix = `${project.id}/${versionId}`;
    const log = await storage.readGenerated(`${prefix}/generationlog`, 1024 * 1024);
    assert.ok(log);
    const parsedLog = JSON.parse(Buffer.from(log).toString("utf8")) as {
      packageVersionId: string; artifacts: { pdfSha256: string };
    };
    assert.equal(parsedLog.packageVersionId, versionId);
    const storedPdf = await storage.readGenerated(`${prefix}/turnoverpdf`, 1024 * 1024);
    assert.equal(parsedLog.artifacts.pdfSha256, digest(storedPdf ?? new Uint8Array()));

    await store.transaction((transaction) => {
      const processed = transaction.integrationMessageById(messageId);
      assert.ok(processed);
      transaction.updateIntegrationMessage({
        ...processed, state: "pending", processedAt: null, version: processed.version + 1,
      }, processed.version);
    });
    assert.deepEqual((await worker.runOnce(workerContext, workerAssignments)).completed, [messageId]);
    assert.equal(renderCount, 1, "a completed immutable artifact set must be adopted without rerendering");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
