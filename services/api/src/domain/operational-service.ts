import { createHash, randomUUID } from "node:crypto";
import type {
  AccessContext,
  AuditEvent,
  CompletionBoundaryRecord,
  InspectionEquipmentRecord,
  InspectionPlanRevisionRecord,
  InspectionRecord,
  MaterialGenealogyRecord,
  MaterialItemRecord,
  MaterialMovementRecord,
  MaterialReleaseRequirements,
  MtrReviewRecord,
  MobilizationRequirementCategory,
  MobilizationRequirementRecord,
  MobilizationStatusRecord,
  NonconformanceRecord,
  PmiOverrideRecord,
  PmiRecord,
  PunchItemRecord,
  RoleAssignment,
  SubcontractorProfileRecord,
  SubcontractorProjectAssignmentRecord,
  SubcontractorQualificationCategory,
  SubcontractorQualificationRecord,
  SubcontractorSubmissionCategory,
  SubcontractorSubmissionRecord,
  TurnoverManifestEntry,
  TurnoverPackageRecord,
  TurnoverPackageVersionRecord,
  TurnoverRequirementRecord,
  TurnoverRequirementStatusRecord,
  TurnoverRecordClass,
} from "@eiep/shared-types";
import {
  AuthorizationDeniedError,
  authorize,
  materialReleaseBlockers,
  ncrClosureBlockers,
  pmiAcceptanceBlockers,
  parseControlledDecimal,
  requireAuthorization,
  unitDefinition,
} from "@eiep/rules-engine";
import { ConflictError, NotFoundError, ValidationError } from "./errors.js";
import type { FoundationStore, FoundationTransaction } from "./foundation-store.js";

type IdFactory = () => string;
type Clock = () => Date;

export interface ReceiveMaterialInput {
  readonly projectConfigurationRevisionId: string;
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
  readonly mtrRequired: boolean;
  readonly receivingInspectionRequired: boolean;
  readonly pmiRequired: boolean;
  readonly governingPmiRule: string | null;
}

export interface ProposePmiOverrideInput {
  readonly required: boolean;
  readonly justification: string;
  readonly governingDocumentRevisionId: string;
}

export interface SplitMaterialInput {
  readonly childIdentifier: string;
  readonly relationship: "cut_piece" | "remnant";
  readonly childQuantity: string;
  readonly remainingParentQuantity: string;
  readonly storageLocation: string;
}

export interface ReviewMtrInput {
  readonly decision: "accepted" | "rejected";
  readonly heatLotVerified: boolean;
  readonly gradeVerified: boolean;
  readonly specificationVerified: boolean;
  readonly reviewNotes: string;
  readonly evidenceFileIds: readonly string[];
}

export interface MoveMaterialInput {
  readonly toLocation: string;
  readonly reason: string;
}

export interface RegisterEquipmentInput {
  readonly identifier: string;
  readonly serialNumber: string;
  readonly methodCapabilities: readonly string[];
  readonly verificationState: "passed" | "failed";
  readonly validFrom: Date;
  readonly validTo: Date;
  readonly evidenceFileId: string;
}

export interface SubmitInspectionPlanInput {
  readonly templateCode: string;
  readonly revision: string;
  readonly title: string;
  readonly requiredFields: readonly string[];
  readonly applicableTargetTypes: readonly string[];
  readonly requiredPerformerQualifications: readonly string[];
  readonly requiredAcceptorQualifications: readonly string[];
  readonly acceptanceReference: string;
  readonly minimumAcceptanceAssurance: "mfa" | "step-up";
}

export interface SubmitInspectionInput {
  readonly planRevisionId: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly performedAt: Date;
  readonly fieldValues: Readonly<Record<string, string>>;
  readonly evidenceFileIds: readonly string[];
  readonly result: "pass" | "fail";
}

export interface RecordPmiInput {
  readonly governingRule: string;
  readonly requiredMaterial: string;
  readonly observedMaterial: string;
  readonly method: string;
  readonly componentLocation: string;
  readonly equipmentId: string;
  readonly inspectedAt: Date;
  readonly readings: Readonly<Record<string, string>>;
  readonly evidenceFileIds: readonly string[];
  readonly notes: string;
  readonly result: "pass" | "fail";
  readonly failedNcrNumber?: string;
  readonly failureDescription?: string;
  readonly containment?: string;
  readonly failureResponsibleUserId?: string;
  readonly turnoverRequired?: boolean;
}

export interface CreateNcrInput {
  readonly number: string;
  readonly affectedObjectType: "material" | "inspection" | "work";
  readonly affectedObjectId: string;
  readonly requirementReference: string;
  readonly description: string;
  readonly containment: string;
  readonly evidenceFileIds: readonly string[];
  readonly responsibleUserId: string;
  readonly turnoverRequired: boolean;
}

export interface ProposeNcrDispositionInput {
  readonly disposition: string;
  readonly correctiveAction: string;
}

export interface CreatePunchInput {
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
  readonly turnoverRequired: boolean;
}

export interface GenerateTurnoverInput {
  readonly packageId: string;
  readonly projectId: string;
}

export interface ConfigureCompletionBoundaryInput {
  readonly boundaryType: CompletionBoundaryRecord["boundaryType"];
  readonly code: string;
  readonly name: string;
}

export interface ConfigureTurnoverRequirementInput {
  readonly code: string;
  readonly recordClass: TurnoverRecordClass;
  readonly required: boolean;
  readonly notApplicableAllowed: boolean;
  readonly acceptanceAuthority: string;
}

export interface CreateTurnoverPackageInput {
  readonly code: string;
  readonly recipientScope: string;
  readonly materialItemIds: readonly string[];
}

export interface CreateSubcontractorProfileInput {
  readonly organizationId: string;
  readonly legalTaxReference: string;
  readonly declaredScopes: readonly string[];
  readonly geography: readonly string[];
  readonly laborModel: string;
  readonly lowerTierDisclosureRequired: boolean;
}

export interface VerifySubcontractorQualificationInput {
  readonly category: SubcontractorQualificationCategory;
  readonly code: string;
  readonly approvedScopes: readonly string[];
  readonly issuer: string;
  readonly effectiveAt: Date;
  readonly expiresAt: Date;
  readonly evidenceFileId: string;
  readonly exceptionReason: string | null;
}

export interface AssignSubcontractorInput {
  readonly approvedScopeCode: string;
  readonly workPackageIds: readonly string[];
  readonly authorizationReference: string;
}

export interface ConfigureMobilizationRequirementInput {
  readonly code: string;
  readonly category: MobilizationRequirementCategory;
  readonly title: string;
  readonly required: boolean;
}

export interface SubmitMobilizationEvidenceInput {
  readonly qualificationId: string | null;
  readonly evidenceFileId: string | null;
}

export interface SubmitSubcontractorRecordInput {
  readonly category: SubcontractorSubmissionCategory;
  readonly title: string;
  readonly claimedProgressPercent: number | null;
  readonly evidenceFileIds: readonly string[];
}

interface DecimalValue {
  readonly coefficient: bigint;
  readonly scale: number;
}

function required(value: string | null | undefined, field: string): string {
  const normalized = value?.trim() ?? "";
  if (!normalized) throw new ValidationError(`${field} is required.`, [`${field}_required`]);
  return normalized;
}

function uniqueRequired(values: readonly string[], field: string): readonly string[] {
  const normalized = values.map((value) => required(value, field));
  if (normalized.length === 0) throw new ValidationError(`${field} is required.`, [`${field}_required`]);
  if (new Set(normalized).size !== normalized.length) {
    throw new ValidationError(`${field} contains duplicates.`, [`${field}_duplicate`]);
  }
  return normalized;
}

function configurationBoolean(settings: Readonly<Record<string, string | number | boolean>>, key: string): boolean {
  const value = settings[key];
  if (typeof value !== "boolean") {
    throw new ValidationError(`Active project configuration is missing boolean ${key}.`, [`project_configuration_${key}_invalid`]);
  }
  return value;
}

function configurationString(settings: Readonly<Record<string, string | number | boolean>>, key: string): string {
  const value = settings[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError(`Active project configuration is missing ${key}.`, [`project_configuration_${key}_invalid`]);
  }
  return value.trim();
}

function decimal(value: string, field: string, allowZero = false): DecimalValue {
  const parsed = parseControlledDecimal(value, { allowZero, maximumScale: 8, maximumIntegerDigits: 16 });
  if (!parsed) throw new ValidationError(`${field} must be a positive decimal with no more than 16 integer and 8 fractional digits.`, [`${field}_invalid`]);
  return parsed;
}

function decimalEqualSum(total: DecimalValue, left: DecimalValue, right: DecimalValue): boolean {
  const scale = Math.max(total.scale, left.scale, right.scale);
  const expand = (value: DecimalValue) => value.coefficient * 10n ** BigInt(scale - value.scale);
  return expand(total) === expand(left) + expand(right);
}

function canonicalHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function turnoverManifestEntry(
  sourceType: TurnoverManifestEntry["sourceType"],
  sourceId: string,
  sourceVersion: number,
  sourceState: string,
  inclusionReason: string,
  canonicalSource: unknown,
): TurnoverManifestEntry {
  const canonicalJson = JSON.stringify(canonicalSource);
  const filenameId = sourceId.replace(/[^A-Za-z0-9_-]/gu, "_");
  return {
    sourceType,
    sourceId,
    sourceVersion,
    sourceState,
    inclusionReason,
    filename: `${sourceType}-${filenameId}-v${sourceVersion}.json`,
    sizeBytes: Buffer.byteLength(canonicalJson, "utf8"),
    canonicalJson,
    canonicalSha256: createHash("sha256").update(canonicalJson, "utf8").digest("hex"),
  };
}

function scope(organizationId: string | null, projectId: string | null, objectId: string | null) {
  return { organizationId, projectId, workPackageId: null, objectId };
}

function audit(
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
  return { id: idFactory(), occurredAt: now, ...payload, canonicalSha256: canonicalHash(payload) };
}

export class OperationalService {
  public constructor(
    private readonly store: FoundationStore,
    private readonly clock: Clock = () => new Date(),
    private readonly idFactory: IdFactory = randomUUID,
  ) {}

  public receiveMaterial(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    input: ReceiveMaterialInput,
  ): Promise<MaterialItemRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "material.receive",
        resource: scope(project.businessScopeOrganizationId, project.id, null),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (project.state !== "active") throw new ValidationError("Material may be received only for an active project.", ["project_not_active"]);
      const configuration = transaction.projectConfigurationById(required(
        input.projectConfigurationRevisionId, "projectConfigurationRevisionId",
      ));
      if (!configuration || configuration.projectId !== project.id || configuration.state !== "active"
        || configuration.effectiveFrom.getTime() > now.getTime()) {
        throw new ValidationError("Material requirements require an active effective project configuration.", ["material_configuration_not_active"]);
      }
      const configuredMtrRequired = configurationBoolean(configuration.settings, "mtrRequired");
      const configuredInspectionRequired = configurationBoolean(configuration.settings, "receivingInspectionRequired");
      const configuredPmiRequired = configurationBoolean(configuration.settings, "pmiRequired");
      const configuredPmiRule = configuredPmiRequired ? configurationString(configuration.settings, "governingPmiRule") : null;
      if (input.mtrRequired !== configuredMtrRequired
        || input.receivingInspectionRequired !== configuredInspectionRequired
        || input.pmiRequired !== configuredPmiRequired
        || (input.governingPmiRule?.trim() || null) !== configuredPmiRule) {
        throw new ValidationError("Material requirements do not match the active project configuration.", ["material_configuration_mismatch"]);
      }
      const identifier = required(input.identifier, "identifier").toUpperCase();
      if (transaction.materialByIdentifier(project.id, identifier)) throw new ConflictError("The material identifier already exists.");
      const unit = unitDefinition(input.unitCode);
      if (!unit) throw new ValidationError("unitCode must be a controlled unit code.", ["unit_code_invalid"]);
      const quantity = parseControlledDecimal(input.quantity, { maximumScale: unit.maximumScale, maximumIntegerDigits: 16 });
      if (!quantity) throw new ValidationError("quantity is outside the controlled precision policy.", ["quantity_invalid"]);
      const evidence = uniqueRequired(input.receiptEvidenceFileIds, "receiptEvidenceFileIds");

      if (input.mtrDocumentRevisionId) {
        const revision = transaction.revisionById(input.mtrDocumentRevisionId);
        if (!revision || revision.state !== "released") {
          throw new ValidationError("The MTR must reference an exact released document revision.", ["mtr_revision_not_released"]);
        }
        const document = transaction.documentById(revision.documentId);
        if (!document || document.projectId !== project.id) throw new ValidationError("The MTR is outside project scope.", ["mtr_scope_mismatch"]);
      }
      if (input.pmiRequired && !input.governingPmiRule?.trim()) {
        throw new ValidationError("A governing PMI rule is required when PMI applies.", ["pmi_rule_missing"]);
      }

      const requirements: MaterialReleaseRequirements = {
        projectConfigurationRevisionId: configuration.id,
        mtrRequired: input.mtrRequired,
        mtrAccepted: false,
        mtrReviewId: null,
        receivingInspectionRequired: input.receivingInspectionRequired,
        receivingInspectionAccepted: !input.receivingInspectionRequired,
        pmiRequired: input.pmiRequired,
        pmiAccepted: !input.pmiRequired,
        governingPmiRule: input.governingPmiRule?.trim() || null,
        pmiOverrideId: null,
        openDispositionCount: 0,
      };
      const material: MaterialItemRecord = {
        id: this.idFactory(), projectId: project.id, identifier,
        receiptNumber: required(input.receiptNumber, "receiptNumber").toUpperCase(),
        purchaseReference: required(input.purchaseReference, "purchaseReference"),
        vendorOrganizationId: required(input.vendorOrganizationId, "vendorOrganizationId"),
        specification: required(input.specification, "specification"),
        grade: required(input.grade, "grade"), form: required(input.form, "form"),
        dimensions: required(input.dimensions, "dimensions"), quantity: quantity.canonical,
        unitCode: unit.code, heatLot: required(input.heatLot, "heatLot"),
        mtrDocumentRevisionId: input.mtrDocumentRevisionId,
        receiptEvidenceFileIds: evidence, storageLocation: required(input.storageLocation, "storageLocation"),
        parentItemId: null, state: "received_pending", requirements, version: 1,
        createdAt: now, createdBy: context.userId, updatedAt: now, updatedBy: context.userId,
      };
      transaction.insertMaterial(material);
      transaction.insertMaterialMovement(this.materialMovement(now, context, material, {
        movementType: "received", fromState: null, toState: material.state,
        fromLocation: null, toLocation: material.storageLocation, quantity: material.quantity,
        workPackageId: null, reason: `receipt:${material.receiptNumber}`,
      }));
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "material.received", objectType: "material_item", objectId: material.id,
        priorState: null, newState: material.state, reason: null,
        changedFields: { identifier: material.identifier, heatLot: material.heatLot, mtrDocumentRevisionId: material.mtrDocumentRevisionId },
      }));
      return material;
    });
  }

  public reviewMtr(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    materialId: string,
    expectedVersion: number,
    input: ReviewMtrInput,
  ): Promise<{ readonly material: MaterialItemRecord; readonly review: MtrReviewRecord }> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const { material, project } = this.materialContext(transaction, materialId);
      requireAuthorization(context, assignments, {
        action: "material.mtr.review", resource: scope(project.businessScopeOrganizationId, project.id, material.id),
        requiredQualifications: ["mtr_reviewer"], forbiddenActorIds: [material.createdBy], minimumAssurance: "step-up",
      }, now);
      if (material.version !== expectedVersion) throw new ConflictError();
      if (!material.requirements.mtrRequired || !material.mtrDocumentRevisionId) {
        throw new ValidationError("The material has no required exact MTR revision to review.", ["mtr_not_applicable"]);
      }
      if (material.state !== "received_pending" && material.state !== "quarantined") {
        throw new ValidationError("MTR review is unavailable in the material's current state.", ["invalid_material_transition"]);
      }
      const revision = transaction.revisionById(material.mtrDocumentRevisionId);
      if (!revision || revision.state !== "released") {
        throw new ValidationError("The MTR must remain an exact released document revision.", ["mtr_revision_not_released"]);
      }
      if (input.decision === "accepted"
        && (!input.heatLotVerified || !input.gradeVerified || !input.specificationVerified)) {
        throw new ValidationError("MTR acceptance requires all controlled comparisons to pass.", ["mtr_comparison_incomplete"]);
      }
      const review: MtrReviewRecord = {
        id: this.idFactory(), projectId: project.id, materialItemId: material.id,
        documentRevisionId: material.mtrDocumentRevisionId, decision: input.decision,
        heatLotVerified: input.heatLotVerified, gradeVerified: input.gradeVerified,
        specificationVerified: input.specificationVerified,
        reviewNotes: required(input.reviewNotes, "reviewNotes"),
        evidenceFileIds: uniqueRequired(input.evidenceFileIds, "evidenceFileIds"),
        reviewedAt: now, reviewedBy: context.userId, version: 1,
      };
      const nextState = input.decision === "rejected" ? "quarantined" as const
        : material.state === "quarantined" && material.requirements.openDispositionCount === 0
          ? "received_pending" as const : material.state;
      const updated: MaterialItemRecord = {
        ...material, state: nextState,
        requirements: { ...material.requirements, mtrAccepted: input.decision === "accepted", mtrReviewId: review.id },
        version: material.version + 1, updatedAt: now, updatedBy: context.userId,
      };
      transaction.insertMtrReview(review);
      transaction.updateMaterial(updated, expectedVersion);
      if (nextState !== material.state) {
        transaction.insertMaterialMovement(this.materialMovement(now, context, updated, {
          movementType: input.decision === "rejected" ? "quarantined" : "status_changed",
          fromState: material.state, toState: nextState,
          fromLocation: material.storageLocation, toLocation: updated.storageLocation, quantity: updated.quantity,
          workPackageId: null, reason: `mtr_review:${review.id}`,
        }));
      }
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: input.decision === "accepted" ? "material.mtr_accepted" : "material.mtr_rejected",
        objectType: "mtr_review", objectId: review.id, priorState: material.state, newState: updated.state,
        reason: review.reviewNotes,
        changedFields: { materialItemId: material.id, documentRevisionId: review.documentRevisionId,
          heatLotVerified: review.heatLotVerified, gradeVerified: review.gradeVerified,
          specificationVerified: review.specificationVerified },
      }));
      return { material: updated, review };
    });
  }

  public mtrReviews(
    context: AccessContext, assignments: readonly RoleAssignment[], materialId: string,
  ): Promise<readonly MtrReviewRecord[]> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const { material, project } = this.materialContext(transaction, materialId);
      requireAuthorization(context, assignments, {
        action: "material.read", resource: scope(project.businessScopeOrganizationId, project.id, material.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      return transaction.mtrReviewsForMaterial(material.id);
    });
  }

  public acceptReceivingInspection(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    materialId: string,
    expectedVersion: number,
  ): Promise<MaterialItemRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const { material, project } = this.materialContext(transaction, materialId);
      requireAuthorization(context, assignments, {
        action: "inspection.accept", resource: scope(project.businessScopeOrganizationId, project.id, material.id),
        requiredQualifications: ["receiving_inspector"], forbiddenActorIds: [material.createdBy], minimumAssurance: "step-up",
      }, now);
      if (material.version !== expectedVersion) throw new ConflictError();
      const updated = { ...material, requirements: { ...material.requirements, receivingInspectionAccepted: true },
        version: material.version + 1, updatedAt: now, updatedBy: context.userId };
      transaction.updateMaterial(updated, expectedVersion);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "material.receiving_inspection_accepted", objectType: "material_item", objectId: material.id,
        priorState: material.state, newState: updated.state, reason: null, changedFields: { receivingInspectionAccepted: true },
      }));
      return updated;
    });
  }

  public splitMaterial(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    parentId: string,
    expectedVersion: number,
    input: SplitMaterialInput,
  ): Promise<{ readonly parent: MaterialItemRecord; readonly child: MaterialItemRecord; readonly genealogy: MaterialGenealogyRecord }> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const { material: parent, project } = this.materialContext(transaction, parentId);
      requireAuthorization(context, assignments, {
        action: "material.genealogy.manage", resource: scope(project.businessScopeOrganizationId, project.id, parent.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (parent.version !== expectedVersion) throw new ConflictError();
      if (parent.state === "quarantined" || parent.state === "rejected") {
        throw new ValidationError("Held or rejected material cannot be split for use.", ["material_not_available"]);
      }
      const total = decimal(parent.quantity, "parentQuantity");
      const childQuantity = decimal(input.childQuantity, "childQuantity");
      const remainder = decimal(input.remainingParentQuantity, "remainingParentQuantity");
      if (!decimalEqualSum(total, childQuantity, remainder)) {
        throw new ValidationError("Child and remaining quantities must exactly reconcile to the parent quantity.", ["quantity_reconciliation_failed"]);
      }
      const childIdentifier = required(input.childIdentifier, "childIdentifier").toUpperCase();
      if (transaction.materialByIdentifier(project.id, childIdentifier)) throw new ConflictError("The material identifier already exists.");
      const updatedParent = { ...parent, quantity: input.remainingParentQuantity.trim(), version: parent.version + 1,
        updatedAt: now, updatedBy: context.userId };
      const child: MaterialItemRecord = { ...parent, id: this.idFactory(), identifier: childIdentifier,
        quantity: input.childQuantity.trim(), storageLocation: required(input.storageLocation, "storageLocation"),
        parentItemId: parent.id, version: 1, createdAt: now, createdBy: context.userId, updatedAt: now, updatedBy: context.userId };
      const genealogy: MaterialGenealogyRecord = { id: this.idFactory(), projectId: project.id, parentItemId: parent.id,
        childItemId: child.id, relationship: input.relationship, quantityTransferred: child.quantity,
        createdAt: now, createdBy: context.userId };
      transaction.updateMaterial(updatedParent, expectedVersion);
      transaction.insertMaterial(child);
      transaction.insertGenealogy(genealogy);
      transaction.insertMaterialMovement(this.materialMovement(now, context, updatedParent, {
        movementType: "split_out", fromState: parent.state, toState: updatedParent.state,
        fromLocation: parent.storageLocation, toLocation: updatedParent.storageLocation,
        quantity: child.quantity, workPackageId: null, reason: `child:${child.id}`,
      }));
      transaction.insertMaterialMovement(this.materialMovement(now, context, child, {
        movementType: "split_in", fromState: null, toState: child.state,
        fromLocation: parent.storageLocation, toLocation: child.storageLocation,
        quantity: child.quantity, workPackageId: null, reason: `parent:${parent.id}`,
      }));
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "material.split", objectType: "material_item", objectId: child.id,
        priorState: null, newState: child.state, reason: input.relationship,
        changedFields: { parentItemId: parent.id, heatLot: child.heatLot, mtrDocumentRevisionId: child.mtrDocumentRevisionId, quantity: child.quantity },
      }));
      return { parent: updatedParent, child, genealogy };
    });
  }

  public registerEquipment(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    input: RegisterEquipmentInput,
  ): Promise<InspectionEquipmentRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "inspection.equipment.manage", resource: scope(project.businessScopeOrganizationId, project.id, null),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (!Number.isFinite(input.validFrom.getTime()) || !Number.isFinite(input.validTo.getTime())
        || input.validTo.getTime() <= input.validFrom.getTime()) {
        throw new ValidationError("Equipment validity end must follow its start.", ["equipment_validity_invalid"]);
      }
      const identifier = required(input.identifier, "identifier").toUpperCase();
      if (transaction.equipmentByIdentifier(project.id, identifier)) throw new ConflictError();
      const equipment: InspectionEquipmentRecord = {
        id: this.idFactory(), projectId: project.id, identifier,
        serialNumber: required(input.serialNumber, "serialNumber"),
        methodCapabilities: uniqueRequired(input.methodCapabilities, "methodCapabilities"),
        verificationState: input.verificationState, validFrom: input.validFrom, validTo: input.validTo,
        evidenceFileId: required(input.evidenceFileId, "evidenceFileId"), state: "active", version: 1,
      };
      transaction.insertEquipment(equipment);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "inspection_equipment.registered", objectType: "inspection_equipment", objectId: equipment.id,
        priorState: null, newState: equipment.state, reason: null, changedFields: { identifier, validTo: equipment.validTo.toISOString() },
      }));
      return equipment;
    });
  }

  public submitInspectionPlanRevision(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    input: SubmitInspectionPlanInput,
  ): Promise<InspectionPlanRevisionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "inspection.plan.manage", resource: scope(project.businessScopeOrganizationId, project.id, null),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      const templateCode = required(input.templateCode, "templateCode").toUpperCase();
      const revision = required(input.revision, "revision");
      if (transaction.inspectionPlanByRevision(project.id, templateCode, revision)) throw new ConflictError("The inspection-plan revision already exists.");
      const current = transaction.currentInspectionPlan(project.id, templateCode);
      const plan: InspectionPlanRevisionRecord = {
        id: this.idFactory(), projectId: project.id, templateCode, revision,
        title: required(input.title, "title"), requiredFields: uniqueRequired(input.requiredFields, "requiredFields"),
        applicableTargetTypes: uniqueRequired(input.applicableTargetTypes, "applicableTargetTypes"),
        requiredPerformerQualifications: [...new Set(input.requiredPerformerQualifications.map((item) => required(item, "requiredPerformerQualifications")))],
        requiredAcceptorQualifications: [...new Set(input.requiredAcceptorQualifications.map((item) => required(item, "requiredAcceptorQualifications")))],
        acceptanceReference: required(input.acceptanceReference, "acceptanceReference"),
        minimumAcceptanceAssurance: input.minimumAcceptanceAssurance, state: "under_review",
        supersedesRevisionId: current?.id ?? null, approvedBy: null, version: 1,
        createdAt: now, createdBy: context.userId, updatedAt: now, updatedBy: context.userId,
      };
      transaction.insertInspectionPlan(plan);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "inspection_plan.revised", objectType: "inspection_plan_revision", objectId: plan.id,
        priorState: null, newState: plan.state, reason: null,
        changedFields: { templateCode, revision, supersedesRevisionId: plan.supersedesRevisionId },
      }));
      return plan;
    });
  }

  public approveInspectionPlanRevision(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    planRevisionId: string,
    expectedVersion: number,
  ): Promise<InspectionPlanRevisionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const plan = transaction.inspectionPlanById(planRevisionId);
      if (!plan) throw new NotFoundError();
      const project = transaction.projectById(plan.projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "inspection.plan.approve", resource: scope(project.businessScopeOrganizationId, project.id, plan.id),
        requiredQualifications: ["inspection_plan_authority"], forbiddenActorIds: [plan.createdBy], minimumAssurance: "step-up",
      }, now);
      if (plan.version !== expectedVersion) throw new ConflictError();
      if (plan.state !== "under_review") throw new ValidationError("Only an inspection plan under review can be approved.", ["invalid_inspection_plan_transition"]);
      const current = transaction.currentInspectionPlan(project.id, plan.templateCode);
      if (current && current.id !== plan.id) {
        const superseded: InspectionPlanRevisionRecord = { ...current, state: "superseded", version: current.version + 1, updatedAt: now, updatedBy: context.userId };
        transaction.updateInspectionPlan(superseded, current.version);
        transaction.appendAudit(audit(this.idFactory, now, context, {
          projectId: project.id, action: "inspection_plan.superseded", objectType: "inspection_plan_revision", objectId: current.id,
          priorState: current.state, newState: superseded.state, reason: `superseded_by:${plan.id}`, changedFields: { state: superseded.state },
        }));
      }
      const approved: InspectionPlanRevisionRecord = { ...plan, state: "approved", approvedBy: context.userId,
        version: plan.version + 1, updatedAt: now, updatedBy: context.userId };
      transaction.updateInspectionPlan(approved, expectedVersion);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "inspection_plan.approved", objectType: "inspection_plan_revision", objectId: plan.id,
        priorState: plan.state, newState: approved.state, reason: approved.acceptanceReference,
        changedFields: { approvedBy: context.userId, minimumAcceptanceAssurance: approved.minimumAcceptanceAssurance },
      }));
      return approved;
    });
  }

  public submitInspection(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    input: SubmitInspectionInput,
  ): Promise<InspectionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      const plan = transaction.inspectionPlanById(input.planRevisionId);
      if (!plan || plan.projectId !== project.id) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "inspection.perform", resource: scope(project.businessScopeOrganizationId, project.id, input.targetId),
        requiredQualifications: plan.requiredPerformerQualifications, forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (plan.state !== "approved") throw new ValidationError("Only an approved current inspection plan can be used.", ["inspection_plan_not_approved"]);
      const current = transaction.currentInspectionPlan(project.id, plan.templateCode);
      if (!current || current.id !== plan.id) throw new ValidationError("The inspection plan is superseded.", ["inspection_plan_superseded"]);
      const targetType = required(input.targetType, "targetType");
      if (!plan.applicableTargetTypes.includes(targetType)) throw new ValidationError("The inspection plan does not apply to this target type.", ["inspection_target_not_applicable"]);
      const targetId = required(input.targetId, "targetId");
      if (targetType === "material") {
        const material = transaction.materialById(targetId);
        if (!material || material.projectId !== project.id) throw new NotFoundError();
      }
      if (!Number.isFinite(input.performedAt.getTime()) || input.performedAt.getTime() > now.getTime()) {
        throw new ValidationError("The inspection time is invalid.", ["inspection_time_invalid"]);
      }
      const missingFields = plan.requiredFields.filter((field) => !input.fieldValues[field]?.trim());
      if (missingFields.length > 0) throw new ValidationError("Required inspection fields are missing.", missingFields.map((field) => `inspection_field_missing:${field}`));
      const evidenceFileIds = uniqueRequired(input.evidenceFileIds, "evidenceFileIds");
      const inspection: InspectionRecord = {
        id: this.idFactory(), projectId: project.id, planRevisionId: plan.id, targetType, targetId,
        inspectorUserId: context.userId, performedAt: input.performedAt, fieldValues: structuredClone(input.fieldValues),
        evidenceFileIds, result: input.result, state: "submitted", acceptedBy: null, acceptanceMeaning: null,
        acceptedAssurance: null, rejectionReason: null, version: 1, createdAt: now, updatedAt: now,
      };
      transaction.insertInspection(inspection);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "inspection.submitted", objectType: "inspection_record", objectId: inspection.id,
        priorState: null, newState: inspection.state, reason: plan.acceptanceReference,
        changedFields: { planRevisionId: plan.id, targetType, targetId, result: inspection.result },
      }));
      return inspection;
    });
  }

  public reviewInspection(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    inspectionId: string,
    expectedVersion: number,
    decision: "accept" | "reject",
    meaningOrReason: string,
  ): Promise<InspectionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const inspection = transaction.inspectionById(inspectionId);
      if (!inspection) throw new NotFoundError();
      const plan = transaction.inspectionPlanById(inspection.planRevisionId);
      const project = transaction.projectById(inspection.projectId);
      if (!plan || !project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "inspection.accept", resource: scope(project.businessScopeOrganizationId, project.id, inspection.targetId),
        requiredQualifications: plan.requiredAcceptorQualifications, forbiddenActorIds: [inspection.inspectorUserId],
        minimumAssurance: plan.minimumAcceptanceAssurance,
      }, now);
      if (inspection.version !== expectedVersion) throw new ConflictError();
      if (inspection.state !== "submitted") throw new ValidationError("Only a submitted inspection can be reviewed.", ["invalid_inspection_transition"]);
      if (decision === "accept" && inspection.result !== "pass") {
        throw new ValidationError("A failed inspection cannot be accepted.", ["inspection_result_failed"]);
      }
      const meaning = required(meaningOrReason, decision === "accept" ? "acceptanceMeaning" : "rejectionReason");
      const reviewed: InspectionRecord = { ...inspection, state: decision === "accept" ? "accepted" : "rejected",
        acceptedBy: decision === "accept" ? context.userId : null,
        acceptanceMeaning: decision === "accept" ? meaning : null,
        acceptedAssurance: decision === "accept" ? context.assurance : null,
        rejectionReason: decision === "reject" ? meaning : null,
        version: inspection.version + 1, updatedAt: now };
      transaction.updateInspection(reviewed, expectedVersion);
      if (decision === "accept" && inspection.targetType === "material") {
        const material = transaction.materialById(inspection.targetId);
        if (!material) throw new NotFoundError();
        const updatedMaterial: MaterialItemRecord = { ...material,
          requirements: { ...material.requirements, receivingInspectionAccepted: true },
          version: material.version + 1, updatedAt: now, updatedBy: context.userId };
        transaction.updateMaterial(updatedMaterial, material.version);
      }
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: decision === "accept" ? "inspection.accepted" : "inspection.rejected",
        objectType: "inspection_record", objectId: inspection.id, priorState: inspection.state, newState: reviewed.state,
        reason: meaning, changedFields: decision === "accept"
          ? { acceptedBy: context.userId, assurance: context.assurance, meaning }
          : { rejectedBy: context.userId, reason: meaning },
      }));
      return reviewed;
    });
  }

  public pmiRequirement(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    materialId: string,
  ): Promise<{
    readonly required: boolean;
    readonly governingRule: string | null;
    readonly decisionSource: "project_configuration" | "approved_override";
    readonly projectConfigurationRevisionId: string;
    readonly overrideId: string | null;
    readonly reason: string;
  }> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const { material, project } = this.materialContext(transaction, materialId);
      requireAuthorization(context, assignments, {
        action: "pmi.read", resource: scope(project.businessScopeOrganizationId, project.id, material.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "standard",
      }, now);
      const override = material.requirements.pmiOverrideId
        ? transaction.pmiOverrideById(material.requirements.pmiOverrideId)
        : null;
      if (material.requirements.pmiOverrideId && (!override || override.state !== "active")) {
        throw new ConflictError("The material PMI decision references an invalid override.");
      }
      return {
        required: material.requirements.pmiRequired,
        governingRule: material.requirements.governingPmiRule,
        decisionSource: override ? "approved_override" : "project_configuration",
        projectConfigurationRevisionId: material.requirements.projectConfigurationRevisionId,
        overrideId: override?.id ?? null,
        reason: override?.justification ?? material.requirements.governingPmiRule ?? "PMI is not required by the approved project configuration.",
      };
    });
  }

  public proposePmiOverride(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    materialId: string,
    input: ProposePmiOverrideInput,
  ): Promise<PmiOverrideRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const { material, project } = this.materialContext(transaction, materialId);
      requireAuthorization(context, assignments, {
        action: "pmi.override.manage", resource: scope(project.businessScopeOrganizationId, project.id, material.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (material.state !== "received_pending" || transaction.pmiForMaterial(material.id).length > 0) {
        throw new ValidationError("A PMI override can be proposed only before PMI and material release.", ["pmi_override_too_late"]);
      }
      const configuration = transaction.projectConfigurationById(material.requirements.projectConfigurationRevisionId);
      if (!configuration || configuration.state !== "active") {
        throw new ValidationError("The material project configuration is no longer active.", ["pmi_override_configuration_stale"]);
      }
      const governingRevisionId = required(input.governingDocumentRevisionId, "governingDocumentRevisionId");
      const revision = transaction.revisionById(governingRevisionId);
      const document = revision ? transaction.documentById(revision.documentId) : null;
      if (!revision || revision.state !== "released" || !document || document.projectId !== project.id) {
        throw new ValidationError("A PMI override requires an exact released governing revision in project scope.", ["pmi_override_governing_revision_invalid"]);
      }
      const override: PmiOverrideRecord = {
        id: this.idFactory(), projectId: project.id, materialItemId: material.id,
        projectConfigurationRevisionId: configuration.id, governingDocumentRevisionId: governingRevisionId,
        required: input.required, justification: required(input.justification, "justification"), state: "proposed",
        proposedBy: context.userId, approvedBy: null, approvedAt: null, version: 1, createdAt: now, updatedAt: now,
      };
      transaction.insertPmiOverride(override);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "pmi.override_proposed", objectType: "pmi_override", objectId: override.id,
        priorState: null, newState: override.state, reason: override.justification,
        changedFields: { materialItemId: material.id, required: override.required,
          projectConfigurationRevisionId: configuration.id, governingDocumentRevisionId: governingRevisionId },
      }));
      return override;
    });
  }

  public approvePmiOverride(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    overrideId: string,
    expectedVersion: number,
    expectedMaterialVersion: number,
  ): Promise<PmiOverrideRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const override = transaction.pmiOverrideById(overrideId);
      const material = override ? transaction.materialById(override.materialItemId) : null;
      const project = override ? transaction.projectById(override.projectId) : null;
      if (!override || !material || !project || override.state !== "proposed") throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "pmi.override.approve", resource: scope(project.businessScopeOrganizationId, project.id, material.id),
        requiredQualifications: ["pmi_override_authority"], forbiddenActorIds: [override.proposedBy], minimumAssurance: "step-up",
      }, now);
      if (override.version !== expectedVersion || material.version !== expectedMaterialVersion) throw new ConflictError();
      if (material.state !== "received_pending" || transaction.pmiForMaterial(material.id).length > 0) {
        throw new ValidationError("A PMI override can be approved only before PMI and material release.", ["pmi_override_too_late"]);
      }
      const configuration = transaction.projectConfigurationById(override.projectConfigurationRevisionId);
      if (!configuration || configuration.state !== "active") {
        throw new ValidationError("The proposed override configuration is no longer active.", ["pmi_override_configuration_stale"]);
      }
      const active: PmiOverrideRecord = {
        ...override, state: "active", approvedBy: context.userId, approvedAt: now,
        version: override.version + 1, updatedAt: now,
      };
      const governingRule = `PMI-OVERRIDE:${active.id}`;
      const updatedMaterial: MaterialItemRecord = {
        ...material,
        requirements: {
          ...material.requirements, pmiRequired: active.required, pmiAccepted: !active.required,
          governingPmiRule: active.required ? governingRule : null, pmiOverrideId: active.id,
        },
        version: material.version + 1, updatedAt: now, updatedBy: context.userId,
      };
      transaction.updatePmiOverride(active, expectedVersion);
      transaction.updateMaterial(updatedMaterial, expectedMaterialVersion);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "pmi.override_approved", objectType: "pmi_override", objectId: active.id,
        priorState: override.state, newState: active.state, reason: active.justification,
        changedFields: { materialItemId: material.id, required: active.required, approvedBy: context.userId,
          priorPmiRequired: material.requirements.pmiRequired, governingRule },
      }));
      return active;
    });
  }

  public recordPmi(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    materialId: string,
    input: RecordPmiInput,
  ): Promise<PmiRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const { material, project } = this.materialContext(transaction, materialId);
      requireAuthorization(context, assignments, {
        action: "pmi.perform", resource: scope(project.businessScopeOrganizationId, project.id, material.id),
        requiredQualifications: ["pmi_inspector"], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (!material.requirements.pmiRequired) throw new ValidationError("PMI is not required for this material.", ["pmi_not_required"]);
      if (required(input.governingRule, "governingRule") !== material.requirements.governingPmiRule) {
        throw new ValidationError("The PMI governing rule does not match the project decision.", ["pmi_rule_mismatch"]);
      }
      const equipment = transaction.equipmentById(input.equipmentId);
      if (!equipment || equipment.projectId !== project.id) throw new ValidationError("Inspection equipment is outside project scope.", ["equipment_scope_mismatch"]);
      uniqueRequired(input.evidenceFileIds, "evidenceFileIds");
      if (Object.keys(input.readings).length === 0) throw new ValidationError("PMI readings are required.", ["pmi_readings_missing"]);

      let ncr: NonconformanceRecord | null = null;
      if (input.result === "fail") {
        requireAuthorization(context, assignments, {
          action: "ncr.create", resource: scope(project.businessScopeOrganizationId, project.id, material.id),
          requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
        }, now);
        ncr = this.buildNcr(now, context, project.id, {
          number: required(input.failedNcrNumber ?? "", "failedNcrNumber"), affectedObjectType: "material",
          affectedObjectId: material.id, requirementReference: input.governingRule,
          description: required(input.failureDescription ?? "", "failureDescription"),
          containment: required(input.containment ?? "", "containment"), evidenceFileIds: input.evidenceFileIds,
          responsibleUserId: required(input.failureResponsibleUserId ?? "", "failureResponsibleUserId"),
          turnoverRequired: input.turnoverRequired ?? true,
        });
        if (transaction.ncrByNumber(project.id, ncr.number)) throw new ConflictError("The NCR number already exists.");
      }
      const pmi: PmiRecord = {
        id: this.idFactory(), projectId: project.id, materialItemId: material.id,
        governingRule: input.governingRule.trim(), requiredMaterial: required(input.requiredMaterial, "requiredMaterial"),
        observedMaterial: required(input.observedMaterial, "observedMaterial"), method: required(input.method, "method"),
        componentLocation: required(input.componentLocation, "componentLocation"), equipmentId: equipment.id,
        inspectorUserId: context.userId, inspectedAt: input.inspectedAt,
        readings: structuredClone(input.readings), evidenceFileIds: [...input.evidenceFileIds], notes: required(input.notes, "notes"), result: input.result,
        state: input.result === "fail" ? "failed" : "submitted", ncrId: ncr?.id ?? null, acceptedBy: null, version: 1,
      };
      transaction.insertPmi(pmi);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: input.result === "fail" ? "pmi.failed" : "pmi.submitted",
        objectType: "pmi_record", objectId: pmi.id, priorState: null, newState: pmi.state,
        reason: input.governingRule, changedFields: { materialItemId: material.id, result: pmi.result,
          componentLocation: pmi.componentLocation, equipmentId: equipment.id },
      }));
      if (ncr) {
        const quarantined: MaterialItemRecord = { ...material, state: "quarantined",
          requirements: { ...material.requirements, pmiAccepted: false, openDispositionCount: material.requirements.openDispositionCount + 1 },
          version: material.version + 1, updatedAt: now, updatedBy: context.userId };
        transaction.updateMaterial(quarantined, material.version);
        transaction.insertMaterialMovement(this.materialMovement(now, context, quarantined, {
          movementType: "quarantined", fromState: material.state, toState: quarantined.state,
          fromLocation: material.storageLocation, toLocation: quarantined.storageLocation,
          quantity: quarantined.quantity, workPackageId: null, reason: `ncr:${ncr.id}`,
        }));
        transaction.insertNcr(ncr);
        transaction.appendAudit(audit(this.idFactory, now, context, {
          projectId: project.id, action: "material.quarantined", objectType: "material_item", objectId: material.id,
          priorState: material.state, newState: quarantined.state, reason: `failed_pmi:${pmi.id}`,
          changedFields: { ncrId: ncr.id },
        }));
        transaction.appendAudit(audit(this.idFactory, now, context, {
          projectId: project.id, action: "ncr.created", objectType: "nonconformance", objectId: ncr.id,
          priorState: null, newState: ncr.state, reason: "failed_pmi", changedFields: { affectedObjectId: material.id, pmiId: pmi.id },
        }));
      }
      return pmi;
    });
  }

  public acceptPmi(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    pmiId: string,
    expectedVersion: number,
  ): Promise<PmiRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const pmi = transaction.pmiById(pmiId);
      if (!pmi) throw new NotFoundError();
      const { material, project } = this.materialContext(transaction, pmi.materialItemId);
      const equipment = transaction.equipmentById(pmi.equipmentId);
      if (!equipment) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "pmi.accept", resource: scope(project.businessScopeOrganizationId, project.id, material.id),
        requiredQualifications: ["pmi_acceptor"], forbiddenActorIds: [pmi.inspectorUserId], minimumAssurance: "step-up",
      }, now);
      if (pmi.version !== expectedVersion) throw new ConflictError();
      if (pmi.state !== "submitted") throw new ValidationError("Only submitted PMI can be accepted.", ["invalid_pmi_transition"]);
      const blockers = pmiAcceptanceBlockers(pmi, equipment, material, now);
      if (blockers.length > 0) throw new ValidationError("PMI acceptance checks failed.", blockers);
      const accepted: PmiRecord = { ...pmi, state: "accepted", acceptedBy: context.userId, version: pmi.version + 1 };
      const updatedMaterial: MaterialItemRecord = { ...material,
        requirements: { ...material.requirements, pmiAccepted: true }, version: material.version + 1,
        updatedAt: now, updatedBy: context.userId };
      transaction.updatePmi(accepted, expectedVersion);
      transaction.updateMaterial(updatedMaterial, material.version);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "pmi.accepted", objectType: "pmi_record", objectId: pmi.id,
        priorState: pmi.state, newState: accepted.state, reason: null, changedFields: { acceptedBy: context.userId },
      }));
      return accepted;
    });
  }

  public releaseMaterial(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    materialId: string,
    expectedVersion: number,
  ): Promise<MaterialItemRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const { material, project } = this.materialContext(transaction, materialId);
      requireAuthorization(context, assignments, {
        action: "material.release.approve", resource: scope(project.businessScopeOrganizationId, project.id, material.id),
        requiredQualifications: ["material_release_authority"], forbiddenActorIds: [material.createdBy], minimumAssurance: "step-up",
      }, now);
      if (material.version !== expectedVersion) throw new ConflictError();
      if (material.state !== "received_pending") throw new ValidationError("Material is not pending release.", ["invalid_material_transition"]);
      const blockers = materialReleaseBlockers(material);
      if (blockers.length > 0) throw new ValidationError("Material release checks failed.", blockers);
      const released = { ...material, state: "released" as const, version: material.version + 1,
        updatedAt: now, updatedBy: context.userId };
      transaction.updateMaterial(released, expectedVersion);
      transaction.insertMaterialMovement(this.materialMovement(now, context, released, {
        movementType: "released", fromState: material.state, toState: released.state,
        fromLocation: material.storageLocation, toLocation: released.storageLocation,
        quantity: released.quantity, workPackageId: null, reason: "release_checks_passed",
      }));
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "material.released", objectType: "material_item", objectId: material.id,
        priorState: material.state, newState: released.state, reason: "release_checks_passed", changedFields: { state: released.state },
      }));
      return released;
    });
  }

  public issueMaterial(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    materialId: string,
    expectedVersion: number,
  ): Promise<MaterialItemRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const { material, project } = this.materialContext(transaction, materialId);
      requireAuthorization(context, assignments, {
        action: "material.issue", resource: scope(project.businessScopeOrganizationId, project.id, material.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (material.version !== expectedVersion) throw new ConflictError();
      if (material.state !== "released" && material.state !== "returned") {
        throw new ValidationError("Only released or returned material can be issued.", ["material_not_released"]);
      }
      const issued = { ...material, state: "issued" as const, version: material.version + 1,
        updatedAt: now, updatedBy: context.userId };
      transaction.updateMaterial(issued, expectedVersion);
      transaction.insertMaterialMovement(this.materialMovement(now, context, issued, {
        movementType: "issued", fromState: material.state, toState: issued.state,
        fromLocation: material.storageLocation, toLocation: issued.storageLocation,
        quantity: issued.quantity, workPackageId: null, reason: "issued_for_use",
      }));
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "material.issued", objectType: "material_item", objectId: material.id,
        priorState: material.state, newState: issued.state, reason: null, changedFields: { state: issued.state },
      }));
      return issued;
    });
  }

  public returnMaterial(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    materialId: string,
    expectedVersion: number,
    input: MoveMaterialInput,
  ): Promise<MaterialItemRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const { material, project } = this.materialContext(transaction, materialId);
      requireAuthorization(context, assignments, {
        action: "material.return", resource: scope(project.businessScopeOrganizationId, project.id, material.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (material.version !== expectedVersion) throw new ConflictError();
      if (material.state !== "issued") throw new ValidationError("Only issued material can be returned.", ["material_not_issued"]);
      const returned: MaterialItemRecord = {
        ...material, state: "returned", storageLocation: required(input.toLocation, "toLocation"),
        version: material.version + 1, updatedAt: now, updatedBy: context.userId,
      };
      const reason = required(input.reason, "reason");
      transaction.updateMaterial(returned, expectedVersion);
      transaction.insertMaterialMovement(this.materialMovement(now, context, returned, {
        movementType: "returned", fromState: material.state, toState: returned.state,
        fromLocation: material.storageLocation, toLocation: returned.storageLocation,
        quantity: returned.quantity, workPackageId: null, reason,
      }));
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "material.returned", objectType: "material_item", objectId: material.id,
        priorState: material.state, newState: returned.state, reason,
        changedFields: { storageLocation: { from: material.storageLocation, to: returned.storageLocation } },
      }));
      return returned;
    });
  }

  public moveMaterial(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    materialId: string,
    expectedVersion: number,
    input: MoveMaterialInput,
  ): Promise<MaterialItemRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const { material, project } = this.materialContext(transaction, materialId);
      requireAuthorization(context, assignments, {
        action: "material.move", resource: scope(project.businessScopeOrganizationId, project.id, material.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (material.version !== expectedVersion) throw new ConflictError();
      if (!["received_pending", "released", "returned"].includes(material.state)) {
        throw new ValidationError("Material cannot be relocated in its current state.", ["invalid_material_transition"]);
      }
      const toLocation = required(input.toLocation, "toLocation");
      if (toLocation === material.storageLocation) throw new ValidationError("A new storage location is required.", ["location_unchanged"]);
      const reason = required(input.reason, "reason");
      const moved: MaterialItemRecord = {
        ...material, storageLocation: toLocation, version: material.version + 1, updatedAt: now, updatedBy: context.userId,
      };
      transaction.updateMaterial(moved, expectedVersion);
      transaction.insertMaterialMovement(this.materialMovement(now, context, moved, {
        movementType: "relocated", fromState: material.state, toState: moved.state,
        fromLocation: material.storageLocation, toLocation: moved.storageLocation,
        quantity: moved.quantity, workPackageId: null, reason,
      }));
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "material.relocated", objectType: "material_item", objectId: material.id,
        priorState: material.state, newState: moved.state, reason,
        changedFields: { storageLocation: { from: material.storageLocation, to: moved.storageLocation } },
      }));
      return moved;
    });
  }

  public materialMovements(
    context: AccessContext, assignments: readonly RoleAssignment[], materialId: string,
  ): Promise<readonly MaterialMovementRecord[]> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const { material, project } = this.materialContext(transaction, materialId);
      requireAuthorization(context, assignments, {
        action: "material.read", resource: scope(project.businessScopeOrganizationId, project.id, material.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      return transaction.materialMovementsForItem(material.id);
    });
  }

  public createNcr(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    input: CreateNcrInput,
  ): Promise<NonconformanceRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "ncr.create", resource: scope(project.businessScopeOrganizationId, project.id, input.affectedObjectId),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      const ncr = this.buildNcr(now, context, project.id, input);
      if (transaction.ncrByNumber(project.id, ncr.number)) throw new ConflictError("The NCR number already exists.");
      if (input.affectedObjectType === "material") {
        const material = transaction.materialById(input.affectedObjectId);
        if (!material || material.projectId !== project.id) throw new NotFoundError();
        const quarantined: MaterialItemRecord = { ...material, state: "quarantined",
          requirements: { ...material.requirements, openDispositionCount: material.requirements.openDispositionCount + 1 },
          version: material.version + 1, updatedAt: now, updatedBy: context.userId };
        transaction.updateMaterial(quarantined, material.version);
        transaction.insertMaterialMovement(this.materialMovement(now, context, quarantined, {
          movementType: "quarantined", fromState: material.state, toState: quarantined.state,
          fromLocation: material.storageLocation, toLocation: quarantined.storageLocation,
          quantity: quarantined.quantity, workPackageId: null, reason: `ncr:${ncr.id}`,
        }));
        transaction.appendAudit(audit(this.idFactory, now, context, {
          projectId: project.id, action: "material.quarantined", objectType: "material_item", objectId: material.id,
          priorState: material.state, newState: quarantined.state, reason: `ncr:${ncr.id}`,
          changedFields: { openDispositionCount: quarantined.requirements.openDispositionCount },
        }));
      }
      transaction.insertNcr(ncr);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "ncr.created", objectType: "nonconformance", objectId: ncr.id,
        priorState: null, newState: ncr.state, reason: null, changedFields: { affectedObjectId: ncr.affectedObjectId, containment: ncr.containment },
      }));
      return ncr;
    });
  }

  public proposeNcrDisposition(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    ncrId: string,
    expectedVersion: number,
    input: ProposeNcrDispositionInput,
  ): Promise<NonconformanceRecord> {
    return this.transitionNcr(context, assignments, ncrId, expectedVersion, "ncr.disposition.propose", "mfa", (ncr, now) => {
      if (ncr.state !== "open") throw new ValidationError("Only an open NCR can receive a disposition.", ["invalid_ncr_transition"]);
      return { ...ncr, disposition: required(input.disposition, "disposition"),
        correctiveAction: required(input.correctiveAction, "correctiveAction"), dispositionProposedBy: context.userId,
        state: "disposition_proposed" as const, version: ncr.version + 1, updatedAt: now, updatedBy: context.userId };
    });
  }

  public approveNcrDisposition(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    ncrId: string,
    expectedVersion: number,
  ): Promise<NonconformanceRecord> {
    return this.transitionNcr(context, assignments, ncrId, expectedVersion, "ncr.disposition.approve", "step-up", (ncr, now) => {
      if (ncr.state !== "disposition_proposed") throw new ValidationError("The NCR disposition is not awaiting approval.", ["invalid_ncr_transition"]);
      return { ...ncr, dispositionApprovedBy: context.userId, state: "disposition_approved" as const,
        version: ncr.version + 1, updatedAt: now, updatedBy: context.userId };
    }, ["ncr_disposition_authority"], (ncr) => ncr.dispositionProposedBy ? [ncr.dispositionProposedBy] : []);
  }

  public recordNcrReinspection(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    ncrId: string,
    expectedVersion: number,
    evidenceFileId: string,
  ): Promise<NonconformanceRecord> {
    return this.transitionNcr(context, assignments, ncrId, expectedVersion, "ncr.reinspect", "mfa", (ncr, now) => {
      if (ncr.state !== "disposition_approved") throw new ValidationError("Approved disposition is required before reinspection.", ["invalid_ncr_transition"]);
      return { ...ncr, reinspectionEvidenceFileId: required(evidenceFileId, "evidenceFileId"),
        state: "reinspection_complete" as const, version: ncr.version + 1, updatedAt: now, updatedBy: context.userId };
    }, ["quality_inspector"]);
  }

  public closeNcr(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    ncrId: string,
    expectedVersion: number,
  ): Promise<NonconformanceRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const ncr = transaction.ncrById(ncrId);
      if (!ncr) throw new NotFoundError();
      const project = transaction.projectById(ncr.projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "ncr.close", resource: scope(project.businessScopeOrganizationId, project.id, ncr.id),
        requiredQualifications: ["ncr_close_authority"], forbiddenActorIds: ncr.dispositionProposedBy ? [ncr.dispositionProposedBy] : [], minimumAssurance: "step-up",
      }, now);
      if (ncr.version !== expectedVersion) throw new ConflictError();
      if (ncr.state !== "reinspection_complete") throw new ValidationError("Reinspection must be complete before closure.", ["invalid_ncr_transition"]);
      const blockers = ncrClosureBlockers(ncr);
      if (blockers.length > 0) throw new ValidationError("NCR closure checks failed.", blockers);
      const closed: NonconformanceRecord = { ...ncr, state: "closed", version: ncr.version + 1, updatedAt: now, updatedBy: context.userId };
      transaction.updateNcr(closed, expectedVersion);
      if (ncr.affectedObjectType === "material") {
        const material = transaction.materialById(ncr.affectedObjectId);
        if (!material) throw new NotFoundError();
        const openDispositionCount = Math.max(0, material.requirements.openDispositionCount - 1);
        const releasedFromHold: MaterialItemRecord = { ...material,
          state: openDispositionCount === 0 && material.state === "quarantined" ? "received_pending" : material.state,
          requirements: { ...material.requirements, openDispositionCount }, version: material.version + 1,
          updatedAt: now, updatedBy: context.userId };
        transaction.updateMaterial(releasedFromHold, material.version);
        transaction.appendAudit(audit(this.idFactory, now, context, {
          projectId: project.id, action: "material.hold_released", objectType: "material_item", objectId: material.id,
          priorState: material.state, newState: releasedFromHold.state, reason: `ncr_closed:${closed.id}`,
          changedFields: { openDispositionCount },
        }));
      }
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "ncr.closed", objectType: "nonconformance", objectId: ncr.id,
        priorState: ncr.state, newState: closed.state, reason: "closure_checks_passed", changedFields: { state: closed.state },
      }));
      return closed;
    });
  }

  public createPunch(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    input: CreatePunchInput,
  ): Promise<PunchItemRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "punch.create", resource: scope(project.businessScopeOrganizationId, project.id, input.assetId),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      const number = required(input.number, "number").toUpperCase();
      if (transaction.punchByNumber(project.id, number)) throw new ConflictError("The punch number already exists.");
      if (![input.systemId, input.areaId, input.workPackageId, input.assetId].some((value) => value?.trim())) {
        throw new ValidationError("Punch must link to a system, area, work package, or asset.", ["punch_scope_required"]);
      }
      if (input.targetAt && !Number.isFinite(input.targetAt.getTime())) throw new ValidationError("Punch target time is invalid.", ["punch_target_invalid"]);
      const punch: PunchItemRecord = {
        id: this.idFactory(), projectId: project.id, number, type: required(input.type, "type"), priority: input.priority,
        systemId: input.systemId?.trim() || null, areaId: input.areaId?.trim() || null,
        workPackageId: input.workPackageId?.trim() || null, assetId: input.assetId?.trim() || null,
        description: required(input.description, "description"), ownerUserId: required(input.ownerUserId, "ownerUserId"),
        targetAt: input.targetAt, evidenceFileIds: [], state: "open", verifiedBy: null,
        verificationEvidenceFileId: null, closureMeaning: null, turnoverRequired: input.turnoverRequired,
        version: 1, createdAt: now, createdBy: context.userId, updatedAt: now, updatedBy: context.userId,
      };
      transaction.insertPunch(punch);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "punch.created", objectType: "punch_item", objectId: punch.id,
        priorState: null, newState: punch.state, reason: punch.priority,
        changedFields: { number, ownerUserId: punch.ownerUserId, systemId: punch.systemId, areaId: punch.areaId, workPackageId: punch.workPackageId, assetId: punch.assetId },
      }));
      return punch;
    });
  }

  public updateOwnedPunch(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    punchId: string,
    expectedVersion: number,
    evidenceFileIds: readonly string[],
    readyForVerification: boolean,
  ): Promise<PunchItemRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const punch = transaction.punchById(punchId);
      if (!punch) throw new NotFoundError();
      const project = transaction.projectById(punch.projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "punch.update.owned", resource: scope(project.businessScopeOrganizationId, project.id, punch.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (context.userId !== punch.ownerUserId) throw new AuthorizationDeniedError("scope_denied");
      if (punch.version !== expectedVersion) throw new ConflictError();
      if (punch.state !== "open") throw new ValidationError("Only an open punch can be updated by its owner.", ["invalid_punch_transition"]);
      const evidence = uniqueRequired(evidenceFileIds, "evidenceFileIds");
      const updated: PunchItemRecord = { ...punch, evidenceFileIds: evidence,
        state: readyForVerification ? "ready_for_verification" : "open", version: punch.version + 1,
        updatedAt: now, updatedBy: context.userId };
      transaction.updatePunch(updated, expectedVersion);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: readyForVerification ? "punch.ready_for_verification" : "punch.evidence_updated",
        objectType: "punch_item", objectId: punch.id, priorState: punch.state, newState: updated.state,
        reason: null, changedFields: { evidenceFileIds: evidence },
      }));
      return updated;
    });
  }

  public verifyPunch(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    punchId: string,
    expectedVersion: number,
    verificationEvidenceFileId: string,
  ): Promise<PunchItemRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const punch = transaction.punchById(punchId);
      if (!punch) throw new NotFoundError();
      const project = transaction.projectById(punch.projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "punch.verify", resource: scope(project.businessScopeOrganizationId, project.id, punch.id),
        requiredQualifications: ["punch_verifier"], forbiddenActorIds: [punch.ownerUserId, punch.createdBy], minimumAssurance: "step-up",
      }, now);
      if (punch.version !== expectedVersion) throw new ConflictError();
      if (punch.state !== "ready_for_verification") throw new ValidationError("Punch is not ready for verification.", ["invalid_punch_transition"]);
      const verified: PunchItemRecord = { ...punch, state: "verified", verifiedBy: context.userId,
        verificationEvidenceFileId: required(verificationEvidenceFileId, "verificationEvidenceFileId"),
        version: punch.version + 1, updatedAt: now, updatedBy: context.userId };
      transaction.updatePunch(verified, expectedVersion);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "punch.verified", objectType: "punch_item", objectId: punch.id,
        priorState: punch.state, newState: verified.state, reason: null,
        changedFields: { verifiedBy: context.userId, verificationEvidenceFileId: verified.verificationEvidenceFileId },
      }));
      return verified;
    });
  }

  public closePunch(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    punchId: string,
    expectedVersion: number,
    closureMeaning: string,
  ): Promise<PunchItemRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const punch = transaction.punchById(punchId);
      if (!punch) throw new NotFoundError();
      const project = transaction.projectById(punch.projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "punch.close", resource: scope(project.businessScopeOrganizationId, project.id, punch.id),
        requiredQualifications: ["completion_authority"], forbiddenActorIds: [punch.ownerUserId], minimumAssurance: "step-up",
      }, now);
      if (punch.version !== expectedVersion) throw new ConflictError();
      if (punch.state !== "verified" || !punch.verificationEvidenceFileId || !punch.verifiedBy) {
        throw new ValidationError("Independent verification evidence is required before punch closure.", ["punch_verification_incomplete"]);
      }
      const closed: PunchItemRecord = { ...punch, state: "closed", closureMeaning: required(closureMeaning, "closureMeaning"),
        version: punch.version + 1, updatedAt: now, updatedBy: context.userId };
      transaction.updatePunch(closed, expectedVersion);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "punch.closed", objectType: "punch_item", objectId: punch.id,
        priorState: punch.state, newState: closed.state, reason: closed.closureMeaning,
        changedFields: { closedBy: context.userId },
      }));
      return closed;
    });
  }

  public generateTurnover(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    input: GenerateTurnoverInput,
  ): Promise<TurnoverPackageVersionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(input.projectId);
      if (!project) throw new NotFoundError();
      const configuredPackage = transaction.turnoverPackageById(input.packageId);
      if (!configuredPackage || configuredPackage.projectId !== project.id) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "turnover.generate", resource: scope(project.businessScopeOrganizationId, project.id, input.packageId),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "step-up",
      }, now);
      const readiness = this.calculateTurnoverReadiness(transaction, configuredPackage);
      const blockers = readiness.filter((item) => item.status !== "accepted" && item.status !== "not_applicable");
      if (blockers.length > 0) {
        throw new ValidationError("Turnover requirements are incomplete.", blockers.map((item) => `turnover_requirement:${item.requirementCode}:${item.status}`));
      }
      const materialIds = uniqueRequired(configuredPackage.materialItemIds, "materialItemIds");
      const manifest: TurnoverManifestEntry[] = [];
      for (const punch of transaction.punchForProject(project.id).filter((candidate) => candidate.turnoverRequired)) {
        if (punch.state !== "closed" && punch.state !== "transferred") {
          throw new ValidationError("A turnover-required punch remains unresolved.", ["turnover_punch_open"]);
        }
        manifest.push(turnoverManifestEntry(
          "punch", punch.id, punch.version, punch.state, "turnover_required_resolved_punch", punch,
        ));
      }
      for (const materialId of materialIds) {
        const material = transaction.materialById(materialId);
        if (!material || material.projectId !== project.id) throw new NotFoundError();
        if (material.state !== "released" && material.state !== "issued") {
          throw new ValidationError("Turnover contains material that is not released.", ["turnover_material_not_released"]);
        }
        const materialSnapshot = { id: material.id, version: material.version, state: material.state, identifier: material.identifier,
          heatLot: material.heatLot, mtrDocumentRevisionId: material.mtrDocumentRevisionId };
        manifest.push(turnoverManifestEntry(
          "material", material.id, material.version, material.state, "released_material_traceability", materialSnapshot,
        ));
        if (material.mtrDocumentRevisionId) {
          const revision = transaction.revisionById(material.mtrDocumentRevisionId);
          if (!revision || revision.state !== "released") throw new ValidationError("Turnover MTR is not current and released.", ["turnover_mtr_not_released"]);
          manifest.push(turnoverManifestEntry(
            "document_revision", revision.id, revision.version, revision.state, "material_certification", revision,
          ));
        }
        if (material.requirements.pmiRequired) {
          const pmi = this.acceptedPmiForMaterial(transaction, material);
          if (!pmi) throw new ValidationError("Accepted PMI is missing from turnover.", ["turnover_pmi_missing"]);
          manifest.push(turnoverManifestEntry(
            "pmi", pmi.id, pmi.version, pmi.state, "accepted_pmi", pmi,
          ));
        }
        for (const ncr of transaction.ncrForObject(material.id).filter((candidate) => candidate.turnoverRequired)) {
          if (ncr.state !== "closed") throw new ValidationError("A turnover-required NCR remains open.", ["turnover_ncr_open"]);
          manifest.push(turnoverManifestEntry(
            "ncr", ncr.id, ncr.version, ncr.state, "contract_required_closed_ncr", ncr,
          ));
        }
      }
      const uniqueManifest = new Map<string, TurnoverManifestEntry>();
      for (const entry of manifest) {
        const key = `${entry.sourceType}:${entry.sourceId}`;
        const prior = uniqueManifest.get(key);
        if (prior && prior.canonicalSha256 !== entry.canonicalSha256) {
          throw new ConflictError("The same turnover source produced inconsistent snapshots.");
        }
        uniqueManifest.set(key, entry);
      }
      const finalManifest = [...uniqueManifest.values()]
        .sort((left, right) => `${left.sourceType}:${left.sourceId}`.localeCompare(`${right.sourceType}:${right.sourceId}`));
      const priorVersions = transaction.turnoverVersions(configuredPackage.id);
      const version: TurnoverPackageVersionRecord = {
        id: this.idFactory(), packageId: configuredPackage.id, projectId: project.id,
        versionNumber: priorVersions.length + 1, recipientScope: configuredPackage.recipientScope,
        generatedAt: now, generatedBy: context.userId, manifest: finalManifest, manifestSha256: canonicalHash(finalManifest),
      };
      transaction.insertTurnoverVersion(version);
      const renderPayload = { turnoverPackageVersionId: version.id };
      transaction.insertIntegrationMessage({
        id: this.idFactory(), direction: "outbox", projectId: project.id,
        interfaceCode: "turnover-render.worker", idempotencyKey: version.id, externalId: version.id,
        schemaVersion: 1, payload: renderPayload, payloadSha256: canonicalHash(renderPayload),
        correlationId: context.correlationId, state: "pending", attemptCount: 0, lastError: null,
        createdAt: now, processedAt: null, version: 1,
      });
      transaction.updateTurnoverPackage({ ...configuredPackage, state: "generated", version: configuredPackage.version + 1,
        updatedAt: now, updatedBy: context.userId }, configuredPackage.version);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: version.versionNumber === 1 ? "turnover.generated" : "turnover.regenerated",
        objectType: "turnover_package_version", objectId: version.id, priorState: null, newState: "immutable",
        reason: version.recipientScope, changedFields: { packageId: version.packageId, versionNumber: version.versionNumber, manifestSha256: version.manifestSha256 },
      }));
      return version;
    });
  }

  public createCompletionBoundary(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    input: ConfigureCompletionBoundaryInput,
  ): Promise<CompletionBoundaryRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "turnover.configure", resource: scope(project.businessScopeOrganizationId, project.id, null),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      const code = required(input.code, "code").toUpperCase();
      if (transaction.completionBoundaryByCode(project.id, code)) throw new ConflictError();
      const boundary: CompletionBoundaryRecord = {
        id: this.idFactory(), projectId: project.id, boundaryType: input.boundaryType, code,
        name: required(input.name, "name"), state: "active", version: 1, createdAt: now, createdBy: context.userId,
      };
      transaction.insertCompletionBoundary(boundary);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "turnover_boundary.created", objectType: "completion_boundary", objectId: boundary.id,
        priorState: null, newState: boundary.state, reason: boundary.boundaryType, changedFields: { code, name: boundary.name },
      }));
      return boundary;
    });
  }

  public configureTurnoverRequirement(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    boundaryId: string,
    input: ConfigureTurnoverRequirementInput,
  ): Promise<TurnoverRequirementRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const boundary = transaction.completionBoundaryById(boundaryId);
      if (!boundary || boundary.state !== "active") throw new NotFoundError();
      const project = transaction.projectById(boundary.projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "turnover.configure", resource: scope(project.businessScopeOrganizationId, project.id, boundary.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      const code = required(input.code, "code").toUpperCase();
      if (transaction.turnoverRequirementByCode(boundary.id, code)) throw new ConflictError();
      const requirement: TurnoverRequirementRecord = {
        id: this.idFactory(), projectId: project.id, completionBoundaryId: boundary.id, code,
        recordClass: input.recordClass, required: input.required, notApplicableAllowed: input.notApplicableAllowed,
        acceptanceAuthority: required(input.acceptanceAuthority, "acceptanceAuthority"), state: "active", version: 1,
        createdAt: now, createdBy: context.userId,
      };
      transaction.insertTurnoverRequirement(requirement);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "turnover_requirement.changed", objectType: "turnover_requirement", objectId: requirement.id,
        priorState: null, newState: requirement.state, reason: requirement.recordClass,
        changedFields: { code, required: requirement.required, notApplicableAllowed: requirement.notApplicableAllowed },
      }));
      return requirement;
    });
  }

  public createTurnoverPackage(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    boundaryId: string,
    input: CreateTurnoverPackageInput,
  ): Promise<TurnoverPackageRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const boundary = transaction.completionBoundaryById(boundaryId);
      if (!boundary || boundary.state !== "active") throw new NotFoundError();
      const project = transaction.projectById(boundary.projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "turnover.package.create", resource: scope(project.businessScopeOrganizationId, project.id, boundary.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      const requirements = transaction.turnoverRequirementsForBoundary(boundary.id);
      if (requirements.length === 0) throw new ValidationError("At least one active turnover requirement is required.", ["turnover_requirements_missing"]);
      const materialItemIds = uniqueRequired(input.materialItemIds, "materialItemIds");
      for (const materialId of materialItemIds) {
        const material = transaction.materialById(materialId);
        if (!material || material.projectId !== project.id) throw new NotFoundError();
      }
      const code = required(input.code, "code").toUpperCase();
      if (transaction.turnoverPackageByCode(project.id, code)) throw new ConflictError();
      const turnoverPackage: TurnoverPackageRecord = {
        id: this.idFactory(), projectId: project.id, completionBoundaryId: boundary.id, code,
        recipientScope: required(input.recipientScope, "recipientScope"), materialItemIds, state: "draft", version: 1,
        createdAt: now, createdBy: context.userId, updatedAt: now, updatedBy: context.userId,
      };
      transaction.insertTurnoverPackage(turnoverPackage);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "turnover_package.created", objectType: "turnover_package", objectId: turnoverPackage.id,
        priorState: null, newState: turnoverPackage.state, reason: turnoverPackage.recipientScope,
        changedFields: { code, completionBoundaryId: boundary.id, materialItemIds },
      }));
      return turnoverPackage;
    });
  }

  public turnoverReadiness(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    packageId: string,
  ): Promise<readonly TurnoverRequirementStatusRecord[]> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const turnoverPackage = transaction.turnoverPackageById(packageId);
      if (!turnoverPackage) throw new NotFoundError();
      const project = transaction.projectById(turnoverPackage.projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "turnover.read", resource: scope(project.businessScopeOrganizationId, project.id, turnoverPackage.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      const readiness = this.calculateTurnoverReadiness(transaction, turnoverPackage);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "turnover.readiness_generated", objectType: "turnover_package", objectId: turnoverPackage.id,
        priorState: turnoverPackage.state, newState: turnoverPackage.state, reason: null,
        changedFields: { statuses: readiness.map((item) => ({ code: item.requirementCode, status: item.status })) },
      }));
      return readiness;
    });
  }

  public createSubcontractorProfile(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    input: CreateSubcontractorProfileInput,
  ): Promise<SubcontractorProfileRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const organizationId = required(input.organizationId, "organizationId");
      requireAuthorization(context, assignments, {
        action: "subcontractor.profile.manage", resource: scope(organizationId, null, null),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (transaction.subcontractorProfileByOrganization(organizationId)) throw new ConflictError();
      const profile: SubcontractorProfileRecord = {
        id: this.idFactory(), organizationId, legalTaxReference: required(input.legalTaxReference, "legalTaxReference"),
        declaredScopes: uniqueRequired(input.declaredScopes, "declaredScopes"), approvedScopes: [],
        geography: uniqueRequired(input.geography, "geography"), laborModel: required(input.laborModel, "laborModel"),
        lowerTierDisclosureRequired: input.lowerTierDisclosureRequired, qualificationState: "candidate",
        qualificationValidTo: null, version: 1, createdAt: now, createdBy: context.userId,
        updatedAt: now, updatedBy: context.userId,
      };
      transaction.insertSubcontractorProfile(profile);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: null, action: "subcontractor.profile_changed", objectType: "subcontractor_profile", objectId: profile.id,
        priorState: null, newState: profile.qualificationState, reason: null,
        changedFields: { organizationId, declaredScopes: profile.declaredScopes, lowerTierDisclosureRequired: profile.lowerTierDisclosureRequired },
      }));
      return profile;
    });
  }

  public verifySubcontractorQualification(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    profileId: string,
    expectedProfileVersion: number,
    input: VerifySubcontractorQualificationInput,
  ): Promise<SubcontractorQualificationRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const profile = transaction.subcontractorProfileById(profileId);
      if (!profile || profile.qualificationState === "inactive") throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "subcontractor.qualify", resource: scope(profile.organizationId, null, profile.id),
        requiredQualifications: ["subcontractor_qualification_authority"], forbiddenActorIds: [profile.createdBy], minimumAssurance: "step-up",
      }, now);
      if (profile.version !== expectedProfileVersion) throw new ConflictError();
      if (input.effectiveAt.getTime() > now.getTime() || input.expiresAt.getTime() <= now.getTime()
        || input.expiresAt.getTime() <= input.effectiveAt.getTime()) {
        throw new ValidationError("Qualification validity does not include the verification time.", ["qualification_validity_invalid"]);
      }
      const approvedScopes = uniqueRequired(input.approvedScopes, "approvedScopes");
      if (approvedScopes.some((candidate) => !profile.declaredScopes.includes(candidate))) {
        throw new ValidationError("Approved qualification scope was not declared by the subcontractor.", ["qualification_scope_not_declared"]);
      }
      const qualification: SubcontractorQualificationRecord = {
        id: this.idFactory(), profileId: profile.id, organizationId: profile.organizationId, category: input.category,
        code: required(input.code, "code").toUpperCase(), approvedScopes,
        issuer: required(input.issuer, "issuer"), effectiveAt: input.effectiveAt, expiresAt: input.expiresAt,
        evidenceFileId: required(input.evidenceFileId, "evidenceFileId"), exceptionReason: input.exceptionReason,
        state: "verified", verifiedAt: now, verifiedBy: context.userId, version: 1,
      };
      transaction.insertSubcontractorQualification(qualification);
      const combinedScopes = [...new Set([...profile.approvedScopes, ...approvedScopes])].sort();
      const qualificationValidTo = profile.qualificationValidTo && profile.qualificationValidTo.getTime() > input.expiresAt.getTime()
        ? profile.qualificationValidTo : input.expiresAt;
      transaction.updateSubcontractorProfile({
        ...profile, approvedScopes: combinedScopes, qualificationState: "qualified", qualificationValidTo,
        version: profile.version + 1, updatedAt: now, updatedBy: context.userId,
      }, expectedProfileVersion);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: null, action: "qualification.verified", objectType: "subcontractor_qualification", objectId: qualification.id,
        priorState: null, newState: qualification.state, reason: qualification.category,
        changedFields: { profileId, code: qualification.code, approvedScopes, expiresAt: qualification.expiresAt.toISOString() },
      }));
      return qualification;
    });
  }

  public assignSubcontractorToProject(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    profileId: string,
    input: AssignSubcontractorInput,
  ): Promise<SubcontractorProjectAssignmentRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      const profile = transaction.subcontractorProfileById(profileId);
      if (!project || !profile) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "subcontractor.assign", resource: scope(project.businessScopeOrganizationId, project.id, profile.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      const approvedScopeCode = required(input.approvedScopeCode, "approvedScopeCode");
      if (profile.qualificationState !== "qualified" || !profile.qualificationValidTo
        || profile.qualificationValidTo.getTime() <= now.getTime() || !profile.approvedScopes.includes(approvedScopeCode)) {
        throw new ValidationError("The subcontractor is not currently qualified for the assigned scope.", ["subcontractor_scope_not_qualified"]);
      }
      const assignment: SubcontractorProjectAssignmentRecord = {
        id: this.idFactory(), projectId: project.id, profileId: profile.id, organizationId: profile.organizationId,
        approvedScopeCode, workPackageIds: uniqueRequired(input.workPackageIds, "workPackageIds"),
        authorizationReference: required(input.authorizationReference, "authorizationReference"),
        mobilizationState: "pending", mobilizedAt: null, mobilizedBy: null, version: 1,
        createdAt: now, createdBy: context.userId, updatedAt: now, updatedBy: context.userId,
      };
      transaction.insertSubcontractorAssignment(assignment);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "subcontractor.assigned", objectType: "subcontractor_project_assignment", objectId: assignment.id,
        priorState: null, newState: assignment.mobilizationState, reason: assignment.authorizationReference,
        changedFields: { organizationId: assignment.organizationId, approvedScopeCode, workPackageIds: assignment.workPackageIds },
      }));
      return assignment;
    });
  }

  public configureMobilizationRequirement(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    assignmentId: string,
    input: ConfigureMobilizationRequirementInput,
  ): Promise<MobilizationRequirementRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const projectAssignment = transaction.subcontractorAssignmentById(assignmentId);
      if (!projectAssignment || projectAssignment.mobilizationState !== "pending") throw new NotFoundError();
      const project = transaction.projectById(projectAssignment.projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "mobilization.configure", resource: scope(project.businessScopeOrganizationId, project.id, projectAssignment.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      const code = required(input.code, "code").toUpperCase();
      if (transaction.mobilizationRequirementByCode(projectAssignment.id, code)) throw new ConflictError();
      const requirement: MobilizationRequirementRecord = {
        id: this.idFactory(), projectId: project.id, assignmentId: projectAssignment.id, code,
        category: input.category, title: required(input.title, "title"), required: input.required,
        qualificationId: null, evidenceFileId: null, state: "missing", submittedBy: null,
        reviewedBy: null, reviewReason: null, version: 1, createdAt: now, createdBy: context.userId,
        updatedAt: now, updatedBy: context.userId,
      };
      transaction.insertMobilizationRequirement(requirement);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "mobilization.requirement_configured", objectType: "mobilization_requirement", objectId: requirement.id,
        priorState: null, newState: requirement.state, reason: requirement.category,
        changedFields: { code, required: requirement.required },
      }));
      return requirement;
    });
  }

  public submitMobilizationEvidence(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    requirementId: string,
    expectedVersion: number,
    input: SubmitMobilizationEvidenceInput,
  ): Promise<MobilizationRequirementRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const requirement = transaction.mobilizationRequirementById(requirementId);
      if (!requirement) throw new NotFoundError();
      const projectAssignment = transaction.subcontractorAssignmentById(requirement.assignmentId);
      if (!projectAssignment || projectAssignment.mobilizationState !== "pending") throw new NotFoundError();
      if (context.actingOrganizationId !== projectAssignment.organizationId) {
        throw new AuthorizationDeniedError("scope_denied");
      }
      requireAuthorization(context, assignments, {
        action: "mobilization.submit",
        resource: { organizationId: projectAssignment.organizationId, projectId: projectAssignment.projectId, workPackageId: null, objectId: requirement.id },
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (requirement.version !== expectedVersion) throw new ConflictError();
      if (!input.qualificationId && !input.evidenceFileId) {
        throw new ValidationError("Mobilization evidence or a verified qualification is required.", ["mobilization_evidence_missing"]);
      }
      if (input.qualificationId) {
        const qualification = transaction.subcontractorQualificationById(input.qualificationId);
        if (!qualification || qualification.profileId !== projectAssignment.profileId || qualification.state !== "verified") {
          throw new ValidationError("The qualification is not valid for this subcontractor.", ["mobilization_qualification_invalid"]);
        }
      }
      const submitted: MobilizationRequirementRecord = {
        ...requirement, qualificationId: input.qualificationId,
        evidenceFileId: input.evidenceFileId ? required(input.evidenceFileId, "evidenceFileId") : null,
        state: "submitted", submittedBy: context.userId, reviewedBy: null, reviewReason: null,
        version: requirement.version + 1, updatedAt: now, updatedBy: context.userId,
      };
      transaction.updateMobilizationRequirement(submitted, expectedVersion);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: requirement.projectId, action: "mobilization.evidence_submitted", objectType: "mobilization_requirement", objectId: requirement.id,
        priorState: requirement.state, newState: submitted.state, reason: requirement.category,
        changedFields: { qualificationId: submitted.qualificationId, evidenceFileId: submitted.evidenceFileId },
      }));
      return submitted;
    });
  }

  public reviewMobilizationRequirement(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    requirementId: string,
    expectedVersion: number,
    decision: "accept" | "reject",
    reason: string,
  ): Promise<MobilizationRequirementRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const requirement = transaction.mobilizationRequirementById(requirementId);
      if (!requirement || requirement.state !== "submitted") throw new NotFoundError();
      const projectAssignment = transaction.subcontractorAssignmentById(requirement.assignmentId);
      const project = projectAssignment ? transaction.projectById(projectAssignment.projectId) : null;
      if (!projectAssignment || !project) throw new NotFoundError();
      if (context.actingOrganizationId !== project.businessScopeOrganizationId) throw new AuthorizationDeniedError("scope_denied");
      requireAuthorization(context, assignments, {
        action: "mobilization.evaluate", resource: scope(project.businessScopeOrganizationId, project.id, requirement.id),
        requiredQualifications: [], forbiddenActorIds: requirement.submittedBy ? [requirement.submittedBy] : [], minimumAssurance: "mfa",
      }, now);
      if (requirement.version !== expectedVersion) throw new ConflictError();
      if (decision === "accept" && requirement.qualificationId) {
        const qualification = transaction.subcontractorQualificationById(requirement.qualificationId);
        if (!qualification || qualification.state !== "verified" || qualification.effectiveAt.getTime() > now.getTime()
          || qualification.expiresAt.getTime() <= now.getTime()) {
          throw new ValidationError("The linked qualification is missing, revoked, or expired.", ["mobilization_qualification_expired"]);
        }
      }
      const reviewReason = required(reason, "reason");
      const reviewed: MobilizationRequirementRecord = {
        ...requirement, state: decision === "accept" ? "accepted" : "rejected", reviewedBy: context.userId,
        reviewReason, version: requirement.version + 1, updatedAt: now, updatedBy: context.userId,
      };
      transaction.updateMobilizationRequirement(reviewed, expectedVersion);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: decision === "accept" ? "mobilization.requirement_accepted" : "mobilization.requirement_rejected",
        objectType: "mobilization_requirement", objectId: requirement.id, priorState: requirement.state,
        newState: reviewed.state, reason: reviewReason, changedFields: { reviewedBy: context.userId },
      }));
      return reviewed;
    });
  }

  public evaluateMobilization(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    assignmentId: string,
  ): Promise<readonly MobilizationStatusRecord[]> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const projectAssignment = transaction.subcontractorAssignmentById(assignmentId);
      const project = projectAssignment ? transaction.projectById(projectAssignment.projectId) : null;
      if (!projectAssignment || !project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "mobilization.evaluate", resource: scope(project.businessScopeOrganizationId, project.id, projectAssignment.id),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      const statuses = this.calculateMobilizationStatus(transaction, projectAssignment, now);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "mobilization.evaluated", objectType: "subcontractor_project_assignment", objectId: projectAssignment.id,
        priorState: projectAssignment.mobilizationState, newState: projectAssignment.mobilizationState, reason: null,
        changedFields: { statuses: statuses.map((item) => ({ code: item.requirementCode, status: item.status })) },
      }));
      return statuses;
    });
  }

  public async releaseMobilization(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    assignmentId: string,
    expectedVersion: number,
  ): Promise<SubcontractorProjectAssignmentRecord> {
    const now = this.clock();
    const outcome = await this.store.transaction((transaction) => {
      const projectAssignment = transaction.subcontractorAssignmentById(assignmentId);
      const project = projectAssignment ? transaction.projectById(projectAssignment.projectId) : null;
      const profile = projectAssignment ? transaction.subcontractorProfileById(projectAssignment.profileId) : null;
      if (!projectAssignment || !project || !profile) throw new NotFoundError();
      if (context.actingOrganizationId !== project.businessScopeOrganizationId) throw new AuthorizationDeniedError("scope_denied");
      requireAuthorization(context, assignments, {
        action: "mobilization.release", resource: scope(project.businessScopeOrganizationId, project.id, projectAssignment.id),
        requiredQualifications: ["mobilization_authority"], forbiddenActorIds: [projectAssignment.createdBy], minimumAssurance: "step-up",
      }, now);
      if (projectAssignment.version !== expectedVersion) throw new ConflictError();
      const statuses = this.calculateMobilizationStatus(transaction, projectAssignment, now);
      const details = statuses
        .filter((item) => item.status !== "accepted" && item.status !== "not_applicable")
        .map((item) => `mobilization_requirement:${item.requirementCode}:${item.status}`);
      if (statuses.length === 0) details.push("mobilization_requirements_missing");
      if (profile.qualificationState !== "qualified" || !profile.qualificationValidTo
        || profile.qualificationValidTo.getTime() <= now.getTime()) details.push("subcontractor_qualification_expired");
      if (details.length > 0) {
        transaction.appendAudit(audit(this.idFactory, now, context, {
          projectId: project.id, action: "mobilization.denied", objectType: "subcontractor_project_assignment", objectId: projectAssignment.id,
          priorState: projectAssignment.mobilizationState, newState: projectAssignment.mobilizationState,
          reason: details.join(","), changedFields: { blockers: details },
        }));
        return { released: null, details } as const;
      }
      const released: SubcontractorProjectAssignmentRecord = {
        ...projectAssignment, mobilizationState: "released", mobilizedAt: now, mobilizedBy: context.userId,
        version: projectAssignment.version + 1, updatedAt: now, updatedBy: context.userId,
      };
      transaction.updateSubcontractorAssignment(released, expectedVersion);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "mobilization.released", objectType: "subcontractor_project_assignment", objectId: projectAssignment.id,
        priorState: projectAssignment.mobilizationState, newState: released.mobilizationState,
        reason: projectAssignment.authorizationReference, changedFields: { mobilizedBy: context.userId },
      }));
      return { released, details: [] } as const;
    });
    if (!outcome.released) throw new ValidationError("Mobilization prerequisites are incomplete or expired.", outcome.details);
    return outcome.released;
  }

  public portalAssignedWork(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
  ): Promise<readonly SubcontractorProjectAssignmentRecord[]> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const visible = transaction.subcontractorAssignmentsForOrganization(context.actingOrganizationId).filter((candidate) =>
        authorize(context, assignments, {
          action: "portal.work.read",
          resource: { organizationId: candidate.organizationId, projectId: candidate.projectId, workPackageId: null, objectId: candidate.id },
          requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
        }, now).allowed,
      );
      for (const projectAssignment of visible) {
        transaction.appendAudit(audit(this.idFactory, now, context, {
          projectId: projectAssignment.projectId, action: "portal.assigned_work_viewed", objectType: "subcontractor_project_assignment",
          objectId: projectAssignment.id, priorState: projectAssignment.mobilizationState, newState: projectAssignment.mobilizationState,
          reason: null, changedFields: { workPackageIds: projectAssignment.workPackageIds },
        }));
      }
      return visible;
    });
  }

  public submitSubcontractorRecord(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    workPackageId: string,
    input: SubmitSubcontractorRecordInput,
  ): Promise<SubcontractorSubmissionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const projectAssignment = transaction.subcontractorAssignmentForProject(projectId, context.actingOrganizationId);
      if (!projectAssignment || projectAssignment.mobilizationState !== "released"
        || !projectAssignment.workPackageIds.includes(workPackageId)) throw new AuthorizationDeniedError("scope_denied");
      requireAuthorization(context, assignments, {
        action: "subcontractor.submit",
        resource: { organizationId: projectAssignment.organizationId, projectId, workPackageId, objectId: null },
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      if (input.claimedProgressPercent !== null
        && (!Number.isFinite(input.claimedProgressPercent) || input.claimedProgressPercent < 0 || input.claimedProgressPercent > 100)) {
        throw new ValidationError("Claimed progress must be between 0 and 100.", ["claimed_progress_invalid"]);
      }
      const submission: SubcontractorSubmissionRecord = {
        id: this.idFactory(), projectId, assignmentId: projectAssignment.id, organizationId: projectAssignment.organizationId,
        workPackageId, category: input.category, title: required(input.title, "title"),
        claimedProgressPercent: input.claimedProgressPercent, evidenceFileIds: uniqueRequired(input.evidenceFileIds, "evidenceFileIds"),
        state: "submitted", submittedAt: now, submittedBy: context.userId, reviewedAt: null, reviewedBy: null,
        acceptanceMeaning: null, rejectionReason: null, version: 1,
      };
      transaction.insertSubcontractorSubmission(submission);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId, action: "portal.submission_created", objectType: "subcontractor_submission", objectId: submission.id,
        priorState: null, newState: submission.state, reason: submission.category,
        changedFields: { organizationId: submission.organizationId, workPackageId, evidenceFileIds: submission.evidenceFileIds },
      }));
      return submission;
    });
  }

  public reviewSubcontractorSubmission(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    submissionId: string,
    expectedVersion: number,
    decision: "accept" | "reject",
    meaningOrReason: string,
  ): Promise<SubcontractorSubmissionRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const submission = transaction.subcontractorSubmissionById(submissionId);
      const project = submission ? transaction.projectById(submission.projectId) : null;
      if (!submission || !project || submission.state !== "submitted") throw new NotFoundError();
      if (context.actingOrganizationId !== project.businessScopeOrganizationId) throw new AuthorizationDeniedError("scope_denied");
      requireAuthorization(context, assignments, {
        action: "epv.accept", resource: scope(project.businessScopeOrganizationId, project.id, submission.id),
        requiredQualifications: ["epv_acceptance_authority"], forbiddenActorIds: [submission.submittedBy], minimumAssurance: "step-up",
      }, now);
      if (submission.version !== expectedVersion) throw new ConflictError();
      const explanation = required(meaningOrReason, decision === "accept" ? "acceptanceMeaning" : "rejectionReason");
      const reviewed: SubcontractorSubmissionRecord = {
        ...submission, state: decision === "accept" ? "accepted" : "rejected", reviewedAt: now, reviewedBy: context.userId,
        acceptanceMeaning: decision === "accept" ? explanation : null,
        rejectionReason: decision === "reject" ? explanation : null, version: submission.version + 1,
      };
      transaction.updateSubcontractorSubmission(reviewed, expectedVersion);
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: decision === "accept" ? "submission.accepted" : "submission.rejected",
        objectType: "subcontractor_submission", objectId: submission.id, priorState: submission.state,
        newState: reviewed.state, reason: explanation,
        changedFields: { reviewedBy: context.userId, claimedProgressPercent: submission.claimedProgressPercent },
      }));
      return reviewed;
    });
  }

  public compareTurnoverVersions(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    packageId: string,
    fromVersion: number,
    toVersion: number,
  ): Promise<{ readonly added: readonly string[]; readonly removed: readonly string[]; readonly changed: readonly string[] }> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "turnover.read", resource: scope(project.businessScopeOrganizationId, project.id, packageId),
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      const versions = transaction.turnoverVersions(packageId).filter((version) => version.projectId === project.id);
      const left = versions.find((version) => version.versionNumber === fromVersion);
      const right = versions.find((version) => version.versionNumber === toVersion);
      if (!left || !right) throw new NotFoundError();
      const key = (entry: TurnoverManifestEntry) => `${entry.sourceType}:${entry.sourceId}`;
      const leftMap = new Map(left.manifest.map((entry) => [key(entry), entry.canonicalSha256]));
      const rightMap = new Map(right.manifest.map((entry) => [key(entry), entry.canonicalSha256]));
      const delta = {
        added: [...rightMap.keys()].filter((entry) => !leftMap.has(entry)).sort(),
        removed: [...leftMap.keys()].filter((entry) => !rightMap.has(entry)).sort(),
        changed: [...rightMap.keys()].filter((entry) => leftMap.has(entry) && leftMap.get(entry) !== rightMap.get(entry)).sort(),
      };
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: "turnover.version_compared", objectType: "turnover_package", objectId: packageId,
        priorState: String(fromVersion), newState: String(toVersion), reason: null,
        changedFields: { added: delta.added, removed: delta.removed, changed: delta.changed },
      }));
      return delta;
    });
  }

  private materialContext(transaction: FoundationTransaction, materialId: string) {
    const material = transaction.materialById(materialId);
    if (!material) throw new NotFoundError();
    const project = transaction.projectById(material.projectId);
    if (!project) throw new NotFoundError();
    return { material, project };
  }

  private materialMovement(
    now: Date,
    context: AccessContext,
    material: MaterialItemRecord,
    input: Omit<MaterialMovementRecord,
      "id" | "projectId" | "materialItemId" | "unitCode" | "occurredAt" | "actorUserId">,
  ): MaterialMovementRecord {
    return {
      id: this.idFactory(), projectId: material.projectId, materialItemId: material.id,
      unitCode: material.unitCode, occurredAt: now, actorUserId: context.userId, ...input,
    };
  }

  private acceptedPmiForMaterial(transaction: FoundationTransaction, material: MaterialItemRecord): PmiRecord | null {
    const visited = new Set<string>();
    let candidate: MaterialItemRecord | null = material;
    while (candidate && !visited.has(candidate.id)) {
      visited.add(candidate.id);
      const accepted = transaction.pmiForMaterial(candidate.id).find((pmi) => pmi.state === "accepted");
      if (accepted) return accepted;
      candidate = candidate.parentItemId ? transaction.materialById(candidate.parentItemId) : null;
    }
    return null;
  }

  private calculateMobilizationStatus(
    transaction: FoundationTransaction,
    projectAssignment: SubcontractorProjectAssignmentRecord,
    now: Date,
  ): readonly MobilizationStatusRecord[] {
    return transaction.mobilizationRequirementsForAssignment(projectAssignment.id).map((requirement) => {
      let status: MobilizationStatusRecord["status"] = requirement.state;
      let reason = `${requirement.category}:${requirement.state}`;
      if (!requirement.required && requirement.state === "missing") {
        status = "not_applicable";
        reason = "optional_without_submission";
      } else if (requirement.qualificationId && requirement.state === "accepted") {
        const qualification = transaction.subcontractorQualificationById(requirement.qualificationId);
        if (!qualification || qualification.state !== "verified"
          || qualification.effectiveAt.getTime() > now.getTime() || qualification.expiresAt.getTime() <= now.getTime()) {
          status = "expired";
          reason = "linked_qualification_not_current";
        } else {
          reason = `qualification:${qualification.code}:valid_to:${qualification.expiresAt.toISOString()}`;
        }
      }
      return {
        requirementId: requirement.id, requirementCode: requirement.code,
        category: requirement.category, status, reason,
      };
    });
  }

  private calculateTurnoverReadiness(
    transaction: FoundationTransaction,
    turnoverPackage: TurnoverPackageRecord,
  ): readonly TurnoverRequirementStatusRecord[] {
    const requirements = transaction.turnoverRequirementsForBoundary(turnoverPackage.completionBoundaryId);
    const materials = turnoverPackage.materialItemIds
      .map((id) => transaction.materialById(id))
      .filter((item): item is MaterialItemRecord => item !== null);
    return requirements.map((requirement) => {
      let status: TurnoverRequirementStatusRecord["status"] = "missing";
      let reason = "required_source_missing";
      if (requirement.recordClass === "material") {
        if (materials.length === 0) status = requirement.required ? "missing" : "not_applicable";
        else if (materials.some((item) => item.state === "rejected" || item.state === "quarantined")) status = "rejected";
        else if (materials.every((item) => item.state === "released" || item.state === "issued")) status = "accepted";
        else status = "submitted";
        reason = `material_scope:${materials.length}`;
      } else if (requirement.recordClass === "pmi") {
        const applicable = materials.filter((item) => item.requirements.pmiRequired);
        if (applicable.length === 0) status = requirement.notApplicableAllowed ? "not_applicable" : "missing";
        else if (applicable.every((item) => this.acceptedPmiForMaterial(transaction, item))) status = "accepted";
        else if (applicable.some((item) => transaction.pmiForMaterial(item.id).some((pmi) => pmi.state === "failed"))) status = "rejected";
        else if (applicable.some((item) => transaction.pmiForMaterial(item.id).some((pmi) => pmi.state === "submitted"))) status = "under_review";
        else status = "missing";
        reason = `pmi_applicable_materials:${applicable.length}`;
      } else if (requirement.recordClass === "document_revision") {
        const applicable = materials.filter((item) => item.requirements.mtrRequired);
        const revisions = applicable.map((item) => item.mtrDocumentRevisionId ? transaction.revisionById(item.mtrDocumentRevisionId) : null);
        if (applicable.length === 0) status = requirement.notApplicableAllowed ? "not_applicable" : "missing";
        else if (revisions.some((revision) => revision?.state === "superseded")) status = "superseded";
        else if (revisions.every((revision) => revision?.state === "released")) status = "accepted";
        else status = revisions.some((revision) => revision?.state === "under_review" || revision?.state === "approved") ? "under_review" : "missing";
        reason = `mtr_applicable_materials:${applicable.length}`;
      } else if (requirement.recordClass === "ncr") {
        const ncrs = materials.flatMap((item) => [...transaction.ncrForObject(item.id)]).filter((ncr) => ncr.turnoverRequired);
        if (ncrs.length === 0) status = requirement.notApplicableAllowed ? "not_applicable" : "missing";
        else if (ncrs.every((ncr) => ncr.state === "closed")) status = "accepted";
        else status = ncrs.some((ncr) => ncr.state === "open") ? "submitted" : "under_review";
        reason = `turnover_ncrs:${ncrs.length}`;
      } else {
        const punches = transaction.punchForProject(turnoverPackage.projectId).filter((punch) => punch.turnoverRequired);
        if (punches.length === 0) status = requirement.notApplicableAllowed ? "not_applicable" : "missing";
        else if (punches.every((punch) => punch.state === "closed" || punch.state === "transferred")) status = "accepted";
        else status = punches.some((punch) => punch.state === "open") ? "submitted" : "under_review";
        reason = `turnover_punches:${punches.length}`;
      }
      return { requirementId: requirement.id, requirementCode: requirement.code, recordClass: requirement.recordClass, status, reason };
    });
  }

  private buildNcr(now: Date, context: AccessContext, projectId: string, input: CreateNcrInput): NonconformanceRecord {
    return {
      id: this.idFactory(), projectId, number: required(input.number, "number").toUpperCase(),
      affectedObjectType: input.affectedObjectType, affectedObjectId: required(input.affectedObjectId, "affectedObjectId"),
      requirementReference: required(input.requirementReference, "requirementReference"),
      description: required(input.description, "description"), containment: required(input.containment, "containment"),
      evidenceFileIds: [...uniqueRequired(input.evidenceFileIds, "evidenceFileIds")],
      responsibleUserId: required(input.responsibleUserId, "responsibleUserId"),
      state: "open", disposition: null, correctiveAction: null, dispositionProposedBy: null, dispositionApprovedBy: null,
      reinspectionEvidenceFileId: null, turnoverRequired: input.turnoverRequired, version: 1,
      createdAt: now, createdBy: context.userId, updatedAt: now, updatedBy: context.userId,
    };
  }

  private transitionNcr(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    ncrId: string,
    expectedVersion: number,
    action: string,
    assurance: "mfa" | "step-up",
    transition: (ncr: NonconformanceRecord, now: Date) => NonconformanceRecord,
    qualifications: readonly string[] = [],
    forbidden: (ncr: NonconformanceRecord) => readonly string[] = () => [],
  ): Promise<NonconformanceRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const ncr = transaction.ncrById(ncrId);
      if (!ncr) throw new NotFoundError();
      const project = transaction.projectById(ncr.projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action, resource: scope(project.businessScopeOrganizationId, project.id, ncr.id),
        requiredQualifications: qualifications, forbiddenActorIds: forbidden(ncr), minimumAssurance: assurance,
      }, now);
      if (ncr.version !== expectedVersion) throw new ConflictError();
      const updated = transition(ncr, now);
      transaction.updateNcr(updated, expectedVersion);
      const auditAction = action === "ncr.disposition.propose" ? "ncr.disposition_proposed"
        : action === "ncr.disposition.approve" ? "ncr.disposition_approved"
        : action === "ncr.reinspect" ? "ncr.reinspection_completed"
        : action;
      transaction.appendAudit(audit(this.idFactory, now, context, {
        projectId: project.id, action: auditAction, objectType: "nonconformance", objectId: ncr.id,
        priorState: ncr.state, newState: updated.state, reason: updated.disposition,
        changedFields: { state: { from: ncr.state, to: updated.state } },
      }));
      return updated;
    });
  }
}
