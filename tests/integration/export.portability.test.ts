import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { FoundationService, InMemoryFoundationStore, PlatformService } from "@eiep/api";
import { assignment, completeReadiness, context, scope, sequentialIds } from "../helpers/foundation-fixture.js";

const now = new Date("2026-07-21T09:45:00.000Z");

test("NFR-DAT-001 / AC-09-10: versioned JSON Lines and CSV exports preserve stable record and project identifiers", async () => {
  const store = new InMemoryFoundationStore();
  const ids = sequentialIds("export-portability");
  const foundation = new FoundationService(store, () => now, ids);
  const platform = new PlatformService(store, () => now, ids);
  const project = await foundation.createProject(
    context("project-creator"),
    [assignment("create-project", "project-creator", ["project.create"], scope())],
    {
      businessScopeOrganizationId: "org-epv", number: "EXPORT-002", name: "Portable exports",
      customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "UTC", readiness: completeReadiness,
    },
  );
  await store.transaction((transaction) => transaction.insertImportedRecord({
    id: "portable-record-1", projectId: project.id, recordType: "material_receipt",
    payload: { projectId: project.id, description: "Pump, 4-inch \"critical\"" },
    importJobId: "seeded-portability-import", externalId: "ERP-PUMP-001", createdAt: now, createdBy: "fixture",
  }));
  const exporter = context("exporter", "mfa");
  const exporterAccess = [assignment(
    "export", exporter.userId, ["export.create", "export.download", "project.read"], scope(project.id),
  )];
  const worker = context("export-worker", "mfa", ["export_worker"]);
  const workerAccess = [assignment("process", worker.userId, ["export.process"], scope(project.id))];

  const jsonlJob = await platform.requestExport(exporter, exporterAccess, project.id, {
    recordClass: "imported", recordIds: ["portable-record-1"], format: "jsonl", recipientOrganizationId: "org-epv",
  });
  const jsonl = await platform.processExport(worker, workerAccess, jsonlJob.id, jsonlJob.version);
  assert.equal(jsonl.formatSchemaVersion, 1);
  assert.equal(jsonl.resultMediaType, "application/x-ndjson");
  assert.equal(jsonl.resultSizeBytes, Buffer.byteLength(jsonl.resultContent ?? "", "utf8"));
  assert.equal(jsonl.resultSha256, createHash("sha256").update(jsonl.resultContent ?? "").digest("hex"));
  const jsonRecord = JSON.parse((jsonl.resultContent ?? "").trim()) as Record<string, unknown>;
  assert.deepEqual(
    { schemaVersion: jsonRecord.schemaVersion, recordId: jsonRecord.recordId, projectId: jsonRecord.projectId, version: jsonRecord.version },
    { schemaVersion: 1, recordId: "portable-record-1", projectId: project.id, version: 1 },
  );

  const csvJob = await platform.requestExport(exporter, exporterAccess, project.id, {
    recordClass: "imported", recordIds: ["portable-record-1"], format: "csv", recipientOrganizationId: "org-epv",
  });
  const csv = await platform.processExport(worker, workerAccess, csvJob.id, csvJob.version);
  assert.equal(csv.resultMediaType, "text/csv");
  assert.ok(csv.resultContent?.startsWith("schema_version,record_type,record_id,project_id,label,state,version\r\n"));
  assert.ok(csv.resultContent?.includes(`1,imported,portable-record-1,${project.id},`));
  assert.ok(csv.resultContent?.includes('"material_receipt ERP-PUMP-001'));
  assert.ok(csv.resultContent?.includes('""critical"""'));
  assert.deepEqual(csv.resultManifest, ["imported:portable-record-1:v1"]);
  const downloaded = await platform.downloadExport(exporter, exporterAccess, csv.id);
  assert.equal(downloaded.resultContent, csv.resultContent);
  assert.equal(downloaded.resultStorageKey, `exports/${project.id}/${csv.id}.csv`);
});
