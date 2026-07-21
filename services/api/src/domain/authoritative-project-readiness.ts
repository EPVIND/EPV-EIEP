import type { ProjectReadiness, ProjectRecord } from "@eiep/shared-types";
import type { FoundationTransaction } from "./foundation-store.js";

function authorityCode(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/gu, "_");
}

export function authoritativeProjectReadiness(
  transaction: FoundationTransaction,
  project: ProjectRecord,
  now: Date,
): ProjectReadiness {
  const organizations = transaction.projectOrganizationsForProject(project.id);
  const responsibilities = transaction.responsibilityAssignmentsForProject(project.id).filter((assignment) =>
    assignment.state === "active"
      && assignment.effectiveFrom.getTime() <= now.getTime()
      && (!assignment.effectiveTo || assignment.effectiveTo.getTime() > now.getTime()));
  const projectAuthorities = new Set(responsibilities
    .filter((assignment) => assignment.targetType === "project" && assignment.targetId === project.id && assignment.personId)
    .map((assignment) => authorityCode(assignment.responsibilityType)));
  const activeConfigurations = transaction.projectConfigurationsForProject(project.id)
    .filter((configuration) => configuration.state === "active" && configuration.approvedAt && configuration.approvedBy);
  const releasedRequirementReferences = new Set(activeConfigurations.flatMap((configuration) =>
    configuration.governingDocumentRevisionIds.filter((revisionId) => transaction.revisionById(revisionId)?.state === "released")));
  const boundaries = transaction.completionBoundariesForProject(project.id).filter((boundary) => boundary.state === "active");
  const turnoverBaselineConfigured = boundaries.length > 0 && boundaries.every((boundary) =>
    transaction.turnoverRequirementsForBoundary(boundary.id).length > 0);
  const blockingExceptionCount = transaction.ncrForProject(project.id).filter((ncr) => ncr.state !== "closed").length
    + transaction.punchForProject(project.id).filter((punch) => punch.state !== "closed" && punch.state !== "transferred").length;

  return {
    scopeStatement: project.readiness.scopeStatement,
    governingRequirementReferences: project.readiness.governingRequirementReferences,
    plannedStartDate: project.readiness.plannedStartDate,
    plannedFinishDate: project.readiness.plannedFinishDate,
    responsibleRoleCodes: project.readiness.responsibleRoleCodes,
    customerConfigured: organizations.some((organization) => organization.state === "active"
      && organization.organizationId === project.customerOrganizationId && organization.participationRole === "customer"),
    facilityConfigured: Boolean(project.facilityId.trim()),
    projectAuthorityAssigned: projectAuthorities.has("project_authority"),
    qualityAuthorityAssigned: projectAuthorities.has("quality_authority"),
    documentControlAuthorityAssigned: projectAuthorities.has("document_control_authority"),
    completionBoundaryCount: boundaries.length,
    responsibilityAssignmentCount: responsibilities.length,
    approvedRequirementReferenceCount: releasedRequirementReferences.size,
    turnoverBaselineConfigured,
    blockingExceptionCount,
  };
}
