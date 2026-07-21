import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationDeniedError } from "@eiep/rules-engine";
import { FoundationService, InMemoryFoundationStore, PlatformService } from "@eiep/api";
import { assignment, completeReadiness, context, scope, sequentialIds } from "../helpers/foundation-fixture.js";

const now = new Date("2026-07-21T08:00:00.000Z");

test("FR-INT-002, NFR-DAT-001 / AC-02-03-10: async exports and search filter exact records, preserve stable IDs, and reauthorize recipient download", async () => {
  const store = new InMemoryFoundationStore();
  const ids = sequentialIds("export-authorization");
  const foundation = new FoundationService(store, () => now, ids);
  const platform = new PlatformService(store, () => now, ids);
  const project = await foundation.createProject(
    context("project-creator"),
    [assignment("create", "project-creator", ["project.create"], scope())],
    {
      businessScopeOrganizationId: "org-epv", number: "EXPORT-001", name: "Export authorization",
      customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "UTC", readiness: completeReadiness,
    },
  );
  const records = [
    { id: "imported-record-1", externalId: "EXT-VISIBLE", label: "Visible pump record" },
    { id: "imported-record-2", externalId: "EXT-HIDDEN", label: "Hidden vessel record" },
  ];
  await store.transaction((transaction) => {
    for (const record of records) transaction.insertImportedRecord({
      id: record.id, projectId: project.id, recordType: "material_receipt",
      payload: { projectId: project.id, description: record.label }, importJobId: "seeded-controlled-test-import",
      externalId: record.externalId, createdAt: now, createdBy: "test-fixture",
    });
  });
  const exporter = context("exporter", "mfa");
  const narrowAccess = [
    assignment("create-export", exporter.userId, ["export.create"], scope(project.id)),
    assignment("read-one", exporter.userId, ["project.read"], scope(project.id, records[0]!.id)),
  ];
  await assert.rejects(
    platform.requestExport(exporter, narrowAccess, project.id, {
      recordClass: "imported", recordIds: records.map((record) => record.id), format: "jsonl",
      recipientOrganizationId: "org-epv",
    }),
    (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "scope_denied",
  );
  const search = await platform.searchProjectRecords(exporter, narrowAccess, project.id, "record");
  assert.deepEqual(search.map((record) => record.recordId), [records[0]!.id]);
  const fullAccess = [assignment(
    "export-full", exporter.userId, ["export.create", "export.download", "project.read"], scope(project.id),
  )];
  const queued = await platform.requestExport(exporter, fullAccess, project.id, {
    recordClass: "imported", recordIds: records.map((record) => record.id), format: "jsonl",
    recipientOrganizationId: "org-epv",
  });
  assert.equal(queued.state, "queued");
  const outbox = await store.transaction((transaction) => transaction.integrationMessageByKey("export.worker", queued.id));
  assert.equal(outbox?.state, "pending");
  const worker = context("export-worker", "mfa", ["export_worker"]);
  const completed = await platform.processExport(
    worker,
    [assignment("process-export", worker.userId, ["export.process"], scope(project.id))],
    queued.id, queued.version,
  );
  assert.equal(completed.state, "completed");
  assert.deepEqual(completed.resultManifest, [
    `imported:${records[0]!.id}:v1`, `imported:${records[1]!.id}:v1`,
  ]);
  assert.match(completed.resultSha256 ?? "", /^[0-9a-f]{64}$/u);
  await assert.rejects(
    platform.downloadExport(
      context("other-org-reader", "mfa", [], "org-other"),
      [assignment(
        "other-org-download", "other-org-reader", ["export.download", "project.read"],
        scope(project.id, null, "org-other"), {}, "org-other",
      )],
      completed.id,
    ),
    (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "scope_denied",
  );
  const downloaded = await platform.downloadExport(exporter, fullAccess, completed.id);
  assert.equal(downloaded.resultSha256, completed.resultSha256);
  const audit = await store.transaction((transaction) => transaction.auditForProject(project.id));
  assert.ok(audit.some((event) => event.action === "export.requested"));
  assert.ok(audit.some((event) => event.action === "export.completed"));
  assert.ok(audit.some((event) => event.action === "export.downloaded"));
});
