import type { AccessContext, RoleAssignment } from "@eiep/shared-types";
import { FoundationService, InMemoryFoundationStore, OperationalService } from "@eiep/api";
import { assignment, completeReadiness, context, scope, seedAuthoritativeProjectReadiness, sequentialIds } from "./foundation-fixture.js";

export async function mobilizedSubcontractorFixture(prefix: string, organizationId: string) {
  const now = new Date("2026-07-21T01:00:00.000Z");
  const store = new InMemoryFoundationStore();
  const ids = sequentialIds(prefix);
  const foundation = new FoundationService(store, () => now, ids);
  const operations = new OperationalService(store, () => now, ids);
  const project = await foundation.createProject(
    context(`${prefix}-project-creator`),
    [assignment(`${prefix}-create-project`, `${prefix}-project-creator`, ["project.create"], scope())],
    {
      businessScopeOrganizationId: "org-epv", number: `${prefix.toUpperCase()}-PROJECT`, name: `${prefix} project`,
      customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "UTC", readiness: completeReadiness,
    },
  );
  await seedAuthoritativeProjectReadiness(store, project.id, now);
  await foundation.activateProject(
    context(`${prefix}-project-authority`),
    [assignment(`${prefix}-activate`, `${prefix}-project-authority`, ["project.activate"], scope(project.id))],
    project.id, project.version,
  );
  const profile = await operations.createSubcontractorProfile(
    context(`${prefix}-profile-manager`, "mfa"),
    [assignment(`${prefix}-profile`, `${prefix}-profile-manager`, ["subcontractor.profile.manage"], scope(null, null, organizationId))],
    {
      organizationId, legalTaxReference: `${prefix}-controlled-reference`, declaredScopes: ["assigned-scope"],
      geography: ["US-CO"], laborModel: "configured", lowerTierDisclosureRequired: true,
    },
  );
  const qualifier = context(`${prefix}-qualifier`, "step-up", ["subcontractor_qualification_authority"]);
  await operations.verifySubcontractorQualification(
    qualifier,
    [assignment(`${prefix}-qualify`, qualifier.userId, ["subcontractor.qualify"], scope(null, profile.id, organizationId))],
    profile.id, profile.version,
    {
      category: "quality", code: `${prefix}-QUAL`, approvedScopes: ["assigned-scope"], issuer: "EPV supplier quality",
      effectiveAt: new Date("2026-07-01T00:00:00.000Z"), expiresAt: new Date("2027-07-01T00:00:00.000Z"),
      evidenceFileId: `${prefix}-qualification-evidence`, exceptionReason: null,
    },
  );
  const assigner = context(`${prefix}-assigner`, "mfa");
  const assignmentAccess = [assignment(
    `${prefix}-assignment-access`, assigner.userId, ["subcontractor.assign", "mobilization.configure"], scope(project.id),
  )];
  const subcontractorAssignment = await operations.assignSubcontractorToProject(
    assigner, assignmentAccess, project.id, profile.id,
    { approvedScopeCode: "assigned-scope", workPackageIds: [`${prefix}-WP-1`], authorizationReference: `${prefix}-PO-1` },
  );
  const requirement = await operations.configureMobilizationRequirement(
    assigner, assignmentAccess, subcontractorAssignment.id,
    { code: "EXECUTED-AUTHORIZATION", category: "commercial", title: "Executed authorization", required: true },
  );
  const portalContext: AccessContext = context(`${prefix}-portal-user`, "mfa", [], organizationId);
  const portalAssignments: readonly RoleAssignment[] = [
    assignment(
      `${prefix}-portal-read`, portalContext.userId, ["portal.work.read"], scope(project.id, null, organizationId), {}, organizationId,
    ),
    assignment(
      `${prefix}-portal-submit`, portalContext.userId, ["subcontractor.submit"],
      scope(project.id, null, organizationId, `${prefix}-WP-1`), {}, organizationId,
    ),
    assignment(
      `${prefix}-mobilization-submit`, portalContext.userId, ["mobilization.submit"],
      scope(project.id, null, organizationId), {}, organizationId,
    ),
  ];
  const submittedRequirement = await operations.submitMobilizationEvidence(
    portalContext, portalAssignments, requirement.id, requirement.version,
    { qualificationId: null, evidenceFileId: `${prefix}-authorization-evidence` },
  );
  const evaluator = context(`${prefix}-mobilization-evaluator`, "mfa");
  await operations.reviewMobilizationRequirement(
    evaluator,
    [assignment(`${prefix}-evaluate`, evaluator.userId, ["mobilization.evaluate"], scope(project.id))],
    submittedRequirement.id, submittedRequirement.version, "accept", "Executed authorization verified.",
  );
  const releaseAuthority = context(`${prefix}-mobilization-authority`, "step-up", ["mobilization_authority"]);
  const releasedAssignment = await operations.releaseMobilization(
    releaseAuthority,
    [assignment(
      `${prefix}-release`, releaseAuthority.userId, ["mobilization.release"], scope(project.id, subcontractorAssignment.id),
    )],
    subcontractorAssignment.id, subcontractorAssignment.version,
  );
  return { store, operations, project, profile, releasedAssignment, portalContext, portalAssignments };
}
