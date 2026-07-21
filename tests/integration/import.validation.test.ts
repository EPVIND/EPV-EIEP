import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationDeniedError } from "@eiep/rules-engine";
import { FoundationService, InMemoryFoundationStore, PlatformService, ValidationError } from "@eiep/api";
import { assignment, completeReadiness, context, scope, sequentialIds } from "../helpers/foundation-fixture.js";

const now = new Date("2026-07-21T07:30:00.000Z");

test("FR-INT-001 / AC-03-10: imports validate schema, scope, project, required fields, and duplicates before atomic commit", async () => {
  const store = new InMemoryFoundationStore();
  const ids = sequentialIds("import-validation");
  const foundation = new FoundationService(store, () => now, ids);
  const platform = new PlatformService(store, () => now, ids);
  const createAccess = [assignment("create-project", "project-creator", ["project.create"], scope())];
  const project = await foundation.createProject(context("project-creator"), createAccess, {
    businessScopeOrganizationId: "org-epv", number: "IMPORT-001", name: "Import validation",
    customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "UTC", readiness: completeReadiness,
  });
  const otherProject = await foundation.createProject(context("project-creator"), createAccess, {
    businessScopeOrganizationId: "org-epv", number: "IMPORT-002", name: "Other project",
    customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "UTC", readiness: completeReadiness,
  });
  const importer = context("importer", "mfa");
  const importAccess = [assignment(
    "import-access", importer.userId, ["import.create", "import.validate", "import.commit"], scope(project.id),
  )];
  await assert.rejects(
    platform.stageImport(importer, importAccess, otherProject.id, {
      schemaName: "material_receipt", schemaVersion: 1, sourceSystem: "erp",
      rows: [{ externalId: "ERP-OTHER", payload: { projectId: otherProject.id, identifier: "M", quantity: "1", heatLot: "H" } }],
    }),
    (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "scope_denied",
  );
  const invalid = await platform.stageImport(importer, importAccess, project.id, {
    schemaName: "material_receipt", schemaVersion: 1, sourceSystem: "erp",
    rows: [
      { externalId: "ERP-100", payload: { projectId: project.id, identifier: "MAT-100", quantity: "invalid", heatLot: "HEAT-100" } },
      { externalId: "ERP-100", payload: { projectId: otherProject.id, identifier: "MAT-101", quantity: "1", heatLot: "HEAT-101" } },
    ],
  });
  const invalidResult = await platform.validateImport(importer, importAccess, invalid.id, invalid.version);
  assert.equal(invalidResult.state, "invalid");
  assert.ok(invalidResult.rows[0]?.errors.includes("quantity_invalid"));
  assert.ok(invalidResult.rows[1]?.errors.includes("duplicate_external_id_in_file"));
  assert.ok(invalidResult.rows[1]?.errors.includes("project_context_mismatch"));
  await assert.rejects(
    platform.commitImport(
      context("import-committer", "step-up"),
      [assignment("commit-invalid", "import-committer", ["import.commit"], scope(project.id))],
      invalidResult.id, invalidResult.version,
    ),
    (error: unknown) => error instanceof ValidationError && error.details.includes("import_not_validated"),
  );
  const valid = await platform.stageImport(importer, importAccess, project.id, {
    schemaName: "material_receipt", schemaVersion: 1, sourceSystem: "erp",
    rows: [
      { externalId: "ERP-200", payload: { projectId: project.id, identifier: "MAT-200", quantity: "2.50", heatLot: "HEAT-200" } },
      { externalId: "ERP-201", payload: { projectId: project.id, identifier: "MAT-201", quantity: "1", heatLot: "HEAT-201" } },
    ],
  });
  const validated = await platform.validateImport(importer, importAccess, valid.id, valid.version);
  assert.equal(validated.state, "validated");
  const committer = context("import-committer", "step-up");
  const committed = await platform.commitImport(
    committer,
    [assignment("commit", committer.userId, ["import.commit"], scope(project.id))],
    validated.id, validated.version,
  );
  assert.equal(committed.state, "committed");
  const records = await store.transaction((transaction) => transaction.importedRecordsForProject(project.id));
  assert.equal(records.length, 2);
  const duplicate = await platform.stageImport(importer, importAccess, project.id, {
    schemaName: "material_receipt", schemaVersion: 1, sourceSystem: "erp",
    rows: [{ externalId: "ERP-200", payload: { projectId: project.id, identifier: "MAT-REPLAY", quantity: "1", heatLot: "HEAT-X" } }],
  });
  const duplicateResult = await platform.validateImport(importer, importAccess, duplicate.id, duplicate.version);
  assert.equal(duplicateResult.state, "invalid");
  assert.ok(duplicateResult.rows[0]?.errors.includes("external_id_already_committed"));
});
