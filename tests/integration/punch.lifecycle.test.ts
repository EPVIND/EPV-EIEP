import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationDeniedError } from "@eiep/rules-engine";
import { FoundationService, InMemoryFoundationStore, OperationalService, ValidationError } from "@eiep/api";
import { approveMaterialConfiguration, assignment, completeReadiness, context, scope, seedAuthoritativeProjectReadiness, sequentialIds } from "../helpers/foundation-fixture.js";

const now = new Date("2026-07-20T23:30:00.000Z");

test("FR-PCH-001, FR-TOV-002-003 / AC-07-09: owned punch evidence requires independent verification and blocks turnover until closure", async () => {
  const store = new InMemoryFoundationStore();
  const ids = sequentialIds("punch");
  const foundation = new FoundationService(store, () => now, ids);
  const operations = new OperationalService(store, () => now, ids);
  const project = await foundation.createProject(
    context("project-creator"),
    [assignment("create", "project-creator", ["project.create"], scope())],
    {
      businessScopeOrganizationId: "org-epv", number: "PCH-001", name: "Punch controls",
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
      identifier: "PCH-MAT-001", receiptNumber: "PCH-RCV-001", purchaseReference: "PCH-PO-001",
      vendorOrganizationId: "org-vendor", specification: "configured", grade: "configured", form: "component",
      dimensions: "configured", quantity: "1", unitCode: "EA", heatLot: "PCH-HEAT-001",
      mtrDocumentRevisionId: null, receiptEvidenceFileIds: ["receipt-evidence"], storageLocation: "PCH-RACK",
      mtrRequired: false, receivingInspectionRequired: false, pmiRequired: false, governingPmiRule: null,
    },
  );
  const released = await operations.releaseMaterial(
    context("material-releaser", "step-up", ["material_release_authority"]),
    [assignment("release", "material-releaser", ["material.release.approve"], scope(project.id))],
    material.id,
    material.version,
  );
  const punch = await operations.createPunch(
    context("punch-creator", "mfa"),
    [assignment("create-punch", "punch-creator", ["punch.create"], scope(project.id))],
    project.id,
    {
      number: "PCH-0001", type: "completion", priority: "high", systemId: "system-1", areaId: null,
      workPackageId: "work-package-1", assetId: material.id, description: "Install missing identification tag.",
      ownerUserId: "punch-owner", targetAt: new Date("2026-07-25T00:00:00.000Z"), turnoverRequired: true,
    },
  );
  const configurator = context("turnover-configurator", "mfa");
  const configureAccess = [assignment("configure-turnover", configurator.userId, ["turnover.configure", "turnover.package.create"], scope(project.id))];
  const boundary = await operations.createCompletionBoundary(
    configurator, configureAccess, project.id,
    { boundaryType: "system", code: "PCH-SYSTEM", name: "Punch system boundary" },
  );
  await operations.configureTurnoverRequirement(
    configurator, configureAccess, boundary.id,
    { code: "PCH-MATERIAL", recordClass: "material", required: true, notApplicableAllowed: false, acceptanceAuthority: "completion-authority" },
  );
  await operations.configureTurnoverRequirement(
    configurator, configureAccess, boundary.id,
    { code: "PCH-REQUIREMENT", recordClass: "punch", required: true, notApplicableAllowed: false, acceptanceAuthority: "completion-authority" },
  );
  const configuredPackage = await operations.createTurnoverPackage(
    configurator, configureAccess, boundary.id,
    { code: "PCH-PACKAGE", recipientScope: "customer", materialItemIds: [released.id] },
  );
  await assert.rejects(
    operations.generateTurnover(
      context("turnover-coordinator"),
      [assignment("turnover", "turnover-coordinator", ["turnover.generate"], scope(project.id))],
      { packageId: configuredPackage.id, projectId: project.id },
    ),
    (error: unknown) => error instanceof ValidationError
      && error.details.includes("turnover_requirement:PCH-REQUIREMENT:submitted"),
  );
  await assert.rejects(
    operations.updateOwnedPunch(
      context("different-user", "mfa"),
      [assignment("update-other", "different-user", ["punch.update.owned"], scope(project.id))],
      punch.id,
      punch.version,
      ["completion-photo"],
      true,
    ),
    (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "scope_denied",
  );
  const ready = await operations.updateOwnedPunch(
    context("punch-owner", "mfa"),
    [assignment("update-owned", "punch-owner", ["punch.update.owned"], scope(project.id))],
    punch.id,
    punch.version,
    ["completion-photo"],
    true,
  );
  await assert.rejects(
    operations.verifyPunch(
      context("punch-owner", "step-up", ["punch_verifier"]),
      [assignment("self-verify", "punch-owner", ["punch.verify"], scope(project.id))],
      ready.id,
      ready.version,
      "self-verification-file",
    ),
    (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "separation_of_duty",
  );
  const verified = await operations.verifyPunch(
    context("punch-verifier", "step-up", ["punch_verifier"]),
    [assignment("verify", "punch-verifier", ["punch.verify"], scope(project.id))],
    ready.id,
    ready.version,
    "verification-file",
  );
  const closed = await operations.closePunch(
    context("completion-authority", "step-up", ["completion_authority"]),
    [assignment("close", "completion-authority", ["punch.close"], scope(project.id))],
    verified.id,
    verified.version,
    "Verified complete and accepted for turnover.",
  );
  assert.equal(closed.state, "closed");
  const turnover = await operations.generateTurnover(
    context("turnover-coordinator"),
    [assignment("turnover", "turnover-coordinator", ["turnover.generate"], scope(project.id))],
    { packageId: configuredPackage.id, projectId: project.id },
  );
  assert.ok(turnover.manifest.some((entry) => entry.sourceType === "punch" && entry.sourceId === closed.id));
});
