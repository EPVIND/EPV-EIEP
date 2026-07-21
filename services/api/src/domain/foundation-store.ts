import type {
  AuditEvent,
  DocumentRecord,
  DocumentDistributionRecord,
  DocumentRevisionRecord,
  GoverningDocumentLinkRecord,
  GovernedFileRecord,
  ImportJobRecord,
  ImportedRecord,
  ExternalIdentifierRecord,
  ExportJobRecord,
  IntegrationMessageRecord,
  IdentityAccountRecord,
  ExternalIdentityRecord,
  LegalHoldRecord,
  DelegationRecord,
  InspectionEquipmentRecord,
  InspectionPlanRevisionRecord,
  InspectionRecord,
  MaterialGenealogyRecord,
  MaterialItemRecord,
  MaterialMovementRecord,
  MtrReviewRecord,
  ManagedAccessAssignmentRecord,
  NonconformanceRecord,
  NotificationRecord,
  NotificationSubscriptionRecord,
  OfflineDraftRecord,
  PmiRecord,
  PmiOverrideRecord,
  PunchItemRecord,
  ProjectRecord,
  ProjectConfigurationRevisionRecord,
  ProjectOrganizationRecord,
  ProjectStructureElementRecord,
  ResponsibilityAssignmentRecord,
  RetentionDispositionRecord,
  RetentionPolicyRecord,
  RoleAssignment,
  MobilizationRequirementRecord,
  SubcontractorProfileRecord,
  SubcontractorProjectAssignmentRecord,
  SubcontractorQualificationRecord,
  SubcontractorSubmissionRecord,
  TurnoverPackageVersionRecord,
  CompletionBoundaryRecord,
  ControlledReportRecord,
  TurnoverPackageRecord,
  TurnoverRequirementRecord,
} from "@eiep/shared-types";

export interface FoundationTransaction {
  applicationIdentityBootstrapState(): {
    readonly identityAccounts: readonly IdentityAccountRecord[];
    readonly externalIdentities: readonly ExternalIdentityRecord[];
    readonly seededAssignments: readonly RoleAssignment[];
    readonly managedAccessAssignments: readonly ManagedAccessAssignmentRecord[];
    readonly delegations: readonly DelegationRecord[];
    readonly audits: readonly AuditEvent[];
  };
  identityAccountById(id: string): IdentityAccountRecord | null;
  insertIdentityAccount(account: IdentityAccountRecord): void;
  updateIdentityAccount(account: IdentityAccountRecord, expectedVersion: number): void;
  externalIdentityById(id: string): ExternalIdentityRecord | null;
  externalIdentityBySubject(issuer: string, subject: string): ExternalIdentityRecord | null;
  insertExternalIdentity(identity: ExternalIdentityRecord): void;
  updateExternalIdentity(identity: ExternalIdentityRecord, expectedVersion: number): void;
  assignmentsFor(userId: string): readonly RoleAssignment[];
  accessAssignmentById(id: string): ManagedAccessAssignmentRecord | null;
  accessAssignmentsForUser(userId: string): readonly ManagedAccessAssignmentRecord[];
  insertAccessAssignment(assignment: ManagedAccessAssignmentRecord): void;
  updateAccessAssignment(assignment: ManagedAccessAssignmentRecord, expectedVersion: number): void;
  delegationById(id: string): DelegationRecord | null;
  delegationsForUser(userId: string): readonly DelegationRecord[];
  insertDelegation(delegation: DelegationRecord): void;
  updateDelegation(delegation: DelegationRecord, expectedVersion: number): void;
  projectById(id: string): ProjectRecord | null;
  projectByNumber(businessScopeOrganizationId: string, number: string): ProjectRecord | null;
  projects(): readonly ProjectRecord[];
  insertProject(project: ProjectRecord): void;
  updateProject(project: ProjectRecord, expectedVersion: number): void;
  projectStructureById(id: string): ProjectStructureElementRecord | null;
  projectStructureByCode(projectId: string, type: ProjectStructureElementRecord["type"], code: string): ProjectStructureElementRecord | null;
  projectStructureForProject(projectId: string): readonly ProjectStructureElementRecord[];
  insertProjectStructure(element: ProjectStructureElementRecord): void;
  projectOrganizationById(id: string): ProjectOrganizationRecord | null;
  projectOrganizationByOrganization(projectId: string, organizationId: string): ProjectOrganizationRecord | null;
  projectOrganizationsForProject(projectId: string): readonly ProjectOrganizationRecord[];
  insertProjectOrganization(organization: ProjectOrganizationRecord): void;
  responsibilityAssignmentById(id: string): ResponsibilityAssignmentRecord | null;
  responsibilityAssignmentsForProject(projectId: string): readonly ResponsibilityAssignmentRecord[];
  insertResponsibilityAssignment(assignment: ResponsibilityAssignmentRecord): void;
  projectConfigurationById(id: string): ProjectConfigurationRevisionRecord | null;
  projectConfigurationByRevision(projectId: string, code: string, revision: string): ProjectConfigurationRevisionRecord | null;
  currentProjectConfiguration(projectId: string, code: string): ProjectConfigurationRevisionRecord | null;
  projectConfigurationsForProject(projectId: string): readonly ProjectConfigurationRevisionRecord[];
  insertProjectConfiguration(configuration: ProjectConfigurationRevisionRecord): void;
  updateProjectConfiguration(configuration: ProjectConfigurationRevisionRecord, expectedVersion: number): void;
  documentById(id: string): DocumentRecord | null;
  documentByNumber(projectId: string, number: string): DocumentRecord | null;
  documentsForProject(projectId: string): readonly DocumentRecord[];
  insertDocument(document: DocumentRecord): void;
  updateDocument(document: DocumentRecord, expectedVersion: number): void;
  revisionById(id: string): DocumentRevisionRecord | null;
  revisionByName(documentId: string, revision: string): DocumentRevisionRecord | null;
  revisionsForDocument(documentId: string): readonly DocumentRevisionRecord[];
  insertRevision(revision: DocumentRevisionRecord): void;
  updateRevision(revision: DocumentRevisionRecord, expectedVersion: number): void;
  documentDistributionById(id: string): DocumentDistributionRecord | null;
  documentDistributionsForRevision(revisionId: string): readonly DocumentDistributionRecord[];
  insertDocumentDistribution(distribution: DocumentDistributionRecord): void;
  updateDocumentDistribution(distribution: DocumentDistributionRecord, expectedVersion: number): void;
  governingDocumentLinkById(id: string): GoverningDocumentLinkRecord | null;
  governingDocumentLinksForTarget(projectId: string, targetType: string, targetId: string): readonly GoverningDocumentLinkRecord[];
  insertGoverningDocumentLink(link: GoverningDocumentLinkRecord): void;
  retentionPolicyById(id: string): RetentionPolicyRecord | null;
  currentRetentionPolicy(projectId: string, recordClass: string): RetentionPolicyRecord | null;
  insertRetentionPolicy(policy: RetentionPolicyRecord): void;
  updateRetentionPolicy(policy: RetentionPolicyRecord, expectedVersion: number): void;
  legalHoldById(id: string): LegalHoldRecord | null;
  activeLegalHoldsForTarget(projectId: string, targetType: string, targetId: string): readonly LegalHoldRecord[];
  insertLegalHold(hold: LegalHoldRecord): void;
  updateLegalHold(hold: LegalHoldRecord, expectedVersion: number): void;
  retentionDispositionById(id: string): RetentionDispositionRecord | null;
  insertRetentionDisposition(disposition: RetentionDispositionRecord): void;
  updateRetentionDisposition(disposition: RetentionDispositionRecord, expectedVersion: number): void;
  governedFileById(id: string): GovernedFileRecord | null;
  governedFileByStorageKey(storageKey: string): GovernedFileRecord | null;
  insertGovernedFile(file: GovernedFileRecord): void;
  updateGovernedFile(file: GovernedFileRecord, expectedVersion: number): void;
  importJobById(id: string): ImportJobRecord | null;
  insertImportJob(job: ImportJobRecord): void;
  updateImportJob(job: ImportJobRecord, expectedVersion: number): void;
  externalIdentifier(sourceSystem: string, externalId: string): ExternalIdentifierRecord | null;
  insertExternalIdentifier(identifier: ExternalIdentifierRecord): void;
  insertImportedRecord(record: ImportedRecord): void;
  importedRecordsForProject(projectId: string): readonly ImportedRecord[];
  exportJobById(id: string): ExportJobRecord | null;
  insertExportJob(job: ExportJobRecord): void;
  updateExportJob(job: ExportJobRecord, expectedVersion: number): void;
  integrationMessageById(id: string): IntegrationMessageRecord | null;
  integrationMessageByKey(interfaceCode: string, idempotencyKey: string): IntegrationMessageRecord | null;
  integrationMessagesForWork(limit: number, interfaceCodes?: ReadonlySet<string>): readonly IntegrationMessageRecord[];
  insertIntegrationMessage(message: IntegrationMessageRecord): void;
  updateIntegrationMessage(message: IntegrationMessageRecord, expectedVersion: number): void;
  offlineDraftById(id: string): OfflineDraftRecord | null;
  offlineDraftByKey(projectId: string, idempotencyKey: string): OfflineDraftRecord | null;
  insertOfflineDraft(draft: OfflineDraftRecord): void;
  updateOfflineDraft(draft: OfflineDraftRecord, expectedVersion: number): void;
  notificationSubscriptionById(id: string): NotificationSubscriptionRecord | null;
  notificationSubscriptionForUser(projectId: string, userId: string, channel: string): NotificationSubscriptionRecord | null;
  notificationSubscriptionsForProject(projectId: string): readonly NotificationSubscriptionRecord[];
  insertNotificationSubscription(subscription: NotificationSubscriptionRecord): void;
  updateNotificationSubscription(subscription: NotificationSubscriptionRecord, expectedVersion: number): void;
  notificationById(id: string): NotificationRecord | null;
  notificationByKey(idempotencyKey: string): NotificationRecord | null;
  notificationsForRecipient(projectId: string, userId: string): readonly NotificationRecord[];
  insertNotification(notification: NotificationRecord): void;
  updateNotification(notification: NotificationRecord, expectedVersion: number): void;
  materialById(id: string): MaterialItemRecord | null;
  materialByIdentifier(projectId: string, identifier: string): MaterialItemRecord | null;
  materialsForProject(projectId: string): readonly MaterialItemRecord[];
  insertMaterial(material: MaterialItemRecord): void;
  updateMaterial(material: MaterialItemRecord, expectedVersion: number): void;
  mtrReviewById(id: string): MtrReviewRecord | null;
  mtrReviewsForMaterial(materialItemId: string): readonly MtrReviewRecord[];
  insertMtrReview(review: MtrReviewRecord): void;
  materialMovementsForItem(materialItemId: string): readonly MaterialMovementRecord[];
  insertMaterialMovement(movement: MaterialMovementRecord): void;
  controlledReportById(id: string): ControlledReportRecord | null;
  controlledReportsForProject(projectId: string): readonly ControlledReportRecord[];
  insertControlledReport(report: ControlledReportRecord): void;
  genealogyForItem(itemId: string): readonly MaterialGenealogyRecord[];
  insertGenealogy(genealogy: MaterialGenealogyRecord): void;
  equipmentById(id: string): InspectionEquipmentRecord | null;
  equipmentByIdentifier(projectId: string, identifier: string): InspectionEquipmentRecord | null;
  equipmentForProject(projectId: string): readonly InspectionEquipmentRecord[];
  insertEquipment(equipment: InspectionEquipmentRecord): void;
  inspectionPlanById(id: string): InspectionPlanRevisionRecord | null;
  inspectionPlanByRevision(projectId: string, templateCode: string, revision: string): InspectionPlanRevisionRecord | null;
  currentInspectionPlan(projectId: string, templateCode: string): InspectionPlanRevisionRecord | null;
  insertInspectionPlan(plan: InspectionPlanRevisionRecord): void;
  updateInspectionPlan(plan: InspectionPlanRevisionRecord, expectedVersion: number): void;
  inspectionById(id: string): InspectionRecord | null;
  insertInspection(inspection: InspectionRecord): void;
  updateInspection(inspection: InspectionRecord, expectedVersion: number): void;
  pmiById(id: string): PmiRecord | null;
  pmiForMaterial(materialItemId: string): readonly PmiRecord[];
  insertPmi(pmi: PmiRecord): void;
  updatePmi(pmi: PmiRecord, expectedVersion: number): void;
  pmiOverrideById(id: string): PmiOverrideRecord | null;
  pmiOverridesForMaterial(materialItemId: string): readonly PmiOverrideRecord[];
  insertPmiOverride(override: PmiOverrideRecord): void;
  updatePmiOverride(override: PmiOverrideRecord, expectedVersion: number): void;
  ncrById(id: string): NonconformanceRecord | null;
  ncrByNumber(projectId: string, number: string): NonconformanceRecord | null;
  ncrForObject(objectId: string): readonly NonconformanceRecord[];
  ncrForProject(projectId: string): readonly NonconformanceRecord[];
  insertNcr(ncr: NonconformanceRecord): void;
  updateNcr(ncr: NonconformanceRecord, expectedVersion: number): void;
  punchById(id: string): PunchItemRecord | null;
  punchByNumber(projectId: string, number: string): PunchItemRecord | null;
  punchForProject(projectId: string): readonly PunchItemRecord[];
  insertPunch(punch: PunchItemRecord): void;
  updatePunch(punch: PunchItemRecord, expectedVersion: number): void;
  completionBoundaryById(id: string): CompletionBoundaryRecord | null;
  completionBoundaryByCode(projectId: string, code: string): CompletionBoundaryRecord | null;
  completionBoundariesForProject(projectId: string): readonly CompletionBoundaryRecord[];
  insertCompletionBoundary(boundary: CompletionBoundaryRecord): void;
  turnoverRequirementByCode(boundaryId: string, code: string): TurnoverRequirementRecord | null;
  turnoverRequirementsForBoundary(boundaryId: string): readonly TurnoverRequirementRecord[];
  insertTurnoverRequirement(requirement: TurnoverRequirementRecord): void;
  turnoverPackageById(id: string): TurnoverPackageRecord | null;
  turnoverPackageByCode(projectId: string, code: string): TurnoverPackageRecord | null;
  turnoverPackagesForProject(projectId: string): readonly TurnoverPackageRecord[];
  insertTurnoverPackage(turnoverPackage: TurnoverPackageRecord): void;
  updateTurnoverPackage(turnoverPackage: TurnoverPackageRecord, expectedVersion: number): void;
  turnoverVersions(packageId: string): readonly TurnoverPackageVersionRecord[];
  turnoverVersionById(id: string): TurnoverPackageVersionRecord | null;
  insertTurnoverVersion(version: TurnoverPackageVersionRecord): void;
  subcontractorProfileById(id: string): SubcontractorProfileRecord | null;
  subcontractorProfileByOrganization(organizationId: string): SubcontractorProfileRecord | null;
  insertSubcontractorProfile(profile: SubcontractorProfileRecord): void;
  updateSubcontractorProfile(profile: SubcontractorProfileRecord, expectedVersion: number): void;
  subcontractorQualificationById(id: string): SubcontractorQualificationRecord | null;
  subcontractorQualificationsForProfile(profileId: string): readonly SubcontractorQualificationRecord[];
  insertSubcontractorQualification(qualification: SubcontractorQualificationRecord): void;
  subcontractorAssignmentById(id: string): SubcontractorProjectAssignmentRecord | null;
  subcontractorAssignmentForProject(projectId: string, organizationId: string): SubcontractorProjectAssignmentRecord | null;
  subcontractorAssignmentsForProject(projectId: string): readonly SubcontractorProjectAssignmentRecord[];
  subcontractorAssignmentsForOrganization(organizationId: string): readonly SubcontractorProjectAssignmentRecord[];
  insertSubcontractorAssignment(assignment: SubcontractorProjectAssignmentRecord): void;
  updateSubcontractorAssignment(assignment: SubcontractorProjectAssignmentRecord, expectedVersion: number): void;
  mobilizationRequirementById(id: string): MobilizationRequirementRecord | null;
  mobilizationRequirementByCode(assignmentId: string, code: string): MobilizationRequirementRecord | null;
  mobilizationRequirementsForAssignment(assignmentId: string): readonly MobilizationRequirementRecord[];
  insertMobilizationRequirement(requirement: MobilizationRequirementRecord): void;
  updateMobilizationRequirement(requirement: MobilizationRequirementRecord, expectedVersion: number): void;
  subcontractorSubmissionById(id: string): SubcontractorSubmissionRecord | null;
  subcontractorSubmissionsForAssignment(assignmentId: string): readonly SubcontractorSubmissionRecord[];
  insertSubcontractorSubmission(submission: SubcontractorSubmissionRecord): void;
  updateSubcontractorSubmission(submission: SubcontractorSubmissionRecord, expectedVersion: number): void;
  appendAudit(event: AuditEvent): void;
  auditForProject(projectId: string): readonly AuditEvent[];
}

export interface FoundationStore {
  transaction<T>(work: (transaction: FoundationTransaction) => Promise<T> | T): Promise<T>;
  claimIntegrationWork(input: IntegrationWorkClaim): Promise<readonly IntegrationWorkLease[]>;
  renewIntegrationWorkLease(
    messageId: string,
    leaseToken: string,
    now: Date,
    leaseDurationMs: number,
  ): Promise<Date | null>;
  releaseIntegrationWorkLease(messageId: string, leaseToken: string): Promise<boolean>;
}

export interface IntegrationWorkClaim {
  readonly ownerId: string;
  readonly interfaceCodes: ReadonlySet<string>;
  readonly limit: number;
  readonly now: Date;
  readonly leaseDurationMs: number;
}

export interface IntegrationWorkLease {
  readonly message: IntegrationMessageRecord;
  readonly leaseToken: string;
  readonly leasedUntil: Date;
}
