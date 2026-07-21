import { createHash, randomUUID } from "node:crypto";
import type {
  AccessContext,
  AuditEvent,
  DelegationRecord,
  DocumentDistributionRecord,
  DocumentRecord,
  DocumentRevisionRecord,
  ManagedAccessAssignmentRecord,
  GoverningDocumentLinkRecord,
  LegalHoldRecord,
  ProjectReadiness,
  ProjectRecord,
  ProjectConfigurationRevisionRecord,
  ProjectOrganizationRecord,
  ProjectStructureElementRecord,
  ProjectStructureType,
  ResponsibilityAssignmentRecord,
  RetentionDispositionRecord,
  RetentionPolicyRecord,
  RoleAssignment,
  ResourceScope,
} from "@eiep/shared-types";
import { authorize, AuthorizationDeniedError, canonicalTimeZone, documentReleaseBlockers, projectReadinessBlockers, requireAuthorization } from "@eiep/rules-engine";
import { ConflictError, NotFoundError, ValidationError } from "./errors.js";
import type { FoundationStore, FoundationTransaction } from "./foundation-store.js";
import { authoritativeProjectReadiness } from "./authoritative-project-readiness.js";

export interface ProjectReadinessDeclaration {
  readonly scopeStatement: string;
  readonly governingRequirementReferences: readonly string[];
  readonly plannedStartDate: string;
  readonly plannedFinishDate: string;
  readonly responsibleRoleCodes: readonly string[];
}

export interface ProjectReadinessStatus {
  readonly readiness: ProjectReadiness;
  readonly blockers: readonly string[];
}

export interface CreateProjectInput {
  readonly businessScopeOrganizationId: string;
  readonly number: string;
  readonly name: string;
  readonly customerOrganizationId: string;
  readonly facilityId: string;
  readonly timeZone: string;
  readonly readiness: ProjectReadinessDeclaration;
}

export interface RegisterDocumentInput {
  readonly number: string;
  readonly title: string;
  readonly type: string;
  readonly discipline: string;
}

export interface SubmitDocumentRevisionInput {
  readonly revision: string;
  readonly purpose: string;
  readonly source: string;
  readonly fileId: string;
  readonly requiredApprovalCount: number;
}

export interface GrantAccessAssignmentInput {
  readonly userId: string;
  readonly actingOrganizationId: string;
  readonly permissions: readonly string[];
  readonly scope: ResourceScope;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date;
  readonly grantReason: string;
}

export interface ProposeDelegationInput {
  readonly delegateUserId: string;
  readonly actingOrganizationId: string;
  readonly permissions: readonly string[];
  readonly scope: ResourceScope;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date;
  readonly justification: string;
}

export interface CreateProjectStructureInput {
  readonly type: ProjectStructureType;
  readonly parentId: string | null;
  readonly code: string;
  readonly name: string;
}

export interface AddProjectOrganizationInput {
  readonly organizationId: string;
  readonly participationRole: ProjectOrganizationRecord["participationRole"];
}

export interface AssignResponsibilityInput {
  readonly targetType: ResponsibilityAssignmentRecord["targetType"];
  readonly targetId: string;
  readonly responsibilityType: string;
  readonly organizationId: string;
  readonly personId: string | null;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
}

export interface SubmitProjectConfigurationInput {
  readonly configurationCode: string;
  readonly revision: string;
  readonly settings: Readonly<Record<string, string | number | boolean>>;
  readonly governingDocumentRevisionIds: readonly string[];
  readonly effectiveFrom: Date;
}

export interface DistributeDocumentRevisionInput {
  readonly recipientOrganizationId: string;
  readonly recipientUserId: string | null;
  readonly workPackageId: string | null;
  readonly purpose: string;
  readonly acknowledgementRequired: boolean;
}

export interface LinkGoverningDocumentInput {
  readonly targetType: string;
  readonly targetId: string;
  readonly documentRevisionId: string;
  readonly governingPurpose: string;
}

export interface ProposeRetentionPolicyInput {
  readonly recordClass: string;
  readonly contractReference: string;
  readonly retentionDurationDays: number;
  readonly dispositionAction: RetentionPolicyRecord["dispositionAction"];
}

type IdFactory = () => string;
type Clock = () => Date;

function normalizedRequired(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new ValidationError(`${field} is required.`, [`${field}_required`]);
  return normalized;
}

function validateTimeZone(value: string): string {
  const normalized = normalizedRequired(value, "timeZone");
  const canonical = canonicalTimeZone(normalized);
  if (!canonical) throw new ValidationError("timeZone must be a valid IANA time zone.", ["time_zone_invalid"]);
  return canonical;
}

function uniqueRequired(values: readonly string[], field: string): readonly string[] {
  const normalized = values.map((value) => normalizedRequired(value, field));
  if (normalized.length === 0) throw new ValidationError(`${field} is required.`, [`${field}_required`]);
  if (new Set(normalized).size !== normalized.length) throw new ValidationError(`${field} contains duplicates.`, [`${field}_duplicate`]);
  return normalized;
}

function canonicalHash(value: Readonly<Record<string, unknown>>): string {
  const ordered = Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
  return createHash("sha256").update(JSON.stringify(ordered)).digest("hex");
}

const protectedAuditField = /(authorization|credential|legal.?tax|password|private.?key|secret|token|file.?content)/iu;

function redactAuditValue(value: unknown, key: string): { readonly value: unknown; readonly redacted: boolean } {
  if (protectedAuditField.test(key)) return { value: "[REDACTED]", redacted: true };
  if (Array.isArray(value)) {
    const items = value.map((item) => redactAuditValue(item, key));
    return { value: items.map((item) => item.value), redacted: items.some((item) => item.redacted) };
  }
  if (value && typeof value === "object") {
    let redacted = false;
    const entries = Object.entries(value).map(([childKey, childValue]) => {
      const child = redactAuditValue(childValue, childKey);
      redacted ||= child.redacted;
      return [childKey, child.value] as const;
    });
    return { value: Object.fromEntries(entries), redacted };
  }
  return { value, redacted: false };
}

function auditEvent(
  idFactory: IdFactory,
  now: Date,
  context: AccessContext,
  input: Omit<AuditEvent, "id" | "occurredAt" | "actorUserId" | "actingOrganizationId" | "correlationId" | "canonicalSha256">,
): AuditEvent {
  const payload = {
    actorUserId: context.userId,
    actingOrganizationId: context.actingOrganizationId,
    projectId: input.projectId,
    action: input.action,
    objectType: input.objectType,
    objectId: input.objectId,
    priorState: input.priorState,
    newState: input.newState,
    reason: input.reason,
    correlationId: context.correlationId,
    changedFields: input.changedFields,
  };
  return {
    id: idFactory(),
    occurredAt: now,
    ...payload,
    canonicalSha256: canonicalHash(payload),
  };
}

function baseScope(organizationId: string | null, projectId: string | null, objectId: string | null) {
  return { organizationId, projectId, workPackageId: null, objectId };
}

export class FoundationService {
  public constructor(
    private readonly store: FoundationStore,
    private readonly clock: Clock = () => new Date(),
    private readonly idFactory: IdFactory = randomUUID,
  ) {}

  public listProjects(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
  ): Promise<readonly ProjectRecord[]> {
    const now = this.clock();
    return this.store.transaction((transaction) => transaction.projects().filter((project) => authorize(
      context,
      assignments,
      {
        action: "project.read",
        resource: baseScope(project.businessScopeOrganizationId, project.id, project.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "standard",
      },
      now,
    ).allowed));
  }

  public createProject(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    input: CreateProjectInput,
  ): Promise<ProjectRecord> {
    const now = this.clock();
    requireAuthorization(
      context,
      assignments,
      {
        action: "project.create",
        resource: baseScope(input.businessScopeOrganizationId, null, null),
        requiredQualifications: [],
        forbiddenActorIds: [],
        minimumAssurance: "mfa",
      },
      now,
    );

    const project: ProjectRecord = {
      id: this.idFactory(),
      businessScopeOrganizationId: normalizedRequired(input.businessScopeOrganizationId, "businessScopeOrganizationId"),
      number: normalizedRequired(input.number, "number").toUpperCase(),
      name: normalizedRequired(input.name, "name"),
      customerOrganizationId: normalizedRequired(input.customerOrganizationId, "customerOrganizationId"),
      facilityId: normalizedRequired(input.facilityId, "facilityId"),
      timeZone: validateTimeZone(input.timeZone),
      state: "draft",
      readiness: {
        ...structuredClone(input.readiness),
        customerConfigured: false,
        facilityConfigured: false,
        projectAuthorityAssigned: false,
        qualityAuthorityAssigned: false,
        documentControlAuthorityAssigned: false,
        completionBoundaryCount: 0,
        responsibilityAssignmentCount: 0,
        approvedRequirementReferenceCount: 0,
        turnoverBaselineConfigured: false,
        blockingExceptionCount: 0,
      },
      version: 1,
      createdAt: now,
      createdBy: context.userId,
      updatedAt: now,
      updatedBy: context.userId,
    };

    return this.store.transaction((transaction) => {
      if (transaction.projectByNumber(project.businessScopeOrganizationId, project.number)) {
        throw new ConflictError("The project number already exists in this business scope.");
      }
      transaction.insertProject(project);
      transaction.appendAudit(
        auditEvent(this.idFactory, now, context, {
          projectId: project.id,
          action: "project.created",
          objectType: "project",
          objectId: project.id,
          priorState: null,
          newState: project.state,
          reason: null,
          changedFields: { number: project.number, name: project.name },
        }),
      );
      return project;
    });
  }

  public activateProject(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    expectedVersion: number,
  ): Promise<ProjectRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(
        context,
        assignments,
        {
          action: "project.activate",
          resource: baseScope(project.businessScopeOrganizationId, project.id, project.id),
          requiredQualifications: [],
          forbiddenActorIds: [],
          minimumAssurance: "step-up",
        },
        now,
      );
      if (project.version !== expectedVersion) throw new ConflictError();
      if (project.state !== "draft" && project.state !== "readiness_review") {
        throw new ValidationError("The project cannot be activated from its current state.", ["invalid_project_transition"]);
      }
      const readiness = authoritativeProjectReadiness(transaction, project, now);
      const blockers = projectReadinessBlockers(readiness);
      if (blockers.length > 0) throw new ValidationError("Project readiness checks failed.", blockers);

      const updated: ProjectRecord = {
        ...project,
        readiness,
        state: "active",
        version: project.version + 1,
        updatedAt: now,
        updatedBy: context.userId,
      };
      transaction.updateProject(updated, expectedVersion);
      transaction.appendAudit(
        auditEvent(this.idFactory, now, context, {
          projectId: project.id,
          action: "project.activated",
          objectType: "project",
          objectId: project.id,
          priorState: project.state,
          newState: updated.state,
          reason: "readiness_checks_passed",
          changedFields: { state: { from: project.state, to: updated.state }, readinessEvidence: readiness },
        }),
      );
      return updated;
    });
  }

  public projectReadiness(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
  ): Promise<ProjectReadinessStatus> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "project.read", resource: baseScope(project.businessScopeOrganizationId, project.id, project.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "standard",
      }, now);
      const readiness = authoritativeProjectReadiness(transaction, project, now);
      return { readiness, blockers: projectReadinessBlockers(readiness) };
    });
  }

  public grantAccessAssignment(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    input: GrantAccessAssignmentInput,
  ): Promise<ManagedAccessAssignmentRecord> {
    const now = this.clock();
    requireAuthorization(context, assignments, {
      action: "access.assignment.manage", resource: input.scope, requiredQualifications: ["access_administrator"],
      forbiddenActorIds: [input.userId], minimumAssurance: "step-up",
    }, now);
    if (input.effectiveTo.getTime() <= input.effectiveFrom.getTime() || input.effectiveTo.getTime() <= now.getTime()) {
      throw new ValidationError("Access assignments must have a future bounded expiration.", ["access_assignment_time_invalid"]);
    }
    const assignment: ManagedAccessAssignmentRecord = {
      id: this.idFactory(), userId: normalizedRequired(input.userId, "userId"),
      actingOrganizationId: normalizedRequired(input.actingOrganizationId, "actingOrganizationId"),
      permissions: uniqueRequired(input.permissions, "permissions"), scope: structuredClone(input.scope),
      effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo, revokedAt: null,
      grantedBy: context.userId, grantReason: normalizedRequired(input.grantReason, "grantReason"),
      reviewedAt: null, reviewedBy: null, version: 1, createdAt: now,
    };
    return this.store.transaction((transaction) => {
      transaction.insertAccessAssignment(assignment);
      transaction.appendAudit(auditEvent(this.idFactory, now, context, {
        projectId: assignment.scope.projectId, action: "access.assignment_changed", objectType: "role_assignment",
        objectId: assignment.id, priorState: null, newState: "active", reason: assignment.grantReason,
        changedFields: { userId: assignment.userId, permissions: assignment.permissions, scope: assignment.scope,
          effectiveTo: assignment.effectiveTo?.toISOString() },
      }));
      return assignment;
    });
  }

  public reviewAccessAssignment(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    assignmentId: string,
    expectedVersion: number,
  ): Promise<ManagedAccessAssignmentRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const managed = transaction.accessAssignmentById(assignmentId);
      if (!managed) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "access.assignment.review", resource: managed.scope, requiredQualifications: ["access_reviewer"],
        forbiddenActorIds: [managed.grantedBy, managed.userId], minimumAssurance: "step-up",
      }, now);
      if (managed.version !== expectedVersion) throw new ConflictError();
      const reviewed = { ...managed, reviewedAt: now, reviewedBy: context.userId, version: managed.version + 1 };
      transaction.updateAccessAssignment(reviewed, expectedVersion);
      transaction.appendAudit(auditEvent(this.idFactory, now, context, {
        projectId: managed.scope.projectId, action: "access.assignment_reviewed", objectType: "role_assignment",
        objectId: managed.id, priorState: managed.revokedAt ? "revoked" : "active",
        newState: managed.revokedAt ? "revoked" : "active", reason: null, changedFields: { reviewedBy: context.userId },
      }));
      return reviewed;
    });
  }

  public revokeAccessAssignment(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    assignmentId: string,
    expectedVersion: number,
    reason: string,
  ): Promise<ManagedAccessAssignmentRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const managed = transaction.accessAssignmentById(assignmentId);
      if (!managed) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "access.assignment.manage", resource: managed.scope, requiredQualifications: ["access_administrator"],
        forbiddenActorIds: [managed.userId], minimumAssurance: "step-up",
      }, now);
      if (managed.version !== expectedVersion) throw new ConflictError();
      if (managed.revokedAt) throw new ValidationError("The access assignment is already revoked.", ["access_assignment_revoked"]);
      const revoked = { ...managed, revokedAt: now, version: managed.version + 1 };
      transaction.updateAccessAssignment(revoked, expectedVersion);
      transaction.appendAudit(auditEvent(this.idFactory, now, context, {
        projectId: managed.scope.projectId, action: "access.assignment_changed", objectType: "role_assignment",
        objectId: managed.id, priorState: "active", newState: "revoked", reason: normalizedRequired(reason, "reason"),
        changedFields: { revokedAt: now.toISOString() },
      }));
      return revoked;
    });
  }

  public proposeDelegation(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    input: ProposeDelegationInput,
  ): Promise<DelegationRecord> {
    const now = this.clock();
    if (input.delegateUserId === context.userId) throw new AuthorizationDeniedError("separation_of_duty");
    requireAuthorization(context, assignments, {
      action: "access.delegation.create", resource: input.scope, requiredQualifications: [],
      forbiddenActorIds: [], minimumAssurance: "step-up",
    }, now);
    if (input.effectiveTo.getTime() <= input.effectiveFrom.getTime() || input.effectiveTo.getTime() <= now.getTime()) {
      throw new ValidationError("Delegation must have a future bounded expiration.", ["delegation_time_invalid"]);
    }
    const delegation: DelegationRecord = {
      id: this.idFactory(), delegatorUserId: context.userId,
      delegateUserId: normalizedRequired(input.delegateUserId, "delegateUserId"),
      actingOrganizationId: normalizedRequired(input.actingOrganizationId, "actingOrganizationId"),
      permissions: uniqueRequired(input.permissions, "permissions"), scope: structuredClone(input.scope),
      effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo,
      justification: normalizedRequired(input.justification, "justification"), state: "proposed",
      approvedAt: null, approvedBy: null, reviewedAt: null, reviewedBy: null,
      revokedAt: null, revokedBy: null, version: 1, createdAt: now,
    };
    return this.store.transaction((transaction) => {
      transaction.insertDelegation(delegation);
      transaction.appendAudit(auditEvent(this.idFactory, now, context, {
        projectId: delegation.scope.projectId, action: "delegation.created", objectType: "delegation", objectId: delegation.id,
        priorState: null, newState: delegation.state, reason: delegation.justification,
        changedFields: { delegateUserId: delegation.delegateUserId, permissions: delegation.permissions,
          scope: delegation.scope, effectiveTo: delegation.effectiveTo.toISOString() },
      }));
      return delegation;
    });
  }

  public approveDelegation(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    delegationId: string,
    expectedVersion: number,
  ): Promise<DelegationRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const delegation = transaction.delegationById(delegationId);
      if (!delegation || delegation.state !== "proposed") throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "access.delegation.manage", resource: delegation.scope, requiredQualifications: ["access_administrator"],
        forbiddenActorIds: [delegation.delegatorUserId, delegation.delegateUserId], minimumAssurance: "step-up",
      }, now);
      if (delegation.version !== expectedVersion) throw new ConflictError();
      if (delegation.effectiveTo.getTime() <= now.getTime()) {
        throw new ValidationError("The delegation expired before approval.", ["delegation_expired"]);
      }
      const active: DelegationRecord = {
        ...delegation, state: "active", approvedAt: now, approvedBy: context.userId,
        reviewedAt: now, reviewedBy: context.userId, version: delegation.version + 1,
      };
      transaction.updateDelegation(active, expectedVersion);
      transaction.appendAudit(auditEvent(this.idFactory, now, context, {
        projectId: delegation.scope.projectId, action: "delegation.approved", objectType: "delegation", objectId: delegation.id,
        priorState: delegation.state, newState: active.state, reason: delegation.justification,
        changedFields: { approvedBy: context.userId },
      }));
      return active;
    });
  }

  public reviewDelegation(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    delegationId: string,
    expectedVersion: number,
  ): Promise<DelegationRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const delegation = transaction.delegationById(delegationId);
      if (!delegation) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "access.delegation.review", resource: delegation.scope, requiredQualifications: ["access_reviewer"],
        forbiddenActorIds: [delegation.delegatorUserId, delegation.delegateUserId], minimumAssurance: "step-up",
      }, now);
      if (delegation.version !== expectedVersion) throw new ConflictError();
      const state = delegation.state === "active" && delegation.effectiveTo.getTime() <= now.getTime() ? "expired" : delegation.state;
      const reviewed: DelegationRecord = {
        ...delegation, state, reviewedAt: now, reviewedBy: context.userId, version: delegation.version + 1,
      };
      transaction.updateDelegation(reviewed, expectedVersion);
      transaction.appendAudit(auditEvent(this.idFactory, now, context, {
        projectId: delegation.scope.projectId, action: state === "expired" ? "delegation.expired" : "delegation.reviewed",
        objectType: "delegation", objectId: delegation.id, priorState: delegation.state, newState: state,
        reason: null, changedFields: { reviewedBy: context.userId },
      }));
      return reviewed;
    });
  }

  public revokeDelegation(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    delegationId: string,
    expectedVersion: number,
    reason: string,
  ): Promise<DelegationRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const delegation = transaction.delegationById(delegationId);
      if (!delegation) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "access.delegation.revoke", resource: delegation.scope, requiredQualifications: [],
        forbiddenActorIds: [delegation.delegateUserId], minimumAssurance: "step-up",
      }, now);
      if (delegation.version !== expectedVersion) throw new ConflictError();
      if (delegation.state === "revoked") throw new ValidationError("The delegation is already revoked.", ["delegation_revoked"]);
      const revoked: DelegationRecord = {
        ...delegation, state: "revoked", revokedAt: now, revokedBy: context.userId, version: delegation.version + 1,
      };
      transaction.updateDelegation(revoked, expectedVersion);
      transaction.appendAudit(auditEvent(this.idFactory, now, context, {
        projectId: delegation.scope.projectId, action: "delegation.revoked", objectType: "delegation", objectId: delegation.id,
        priorState: delegation.state, newState: revoked.state, reason: normalizedRequired(reason, "reason"),
        changedFields: { revokedBy: context.userId },
      }));
      return revoked;
    });
  }

  public createProjectStructureElement(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    input: CreateProjectStructureInput,
  ): Promise<ProjectStructureElementRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "project.structure.manage", resource: baseScope(project.businessScopeOrganizationId, project.id, input.parentId),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      const parent = input.parentId ? transaction.projectStructureById(input.parentId) : null;
      if (input.parentId && (!parent || parent.projectId !== project.id || parent.state !== "active")) throw new NotFoundError();
      if (input.type === "work_package" && parent?.type !== "wbs") {
        throw new ValidationError("A work package must be placed under a WBS element.", ["work_package_parent_invalid"]);
      }
      if (input.type !== "work_package" && parent && input.type !== "wbs") {
        throw new ValidationError("This structure type cannot have the supplied parent.", ["project_structure_parent_invalid"]);
      }
      if (input.type === "wbs" && parent && parent.type !== "wbs") {
        throw new ValidationError("A nested WBS element must have a WBS parent.", ["wbs_parent_invalid"]);
      }
      const code = normalizedRequired(input.code, "code").toUpperCase();
      if (transaction.projectStructureByCode(project.id, input.type, code)) throw new ConflictError();
      const element: ProjectStructureElementRecord = {
        id: this.idFactory(), projectId: project.id, type: input.type, parentId: parent?.id ?? null,
        code, name: normalizedRequired(input.name, "name"), state: "active", version: 1,
        createdAt: now, createdBy: context.userId,
      };
      transaction.insertProjectStructure(element);
      transaction.appendAudit(auditEvent(this.idFactory, now, context, {
        projectId: project.id, action: "project.structure_changed", objectType: `project_${element.type}`, objectId: element.id,
        priorState: null, newState: element.state, reason: null,
        changedFields: { type: element.type, code: element.code, name: element.name, parentId: element.parentId },
      }));
      return element;
    });
  }

  public addProjectOrganization(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    input: AddProjectOrganizationInput,
  ): Promise<ProjectOrganizationRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "project.assignment.manage", resource: baseScope(project.businessScopeOrganizationId, project.id, null),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      const organizationId = normalizedRequired(input.organizationId, "organizationId");
      if (transaction.projectOrganizationByOrganization(project.id, organizationId)) throw new ConflictError();
      const organization: ProjectOrganizationRecord = {
        id: this.idFactory(), projectId: project.id, organizationId, participationRole: input.participationRole,
        state: "active", version: 1, createdAt: now, createdBy: context.userId,
      };
      transaction.insertProjectOrganization(organization);
      transaction.appendAudit(auditEvent(this.idFactory, now, context, {
        projectId: project.id, action: "project.organization_added", objectType: "project_organization", objectId: organization.id,
        priorState: null, newState: organization.state, reason: organization.participationRole,
        changedFields: { organizationId, participationRole: organization.participationRole },
      }));
      return organization;
    });
  }

  public assignProjectResponsibility(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    input: AssignResponsibilityInput,
  ): Promise<ResponsibilityAssignmentRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "project.assignment.manage", resource: baseScope(project.businessScopeOrganizationId, project.id, input.targetId),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      const projectOrganization = transaction.projectOrganizationByOrganization(project.id, input.organizationId);
      if (!projectOrganization || projectOrganization.state !== "active") {
        throw new ValidationError("Responsibility organization must participate in the project.", ["project_organization_missing"]);
      }
      if (input.targetType === "project") {
        if (input.targetId !== project.id) throw new ValidationError("Project responsibility target is invalid.", ["responsibility_target_invalid"]);
      } else {
        const target = transaction.projectStructureById(input.targetId);
        if (!target || target.projectId !== project.id || target.type !== input.targetType) throw new NotFoundError();
      }
      if (input.effectiveTo && input.effectiveTo.getTime() <= input.effectiveFrom.getTime()) {
        throw new ValidationError("Responsibility effective dates are invalid.", ["responsibility_time_invalid"]);
      }
      const responsibility: ResponsibilityAssignmentRecord = {
        id: this.idFactory(), projectId: project.id, targetType: input.targetType,
        targetId: normalizedRequired(input.targetId, "targetId"),
        responsibilityType: normalizedRequired(input.responsibilityType, "responsibilityType"),
        organizationId: projectOrganization.organizationId, personId: input.personId,
        effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo, state: "active", version: 1,
        createdAt: now, createdBy: context.userId,
      };
      transaction.insertResponsibilityAssignment(responsibility);
      transaction.appendAudit(auditEvent(this.idFactory, now, context, {
        projectId: project.id, action: "responsibility.assigned", objectType: "responsibility_assignment", objectId: responsibility.id,
        priorState: null, newState: responsibility.state, reason: responsibility.responsibilityType,
        changedFields: { targetType: responsibility.targetType, targetId: responsibility.targetId,
          organizationId: responsibility.organizationId, personId: responsibility.personId },
      }));
      return responsibility;
    });
  }

  public submitProjectConfiguration(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    input: SubmitProjectConfigurationInput,
  ): Promise<ProjectConfigurationRevisionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "project.configuration.manage", resource: baseScope(project.businessScopeOrganizationId, project.id, null),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      const configurationCode = normalizedRequired(input.configurationCode, "configurationCode").toUpperCase();
      const revision = normalizedRequired(input.revision, "revision");
      if (transaction.projectConfigurationByRevision(project.id, configurationCode, revision)) throw new ConflictError();
      if (Object.keys(input.settings).length === 0) {
        throw new ValidationError("Project configuration settings are required.", ["project_configuration_settings_missing"]);
      }
      const governingDocumentRevisionIds = uniqueRequired(input.governingDocumentRevisionIds, "governingDocumentRevisionIds");
      for (const revisionId of governingDocumentRevisionIds) {
        const governingRevision = transaction.revisionById(revisionId);
        if (!governingRevision || governingRevision.state !== "released") {
          throw new ValidationError("Every governing configuration reference must be an exact released revision.", ["governing_revision_not_released"]);
        }
      }
      const configuration: ProjectConfigurationRevisionRecord = {
        id: this.idFactory(), projectId: project.id, configurationCode, revision,
        settings: structuredClone(input.settings), governingDocumentRevisionIds,
        effectiveFrom: input.effectiveFrom, state: "under_review",
        supersedesRevisionId: transaction.currentProjectConfiguration(project.id, configurationCode)?.id ?? null,
        approvedAt: null, approvedBy: null, version: 1, createdAt: now, createdBy: context.userId,
        updatedAt: now, updatedBy: context.userId,
      };
      transaction.insertProjectConfiguration(configuration);
      transaction.appendAudit(auditEvent(this.idFactory, now, context, {
        projectId: project.id, action: "project.configuration_submitted", objectType: "project_configuration_revision",
        objectId: configuration.id, priorState: null, newState: configuration.state, reason: configuration.configurationCode,
        changedFields: { revision: configuration.revision, effectiveFrom: configuration.effectiveFrom.toISOString(),
          governingDocumentRevisionIds },
      }));
      return configuration;
    });
  }

  public approveProjectConfiguration(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    configurationId: string,
    expectedVersion: number,
  ): Promise<ProjectConfigurationRevisionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const configuration = transaction.projectConfigurationById(configurationId);
      const project = configuration ? transaction.projectById(configuration.projectId) : null;
      if (!configuration || !project || configuration.state !== "under_review") throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "project.configuration.approve", resource: baseScope(project.businessScopeOrganizationId, project.id, configuration.id),
        requiredQualifications: ["project_configuration_authority"], forbiddenActorIds: [configuration.createdBy], minimumAssurance: "step-up",
      }, now);
      if (configuration.version !== expectedVersion) throw new ConflictError();
      if (configuration.effectiveFrom.getTime() > now.getTime()) {
        throw new ValidationError("Future configuration activation is not yet supported.", ["configuration_effective_time_future"]);
      }
      const prior = transaction.currentProjectConfiguration(project.id, configuration.configurationCode);
      if (prior) {
        transaction.updateProjectConfiguration({
          ...prior, state: "superseded", version: prior.version + 1, updatedAt: now, updatedBy: context.userId,
        }, prior.version);
      }
      const active: ProjectConfigurationRevisionRecord = {
        ...configuration, state: "active", supersedesRevisionId: prior?.id ?? null,
        approvedAt: now, approvedBy: context.userId, version: configuration.version + 1,
        updatedAt: now, updatedBy: context.userId,
      };
      transaction.updateProjectConfiguration(active, expectedVersion);
      transaction.appendAudit(auditEvent(this.idFactory, now, context, {
        projectId: project.id, action: "project.configuration_activated", objectType: "project_configuration_revision",
        objectId: configuration.id, priorState: configuration.state, newState: active.state,
        reason: active.configurationCode, changedFields: { revision: active.revision, supersedesRevisionId: active.supersedesRevisionId },
      }));
      return active;
    });
  }

  public currentProjectConfiguration(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    configurationCode: string,
  ): Promise<ProjectConfigurationRevisionRecord | null> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "project.read", resource: baseScope(project.businessScopeOrganizationId, project.id, null),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "standard",
      }, now);
      return transaction.currentProjectConfiguration(project.id, normalizedRequired(configurationCode, "configurationCode").toUpperCase());
    });
  }

  public registerDocument(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    input: RegisterDocumentInput,
  ): Promise<DocumentRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(
        context,
        assignments,
        {
          action: "document.create",
          resource: baseScope(project.businessScopeOrganizationId, project.id, null),
          requiredQualifications: [],
          forbiddenActorIds: [],
          minimumAssurance: "mfa",
        },
        now,
      );
      const number = normalizedRequired(input.number, "number").toUpperCase();
      if (transaction.documentByNumber(project.id, number)) {
        throw new ConflictError("The document number already exists in this project.");
      }
      const document: DocumentRecord = {
        id: this.idFactory(),
        projectId: project.id,
        number,
        title: normalizedRequired(input.title, "title"),
        type: normalizedRequired(input.type, "type"),
        discipline: normalizedRequired(input.discipline, "discipline"),
        currentRevisionId: null,
        version: 1,
        createdAt: now,
        createdBy: context.userId,
        updatedAt: now,
        updatedBy: context.userId,
      };
      transaction.insertDocument(document);
      transaction.appendAudit(
        auditEvent(this.idFactory, now, context, {
          projectId: project.id,
          action: "document.created",
          objectType: "document",
          objectId: document.id,
          priorState: null,
          newState: "registered",
          reason: null,
          changedFields: { number: document.number, title: document.title },
        }),
      );
      return document;
    });
  }

  public submitDocumentRevision(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    documentId: string,
    input: SubmitDocumentRevisionInput,
  ): Promise<DocumentRevisionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const document = transaction.documentById(documentId);
      if (!document) throw new NotFoundError();
      const project = transaction.projectById(document.projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(
        context,
        assignments,
        {
          action: "document.revision.submit",
          resource: baseScope(project.businessScopeOrganizationId, project.id, document.id),
          requiredQualifications: [],
          forbiddenActorIds: [],
          minimumAssurance: "mfa",
        },
        now,
      );
      const revisionName = normalizedRequired(input.revision, "revision");
      if (transaction.revisionByName(document.id, revisionName)) {
        throw new ConflictError("The document revision already exists.");
      }
      if (input.requiredApprovalCount < 1 || !Number.isInteger(input.requiredApprovalCount)) {
        throw new ValidationError("At least one approval is required.", ["required_approval_count_invalid"]);
      }
      const fileId = normalizedRequired(input.fileId, "fileId");
      const governedFile = transaction.governedFileById(fileId);
      if (!governedFile || governedFile.projectId !== project.id) throw new NotFoundError();
      if (governedFile.validationState !== "released") {
        throw new ValidationError("Only a released governed file may enter document review.", ["file_not_released"]);
      }
      const revision: DocumentRevisionRecord = {
        id: this.idFactory(),
        documentId: document.id,
        revision: revisionName,
        state: "under_review",
        purpose: normalizedRequired(input.purpose, "purpose"),
        source: normalizedRequired(input.source, "source"),
        fileId,
        fileValidationState: governedFile.validationState,
        approvalCount: 0,
        requiredApprovalCount: input.requiredApprovalCount,
        supersedesRevisionId: document.currentRevisionId,
        version: 1,
        createdAt: now,
        createdBy: context.userId,
        updatedAt: now,
        updatedBy: context.userId,
      };
      transaction.insertRevision(revision);
      transaction.appendAudit(
        auditEvent(this.idFactory, now, context, {
          projectId: project.id,
          action: "document.revision_submitted",
          objectType: "document_revision",
          objectId: revision.id,
          priorState: null,
          newState: revision.state,
          reason: null,
          changedFields: { revision: revision.revision, fileId: revision.fileId },
        }),
      );
      return revision;
    });
  }

  public approveDocumentRevision(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    revisionId: string,
    expectedVersion: number,
    independentApprovalRequired: boolean,
  ): Promise<DocumentRevisionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const revision = transaction.revisionById(revisionId);
      if (!revision) throw new NotFoundError();
      const document = transaction.documentById(revision.documentId);
      if (!document) throw new NotFoundError();
      const project = transaction.projectById(document.projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(
        context,
        assignments,
        {
          action: "document.approve",
          resource: baseScope(project.businessScopeOrganizationId, project.id, document.id),
          requiredQualifications: [],
          forbiddenActorIds: independentApprovalRequired ? [revision.createdBy] : [],
          minimumAssurance: "step-up",
        },
        now,
      );
      if (revision.version !== expectedVersion) throw new ConflictError();
      if (revision.state !== "under_review") {
        throw new ValidationError("Only a revision under review can be approved.", ["invalid_document_transition"]);
      }
      const approvalCount = revision.approvalCount + 1;
      const updated: DocumentRevisionRecord = {
        ...revision,
        approvalCount,
        state: approvalCount >= revision.requiredApprovalCount ? "approved" : "under_review",
        version: revision.version + 1,
        updatedAt: now,
        updatedBy: context.userId,
      };
      transaction.updateRevision(updated, expectedVersion);
      transaction.appendAudit(
        auditEvent(this.idFactory, now, context, {
          projectId: project.id,
          action: "document.revision_approved",
          objectType: "document_revision",
          objectId: revision.id,
          priorState: revision.state,
          newState: updated.state,
          reason: null,
          changedFields: { approvalCount: { from: revision.approvalCount, to: updated.approvalCount } },
        }),
      );
      return updated;
    });
  }

  public releaseDocumentRevision(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    revisionId: string,
    expectedRevisionVersion: number,
    expectedDocumentVersion: number,
  ): Promise<DocumentRevisionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const revision = transaction.revisionById(revisionId);
      if (!revision) throw new NotFoundError();
      const document = transaction.documentById(revision.documentId);
      if (!document) throw new NotFoundError();
      const project = transaction.projectById(document.projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(
        context,
        assignments,
        {
          action: "document.release",
          resource: baseScope(project.businessScopeOrganizationId, project.id, document.id),
          requiredQualifications: [],
          forbiddenActorIds: [revision.createdBy],
          minimumAssurance: "step-up",
        },
        now,
      );
      if (revision.version !== expectedRevisionVersion || document.version !== expectedDocumentVersion) {
        throw new ConflictError();
      }
      const governedFile = transaction.governedFileById(revision.fileId);
      if (!governedFile || governedFile.projectId !== project.id) throw new NotFoundError();
      const blockers = documentReleaseBlockers({ ...revision, fileValidationState: governedFile.validationState });
      if (blockers.length > 0) throw new ValidationError("Document release checks failed.", blockers);

      if (document.currentRevisionId) {
        const prior = transaction.revisionById(document.currentRevisionId);
        if (!prior || prior.state !== "released") {
          throw new ConflictError("The document current-revision pointer is inconsistent.");
        }
        const superseded: DocumentRevisionRecord = {
          ...prior,
          state: "superseded",
          version: prior.version + 1,
          updatedAt: now,
          updatedBy: context.userId,
        };
        transaction.updateRevision(superseded, prior.version);
        transaction.appendAudit(
          auditEvent(this.idFactory, now, context, {
            projectId: project.id,
            action: "document.superseded",
            objectType: "document_revision",
            objectId: prior.id,
            priorState: prior.state,
            newState: superseded.state,
            reason: `superseded_by:${revision.id}`,
            changedFields: { state: { from: prior.state, to: superseded.state } },
          }),
        );
      }

      const released: DocumentRevisionRecord = {
        ...revision,
        state: "released",
        version: revision.version + 1,
        updatedAt: now,
        updatedBy: context.userId,
      };
      const updatedDocument: DocumentRecord = {
        ...document,
        currentRevisionId: revision.id,
        version: document.version + 1,
        updatedAt: now,
        updatedBy: context.userId,
      };
      transaction.updateRevision(released, expectedRevisionVersion);
      transaction.updateDocument(updatedDocument, expectedDocumentVersion);
      transaction.appendAudit(
        auditEvent(this.idFactory, now, context, {
          projectId: project.id,
          action: "document.released",
          objectType: "document_revision",
          objectId: revision.id,
          priorState: revision.state,
          newState: released.state,
          reason: null,
          changedFields: { currentRevisionId: revision.id },
        }),
      );
      return released;
    });
  }

  public distributeDocumentRevision(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    revisionId: string,
    input: DistributeDocumentRevisionInput,
  ): Promise<DocumentDistributionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const revision = transaction.revisionById(revisionId);
      const document = revision ? transaction.documentById(revision.documentId) : null;
      const project = document ? transaction.projectById(document.projectId) : null;
      if (!revision || !document || !project || revision.state !== "released") throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "document.distribute", resource: baseScope(project.businessScopeOrganizationId, project.id, revision.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      const distribution: DocumentDistributionRecord = {
        id: this.idFactory(), projectId: project.id, documentRevisionId: revision.id,
        recipientOrganizationId: normalizedRequired(input.recipientOrganizationId, "recipientOrganizationId"),
        recipientUserId: input.recipientUserId, workPackageId: input.workPackageId,
        purpose: normalizedRequired(input.purpose, "purpose"), acknowledgementRequired: input.acknowledgementRequired,
        distributedAt: now, distributedBy: context.userId, downloadedAt: null, downloadedBy: null,
        acknowledgedAt: null, acknowledgedBy: null, acknowledgementMeaning: null, version: 1,
      };
      transaction.insertDocumentDistribution(distribution);
      transaction.appendAudit(auditEvent(this.idFactory, now, context, {
        projectId: project.id, action: "document.distributed", objectType: "document_distribution", objectId: distribution.id,
        priorState: null, newState: input.acknowledgementRequired ? "acknowledgement_required" : "issued",
        reason: distribution.purpose,
        changedFields: { documentRevisionId: revision.id, recipientOrganizationId: distribution.recipientOrganizationId,
          recipientUserId: distribution.recipientUserId, workPackageId: distribution.workPackageId },
      }));
      return distribution;
    });
  }

  public downloadDistributedDocument(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    distributionId: string,
    expectedVersion: number,
  ): Promise<{ readonly distribution: DocumentDistributionRecord; readonly revision: DocumentRevisionRecord; readonly fileId: string }> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const distribution = transaction.documentDistributionById(distributionId);
      const revision = distribution ? transaction.revisionById(distribution.documentRevisionId) : null;
      if (!distribution || !revision || revision.state !== "released") throw new NotFoundError();
      if (distribution.recipientOrganizationId !== context.actingOrganizationId
        || (distribution.recipientUserId && distribution.recipientUserId !== context.userId)) {
        throw new AuthorizationDeniedError("scope_denied");
      }
      requireAuthorization(context, assignments, {
        action: "file.download",
        resource: { organizationId: distribution.recipientOrganizationId, projectId: distribution.projectId,
          workPackageId: distribution.workPackageId, objectId: revision.id },
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (distribution.version !== expectedVersion) throw new ConflictError();
      const downloaded: DocumentDistributionRecord = {
        ...distribution, downloadedAt: now, downloadedBy: context.userId, version: distribution.version + 1,
      };
      transaction.updateDocumentDistribution(downloaded, expectedVersion);
      transaction.appendAudit(auditEvent(this.idFactory, now, context, {
        projectId: distribution.projectId, action: "file.downloaded", objectType: "document_revision", objectId: revision.id,
        priorState: revision.state, newState: revision.state, reason: distribution.purpose,
        changedFields: { distributionId: distribution.id, fileId: revision.fileId },
      }));
      return { distribution: downloaded, revision, fileId: revision.fileId };
    });
  }

  public acknowledgeDocumentDistribution(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    distributionId: string,
    expectedVersion: number,
    meaning: string,
  ): Promise<DocumentDistributionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const distribution = transaction.documentDistributionById(distributionId);
      if (!distribution || !distribution.acknowledgementRequired) throw new NotFoundError();
      if (distribution.recipientOrganizationId !== context.actingOrganizationId
        || (distribution.recipientUserId && distribution.recipientUserId !== context.userId)) {
        throw new AuthorizationDeniedError("scope_denied");
      }
      requireAuthorization(context, assignments, {
        action: "document.acknowledge",
        resource: { organizationId: distribution.recipientOrganizationId, projectId: distribution.projectId,
          workPackageId: distribution.workPackageId, objectId: distribution.documentRevisionId },
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (distribution.version !== expectedVersion) throw new ConflictError();
      if (distribution.acknowledgedAt) throw new ValidationError("The distribution is already acknowledged.", ["distribution_already_acknowledged"]);
      const acknowledged: DocumentDistributionRecord = {
        ...distribution, acknowledgedAt: now, acknowledgedBy: context.userId,
        acknowledgementMeaning: normalizedRequired(meaning, "meaning"), version: distribution.version + 1,
      };
      transaction.updateDocumentDistribution(acknowledged, expectedVersion);
      transaction.appendAudit(auditEvent(this.idFactory, now, context, {
        projectId: distribution.projectId, action: "document.acknowledged", objectType: "document_distribution", objectId: distribution.id,
        priorState: "acknowledgement_required", newState: "acknowledged", reason: acknowledged.acknowledgementMeaning,
        changedFields: { acknowledgedBy: context.userId, documentRevisionId: distribution.documentRevisionId },
      }));
      return acknowledged;
    });
  }

  public linkGoverningDocumentRevision(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    input: LinkGoverningDocumentInput,
  ): Promise<GoverningDocumentLinkRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      const revision = transaction.revisionById(input.documentRevisionId);
      const document = revision ? transaction.documentById(revision.documentId) : null;
      if (!project || !revision || !document || document.projectId !== project.id || revision.state !== "released") throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "record.governing_document.link", resource: baseScope(project.businessScopeOrganizationId, project.id, input.targetId),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      const link: GoverningDocumentLinkRecord = {
        id: this.idFactory(), projectId: project.id, targetType: normalizedRequired(input.targetType, "targetType"),
        targetId: normalizedRequired(input.targetId, "targetId"), documentRevisionId: revision.id,
        governingPurpose: normalizedRequired(input.governingPurpose, "governingPurpose"),
        state: "active", version: 1, createdAt: now, createdBy: context.userId,
      };
      transaction.insertGoverningDocumentLink(link);
      transaction.appendAudit(auditEvent(this.idFactory, now, context, {
        projectId: project.id, action: "record.governing_document_linked", objectType: link.targetType, objectId: link.targetId,
        priorState: null, newState: "governed", reason: link.governingPurpose,
        changedFields: { documentRevisionId: revision.id, linkId: link.id },
      }));
      return link;
    });
  }

  public currentDocumentRevision(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    documentId: string,
  ): Promise<DocumentRevisionRecord | null> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const document = transaction.documentById(documentId);
      if (!document) throw new NotFoundError();
      const project = transaction.projectById(document.projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(
        context,
        assignments,
        {
          action: "document.read_current",
          resource: baseScope(project.businessScopeOrganizationId, project.id, document.id),
          requiredQualifications: [],
          forbiddenActorIds: [],
          minimumAssurance: "standard",
        },
        now,
      );
      if (!document.currentRevisionId) return null;
      const revision = transaction.revisionById(document.currentRevisionId);
      if (!revision || revision.state !== "released") {
        throw new ConflictError("The current-for-work invariant is inconsistent.");
      }
      return revision;
    });
  }

  public proposeRetentionPolicy(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    input: ProposeRetentionPolicyInput,
  ): Promise<RetentionPolicyRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "records.retention.manage", resource: baseScope(project.businessScopeOrganizationId, project.id, null),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "step-up",
      }, now);
      if (!Number.isInteger(input.retentionDurationDays) || input.retentionDurationDays < 0) {
        throw new ValidationError("Retention duration must be a nonnegative whole number of days.", ["retention_duration_invalid"]);
      }
      const policy: RetentionPolicyRecord = {
        id: this.idFactory(), projectId: project.id, recordClass: normalizedRequired(input.recordClass, "recordClass"),
        contractReference: normalizedRequired(input.contractReference, "contractReference"),
        retentionDurationDays: input.retentionDurationDays, dispositionAction: input.dispositionAction,
        state: "under_review", approvedAt: null, approvedBy: null, version: 1,
        createdAt: now, createdBy: context.userId,
      };
      transaction.insertRetentionPolicy(policy);
      transaction.appendAudit(auditEvent(this.idFactory, now, context, {
        projectId: project.id, action: "retention.policy_submitted", objectType: "retention_policy", objectId: policy.id,
        priorState: null, newState: policy.state, reason: policy.contractReference,
        changedFields: { recordClass: policy.recordClass, retentionDurationDays: policy.retentionDurationDays,
          dispositionAction: policy.dispositionAction },
      }));
      return policy;
    });
  }

  public approveRetentionPolicy(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    policyId: string,
    expectedVersion: number,
  ): Promise<RetentionPolicyRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const policy = transaction.retentionPolicyById(policyId);
      const project = policy ? transaction.projectById(policy.projectId) : null;
      if (!policy || !project || policy.state !== "under_review") throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "records.retention.approve", resource: baseScope(project.businessScopeOrganizationId, project.id, policy.id),
        requiredQualifications: ["records_retention_authority"], forbiddenActorIds: [policy.createdBy], minimumAssurance: "step-up",
      }, now);
      if (policy.version !== expectedVersion) throw new ConflictError();
      const prior = transaction.currentRetentionPolicy(project.id, policy.recordClass);
      if (prior) transaction.updateRetentionPolicy({ ...prior, state: "retired", version: prior.version + 1 }, prior.version);
      const active: RetentionPolicyRecord = {
        ...policy, state: "active", approvedAt: now, approvedBy: context.userId, version: policy.version + 1,
      };
      transaction.updateRetentionPolicy(active, expectedVersion);
      transaction.appendAudit(auditEvent(this.idFactory, now, context, {
        projectId: project.id, action: "retention.policy_approved", objectType: "retention_policy", objectId: policy.id,
        priorState: policy.state, newState: active.state, reason: active.contractReference,
        changedFields: { approvedBy: context.userId, supersededPolicyId: prior?.id ?? null },
      }));
      return active;
    });
  }

  public placeLegalHold(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    targetType: string,
    targetId: string,
    reason: string,
  ): Promise<LegalHoldRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "records.legal_hold.manage", resource: baseScope(project.businessScopeOrganizationId, project.id, targetId),
        requiredQualifications: ["legal_hold_authority"], forbiddenActorIds: [], minimumAssurance: "step-up",
      }, now);
      if (!this.recordCreatedAt(transaction, project.id, targetType, targetId)) throw new NotFoundError();
      const hold: LegalHoldRecord = {
        id: this.idFactory(), projectId: project.id, targetType: normalizedRequired(targetType, "targetType"),
        targetId: normalizedRequired(targetId, "targetId"), reason: normalizedRequired(reason, "reason"),
        state: "active", placedAt: now, placedBy: context.userId, releasedAt: null, releasedBy: null, version: 1,
      };
      transaction.insertLegalHold(hold);
      transaction.appendAudit(auditEvent(this.idFactory, now, context, {
        projectId: project.id, action: "records.legal_hold_placed", objectType: hold.targetType, objectId: hold.targetId,
        priorState: null, newState: "legal_hold", reason: hold.reason, changedFields: { legalHoldId: hold.id },
      }));
      return hold;
    });
  }

  public releaseLegalHold(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    holdId: string,
    expectedVersion: number,
    reason: string,
  ): Promise<LegalHoldRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const hold = transaction.legalHoldById(holdId);
      const project = hold ? transaction.projectById(hold.projectId) : null;
      if (!hold || !project || hold.state !== "active") throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "records.legal_hold.manage", resource: baseScope(project.businessScopeOrganizationId, project.id, hold.targetId),
        requiredQualifications: ["legal_hold_authority"], forbiddenActorIds: [hold.placedBy], minimumAssurance: "step-up",
      }, now);
      if (hold.version !== expectedVersion) throw new ConflictError();
      const released: LegalHoldRecord = {
        ...hold, state: "released", releasedAt: now, releasedBy: context.userId, version: hold.version + 1,
      };
      transaction.updateLegalHold(released, expectedVersion);
      transaction.appendAudit(auditEvent(this.idFactory, now, context, {
        projectId: project.id, action: "records.legal_hold_released", objectType: hold.targetType, objectId: hold.targetId,
        priorState: "legal_hold", newState: "retention_controlled", reason: normalizedRequired(reason, "reason"),
        changedFields: { legalHoldId: hold.id, releasedBy: context.userId },
      }));
      return released;
    });
  }

  public requestRetentionDisposition(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    recordClass: string,
    targetId: string,
    reason: string,
  ): Promise<RetentionDispositionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "records.disposition.manage", resource: baseScope(project.businessScopeOrganizationId, project.id, targetId),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "step-up",
      }, now);
      const normalizedClass = normalizedRequired(recordClass, "recordClass");
      const policy = transaction.currentRetentionPolicy(project.id, normalizedClass);
      if (!policy) throw new ValidationError("No active retention policy governs this record class.", ["retention_policy_missing"]);
      const createdAt = this.recordCreatedAt(transaction, project.id, normalizedClass, targetId);
      if (!createdAt) throw new NotFoundError();
      if (transaction.activeLegalHoldsForTarget(project.id, normalizedClass, targetId).length > 0) {
        throw new ValidationError("An active legal hold blocks disposition.", ["legal_hold_active"]);
      }
      const eligibleAt = createdAt.getTime() + policy.retentionDurationDays * 86_400_000;
      if (now.getTime() < eligibleAt) {
        throw new ValidationError("The approved retention period has not elapsed.", ["retention_period_active"]);
      }
      const disposition: RetentionDispositionRecord = {
        id: this.idFactory(), projectId: project.id, policyId: policy.id, recordClass: normalizedClass,
        targetId: normalizedRequired(targetId, "targetId"), action: policy.dispositionAction, state: "proposed",
        reason: normalizedRequired(reason, "reason"), requestedAt: now, requestedBy: context.userId,
        approvedAt: null, approvedBy: null, executedAt: null, executedBy: null, version: 1,
      };
      transaction.insertRetentionDisposition(disposition);
      transaction.appendAudit(auditEvent(this.idFactory, now, context, {
        projectId: project.id, action: "record.disposition_requested", objectType: normalizedClass, objectId: targetId,
        priorState: null, newState: disposition.state, reason: disposition.reason,
        changedFields: { dispositionId: disposition.id, action: disposition.action, policyId: policy.id },
      }));
      return disposition;
    });
  }

  public approveRetentionDisposition(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    dispositionId: string,
    expectedVersion: number,
  ): Promise<RetentionDispositionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const disposition = transaction.retentionDispositionById(dispositionId);
      const project = disposition ? transaction.projectById(disposition.projectId) : null;
      if (!disposition || !project || disposition.state !== "proposed") throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "records.disposition.approve", resource: baseScope(project.businessScopeOrganizationId, project.id, disposition.targetId),
        requiredQualifications: ["records_retention_authority"], forbiddenActorIds: [disposition.requestedBy], minimumAssurance: "step-up",
      }, now);
      if (disposition.version !== expectedVersion) throw new ConflictError();
      if (transaction.activeLegalHoldsForTarget(project.id, disposition.recordClass, disposition.targetId).length > 0) {
        throw new ValidationError("An active legal hold blocks disposition approval.", ["legal_hold_active"]);
      }
      const approved: RetentionDispositionRecord = {
        ...disposition, state: "approved", approvedAt: now, approvedBy: context.userId, version: disposition.version + 1,
      };
      transaction.updateRetentionDisposition(approved, expectedVersion);
      transaction.appendAudit(auditEvent(this.idFactory, now, context, {
        projectId: project.id, action: "record.disposition_approved", objectType: disposition.recordClass, objectId: disposition.targetId,
        priorState: disposition.state, newState: approved.state, reason: disposition.reason,
        changedFields: { dispositionId: disposition.id, approvedBy: context.userId },
      }));
      return approved;
    });
  }

  public executeRetentionDisposition(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    dispositionId: string,
    expectedVersion: number,
  ): Promise<RetentionDispositionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const disposition = transaction.retentionDispositionById(dispositionId);
      const project = disposition ? transaction.projectById(disposition.projectId) : null;
      if (!disposition || !project || disposition.state !== "approved") throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "records.disposition.execute", resource: baseScope(project.businessScopeOrganizationId, project.id, disposition.targetId),
        requiredQualifications: ["records_disposition_operator"],
        forbiddenActorIds: [disposition.requestedBy, disposition.approvedBy ?? ""], minimumAssurance: "step-up",
      }, now);
      if (disposition.version !== expectedVersion) throw new ConflictError();
      if (transaction.activeLegalHoldsForTarget(project.id, disposition.recordClass, disposition.targetId).length > 0) {
        throw new ValidationError("An active legal hold blocks disposition execution.", ["legal_hold_active"]);
      }
      const executed: RetentionDispositionRecord = {
        ...disposition, state: "executed", executedAt: now, executedBy: context.userId, version: disposition.version + 1,
      };
      transaction.updateRetentionDisposition(executed, expectedVersion);
      transaction.appendAudit(auditEvent(this.idFactory, now, context, {
        projectId: project.id, action: "record.dispositioned", objectType: disposition.recordClass, objectId: disposition.targetId,
        priorState: disposition.state, newState: executed.state, reason: disposition.reason,
        changedFields: { dispositionId: disposition.id, action: disposition.action, executedBy: context.userId,
          physicalDeletionPerformed: false },
      }));
      return executed;
    });
  }

  public auditHistory(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
  ): Promise<readonly AuditEvent[]> {
    const now = this.clock();
    return this.store.transaction((transaction: FoundationTransaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(
        context,
        assignments,
        {
          action: "audit.read",
          resource: baseScope(project.businessScopeOrganizationId, project.id, null),
          requiredQualifications: [],
          forbiddenActorIds: [],
          minimumAssurance: "mfa",
        },
        now,
      );
      const history = transaction.auditForProject(project.id);
      let redactionCount = 0;
      const redacted = history.map((event) => {
        const result = redactAuditValue(event.changedFields, "changedFields");
        if (result.redacted) redactionCount += 1;
        return { ...event, changedFields: result.value as Readonly<Record<string, unknown>> };
      });
      transaction.appendAudit(auditEvent(this.idFactory, now, context, {
        projectId: project.id, action: "audit.viewed", objectType: "project", objectId: project.id,
        priorState: null, newState: null, reason: null, changedFields: { returnedEventCount: redacted.length },
      }));
      if (redactionCount > 0) {
        transaction.appendAudit(auditEvent(this.idFactory, now, context, {
          projectId: project.id, action: "audit.redaction_applied", objectType: "project", objectId: project.id,
          priorState: null, newState: null, reason: null, changedFields: { redactedEventCount: redactionCount },
        }));
      }
      return redacted;
    });
  }

  private recordCreatedAt(
    transaction: FoundationTransaction,
    projectId: string,
    recordClass: string,
    targetId: string,
  ): Date | null {
    if (recordClass === "project") {
      const project = transaction.projectById(targetId);
      return project?.id === projectId ? project.createdAt : null;
    }
    if (recordClass === "document_revision") {
      const revision = transaction.revisionById(targetId);
      const document = revision ? transaction.documentById(revision.documentId) : null;
      return revision && document?.projectId === projectId ? revision.createdAt : null;
    }
    if (recordClass === "material") {
      const material = transaction.materialById(targetId);
      return material?.projectId === projectId ? material.createdAt : null;
    }
    if (recordClass === "ncr") {
      const ncr = transaction.ncrById(targetId);
      return ncr?.projectId === projectId ? ncr.createdAt : null;
    }
    if (recordClass === "punch") {
      const punch = transaction.punchById(targetId);
      return punch?.projectId === projectId ? punch.createdAt : null;
    }
    if (recordClass === "subcontractor_submission") {
      const submission = transaction.subcontractorSubmissionById(targetId);
      return submission?.projectId === projectId ? submission.submittedAt : null;
    }
    if (recordClass === "turnover_package_version") {
      const version = transaction.turnoverVersionById(targetId);
      return version?.projectId === projectId ? version.generatedAt : null;
    }
    return null;
  }
}
