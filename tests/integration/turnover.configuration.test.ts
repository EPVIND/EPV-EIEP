import assert from "node:assert/strict";
import test from "node:test";
import { FoundationService, InMemoryFoundationStore, OperationalService, ValidationError } from "@eiep/api";
import { approveMaterialConfiguration, assignment, completeReadiness, context, scope, seedAuthoritativeProjectReadiness, sequentialIds } from "../helpers/foundation-fixture.js";

const now = new Date("2026-07-20T23:45:00.000Z");

test("FR-TOV-001-003 / AC-09: configured boundaries and requirements drive explainable readiness before immutable generation", async () => {
  const store = new InMemoryFoundationStore();
  const ids = sequentialIds("turnover-configuration");
  const foundation = new FoundationService(store, () => now, ids);
  const operations = new OperationalService(store, () => now, ids);
  const project = await foundation.createProject(
    context("project-creator"),
    [assignment("create", "project-creator", ["project.create"], scope())],
    {
      businessScopeOrganizationId: "org-epv", number: "TOV-001", name: "Turnover configuration",
      customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "UTC", readiness: completeReadiness,
    },
  );
  await seedAuthoritativeProjectReadiness(store, project.id, now);
  await foundation.activateProject(
    context("project-authority"),
    [assignment("activate", "project-authority", ["project.activate"], scope(project.id))],
    project.id,
    project.version,
  );
  const materialConfiguration = await approveMaterialConfiguration(foundation, store, project.id, "1", {
    mtrRequired: false, receivingInspectionRequired: false, pmiRequired: false,
  });
  const material = await operations.receiveMaterial(
    context("receiver", "mfa"),
    [assignment("receive", "receiver", ["material.receive"], scope(project.id))],
    project.id,
    {
      projectConfigurationRevisionId: materialConfiguration.id,
      identifier: "TOV-MAT-001", receiptNumber: "TOV-RCV-001", purchaseReference: "TOV-PO-001",
      vendorOrganizationId: "org-vendor", specification: "configured", grade: "configured", form: "component",
      dimensions: "configured", quantity: "1", unitCode: "EA", heatLot: "TOV-HEAT-001",
      mtrDocumentRevisionId: null, receiptEvidenceFileIds: ["receipt-evidence"], storageLocation: "TOV-RACK",
      mtrRequired: false, receivingInspectionRequired: false, pmiRequired: false, governingPmiRule: null,
    },
  );
  const configurator = context("turnover-configurator", "mfa");
  const configureAccess = [assignment(
    "configure-turnover", configurator.userId,
    ["turnover.configure", "turnover.package.create"], scope(project.id),
  )];
  const boundary = await operations.createCompletionBoundary(
    configurator, configureAccess, project.id,
    { boundaryType: "system", code: "SYSTEM-01", name: "System 01" },
  );
  await operations.configureTurnoverRequirement(
    configurator, configureAccess, boundary.id,
    { code: "MATERIAL", recordClass: "material", required: true, notApplicableAllowed: false, acceptanceAuthority: "completion-authority" },
  );
  await operations.configureTurnoverRequirement(
    configurator, configureAccess, boundary.id,
    { code: "PMI", recordClass: "pmi", required: false, notApplicableAllowed: true, acceptanceAuthority: "quality-authority" },
  );
  await operations.configureTurnoverRequirement(
    configurator, configureAccess, boundary.id,
    { code: "NCR", recordClass: "ncr", required: false, notApplicableAllowed: true, acceptanceAuthority: "quality-authority" },
  );
  const turnoverPackage = await operations.createTurnoverPackage(
    configurator, configureAccess, boundary.id,
    { code: "SYSTEM-01-PACKAGE", recipientScope: "customer", materialItemIds: [material.id] },
  );
  const reader = context("turnover-reader", "mfa");
  const readAccess = [assignment("read-turnover", reader.userId, ["turnover.read"], scope(project.id))];
  const beforeRelease = await operations.turnoverReadiness(reader, readAccess, turnoverPackage.id);
  assert.deepEqual(
    beforeRelease.map(({ requirementCode, status }) => ({ requirementCode, status })),
    [
      { requirementCode: "MATERIAL", status: "submitted" },
      { requirementCode: "PMI", status: "not_applicable" },
      { requirementCode: "NCR", status: "not_applicable" },
    ],
  );
  await assert.rejects(
    operations.generateTurnover(
      context("turnover-coordinator", "step-up"),
      [assignment("generate", "turnover-coordinator", ["turnover.generate"], scope(project.id))],
      { packageId: turnoverPackage.id, projectId: project.id },
    ),
    (error: unknown) => error instanceof ValidationError
      && error.details.includes("turnover_requirement:MATERIAL:submitted"),
  );
  await operations.releaseMaterial(
    context("material-releaser", "step-up", ["material_release_authority"]),
    [assignment("release", "material-releaser", ["material.release.approve"], scope(project.id))],
    material.id,
    material.version,
  );
  const afterRelease = await operations.turnoverReadiness(reader, readAccess, turnoverPackage.id);
  assert.equal(afterRelease.find((item) => item.requirementCode === "MATERIAL")?.status, "accepted");
  const generated = await operations.generateTurnover(
    context("turnover-coordinator", "step-up"),
    [assignment("generate", "turnover-coordinator", ["turnover.generate"], scope(project.id))],
    { packageId: turnoverPackage.id, projectId: project.id },
  );
  assert.equal(generated.versionNumber, 1);
  assert.ok(generated.manifest.some((entry) => entry.sourceType === "material" && entry.sourceId === material.id));
});
