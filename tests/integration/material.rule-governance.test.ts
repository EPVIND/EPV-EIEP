import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationDeniedError } from "@eiep/rules-engine";
import { FoundationService, InMemoryFoundationStore, OperationalService, ValidationError } from "@eiep/api";
import {
  approveMaterialConfiguration, assignment, completeReadiness, context, scope, seedAuthoritativeProjectReadiness,
  seedGovernedFile, sequentialIds,
} from "../helpers/foundation-fixture.js";

const now = new Date("2026-07-21T12:00:00.000Z");

async function setup() {
  const store = new InMemoryFoundationStore();
  const ids = sequentialIds("material-rule");
  const foundation = new FoundationService(store, () => now, ids);
  const operations = new OperationalService(store, () => now, ids);
  const project = await foundation.createProject(
    context("rule-project-creator", "mfa"),
    [assignment("rule-create", "rule-project-creator", ["project.create"], scope())],
    {
      businessScopeOrganizationId: "org-epv", number: "RULE-001", name: "Material rule governance",
      customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "UTC", readiness: completeReadiness,
    },
  );
  await seedAuthoritativeProjectReadiness(store, project.id, now);
  await foundation.activateProject(
    context("rule-project-authority"),
    [assignment("rule-activate", "rule-project-authority", ["project.activate"], scope(project.id))],
    project.id, project.version,
  );
  const document = await foundation.registerDocument(
    context("rule-document-controller", "mfa"),
    [assignment("rule-document-create", "rule-document-controller", ["document.create"], scope(project.id))],
    project.id,
    { number: "RULE-PMI-001", title: "Approved PMI applicability basis", type: "procedure", discipline: "quality" },
  );
  await seedGovernedFile(store, project.id, "rule-file");
  const submitted = await foundation.submitDocumentRevision(
    context("rule-document-author", "mfa"),
    [assignment("rule-document-submit", "rule-document-author", ["document.revision.submit"], scope(project.id))],
    document.id,
    { revision: "0", purpose: "PMI applicability", source: "controlled project requirement", fileId: "rule-file", requiredApprovalCount: 1 },
  );
  const approved = await foundation.approveDocumentRevision(
    context("rule-document-approver"),
    [assignment("rule-document-approve", "rule-document-approver", ["document.approve"], scope(project.id, document.id))],
    submitted.id, submitted.version, true,
  );
  const governingRevision = await foundation.releaseDocumentRevision(
    context("rule-document-releaser"),
    [assignment("rule-document-release", "rule-document-releaser", ["document.release"], scope(project.id, document.id))],
    approved.id, approved.version, document.version,
  );
  const configuration = await approveMaterialConfiguration(foundation, store, project.id, "1", {
    mtrRequired: false, receivingInspectionRequired: false, pmiRequired: false,
  }, [governingRevision.id]);
  return { store, foundation, operations, project, governingRevision, configuration };
}

function receipt(configurationId: string, pmiRequired = false) {
  return {
    projectConfigurationRevisionId: configurationId,
    identifier: "RULE-MAT-001", receiptNumber: "RULE-RCV-001", purchaseReference: "RULE-PO-001",
    vendorOrganizationId: "org-vendor", specification: "RULE-SPEC", grade: "GRADE-R", form: "plate",
    dimensions: "1 IN", quantity: "1", unitCode: "EA", heatLot: "RULE-HEAT-001",
    mtrDocumentRevisionId: null, receiptEvidenceFileIds: ["rule-receipt-evidence"], storageLocation: "RULE-RACK",
    mtrRequired: false, receivingInspectionRequired: false, pmiRequired,
    governingPmiRule: pmiRequired ? "UNAPPROVED-CLIENT-SNAPSHOT" : null,
  } as const;
}

test("FR-MAT-005, FR-PMI-001, NFR-MNT-002 / AC-05-06: receipt must match active approved configuration and PMI override requires independent approval", async () => {
  const { store, foundation, operations, project, governingRevision, configuration } = await setup();
  await assert.rejects(
    operations.receiveMaterial(
      context("rule-receiver", "mfa"),
      [assignment("rule-receive", "rule-receiver", ["material.receive"], scope(project.id))],
      project.id, receipt(configuration.id, true),
    ),
    (error: unknown) => error instanceof ValidationError && error.details.includes("material_configuration_mismatch"),
  );
  const material = await operations.receiveMaterial(
    context("rule-receiver", "mfa"),
    [assignment("rule-receive", "rule-receiver", ["material.receive"], scope(project.id))],
    project.id, receipt(configuration.id),
  );
  const proposed = await operations.proposePmiOverride(
    context("override-proposer", "mfa"),
    [assignment("override-propose", "override-proposer", ["pmi.override.manage"], scope(project.id))],
    material.id,
    { required: true, justification: "Material service requires positive alloy verification.", governingDocumentRevisionId: governingRevision.id },
  );
  await assert.rejects(
    operations.approvePmiOverride(
      context("override-proposer", "step-up", ["pmi_override_authority"]),
      [assignment("override-self-approve", "override-proposer", ["pmi.override.approve"], scope(project.id))],
      proposed.id, proposed.version, material.version,
    ),
    (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "separation_of_duty",
  );
  const active = await operations.approvePmiOverride(
    context("override-approver", "step-up", ["pmi_override_authority"]),
    [assignment("override-approve", "override-approver", ["pmi.override.approve"], scope(project.id))],
    proposed.id, proposed.version, material.version,
  );
  const decision = await operations.pmiRequirement(
    context("override-reader"),
    [assignment("override-read", "override-reader", ["pmi.read"], scope(project.id))],
    material.id,
  );
  assert.deepEqual(decision, {
    required: true, governingRule: `PMI-OVERRIDE:${active.id}`, decisionSource: "approved_override",
    projectConfigurationRevisionId: configuration.id, overrideId: active.id,
    reason: "Material service requires positive alloy verification.",
  });
  const updatedMaterial = await store.transaction((transaction) => transaction.materialById(material.id));
  assert.equal(updatedMaterial?.requirements.pmiAccepted, false);
  const audit = await foundation.auditHistory(
    context("override-auditor", "mfa"),
    [assignment("override-audit", "override-auditor", ["audit.read"], scope(project.id))], project.id,
  );
  assert.ok(audit.some((event) => event.action === "pmi.override_proposed"));
  assert.ok(audit.some((event) => event.action === "pmi.override_approved"));
});

test("FR-PMI-001 / AC-06: a proposal tied to a superseded project rule cannot be approved", async () => {
  const { store, foundation, operations, project, governingRevision, configuration } = await setup();
  const material = await operations.receiveMaterial(
    context("stale-receiver", "mfa"),
    [assignment("stale-receive", "stale-receiver", ["material.receive"], scope(project.id))],
    project.id, receipt(configuration.id),
  );
  const proposed = await operations.proposePmiOverride(
    context("stale-proposer", "mfa"),
    [assignment("stale-propose", "stale-proposer", ["pmi.override.manage"], scope(project.id))],
    material.id,
    { required: true, justification: "Pending rule change must not race approval.", governingDocumentRevisionId: governingRevision.id },
  );
  await approveMaterialConfiguration(foundation, store, project.id, "2", {
    mtrRequired: false, receivingInspectionRequired: false, pmiRequired: true, governingPmiRule: "RULE-PMI-REV-2",
  }, [governingRevision.id]);
  await assert.rejects(
    operations.approvePmiOverride(
      context("stale-approver", "step-up", ["pmi_override_authority"]),
      [assignment("stale-approve", "stale-approver", ["pmi.override.approve"], scope(project.id))],
      proposed.id, proposed.version, material.version,
    ),
    (error: unknown) => error instanceof ValidationError && error.details.includes("pmi_override_configuration_stale"),
  );
});
