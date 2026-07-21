import type {
  AccessContext,
  AssuranceLevel,
  AuthorizationDecision,
  AuthorizationRequest,
  ResourceScope,
  RoleAssignment,
} from "@eiep/shared-types";

const assuranceRank: Readonly<Record<AssuranceLevel, number>> = {
  standard: 0,
  mfa: 1,
  "step-up": 2,
};

function assignmentIsActive(assignment: RoleAssignment, now: Date): boolean {
  return (
    assignment.revokedAt === null &&
    assignment.effectiveFrom.getTime() <= now.getTime() &&
    (assignment.effectiveTo === null || assignment.effectiveTo.getTime() > now.getTime())
  );
}

function scopedValueMatches(assignmentValue: string | null, resourceValue: string | null): boolean {
  return assignmentValue === null || (resourceValue !== null && assignmentValue === resourceValue);
}

function scopeMatches(assignment: ResourceScope, resource: ResourceScope): boolean {
  return (
    scopedValueMatches(assignment.organizationId, resource.organizationId) &&
    scopedValueMatches(assignment.projectId, resource.projectId) &&
    scopedValueMatches(assignment.workPackageId, resource.workPackageId) &&
    scopedValueMatches(assignment.objectId, resource.objectId)
  );
}

export function authorize(
  context: AccessContext,
  assignments: readonly RoleAssignment[],
  request: AuthorizationRequest,
  now: Date,
): AuthorizationDecision {
  if (request.forbiddenActorIds.includes(context.userId)) {
    return { allowed: false, reasonCode: "separation_of_duty" };
  }

  if (assuranceRank[context.assurance] < assuranceRank[request.minimumAssurance]) {
    return { allowed: false, reasonCode: "assurance_required" };
  }

  const qualifications = new Set(context.qualifications.map((qualification) => qualification.trim().toUpperCase()));
  if (request.requiredQualifications.some((qualification) => !qualifications.has(qualification.trim().toUpperCase()))) {
    return { allowed: false, reasonCode: "qualification_required" };
  }

  const activeForActor = assignments.filter(
    (assignment) =>
      assignment.userId === context.userId &&
      assignment.actingOrganizationId === context.actingOrganizationId &&
      assignmentIsActive(assignment, now) &&
      assignment.permissions.includes(request.action),
  );

  if (activeForActor.length === 0) {
    return { allowed: false, reasonCode: "no_active_assignment" };
  }

  if (!activeForActor.some((assignment) => scopeMatches(assignment.scope, request.resource))) {
    return { allowed: false, reasonCode: "scope_denied" };
  }

  return { allowed: true, reasonCode: "allowed" };
}

export class AuthorizationDeniedError extends Error {
  public readonly reasonCode: AuthorizationDecision["reasonCode"];

  public constructor(reasonCode: AuthorizationDecision["reasonCode"]) {
    super("The requested action is not authorized.");
    this.name = "AuthorizationDeniedError";
    this.reasonCode = reasonCode;
  }
}

export function requireAuthorization(
  context: AccessContext,
  assignments: readonly RoleAssignment[],
  request: AuthorizationRequest,
  now: Date,
): void {
  const decision = authorize(context, assignments, request, now);
  if (!decision.allowed) {
    throw new AuthorizationDeniedError(decision.reasonCode);
  }
}
