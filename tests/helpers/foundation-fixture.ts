import type { AccessContext, FileValidationState, ProjectReadiness, ResourceScope, RoleAssignment } from "@eiep/shared-types";
import type { FoundationService, FoundationStore } from "@eiep/api";

export const completeReadiness: ProjectReadiness = {
  scopeStatement: "Controlled industrial project execution and turnover.",
  governingRequirementReferences: ["PROJECT-SPEC-001"],
  plannedStartDate: "2026-07-01",
  plannedFinishDate: "2027-06-30",
  responsibleRoleCodes: ["project_authority", "quality_authority", "document_control_authority"],
  customerConfigured: true,
  facilityConfigured: true,
  projectAuthorityAssigned: true,
  qualityAuthorityAssigned: true,
  documentControlAuthorityAssigned: true,
  completionBoundaryCount: 1,
  responsibilityAssignmentCount: 1,
  approvedRequirementReferenceCount: 1,
  turnoverBaselineConfigured: true,
  blockingExceptionCount: 0,
};

export const readinessDeclaration = {
  scopeStatement: completeReadiness.scopeStatement,
  governingRequirementReferences: completeReadiness.governingRequirementReferences,
  plannedStartDate: completeReadiness.plannedStartDate,
  plannedFinishDate: completeReadiness.plannedFinishDate,
  responsibleRoleCodes: completeReadiness.responsibleRoleCodes,
} as const;

export function seedAuthoritativeProjectReadiness(
  store: FoundationStore,
  projectId: string,
  now = new Date("2026-07-20T18:00:00.000Z"),
): Promise<void> {
  return store.transaction((transaction) => {
    const project = transaction.projectById(projectId);
    if (!project) throw new Error(`Project ${projectId} is missing.`);
    const prefix = `${projectId}-readiness`;
    transaction.insertProjectOrganization({
      id: `${prefix}-business`, projectId, organizationId: project.businessScopeOrganizationId,
      participationRole: "business_scope", state: "active", version: 1, createdAt: now, createdBy: "readiness-fixture",
    });
    transaction.insertProjectOrganization({
      id: `${prefix}-customer`, projectId, organizationId: project.customerOrganizationId,
      participationRole: "customer", state: "active", version: 1, createdAt: now, createdBy: "readiness-fixture",
    });
    for (const responsibilityType of ["project_authority", "quality_authority", "document_control_authority"] as const) {
      transaction.insertResponsibilityAssignment({
        id: `${prefix}-${responsibilityType}`, projectId, targetType: "project", targetId: projectId,
        responsibilityType, organizationId: project.businessScopeOrganizationId, personId: `${responsibilityType}-user`,
        effectiveFrom: new Date(now.getTime() - 60_000), effectiveTo: null, state: "active", version: 1,
        createdAt: now, createdBy: "readiness-fixture",
      });
    }
    transaction.insertDocument({
      id: `${prefix}-document`, projectId, number: "READINESS-SPEC", title: "Approved readiness requirement",
      type: "specification", discipline: "project-controls", currentRevisionId: `${prefix}-revision`, version: 1,
      createdAt: now, createdBy: "readiness-fixture", updatedAt: now, updatedBy: "readiness-fixture",
    });
    transaction.insertRevision({
      id: `${prefix}-revision`, documentId: `${prefix}-document`, revision: "0", state: "released",
      purpose: "project readiness", source: "controlled fixture", fileId: `${prefix}-file`, fileValidationState: "released",
      approvalCount: 1, requiredApprovalCount: 1, supersedesRevisionId: null, version: 1,
      createdAt: now, createdBy: "readiness-fixture", updatedAt: now, updatedBy: "readiness-fixture",
    });
    transaction.insertProjectConfiguration({
      id: `${prefix}-configuration`, projectId, configurationCode: "PROJECT-READINESS", revision: "1",
      settings: { baselineApproved: true }, governingDocumentRevisionIds: [`${prefix}-revision`], effectiveFrom: now,
      state: "active", supersedesRevisionId: null, approvedAt: now, approvedBy: "readiness-authority", version: 2,
      createdAt: now, createdBy: "readiness-fixture", updatedAt: now, updatedBy: "readiness-authority",
    });
    transaction.insertCompletionBoundary({
      id: `${prefix}-boundary`, projectId, boundaryType: "system", code: "READINESS-BOUNDARY", name: "Readiness boundary",
      state: "active", version: 1, createdAt: now, createdBy: "readiness-fixture",
    });
    transaction.insertTurnoverRequirement({
      id: `${prefix}-turnover-requirement`, projectId, completionBoundaryId: `${prefix}-boundary`, code: "BASELINE",
      recordClass: "document_revision", required: true, notApplicableAllowed: false,
      acceptanceAuthority: "turnover_authority", state: "active", version: 1, createdAt: now, createdBy: "readiness-fixture",
    });
  });
}

export function context(
  userId: string,
  assurance: AccessContext["assurance"] = "step-up",
  qualifications: readonly string[] = [],
  actingOrganizationId = "org-epv",
): AccessContext {
  return {
    userId,
    actingOrganizationId,
    assurance,
    qualifications,
    sessionId: `session-${userId}`,
    correlationId: `correlation-${userId}`,
    authenticatedAt: new Date("2026-07-20T18:00:00.000Z"),
  };
}

export function scope(
  projectId: string | null = null,
  objectId: string | null = null,
  organizationId: string | null = "org-epv",
  workPackageId: string | null = null,
): ResourceScope {
  return { organizationId, projectId, workPackageId, objectId };
}

export function assignment(
  id: string,
  userId: string,
  permissions: readonly string[],
  assignmentScope: ResourceScope,
  overrides: Partial<Pick<RoleAssignment, "effectiveFrom" | "effectiveTo" | "revokedAt">> = {},
  actingOrganizationId = "org-epv",
): RoleAssignment {
  return {
    id,
    userId,
    actingOrganizationId,
    permissions,
    scope: assignmentScope,
    effectiveFrom: overrides.effectiveFrom ?? new Date("2026-01-01T00:00:00.000Z"),
    effectiveTo: overrides.effectiveTo ?? null,
    revokedAt: overrides.revokedAt ?? null,
  };
}

export function sequentialIds(prefix = "id") {
  let sequence = 0;
  return () => `${prefix}-${++sequence}`;
}

export function seedGovernedFile(
  store: FoundationStore,
  projectId: string,
  id: string,
  validationState: FileValidationState = "released",
): Promise<void> {
  const now = new Date("2026-07-20T18:00:00.000Z");
  const validated = validationState === "validated" || validationState === "released";
  return store.transaction((transaction) => {
    transaction.insertGovernedFile({
      id, businessScopeOrganizationId: "org-epv", projectId, storageKey: `${projectId}/${id}`,
      originalFilename: `${id}.pdf`, declaredMediaType: "application/pdf",
      detectedMediaType: validated ? "application/pdf" : null, sha256: "a".repeat(64),
      detectedSha256: validated ? "a".repeat(64) : null, sizeBytes: 128, validationState,
      malwareState: validated ? "clean" : "pending", validatorVersion: validated ? "fixture-validator-1" : null,
      retentionClass: "project-record", activeContentDetected: validated ? false : null,
      encryptedArchiveDetected: validated ? false : null, version: validationState === "released" ? 3 : validated ? 2 : 1,
      uploadedAt: now, uploadedBy: "fixture-uploader", validatedAt: validated ? now : null,
      validatedBy: validated ? "fixture-validator" : null, releasedAt: validationState === "released" ? now : null,
      releasedBy: validationState === "released" ? "fixture-releaser" : null,
    });
  });
}

export async function approveMaterialConfiguration(
  service: FoundationService,
  store: FoundationStore,
  projectId: string,
  revision: string,
  settings: {
    readonly mtrRequired: boolean;
    readonly receivingInspectionRequired: boolean;
    readonly pmiRequired: boolean;
    readonly governingPmiRule?: string;
  },
  governingDocumentRevisionIds: readonly string[] = [],
) {
  let governingRevisions = [...governingDocumentRevisionIds];
  if (governingRevisions.length === 0) {
    const fileId = `material-config-file-${revision}`;
    await seedGovernedFile(store, projectId, fileId);
    const document = await service.registerDocument(
      context(`material-config-document-controller-${revision}`, "mfa"),
      [assignment(`material-config-document-create-${revision}`, `material-config-document-controller-${revision}`,
        ["document.create"], scope(projectId))],
      projectId,
      { number: `MATERIAL-CONFIG-${revision}`, title: `Material configuration ${revision}`, type: "procedure", discipline: "quality" },
    );
    const submittedDocument = await service.submitDocumentRevision(
      context(`material-config-document-author-${revision}`, "mfa"),
      [assignment(`material-config-document-submit-${revision}`, `material-config-document-author-${revision}`,
        ["document.revision.submit"], scope(projectId))],
      document.id,
      { revision: "0", purpose: "Govern material assurance configuration", source: "controlled project configuration",
        fileId, requiredApprovalCount: 1 },
    );
    const approvedDocument = await service.approveDocumentRevision(
      context(`material-config-document-approver-${revision}`),
      [assignment(`material-config-document-approve-${revision}`, `material-config-document-approver-${revision}`,
        ["document.approve"], scope(projectId, document.id))],
      submittedDocument.id, submittedDocument.version, true,
    );
    const releasedDocument = await service.releaseDocumentRevision(
      context(`material-config-document-releaser-${revision}`),
      [assignment(`material-config-document-release-${revision}`, `material-config-document-releaser-${revision}`,
        ["document.release"], scope(projectId, document.id))],
      approvedDocument.id, approvedDocument.version, document.version,
    );
    governingRevisions = [releasedDocument.id];
  }
  const proposed = await service.submitProjectConfiguration(
    context(`material-config-proposer-${revision}`, "mfa"),
    [assignment(`material-config-manage-${revision}`, `material-config-proposer-${revision}`,
      ["project.configuration.manage"], scope(projectId))],
    projectId,
    {
      configurationCode: "MATERIAL-ASSURANCE", revision, settings,
      governingDocumentRevisionIds: governingRevisions, effectiveFrom: new Date("2026-07-20T00:00:00.000Z"),
    },
  );
  return service.approveProjectConfiguration(
    context(`material-config-approver-${revision}`, "step-up", ["project_configuration_authority"]),
    [assignment(`material-config-approve-${revision}`, `material-config-approver-${revision}`,
      ["project.configuration.approve"], scope(projectId))],
    proposed.id,
    proposed.version,
  );
}
