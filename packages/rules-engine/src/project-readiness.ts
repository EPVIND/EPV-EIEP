import type { ProjectReadiness } from "@eiep/shared-types";

export function projectReadinessBlockers(readiness: ProjectReadiness): readonly string[] {
  const blockers: string[] = [];
  if (!readiness.scopeStatement.trim()) blockers.push("scope_statement_required");
  if (readiness.governingRequirementReferences.length < 1
    || readiness.governingRequirementReferences.some((reference) => !reference.trim())) {
    blockers.push("governing_requirement_reference_required");
  }
  if (new Set(readiness.governingRequirementReferences.map((reference) => reference.trim().toUpperCase())).size
    !== readiness.governingRequirementReferences.length) blockers.push("governing_requirement_reference_duplicate");
  const canonicalDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/u.test(value)
    && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime())
    && new Date(`${value}T00:00:00.000Z`).toISOString().startsWith(value);
  if (!canonicalDate(readiness.plannedStartDate) || !canonicalDate(readiness.plannedFinishDate)
    || readiness.plannedFinishDate < readiness.plannedStartDate) blockers.push("planned_dates_invalid");
  if (readiness.responsibleRoleCodes.length < 1 || readiness.responsibleRoleCodes.some((role) => !role.trim())) {
    blockers.push("responsible_role_required");
  }
  if (new Set(readiness.responsibleRoleCodes.map((role) => role.trim().toLowerCase())).size
    !== readiness.responsibleRoleCodes.length) blockers.push("responsible_role_duplicate");
  if (!readiness.customerConfigured) blockers.push("customer_required");
  if (!readiness.facilityConfigured) blockers.push("facility_required");
  if (!readiness.projectAuthorityAssigned) blockers.push("project_authority_required");
  if (!readiness.qualityAuthorityAssigned) blockers.push("quality_authority_required");
  if (!readiness.documentControlAuthorityAssigned) blockers.push("document_control_authority_required");
  if (readiness.completionBoundaryCount < 1) blockers.push("completion_boundary_required");
  if (readiness.responsibilityAssignmentCount < 1) blockers.push("responsibility_assignment_required");
  if (readiness.approvedRequirementReferenceCount < 1) blockers.push("approved_requirement_reference_required");
  if (!readiness.turnoverBaselineConfigured) blockers.push("turnover_baseline_required");
  if (readiness.blockingExceptionCount > 0) blockers.push("blocking_exception_open");
  return blockers;
}
