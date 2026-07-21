import assert from "node:assert/strict";
import test from "node:test";
import type { MobilizationRequirementCategory, MobilizationRequirementRecord } from "@eiep/shared-types";
import { FoundationService, InMemoryFoundationStore, OperationalService, ValidationError } from "@eiep/api";
import { assignment, completeReadiness, context, scope, seedAuthoritativeProjectReadiness, sequentialIds } from "../helpers/foundation-fixture.js";

test("FR-SUB-002 / AC-08: all configured prerequisites must be independently accepted and current before mobilization", async () => {
  let current = new Date("2026-07-21T00:15:00.000Z");
  const store = new InMemoryFoundationStore();
  const ids = sequentialIds("subcontractor-mobilization");
  const foundation = new FoundationService(store, () => current, ids);
  const operations = new OperationalService(store, () => current, ids);
  const project = await foundation.createProject(
    context("project-creator"),
    [assignment("create-project", "project-creator", ["project.create"], scope())],
    {
      businessScopeOrganizationId: "org-epv", number: "SUB-MOB-001", name: "Mobilization controls",
      customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "UTC", readiness: completeReadiness,
    },
  );
  await seedAuthoritativeProjectReadiness(store, project.id, current);
  await foundation.activateProject(
    context("project-authority"),
    [assignment("activate", "project-authority", ["project.activate"], scope(project.id))], project.id, project.version,
  );
  const organizationId = "org-subcontractor-mobilization";
  const profile = await operations.createSubcontractorProfile(
    context("profile-manager", "mfa"),
    [assignment("profile", "profile-manager", ["subcontractor.profile.manage"], scope(null, null, organizationId))],
    {
      organizationId, legalTaxReference: "controlled-party-reference-002", declaredScopes: ["mechanical-installation"],
      geography: ["US-CO"], laborModel: "merit-shop", lowerTierDisclosureRequired: true,
    },
  );
  const qualifier = context("qualification-authority", "step-up", ["subcontractor_qualification_authority"]);
  const qualificationAccess = [assignment(
    "qualify", qualifier.userId, ["subcontractor.qualify"], scope(null, profile.id, organizationId),
  )];
  const expiringLicense = await operations.verifySubcontractorQualification(
    qualifier, qualificationAccess, profile.id, profile.version,
    {
      category: "license", code: "LICENSE-001", approvedScopes: ["mechanical-installation"], issuer: "Licensing authority",
      effectiveAt: new Date("2026-07-01T00:00:00.000Z"), expiresAt: new Date("2026-07-22T00:00:00.000Z"),
      evidenceFileId: "license-evidence", exceptionReason: null,
    },
  );
  const assigner = context("subcontractor-assigner", "mfa");
  const manageAccess = [assignment(
    "manage-assignment", assigner.userId, ["subcontractor.assign", "mobilization.configure"], scope(project.id),
  )];
  const projectAssignment = await operations.assignSubcontractorToProject(
    assigner, manageAccess, project.id, profile.id,
    { approvedScopeCode: "mechanical-installation", workPackageIds: ["WP-100"], authorizationReference: "PO-100" },
  );
  const categories: readonly MobilizationRequirementCategory[] = [
    "commercial", "safety", "quality", "insurance", "license", "lower_tier", "submission",
  ];
  const requirements: MobilizationRequirementRecord[] = [];
  for (const category of categories) {
    requirements.push(await operations.configureMobilizationRequirement(
      assigner, manageAccess, projectAssignment.id,
      { code: `MOB-${category}`, category, title: `${category} prerequisite`, required: true },
    ));
  }
  const releaseAuthority = context("mobilization-authority", "step-up", ["mobilization_authority"]);
  const releaseAccess = [assignment(
    "release-mobilization", releaseAuthority.userId, ["mobilization.release"], scope(project.id, projectAssignment.id),
  )];
  await assert.rejects(
    operations.releaseMobilization(releaseAuthority, releaseAccess, projectAssignment.id, projectAssignment.version),
    (error: unknown) => error instanceof ValidationError
      && error.details.includes("mobilization_requirement:MOB-COMMERCIAL:missing"),
  );
  const deniedAudit = await store.transaction((transaction) => transaction.auditForProject(project.id));
  assert.ok(deniedAudit.some((event) => event.action === "mobilization.denied"));

  const submitter = context("subcontractor-portal-user", "mfa", [], organizationId);
  const submitAccess = [assignment(
    "submit-mobilization", submitter.userId, ["mobilization.submit"], scope(project.id, null, organizationId), {}, organizationId,
  )];
  const evaluator = context("mobilization-evaluator", "mfa");
  const evaluateAccess = [assignment(
    "evaluate-mobilization", evaluator.userId, ["mobilization.evaluate"], scope(project.id),
  )];
  let acceptedLicenseRequirement: MobilizationRequirementRecord | null = null;
  for (const requirement of requirements) {
    const submitted = await operations.submitMobilizationEvidence(
      submitter, submitAccess, requirement.id, requirement.version,
      requirement.category === "license"
        ? { qualificationId: expiringLicense.id, evidenceFileId: null }
        : { qualificationId: null, evidenceFileId: `evidence-${requirement.category}` },
    );
    const accepted = await operations.reviewMobilizationRequirement(
      evaluator, evaluateAccess, submitted.id, submitted.version, "accept", "Prerequisite verified against controlled evidence.",
    );
    if (requirement.category === "license") acceptedLicenseRequirement = accepted;
  }
  const ready = await operations.evaluateMobilization(evaluator, evaluateAccess, projectAssignment.id);
  assert.ok(ready.every((item) => item.status === "accepted"));

  current = new Date("2026-07-23T00:00:00.000Z");
  await assert.rejects(
    operations.releaseMobilization(releaseAuthority, releaseAccess, projectAssignment.id, projectAssignment.version),
    (error: unknown) => error instanceof ValidationError
      && error.details.includes("mobilization_requirement:MOB-LICENSE:expired")
      && error.details.includes("subcontractor_qualification_expired"),
  );
  const qualifiedProfile = await store.transaction((transaction) => transaction.subcontractorProfileById(profile.id));
  const renewedLicense = await operations.verifySubcontractorQualification(
    qualifier, qualificationAccess, profile.id, qualifiedProfile!.version,
    {
      category: "license", code: "LICENSE-002", approvedScopes: ["mechanical-installation"], issuer: "Licensing authority",
      effectiveAt: current, expiresAt: new Date("2027-07-23T00:00:00.000Z"), evidenceFileId: "renewed-license-evidence",
      exceptionReason: null,
    },
  );
  const renewedSubmission = await operations.submitMobilizationEvidence(
    submitter, submitAccess, acceptedLicenseRequirement!.id, acceptedLicenseRequirement!.version,
    { qualificationId: renewedLicense.id, evidenceFileId: null },
  );
  await operations.reviewMobilizationRequirement(
    evaluator, evaluateAccess, renewedSubmission.id, renewedSubmission.version, "accept", "Renewed license verified.",
  );
  const released = await operations.releaseMobilization(
    releaseAuthority, releaseAccess, projectAssignment.id, projectAssignment.version,
  );
  assert.equal(released.mobilizationState, "released");
  assert.equal(released.mobilizedBy, releaseAuthority.userId);
});
