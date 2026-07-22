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
  EstimateHandoffRecord,
  EstimateAuthorityPolicyRevisionRecord,
  EstimateAssemblyRevisionRecord,
  EstimateLineRecord,
  EstimateProductivityFactorRevisionRecord,
  EstimateProposalRecord,
  EstimateQuoteRecord,
  EstimateRecord,
  EstimateRevisionRecord,
  ProcurementBidPackageRecord,
  ProcurementCommitmentRecord,
  ProcurementRequisitionRecord,
  ProjectChangeRequestRecord,
  ProjectControlBaselineRecord,
  ProjectControlsAuthorityPolicyRevisionRecord,
  ProjectCostEntryRecord,
  ProjectProgressClaimRecord,
  ScheduleImportRecord,
  ScheduleProgramRecord,
  ScheduleRevisionRecord,
  WeldingProcedureRevisionRecord,
  WelderQualificationRecord,
  WeldJointRecord,
  NdeRequestRecord,
  NdeReportRevisionRecord,
  PwhtCycleRecord,
  TestPackageRecord,
  FabricationAssemblyRevisionRecord,
  FabricationTravelerRecord,
  FabricationExecutionEventRecord,
  CncMachineProfileRevisionRecord,
  CncProgramRevisionRecord,
  CncExecutionRecord,
  EngineeringRegisterItemRevisionRecord,
  DocumentCollaborationImportRecord,
  CollaborationItemRecord,
  CollaborationReconciliationRecord,
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
  estimateAssemblyById(id: string): EstimateAssemblyRevisionRecord | null;
  estimateAssemblyByRevision(organizationId: string, code: string, revision: string): EstimateAssemblyRevisionRecord | null;
  estimateAssemblies(organizationId: string, code?: string): readonly EstimateAssemblyRevisionRecord[];
  insertEstimateAssembly(assembly: EstimateAssemblyRevisionRecord): void;
  updateEstimateAssembly(assembly: EstimateAssemblyRevisionRecord, expectedVersion: number): void;
  estimateProductivityFactorById(id: string): EstimateProductivityFactorRevisionRecord | null;
  estimateProductivityFactorByRevision(
    organizationId: string, code: string, revision: string,
  ): EstimateProductivityFactorRevisionRecord | null;
  estimateProductivityFactors(organizationId: string, code?: string): readonly EstimateProductivityFactorRevisionRecord[];
  insertEstimateProductivityFactor(factor: EstimateProductivityFactorRevisionRecord): void;
  updateEstimateProductivityFactor(factor: EstimateProductivityFactorRevisionRecord, expectedVersion: number): void;
  estimateAuthorityPolicyById(id: string): EstimateAuthorityPolicyRevisionRecord | null;
  estimateAuthorityPolicyByRevision(
    organizationId: string, currency: string, revision: string,
  ): EstimateAuthorityPolicyRevisionRecord | null;
  estimateAuthorityPolicies(organizationId: string, currency?: string): readonly EstimateAuthorityPolicyRevisionRecord[];
  insertEstimateAuthorityPolicy(policy: EstimateAuthorityPolicyRevisionRecord): void;
  updateEstimateAuthorityPolicy(policy: EstimateAuthorityPolicyRevisionRecord, expectedVersion: number): void;
  estimateById(id: string): EstimateRecord | null;
  estimateByNumber(organizationId: string, number: string): EstimateRecord | null;
  estimatesForOrganization(organizationId: string): readonly EstimateRecord[];
  insertEstimate(estimate: EstimateRecord): void;
  updateEstimate(estimate: EstimateRecord, expectedVersion: number): void;
  estimateRevisionById(id: string): EstimateRevisionRecord | null;
  estimateRevisionByName(estimateId: string, revision: string): EstimateRevisionRecord | null;
  estimateRevisions(estimateId: string): readonly EstimateRevisionRecord[];
  insertEstimateRevision(revision: EstimateRevisionRecord): void;
  updateEstimateRevision(revision: EstimateRevisionRecord, expectedVersion: number): void;
  estimateLineById(id: string): EstimateLineRecord | null;
  estimateLineByKey(revisionId: string, lineKey: string): EstimateLineRecord | null;
  estimateLines(revisionId: string): readonly EstimateLineRecord[];
  insertEstimateLine(line: EstimateLineRecord): void;
  updateEstimateLine(line: EstimateLineRecord, expectedVersion: number): void;
  estimateQuoteById(id: string): EstimateQuoteRecord | null;
  estimateQuoteByNumber(revisionId: string, vendorOrganizationId: string, quoteNumber: string): EstimateQuoteRecord | null;
  estimateQuotes(revisionId: string): readonly EstimateQuoteRecord[];
  insertEstimateQuote(quote: EstimateQuoteRecord): void;
  updateEstimateQuote(quote: EstimateQuoteRecord, expectedVersion: number): void;
  estimateProposalById(id: string): EstimateProposalRecord | null;
  estimateProposalByNumber(estimateId: string, proposalNumber: string): EstimateProposalRecord | null;
  estimateProposals(estimateId: string): readonly EstimateProposalRecord[];
  insertEstimateProposal(proposal: EstimateProposalRecord): void;
  updateEstimateProposal(proposal: EstimateProposalRecord, expectedVersion: number): void;
  estimateHandoffById(id: string): EstimateHandoffRecord | null;
  estimateHandoffByProposal(proposalId: string): EstimateHandoffRecord | null;
  estimateHandoffs(estimateId: string): readonly EstimateHandoffRecord[];
  insertEstimateHandoff(handoff: EstimateHandoffRecord): void;
  projectControlsAuthorityPolicyById(id: string): ProjectControlsAuthorityPolicyRevisionRecord | null;
  projectControlsAuthorityPolicyByRevision(
    organizationId: string, currency: string, revision: string,
  ): ProjectControlsAuthorityPolicyRevisionRecord | null;
  projectControlsAuthorityPolicies(
    organizationId: string, currency?: string,
  ): readonly ProjectControlsAuthorityPolicyRevisionRecord[];
  insertProjectControlsAuthorityPolicy(policy: ProjectControlsAuthorityPolicyRevisionRecord): void;
  updateProjectControlsAuthorityPolicy(policy: ProjectControlsAuthorityPolicyRevisionRecord, expectedVersion: number): void;
  projectControlBaselineById(id: string): ProjectControlBaselineRecord | null;
  projectControlBaselineByRevision(projectId: string, number: string, revision: string): ProjectControlBaselineRecord | null;
  projectControlBaselines(projectId: string): readonly ProjectControlBaselineRecord[];
  insertProjectControlBaseline(baseline: ProjectControlBaselineRecord): void;
  updateProjectControlBaseline(baseline: ProjectControlBaselineRecord, expectedVersion: number): void;
  projectChangeRequestById(id: string): ProjectChangeRequestRecord | null;
  projectChangeRequestByNumber(projectId: string, number: string): ProjectChangeRequestRecord | null;
  projectChangeRequests(projectId: string): readonly ProjectChangeRequestRecord[];
  insertProjectChangeRequest(change: ProjectChangeRequestRecord): void;
  updateProjectChangeRequest(change: ProjectChangeRequestRecord, expectedVersion: number): void;
  projectCostEntryById(id: string): ProjectCostEntryRecord | null;
  projectCostEntries(projectId: string): readonly ProjectCostEntryRecord[];
  insertProjectCostEntry(entry: ProjectCostEntryRecord): void;
  updateProjectCostEntry(entry: ProjectCostEntryRecord, expectedVersion: number): void;
  projectProgressClaimById(id: string): ProjectProgressClaimRecord | null;
  projectProgressClaims(projectId: string): readonly ProjectProgressClaimRecord[];
  insertProjectProgressClaim(claim: ProjectProgressClaimRecord): void;
  updateProjectProgressClaim(claim: ProjectProgressClaimRecord, expectedVersion: number): void;
  procurementRequisitionById(id: string): ProcurementRequisitionRecord | null;
  procurementRequisitionByNumber(projectId: string, number: string): ProcurementRequisitionRecord | null;
  procurementRequisitions(projectId: string): readonly ProcurementRequisitionRecord[];
  insertProcurementRequisition(requisition: ProcurementRequisitionRecord): void;
  updateProcurementRequisition(requisition: ProcurementRequisitionRecord, expectedVersion: number): void;
  procurementBidPackageById(id: string): ProcurementBidPackageRecord | null;
  procurementBidPackageByNumber(projectId: string, number: string): ProcurementBidPackageRecord | null;
  procurementBidPackages(projectId: string): readonly ProcurementBidPackageRecord[];
  insertProcurementBidPackage(bidPackage: ProcurementBidPackageRecord): void;
  updateProcurementBidPackage(bidPackage: ProcurementBidPackageRecord, expectedVersion: number): void;
  procurementCommitmentById(id: string): ProcurementCommitmentRecord | null;
  procurementCommitments(projectId: string): readonly ProcurementCommitmentRecord[];
  insertProcurementCommitment(commitment: ProcurementCommitmentRecord): void;
  updateProcurementCommitment(commitment: ProcurementCommitmentRecord, expectedVersion: number): void;
  scheduleProgramById(id: string): ScheduleProgramRecord | null;
  scheduleProgramByNumber(projectId: string, number: string): ScheduleProgramRecord | null;
  schedulePrograms(projectId: string): readonly ScheduleProgramRecord[];
  insertScheduleProgram(schedule: ScheduleProgramRecord): void;
  updateScheduleProgram(schedule: ScheduleProgramRecord, expectedVersion: number): void;
  scheduleRevisionById(id: string): ScheduleRevisionRecord | null;
  scheduleRevisionByName(scheduleId: string, revision: string): ScheduleRevisionRecord | null;
  scheduleRevisions(scheduleId: string): readonly ScheduleRevisionRecord[];
  insertScheduleRevision(revision: ScheduleRevisionRecord): void;
  updateScheduleRevision(revision: ScheduleRevisionRecord, expectedVersion: number): void;
  scheduleImportById(id: string): ScheduleImportRecord | null;
  scheduleImportByKey(projectId: string, idempotencyKey: string): ScheduleImportRecord | null;
  scheduleImports(projectId: string): readonly ScheduleImportRecord[];
  insertScheduleImport(scheduleImport: ScheduleImportRecord): void;
  updateScheduleImport(scheduleImport: ScheduleImportRecord, expectedVersion: number): void;
  weldingProcedureById(id: string): WeldingProcedureRevisionRecord | null;
  weldingProcedureByRevision(projectId: string, number: string, revision: string): WeldingProcedureRevisionRecord | null;
  weldingProcedures(projectId: string): readonly WeldingProcedureRevisionRecord[];
  insertWeldingProcedure(procedure: WeldingProcedureRevisionRecord): void;
  updateWeldingProcedure(procedure: WeldingProcedureRevisionRecord, expectedVersion: number): void;
  welderQualificationById(id: string): WelderQualificationRecord | null;
  welderQualificationByNumber(projectId: string, qualificationNumber: string): WelderQualificationRecord | null;
  welderQualifications(projectId: string): readonly WelderQualificationRecord[];
  insertWelderQualification(qualification: WelderQualificationRecord): void;
  updateWelderQualification(qualification: WelderQualificationRecord, expectedVersion: number): void;
  weldById(id: string): WeldJointRecord | null;
  weldByNumber(projectId: string, number: string): WeldJointRecord | null;
  welds(projectId: string): readonly WeldJointRecord[];
  insertWeld(weld: WeldJointRecord): void;
  updateWeld(weld: WeldJointRecord, expectedVersion: number): void;
  ndeRequestById(id: string): NdeRequestRecord | null;
  ndeRequestByNumber(projectId: string, number: string): NdeRequestRecord | null;
  ndeRequests(projectId: string): readonly NdeRequestRecord[];
  insertNdeRequest(request: NdeRequestRecord): void;
  updateNdeRequest(request: NdeRequestRecord, expectedVersion: number): void;
  ndeReportById(id: string): NdeReportRevisionRecord | null;
  ndeReports(requestId: string): readonly NdeReportRevisionRecord[];
  insertNdeReport(report: NdeReportRevisionRecord): void;
  updateNdeReport(report: NdeReportRevisionRecord, expectedVersion: number): void;
  pwhtCycleById(id: string): PwhtCycleRecord | null;
  pwhtCycleByNumber(projectId: string, number: string): PwhtCycleRecord | null;
  pwhtCycles(projectId: string): readonly PwhtCycleRecord[];
  insertPwhtCycle(cycle: PwhtCycleRecord): void;
  updatePwhtCycle(cycle: PwhtCycleRecord, expectedVersion: number): void;
  testPackageById(id: string): TestPackageRecord | null;
  testPackageByNumber(projectId: string, number: string): TestPackageRecord | null;
  testPackages(projectId: string): readonly TestPackageRecord[];
  insertTestPackage(testPackage: TestPackageRecord): void;
  updateTestPackage(testPackage: TestPackageRecord, expectedVersion: number): void;
  fabricationAssemblyById(id: string): FabricationAssemblyRevisionRecord | null;
  fabricationAssemblyByRevision(projectId: string, number: string, revision: string): FabricationAssemblyRevisionRecord | null;
  fabricationAssemblies(projectId: string): readonly FabricationAssemblyRevisionRecord[];
  insertFabricationAssembly(assembly: FabricationAssemblyRevisionRecord): void;
  updateFabricationAssembly(assembly: FabricationAssemblyRevisionRecord, expectedVersion: number): void;
  fabricationTravelerById(id: string): FabricationTravelerRecord | null;
  fabricationTravelerForAssembly(assemblyRevisionId: string): FabricationTravelerRecord | null;
  fabricationTravelers(projectId: string): readonly FabricationTravelerRecord[];
  insertFabricationTraveler(traveler: FabricationTravelerRecord): void;
  updateFabricationTraveler(traveler: FabricationTravelerRecord, expectedVersion: number): void;
  fabricationExecutionEventById(id: string): FabricationExecutionEventRecord | null;
  fabricationExecutionEvents(travelerId: string): readonly FabricationExecutionEventRecord[];
  insertFabricationExecutionEvent(event: FabricationExecutionEventRecord): void;
  cncMachineProfileById(id: string): CncMachineProfileRevisionRecord | null;
  cncMachineProfileByRevision(projectId: string, workCenterCode: string, revision: string): CncMachineProfileRevisionRecord | null;
  cncMachineProfiles(projectId: string): readonly CncMachineProfileRevisionRecord[];
  insertCncMachineProfile(profile: CncMachineProfileRevisionRecord): void;
  updateCncMachineProfile(profile: CncMachineProfileRevisionRecord, expectedVersion: number): void;
  cncProgramById(id: string): CncProgramRevisionRecord | null;
  cncProgramByRevision(projectId: string, number: string, revision: string): CncProgramRevisionRecord | null;
  cncPrograms(projectId: string): readonly CncProgramRevisionRecord[];
  insertCncProgram(program: CncProgramRevisionRecord): void;
  updateCncProgram(program: CncProgramRevisionRecord, expectedVersion: number): void;
  cncExecutionById(id: string): CncExecutionRecord | null;
  cncExecutionForProgram(programRevisionId: string): CncExecutionRecord | null;
  cncExecutions(projectId: string): readonly CncExecutionRecord[];
  insertCncExecution(execution: CncExecutionRecord): void;
  updateCncExecution(execution: CncExecutionRecord, expectedVersion: number): void;
  engineeringRegisterItemById(id: string): EngineeringRegisterItemRevisionRecord | null;
  engineeringRegisterItemByRevision(projectId: string, registerType: string, tag: string, revision: string): EngineeringRegisterItemRevisionRecord | null;
  engineeringRegisterItems(projectId: string): readonly EngineeringRegisterItemRevisionRecord[];
  insertEngineeringRegisterItem(item: EngineeringRegisterItemRevisionRecord): void;
  updateEngineeringRegisterItem(item: EngineeringRegisterItemRevisionRecord, expectedVersion: number): void;
  collaborationImportById(id: string): DocumentCollaborationImportRecord | null;
  collaborationImportByIdempotency(projectId: string, idempotencyKey: string): DocumentCollaborationImportRecord | null;
  collaborationImportBySource(
    projectId: string, providerProjectId: string, providerSessionId: string, sourceVersion: string,
  ): DocumentCollaborationImportRecord | null;
  collaborationImports(projectId: string): readonly DocumentCollaborationImportRecord[];
  insertCollaborationImport(collaborationImport: DocumentCollaborationImportRecord): void;
  updateCollaborationImport(collaborationImport: DocumentCollaborationImportRecord, expectedVersion: number): void;
  collaborationItemById(id: string): CollaborationItemRecord | null;
  collaborationItemByExternal(
    projectId: string, providerProjectId: string, providerSessionId: string, providerItemId: string,
  ): CollaborationItemRecord | null;
  collaborationItems(projectId: string): readonly CollaborationItemRecord[];
  collaborationItemsForImport(importId: string): readonly CollaborationItemRecord[];
  insertCollaborationItem(item: CollaborationItemRecord): void;
  updateCollaborationItem(item: CollaborationItemRecord, expectedVersion: number): void;
  collaborationReconciliationById(id: string): CollaborationReconciliationRecord | null;
  collaborationReconciliations(projectId: string, importId?: string): readonly CollaborationReconciliationRecord[];
  insertCollaborationReconciliation(reconciliation: CollaborationReconciliationRecord): void;
  updateCollaborationReconciliation(reconciliation: CollaborationReconciliationRecord, expectedVersion: number): void;
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
