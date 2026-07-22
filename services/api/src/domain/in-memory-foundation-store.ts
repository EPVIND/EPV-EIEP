import { randomUUID } from "node:crypto";
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
import { ConflictError } from "./errors.js";
import type {
  FoundationStore,
  FoundationTransaction,
  IntegrationWorkClaim,
  IntegrationWorkLease,
} from "./foundation-store.js";

export interface MemoryState {
  identityAccounts: Map<string, IdentityAccountRecord>;
  externalIdentities: Map<string, ExternalIdentityRecord>;
  projects: Map<string, ProjectRecord>;
  projectStructures: Map<string, ProjectStructureElementRecord>;
  projectOrganizations: Map<string, ProjectOrganizationRecord>;
  responsibilityAssignments: Map<string, ResponsibilityAssignmentRecord>;
  projectConfigurations: Map<string, ProjectConfigurationRevisionRecord>;
  documents: Map<string, DocumentRecord>;
  revisions: Map<string, DocumentRevisionRecord>;
  documentDistributions: Map<string, DocumentDistributionRecord>;
  governingDocumentLinks: Map<string, GoverningDocumentLinkRecord>;
  retentionPolicies: Map<string, RetentionPolicyRecord>;
  legalHolds: Map<string, LegalHoldRecord>;
  retentionDispositions: Map<string, RetentionDispositionRecord>;
  governedFiles: Map<string, GovernedFileRecord>;
  importJobs: Map<string, ImportJobRecord>;
  importedRecords: Map<string, ImportedRecord>;
  externalIdentifiers: Map<string, ExternalIdentifierRecord>;
  exportJobs: Map<string, ExportJobRecord>;
  integrationMessages: Map<string, IntegrationMessageRecord>;
  offlineDrafts: Map<string, OfflineDraftRecord>;
  notificationSubscriptions: Map<string, NotificationSubscriptionRecord>;
  notifications: Map<string, NotificationRecord>;
  materials: Map<string, MaterialItemRecord>;
  mtrReviews: Map<string, MtrReviewRecord>;
  materialMovements: Map<string, MaterialMovementRecord>;
  controlledReports: Map<string, ControlledReportRecord>;
  genealogies: Map<string, MaterialGenealogyRecord>;
  equipment: Map<string, InspectionEquipmentRecord>;
  inspectionPlans: Map<string, InspectionPlanRevisionRecord>;
  inspections: Map<string, InspectionRecord>;
  pmiRecords: Map<string, PmiRecord>;
  pmiOverrides: Map<string, PmiOverrideRecord>;
  ncrs: Map<string, NonconformanceRecord>;
  punches: Map<string, PunchItemRecord>;
  completionBoundaries: Map<string, CompletionBoundaryRecord>;
  turnoverRequirements: Map<string, TurnoverRequirementRecord>;
  turnoverPackages: Map<string, TurnoverPackageRecord>;
  turnoverVersions: Map<string, TurnoverPackageVersionRecord>;
  subcontractorProfiles: Map<string, SubcontractorProfileRecord>;
  subcontractorQualifications: Map<string, SubcontractorQualificationRecord>;
  subcontractorAssignments: Map<string, SubcontractorProjectAssignmentRecord>;
  mobilizationRequirements: Map<string, MobilizationRequirementRecord>;
  subcontractorSubmissions: Map<string, SubcontractorSubmissionRecord>;
  assignments: RoleAssignment[];
  managedAccessAssignments: Map<string, ManagedAccessAssignmentRecord>;
  delegations: Map<string, DelegationRecord>;
  estimateAssemblies: Map<string, EstimateAssemblyRevisionRecord>;
  estimateProductivityFactors: Map<string, EstimateProductivityFactorRevisionRecord>;
  estimateAuthorityPolicies: Map<string, EstimateAuthorityPolicyRevisionRecord>;
  estimates: Map<string, EstimateRecord>;
  estimateRevisions: Map<string, EstimateRevisionRecord>;
  estimateLines: Map<string, EstimateLineRecord>;
  estimateQuotes: Map<string, EstimateQuoteRecord>;
  estimateProposals: Map<string, EstimateProposalRecord>;
  estimateHandoffs: Map<string, EstimateHandoffRecord>;
  projectControlsAuthorityPolicies: Map<string, ProjectControlsAuthorityPolicyRevisionRecord>;
  projectControlBaselines: Map<string, ProjectControlBaselineRecord>;
  projectChangeRequests: Map<string, ProjectChangeRequestRecord>;
  projectCostEntries: Map<string, ProjectCostEntryRecord>;
  projectProgressClaims: Map<string, ProjectProgressClaimRecord>;
  procurementRequisitions: Map<string, ProcurementRequisitionRecord>;
  procurementBidPackages: Map<string, ProcurementBidPackageRecord>;
  procurementCommitments: Map<string, ProcurementCommitmentRecord>;
  schedulePrograms: Map<string, ScheduleProgramRecord>;
  scheduleRevisions: Map<string, ScheduleRevisionRecord>;
  scheduleImports: Map<string, ScheduleImportRecord>;
  weldingProcedures: Map<string, WeldingProcedureRevisionRecord>;
  welderQualifications: Map<string, WelderQualificationRecord>;
  weldJoints: Map<string, WeldJointRecord>;
  ndeRequests: Map<string, NdeRequestRecord>;
  ndeReports: Map<string, NdeReportRevisionRecord>;
  pwhtCycles: Map<string, PwhtCycleRecord>;
  testPackages: Map<string, TestPackageRecord>;
  fabricationAssemblies: Map<string, FabricationAssemblyRevisionRecord>;
  fabricationTravelers: Map<string, FabricationTravelerRecord>;
  fabricationExecutionEvents: Map<string, FabricationExecutionEventRecord>;
  cncMachineProfiles: Map<string, CncMachineProfileRevisionRecord>;
  cncPrograms: Map<string, CncProgramRevisionRecord>;
  cncExecutions: Map<string, CncExecutionRecord>;
  collaborationImports: Map<string, DocumentCollaborationImportRecord>;
  collaborationItems: Map<string, CollaborationItemRecord>;
  collaborationReconciliations: Map<string, CollaborationReconciliationRecord>;
  audits: AuditEvent[];
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

class MemoryTransaction implements FoundationTransaction {
  public constructor(private readonly state: MemoryState) {}

  public applicationIdentityBootstrapState() {
    return cloneValue({
      identityAccounts: [...this.state.identityAccounts.values()],
      externalIdentities: [...this.state.externalIdentities.values()],
      seededAssignments: this.state.assignments,
      managedAccessAssignments: [...this.state.managedAccessAssignments.values()],
      delegations: [...this.state.delegations.values()],
      audits: this.state.audits,
    });
  }

  public identityAccountById(id: string): IdentityAccountRecord | null {
    const account = this.state.identityAccounts.get(id);
    return account ? cloneValue(account) : null;
  }

  public insertIdentityAccount(account: IdentityAccountRecord): void {
    if (this.state.identityAccounts.has(account.id)) throw new ConflictError();
    this.state.identityAccounts.set(account.id, cloneValue(account));
  }

  public updateIdentityAccount(account: IdentityAccountRecord, expectedVersion: number): void {
    const current = this.state.identityAccounts.get(account.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.identityAccounts.set(account.id, cloneValue(account));
  }

  public externalIdentityById(id: string): ExternalIdentityRecord | null {
    const identity = this.state.externalIdentities.get(id);
    return identity ? cloneValue(identity) : null;
  }

  public externalIdentityBySubject(issuer: string, subject: string): ExternalIdentityRecord | null {
    const identity = [...this.state.externalIdentities.values()]
      .find((candidate) => candidate.issuer === issuer && candidate.subject === subject);
    return identity ? cloneValue(identity) : null;
  }

  public insertExternalIdentity(identity: ExternalIdentityRecord): void {
    if (this.state.externalIdentities.has(identity.id)
      || this.externalIdentityBySubject(identity.issuer, identity.subject)) throw new ConflictError();
    this.state.externalIdentities.set(identity.id, cloneValue(identity));
  }

  public updateExternalIdentity(identity: ExternalIdentityRecord, expectedVersion: number): void {
    const current = this.state.externalIdentities.get(identity.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.externalIdentities.set(identity.id, cloneValue(identity));
  }

  public assignmentsFor(userId: string): readonly RoleAssignment[] {
    const seeded = this.state.assignments.filter((assignment) => assignment.userId === userId);
    const managed = [...this.state.managedAccessAssignments.values()].filter((assignment) => assignment.userId === userId);
    const delegated: RoleAssignment[] = [...this.state.delegations.values()]
      .filter((delegation) => delegation.delegateUserId === userId && delegation.state === "active")
      .map((delegation) => ({
        id: `delegation:${delegation.id}`, userId: delegation.delegateUserId,
        actingOrganizationId: delegation.actingOrganizationId, permissions: delegation.permissions,
        scope: delegation.scope, effectiveFrom: delegation.effectiveFrom, effectiveTo: delegation.effectiveTo,
        revokedAt: delegation.revokedAt,
      }));
    return cloneValue([...seeded, ...managed, ...delegated]);
  }

  public accessAssignmentById(id: string): ManagedAccessAssignmentRecord | null {
    const assignment = this.state.managedAccessAssignments.get(id);
    return assignment ? cloneValue(assignment) : null;
  }

  public accessAssignmentsForUser(userId: string): readonly ManagedAccessAssignmentRecord[] {
    return cloneValue([...this.state.managedAccessAssignments.values()].filter((assignment) => assignment.userId === userId));
  }

  public insertAccessAssignment(assignment: ManagedAccessAssignmentRecord): void {
    if (this.state.managedAccessAssignments.has(assignment.id)) throw new ConflictError();
    this.state.managedAccessAssignments.set(assignment.id, cloneValue(assignment));
  }

  public updateAccessAssignment(assignment: ManagedAccessAssignmentRecord, expectedVersion: number): void {
    const current = this.state.managedAccessAssignments.get(assignment.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.managedAccessAssignments.set(assignment.id, cloneValue(assignment));
  }

  public delegationById(id: string): DelegationRecord | null {
    const delegation = this.state.delegations.get(id);
    return delegation ? cloneValue(delegation) : null;
  }

  public delegationsForUser(userId: string): readonly DelegationRecord[] {
    return cloneValue([...this.state.delegations.values()].filter(
      (delegation) => delegation.delegatorUserId === userId || delegation.delegateUserId === userId,
    ));
  }

  public insertDelegation(delegation: DelegationRecord): void {
    if (this.state.delegations.has(delegation.id)) throw new ConflictError();
    this.state.delegations.set(delegation.id, cloneValue(delegation));
  }

  public updateDelegation(delegation: DelegationRecord, expectedVersion: number): void {
    const current = this.state.delegations.get(delegation.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.delegations.set(delegation.id, cloneValue(delegation));
  }

  public estimateAssemblyById(id: string): EstimateAssemblyRevisionRecord | null {
    const assembly = this.state.estimateAssemblies.get(id);
    return assembly ? cloneValue(assembly) : null;
  }

  public estimateAssemblyByRevision(organizationId: string, code: string, revision: string): EstimateAssemblyRevisionRecord | null {
    const assembly = [...this.state.estimateAssemblies.values()].find((candidate) =>
      candidate.businessScopeOrganizationId === organizationId && candidate.code === code && candidate.revision === revision);
    return assembly ? cloneValue(assembly) : null;
  }

  public estimateAssemblies(organizationId: string, code?: string): readonly EstimateAssemblyRevisionRecord[] {
    return cloneValue([...this.state.estimateAssemblies.values()]
      .filter((assembly) => assembly.businessScopeOrganizationId === organizationId && (!code || assembly.code === code))
      .sort((left, right) => left.code.localeCompare(right.code) || left.revision.localeCompare(right.revision)));
  }

  public insertEstimateAssembly(assembly: EstimateAssemblyRevisionRecord): void {
    if (this.state.estimateAssemblies.has(assembly.id)
      || this.estimateAssemblyByRevision(assembly.businessScopeOrganizationId, assembly.code, assembly.revision)) {
      throw new ConflictError();
    }
    this.state.estimateAssemblies.set(assembly.id, cloneValue(assembly));
  }

  public updateEstimateAssembly(assembly: EstimateAssemblyRevisionRecord, expectedVersion: number): void {
    const current = this.state.estimateAssemblies.get(assembly.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.estimateAssemblies.set(assembly.id, cloneValue(assembly));
  }

  public estimateProductivityFactorById(id: string): EstimateProductivityFactorRevisionRecord | null {
    const factor = this.state.estimateProductivityFactors.get(id);
    return factor ? cloneValue(factor) : null;
  }

  public estimateProductivityFactorByRevision(
    organizationId: string, code: string, revision: string,
  ): EstimateProductivityFactorRevisionRecord | null {
    const factor = [...this.state.estimateProductivityFactors.values()].find((candidate) =>
      candidate.businessScopeOrganizationId === organizationId && candidate.code === code && candidate.revision === revision);
    return factor ? cloneValue(factor) : null;
  }

  public estimateProductivityFactors(
    organizationId: string, code?: string,
  ): readonly EstimateProductivityFactorRevisionRecord[] {
    return cloneValue([...this.state.estimateProductivityFactors.values()]
      .filter((factor) => factor.businessScopeOrganizationId === organizationId && (!code || factor.code === code))
      .sort((left, right) => left.code.localeCompare(right.code) || left.revision.localeCompare(right.revision)));
  }

  public insertEstimateProductivityFactor(factor: EstimateProductivityFactorRevisionRecord): void {
    if (this.state.estimateProductivityFactors.has(factor.id)
      || this.estimateProductivityFactorByRevision(
        factor.businessScopeOrganizationId, factor.code, factor.revision,
      )) throw new ConflictError();
    this.state.estimateProductivityFactors.set(factor.id, cloneValue(factor));
  }

  public updateEstimateProductivityFactor(factor: EstimateProductivityFactorRevisionRecord, expectedVersion: number): void {
    const current = this.state.estimateProductivityFactors.get(factor.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.estimateProductivityFactors.set(factor.id, cloneValue(factor));
  }

  public estimateAuthorityPolicyById(id: string): EstimateAuthorityPolicyRevisionRecord | null {
    const policy = this.state.estimateAuthorityPolicies.get(id);
    return policy ? cloneValue(policy) : null;
  }

  public estimateAuthorityPolicyByRevision(
    organizationId: string, currency: string, revision: string,
  ): EstimateAuthorityPolicyRevisionRecord | null {
    const policy = [...this.state.estimateAuthorityPolicies.values()].find((candidate) =>
      candidate.businessScopeOrganizationId === organizationId && candidate.currency === currency
      && candidate.revision === revision);
    return policy ? cloneValue(policy) : null;
  }

  public estimateAuthorityPolicies(
    organizationId: string, currency?: string,
  ): readonly EstimateAuthorityPolicyRevisionRecord[] {
    return cloneValue([...this.state.estimateAuthorityPolicies.values()]
      .filter((policy) => policy.businessScopeOrganizationId === organizationId && (!currency || policy.currency === currency))
      .sort((left, right) => left.currency.localeCompare(right.currency) || left.revision.localeCompare(right.revision)));
  }

  public insertEstimateAuthorityPolicy(policy: EstimateAuthorityPolicyRevisionRecord): void {
    if (this.state.estimateAuthorityPolicies.has(policy.id)
      || this.estimateAuthorityPolicyByRevision(
        policy.businessScopeOrganizationId, policy.currency, policy.revision,
      )) throw new ConflictError();
    this.state.estimateAuthorityPolicies.set(policy.id, cloneValue(policy));
  }

  public updateEstimateAuthorityPolicy(policy: EstimateAuthorityPolicyRevisionRecord, expectedVersion: number): void {
    const current = this.state.estimateAuthorityPolicies.get(policy.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.estimateAuthorityPolicies.set(policy.id, cloneValue(policy));
  }

  public estimateById(id: string): EstimateRecord | null {
    const estimate = this.state.estimates.get(id);
    return estimate ? cloneValue(estimate) : null;
  }

  public estimateByNumber(organizationId: string, number: string): EstimateRecord | null {
    const estimate = [...this.state.estimates.values()].find((candidate) =>
      candidate.businessScopeOrganizationId === organizationId && candidate.number === number);
    return estimate ? cloneValue(estimate) : null;
  }

  public estimatesForOrganization(organizationId: string): readonly EstimateRecord[] {
    return cloneValue([...this.state.estimates.values()]
      .filter((estimate) => estimate.businessScopeOrganizationId === organizationId)
      .sort((left, right) => left.number.localeCompare(right.number)));
  }

  public insertEstimate(estimate: EstimateRecord): void {
    if (this.state.estimates.has(estimate.id)
      || this.estimateByNumber(estimate.businessScopeOrganizationId, estimate.number)) throw new ConflictError();
    this.state.estimates.set(estimate.id, cloneValue(estimate));
  }

  public updateEstimate(estimate: EstimateRecord, expectedVersion: number): void {
    const current = this.state.estimates.get(estimate.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    const duplicate = this.estimateByNumber(estimate.businessScopeOrganizationId, estimate.number);
    if (duplicate && duplicate.id !== estimate.id) throw new ConflictError();
    this.state.estimates.set(estimate.id, cloneValue(estimate));
  }

  public estimateRevisionById(id: string): EstimateRevisionRecord | null {
    const revision = this.state.estimateRevisions.get(id);
    return revision ? cloneValue(revision) : null;
  }

  public estimateRevisionByName(estimateId: string, revision: string): EstimateRevisionRecord | null {
    const match = [...this.state.estimateRevisions.values()].find((candidate) =>
      candidate.estimateId === estimateId && candidate.revision === revision);
    return match ? cloneValue(match) : null;
  }

  public estimateRevisions(estimateId: string): readonly EstimateRevisionRecord[] {
    return cloneValue([...this.state.estimateRevisions.values()]
      .filter((revision) => revision.estimateId === estimateId)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id)));
  }

  public insertEstimateRevision(revision: EstimateRevisionRecord): void {
    if (this.state.estimateRevisions.has(revision.id)
      || this.estimateRevisionByName(revision.estimateId, revision.revision)) throw new ConflictError();
    this.state.estimateRevisions.set(revision.id, cloneValue(revision));
  }

  public updateEstimateRevision(revision: EstimateRevisionRecord, expectedVersion: number): void {
    const current = this.state.estimateRevisions.get(revision.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.estimateRevisions.set(revision.id, cloneValue(revision));
  }

  public estimateLineById(id: string): EstimateLineRecord | null {
    const line = this.state.estimateLines.get(id);
    return line ? cloneValue(line) : null;
  }

  public estimateLineByKey(revisionId: string, lineKey: string): EstimateLineRecord | null {
    const line = [...this.state.estimateLines.values()].find((candidate) =>
      candidate.revisionId === revisionId && candidate.lineKey === lineKey);
    return line ? cloneValue(line) : null;
  }

  public estimateLines(revisionId: string): readonly EstimateLineRecord[] {
    return cloneValue([...this.state.estimateLines.values()]
      .filter((line) => line.revisionId === revisionId)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.lineKey.localeCompare(right.lineKey)));
  }

  public insertEstimateLine(line: EstimateLineRecord): void {
    if (this.state.estimateLines.has(line.id) || this.estimateLineByKey(line.revisionId, line.lineKey)) {
      throw new ConflictError();
    }
    this.state.estimateLines.set(line.id, cloneValue(line));
  }

  public updateEstimateLine(line: EstimateLineRecord, expectedVersion: number): void {
    const current = this.state.estimateLines.get(line.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.estimateLines.set(line.id, cloneValue(line));
  }

  public estimateQuoteById(id: string): EstimateQuoteRecord | null {
    const quote = this.state.estimateQuotes.get(id);
    return quote ? cloneValue(quote) : null;
  }

  public estimateQuoteByNumber(revisionId: string, vendorOrganizationId: string, quoteNumber: string): EstimateQuoteRecord | null {
    const quote = [...this.state.estimateQuotes.values()].find((candidate) =>
      candidate.revisionId === revisionId && candidate.vendorOrganizationId === vendorOrganizationId
      && candidate.quoteNumber === quoteNumber);
    return quote ? cloneValue(quote) : null;
  }

  public estimateQuotes(revisionId: string): readonly EstimateQuoteRecord[] {
    return cloneValue([...this.state.estimateQuotes.values()]
      .filter((quote) => quote.revisionId === revisionId)
      .sort((left, right) => left.vendorOrganizationId.localeCompare(right.vendorOrganizationId)
        || left.quoteNumber.localeCompare(right.quoteNumber)));
  }

  public insertEstimateQuote(quote: EstimateQuoteRecord): void {
    if (this.state.estimateQuotes.has(quote.id)
      || this.estimateQuoteByNumber(quote.revisionId, quote.vendorOrganizationId, quote.quoteNumber)) {
      throw new ConflictError();
    }
    this.state.estimateQuotes.set(quote.id, cloneValue(quote));
  }

  public updateEstimateQuote(quote: EstimateQuoteRecord, expectedVersion: number): void {
    const current = this.state.estimateQuotes.get(quote.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.estimateQuotes.set(quote.id, cloneValue(quote));
  }

  public estimateProposalById(id: string): EstimateProposalRecord | null {
    const proposal = this.state.estimateProposals.get(id);
    return proposal ? cloneValue(proposal) : null;
  }

  public estimateProposalByNumber(estimateId: string, proposalNumber: string): EstimateProposalRecord | null {
    const proposal = [...this.state.estimateProposals.values()].find((candidate) =>
      candidate.estimateId === estimateId && candidate.proposalNumber === proposalNumber);
    return proposal ? cloneValue(proposal) : null;
  }

  public estimateProposals(estimateId: string): readonly EstimateProposalRecord[] {
    return cloneValue([...this.state.estimateProposals.values()]
      .filter((proposal) => proposal.estimateId === estimateId)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id)));
  }

  public insertEstimateProposal(proposal: EstimateProposalRecord): void {
    if (this.state.estimateProposals.has(proposal.id)
      || this.estimateProposalByNumber(proposal.estimateId, proposal.proposalNumber)) throw new ConflictError();
    this.state.estimateProposals.set(proposal.id, cloneValue(proposal));
  }

  public updateEstimateProposal(proposal: EstimateProposalRecord, expectedVersion: number): void {
    const current = this.state.estimateProposals.get(proposal.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.estimateProposals.set(proposal.id, cloneValue(proposal));
  }

  public estimateHandoffById(id: string): EstimateHandoffRecord | null {
    const handoff = this.state.estimateHandoffs.get(id);
    return handoff ? cloneValue(handoff) : null;
  }

  public estimateHandoffByProposal(proposalId: string): EstimateHandoffRecord | null {
    const handoff = [...this.state.estimateHandoffs.values()].find((candidate) => candidate.proposalId === proposalId);
    return handoff ? cloneValue(handoff) : null;
  }

  public estimateHandoffs(estimateId: string): readonly EstimateHandoffRecord[] {
    return cloneValue([...this.state.estimateHandoffs.values()]
      .filter((handoff) => handoff.estimateId === estimateId)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id)));
  }

  public insertEstimateHandoff(handoff: EstimateHandoffRecord): void {
    if (this.state.estimateHandoffs.has(handoff.id) || this.estimateHandoffByProposal(handoff.proposalId)) {
      throw new ConflictError();
    }
    this.state.estimateHandoffs.set(handoff.id, cloneValue(handoff));
  }

  public projectControlsAuthorityPolicyById(id: string): ProjectControlsAuthorityPolicyRevisionRecord | null {
    const policy = this.state.projectControlsAuthorityPolicies.get(id);
    return policy ? cloneValue(policy) : null;
  }

  public projectControlsAuthorityPolicyByRevision(
    organizationId: string, currency: string, revision: string,
  ): ProjectControlsAuthorityPolicyRevisionRecord | null {
    const policy = [...this.state.projectControlsAuthorityPolicies.values()].find((candidate) =>
      candidate.businessScopeOrganizationId === organizationId && candidate.currency === currency
      && candidate.revision === revision);
    return policy ? cloneValue(policy) : null;
  }

  public projectControlsAuthorityPolicies(
    organizationId: string, currency?: string,
  ): readonly ProjectControlsAuthorityPolicyRevisionRecord[] {
    return cloneValue([...this.state.projectControlsAuthorityPolicies.values()]
      .filter((policy) => policy.businessScopeOrganizationId === organizationId
        && (!currency || policy.currency === currency))
      .sort((left, right) => left.currency.localeCompare(right.currency)
        || left.proposedAt.getTime() - right.proposedAt.getTime() || left.id.localeCompare(right.id)));
  }

  public insertProjectControlsAuthorityPolicy(policy: ProjectControlsAuthorityPolicyRevisionRecord): void {
    if (this.state.projectControlsAuthorityPolicies.has(policy.id)
      || this.projectControlsAuthorityPolicyByRevision(
        policy.businessScopeOrganizationId, policy.currency, policy.revision,
      )) throw new ConflictError();
    this.state.projectControlsAuthorityPolicies.set(policy.id, cloneValue(policy));
  }

  public updateProjectControlsAuthorityPolicy(
    policy: ProjectControlsAuthorityPolicyRevisionRecord, expectedVersion: number,
  ): void {
    const current = this.state.projectControlsAuthorityPolicies.get(policy.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.projectControlsAuthorityPolicies.set(policy.id, cloneValue(policy));
  }

  public projectControlBaselineById(id: string): ProjectControlBaselineRecord | null {
    const baseline = this.state.projectControlBaselines.get(id);
    return baseline ? cloneValue(baseline) : null;
  }

  public projectControlBaselineByRevision(
    projectId: string, number: string, revision: string,
  ): ProjectControlBaselineRecord | null {
    const baseline = [...this.state.projectControlBaselines.values()].find((candidate) =>
      candidate.projectId === projectId && candidate.number === number && candidate.revision === revision);
    return baseline ? cloneValue(baseline) : null;
  }

  public projectControlBaselines(projectId: string): readonly ProjectControlBaselineRecord[] {
    return cloneValue([...this.state.projectControlBaselines.values()]
      .filter((baseline) => baseline.projectId === projectId)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id)));
  }

  public insertProjectControlBaseline(baseline: ProjectControlBaselineRecord): void {
    if (this.state.projectControlBaselines.has(baseline.id)
      || this.projectControlBaselineByRevision(baseline.projectId, baseline.number, baseline.revision)) {
      throw new ConflictError();
    }
    this.state.projectControlBaselines.set(baseline.id, cloneValue(baseline));
  }

  public updateProjectControlBaseline(baseline: ProjectControlBaselineRecord, expectedVersion: number): void {
    const current = this.state.projectControlBaselines.get(baseline.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.projectControlBaselines.set(baseline.id, cloneValue(baseline));
  }

  public projectChangeRequestById(id: string): ProjectChangeRequestRecord | null {
    const change = this.state.projectChangeRequests.get(id);
    return change ? cloneValue(change) : null;
  }

  public projectChangeRequestByNumber(projectId: string, number: string): ProjectChangeRequestRecord | null {
    const change = [...this.state.projectChangeRequests.values()].find((candidate) =>
      candidate.projectId === projectId && candidate.number === number);
    return change ? cloneValue(change) : null;
  }

  public projectChangeRequests(projectId: string): readonly ProjectChangeRequestRecord[] {
    return cloneValue([...this.state.projectChangeRequests.values()]
      .filter((change) => change.projectId === projectId)
      .sort((left, right) => left.number.localeCompare(right.number)));
  }

  public insertProjectChangeRequest(change: ProjectChangeRequestRecord): void {
    if (this.state.projectChangeRequests.has(change.id)
      || this.projectChangeRequestByNumber(change.projectId, change.number)) throw new ConflictError();
    this.state.projectChangeRequests.set(change.id, cloneValue(change));
  }

  public updateProjectChangeRequest(change: ProjectChangeRequestRecord, expectedVersion: number): void {
    const current = this.state.projectChangeRequests.get(change.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.projectChangeRequests.set(change.id, cloneValue(change));
  }

  public projectCostEntryById(id: string): ProjectCostEntryRecord | null {
    const entry = this.state.projectCostEntries.get(id);
    return entry ? cloneValue(entry) : null;
  }

  public projectCostEntries(projectId: string): readonly ProjectCostEntryRecord[] {
    return cloneValue([...this.state.projectCostEntries.values()]
      .filter((entry) => entry.projectId === projectId)
      .sort((left, right) => left.periodStart.getTime() - right.periodStart.getTime() || left.id.localeCompare(right.id)));
  }

  public insertProjectCostEntry(entry: ProjectCostEntryRecord): void {
    if (this.state.projectCostEntries.has(entry.id)) throw new ConflictError();
    this.state.projectCostEntries.set(entry.id, cloneValue(entry));
  }

  public updateProjectCostEntry(entry: ProjectCostEntryRecord, expectedVersion: number): void {
    const current = this.state.projectCostEntries.get(entry.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.projectCostEntries.set(entry.id, cloneValue(entry));
  }

  public projectProgressClaimById(id: string): ProjectProgressClaimRecord | null {
    const claim = this.state.projectProgressClaims.get(id);
    return claim ? cloneValue(claim) : null;
  }

  public projectProgressClaims(projectId: string): readonly ProjectProgressClaimRecord[] {
    return cloneValue([...this.state.projectProgressClaims.values()]
      .filter((claim) => claim.projectId === projectId)
      .sort((left, right) => left.periodStart.getTime() - right.periodStart.getTime() || left.id.localeCompare(right.id)));
  }

  public insertProjectProgressClaim(claim: ProjectProgressClaimRecord): void {
    if (this.state.projectProgressClaims.has(claim.id)) throw new ConflictError();
    this.state.projectProgressClaims.set(claim.id, cloneValue(claim));
  }

  public updateProjectProgressClaim(claim: ProjectProgressClaimRecord, expectedVersion: number): void {
    const current = this.state.projectProgressClaims.get(claim.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.projectProgressClaims.set(claim.id, cloneValue(claim));
  }

  public procurementRequisitionById(id: string): ProcurementRequisitionRecord | null {
    const requisition = this.state.procurementRequisitions.get(id);
    return requisition ? cloneValue(requisition) : null;
  }

  public procurementRequisitionByNumber(projectId: string, number: string): ProcurementRequisitionRecord | null {
    const requisition = [...this.state.procurementRequisitions.values()].find((candidate) =>
      candidate.projectId === projectId && candidate.number === number);
    return requisition ? cloneValue(requisition) : null;
  }

  public procurementRequisitions(projectId: string): readonly ProcurementRequisitionRecord[] {
    return cloneValue([...this.state.procurementRequisitions.values()]
      .filter((requisition) => requisition.projectId === projectId)
      .sort((left, right) => left.number.localeCompare(right.number)));
  }

  public insertProcurementRequisition(requisition: ProcurementRequisitionRecord): void {
    if (this.state.procurementRequisitions.has(requisition.id)
      || this.procurementRequisitionByNumber(requisition.projectId, requisition.number)) throw new ConflictError();
    this.state.procurementRequisitions.set(requisition.id, cloneValue(requisition));
  }

  public updateProcurementRequisition(requisition: ProcurementRequisitionRecord, expectedVersion: number): void {
    const current = this.state.procurementRequisitions.get(requisition.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.procurementRequisitions.set(requisition.id, cloneValue(requisition));
  }

  public procurementBidPackageById(id: string): ProcurementBidPackageRecord | null {
    const bidPackage = this.state.procurementBidPackages.get(id);
    return bidPackage ? cloneValue(bidPackage) : null;
  }

  public procurementBidPackageByNumber(projectId: string, number: string): ProcurementBidPackageRecord | null {
    const bidPackage = [...this.state.procurementBidPackages.values()].find((candidate) =>
      candidate.projectId === projectId && candidate.number === number);
    return bidPackage ? cloneValue(bidPackage) : null;
  }

  public procurementBidPackages(projectId: string): readonly ProcurementBidPackageRecord[] {
    return cloneValue([...this.state.procurementBidPackages.values()]
      .filter((bidPackage) => bidPackage.projectId === projectId)
      .sort((left, right) => left.number.localeCompare(right.number)));
  }

  public insertProcurementBidPackage(bidPackage: ProcurementBidPackageRecord): void {
    if (this.state.procurementBidPackages.has(bidPackage.id)
      || this.procurementBidPackageByNumber(bidPackage.projectId, bidPackage.number)) throw new ConflictError();
    this.state.procurementBidPackages.set(bidPackage.id, cloneValue(bidPackage));
  }

  public updateProcurementBidPackage(bidPackage: ProcurementBidPackageRecord, expectedVersion: number): void {
    const current = this.state.procurementBidPackages.get(bidPackage.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.procurementBidPackages.set(bidPackage.id, cloneValue(bidPackage));
  }

  public procurementCommitmentById(id: string): ProcurementCommitmentRecord | null {
    const commitment = this.state.procurementCommitments.get(id);
    return commitment ? cloneValue(commitment) : null;
  }

  public procurementCommitments(projectId: string): readonly ProcurementCommitmentRecord[] {
    return cloneValue([...this.state.procurementCommitments.values()]
      .filter((commitment) => commitment.projectId === projectId)
      .sort((left, right) => left.purchaseOrderReference.localeCompare(right.purchaseOrderReference)));
  }

  public insertProcurementCommitment(commitment: ProcurementCommitmentRecord): void {
    if (this.state.procurementCommitments.has(commitment.id)) throw new ConflictError();
    this.state.procurementCommitments.set(commitment.id, cloneValue(commitment));
  }

  public updateProcurementCommitment(commitment: ProcurementCommitmentRecord, expectedVersion: number): void {
    const current = this.state.procurementCommitments.get(commitment.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.procurementCommitments.set(commitment.id, cloneValue(commitment));
  }

  public scheduleProgramById(id: string): ScheduleProgramRecord | null {
    const schedule = this.state.schedulePrograms.get(id);
    return schedule ? cloneValue(schedule) : null;
  }

  public scheduleProgramByNumber(projectId: string, number: string): ScheduleProgramRecord | null {
    const schedule = [...this.state.schedulePrograms.values()].find((candidate) =>
      candidate.projectId === projectId && candidate.number === number);
    return schedule ? cloneValue(schedule) : null;
  }

  public schedulePrograms(projectId: string): readonly ScheduleProgramRecord[] {
    return cloneValue([...this.state.schedulePrograms.values()]
      .filter((schedule) => schedule.projectId === projectId)
      .sort((left, right) => left.number.localeCompare(right.number)));
  }

  public insertScheduleProgram(schedule: ScheduleProgramRecord): void {
    if (this.state.schedulePrograms.has(schedule.id)
      || this.scheduleProgramByNumber(schedule.projectId, schedule.number)) throw new ConflictError();
    this.state.schedulePrograms.set(schedule.id, cloneValue(schedule));
  }

  public updateScheduleProgram(schedule: ScheduleProgramRecord, expectedVersion: number): void {
    const current = this.state.schedulePrograms.get(schedule.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.schedulePrograms.set(schedule.id, cloneValue(schedule));
  }

  public scheduleRevisionById(id: string): ScheduleRevisionRecord | null {
    const revision = this.state.scheduleRevisions.get(id);
    return revision ? cloneValue(revision) : null;
  }

  public scheduleRevisionByName(scheduleId: string, revision: string): ScheduleRevisionRecord | null {
    const record = [...this.state.scheduleRevisions.values()].find((candidate) =>
      candidate.scheduleId === scheduleId && candidate.revision === revision);
    return record ? cloneValue(record) : null;
  }

  public scheduleRevisions(scheduleId: string): readonly ScheduleRevisionRecord[] {
    return cloneValue([...this.state.scheduleRevisions.values()]
      .filter((revision) => revision.scheduleId === scheduleId)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id)));
  }

  public insertScheduleRevision(revision: ScheduleRevisionRecord): void {
    if (this.state.scheduleRevisions.has(revision.id)
      || this.scheduleRevisionByName(revision.scheduleId, revision.revision)) throw new ConflictError();
    this.state.scheduleRevisions.set(revision.id, cloneValue(revision));
  }

  public updateScheduleRevision(revision: ScheduleRevisionRecord, expectedVersion: number): void {
    const current = this.state.scheduleRevisions.get(revision.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.scheduleRevisions.set(revision.id, cloneValue(revision));
  }

  public scheduleImportById(id: string): ScheduleImportRecord | null {
    const scheduleImport = this.state.scheduleImports.get(id);
    return scheduleImport ? cloneValue(scheduleImport) : null;
  }

  public scheduleImportByKey(projectId: string, idempotencyKey: string): ScheduleImportRecord | null {
    const scheduleImport = [...this.state.scheduleImports.values()].find((candidate) =>
      candidate.projectId === projectId && candidate.idempotencyKey === idempotencyKey);
    return scheduleImport ? cloneValue(scheduleImport) : null;
  }

  public scheduleImports(projectId: string): readonly ScheduleImportRecord[] {
    return cloneValue([...this.state.scheduleImports.values()]
      .filter((scheduleImport) => scheduleImport.projectId === projectId)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id)));
  }

  public insertScheduleImport(scheduleImport: ScheduleImportRecord): void {
    if (this.state.scheduleImports.has(scheduleImport.id)
      || this.scheduleImportByKey(scheduleImport.projectId, scheduleImport.idempotencyKey)) throw new ConflictError();
    this.state.scheduleImports.set(scheduleImport.id, cloneValue(scheduleImport));
  }

  public updateScheduleImport(scheduleImport: ScheduleImportRecord, expectedVersion: number): void {
    const current = this.state.scheduleImports.get(scheduleImport.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.scheduleImports.set(scheduleImport.id, cloneValue(scheduleImport));
  }

  public weldingProcedureById(id: string): WeldingProcedureRevisionRecord | null {
    const record = this.state.weldingProcedures.get(id); return record ? cloneValue(record) : null;
  }
  public weldingProcedureByRevision(projectId: string, number: string, revision: string): WeldingProcedureRevisionRecord | null {
    const record = [...this.state.weldingProcedures.values()].find((item) => item.projectId === projectId && item.number === number && item.revision === revision);
    return record ? cloneValue(record) : null;
  }
  public weldingProcedures(projectId: string): readonly WeldingProcedureRevisionRecord[] {
    return cloneValue([...this.state.weldingProcedures.values()].filter((item) => item.projectId === projectId)
      .sort((left, right) => left.number.localeCompare(right.number) || left.revision.localeCompare(right.revision)));
  }
  public insertWeldingProcedure(procedure: WeldingProcedureRevisionRecord): void {
    if (this.state.weldingProcedures.has(procedure.id) || this.weldingProcedureByRevision(procedure.projectId, procedure.number, procedure.revision)) throw new ConflictError();
    this.state.weldingProcedures.set(procedure.id, cloneValue(procedure));
  }
  public updateWeldingProcedure(procedure: WeldingProcedureRevisionRecord, expectedVersion: number): void {
    const current = this.state.weldingProcedures.get(procedure.id); if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.weldingProcedures.set(procedure.id, cloneValue(procedure));
  }
  public welderQualificationById(id: string): WelderQualificationRecord | null {
    const record = this.state.welderQualifications.get(id); return record ? cloneValue(record) : null;
  }
  public welderQualificationByNumber(projectId: string, qualificationNumber: string): WelderQualificationRecord | null {
    const record = [...this.state.welderQualifications.values()].find((item) => item.projectId === projectId && item.qualificationNumber === qualificationNumber);
    return record ? cloneValue(record) : null;
  }
  public welderQualifications(projectId: string): readonly WelderQualificationRecord[] {
    return cloneValue([...this.state.welderQualifications.values()].filter((item) => item.projectId === projectId)
      .sort((left, right) => left.qualificationNumber.localeCompare(right.qualificationNumber)));
  }
  public insertWelderQualification(qualification: WelderQualificationRecord): void {
    if (this.state.welderQualifications.has(qualification.id) || this.welderQualificationByNumber(qualification.projectId, qualification.qualificationNumber)) throw new ConflictError();
    this.state.welderQualifications.set(qualification.id, cloneValue(qualification));
  }
  public updateWelderQualification(qualification: WelderQualificationRecord, expectedVersion: number): void {
    const current = this.state.welderQualifications.get(qualification.id); if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.welderQualifications.set(qualification.id, cloneValue(qualification));
  }
  public weldById(id: string): WeldJointRecord | null { const record = this.state.weldJoints.get(id); return record ? cloneValue(record) : null; }
  public weldByNumber(projectId: string, number: string): WeldJointRecord | null {
    const record = [...this.state.weldJoints.values()].find((item) => item.projectId === projectId && item.number === number); return record ? cloneValue(record) : null;
  }
  public welds(projectId: string): readonly WeldJointRecord[] {
    return cloneValue([...this.state.weldJoints.values()].filter((item) => item.projectId === projectId).sort((left, right) => left.number.localeCompare(right.number)));
  }
  public insertWeld(weld: WeldJointRecord): void {
    if (this.state.weldJoints.has(weld.id) || this.weldByNumber(weld.projectId, weld.number)) throw new ConflictError(); this.state.weldJoints.set(weld.id, cloneValue(weld));
  }
  public updateWeld(weld: WeldJointRecord, expectedVersion: number): void {
    const current = this.state.weldJoints.get(weld.id); if (!current || current.version !== expectedVersion) throw new ConflictError(); this.state.weldJoints.set(weld.id, cloneValue(weld));
  }
  public ndeRequestById(id: string): NdeRequestRecord | null { const record = this.state.ndeRequests.get(id); return record ? cloneValue(record) : null; }
  public ndeRequestByNumber(projectId: string, number: string): NdeRequestRecord | null {
    const record = [...this.state.ndeRequests.values()].find((item) => item.projectId === projectId && item.number === number); return record ? cloneValue(record) : null;
  }
  public ndeRequests(projectId: string): readonly NdeRequestRecord[] {
    return cloneValue([...this.state.ndeRequests.values()].filter((item) => item.projectId === projectId).sort((left, right) => left.number.localeCompare(right.number)));
  }
  public insertNdeRequest(request: NdeRequestRecord): void {
    if (this.state.ndeRequests.has(request.id) || this.ndeRequestByNumber(request.projectId, request.number)) throw new ConflictError(); this.state.ndeRequests.set(request.id, cloneValue(request));
  }
  public updateNdeRequest(request: NdeRequestRecord, expectedVersion: number): void {
    const current = this.state.ndeRequests.get(request.id); if (!current || current.version !== expectedVersion) throw new ConflictError(); this.state.ndeRequests.set(request.id, cloneValue(request));
  }
  public ndeReportById(id: string): NdeReportRevisionRecord | null { const record = this.state.ndeReports.get(id); return record ? cloneValue(record) : null; }
  public ndeReports(requestId: string): readonly NdeReportRevisionRecord[] {
    return cloneValue([...this.state.ndeReports.values()].filter((item) => item.requestId === requestId).sort((left, right) => left.revision.localeCompare(right.revision)));
  }
  public insertNdeReport(report: NdeReportRevisionRecord): void {
    if (this.state.ndeReports.has(report.id) || this.ndeReports(report.requestId).some((item) => item.revision === report.revision)) throw new ConflictError(); this.state.ndeReports.set(report.id, cloneValue(report));
  }
  public updateNdeReport(report: NdeReportRevisionRecord, expectedVersion: number): void {
    const current = this.state.ndeReports.get(report.id); if (!current || current.version !== expectedVersion) throw new ConflictError(); this.state.ndeReports.set(report.id, cloneValue(report));
  }
  public pwhtCycleById(id: string): PwhtCycleRecord | null { const record = this.state.pwhtCycles.get(id); return record ? cloneValue(record) : null; }
  public pwhtCycleByNumber(projectId: string, number: string): PwhtCycleRecord | null {
    const record = [...this.state.pwhtCycles.values()].find((item) => item.projectId === projectId && item.number === number); return record ? cloneValue(record) : null;
  }
  public pwhtCycles(projectId: string): readonly PwhtCycleRecord[] {
    return cloneValue([...this.state.pwhtCycles.values()].filter((item) => item.projectId === projectId).sort((left, right) => left.number.localeCompare(right.number)));
  }
  public insertPwhtCycle(cycle: PwhtCycleRecord): void {
    if (this.state.pwhtCycles.has(cycle.id) || this.pwhtCycleByNumber(cycle.projectId, cycle.number)) throw new ConflictError(); this.state.pwhtCycles.set(cycle.id, cloneValue(cycle));
  }
  public updatePwhtCycle(cycle: PwhtCycleRecord, expectedVersion: number): void {
    const current = this.state.pwhtCycles.get(cycle.id); if (!current || current.version !== expectedVersion) throw new ConflictError(); this.state.pwhtCycles.set(cycle.id, cloneValue(cycle));
  }
  public testPackageById(id: string): TestPackageRecord | null { const record = this.state.testPackages.get(id); return record ? cloneValue(record) : null; }
  public testPackageByNumber(projectId: string, number: string): TestPackageRecord | null {
    const record = [...this.state.testPackages.values()].find((item) => item.projectId === projectId && item.number === number); return record ? cloneValue(record) : null;
  }
  public testPackages(projectId: string): readonly TestPackageRecord[] {
    return cloneValue([...this.state.testPackages.values()].filter((item) => item.projectId === projectId).sort((left, right) => left.number.localeCompare(right.number)));
  }
  public insertTestPackage(testPackage: TestPackageRecord): void {
    if (this.state.testPackages.has(testPackage.id) || this.testPackageByNumber(testPackage.projectId, testPackage.number)) throw new ConflictError(); this.state.testPackages.set(testPackage.id, cloneValue(testPackage));
  }
  public updateTestPackage(testPackage: TestPackageRecord, expectedVersion: number): void {
    const current = this.state.testPackages.get(testPackage.id); if (!current || current.version !== expectedVersion) throw new ConflictError(); this.state.testPackages.set(testPackage.id, cloneValue(testPackage));
  }

  public fabricationAssemblyById(id: string): FabricationAssemblyRevisionRecord | null {
    const record = this.state.fabricationAssemblies.get(id); return record ? cloneValue(record) : null;
  }
  public fabricationAssemblyByRevision(projectId: string, number: string, revision: string): FabricationAssemblyRevisionRecord | null {
    const record = [...this.state.fabricationAssemblies.values()].find(
      (item) => item.projectId === projectId && item.number === number && item.revision === revision,
    ); return record ? cloneValue(record) : null;
  }
  public fabricationAssemblies(projectId: string): readonly FabricationAssemblyRevisionRecord[] {
    return cloneValue([...this.state.fabricationAssemblies.values()].filter((item) => item.projectId === projectId)
      .sort((left, right) => left.number.localeCompare(right.number) || left.revision.localeCompare(right.revision)));
  }
  public insertFabricationAssembly(assembly: FabricationAssemblyRevisionRecord): void {
    if (this.state.fabricationAssemblies.has(assembly.id)
      || this.fabricationAssemblyByRevision(assembly.projectId, assembly.number, assembly.revision)) throw new ConflictError();
    this.state.fabricationAssemblies.set(assembly.id, cloneValue(assembly));
  }
  public updateFabricationAssembly(assembly: FabricationAssemblyRevisionRecord, expectedVersion: number): void {
    const current = this.state.fabricationAssemblies.get(assembly.id); if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.fabricationAssemblies.set(assembly.id, cloneValue(assembly));
  }
  public fabricationTravelerById(id: string): FabricationTravelerRecord | null {
    const record = this.state.fabricationTravelers.get(id); return record ? cloneValue(record) : null;
  }
  public fabricationTravelerForAssembly(assemblyRevisionId: string): FabricationTravelerRecord | null {
    const record = [...this.state.fabricationTravelers.values()].find((item) => item.assemblyRevisionId === assemblyRevisionId && item.state !== "superseded");
    return record ? cloneValue(record) : null;
  }
  public fabricationTravelers(projectId: string): readonly FabricationTravelerRecord[] {
    return cloneValue([...this.state.fabricationTravelers.values()].filter((item) => item.projectId === projectId)
      .sort((left, right) => left.number.localeCompare(right.number) || left.revision.localeCompare(right.revision)));
  }
  public insertFabricationTraveler(traveler: FabricationTravelerRecord): void {
    if (this.state.fabricationTravelers.has(traveler.id) || this.fabricationTravelerForAssembly(traveler.assemblyRevisionId)) throw new ConflictError();
    this.state.fabricationTravelers.set(traveler.id, cloneValue(traveler));
  }
  public updateFabricationTraveler(traveler: FabricationTravelerRecord, expectedVersion: number): void {
    const current = this.state.fabricationTravelers.get(traveler.id); if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.fabricationTravelers.set(traveler.id, cloneValue(traveler));
  }
  public fabricationExecutionEventById(id: string): FabricationExecutionEventRecord | null {
    const record = this.state.fabricationExecutionEvents.get(id); return record ? cloneValue(record) : null;
  }
  public fabricationExecutionEvents(travelerId: string): readonly FabricationExecutionEventRecord[] {
    return cloneValue([...this.state.fabricationExecutionEvents.values()].filter((item) => item.travelerId === travelerId)
      .sort((left, right) => left.sequence - right.sequence));
  }
  public insertFabricationExecutionEvent(event: FabricationExecutionEventRecord): void {
    if (this.state.fabricationExecutionEvents.has(event.id)) throw new ConflictError();
    this.state.fabricationExecutionEvents.set(event.id, cloneValue(event));
  }

  public cncMachineProfileById(id: string): CncMachineProfileRevisionRecord | null {
    const record = this.state.cncMachineProfiles.get(id); return record ? cloneValue(record) : null;
  }
  public cncMachineProfileByRevision(projectId: string, workCenterCode: string, revision: string): CncMachineProfileRevisionRecord | null {
    const record = [...this.state.cncMachineProfiles.values()].find((item) => item.projectId === projectId
      && item.workCenterCode === workCenterCode && item.revision === revision); return record ? cloneValue(record) : null;
  }
  public cncMachineProfiles(projectId: string): readonly CncMachineProfileRevisionRecord[] {
    return cloneValue([...this.state.cncMachineProfiles.values()].filter((item) => item.projectId === projectId)
      .sort((left, right) => left.workCenterCode.localeCompare(right.workCenterCode) || left.revision.localeCompare(right.revision)));
  }
  public insertCncMachineProfile(profile: CncMachineProfileRevisionRecord): void {
    if (this.state.cncMachineProfiles.has(profile.id)
      || this.cncMachineProfileByRevision(profile.projectId, profile.workCenterCode, profile.revision)) throw new ConflictError();
    this.state.cncMachineProfiles.set(profile.id, cloneValue(profile));
  }
  public updateCncMachineProfile(profile: CncMachineProfileRevisionRecord, expectedVersion: number): void {
    const current = this.state.cncMachineProfiles.get(profile.id); if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.cncMachineProfiles.set(profile.id, cloneValue(profile));
  }
  public cncProgramById(id: string): CncProgramRevisionRecord | null {
    const record = this.state.cncPrograms.get(id); return record ? cloneValue(record) : null;
  }
  public cncProgramByRevision(projectId: string, number: string, revision: string): CncProgramRevisionRecord | null {
    const record = [...this.state.cncPrograms.values()].find((item) => item.projectId === projectId
      && item.number === number && item.revision === revision); return record ? cloneValue(record) : null;
  }
  public cncPrograms(projectId: string): readonly CncProgramRevisionRecord[] {
    return cloneValue([...this.state.cncPrograms.values()].filter((item) => item.projectId === projectId)
      .sort((left, right) => left.number.localeCompare(right.number) || left.revision.localeCompare(right.revision)));
  }
  public insertCncProgram(program: CncProgramRevisionRecord): void {
    if (this.state.cncPrograms.has(program.id) || this.cncProgramByRevision(program.projectId, program.number, program.revision)) throw new ConflictError();
    this.state.cncPrograms.set(program.id, cloneValue(program));
  }
  public updateCncProgram(program: CncProgramRevisionRecord, expectedVersion: number): void {
    const current = this.state.cncPrograms.get(program.id); if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.cncPrograms.set(program.id, cloneValue(program));
  }
  public cncExecutionById(id: string): CncExecutionRecord | null {
    const record = this.state.cncExecutions.get(id); return record ? cloneValue(record) : null;
  }
  public cncExecutionForProgram(programRevisionId: string): CncExecutionRecord | null {
    const record = [...this.state.cncExecutions.values()].find((item) => item.programRevisionId === programRevisionId);
    return record ? cloneValue(record) : null;
  }
  public cncExecutions(projectId: string): readonly CncExecutionRecord[] {
    return cloneValue([...this.state.cncExecutions.values()].filter((item) => item.projectId === projectId)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id)));
  }
  public insertCncExecution(execution: CncExecutionRecord): void {
    if (this.state.cncExecutions.has(execution.id) || this.cncExecutionForProgram(execution.programRevisionId)) throw new ConflictError();
    this.state.cncExecutions.set(execution.id, cloneValue(execution));
  }
  public updateCncExecution(execution: CncExecutionRecord, expectedVersion: number): void {
    const current = this.state.cncExecutions.get(execution.id); if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.cncExecutions.set(execution.id, cloneValue(execution));
  }

  public collaborationImportById(id: string): DocumentCollaborationImportRecord | null {
    const record = this.state.collaborationImports.get(id); return record ? cloneValue(record) : null;
  }
  public collaborationImportByIdempotency(projectId: string, idempotencyKey: string): DocumentCollaborationImportRecord | null {
    const record = [...this.state.collaborationImports.values()].find((item) => item.projectId === projectId && item.idempotencyKey === idempotencyKey);
    return record ? cloneValue(record) : null;
  }
  public collaborationImportBySource(projectId: string, providerProjectId: string, providerSessionId: string, sourceVersion: string): DocumentCollaborationImportRecord | null {
    const record = [...this.state.collaborationImports.values()].find((item) => item.projectId === projectId
      && item.providerProjectId === providerProjectId && item.providerSessionId === providerSessionId && item.sourceVersion === sourceVersion);
    return record ? cloneValue(record) : null;
  }
  public collaborationImports(projectId: string): readonly DocumentCollaborationImportRecord[] {
    return cloneValue([...this.state.collaborationImports.values()].filter((item) => item.projectId === projectId)
      .sort((left, right) => left.previewedAt.getTime() - right.previewedAt.getTime() || left.id.localeCompare(right.id)));
  }
  public insertCollaborationImport(collaborationImport: DocumentCollaborationImportRecord): void {
    if (this.state.collaborationImports.has(collaborationImport.id)
      || this.collaborationImportByIdempotency(collaborationImport.projectId, collaborationImport.idempotencyKey)) throw new ConflictError();
    this.state.collaborationImports.set(collaborationImport.id, cloneValue(collaborationImport));
  }
  public updateCollaborationImport(collaborationImport: DocumentCollaborationImportRecord, expectedVersion: number): void {
    const current = this.state.collaborationImports.get(collaborationImport.id); if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.collaborationImports.set(collaborationImport.id, cloneValue(collaborationImport));
  }
  public collaborationItemById(id: string): CollaborationItemRecord | null {
    const record = this.state.collaborationItems.get(id); return record ? cloneValue(record) : null;
  }
  public collaborationItemByExternal(projectId: string, providerProjectId: string, providerSessionId: string, providerItemId: string): CollaborationItemRecord | null {
    const records = [...this.state.collaborationItems.values()].filter((item) => item.projectId === projectId
      && item.providerProjectId === providerProjectId && item.providerSessionId === providerSessionId && item.providerItemId === providerItemId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id));
    return records[0] ? cloneValue(records[0]) : null;
  }
  public collaborationItems(projectId: string): readonly CollaborationItemRecord[] {
    return cloneValue([...this.state.collaborationItems.values()].filter((item) => item.projectId === projectId)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id)));
  }
  public collaborationItemsForImport(importId: string): readonly CollaborationItemRecord[] {
    return cloneValue([...this.state.collaborationItems.values()].filter((item) => item.importId === importId)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id)));
  }
  public insertCollaborationItem(item: CollaborationItemRecord): void {
    if (this.state.collaborationItems.has(item.id)) throw new ConflictError(); this.state.collaborationItems.set(item.id, cloneValue(item));
  }
  public updateCollaborationItem(item: CollaborationItemRecord, expectedVersion: number): void {
    const current = this.state.collaborationItems.get(item.id); if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.collaborationItems.set(item.id, cloneValue(item));
  }
  public collaborationReconciliationById(id: string): CollaborationReconciliationRecord | null {
    const record = this.state.collaborationReconciliations.get(id); return record ? cloneValue(record) : null;
  }
  public collaborationReconciliations(projectId: string, importId?: string): readonly CollaborationReconciliationRecord[] {
    return cloneValue([...this.state.collaborationReconciliations.values()].filter((item) => item.projectId === projectId && (!importId || item.importId === importId))
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id)));
  }
  public insertCollaborationReconciliation(reconciliation: CollaborationReconciliationRecord): void {
    if (this.state.collaborationReconciliations.has(reconciliation.id)) throw new ConflictError();
    this.state.collaborationReconciliations.set(reconciliation.id, cloneValue(reconciliation));
  }
  public updateCollaborationReconciliation(reconciliation: CollaborationReconciliationRecord, expectedVersion: number): void {
    const current = this.state.collaborationReconciliations.get(reconciliation.id); if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.collaborationReconciliations.set(reconciliation.id, cloneValue(reconciliation));
  }

  public projectById(id: string): ProjectRecord | null {
    const project = this.state.projects.get(id);
    return project ? cloneValue(project) : null;
  }

  public projectByNumber(businessScopeOrganizationId: string, number: string): ProjectRecord | null {
    const project = [...this.state.projects.values()].find(
      (candidate) =>
        candidate.businessScopeOrganizationId === businessScopeOrganizationId && candidate.number === number,
    );
    return project ? cloneValue(project) : null;
  }

  public projects(): readonly ProjectRecord[] {
    return cloneValue([...this.state.projects.values()].sort((left, right) => left.number.localeCompare(right.number)));
  }

  public insertProject(project: ProjectRecord): void {
    if (this.state.projects.has(project.id)) throw new ConflictError();
    if (this.projectByNumber(project.businessScopeOrganizationId, project.number)) throw new ConflictError();
    this.state.projects.set(project.id, cloneValue(project));
  }

  public updateProject(project: ProjectRecord, expectedVersion: number): void {
    const current = this.state.projects.get(project.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.projects.set(project.id, cloneValue(project));
  }

  public projectStructureById(id: string): ProjectStructureElementRecord | null {
    const element = this.state.projectStructures.get(id);
    return element ? cloneValue(element) : null;
  }

  public projectStructureByCode(projectId: string, type: ProjectStructureElementRecord["type"], code: string): ProjectStructureElementRecord | null {
    const element = [...this.state.projectStructures.values()].find(
      (candidate) => candidate.projectId === projectId && candidate.type === type && candidate.code === code,
    );
    return element ? cloneValue(element) : null;
  }

  public projectStructureForProject(projectId: string): readonly ProjectStructureElementRecord[] {
    return cloneValue([...this.state.projectStructures.values()].filter((element) => element.projectId === projectId));
  }

  public insertProjectStructure(element: ProjectStructureElementRecord): void {
    if (this.state.projectStructures.has(element.id)
      || this.projectStructureByCode(element.projectId, element.type, element.code)) throw new ConflictError();
    this.state.projectStructures.set(element.id, cloneValue(element));
  }

  public projectOrganizationById(id: string): ProjectOrganizationRecord | null {
    const organization = this.state.projectOrganizations.get(id);
    return organization ? cloneValue(organization) : null;
  }

  public projectOrganizationByOrganization(projectId: string, organizationId: string): ProjectOrganizationRecord | null {
    const organization = [...this.state.projectOrganizations.values()].find(
      (candidate) => candidate.projectId === projectId && candidate.organizationId === organizationId,
    );
    return organization ? cloneValue(organization) : null;
  }

  public projectOrganizationsForProject(projectId: string): readonly ProjectOrganizationRecord[] {
    return cloneValue([...this.state.projectOrganizations.values()]
      .filter((organization) => organization.projectId === projectId)
      .sort((left, right) => left.id.localeCompare(right.id)));
  }

  public insertProjectOrganization(organization: ProjectOrganizationRecord): void {
    if (this.state.projectOrganizations.has(organization.id)
      || this.projectOrganizationByOrganization(organization.projectId, organization.organizationId)) throw new ConflictError();
    this.state.projectOrganizations.set(organization.id, cloneValue(organization));
  }

  public responsibilityAssignmentById(id: string): ResponsibilityAssignmentRecord | null {
    const assignment = this.state.responsibilityAssignments.get(id);
    return assignment ? cloneValue(assignment) : null;
  }

  public responsibilityAssignmentsForProject(projectId: string): readonly ResponsibilityAssignmentRecord[] {
    return cloneValue([...this.state.responsibilityAssignments.values()].filter(
      (assignment) => assignment.projectId === projectId,
    ));
  }

  public insertResponsibilityAssignment(assignment: ResponsibilityAssignmentRecord): void {
    if (this.state.responsibilityAssignments.has(assignment.id)) throw new ConflictError();
    this.state.responsibilityAssignments.set(assignment.id, cloneValue(assignment));
  }

  public projectConfigurationById(id: string): ProjectConfigurationRevisionRecord | null {
    const configuration = this.state.projectConfigurations.get(id);
    return configuration ? cloneValue(configuration) : null;
  }

  public projectConfigurationByRevision(projectId: string, code: string, revision: string): ProjectConfigurationRevisionRecord | null {
    const configuration = [...this.state.projectConfigurations.values()].find(
      (candidate) => candidate.projectId === projectId && candidate.configurationCode === code && candidate.revision === revision,
    );
    return configuration ? cloneValue(configuration) : null;
  }

  public currentProjectConfiguration(projectId: string, code: string): ProjectConfigurationRevisionRecord | null {
    const configuration = [...this.state.projectConfigurations.values()].find(
      (candidate) => candidate.projectId === projectId && candidate.configurationCode === code && candidate.state === "active",
    );
    return configuration ? cloneValue(configuration) : null;
  }

  public projectConfigurationsForProject(projectId: string): readonly ProjectConfigurationRevisionRecord[] {
    return cloneValue([...this.state.projectConfigurations.values()]
      .filter((configuration) => configuration.projectId === projectId)
      .sort((left, right) => left.configurationCode.localeCompare(right.configurationCode)
        || left.createdAt.getTime() - right.createdAt.getTime()));
  }

  public insertProjectConfiguration(configuration: ProjectConfigurationRevisionRecord): void {
    if (this.state.projectConfigurations.has(configuration.id)
      || this.projectConfigurationByRevision(configuration.projectId, configuration.configurationCode, configuration.revision)) throw new ConflictError();
    this.state.projectConfigurations.set(configuration.id, cloneValue(configuration));
  }

  public updateProjectConfiguration(configuration: ProjectConfigurationRevisionRecord, expectedVersion: number): void {
    const current = this.state.projectConfigurations.get(configuration.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.projectConfigurations.set(configuration.id, cloneValue(configuration));
  }

  public documentById(id: string): DocumentRecord | null {
    const document = this.state.documents.get(id);
    return document ? cloneValue(document) : null;
  }

  public documentByNumber(projectId: string, number: string): DocumentRecord | null {
    const document = [...this.state.documents.values()].find(
      (candidate) => candidate.projectId === projectId && candidate.number === number,
    );
    return document ? cloneValue(document) : null;
  }

  public documentsForProject(projectId: string): readonly DocumentRecord[] {
    return cloneValue([...this.state.documents.values()].filter((document) => document.projectId === projectId));
  }

  public insertDocument(document: DocumentRecord): void {
    if (this.state.documents.has(document.id) || this.documentByNumber(document.projectId, document.number)) {
      throw new ConflictError();
    }
    this.state.documents.set(document.id, cloneValue(document));
  }

  public updateDocument(document: DocumentRecord, expectedVersion: number): void {
    const current = this.state.documents.get(document.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.documents.set(document.id, cloneValue(document));
  }

  public revisionById(id: string): DocumentRevisionRecord | null {
    const revision = this.state.revisions.get(id);
    return revision ? cloneValue(revision) : null;
  }

  public revisionByName(documentId: string, revision: string): DocumentRevisionRecord | null {
    const result = [...this.state.revisions.values()].find(
      (candidate) => candidate.documentId === documentId && candidate.revision === revision,
    );
    return result ? cloneValue(result) : null;
  }

  public revisionsForDocument(documentId: string): readonly DocumentRevisionRecord[] {
    return cloneValue([...this.state.revisions.values()]
      .filter((revision) => revision.documentId === documentId)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id)));
  }

  public insertRevision(revision: DocumentRevisionRecord): void {
    if (this.state.revisions.has(revision.id) || this.revisionByName(revision.documentId, revision.revision)) {
      throw new ConflictError();
    }
    this.state.revisions.set(revision.id, cloneValue(revision));
  }

  public updateRevision(revision: DocumentRevisionRecord, expectedVersion: number): void {
    const current = this.state.revisions.get(revision.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.revisions.set(revision.id, cloneValue(revision));
  }

  public documentDistributionById(id: string): DocumentDistributionRecord | null {
    const distribution = this.state.documentDistributions.get(id);
    return distribution ? cloneValue(distribution) : null;
  }

  public documentDistributionsForRevision(revisionId: string): readonly DocumentDistributionRecord[] {
    return cloneValue([...this.state.documentDistributions.values()].filter(
      (distribution) => distribution.documentRevisionId === revisionId,
    ));
  }

  public insertDocumentDistribution(distribution: DocumentDistributionRecord): void {
    if (this.state.documentDistributions.has(distribution.id)) throw new ConflictError();
    const duplicate = [...this.state.documentDistributions.values()].some((candidate) =>
      candidate.documentRevisionId === distribution.documentRevisionId
      && candidate.recipientOrganizationId === distribution.recipientOrganizationId
      && candidate.recipientUserId === distribution.recipientUserId
      && candidate.workPackageId === distribution.workPackageId
      && candidate.purpose === distribution.purpose,
    );
    if (duplicate) throw new ConflictError();
    this.state.documentDistributions.set(distribution.id, cloneValue(distribution));
  }

  public updateDocumentDistribution(distribution: DocumentDistributionRecord, expectedVersion: number): void {
    const current = this.state.documentDistributions.get(distribution.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.documentDistributions.set(distribution.id, cloneValue(distribution));
  }

  public governingDocumentLinkById(id: string): GoverningDocumentLinkRecord | null {
    const link = this.state.governingDocumentLinks.get(id);
    return link ? cloneValue(link) : null;
  }

  public governingDocumentLinksForTarget(projectId: string, targetType: string, targetId: string): readonly GoverningDocumentLinkRecord[] {
    return cloneValue([...this.state.governingDocumentLinks.values()].filter(
      (link) => link.projectId === projectId && link.targetType === targetType && link.targetId === targetId,
    ));
  }

  public insertGoverningDocumentLink(link: GoverningDocumentLinkRecord): void {
    if (this.state.governingDocumentLinks.has(link.id)) throw new ConflictError();
    const duplicate = this.governingDocumentLinksForTarget(link.projectId, link.targetType, link.targetId)
      .some((candidate) => candidate.documentRevisionId === link.documentRevisionId
        && candidate.governingPurpose === link.governingPurpose && candidate.state === "active");
    if (duplicate) throw new ConflictError();
    this.state.governingDocumentLinks.set(link.id, cloneValue(link));
  }

  public retentionPolicyById(id: string): RetentionPolicyRecord | null {
    const policy = this.state.retentionPolicies.get(id);
    return policy ? cloneValue(policy) : null;
  }

  public currentRetentionPolicy(projectId: string, recordClass: string): RetentionPolicyRecord | null {
    const policy = [...this.state.retentionPolicies.values()].find(
      (candidate) => candidate.projectId === projectId && candidate.recordClass === recordClass && candidate.state === "active",
    );
    return policy ? cloneValue(policy) : null;
  }

  public insertRetentionPolicy(policy: RetentionPolicyRecord): void {
    if (this.state.retentionPolicies.has(policy.id)) throw new ConflictError();
    const duplicateReview = [...this.state.retentionPolicies.values()].some(
      (candidate) => candidate.projectId === policy.projectId && candidate.recordClass === policy.recordClass
        && candidate.state === "under_review",
    );
    if (duplicateReview) throw new ConflictError();
    this.state.retentionPolicies.set(policy.id, cloneValue(policy));
  }

  public updateRetentionPolicy(policy: RetentionPolicyRecord, expectedVersion: number): void {
    const current = this.state.retentionPolicies.get(policy.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.retentionPolicies.set(policy.id, cloneValue(policy));
  }

  public legalHoldById(id: string): LegalHoldRecord | null {
    const hold = this.state.legalHolds.get(id);
    return hold ? cloneValue(hold) : null;
  }

  public activeLegalHoldsForTarget(projectId: string, targetType: string, targetId: string): readonly LegalHoldRecord[] {
    return cloneValue([...this.state.legalHolds.values()].filter(
      (hold) => hold.projectId === projectId && hold.targetType === targetType
        && hold.targetId === targetId && hold.state === "active",
    ));
  }

  public insertLegalHold(hold: LegalHoldRecord): void {
    if (this.state.legalHolds.has(hold.id)
      || this.activeLegalHoldsForTarget(hold.projectId, hold.targetType, hold.targetId).length > 0) throw new ConflictError();
    this.state.legalHolds.set(hold.id, cloneValue(hold));
  }

  public updateLegalHold(hold: LegalHoldRecord, expectedVersion: number): void {
    const current = this.state.legalHolds.get(hold.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.legalHolds.set(hold.id, cloneValue(hold));
  }

  public retentionDispositionById(id: string): RetentionDispositionRecord | null {
    const disposition = this.state.retentionDispositions.get(id);
    return disposition ? cloneValue(disposition) : null;
  }

  public insertRetentionDisposition(disposition: RetentionDispositionRecord): void {
    if (this.state.retentionDispositions.has(disposition.id)) throw new ConflictError();
    const duplicate = [...this.state.retentionDispositions.values()].some(
      (candidate) => candidate.projectId === disposition.projectId && candidate.recordClass === disposition.recordClass
        && candidate.targetId === disposition.targetId && candidate.state !== "rejected",
    );
    if (duplicate) throw new ConflictError();
    this.state.retentionDispositions.set(disposition.id, cloneValue(disposition));
  }

  public updateRetentionDisposition(disposition: RetentionDispositionRecord, expectedVersion: number): void {
    const current = this.state.retentionDispositions.get(disposition.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.retentionDispositions.set(disposition.id, cloneValue(disposition));
  }

  public governedFileById(id: string): GovernedFileRecord | null {
    const file = this.state.governedFiles.get(id);
    return file ? cloneValue(file) : null;
  }

  public governedFileByStorageKey(storageKey: string): GovernedFileRecord | null {
    const file = [...this.state.governedFiles.values()].find((candidate) => candidate.storageKey === storageKey);
    return file ? cloneValue(file) : null;
  }

  public insertGovernedFile(file: GovernedFileRecord): void {
    if (this.state.governedFiles.has(file.id) || this.governedFileByStorageKey(file.storageKey)) throw new ConflictError();
    this.state.governedFiles.set(file.id, cloneValue(file));
  }

  public updateGovernedFile(file: GovernedFileRecord, expectedVersion: number): void {
    const current = this.state.governedFiles.get(file.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.governedFiles.set(file.id, cloneValue(file));
  }

  public importJobById(id: string): ImportJobRecord | null {
    const job = this.state.importJobs.get(id);
    return job ? cloneValue(job) : null;
  }

  public insertImportJob(job: ImportJobRecord): void {
    if (this.state.importJobs.has(job.id)) throw new ConflictError();
    this.state.importJobs.set(job.id, cloneValue(job));
  }

  public updateImportJob(job: ImportJobRecord, expectedVersion: number): void {
    const current = this.state.importJobs.get(job.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.importJobs.set(job.id, cloneValue(job));
  }

  public externalIdentifier(sourceSystem: string, externalId: string): ExternalIdentifierRecord | null {
    const identifier = this.state.externalIdentifiers.get(`${sourceSystem}\u0000${externalId}`);
    return identifier ? cloneValue(identifier) : null;
  }

  public insertExternalIdentifier(identifier: ExternalIdentifierRecord): void {
    const key = `${identifier.sourceSystem}\u0000${identifier.externalId}`;
    if (this.state.externalIdentifiers.has(key)) throw new ConflictError();
    this.state.externalIdentifiers.set(key, cloneValue(identifier));
  }

  public insertImportedRecord(record: ImportedRecord): void {
    if (this.state.importedRecords.has(record.id)) throw new ConflictError();
    this.state.importedRecords.set(record.id, cloneValue(record));
  }

  public importedRecordsForProject(projectId: string): readonly ImportedRecord[] {
    return cloneValue([...this.state.importedRecords.values()].filter((record) => record.projectId === projectId));
  }

  public exportJobById(id: string): ExportJobRecord | null {
    const job = this.state.exportJobs.get(id);
    return job ? cloneValue(job) : null;
  }

  public insertExportJob(job: ExportJobRecord): void {
    if (this.state.exportJobs.has(job.id)) throw new ConflictError();
    this.state.exportJobs.set(job.id, cloneValue(job));
  }

  public updateExportJob(job: ExportJobRecord, expectedVersion: number): void {
    const current = this.state.exportJobs.get(job.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.exportJobs.set(job.id, cloneValue(job));
  }

  public integrationMessageById(id: string): IntegrationMessageRecord | null {
    const message = this.state.integrationMessages.get(id);
    return message ? cloneValue(message) : null;
  }

  public integrationMessageByKey(interfaceCode: string, idempotencyKey: string): IntegrationMessageRecord | null {
    const message = [...this.state.integrationMessages.values()].find(
      (candidate) => candidate.interfaceCode === interfaceCode && candidate.idempotencyKey === idempotencyKey,
    );
    return message ? cloneValue(message) : null;
  }

  public integrationMessagesForWork(limit: number, interfaceCodes?: ReadonlySet<string>): readonly IntegrationMessageRecord[] {
    return [...this.state.integrationMessages.values()]
      .filter((message) => message.direction === "outbox" && ["pending", "retry"].includes(message.state)
        && (!interfaceCodes || interfaceCodes.has(message.interfaceCode)))
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id))
      .slice(0, Math.max(0, limit))
      .map(cloneValue);
  }

  public insertIntegrationMessage(message: IntegrationMessageRecord): void {
    if (this.state.integrationMessages.has(message.id)
      || this.integrationMessageByKey(message.interfaceCode, message.idempotencyKey)) throw new ConflictError();
    this.state.integrationMessages.set(message.id, cloneValue(message));
  }

  public updateIntegrationMessage(message: IntegrationMessageRecord, expectedVersion: number): void {
    const current = this.state.integrationMessages.get(message.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.integrationMessages.set(message.id, cloneValue(message));
  }

  public offlineDraftById(id: string): OfflineDraftRecord | null {
    const draft = this.state.offlineDrafts.get(id);
    return draft ? cloneValue(draft) : null;
  }

  public offlineDraftByKey(projectId: string, idempotencyKey: string): OfflineDraftRecord | null {
    const draft = [...this.state.offlineDrafts.values()].find(
      (candidate) => candidate.projectId === projectId && candidate.idempotencyKey === idempotencyKey,
    );
    return draft ? cloneValue(draft) : null;
  }

  public insertOfflineDraft(draft: OfflineDraftRecord): void {
    if (this.state.offlineDrafts.has(draft.id) || this.offlineDraftByKey(draft.projectId, draft.idempotencyKey)) throw new ConflictError();
    this.state.offlineDrafts.set(draft.id, cloneValue(draft));
  }

  public updateOfflineDraft(draft: OfflineDraftRecord, expectedVersion: number): void {
    const current = this.state.offlineDrafts.get(draft.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.offlineDrafts.set(draft.id, cloneValue(draft));
  }

  public notificationSubscriptionById(id: string): NotificationSubscriptionRecord | null {
    const subscription = this.state.notificationSubscriptions.get(id);
    return subscription ? cloneValue(subscription) : null;
  }

  public notificationSubscriptionForUser(projectId: string, userId: string, channel: string): NotificationSubscriptionRecord | null {
    const subscription = [...this.state.notificationSubscriptions.values()].find((candidate) =>
      candidate.projectId === projectId && candidate.userId === userId && candidate.channel === channel);
    return subscription ? cloneValue(subscription) : null;
  }

  public notificationSubscriptionsForProject(projectId: string): readonly NotificationSubscriptionRecord[] {
    return cloneValue([...this.state.notificationSubscriptions.values()].filter((subscription) => subscription.projectId === projectId));
  }

  public insertNotificationSubscription(subscription: NotificationSubscriptionRecord): void {
    if (this.state.notificationSubscriptions.has(subscription.id)
      || this.notificationSubscriptionForUser(subscription.projectId, subscription.userId, subscription.channel)) throw new ConflictError();
    this.state.notificationSubscriptions.set(subscription.id, cloneValue(subscription));
  }

  public updateNotificationSubscription(subscription: NotificationSubscriptionRecord, expectedVersion: number): void {
    const current = this.state.notificationSubscriptions.get(subscription.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.notificationSubscriptions.set(subscription.id, cloneValue(subscription));
  }

  public notificationById(id: string): NotificationRecord | null {
    const notification = this.state.notifications.get(id);
    return notification ? cloneValue(notification) : null;
  }

  public notificationByKey(idempotencyKey: string): NotificationRecord | null {
    const notification = [...this.state.notifications.values()].find((candidate) => candidate.idempotencyKey === idempotencyKey);
    return notification ? cloneValue(notification) : null;
  }

  public notificationsForRecipient(projectId: string, userId: string): readonly NotificationRecord[] {
    return cloneValue([...this.state.notifications.values()]
      .filter((notification) => notification.projectId === projectId && notification.recipientUserId === userId)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime()));
  }

  public insertNotification(notification: NotificationRecord): void {
    if (this.state.notifications.has(notification.id) || this.notificationByKey(notification.idempotencyKey)) throw new ConflictError();
    this.state.notifications.set(notification.id, cloneValue(notification));
  }

  public updateNotification(notification: NotificationRecord, expectedVersion: number): void {
    const current = this.state.notifications.get(notification.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.notifications.set(notification.id, cloneValue(notification));
  }

  public materialById(id: string): MaterialItemRecord | null {
    const material = this.state.materials.get(id);
    return material ? cloneValue(material) : null;
  }

  public materialByIdentifier(projectId: string, identifier: string): MaterialItemRecord | null {
    const material = [...this.state.materials.values()].find(
      (candidate) => candidate.projectId === projectId && candidate.identifier === identifier,
    );
    return material ? cloneValue(material) : null;
  }

  public materialsForProject(projectId: string): readonly MaterialItemRecord[] {
    return cloneValue([...this.state.materials.values()].filter((material) => material.projectId === projectId));
  }

  public insertMaterial(material: MaterialItemRecord): void {
    if (this.state.materials.has(material.id) || this.materialByIdentifier(material.projectId, material.identifier)) {
      throw new ConflictError("The material identifier already exists in this project.");
    }
    this.state.materials.set(material.id, cloneValue(material));
  }

  public updateMaterial(material: MaterialItemRecord, expectedVersion: number): void {
    const current = this.state.materials.get(material.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.materials.set(material.id, cloneValue(material));
  }

  public mtrReviewById(id: string): MtrReviewRecord | null {
    const review = this.state.mtrReviews.get(id);
    return review ? cloneValue(review) : null;
  }

  public mtrReviewsForMaterial(materialItemId: string): readonly MtrReviewRecord[] {
    return cloneValue([...this.state.mtrReviews.values()]
      .filter((review) => review.materialItemId === materialItemId)
      .sort((left, right) => left.reviewedAt.getTime() - right.reviewedAt.getTime() || left.id.localeCompare(right.id)));
  }

  public insertMtrReview(review: MtrReviewRecord): void {
    if (this.state.mtrReviews.has(review.id)) throw new ConflictError();
    this.state.mtrReviews.set(review.id, cloneValue(review));
  }

  public materialMovementsForItem(materialItemId: string): readonly MaterialMovementRecord[] {
    return cloneValue([...this.state.materialMovements.values()]
      .filter((movement) => movement.materialItemId === materialItemId)
      .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime() || left.id.localeCompare(right.id)));
  }

  public insertMaterialMovement(movement: MaterialMovementRecord): void {
    if (this.state.materialMovements.has(movement.id)) throw new ConflictError();
    this.state.materialMovements.set(movement.id, cloneValue(movement));
  }

  public controlledReportById(id: string): ControlledReportRecord | null {
    const report = this.state.controlledReports.get(id);
    return report ? cloneValue(report) : null;
  }

  public controlledReportsForProject(projectId: string): readonly ControlledReportRecord[] {
    return cloneValue([...this.state.controlledReports.values()]
      .filter((report) => report.projectId === projectId)
      .sort((left, right) => left.generatedAt.getTime() - right.generatedAt.getTime() || left.id.localeCompare(right.id)));
  }

  public insertControlledReport(report: ControlledReportRecord): void {
    if (this.state.controlledReports.has(report.id)) throw new ConflictError();
    this.state.controlledReports.set(report.id, cloneValue(report));
  }

  public genealogyForItem(itemId: string): readonly MaterialGenealogyRecord[] {
    return cloneValue([...this.state.genealogies.values()].filter(
      (genealogy) => genealogy.parentItemId === itemId || genealogy.childItemId === itemId,
    ));
  }

  public insertGenealogy(genealogy: MaterialGenealogyRecord): void {
    if (this.state.genealogies.has(genealogy.id) || genealogy.parentItemId === genealogy.childItemId) {
      throw new ConflictError("The material genealogy conflicts with an existing relationship.");
    }
    this.state.genealogies.set(genealogy.id, cloneValue(genealogy));
  }

  public equipmentById(id: string): InspectionEquipmentRecord | null {
    const equipment = this.state.equipment.get(id);
    return equipment ? cloneValue(equipment) : null;
  }

  public equipmentByIdentifier(projectId: string, identifier: string): InspectionEquipmentRecord | null {
    const equipment = [...this.state.equipment.values()].find(
      (candidate) => candidate.projectId === projectId && candidate.identifier === identifier,
    );
    return equipment ? cloneValue(equipment) : null;
  }

  public equipmentForProject(projectId: string): readonly InspectionEquipmentRecord[] {
    return cloneValue([...this.state.equipment.values()].filter((equipment) => equipment.projectId === projectId));
  }

  public insertEquipment(equipment: InspectionEquipmentRecord): void {
    if (this.state.equipment.has(equipment.id) || this.equipmentByIdentifier(equipment.projectId, equipment.identifier)) {
      throw new ConflictError("The inspection-equipment identifier already exists in this project.");
    }
    this.state.equipment.set(equipment.id, cloneValue(equipment));
  }

  public inspectionPlanById(id: string): InspectionPlanRevisionRecord | null {
    const plan = this.state.inspectionPlans.get(id);
    return plan ? cloneValue(plan) : null;
  }

  public inspectionPlanByRevision(projectId: string, templateCode: string, revision: string): InspectionPlanRevisionRecord | null {
    const plan = [...this.state.inspectionPlans.values()].find(
      (candidate) => candidate.projectId === projectId && candidate.templateCode === templateCode && candidate.revision === revision,
    );
    return plan ? cloneValue(plan) : null;
  }

  public currentInspectionPlan(projectId: string, templateCode: string): InspectionPlanRevisionRecord | null {
    const plan = [...this.state.inspectionPlans.values()].find(
      (candidate) => candidate.projectId === projectId && candidate.templateCode === templateCode && candidate.state === "approved",
    );
    return plan ? cloneValue(plan) : null;
  }

  public insertInspectionPlan(plan: InspectionPlanRevisionRecord): void {
    if (this.state.inspectionPlans.has(plan.id)
      || this.inspectionPlanByRevision(plan.projectId, plan.templateCode, plan.revision)) throw new ConflictError();
    this.state.inspectionPlans.set(plan.id, cloneValue(plan));
  }

  public updateInspectionPlan(plan: InspectionPlanRevisionRecord, expectedVersion: number): void {
    const current = this.state.inspectionPlans.get(plan.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.inspectionPlans.set(plan.id, cloneValue(plan));
  }

  public inspectionById(id: string): InspectionRecord | null {
    const inspection = this.state.inspections.get(id);
    return inspection ? cloneValue(inspection) : null;
  }

  public insertInspection(inspection: InspectionRecord): void {
    if (this.state.inspections.has(inspection.id)) throw new ConflictError();
    this.state.inspections.set(inspection.id, cloneValue(inspection));
  }

  public updateInspection(inspection: InspectionRecord, expectedVersion: number): void {
    const current = this.state.inspections.get(inspection.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.inspections.set(inspection.id, cloneValue(inspection));
  }

  public pmiById(id: string): PmiRecord | null {
    const pmi = this.state.pmiRecords.get(id);
    return pmi ? cloneValue(pmi) : null;
  }

  public pmiForMaterial(materialItemId: string): readonly PmiRecord[] {
    return cloneValue([...this.state.pmiRecords.values()].filter((pmi) => pmi.materialItemId === materialItemId));
  }

  public insertPmi(pmi: PmiRecord): void {
    if (this.state.pmiRecords.has(pmi.id)) throw new ConflictError();
    this.state.pmiRecords.set(pmi.id, cloneValue(pmi));
  }

  public updatePmi(pmi: PmiRecord, expectedVersion: number): void {
    const current = this.state.pmiRecords.get(pmi.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.pmiRecords.set(pmi.id, cloneValue(pmi));
  }

  public pmiOverrideById(id: string): PmiOverrideRecord | null {
    const override = this.state.pmiOverrides.get(id);
    return override ? cloneValue(override) : null;
  }

  public pmiOverridesForMaterial(materialItemId: string): readonly PmiOverrideRecord[] {
    return cloneValue([...this.state.pmiOverrides.values()].filter((override) => override.materialItemId === materialItemId));
  }

  public insertPmiOverride(override: PmiOverrideRecord): void {
    if (this.state.pmiOverrides.has(override.id) || this.pmiOverridesForMaterial(override.materialItemId)
      .some((current) => current.state === "proposed" || current.state === "active")) throw new ConflictError();
    this.state.pmiOverrides.set(override.id, cloneValue(override));
  }

  public updatePmiOverride(override: PmiOverrideRecord, expectedVersion: number): void {
    const current = this.state.pmiOverrides.get(override.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.pmiOverrides.set(override.id, cloneValue(override));
  }

  public ncrById(id: string): NonconformanceRecord | null {
    const ncr = this.state.ncrs.get(id);
    return ncr ? cloneValue(ncr) : null;
  }

  public ncrByNumber(projectId: string, number: string): NonconformanceRecord | null {
    const ncr = [...this.state.ncrs.values()].find(
      (candidate) => candidate.projectId === projectId && candidate.number === number,
    );
    return ncr ? cloneValue(ncr) : null;
  }

  public ncrForObject(objectId: string): readonly NonconformanceRecord[] {
    return cloneValue([...this.state.ncrs.values()].filter((ncr) => ncr.affectedObjectId === objectId));
  }

  public ncrForProject(projectId: string): readonly NonconformanceRecord[] {
    return cloneValue([...this.state.ncrs.values()].filter((ncr) => ncr.projectId === projectId));
  }

  public insertNcr(ncr: NonconformanceRecord): void {
    if (this.state.ncrs.has(ncr.id) || this.ncrByNumber(ncr.projectId, ncr.number)) throw new ConflictError();
    this.state.ncrs.set(ncr.id, cloneValue(ncr));
  }

  public updateNcr(ncr: NonconformanceRecord, expectedVersion: number): void {
    const current = this.state.ncrs.get(ncr.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.ncrs.set(ncr.id, cloneValue(ncr));
  }

  public punchById(id: string): PunchItemRecord | null {
    const punch = this.state.punches.get(id);
    return punch ? cloneValue(punch) : null;
  }

  public punchByNumber(projectId: string, number: string): PunchItemRecord | null {
    const punch = [...this.state.punches.values()].find(
      (candidate) => candidate.projectId === projectId && candidate.number === number,
    );
    return punch ? cloneValue(punch) : null;
  }

  public punchForProject(projectId: string): readonly PunchItemRecord[] {
    return cloneValue([...this.state.punches.values()].filter((punch) => punch.projectId === projectId));
  }

  public insertPunch(punch: PunchItemRecord): void {
    if (this.state.punches.has(punch.id) || this.punchByNumber(punch.projectId, punch.number)) throw new ConflictError();
    this.state.punches.set(punch.id, cloneValue(punch));
  }

  public updatePunch(punch: PunchItemRecord, expectedVersion: number): void {
    const current = this.state.punches.get(punch.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.punches.set(punch.id, cloneValue(punch));
  }

  public completionBoundaryById(id: string): CompletionBoundaryRecord | null {
    const boundary = this.state.completionBoundaries.get(id);
    return boundary ? cloneValue(boundary) : null;
  }

  public completionBoundaryByCode(projectId: string, code: string): CompletionBoundaryRecord | null {
    const boundary = [...this.state.completionBoundaries.values()].find(
      (candidate) => candidate.projectId === projectId && candidate.code === code,
    );
    return boundary ? cloneValue(boundary) : null;
  }

  public completionBoundariesForProject(projectId: string): readonly CompletionBoundaryRecord[] {
    return cloneValue([...this.state.completionBoundaries.values()].filter((boundary) => boundary.projectId === projectId));
  }

  public insertCompletionBoundary(boundary: CompletionBoundaryRecord): void {
    if (this.state.completionBoundaries.has(boundary.id) || this.completionBoundaryByCode(boundary.projectId, boundary.code)) throw new ConflictError();
    this.state.completionBoundaries.set(boundary.id, cloneValue(boundary));
  }

  public turnoverRequirementByCode(boundaryId: string, code: string): TurnoverRequirementRecord | null {
    const requirement = [...this.state.turnoverRequirements.values()].find(
      (candidate) => candidate.completionBoundaryId === boundaryId && candidate.code === code,
    );
    return requirement ? cloneValue(requirement) : null;
  }

  public turnoverRequirementsForBoundary(boundaryId: string): readonly TurnoverRequirementRecord[] {
    return cloneValue([...this.state.turnoverRequirements.values()].filter(
      (requirement) => requirement.completionBoundaryId === boundaryId && requirement.state === "active",
    ));
  }

  public insertTurnoverRequirement(requirement: TurnoverRequirementRecord): void {
    if (this.state.turnoverRequirements.has(requirement.id)
      || this.turnoverRequirementByCode(requirement.completionBoundaryId, requirement.code)) throw new ConflictError();
    this.state.turnoverRequirements.set(requirement.id, cloneValue(requirement));
  }

  public turnoverPackageById(id: string): TurnoverPackageRecord | null {
    const turnoverPackage = this.state.turnoverPackages.get(id);
    return turnoverPackage ? cloneValue(turnoverPackage) : null;
  }

  public turnoverPackageByCode(projectId: string, code: string): TurnoverPackageRecord | null {
    const turnoverPackage = [...this.state.turnoverPackages.values()].find(
      (candidate) => candidate.projectId === projectId && candidate.code === code,
    );
    return turnoverPackage ? cloneValue(turnoverPackage) : null;
  }

  public turnoverPackagesForProject(projectId: string): readonly TurnoverPackageRecord[] {
    return cloneValue([...this.state.turnoverPackages.values()].filter(
      (turnoverPackage) => turnoverPackage.projectId === projectId,
    ));
  }

  public insertTurnoverPackage(turnoverPackage: TurnoverPackageRecord): void {
    if (this.state.turnoverPackages.has(turnoverPackage.id)
      || this.turnoverPackageByCode(turnoverPackage.projectId, turnoverPackage.code)) throw new ConflictError();
    this.state.turnoverPackages.set(turnoverPackage.id, cloneValue(turnoverPackage));
  }

  public updateTurnoverPackage(turnoverPackage: TurnoverPackageRecord, expectedVersion: number): void {
    const current = this.state.turnoverPackages.get(turnoverPackage.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.turnoverPackages.set(turnoverPackage.id, cloneValue(turnoverPackage));
  }

  public turnoverVersions(packageId: string): readonly TurnoverPackageVersionRecord[] {
    return cloneValue([...this.state.turnoverVersions.values()]
      .filter((version) => version.packageId === packageId)
      .sort((left, right) => left.versionNumber - right.versionNumber));
  }

  public turnoverVersionById(id: string): TurnoverPackageVersionRecord | null {
    const version = this.state.turnoverVersions.get(id);
    return version ? cloneValue(version) : null;
  }

  public insertTurnoverVersion(version: TurnoverPackageVersionRecord): void {
    if (this.state.turnoverVersions.has(version.id)) throw new ConflictError();
    const duplicate = this.turnoverVersions(version.packageId)
      .some((candidate) => candidate.versionNumber === version.versionNumber);
    if (duplicate) throw new ConflictError("The turnover package version already exists.");
    this.state.turnoverVersions.set(version.id, cloneValue(version));
  }

  public subcontractorProfileById(id: string): SubcontractorProfileRecord | null {
    const profile = this.state.subcontractorProfiles.get(id);
    return profile ? cloneValue(profile) : null;
  }

  public subcontractorProfileByOrganization(organizationId: string): SubcontractorProfileRecord | null {
    const profile = [...this.state.subcontractorProfiles.values()].find(
      (candidate) => candidate.organizationId === organizationId,
    );
    return profile ? cloneValue(profile) : null;
  }

  public insertSubcontractorProfile(profile: SubcontractorProfileRecord): void {
    if (this.state.subcontractorProfiles.has(profile.id)
      || this.subcontractorProfileByOrganization(profile.organizationId)) throw new ConflictError();
    this.state.subcontractorProfiles.set(profile.id, cloneValue(profile));
  }

  public updateSubcontractorProfile(profile: SubcontractorProfileRecord, expectedVersion: number): void {
    const current = this.state.subcontractorProfiles.get(profile.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.subcontractorProfiles.set(profile.id, cloneValue(profile));
  }

  public subcontractorQualificationById(id: string): SubcontractorQualificationRecord | null {
    const qualification = this.state.subcontractorQualifications.get(id);
    return qualification ? cloneValue(qualification) : null;
  }

  public subcontractorQualificationsForProfile(profileId: string): readonly SubcontractorQualificationRecord[] {
    return cloneValue([...this.state.subcontractorQualifications.values()].filter(
      (qualification) => qualification.profileId === profileId,
    ));
  }

  public insertSubcontractorQualification(qualification: SubcontractorQualificationRecord): void {
    if (this.state.subcontractorQualifications.has(qualification.id)) throw new ConflictError();
    const duplicate = [...this.state.subcontractorQualifications.values()].some(
      (candidate) => candidate.profileId === qualification.profileId && candidate.code === qualification.code
        && candidate.state === "verified",
    );
    if (duplicate) throw new ConflictError();
    this.state.subcontractorQualifications.set(qualification.id, cloneValue(qualification));
  }

  public subcontractorAssignmentById(id: string): SubcontractorProjectAssignmentRecord | null {
    const assignment = this.state.subcontractorAssignments.get(id);
    return assignment ? cloneValue(assignment) : null;
  }

  public subcontractorAssignmentForProject(projectId: string, organizationId: string): SubcontractorProjectAssignmentRecord | null {
    const assignment = [...this.state.subcontractorAssignments.values()].find(
      (candidate) => candidate.projectId === projectId && candidate.organizationId === organizationId,
    );
    return assignment ? cloneValue(assignment) : null;
  }

  public subcontractorAssignmentsForProject(projectId: string): readonly SubcontractorProjectAssignmentRecord[] {
    return cloneValue([...this.state.subcontractorAssignments.values()].filter(
      (assignment) => assignment.projectId === projectId,
    ));
  }

  public subcontractorAssignmentsForOrganization(organizationId: string): readonly SubcontractorProjectAssignmentRecord[] {
    return cloneValue([...this.state.subcontractorAssignments.values()].filter(
      (assignment) => assignment.organizationId === organizationId,
    ));
  }

  public insertSubcontractorAssignment(assignment: SubcontractorProjectAssignmentRecord): void {
    if (this.state.subcontractorAssignments.has(assignment.id)
      || this.subcontractorAssignmentForProject(assignment.projectId, assignment.organizationId)) throw new ConflictError();
    this.state.subcontractorAssignments.set(assignment.id, cloneValue(assignment));
  }

  public updateSubcontractorAssignment(assignment: SubcontractorProjectAssignmentRecord, expectedVersion: number): void {
    const current = this.state.subcontractorAssignments.get(assignment.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.subcontractorAssignments.set(assignment.id, cloneValue(assignment));
  }

  public mobilizationRequirementById(id: string): MobilizationRequirementRecord | null {
    const requirement = this.state.mobilizationRequirements.get(id);
    return requirement ? cloneValue(requirement) : null;
  }

  public mobilizationRequirementByCode(assignmentId: string, code: string): MobilizationRequirementRecord | null {
    const requirement = [...this.state.mobilizationRequirements.values()].find(
      (candidate) => candidate.assignmentId === assignmentId && candidate.code === code,
    );
    return requirement ? cloneValue(requirement) : null;
  }

  public mobilizationRequirementsForAssignment(assignmentId: string): readonly MobilizationRequirementRecord[] {
    return cloneValue([...this.state.mobilizationRequirements.values()].filter(
      (requirement) => requirement.assignmentId === assignmentId,
    ));
  }

  public insertMobilizationRequirement(requirement: MobilizationRequirementRecord): void {
    if (this.state.mobilizationRequirements.has(requirement.id)
      || this.mobilizationRequirementByCode(requirement.assignmentId, requirement.code)) throw new ConflictError();
    this.state.mobilizationRequirements.set(requirement.id, cloneValue(requirement));
  }

  public updateMobilizationRequirement(requirement: MobilizationRequirementRecord, expectedVersion: number): void {
    const current = this.state.mobilizationRequirements.get(requirement.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.mobilizationRequirements.set(requirement.id, cloneValue(requirement));
  }

  public subcontractorSubmissionById(id: string): SubcontractorSubmissionRecord | null {
    const submission = this.state.subcontractorSubmissions.get(id);
    return submission ? cloneValue(submission) : null;
  }

  public subcontractorSubmissionsForAssignment(assignmentId: string): readonly SubcontractorSubmissionRecord[] {
    return cloneValue([...this.state.subcontractorSubmissions.values()].filter(
      (submission) => submission.assignmentId === assignmentId,
    ));
  }

  public insertSubcontractorSubmission(submission: SubcontractorSubmissionRecord): void {
    if (this.state.subcontractorSubmissions.has(submission.id)) throw new ConflictError();
    this.state.subcontractorSubmissions.set(submission.id, cloneValue(submission));
  }

  public updateSubcontractorSubmission(submission: SubcontractorSubmissionRecord, expectedVersion: number): void {
    const current = this.state.subcontractorSubmissions.get(submission.id);
    if (!current || current.version !== expectedVersion) throw new ConflictError();
    this.state.subcontractorSubmissions.set(submission.id, cloneValue(submission));
  }

  public appendAudit(event: AuditEvent): void {
    this.state.audits.push(cloneValue(event));
  }

  public auditForProject(projectId: string): readonly AuditEvent[] {
    return cloneValue(
      this.state.audits
        .filter((event) => event.projectId === projectId)
        .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime()),
    );
  }
}

export function createEmptyMemoryState(): MemoryState {
  return {
    identityAccounts: new Map(),
    externalIdentities: new Map(),
    projects: new Map(),
    projectStructures: new Map(),
    projectOrganizations: new Map(),
    responsibilityAssignments: new Map(),
    projectConfigurations: new Map(),
    documents: new Map(),
    revisions: new Map(),
    documentDistributions: new Map(),
    governingDocumentLinks: new Map(),
    retentionPolicies: new Map(),
    legalHolds: new Map(),
    retentionDispositions: new Map(),
    governedFiles: new Map(),
    importJobs: new Map(),
    importedRecords: new Map(),
    externalIdentifiers: new Map(),
    exportJobs: new Map(),
    integrationMessages: new Map(),
    offlineDrafts: new Map(),
    notificationSubscriptions: new Map(),
    notifications: new Map(),
    materials: new Map(),
    mtrReviews: new Map(),
    materialMovements: new Map(),
    controlledReports: new Map(),
    genealogies: new Map(),
    equipment: new Map(),
    inspectionPlans: new Map(),
    inspections: new Map(),
    pmiRecords: new Map(),
    pmiOverrides: new Map(),
    ncrs: new Map(),
    punches: new Map(),
    completionBoundaries: new Map(),
    turnoverRequirements: new Map(),
    turnoverPackages: new Map(),
    turnoverVersions: new Map(),
    subcontractorProfiles: new Map(),
    subcontractorQualifications: new Map(),
    subcontractorAssignments: new Map(),
    mobilizationRequirements: new Map(),
    subcontractorSubmissions: new Map(),
    assignments: [],
    managedAccessAssignments: new Map(),
    delegations: new Map(),
    estimateAssemblies: new Map(),
    estimateProductivityFactors: new Map(),
    estimateAuthorityPolicies: new Map(),
    estimates: new Map(),
    estimateRevisions: new Map(),
    estimateLines: new Map(),
    estimateQuotes: new Map(),
    estimateProposals: new Map(),
    estimateHandoffs: new Map(),
    projectControlsAuthorityPolicies: new Map(),
    projectControlBaselines: new Map(),
    projectChangeRequests: new Map(),
    projectCostEntries: new Map(),
    projectProgressClaims: new Map(),
    procurementRequisitions: new Map(),
    procurementBidPackages: new Map(),
    procurementCommitments: new Map(),
    schedulePrograms: new Map(),
    scheduleRevisions: new Map(),
    scheduleImports: new Map(),
    weldingProcedures: new Map(),
    welderQualifications: new Map(),
    weldJoints: new Map(),
    ndeRequests: new Map(),
    ndeReports: new Map(),
    pwhtCycles: new Map(),
    testPackages: new Map(),
    fabricationAssemblies: new Map(),
    fabricationTravelers: new Map(),
    fabricationExecutionEvents: new Map(),
    cncMachineProfiles: new Map(),
    cncPrograms: new Map(),
    cncExecutions: new Map(),
    collaborationImports: new Map(),
    collaborationItems: new Map(),
    collaborationReconciliations: new Map(),
    audits: [],
  };
}

export class InMemoryFoundationStore implements FoundationStore {
  private state: MemoryState;
  private readonly integrationWorkLeases = new Map<string, { readonly token: string; readonly leasedUntil: Date }>();

  public constructor(initialState: Partial<MemoryState> = {}) {
    this.state = { ...createEmptyMemoryState(), ...cloneValue(initialState) };
  }

  public snapshot(): MemoryState {
    return cloneValue(this.state);
  }

  public seedAssignments(assignments: readonly RoleAssignment[]): void {
    this.state.assignments = cloneValue([...assignments]);
  }

  public async claimIntegrationWork(input: IntegrationWorkClaim): Promise<readonly IntegrationWorkLease[]> {
    if (!input.ownerId.trim()) throw new Error("A worker owner ID is required.");
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) throw new Error("The work claim limit must be between 1 and 100.");
    if (!Number.isInteger(input.leaseDurationMs) || input.leaseDurationMs < 1_000 || input.leaseDurationMs > 900_000) {
      throw new Error("The work lease duration must be between 1 second and 15 minutes.");
    }
    const candidates = [...this.state.integrationMessages.values()]
      .filter((message) => ["received", "pending", "retry"].includes(message.state))
      .filter((message) => input.interfaceCodes.has(message.interfaceCode))
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id));
    const claimed: IntegrationWorkLease[] = [];
    for (const message of candidates) {
      const existing = this.integrationWorkLeases.get(message.id);
      if (existing && existing.leasedUntil.getTime() > input.now.getTime()) continue;
      const leaseToken = randomUUID();
      const leasedUntil = new Date(input.now.getTime() + input.leaseDurationMs);
      this.integrationWorkLeases.set(message.id, { token: leaseToken, leasedUntil });
      claimed.push({ message: cloneValue(message), leaseToken, leasedUntil });
      if (claimed.length >= input.limit) break;
    }
    return claimed;
  }

  public async releaseIntegrationWorkLease(messageId: string, leaseToken: string): Promise<boolean> {
    const existing = this.integrationWorkLeases.get(messageId);
    if (!existing || existing.token !== leaseToken) return false;
    this.integrationWorkLeases.delete(messageId);
    return true;
  }

  public async renewIntegrationWorkLease(
    messageId: string,
    leaseToken: string,
    now: Date,
    leaseDurationMs: number,
  ): Promise<Date | null> {
    if (!Number.isInteger(leaseDurationMs) || leaseDurationMs < 1_000 || leaseDurationMs > 900_000) {
      throw new Error("The work lease duration must be between 1 second and 15 minutes.");
    }
    const existing = this.integrationWorkLeases.get(messageId);
    if (!existing || existing.token !== leaseToken || existing.leasedUntil.getTime() <= now.getTime()) return null;
    const leasedUntil = new Date(now.getTime() + leaseDurationMs);
    this.integrationWorkLeases.set(messageId, { token: leaseToken, leasedUntil });
    return leasedUntil;
  }

  public async transaction<T>(work: (transaction: FoundationTransaction) => Promise<T> | T): Promise<T> {
    const working = cloneValue(this.state);
    const result = await work(new MemoryTransaction(working));
    this.state = working;
    return cloneValue(result);
  }
}
