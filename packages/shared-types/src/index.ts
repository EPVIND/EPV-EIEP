export type EnvironmentName = "development" | "test" | "training" | "production";
export type AuthenticationMode = "development" | "test" | "oidc";
export type DataStoreMode = "memory" | "postgres";
export type AssuranceLevel = "standard" | "mfa" | "step-up";

export interface EnvironmentConfig {
  readonly environment: EnvironmentName;
  readonly authentication: AuthenticationMode;
  readonly dataStore: DataStoreMode;
  readonly trainingBanner: boolean;
  readonly allowSyntheticData: boolean;
  readonly allowProductionData: boolean;
}

export interface ResourceScope {
  readonly organizationId: string | null;
  readonly projectId: string | null;
  readonly workPackageId: string | null;
  readonly objectId: string | null;
}

export interface AccessContext {
  readonly userId: string;
  readonly actingOrganizationId: string;
  readonly assurance: AssuranceLevel;
  readonly qualifications: readonly string[];
  readonly sessionId: string;
  readonly correlationId: string;
  readonly authenticatedAt: Date;
}

export interface RoleAssignment {
  readonly id: string;
  readonly userId: string;
  readonly actingOrganizationId: string;
  readonly permissions: readonly string[];
  readonly scope: ResourceScope;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  readonly revokedAt: Date | null;
}

export interface IdentityAccountRecord {
  readonly id: string;
  readonly personId: string;
  readonly displayName: string;
  readonly state: "invited" | "active" | "disabled" | "closed";
  readonly qualificationCodes: readonly string[];
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export interface ExternalIdentityRecord {
  readonly id: string;
  readonly userAccountId: string;
  readonly issuer: string;
  readonly subject: string;
  readonly identityType: "internal" | "guest" | "service" | "break_glass";
  readonly lastVerifiedAt: Date | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
}

export interface AuthorizationRequest {
  readonly action: string;
  readonly resource: ResourceScope;
  readonly requiredQualifications: readonly string[];
  readonly forbiddenActorIds: readonly string[];
  readonly minimumAssurance: AssuranceLevel;
}

export interface AuthorizationDecision {
  readonly allowed: boolean;
  readonly reasonCode:
    | "allowed"
    | "no_active_assignment"
    | "scope_denied"
    | "qualification_required"
    | "separation_of_duty"
    | "assurance_required";
}

export type ProjectState = "draft" | "readiness_review" | "active" | "suspended" | "closing" | "closed";

export interface ProjectReadiness {
  readonly scopeStatement: string;
  readonly governingRequirementReferences: readonly string[];
  readonly plannedStartDate: string;
  readonly plannedFinishDate: string;
  readonly responsibleRoleCodes: readonly string[];
  readonly customerConfigured: boolean;
  readonly facilityConfigured: boolean;
  readonly projectAuthorityAssigned: boolean;
  readonly qualityAuthorityAssigned: boolean;
  readonly documentControlAuthorityAssigned: boolean;
  readonly completionBoundaryCount: number;
  readonly responsibilityAssignmentCount: number;
  readonly approvedRequirementReferenceCount: number;
  readonly turnoverBaselineConfigured: boolean;
  readonly blockingExceptionCount: number;
}

export interface ProjectRecord {
  readonly id: string;
  readonly businessScopeOrganizationId: string;
  readonly number: string;
  readonly name: string;
  readonly customerOrganizationId: string;
  readonly facilityId: string;
  readonly timeZone: string;
  readonly state: ProjectState;
  readonly readiness: ProjectReadiness;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export type FileValidationState = "staged" | "validated" | "quarantined" | "released" | "rejected";
export type DocumentRevisionState = "draft" | "staged" | "under_review" | "approved" | "released" | "superseded" | "rejected" | "void";

export interface DocumentRecord {
  readonly id: string;
  readonly projectId: string;
  readonly number: string;
  readonly title: string;
  readonly type: string;
  readonly discipline: string;
  readonly currentRevisionId: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export interface DocumentRevisionRecord {
  readonly id: string;
  readonly documentId: string;
  readonly revision: string;
  readonly state: DocumentRevisionState;
  readonly purpose: string;
  readonly source: string;
  readonly fileId: string;
  readonly fileValidationState: FileValidationState;
  readonly approvalCount: number;
  readonly requiredApprovalCount: number;
  readonly supersedesRevisionId: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export interface AuditEvent {
  readonly id: string;
  readonly occurredAt: Date;
  readonly actorUserId: string;
  readonly actingOrganizationId: string;
  readonly projectId: string | null;
  readonly action: string;
  readonly objectType: string;
  readonly objectId: string;
  readonly priorState: string | null;
  readonly newState: string | null;
  readonly reason: string | null;
  readonly correlationId: string;
  readonly changedFields: Readonly<Record<string, unknown>>;
  readonly canonicalSha256: string;
}

export type MaterialState =
  | "received_pending"
  | "quarantined"
  | "released"
  | "issued"
  | "returned"
  | "consumed"
  | "rejected";

export interface MaterialReleaseRequirements {
  readonly projectConfigurationRevisionId: string;
  readonly mtrRequired: boolean;
  readonly mtrAccepted: boolean;
  readonly mtrReviewId: string | null;
  readonly receivingInspectionRequired: boolean;
  readonly receivingInspectionAccepted: boolean;
  readonly pmiRequired: boolean;
  readonly pmiAccepted: boolean;
  readonly governingPmiRule: string | null;
  readonly pmiOverrideId: string | null;
  readonly openDispositionCount: number;
}

export interface MtrReviewRecord {
  readonly id: string;
  readonly projectId: string;
  readonly materialItemId: string;
  readonly documentRevisionId: string;
  readonly decision: "accepted" | "rejected";
  readonly heatLotVerified: boolean;
  readonly gradeVerified: boolean;
  readonly specificationVerified: boolean;
  readonly reviewNotes: string;
  readonly evidenceFileIds: readonly string[];
  readonly reviewedAt: Date;
  readonly reviewedBy: string;
  readonly version: number;
}

export type MaterialMovementType =
  | "received"
  | "split_out"
  | "split_in"
  | "released"
  | "issued"
  | "returned"
  | "relocated"
  | "status_changed"
  | "quarantined";

export interface MaterialMovementRecord {
  readonly id: string;
  readonly projectId: string;
  readonly materialItemId: string;
  readonly movementType: MaterialMovementType;
  readonly fromState: MaterialState | null;
  readonly toState: MaterialState;
  readonly fromLocation: string | null;
  readonly toLocation: string;
  readonly quantity: string;
  readonly unitCode: string;
  readonly workPackageId: string | null;
  readonly reason: string;
  readonly occurredAt: Date;
  readonly actorUserId: string;
}

export type MvpFormCode =
  | "FORM-PRJ-001"
  | "FORM-DOC-001"
  | "FORM-MAT-001"
  | "FORM-MTR-001"
  | "FORM-PMI-001"
  | "FORM-INS-001"
  | "FORM-NCR-001"
  | "FORM-PCH-001"
  | "FORM-SUB-001"
  | "FORM-SUB-002"
  | "FORM-TOV-001";

export interface ControlledReportSourceReference {
  readonly sourceType: string;
  readonly sourceId: string;
  readonly sourceVersion: number;
  readonly sourceState: string;
  readonly canonicalSha256: string;
}

export interface ControlledReportRecord {
  readonly id: string;
  readonly projectId: string;
  readonly formCode: MvpFormCode;
  readonly targetId: string;
  readonly title: string;
  readonly recordStatus: string;
  readonly revisionNumber: number;
  readonly sourceSystem: "EIEP";
  readonly sourceRecords: readonly ControlledReportSourceReference[];
  readonly structuredContent: Readonly<Record<string, unknown>>;
  readonly structuredSha256: string;
  readonly printableHtml: string;
  readonly printableSha256: string;
  readonly filenameStem: string;
  readonly trainingWatermark: boolean;
  readonly printWarning: string;
  readonly generatedAt: Date;
  readonly generatedBy: string;
  readonly version: number;
}

export interface PmiOverrideRecord {
  readonly id: string;
  readonly projectId: string;
  readonly materialItemId: string;
  readonly projectConfigurationRevisionId: string;
  readonly governingDocumentRevisionId: string;
  readonly required: boolean;
  readonly justification: string;
  readonly state: "proposed" | "active";
  readonly proposedBy: string;
  readonly approvedBy: string | null;
  readonly approvedAt: Date | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface MaterialItemRecord {
  readonly id: string;
  readonly projectId: string;
  readonly identifier: string;
  readonly receiptNumber: string;
  readonly purchaseReference: string;
  readonly vendorOrganizationId: string;
  readonly specification: string;
  readonly grade: string;
  readonly form: string;
  readonly dimensions: string;
  readonly quantity: string;
  readonly unitCode: string;
  readonly heatLot: string;
  readonly mtrDocumentRevisionId: string | null;
  readonly receiptEvidenceFileIds: readonly string[];
  readonly storageLocation: string;
  readonly parentItemId: string | null;
  readonly state: MaterialState;
  readonly requirements: MaterialReleaseRequirements;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export interface MaterialGenealogyRecord {
  readonly id: string;
  readonly projectId: string;
  readonly parentItemId: string;
  readonly childItemId: string;
  readonly relationship: "cut_piece" | "remnant";
  readonly quantityTransferred: string;
  readonly createdAt: Date;
  readonly createdBy: string;
}

export interface InspectionEquipmentRecord {
  readonly id: string;
  readonly projectId: string;
  readonly identifier: string;
  readonly serialNumber: string;
  readonly methodCapabilities: readonly string[];
  readonly verificationState: "passed" | "failed";
  readonly validFrom: Date;
  readonly validTo: Date;
  readonly evidenceFileId: string;
  readonly state: "active" | "inactive";
  readonly version: number;
}

export type InspectionPlanState = "under_review" | "approved" | "superseded" | "rejected";

export interface InspectionPlanRevisionRecord {
  readonly id: string;
  readonly projectId: string;
  readonly templateCode: string;
  readonly revision: string;
  readonly title: string;
  readonly requiredFields: readonly string[];
  readonly applicableTargetTypes: readonly string[];
  readonly requiredPerformerQualifications: readonly string[];
  readonly requiredAcceptorQualifications: readonly string[];
  readonly acceptanceReference: string;
  readonly minimumAcceptanceAssurance: AssuranceLevel;
  readonly state: InspectionPlanState;
  readonly supersedesRevisionId: string | null;
  readonly approvedBy: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export type InspectionRecordState = "submitted" | "accepted" | "rejected" | "void";

export interface InspectionRecord {
  readonly id: string;
  readonly projectId: string;
  readonly planRevisionId: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly inspectorUserId: string;
  readonly performedAt: Date;
  readonly fieldValues: Readonly<Record<string, string>>;
  readonly evidenceFileIds: readonly string[];
  readonly result: "pass" | "fail";
  readonly state: InspectionRecordState;
  readonly acceptedBy: string | null;
  readonly acceptanceMeaning: string | null;
  readonly acceptedAssurance: AssuranceLevel | null;
  readonly rejectionReason: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type PmiState = "submitted" | "accepted" | "failed" | "void";

export interface PmiRecord {
  readonly id: string;
  readonly projectId: string;
  readonly materialItemId: string;
  readonly governingRule: string;
  readonly requiredMaterial: string;
  readonly observedMaterial: string;
  readonly method: string;
  readonly componentLocation: string;
  readonly equipmentId: string;
  readonly inspectorUserId: string;
  readonly inspectedAt: Date;
  readonly readings: Readonly<Record<string, string>>;
  readonly evidenceFileIds: readonly string[];
  readonly notes: string;
  readonly result: "pass" | "fail";
  readonly state: PmiState;
  readonly ncrId: string | null;
  readonly acceptedBy: string | null;
  readonly version: number;
}

export type NcrState =
  | "open"
  | "disposition_proposed"
  | "disposition_approved"
  | "reinspection_complete"
  | "closed";

export interface NonconformanceRecord {
  readonly id: string;
  readonly projectId: string;
  readonly number: string;
  readonly affectedObjectType: "material" | "inspection" | "work";
  readonly affectedObjectId: string;
  readonly requirementReference: string;
  readonly description: string;
  readonly containment: string;
  readonly evidenceFileIds: readonly string[];
  readonly responsibleUserId: string;
  readonly state: NcrState;
  readonly disposition: string | null;
  readonly correctiveAction: string | null;
  readonly dispositionProposedBy: string | null;
  readonly dispositionApprovedBy: string | null;
  readonly reinspectionEvidenceFileId: string | null;
  readonly turnoverRequired: boolean;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export type PunchState = "open" | "ready_for_verification" | "verified" | "closed" | "transferred";

export interface PunchItemRecord {
  readonly id: string;
  readonly projectId: string;
  readonly number: string;
  readonly type: string;
  readonly priority: "low" | "medium" | "high" | "critical";
  readonly systemId: string | null;
  readonly areaId: string | null;
  readonly workPackageId: string | null;
  readonly assetId: string | null;
  readonly description: string;
  readonly ownerUserId: string;
  readonly targetAt: Date | null;
  readonly evidenceFileIds: readonly string[];
  readonly state: PunchState;
  readonly verifiedBy: string | null;
  readonly verificationEvidenceFileId: string | null;
  readonly closureMeaning: string | null;
  readonly turnoverRequired: boolean;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export interface TurnoverManifestEntry {
  readonly sourceType: "material" | "pmi" | "ncr" | "punch" | "document_revision";
  readonly sourceId: string;
  readonly sourceVersion: number;
  readonly sourceState: string;
  readonly inclusionReason: string;
  readonly filename: string;
  readonly sizeBytes: number;
  readonly canonicalJson: string;
  readonly canonicalSha256: string;
}

export interface TurnoverPackageVersionRecord {
  readonly id: string;
  readonly packageId: string;
  readonly projectId: string;
  readonly versionNumber: number;
  readonly recipientScope: string;
  readonly generatedAt: Date;
  readonly generatedBy: string;
  readonly manifest: readonly TurnoverManifestEntry[];
  readonly manifestSha256: string;
}

export interface CompletionBoundaryRecord {
  readonly id: string;
  readonly projectId: string;
  readonly boundaryType: "system" | "area" | "asset" | "test_package" | "work_package" | "contract";
  readonly code: string;
  readonly name: string;
  readonly state: "active" | "retired";
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
}

export type TurnoverRecordClass = "material" | "pmi" | "ncr" | "punch" | "document_revision";
export type TurnoverRequirementStatus = "missing" | "submitted" | "under_review" | "rejected" | "accepted" | "superseded" | "not_applicable";

export interface TurnoverRequirementRecord {
  readonly id: string;
  readonly projectId: string;
  readonly completionBoundaryId: string;
  readonly code: string;
  readonly recordClass: TurnoverRecordClass;
  readonly required: boolean;
  readonly notApplicableAllowed: boolean;
  readonly acceptanceAuthority: string;
  readonly state: "active" | "retired";
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
}

export interface TurnoverPackageRecord {
  readonly id: string;
  readonly projectId: string;
  readonly completionBoundaryId: string;
  readonly code: string;
  readonly recipientScope: string;
  readonly materialItemIds: readonly string[];
  readonly state: "draft" | "ready" | "generated" | "accepted" | "superseded";
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export interface TurnoverRequirementStatusRecord {
  readonly requirementId: string;
  readonly requirementCode: string;
  readonly recordClass: TurnoverRecordClass;
  readonly status: TurnoverRequirementStatus;
  readonly reason: string;
}

export type SubcontractorQualificationCategory =
  | "license"
  | "insurance"
  | "bonding"
  | "safety"
  | "quality"
  | "personnel"
  | "equipment"
  | "client";

export interface SubcontractorProfileRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly legalTaxReference: string;
  readonly declaredScopes: readonly string[];
  readonly approvedScopes: readonly string[];
  readonly geography: readonly string[];
  readonly laborModel: string;
  readonly lowerTierDisclosureRequired: boolean;
  readonly qualificationState: "candidate" | "qualified" | "suspended" | "inactive";
  readonly qualificationValidTo: Date | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export interface SubcontractorQualificationRecord {
  readonly id: string;
  readonly profileId: string;
  readonly organizationId: string;
  readonly category: SubcontractorQualificationCategory;
  readonly code: string;
  readonly approvedScopes: readonly string[];
  readonly issuer: string;
  readonly effectiveAt: Date;
  readonly expiresAt: Date;
  readonly evidenceFileId: string;
  readonly exceptionReason: string | null;
  readonly state: "verified" | "revoked";
  readonly verifiedAt: Date;
  readonly verifiedBy: string;
  readonly version: number;
}

export interface SubcontractorProjectAssignmentRecord {
  readonly id: string;
  readonly projectId: string;
  readonly profileId: string;
  readonly organizationId: string;
  readonly approvedScopeCode: string;
  readonly workPackageIds: readonly string[];
  readonly authorizationReference: string;
  readonly mobilizationState: "pending" | "released" | "suspended";
  readonly mobilizedAt: Date | null;
  readonly mobilizedBy: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export type MobilizationRequirementCategory =
  | "commercial"
  | "safety"
  | "quality"
  | "insurance"
  | "license"
  | "lower_tier"
  | "submission";

export interface MobilizationRequirementRecord {
  readonly id: string;
  readonly projectId: string;
  readonly assignmentId: string;
  readonly code: string;
  readonly category: MobilizationRequirementCategory;
  readonly title: string;
  readonly required: boolean;
  readonly qualificationId: string | null;
  readonly evidenceFileId: string | null;
  readonly state: "missing" | "submitted" | "accepted" | "rejected";
  readonly submittedBy: string | null;
  readonly reviewedBy: string | null;
  readonly reviewReason: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export interface MobilizationStatusRecord {
  readonly requirementId: string;
  readonly requirementCode: string;
  readonly category: MobilizationRequirementCategory;
  readonly status: "missing" | "submitted" | "accepted" | "rejected" | "expired" | "not_applicable";
  readonly reason: string;
}

export type SubcontractorSubmissionCategory = "inspection" | "progress" | "deficiency" | "turnover";

export interface SubcontractorSubmissionRecord {
  readonly id: string;
  readonly projectId: string;
  readonly assignmentId: string;
  readonly organizationId: string;
  readonly workPackageId: string;
  readonly category: SubcontractorSubmissionCategory;
  readonly title: string;
  readonly claimedProgressPercent: number | null;
  readonly evidenceFileIds: readonly string[];
  readonly state: "submitted" | "accepted" | "rejected";
  readonly submittedAt: Date;
  readonly submittedBy: string;
  readonly reviewedAt: Date | null;
  readonly reviewedBy: string | null;
  readonly acceptanceMeaning: string | null;
  readonly rejectionReason: string | null;
  readonly version: number;
}

export interface ManagedAccessAssignmentRecord extends RoleAssignment {
  readonly grantedBy: string;
  readonly grantReason: string;
  readonly reviewedAt: Date | null;
  readonly reviewedBy: string | null;
  readonly version: number;
  readonly createdAt: Date;
}

export interface DelegationRecord {
  readonly id: string;
  readonly delegatorUserId: string;
  readonly delegateUserId: string;
  readonly actingOrganizationId: string;
  readonly permissions: readonly string[];
  readonly scope: ResourceScope;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date;
  readonly justification: string;
  readonly state: "proposed" | "active" | "revoked" | "expired";
  readonly approvedAt: Date | null;
  readonly approvedBy: string | null;
  readonly reviewedAt: Date | null;
  readonly reviewedBy: string | null;
  readonly revokedAt: Date | null;
  readonly revokedBy: string | null;
  readonly version: number;
  readonly createdAt: Date;
}

export type EstimateState = "draft" | "under_review" | "approved" | "proposal_issued" | "awarded" | "closed";
export type EstimateRevisionState = "draft" | "under_review" | "approved" | "rejected" | "superseded";

export interface EstimateAssemblyRevisionRecord {
  readonly id: string;
  readonly businessScopeOrganizationId: string;
  readonly code: string;
  readonly revision: string;
  readonly description: string;
  readonly costCode: string;
  readonly unitCode: string;
  readonly baseLaborHoursPerUnit: string;
  readonly laborRatePerHour: string;
  readonly materialUnitCost: string;
  readonly equipmentUnitCost: string;
  readonly subcontractUnitCost: string;
  readonly state: "under_review" | "active" | "superseded" | "rejected";
  readonly supersedesRevisionId: string | null;
  readonly proposedAt: Date;
  readonly proposedBy: string;
  readonly reviewedAt: Date | null;
  readonly reviewedBy: string | null;
  readonly reviewReason: string | null;
  readonly version: number;
}

export interface EstimateProductivityFactorRevisionRecord {
  readonly id: string;
  readonly businessScopeOrganizationId: string;
  readonly code: string;
  readonly revision: string;
  readonly name: string;
  readonly multiplier: string;
  readonly sourceReference: string;
  readonly justification: string;
  readonly discipline: string;
  readonly conditionCode: string;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  readonly state: "under_review" | "active" | "superseded" | "rejected";
  readonly supersedesRevisionId: string | null;
  readonly proposedAt: Date;
  readonly proposedBy: string;
  readonly reviewedAt: Date | null;
  readonly reviewedBy: string | null;
  readonly reviewReason: string | null;
  readonly version: number;
}

export interface EstimateAuthorityPolicyRevisionRecord {
  readonly id: string;
  readonly businessScopeOrganizationId: string;
  readonly currency: string;
  readonly revision: string;
  readonly standardEstimateApprovalLimit: string;
  readonly standardQuoteSelectionLimit: string;
  readonly standardProposalApprovalLimit: string;
  readonly estimateAboveThresholdQualification: string;
  readonly quoteAboveThresholdQualification: string;
  readonly proposalAboveThresholdQualification: string;
  readonly state: "under_review" | "active" | "superseded" | "rejected";
  readonly supersedesRevisionId: string | null;
  readonly proposedAt: Date;
  readonly proposedBy: string;
  readonly reviewedAt: Date | null;
  readonly reviewedBy: string | null;
  readonly reviewReason: string | null;
  readonly version: number;
}

export interface EstimateRecord {
  readonly id: string;
  readonly businessScopeOrganizationId: string;
  readonly number: string;
  readonly name: string;
  readonly customerOrganizationId: string;
  readonly facilityId: string;
  readonly opportunityReference: string | null;
  readonly scopeStatement: string;
  readonly dueAt: Date;
  readonly originatingTimeZone: string;
  readonly currency: string;
  readonly basisReferences: readonly string[];
  readonly ownerUserId: string;
  readonly state: EstimateState;
  readonly currentRevisionId: string;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export interface EstimateProductivityFactorSnapshot {
  readonly factorRevisionId: string;
  readonly multiplier: string;
  readonly sourceReference: string;
  readonly justification: string;
  readonly approvedBy: string;
  readonly approvedAt: Date;
}

export interface EstimateLineCalculation {
  readonly version: "estimate-v1";
  readonly productivityMultiplier: string;
  readonly adjustedLaborHours: string;
  readonly laborCost: string;
  readonly materialCost: string;
  readonly equipmentCost: string;
  readonly subcontractCost: string;
  readonly allowanceCost: string;
  readonly otherCost: string;
  readonly totalCost: string;
}

export interface EstimateLineRecord {
  readonly id: string;
  readonly revisionId: string;
  readonly lineKey: string;
  readonly parentLineKey: string | null;
  readonly sortOrder: number;
  readonly costCode: string;
  readonly bidItemCode: string | null;
  readonly alternateCode: string | null;
  readonly wbsCode: string | null;
  readonly workPackageCode: string | null;
  readonly assemblyRevisionId: string | null;
  readonly description: string;
  readonly quantity: string;
  readonly unitCode: string;
  readonly baseLaborHoursPerUnit: string;
  readonly laborRatePerHour: string;
  readonly materialUnitCost: string;
  readonly equipmentUnitCost: string;
  readonly subcontractUnitCost: string;
  readonly allowanceCost: string;
  readonly otherCost: string;
  readonly productivityFactors: readonly EstimateProductivityFactorSnapshot[];
  readonly calculation: EstimateLineCalculation;
  readonly state: "active" | "removed";
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export interface EstimateRevisionTotals {
  readonly version: "estimate-v1";
  readonly currency: string;
  readonly directCost: string;
  readonly contingencyAmount: string;
  readonly escalationAmount: string;
  readonly markupAmount: string;
  readonly taxAmount: string;
  readonly finalPrice: string;
}

export interface EstimateRevisionRecord {
  readonly id: string;
  readonly estimateId: string;
  readonly revision: string;
  readonly parentRevisionId: string | null;
  readonly revisionReason: string;
  readonly state: EstimateRevisionState;
  readonly assumptions: readonly string[];
  readonly exclusions: readonly string[];
  readonly alternates: readonly string[];
  readonly contingencyPercent: string;
  readonly escalationPercent: string;
  readonly markupPercent: string;
  readonly taxPercent: string;
  readonly totals: EstimateRevisionTotals;
  readonly submittedAt: Date | null;
  readonly submittedBy: string | null;
  readonly reviewedAt: Date | null;
  readonly reviewedBy: string | null;
  readonly reviewReason: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export interface EstimateQuoteLine {
  readonly id: string;
  readonly bidScopeLineKey: string;
  readonly description: string;
  readonly quantity: string;
  readonly unitCode: string;
  readonly amount: string;
}

export interface EstimateQuoteRecord {
  readonly id: string;
  readonly estimateId: string;
  readonly revisionId: string;
  readonly vendorOrganizationId: string;
  readonly quoteNumber: string;
  readonly sourceFileId: string;
  readonly sourceSha256: string;
  readonly currency: string;
  readonly validUntil: Date;
  readonly inclusions: readonly string[];
  readonly exclusions: readonly string[];
  readonly qualifications: readonly string[];
  readonly freightAmount: string;
  readonly taxAmount: string;
  readonly lines: readonly EstimateQuoteLine[];
  readonly normalizedTotal: string;
  readonly unresolvedScopeLineKeys: readonly string[];
  readonly state: "received" | "normalized" | "selected" | "not_selected" | "rejected";
  readonly selectedAt: Date | null;
  readonly selectedBy: string | null;
  readonly selectionReason: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export interface EstimateProposalRecord {
  readonly id: string;
  readonly estimateId: string;
  readonly revisionId: string;
  readonly proposalNumber: string;
  readonly customerOrganizationId: string;
  readonly totalPrice: string;
  readonly currency: string;
  readonly validUntil: Date;
  readonly commercialTermsReferences: readonly string[];
  readonly sourceCanonicalSha256: string;
  readonly artifactManifestSha256: string;
  readonly artifactSha256: string;
  readonly artifactMediaType: "text/html";
  readonly artifactFilename: string;
  readonly artifactContent: string;
  readonly state: "draft" | "approved" | "issued" | "superseded";
  readonly approvedAt: Date | null;
  readonly approvedBy: string | null;
  readonly issuedAt: Date | null;
  readonly issuedBy: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export interface EstimateHandoffMapping {
  readonly estimateLineKey: string;
  readonly category: "direct_cost" | "contingency" | "escalation" | "markup" | "tax";
  readonly costCode: string;
  readonly wbsCode: string | null;
  readonly workPackageCode: string | null;
  readonly amount: string;
}

export interface EstimateHandoffRecord {
  readonly id: string;
  readonly estimateId: string;
  readonly proposalId: string;
  readonly projectId: string;
  readonly sourceRevisionId: string;
  readonly sourceCanonicalSha256: string;
  readonly mappings: readonly EstimateHandoffMapping[];
  readonly mappedTotal: string;
  readonly sourceTotal: string;
  readonly reconciliationDifference: string;
  readonly authorizationReference: string;
  readonly createdAt: Date;
  readonly createdBy: string;
}

export interface ProjectControlsAuthorityPolicyRevisionRecord {
  readonly id: string;
  readonly businessScopeOrganizationId: string;
  readonly currency: string;
  readonly revision: string;
  readonly standardChangeApprovalLimit: string;
  readonly standardProcurementAwardLimit: string;
  readonly changeAboveThresholdQualification: string;
  readonly procurementAboveThresholdQualification: string;
  readonly state: "under_review" | "active" | "superseded" | "rejected";
  readonly supersedesRevisionId: string | null;
  readonly proposedAt: Date;
  readonly proposedBy: string;
  readonly reviewedAt: Date | null;
  readonly reviewedBy: string | null;
  readonly reviewReason: string | null;
  readonly version: number;
}

export interface ProjectControlBaselineLine {
  readonly lineKey: string;
  readonly sourceEstimateLineKey: string;
  readonly sourceCategory: EstimateHandoffMapping["category"];
  readonly costCode: string;
  readonly wbsCode: string | null;
  readonly workPackageCode: string | null;
  readonly controlAccountCode: string;
  readonly responsibleOrganizationId: string;
  readonly budgetQuantity: string;
  readonly unitCode: string;
  readonly budgetAmount: string;
}

export interface ProjectControlBaselineRecord {
  readonly id: string;
  readonly businessScopeOrganizationId: string;
  readonly projectId: string;
  readonly sourceHandoffId: string;
  readonly sourceHandoffSha256: string;
  readonly number: string;
  readonly revision: string;
  readonly parentBaselineId: string | null;
  readonly revisionReason: string;
  readonly currency: string;
  readonly periodStart: Date;
  readonly periodFinish: Date;
  readonly lines: readonly ProjectControlBaselineLine[];
  readonly sourceAwardAmount: string;
  readonly approvedChangeAmount: string;
  readonly managementReserveAmount: string;
  readonly currentBudgetAmount: string;
  readonly state: "draft" | "under_review" | "approved" | "rejected" | "superseded";
  readonly submittedAt: Date | null;
  readonly submittedBy: string | null;
  readonly reviewedAt: Date | null;
  readonly reviewedBy: string | null;
  readonly reviewReason: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export interface ProjectChangeLineImpact {
  readonly baselineLineKey: string;
  readonly quantityDelta: string;
  readonly amountDelta: string;
  readonly reason: string;
}

export interface ProjectChangeRequestRecord {
  readonly id: string;
  readonly businessScopeOrganizationId: string;
  readonly projectId: string;
  readonly baselineId: string;
  readonly number: string;
  readonly title: string;
  readonly origin: string;
  readonly description: string;
  readonly scheduleDaysImpact: string;
  readonly quotationReference: string | null;
  readonly evidenceFileIds: readonly string[];
  readonly lineImpacts: readonly ProjectChangeLineImpact[];
  readonly totalCostImpact: string;
  readonly state: "draft" | "under_review" | "approved" | "rejected" | "incorporated";
  readonly submittedAt: Date | null;
  readonly submittedBy: string | null;
  readonly reviewedAt: Date | null;
  readonly reviewedBy: string | null;
  readonly reviewReason: string | null;
  readonly resultingBaselineId: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export type ProjectCostEntryType =
  | "actual"
  | "accrual"
  | "forecast_remaining"
  | "contingency_draw"
  | "reserve_movement";

export interface ProjectCostEntryRecord {
  readonly id: string;
  readonly businessScopeOrganizationId: string;
  readonly projectId: string;
  readonly baselineId: string;
  readonly baselineLineKey: string | null;
  readonly entryType: ProjectCostEntryType;
  readonly amount: string;
  readonly currency: string;
  readonly periodStart: Date;
  readonly periodFinish: Date;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly sourceSha256: string;
  readonly description: string;
  readonly state: "submitted" | "accepted" | "rejected";
  readonly submittedAt: Date;
  readonly submittedBy: string;
  readonly reviewedAt: Date | null;
  readonly reviewedBy: string | null;
  readonly reviewReason: string | null;
  readonly version: number;
}

export interface ProjectProgressClaimRecord {
  readonly id: string;
  readonly businessScopeOrganizationId: string;
  readonly projectId: string;
  readonly baselineId: string;
  readonly baselineLineKey: string;
  readonly periodStart: Date;
  readonly periodFinish: Date;
  readonly claimedQuantity: string;
  readonly unitCode: string;
  readonly claimedEarnedAmount: string;
  readonly evidenceFileIds: readonly string[];
  readonly fieldStatus: string;
  readonly qualityAcceptanceState: "not_evaluated";
  readonly invoiceApprovalState: "not_submitted";
  readonly state: "submitted" | "accepted" | "rejected";
  readonly submittedAt: Date;
  readonly submittedBy: string;
  readonly reviewedAt: Date | null;
  readonly reviewedBy: string | null;
  readonly reviewReason: string | null;
  readonly version: number;
}

export interface ProcurementRequisitionItem {
  readonly itemKey: string;
  readonly baselineLineKey: string;
  readonly itemType: "material" | "service" | "equipment" | "subcontract";
  readonly description: string;
  readonly specificationReference: string;
  readonly governingDocumentRevisionIds: readonly string[];
  readonly quantity: string;
  readonly unitCode: string;
  readonly needBy: Date;
  readonly deliveryTerms: string;
  readonly inspectionRequirements: readonly string[];
  readonly documentRequirements: readonly string[];
  readonly turnoverRequirements: readonly string[];
  readonly costCode: string;
  readonly workPackageCode: string | null;
  readonly budgetAmount: string;
}

export interface ProcurementRequisitionRecord {
  readonly id: string;
  readonly businessScopeOrganizationId: string;
  readonly projectId: string;
  readonly baselineId: string;
  readonly number: string;
  readonly title: string;
  readonly items: readonly ProcurementRequisitionItem[];
  readonly state: "draft" | "under_review" | "approved" | "rejected" | "issued";
  readonly submittedAt: Date | null;
  readonly submittedBy: string | null;
  readonly reviewedAt: Date | null;
  readonly reviewedBy: string | null;
  readonly reviewReason: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export interface ProcurementOffer {
  readonly offerKey: string;
  readonly vendorOrganizationId: string;
  readonly quoteReference: string;
  readonly sourceFileId: string;
  readonly sourceSha256: string;
  readonly currency: string;
  readonly validUntil: Date;
  readonly totalAmount: string;
  readonly promisedDate: Date;
  readonly inclusions: readonly string[];
  readonly exclusions: readonly string[];
  readonly clarifications: readonly string[];
  readonly unresolvedItemKeys: readonly string[];
  readonly receivedAt: Date;
  readonly receivedBy: string;
}

export interface ProcurementBidPackageRecord {
  readonly id: string;
  readonly businessScopeOrganizationId: string;
  readonly projectId: string;
  readonly requisitionId: string;
  readonly number: string;
  readonly bidderOrganizationIds: readonly string[];
  readonly offers: readonly ProcurementOffer[];
  readonly recommendedOfferKey: string | null;
  readonly recommendationReason: string | null;
  readonly recommendedAt: Date | null;
  readonly recommendedBy: string | null;
  readonly awardedOfferKey: string | null;
  readonly awardReason: string | null;
  readonly awardedAt: Date | null;
  readonly awardedBy: string | null;
  readonly state: "issued" | "comparison" | "recommended" | "awarded" | "cancelled";
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export interface ProcurementStatusEvent {
  readonly id: string;
  readonly eventType: "acknowledgement" | "submittal" | "fabrication_milestone" | "shipment" | "exception" | "receipt";
  readonly status: string;
  readonly promisedAt: Date | null;
  readonly forecastAt: Date | null;
  readonly actualAt: Date | null;
  readonly sourceReference: string;
  readonly evidenceFileIds: readonly string[];
  readonly receivedMaterialItemIds: readonly string[];
  readonly responsibleUserId: string;
  readonly recordedAt: Date;
  readonly recordedBy: string;
}

export interface ProcurementCommitmentRecord {
  readonly id: string;
  readonly businessScopeOrganizationId: string;
  readonly projectId: string;
  readonly baselineId: string;
  readonly requisitionId: string;
  readonly bidPackageId: string;
  readonly offerKey: string;
  readonly vendorOrganizationId: string;
  readonly purchaseOrderReference: string;
  readonly revision: string;
  readonly amount: string;
  readonly currency: string;
  readonly statusEvents: readonly ProcurementStatusEvent[];
  readonly state: "awarded" | "acknowledged" | "in_fabrication" | "shipped" | "partially_received" | "received" | "exception" | "closed";
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export interface ScheduleActivity {
  readonly activityKey: string;
  readonly displayId: string;
  readonly name: string;
  readonly activityType: "activity" | "milestone";
  readonly calendarCode: string;
  readonly wbsCode: string;
  readonly workPackageCode: string | null;
  readonly responsibleOrganizationId: string;
  readonly completionBoundaryId: string | null;
  readonly plannedStart: Date;
  readonly plannedFinish: Date;
  readonly actualStart: Date | null;
  readonly actualFinish: Date | null;
  readonly remainingDurationDays: string;
  readonly quantity: string | null;
  readonly unitCode: string | null;
  readonly resourceCodes: readonly string[];
  readonly constraintCodes: readonly string[];
  readonly requiredDocumentRevisionIds: readonly string[];
  readonly requiredMaterialItemIds: readonly string[];
  readonly requiredInspectionIds: readonly string[];
  readonly fieldClaimPercent: string;
  readonly acceptedProgressPercent: string;
  readonly sourceExternalId: string | null;
}

export interface ScheduleDependency {
  readonly predecessorActivityKey: string;
  readonly successorActivityKey: string;
  readonly relationship: "FS" | "SS" | "FF" | "SF";
  readonly lagDays: string;
}

export interface ScheduleProgramRecord {
  readonly id: string;
  readonly businessScopeOrganizationId: string;
  readonly projectId: string;
  readonly number: string;
  readonly name: string;
  readonly timeZone: string;
  readonly currentRevisionId: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export interface ScheduleRevisionRecord {
  readonly id: string;
  readonly scheduleId: string;
  readonly revision: string;
  readonly revisionType: "baseline" | "update";
  readonly parentRevisionId: string | null;
  readonly sourceBaselineId: string;
  readonly dataDate: Date;
  readonly reason: string;
  readonly sourceSystem: "manual" | "p6" | "microsoft_project";
  readonly sourceVersion: string | null;
  readonly sourceSha256: string | null;
  readonly activities: readonly ScheduleActivity[];
  readonly dependencies: readonly ScheduleDependency[];
  readonly baselineVarianceDays: string;
  readonly state: "draft" | "under_review" | "approved" | "rejected" | "superseded";
  readonly submittedAt: Date | null;
  readonly submittedBy: string | null;
  readonly reviewedAt: Date | null;
  readonly reviewedBy: string | null;
  readonly reviewReason: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
}

export interface ScheduleImportRecord {
  readonly id: string;
  readonly businessScopeOrganizationId: string;
  readonly projectId: string;
  readonly scheduleId: string;
  readonly idempotencyKey: string;
  readonly sourceSystem: "p6" | "microsoft_project";
  readonly sourceVersion: string;
  readonly sourceFileId: string;
  readonly sourceSha256: string;
  readonly mappingVersion: string;
  readonly targetRevision: string;
  readonly targetRevisionType: "baseline" | "update";
  readonly parentRevisionId: string | null;
  readonly dataDate: Date;
  readonly activities: readonly ScheduleActivity[];
  readonly dependencies: readonly ScheduleDependency[];
  readonly previewErrors: readonly string[];
  readonly state: "previewed" | "invalid" | "committed";
  readonly committedRevisionId: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly committedAt: Date | null;
  readonly committedBy: string | null;
}

export type WeldingProcedureType = "pqr" | "wps";
export interface WeldingProcedureRevisionRecord {
  readonly id: string;
  readonly businessScopeOrganizationId: string;
  readonly projectId: string;
  readonly procedureType: WeldingProcedureType;
  readonly number: string;
  readonly revision: string;
  readonly governingDocumentRevisionId: string;
  readonly supportingPqrIds: readonly string[];
  readonly processCodes: readonly string[];
  readonly materialGroupCodes: readonly string[];
  readonly positionCodes: readonly string[];
  readonly thicknessMinimum: string;
  readonly thicknessMaximum: string;
  readonly diameterMinimum: string;
  readonly diameterMaximum: string;
  readonly jointDesignCodes: readonly string[];
  readonly consumableClassifications: readonly string[];
  readonly preheatMinimum: string;
  readonly interpassMaximum: string;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  readonly state: "under_review" | "approved" | "rejected" | "superseded";
  readonly supersedesRevisionId: string | null;
  readonly submittedAt: Date;
  readonly submittedBy: string;
  readonly reviewedAt: Date | null;
  readonly reviewedBy: string | null;
  readonly reviewReason: string | null;
  readonly version: number;
}

export interface WelderQualificationRecord {
  readonly id: string;
  readonly businessScopeOrganizationId: string;
  readonly projectId: string;
  readonly welderUserId: string;
  readonly employerOrganizationId: string;
  readonly qualificationNumber: string;
  readonly governingDocumentRevisionId: string;
  readonly processCodes: readonly string[];
  readonly materialGroupCodes: readonly string[];
  readonly positionCodes: readonly string[];
  readonly thicknessMinimum: string;
  readonly thicknessMaximum: string;
  readonly diameterMinimum: string;
  readonly diameterMaximum: string;
  readonly qualifiedAt: Date;
  readonly validTo: Date;
  readonly continuityIntervalDays: number;
  readonly lastContinuityAt: Date;
  readonly evidenceFileIds: readonly string[];
  readonly state: "under_review" | "active" | "rejected" | "expired" | "revoked";
  readonly submittedAt: Date;
  readonly submittedBy: string;
  readonly reviewedAt: Date | null;
  readonly reviewedBy: string | null;
  readonly reviewReason: string | null;
  readonly version: number;
}

export type WeldExecutionEventType =
  | "fit_up"
  | "consumable_issue"
  | "preheat_observation"
  | "weld_pass"
  | "visual_examination"
  | "repair_excavation"
  | "repair_weld";
export interface WeldExecutionEvent {
  readonly id: string;
  readonly eventType: WeldExecutionEventType;
  readonly repairCycle: number;
  readonly performedAt: Date;
  readonly performedBy: string;
  readonly welderQualificationIds: readonly string[];
  readonly consumableClassification: string | null;
  readonly observations: Readonly<Record<string, string>>;
  readonly evidenceFileIds: readonly string[];
  readonly result: "pass" | "fail" | "observed";
}

export interface WeldJointRecord {
  readonly id: string;
  readonly businessScopeOrganizationId: string;
  readonly projectId: string;
  readonly number: string;
  readonly systemCode: string;
  readonly areaCode: string;
  readonly workPackageCode: string;
  readonly componentReferences: readonly string[];
  readonly materialItemIds: readonly string[];
  readonly drawingRevisionId: string;
  readonly weldMapLocation: string;
  readonly wpsRevisionId: string;
  readonly processCode: string;
  readonly materialGroupCode: string;
  readonly positionCode: string;
  readonly thickness: string;
  readonly diameter: string;
  readonly jointDesignCode: string;
  readonly requiredExaminationMethods: readonly string[];
  readonly pwhtRequired: boolean;
  readonly completionBoundaryId: string;
  readonly repairCycle: number;
  readonly events: readonly WeldExecutionEvent[];
  readonly state: "planned" | "fit_up_accepted" | "welded" | "visual_accepted" | "pending_examination" | "repair_required" | "ready_for_release" | "released";
  readonly releasedAt: Date | null;
  readonly releasedBy: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export interface NdeRequestRecord {
  readonly id: string;
  readonly businessScopeOrganizationId: string;
  readonly projectId: string;
  readonly number: string;
  readonly weldId: string;
  readonly repairCycle: number;
  readonly methodCode: string;
  readonly extent: string;
  readonly techniqueDocumentRevisionId: string;
  readonly acceptanceReference: string;
  readonly examinationStage: string;
  readonly requiredPersonnelQualification: string;
  readonly dueAt: Date;
  readonly holdWitnessContext: string;
  readonly reportRevisionIds: readonly string[];
  readonly state: "requested" | "submitted" | "accepted" | "rejected" | "superseded";
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export interface NdeReportRevisionRecord {
  readonly id: string;
  readonly requestId: string;
  readonly revision: string;
  readonly examinerUserId: string;
  readonly examinerOrganizationId: string;
  readonly personnelQualificationReference: string;
  readonly equipmentIds: readonly string[];
  readonly mediaFileIds: readonly string[];
  readonly performedAt: Date;
  readonly conditions: Readonly<Record<string, string>>;
  readonly indications: readonly string[];
  readonly result: "accept" | "reject";
  readonly evidenceFileIds: readonly string[];
  readonly repairCycle: number;
  readonly state: "submitted" | "accepted" | "rejected" | "superseded";
  readonly submittedAt: Date;
  readonly submittedBy: string;
  readonly reviewedAt: Date | null;
  readonly reviewedBy: string | null;
  readonly reviewReason: string | null;
  readonly version: number;
}

export interface PwhtThermocoupleReading {
  readonly thermocoupleId: string;
  readonly location: string;
  readonly minimumTemperature: string;
  readonly maximumTemperature: string;
  readonly withinTolerance: boolean;
}
export interface PwhtCycleRecord {
  readonly id: string;
  readonly businessScopeOrganizationId: string;
  readonly projectId: string;
  readonly number: string;
  readonly procedureDocumentRevisionId: string;
  readonly weldIds: readonly string[];
  readonly heatingRate: string;
  readonly coolingRate: string;
  readonly soakTemperatureMinimum: string;
  readonly soakTemperatureMaximum: string;
  readonly soakDurationMinutes: string;
  readonly thermocouples: readonly PwhtThermocoupleReading[];
  readonly equipmentIds: readonly string[];
  readonly chartFileId: string;
  readonly evidenceFileIds: readonly string[];
  readonly interruptions: readonly string[];
  readonly result: "pass" | "fail";
  readonly state: "submitted" | "accepted" | "rejected";
  readonly performedAt: Date;
  readonly performedBy: string;
  readonly reviewedAt: Date | null;
  readonly reviewedBy: string | null;
  readonly reviewReason: string | null;
  readonly version: number;
}

export interface TestPackageRecord {
  readonly id: string;
  readonly businessScopeOrganizationId: string;
  readonly projectId: string;
  readonly number: string;
  readonly testType: "pressure" | "leak" | "functional";
  readonly completionBoundaryId: string;
  readonly governingDocumentRevisionIds: readonly string[];
  readonly drawingRevisionIds: readonly string[];
  readonly testMedium: string;
  readonly targetPressure: string | null;
  readonly holdDurationMinutes: string;
  readonly hazardPermitReferences: readonly string[];
  readonly prerequisiteReferences: readonly string[];
  readonly blindValveInstrumentReferences: readonly string[];
  readonly gaugeEquipmentIds: readonly string[];
  readonly participantUserIds: readonly string[];
  readonly witnessUserIds: readonly string[];
  readonly evidenceFileIds: readonly string[];
  readonly result: "pass" | "fail" | null;
  readonly deficiencyNcrIds: readonly string[];
  readonly restorationConfirmation: string | null;
  readonly state: "draft" | "ready" | "submitted" | "accepted" | "rejected";
  readonly performedAt: Date | null;
  readonly performedBy: string | null;
  readonly reviewedAt: Date | null;
  readonly reviewedBy: string | null;
  readonly reviewReason: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export type FabricationAssemblyType = "pipe_spool" | "structural_assembly" | "equipment_skid" | "module";
export type FabricationAssemblyState =
  | "draft"
  | "under_review"
  | "approved"
  | "rejected"
  | "superseded"
  | "released_to_fabrication"
  | "in_fabrication"
  | "fabrication_complete"
  | "accepted";

export interface FabricationBomLine {
  readonly lineKey: string;
  readonly materialItemId: string;
  readonly description: string;
  readonly quantity: string;
  readonly unitCode: string;
  readonly pieceMark: string;
}

export interface FabricationCutLine {
  readonly lineKey: string;
  readonly bomLineKey: string;
  readonly materialItemId: string;
  readonly cutLength: string;
  readonly lengthUnitCode: string;
  readonly cutAngleDegrees: string;
  readonly bevelCode: string | null;
  readonly quantity: string;
}

export interface FabricationAssemblyRevisionRecord {
  readonly id: string;
  readonly businessScopeOrganizationId: string;
  readonly projectId: string;
  readonly number: string;
  readonly revision: string;
  readonly assemblyType: FabricationAssemblyType;
  readonly parentRevisionId: string | null;
  readonly revisionReason: string;
  readonly sourceSystem: "manual" | "model_import";
  readonly sourceVersion: string | null;
  readonly sourceSha256: string | null;
  readonly systemCode: string;
  readonly areaCode: string;
  readonly workPackageCode: string;
  readonly completionBoundaryId: string;
  readonly drawingRevisionIds: readonly string[];
  readonly materialItemIds: readonly string[];
  readonly weldIds: readonly string[];
  readonly requiredInspectionIds: readonly string[];
  readonly bomLines: readonly FabricationBomLine[];
  readonly cutLines: readonly FabricationCutLine[];
  readonly state: FabricationAssemblyState;
  readonly submittedAt: Date | null;
  readonly submittedBy: string | null;
  readonly reviewedAt: Date | null;
  readonly reviewedBy: string | null;
  readonly reviewReason: string | null;
  readonly releasedAt: Date | null;
  readonly releasedBy: string | null;
  readonly acceptedAt: Date | null;
  readonly acceptedBy: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export type FabricationOperationType =
  | "layout"
  | "cut"
  | "bevel"
  | "fit_up"
  | "weld"
  | "machine"
  | "surface_prep"
  | "inspection"
  | "assembly"
  | "package";

export interface FabricationTravelerOperation {
  readonly operationKey: string;
  readonly sequence: number;
  readonly operationType: FabricationOperationType;
  readonly workCenterCode: string;
  readonly requiredQualificationCodes: readonly string[];
  readonly procedureDocumentRevisionId: string | null;
  readonly holdPoint: boolean;
  readonly materialItemIds: readonly string[];
  readonly weldIds: readonly string[];
  readonly plannedHours: string;
  readonly instructions: string;
}

export interface FabricationTravelerRecord {
  readonly id: string;
  readonly businessScopeOrganizationId: string;
  readonly projectId: string;
  readonly assemblyRevisionId: string;
  readonly number: string;
  readonly revision: string;
  readonly operations: readonly FabricationTravelerOperation[];
  readonly state: "draft" | "issued" | "in_progress" | "on_hold" | "complete" | "superseded";
  readonly issuedAt: Date | null;
  readonly issuedBy: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export type FabricationExecutionEventType = "start" | "complete" | "hold" | "release_hold" | "rework" | "scrap";

export interface FabricationExecutionEventRecord {
  readonly id: string;
  readonly sequence: number;
  readonly businessScopeOrganizationId: string;
  readonly projectId: string;
  readonly assemblyRevisionId: string;
  readonly travelerId: string;
  readonly operationKey: string;
  readonly eventType: FabricationExecutionEventType;
  readonly result: "pass" | "fail" | "observed";
  readonly quantity: string;
  readonly unitCode: string;
  readonly observations: Readonly<Record<string, string>>;
  readonly evidenceFileIds: readonly string[];
  readonly performedAt: Date;
  readonly performedBy: string;
  readonly version: 1;
}

export type CollaborationEvidenceStatus = "open" | "resolved_claim" | "closed_claim" | "unknown";
export interface CollaborationDocumentMapping {
  readonly providerDocumentId: string;
  readonly documentRevisionId: string;
}
export interface CollaborationAuthorMapping {
  readonly providerAuthorId: string;
  readonly userAccountId: string;
  readonly organizationId: string;
}
export interface CollaborationStatusMapping {
  readonly providerStatusCode: string;
  readonly evidenceStatus: CollaborationEvidenceStatus;
}
export interface CollaborationRegion {
  readonly x: string;
  readonly y: string;
  readonly width: string;
  readonly height: string;
  readonly units: "points" | "normalized";
}
export interface CollaborationSourceItem {
  readonly providerItemId: string;
  readonly providerDocumentId: string;
  readonly parentProviderItemId: string | null;
  readonly itemType: "markup" | "comment" | "reply" | "status";
  readonly pageNumber: number;
  readonly region: CollaborationRegion | null;
  readonly authorProviderId: string;
  readonly providerStatusCode: string;
  readonly subject: string;
  readonly body: string;
  readonly appearance: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly unsupportedContentCodes: readonly string[];
}
export interface CollaborationPreviewIssue {
  readonly code: string;
  readonly sourceObjectId: string | null;
  readonly field: string | null;
  readonly detail: string;
}
export interface DocumentCollaborationImportRecord {
  readonly id: string;
  readonly businessScopeOrganizationId: string;
  readonly projectId: string;
  readonly provider: "bluebeam_export";
  readonly providerProduct: string;
  readonly providerProjectId: string;
  readonly providerSessionId: string;
  readonly sourceFileId: string;
  readonly sourceVersion: string;
  readonly sourceSha256: string;
  readonly canonicalSha256: string;
  readonly schemaVersion: number;
  readonly mappingVersion: string;
  readonly idempotencyKey: string;
  readonly documentMappings: readonly CollaborationDocumentMapping[];
  readonly authorMappings: readonly CollaborationAuthorMapping[];
  readonly statusMappings: readonly CollaborationStatusMapping[];
  readonly sourceItems: readonly CollaborationSourceItem[];
  readonly previewIssues: readonly CollaborationPreviewIssue[];
  readonly committedItemIds: readonly string[];
  readonly state: "previewed" | "invalid" | "conflict" | "committed";
  readonly previewedAt: Date;
  readonly previewedBy: string;
  readonly committedAt: Date | null;
  readonly committedBy: string | null;
  readonly version: number;
}
export interface CollaborationItemRecord {
  readonly id: string;
  readonly businessScopeOrganizationId: string;
  readonly projectId: string;
  readonly importId: string;
  readonly provider: "bluebeam_export";
  readonly providerProjectId: string;
  readonly providerSessionId: string;
  readonly providerItemId: string;
  readonly providerDocumentId: string;
  readonly sourceVersion: string;
  readonly sourceSha256: string;
  readonly documentRevisionId: string;
  readonly parentItemId: string | null;
  readonly itemType: "markup" | "comment" | "reply" | "status";
  readonly pageNumber: number;
  readonly region: CollaborationRegion | null;
  readonly authorUserId: string;
  readonly authorOrganizationId: string;
  readonly providerStatusCode: string;
  readonly evidenceStatus: CollaborationEvidenceStatus;
  readonly subject: string;
  readonly body: string;
  readonly appearance: string | null;
  readonly sourceCreatedAt: Date;
  readonly sourceUpdatedAt: Date;
  readonly state: "submitted" | "accepted" | "rejected" | "superseded";
  readonly reviewedAt: Date | null;
  readonly reviewedBy: string | null;
  readonly reviewReason: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
}
export interface CollaborationReconciliationRecord {
  readonly id: string;
  readonly businessScopeOrganizationId: string;
  readonly projectId: string;
  readonly importId: string;
  readonly code: string;
  readonly sourceObjectId: string | null;
  readonly field: string | null;
  readonly detail: string;
  readonly state: "open" | "resolved" | "waived";
  readonly resolution: string | null;
  readonly resolvedAt: Date | null;
  readonly resolvedBy: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
}

export type ProjectStructureType = "system" | "area" | "wbs" | "work_package";

export interface ProjectStructureElementRecord {
  readonly id: string;
  readonly projectId: string;
  readonly type: ProjectStructureType;
  readonly parentId: string | null;
  readonly code: string;
  readonly name: string;
  readonly state: "active" | "retired";
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
}

export interface ProjectOrganizationRecord {
  readonly id: string;
  readonly projectId: string;
  readonly organizationId: string;
  readonly participationRole: "business_scope" | "customer" | "supplier" | "subcontractor" | "inspector" | "other";
  readonly state: "active" | "inactive";
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
}

export interface ResponsibilityAssignmentRecord {
  readonly id: string;
  readonly projectId: string;
  readonly targetType: "project" | ProjectStructureType;
  readonly targetId: string;
  readonly responsibilityType: string;
  readonly organizationId: string;
  readonly personId: string | null;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  readonly state: "active" | "revoked" | "expired";
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
}

export interface ProjectConfigurationRevisionRecord {
  readonly id: string;
  readonly projectId: string;
  readonly configurationCode: string;
  readonly revision: string;
  readonly settings: Readonly<Record<string, string | number | boolean>>;
  readonly governingDocumentRevisionIds: readonly string[];
  readonly effectiveFrom: Date;
  readonly state: "under_review" | "active" | "superseded" | "rejected";
  readonly supersedesRevisionId: string | null;
  readonly approvedAt: Date | null;
  readonly approvedBy: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export interface DocumentDistributionRecord {
  readonly id: string;
  readonly projectId: string;
  readonly documentRevisionId: string;
  readonly recipientOrganizationId: string;
  readonly recipientUserId: string | null;
  readonly workPackageId: string | null;
  readonly purpose: string;
  readonly acknowledgementRequired: boolean;
  readonly distributedAt: Date;
  readonly distributedBy: string;
  readonly downloadedAt: Date | null;
  readonly downloadedBy: string | null;
  readonly acknowledgedAt: Date | null;
  readonly acknowledgedBy: string | null;
  readonly acknowledgementMeaning: string | null;
  readonly version: number;
}

export interface GoverningDocumentLinkRecord {
  readonly id: string;
  readonly projectId: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly documentRevisionId: string;
  readonly governingPurpose: string;
  readonly state: "active" | "superseded" | "void";
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
}

export interface RetentionPolicyRecord {
  readonly id: string;
  readonly projectId: string;
  readonly recordClass: string;
  readonly contractReference: string;
  readonly retentionDurationDays: number;
  readonly dispositionAction: "archive" | "destroy" | "anonymize";
  readonly state: "under_review" | "active" | "retired";
  readonly approvedAt: Date | null;
  readonly approvedBy: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
}

export interface LegalHoldRecord {
  readonly id: string;
  readonly projectId: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly reason: string;
  readonly state: "active" | "released";
  readonly placedAt: Date;
  readonly placedBy: string;
  readonly releasedAt: Date | null;
  readonly releasedBy: string | null;
  readonly version: number;
}

export interface RetentionDispositionRecord {
  readonly id: string;
  readonly projectId: string;
  readonly policyId: string;
  readonly recordClass: string;
  readonly targetId: string;
  readonly action: "archive" | "destroy" | "anonymize";
  readonly state: "proposed" | "approved" | "executed" | "rejected";
  readonly reason: string;
  readonly requestedAt: Date;
  readonly requestedBy: string;
  readonly approvedAt: Date | null;
  readonly approvedBy: string | null;
  readonly executedAt: Date | null;
  readonly executedBy: string | null;
  readonly version: number;
}

export interface GovernedFileRecord {
  readonly id: string;
  readonly businessScopeOrganizationId: string;
  readonly projectId: string | null;
  readonly storageKey: string;
  readonly originalFilename: string;
  readonly declaredMediaType: string;
  readonly detectedMediaType: string | null;
  readonly sha256: string;
  readonly detectedSha256: string | null;
  readonly sizeBytes: number;
  readonly validationState: FileValidationState;
  readonly malwareState: "pending" | "clean" | "malicious" | "error";
  readonly validatorVersion: string | null;
  readonly retentionClass: string;
  readonly activeContentDetected: boolean | null;
  readonly encryptedArchiveDetected: boolean | null;
  readonly version: number;
  readonly uploadedAt: Date;
  readonly uploadedBy: string;
  readonly validatedAt: Date | null;
  readonly validatedBy: string | null;
  readonly releasedAt: Date | null;
  readonly releasedBy: string | null;
}

export interface ImportRowRecord {
  readonly rowNumber: number;
  readonly externalId: string;
  readonly payload: Readonly<Record<string, string>>;
  readonly errors: readonly string[];
}

export interface ImportJobRecord {
  readonly id: string;
  readonly projectId: string;
  readonly schemaName: string;
  readonly schemaVersion: number;
  readonly sourceSystem: string;
  readonly state: "staged" | "validated" | "invalid" | "committed" | "failed";
  readonly rows: readonly ImportRowRecord[];
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly validatedAt: Date | null;
  readonly committedAt: Date | null;
  readonly version: number;
}

export interface ExternalIdentifierRecord {
  readonly id: string;
  readonly projectId: string;
  readonly sourceSystem: string;
  readonly externalId: string;
  readonly recordType: string;
  readonly recordId: string;
  readonly createdAt: Date;
}

export interface ImportedRecord {
  readonly id: string;
  readonly projectId: string;
  readonly recordType: string;
  readonly payload: Readonly<Record<string, string>>;
  readonly importJobId: string;
  readonly externalId: string;
  readonly createdAt: Date;
  readonly createdBy: string;
}

export interface ExportJobRecord {
  readonly id: string;
  readonly projectId: string;
  readonly recordClass: string;
  readonly recordIds: readonly string[];
  readonly format: "csv" | "jsonl";
  readonly recipientOrganizationId: string;
  readonly state: "queued" | "processing" | "completed" | "failed" | "expired";
  readonly requestedAt: Date;
  readonly requestedBy: string;
  readonly correlationId: string;
  readonly formatSchemaVersion: number;
  readonly resultSha256: string | null;
  readonly resultManifest: readonly string[];
  readonly resultMediaType: string | null;
  readonly resultStorageKey: string | null;
  readonly resultSizeBytes: number | null;
  readonly resultContent: string | null;
  readonly completedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly failureReason: string | null;
  readonly version: number;
}

export interface IntegrationMessageRecord {
  readonly id: string;
  readonly direction: "inbox" | "outbox";
  readonly businessScopeOrganizationId: string;
  readonly projectId: string | null;
  readonly interfaceCode: string;
  readonly idempotencyKey: string;
  readonly externalId: string;
  readonly schemaVersion: number;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly payloadSha256: string;
  readonly correlationId: string;
  readonly state: "received" | "pending" | "processed" | "retry" | "dead_letter" | "reconciled";
  readonly attemptCount: number;
  readonly lastError: string | null;
  readonly createdAt: Date;
  readonly processedAt: Date | null;
  readonly version: number;
}

export interface ScopedSearchResult {
  readonly recordType: "document" | "material" | "ncr" | "punch" | "imported" | "collaboration";
  readonly recordId: string;
  readonly projectId: string;
  readonly label: string;
  readonly state: string;
  readonly version: number;
}

export interface WorkflowConnectivityPolicyRecord {
  readonly operation: string;
  readonly classification: "online_required" | "read_only_cache" | "queued_draft";
  readonly authoritativeClaimAllowedOffline: boolean;
  readonly rationale: string;
}

export interface OfflineDraftRecord {
  readonly id: string;
  readonly projectId: string;
  readonly operation: string;
  readonly payloadSha256: string;
  readonly idempotencyKey: string;
  readonly originalAt: Date;
  readonly originalBy: string;
  readonly actingOrganizationId: string;
  readonly deviceId: string;
  readonly synchronizedAt: Date | null;
  readonly state: "queued" | "synchronized" | "conflict" | "rejected";
  readonly conflictReason: string | null;
  readonly version: number;
}

export interface NotificationSubscriptionRecord {
  readonly id: string;
  readonly projectId: string;
  readonly userId: string;
  readonly actingOrganizationId: string;
  readonly eventTypes: readonly string[];
  readonly channel: "in_app" | "email";
  readonly state: "active" | "revoked";
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly revokedAt: Date | null;
  readonly version: number;
}

export interface NotificationRecord {
  readonly id: string;
  readonly projectId: string;
  readonly recipientUserId: string;
  readonly recipientOrganizationId: string;
  readonly eventType: string;
  readonly recordClass: "document" | "material" | "ncr" | "punch" | "imported" | "collaboration";
  readonly recordId: string;
  readonly channel: "in_app" | "email";
  readonly templateCode: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly state: "queued" | "delivered" | "retry" | "failed" | "suppressed";
  readonly attemptCount: number;
  readonly lastError: string | null;
  readonly createdAt: Date;
  readonly deliveredAt: Date | null;
  readonly version: number;
}
