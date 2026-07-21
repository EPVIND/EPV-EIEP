import { createHash, randomUUID } from "node:crypto";
import type {
  AccessContext,
  AuditEvent,
  ControlledReportRecord,
  ControlledReportSourceReference,
  MvpFormCode,
  RoleAssignment,
} from "@eiep/shared-types";
import { projectReadinessBlockers, requireAuthorization } from "@eiep/rules-engine";
import { NotFoundError, ValidationError } from "./errors.js";
import type { FoundationStore, FoundationTransaction } from "./foundation-store.js";
import { authoritativeProjectReadiness } from "./authoritative-project-readiness.js";

type Clock = () => Date;
type IdFactory = () => string;

export interface GenerateControlledReportInput {
  readonly formCode: MvpFormCode;
  readonly targetId: string;
}

export interface OperationalDashboard {
  readonly generatedAt: Date;
  readonly project: { readonly id: string; readonly number: string; readonly state: string };
  readonly readiness: { readonly ready: boolean; readonly blockers: readonly string[] };
  readonly documents: Readonly<Record<string, number>>;
  readonly materials: {
    readonly total: number;
    readonly byState: Readonly<Record<string, number>>;
    readonly unlocated: number;
    readonly mtr: Readonly<Record<string, number>>;
    readonly pmi: Readonly<Record<string, number>>;
  };
  readonly qualificationExpirations: readonly {
    readonly sourceType: "inspection_equipment" | "subcontractor_profile" | "subcontractor_qualification";
    readonly sourceId: string;
    readonly expiresAt: Date;
    readonly daysRemaining: number;
  }[];
  readonly exceptions: {
    readonly openNcrs: readonly { readonly id: string; readonly number: string; readonly state: string; readonly ageDays: number }[];
    readonly openPunchItems: readonly {
      readonly id: string; readonly number: string; readonly state: string; readonly ageDays: number;
      readonly ownerUserId: string; readonly systemId: string | null; readonly areaId: string | null; readonly workPackageId: string | null;
    }[];
    readonly punchByOwner: Readonly<Record<string, number>>;
    readonly punchBySystem: Readonly<Record<string, number>>;
    readonly punchByArea: Readonly<Record<string, number>>;
    readonly punchByWorkPackage: Readonly<Record<string, number>>;
  };
  readonly subcontractors: readonly {
    readonly assignmentId: string; readonly organizationId: string; readonly mobilizationState: string;
    readonly requirements: Readonly<Record<string, number>>; readonly deliverables: Readonly<Record<string, number>>;
  }[];
  readonly turnover: readonly {
    readonly packageId: string; readonly code: string; readonly state: string; readonly boundaryId: string;
    readonly boundaryCode: string | null; readonly requirementCount: number; readonly generatedVersionCount: number;
  }[];
  readonly privilegedAudit: {
    readonly total: number;
    readonly recent: readonly Pick<AuditEvent, "id" | "occurredAt" | "actorUserId" | "action" | "objectType" | "objectId">[];
  };
}

interface ReportSource {
  readonly sourceType: string;
  readonly record: unknown;
}

interface ReportView {
  readonly title: string;
  readonly status: string;
  readonly sources: readonly ReportSource[];
}

const supportedFormCodes = new Set<MvpFormCode>([
  "FORM-PRJ-001", "FORM-DOC-001", "FORM-MAT-001", "FORM-MTR-001", "FORM-PMI-001",
  "FORM-INS-001", "FORM-NCR-001", "FORM-PCH-001", "FORM-SUB-001", "FORM-SUB-002", "FORM-TOV-001",
]);

const redactedKeys = new Set(["legalTaxReference"]);

function required(value: string | null | undefined, field: string): string {
  const normalized = value?.trim() ?? "";
  if (!normalized) throw new ValidationError(`${field} is required.`, [`${field}_required`]);
  return normalized;
}

function normalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !redactedKeys.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalize(entry)]));
  }
  return String(value);
}

function canonical(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function reportAudit(
  idFactory: IdFactory,
  now: Date,
  context: AccessContext,
  input: Omit<AuditEvent, "id" | "occurredAt" | "actorUserId" | "actingOrganizationId" | "correlationId" | "canonicalSha256">,
): AuditEvent {
  const payload = {
    actorUserId: context.userId, actingOrganizationId: context.actingOrganizationId,
    projectId: input.projectId, action: input.action, objectType: input.objectType, objectId: input.objectId,
    priorState: input.priorState, newState: input.newState, reason: input.reason,
    correlationId: context.correlationId, changedFields: input.changedFields,
  };
  return { id: idFactory(), occurredAt: now, ...payload, canonicalSha256: sha256(JSON.stringify(payload)) };
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new NotFoundError();
  return value as Readonly<Record<string, unknown>>;
}

function sourceReference(source: ReportSource): ControlledReportSourceReference {
  const record = asRecord(source.record);
  const id = typeof record.id === "string" ? record.id : null;
  if (!id) throw new NotFoundError();
  const version = typeof record.version === "number" && Number.isInteger(record.version) && record.version > 0
    ? record.version : 1;
  const stateCandidate = record.state ?? record.qualificationState ?? record.mobilizationState ?? record.decision ?? "recorded";
  return {
    sourceType: source.sourceType,
    sourceId: id,
    sourceVersion: version,
    sourceState: String(stateCandidate),
    canonicalSha256: sha256(canonical(source.record)),
  };
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function filenamePart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 80) || "record";
}

function countBy(values: readonly string[]): Readonly<Record<string, number>> {
  return Object.fromEntries([...values.reduce((counts, value) => {
    counts.set(value, (counts.get(value) ?? 0) + 1);
    return counts;
  }, new Map<string, number>())].sort(([left], [right]) => left.localeCompare(right)));
}

function ageDays(now: Date, createdAt: Date): number {
  return Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / 86_400_000));
}

function printableHtml(input: {
  readonly reportId: string;
  readonly projectNumber: string;
  readonly formCode: MvpFormCode;
  readonly title: string;
  readonly targetId: string;
  readonly status: string;
  readonly revisionNumber: number;
  readonly generatedAt: Date;
  readonly warning: string;
  readonly sourceRecords: readonly ControlledReportSourceReference[];
  readonly structuredContent: Readonly<Record<string, unknown>>;
}): string {
  const sourceRows = input.sourceRecords.map((source) => `<tr><td>${escapeHtml(source.sourceType)}</td>`
    + `<td>${escapeHtml(source.sourceId)}</td><td>${source.sourceVersion}</td>`
    + `<td>${escapeHtml(source.sourceState)}</td><td><code>${source.canonicalSha256}</code></td></tr>`).join("");
  const payload = escapeHtml(JSON.stringify(input.structuredContent, null, 2));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${escapeHtml(input.formCode)} — ${escapeHtml(input.title)}</title><style>`
    + "@page{size:auto;margin:14mm}body{font:14px/1.45 Arial,sans-serif;color:#172033;margin:0}"
    + "header{border-bottom:3px solid #173f5f;margin-bottom:1rem}h1{font-size:1.5rem;margin:.2rem 0}"
    + ".warning{padding:.65rem;border:2px solid #8a4b08;background:#fff4dd;font-weight:700}"
    + "dl{display:grid;grid-template-columns:12rem 1fr;gap:.25rem 1rem}dt{font-weight:700}dd{margin:0}"
    + "table{width:100%;border-collapse:collapse;margin:1rem 0}th,td{border:1px solid #9aa5b1;padding:.35rem;text-align:left;vertical-align:top}"
    + "code{font-size:.72rem;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f6f8;padding:.8rem}"
    + "footer{border-top:1px solid #9aa5b1;margin-top:1rem;padding-top:.5rem;font-size:.8rem}@media print{.warning{break-inside:avoid}}"
    + `</style></head><body><header><p>EPV Industrial Enterprise Platform — Controlled snapshot</p>`
    + `<h1>${escapeHtml(input.title)}</h1><p>${escapeHtml(input.formCode)}</p></header>`
    + `<p class="warning">${escapeHtml(input.warning)}</p><dl>`
    + `<dt>Project</dt><dd>${escapeHtml(input.projectNumber)}</dd><dt>Report ID</dt><dd>${escapeHtml(input.reportId)}</dd>`
    + `<dt>Target record</dt><dd>${escapeHtml(input.targetId)}</dd><dt>Status</dt><dd>${escapeHtml(input.status)}</dd>`
    + `<dt>Revision</dt><dd>${input.revisionNumber}</dd><dt>Generated</dt><dd>${input.generatedAt.toISOString()}</dd>`
    + `<dt>Source system</dt><dd>EIEP</dd></dl><h2>Source records</h2>`
    + `<table><thead><tr><th>Type</th><th>ID</th><th>Version</th><th>Status</th><th>SHA-256</th></tr></thead><tbody>${sourceRows}</tbody></table>`
    + `<h2>Structured record</h2><pre>${payload}</pre>`
    + `<footer>Report ${escapeHtml(input.reportId)} · Revision ${input.revisionNumber} · ${escapeHtml(input.warning)}</footer></body></html>`;
}

export class ReportingService {
  public constructor(
    private readonly store: FoundationStore,
    private readonly trainingWatermark = false,
    private readonly clock: Clock = () => new Date(),
    private readonly idFactory: IdFactory = randomUUID,
  ) {}

  public generate(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    projectId: string,
    input: GenerateControlledReportInput,
  ): Promise<ControlledReportRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      const targetId = required(input.targetId, "targetId");
      if (!supportedFormCodes.has(input.formCode)) throw new ValidationError("The form code is not in the controlled MVP inventory.", ["form_code_invalid"]);
      requireAuthorization(context, assignments, {
        action: "report.generate",
        resource: { organizationId: project.businessScopeOrganizationId, projectId: project.id, workPackageId: null, objectId: targetId },
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      const view = this.reportView(transaction, project.id, input.formCode, targetId);
      const sourceRecords = view.sources.map(sourceReference);
      const structuredContent = normalize({
        metadata: {
          formCode: input.formCode, projectId: project.id, projectNumber: project.number,
          targetId, title: view.title, status: view.status, generatedAt: now, sourceSystem: "EIEP",
        },
        records: view.sources.map((source) => ({ sourceType: source.sourceType, record: source.record })),
      }) as Readonly<Record<string, unknown>>;
      const structuredJson = JSON.stringify(structuredContent);
      if (Buffer.byteLength(structuredJson, "utf8") > 5 * 1024 * 1024) {
        throw new ValidationError("The report snapshot exceeds the controlled output limit.", ["report_snapshot_too_large"]);
      }
      const prior = transaction.controlledReportsForProject(project.id)
        .filter((report) => report.formCode === input.formCode && report.targetId === targetId);
      const revisionNumber = Math.max(0, ...prior.map((report) => report.revisionNumber)) + 1;
      const id = this.idFactory();
      const warning = this.trainingWatermark
        ? "TRAINING / NOT FOR PRODUCTION — UNCONTROLLED WHEN PRINTED"
        : "UNCONTROLLED WHEN PRINTED — verify status and revision in EIEP before use";
      const html = printableHtml({
        reportId: id, projectNumber: project.number, formCode: input.formCode, title: view.title,
        targetId, status: view.status, revisionNumber, generatedAt: now, warning, sourceRecords, structuredContent,
      });
      const filenameStem = `${filenamePart(project.number)}_${input.formCode}_${filenamePart(targetId)}_r${String(revisionNumber).padStart(4, "0")}`;
      const report: ControlledReportRecord = {
        id, projectId: project.id, formCode: input.formCode, targetId, title: view.title,
        recordStatus: view.status, revisionNumber, sourceSystem: "EIEP", sourceRecords,
        structuredContent, structuredSha256: sha256(structuredJson), printableHtml: html,
        printableSha256: sha256(html), filenameStem, trainingWatermark: this.trainingWatermark,
        printWarning: warning, generatedAt: now, generatedBy: context.userId, version: 1,
      };
      transaction.insertControlledReport(report);
      transaction.appendAudit(reportAudit(this.idFactory, now, context, {
        projectId: project.id,
        action: "report.generated", objectType: "controlled_report", objectId: report.id,
        priorState: null, newState: "generated", reason: input.formCode,
        changedFields: { formCode: input.formCode, targetId, revisionNumber, structuredSha256: report.structuredSha256,
          printableSha256: report.printableSha256, sourceRecordCount: sourceRecords.length },
      }));
      return report;
    });
  }

  public report(
    context: AccessContext, assignments: readonly RoleAssignment[], reportId: string,
  ): Promise<ControlledReportRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const report = transaction.controlledReportById(reportId);
      const project = report ? transaction.projectById(report.projectId) : null;
      if (!report || !project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "report.read",
        resource: { organizationId: project.businessScopeOrganizationId, projectId: project.id, workPackageId: null, objectId: report.id },
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      return report;
    });
  }

  public reportsForProject(
    context: AccessContext, assignments: readonly RoleAssignment[], projectId: string,
  ): Promise<readonly ControlledReportRecord[]> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "report.read",
        resource: { organizationId: project.businessScopeOrganizationId, projectId: project.id, workPackageId: null, objectId: null },
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      return transaction.controlledReportsForProject(project.id);
    });
  }

  public dashboard(
    context: AccessContext, assignments: readonly RoleAssignment[], projectId: string,
  ): Promise<OperationalDashboard> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "report.read",
        resource: { organizationId: project.businessScopeOrganizationId, projectId: project.id, workPackageId: null, objectId: null },
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);

      const documents = transaction.documentsForProject(project.id);
      const documentRevisions = documents.flatMap((document) => transaction.revisionsForDocument(document.id));
      const materials = transaction.materialsForProject(project.id);
      const assignmentsForProject = transaction.subcontractorAssignmentsForProject(project.id);
      const horizon = new Date(now.getTime() + 60 * 86_400_000);
      const expirations: Array<OperationalDashboard["qualificationExpirations"][number]> = [];
      for (const equipment of transaction.equipmentForProject(project.id)) {
        if (equipment.validTo >= now && equipment.validTo <= horizon) expirations.push({
          sourceType: "inspection_equipment", sourceId: equipment.id, expiresAt: equipment.validTo,
          daysRemaining: ageDays(equipment.validTo, now),
        });
      }
      for (const assignment of assignmentsForProject) {
        const profile = transaction.subcontractorProfileById(assignment.profileId);
        if (!profile) continue;
        if (profile.qualificationValidTo && profile.qualificationValidTo >= now && profile.qualificationValidTo <= horizon) {
          expirations.push({ sourceType: "subcontractor_profile", sourceId: profile.id, expiresAt: profile.qualificationValidTo,
            daysRemaining: ageDays(profile.qualificationValidTo, now) });
        }
        for (const qualification of transaction.subcontractorQualificationsForProfile(profile.id)) {
          if (qualification.expiresAt >= now && qualification.expiresAt <= horizon) expirations.push({
            sourceType: "subcontractor_qualification", sourceId: qualification.id, expiresAt: qualification.expiresAt,
            daysRemaining: ageDays(qualification.expiresAt, now),
          });
        }
      }

      const openNcrs = transaction.ncrForProject(project.id).filter((ncr) => ncr.state !== "closed")
        .map((ncr) => ({ id: ncr.id, number: ncr.number, state: ncr.state, ageDays: ageDays(now, ncr.createdAt) }));
      const openPunchItems = transaction.punchForProject(project.id).filter((punch) => punch.state !== "closed")
        .map((punch) => ({ id: punch.id, number: punch.number, state: punch.state, ageDays: ageDays(now, punch.createdAt),
          ownerUserId: punch.ownerUserId, systemId: punch.systemId, areaId: punch.areaId, workPackageId: punch.workPackageId }));
      const privileged = transaction.auditForProject(project.id).filter((event) =>
        /(?:approved|accepted|activated|released|generated|closed|granted|revoked|override)/u.test(event.action));

      const readiness = authoritativeProjectReadiness(transaction, project, now);
      return {
        generatedAt: now,
        project: { id: project.id, number: project.number, state: project.state },
        readiness: { ready: projectReadinessBlockers(readiness).length === 0,
          blockers: projectReadinessBlockers(readiness) },
        documents: {
          total: documents.length,
          revisions: documentRevisions.length,
          currentReleased: documents.filter((document) => document.currentRevisionId !== null).length,
          unreleased: documents.filter((document) => document.currentRevisionId === null).length,
          supersededRevisions: documentRevisions.filter((revision) => revision.state === "superseded").length,
        },
        materials: {
          total: materials.length,
          byState: countBy(materials.map((material) => material.state)),
          unlocated: materials.filter((material) => !material.storageLocation.trim()).length,
          mtr: { required: materials.filter((material) => material.requirements.mtrRequired).length,
            accepted: materials.filter((material) => material.requirements.mtrAccepted).length,
            pending: materials.filter((material) => material.requirements.mtrRequired && !material.requirements.mtrAccepted).length },
          pmi: { required: materials.filter((material) => material.requirements.pmiRequired).length,
            accepted: materials.filter((material) => material.requirements.pmiAccepted).length,
            pending: materials.filter((material) => material.requirements.pmiRequired && !material.requirements.pmiAccepted).length },
        },
        qualificationExpirations: [...expirations].sort((left, right) => left.expiresAt.getTime() - right.expiresAt.getTime()),
        exceptions: {
          openNcrs, openPunchItems,
          punchByOwner: countBy(openPunchItems.map((punch) => punch.ownerUserId)),
          punchBySystem: countBy(openPunchItems.map((punch) => punch.systemId ?? "unassigned")),
          punchByArea: countBy(openPunchItems.map((punch) => punch.areaId ?? "unassigned")),
          punchByWorkPackage: countBy(openPunchItems.map((punch) => punch.workPackageId ?? "unassigned")),
        },
        subcontractors: assignmentsForProject.map((assignment) => {
          const requirements = transaction.mobilizationRequirementsForAssignment(assignment.id);
          const deliverables = transaction.subcontractorSubmissionsForAssignment(assignment.id);
          return { assignmentId: assignment.id, organizationId: assignment.organizationId,
            mobilizationState: assignment.mobilizationState, requirements: countBy(requirements.map((item) => item.state)),
            deliverables: countBy(deliverables.map((item) => item.state)) };
        }),
        turnover: transaction.turnoverPackagesForProject(project.id).map((turnoverPackage) => {
          const boundary = transaction.completionBoundaryById(turnoverPackage.completionBoundaryId);
          return { packageId: turnoverPackage.id, code: turnoverPackage.code, state: turnoverPackage.state,
            boundaryId: turnoverPackage.completionBoundaryId, boundaryCode: boundary?.code ?? null,
            requirementCount: transaction.turnoverRequirementsForBoundary(turnoverPackage.completionBoundaryId).length,
            generatedVersionCount: transaction.turnoverVersions(turnoverPackage.id).length };
        }),
        privilegedAudit: { total: privileged.length, recent: privileged.slice(-20).reverse().map((event) => ({
          id: event.id, occurredAt: event.occurredAt, actorUserId: event.actorUserId, action: event.action,
          objectType: event.objectType, objectId: event.objectId,
        })) },
      };
    });
  }

  public download(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    reportId: string,
    format: "html" | "json",
  ): Promise<ControlledReportRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const report = transaction.controlledReportById(reportId);
      const project = report ? transaction.projectById(report.projectId) : null;
      if (!report || !project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "report.read",
        resource: { organizationId: project.businessScopeOrganizationId, projectId: project.id, workPackageId: null, objectId: report.id },
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);
      transaction.appendAudit(reportAudit(this.idFactory, now, context, {
        projectId: project.id, action: "report.downloaded", objectType: "controlled_report", objectId: report.id,
        priorState: "generated", newState: "generated", reason: format,
        changedFields: { format, revisionNumber: report.revisionNumber,
          sha256: format === "html" ? report.printableSha256 : report.structuredSha256 },
      }));
      return report;
    });
  }

  private reportView(
    transaction: FoundationTransaction, projectId: string, formCode: MvpFormCode, targetId: string,
  ): ReportView {
    if (formCode === "FORM-PRJ-001") {
      const project = transaction.projectById(targetId);
      if (!project || project.id !== projectId) throw new NotFoundError();
      return { title: "Project profile and readiness report", status: project.state, sources: [
        { sourceType: "project", record: project },
        ...transaction.projectStructureForProject(project.id).map((record) => ({ sourceType: "project_structure", record })),
        ...transaction.projectOrganizationsForProject(project.id).map((record) => ({ sourceType: "project_organization", record })),
        ...transaction.responsibilityAssignmentsForProject(project.id).map((record) => ({ sourceType: "responsibility_assignment", record })),
        ...transaction.projectConfigurationsForProject(project.id).map((record) => ({ sourceType: "project_configuration", record })),
      ] };
    }
    if (formCode === "FORM-DOC-001") {
      const document = transaction.documentById(targetId);
      if (!document || document.projectId !== projectId) throw new NotFoundError();
      const revisions = transaction.revisionsForDocument(document.id);
      const current = document.currentRevisionId ? revisions.find((revision) => revision.id === document.currentRevisionId) : null;
      return { title: "Document cover, revision history, and transmittal", status: current?.state ?? "unreleased", sources: [
        { sourceType: "document", record: document },
        ...revisions.map((record) => ({ sourceType: "document_revision", record })),
        ...revisions.flatMap((revision) => transaction.documentDistributionsForRevision(revision.id)
          .map((record) => ({ sourceType: "document_distribution", record }))),
      ] };
    }
    if (formCode === "FORM-MAT-001") {
      const material = transaction.materialById(targetId);
      if (!material || material.projectId !== projectId) throw new NotFoundError();
      return { title: "Material receiving report and label", status: material.state, sources: [
        { sourceType: "material", record: material },
        ...transaction.materialMovementsForItem(material.id).map((record) => ({ sourceType: "material_movement", record })),
        ...transaction.genealogyForItem(material.id).map((record) => ({ sourceType: "material_genealogy", record })),
      ] };
    }
    if (formCode === "FORM-MTR-001") {
      const review = transaction.mtrReviewById(targetId);
      const material = review ? transaction.materialById(review.materialItemId) : null;
      const revision = review ? transaction.revisionById(review.documentRevisionId) : null;
      if (!review || !material || material.projectId !== projectId || !revision) throw new NotFoundError();
      return { title: "Material test report review record", status: review.decision, sources: [
        { sourceType: "mtr_review", record: review }, { sourceType: "material", record: material },
        { sourceType: "document_revision", record: revision },
      ] };
    }
    if (formCode === "FORM-PMI-001") {
      const pmi = transaction.pmiById(targetId);
      const material = pmi ? transaction.materialById(pmi.materialItemId) : null;
      const equipment = pmi ? transaction.equipmentById(pmi.equipmentId) : null;
      if (!pmi || pmi.projectId !== projectId || !material || !equipment) throw new NotFoundError();
      return { title: "Positive material identification report", status: pmi.state, sources: [
        { sourceType: "pmi", record: pmi }, { sourceType: "material", record: material },
        { sourceType: "inspection_equipment", record: equipment },
      ] };
    }
    if (formCode === "FORM-INS-001") {
      const inspection = transaction.inspectionById(targetId);
      const plan = inspection ? transaction.inspectionPlanById(inspection.planRevisionId) : null;
      if (!inspection || inspection.projectId !== projectId || !plan) throw new NotFoundError();
      return { title: "Governed inspection report", status: inspection.state, sources: [
        { sourceType: "inspection", record: inspection }, { sourceType: "inspection_plan_revision", record: plan },
      ] };
    }
    if (formCode === "FORM-NCR-001") {
      const ncr = transaction.ncrById(targetId);
      if (!ncr || ncr.projectId !== projectId) throw new NotFoundError();
      return { title: "Nonconformance report and history", status: ncr.state, sources: [
        { sourceType: "nonconformance", record: ncr },
        ...transaction.auditForProject(projectId).filter((event) => event.objectId === ncr.id)
          .map((record) => ({ sourceType: "audit_event", record })),
      ] };
    }
    if (formCode === "FORM-PCH-001") {
      const punch = transaction.punchById(targetId);
      if (!punch || punch.projectId !== projectId) throw new NotFoundError();
      return { title: "Punch item report and register history", status: punch.state, sources: [
        { sourceType: "punch", record: punch },
        ...transaction.auditForProject(projectId).filter((event) => event.objectId === punch.id)
          .map((record) => ({ sourceType: "audit_event", record })),
      ] };
    }
    if (formCode === "FORM-SUB-001") {
      const profile = transaction.subcontractorProfileById(targetId);
      const assignment = profile ? transaction.subcontractorAssignmentForProject(projectId, profile.organizationId) : null;
      if (!profile || !assignment) throw new NotFoundError();
      return { title: "Subcontractor qualification summary", status: profile.qualificationState, sources: [
        { sourceType: "subcontractor_profile", record: profile },
        ...transaction.subcontractorQualificationsForProfile(profile.id)
          .map((record) => ({ sourceType: "subcontractor_qualification", record })),
        { sourceType: "subcontractor_project_assignment", record: assignment },
      ] };
    }
    if (formCode === "FORM-SUB-002") {
      const assignment = transaction.subcontractorAssignmentById(targetId);
      if (!assignment || assignment.projectId !== projectId) throw new NotFoundError();
      return { title: "Subcontractor mobilization status and release", status: assignment.mobilizationState, sources: [
        { sourceType: "subcontractor_project_assignment", record: assignment },
        ...transaction.mobilizationRequirementsForAssignment(assignment.id)
          .map((record) => ({ sourceType: "mobilization_requirement", record })),
        ...transaction.subcontractorSubmissionsForAssignment(assignment.id)
          .map((record) => ({ sourceType: "subcontractor_submission", record })),
      ] };
    }
    const turnoverPackage = transaction.turnoverPackageById(targetId);
    if (!turnoverPackage || turnoverPackage.projectId !== projectId) throw new NotFoundError();
    const boundary = transaction.completionBoundaryById(turnoverPackage.completionBoundaryId);
    if (!boundary) throw new NotFoundError();
    return { title: "Turnover readiness and versioned package report", status: turnoverPackage.state, sources: [
      { sourceType: "turnover_package", record: turnoverPackage }, { sourceType: "completion_boundary", record: boundary },
      ...transaction.turnoverRequirementsForBoundary(boundary.id).map((record) => ({ sourceType: "turnover_requirement", record })),
      ...transaction.turnoverVersions(turnoverPackage.id).map((record) => ({ sourceType: "turnover_package_version", record })),
    ] };
  }
}
