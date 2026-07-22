import { createHash, randomUUID } from "node:crypto";
import type {
  AccessContext,
  AuditEvent,
  ControlledReportRecord,
  ControlledReportSourceReference,
  MvpFormCode,
  RoleAssignment,
} from "@eiep/shared-types";
import { authorize, projectReadinessBlockers, requireAuthorization } from "@eiep/rules-engine";
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

export type CommandCenterModule =
  | "projects"
  | "estimating"
  | "controls"
  | "procurement"
  | "scheduling"
  | "documents"
  | "materials"
  | "quality"
  | "welding"
  | "nde"
  | "testing"
  | "fabrication"
  | "bluebeam"
  | "turnover";

export interface CommandCenterTask {
  readonly id: string;
  readonly module: CommandCenterModule;
  readonly recordType: string;
  readonly recordId: string;
  readonly title: string;
  readonly state: string;
  readonly priority: "critical" | "high" | "medium" | "normal";
  readonly dueAt: Date | null;
  readonly overdue: boolean;
  readonly action: string;
  readonly version: number;
}

export interface CommandCenterModuleSummary {
  readonly module: CommandCenterModule;
  readonly label: string;
  readonly total: number;
  readonly open: number;
  readonly attention: number;
  readonly completed: number;
  readonly progressPercent: number | null;
}

export interface CommandCenterSnapshot {
  readonly generatedAt: Date;
  readonly project: { readonly id: string; readonly number: string; readonly name: string; readonly state: string };
  readonly metrics: {
    readonly documentsCurrent: number;
    readonly documentsTotal: number;
    readonly materialsTracked: number;
    readonly weldsComplete: number;
    readonly weldsTotal: number;
    readonly executionAccepted: number;
    readonly executionTotal: number;
    readonly openExceptions: number;
    readonly scheduleProgressPercent: number | null;
    readonly openTasks: number;
  };
  readonly tasks: readonly CommandCenterTask[];
  readonly recentActivity: readonly {
    readonly id: string;
    readonly occurredAt: Date;
    readonly actorUserId: string;
    readonly action: string;
    readonly module: CommandCenterModule;
    readonly objectType: string;
    readonly objectId: string;
    readonly priorState: string | null;
    readonly newState: string | null;
  }[];
  readonly activityVisible: boolean;
  readonly modules: readonly CommandCenterModuleSummary[];
  readonly schedule: {
    readonly sourceRevisionIds: readonly string[];
    readonly activityCount: number;
    readonly completedActivities: number;
    readonly lateActivities: number;
    readonly progressPercent: number | null;
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

function moduleForObjectType(objectType: string): CommandCenterModule {
  const value = objectType.toLowerCase();
  if (value.includes("fabrication") || value.includes("traveler")) return "fabrication";
  if (value.includes("estimate") || value.includes("proposal")) return "estimating";
  if (value.includes("procurement") || value.includes("requisition") || value.includes("bid_package") || value.includes("commitment")) return "procurement";
  if (value.includes("schedule")) return "scheduling";
  if (value.includes("baseline") || value.includes("change") || value.includes("cost_entry") || value.includes("progress_claim")) return "controls";
  if (value.includes("collaboration")) return "bluebeam";
  if (value.includes("document")) return "documents";
  if (value.includes("material") || value.includes("mtr") || value.includes("pmi")) return "materials";
  if (value.includes("nde") || value.includes("pwht")) return "nde";
  if (value.includes("weld") || value.includes("procedure") || value.includes("qualification")) return "welding";
  if (value.includes("test_package") || value.includes("testing")) return "testing";
  if (value.includes("ncr") || value.includes("nonconformance") || value.includes("punch") || value.includes("inspection")) return "quality";
  if (value.includes("turnover") || value.includes("completion")) return "turnover";
  return "projects";
}

function progressPercent(completed: number, total: number): number | null {
  return total === 0 ? null : Math.round((completed / total) * 100);
}

function commandCenterPriority(dueAt: Date | null, now: Date, preferred: CommandCenterTask["priority"]): CommandCenterTask["priority"] {
  if (dueAt && dueAt.getTime() < now.getTime()) return "critical";
  if (dueAt && dueAt.getTime() <= now.getTime() + 7 * 86_400_000) return "high";
  return preferred;
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

  public commandCenter(
    context: AccessContext, assignments: readonly RoleAssignment[], projectId: string,
  ): Promise<CommandCenterSnapshot> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const project = transaction.projectById(projectId);
      if (!project) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "report.read",
        resource: { organizationId: project.businessScopeOrganizationId, projectId: project.id, workPackageId: null, objectId: null },
        requiredQualifications: [], forbiddenActorIds: [], minimumAssurance: "mfa",
      }, now);

      const permitted = (
        action: string,
        objectId: string | null,
        requiredQualifications: readonly string[] = [],
        forbiddenActorIds: readonly string[] = [],
        minimumAssurance: AccessContext["assurance"] = "standard",
        resourceProjectId: string | null = project.id,
      ) => authorize(context, assignments, {
        action,
        resource: {
          organizationId: project.businessScopeOrganizationId,
          projectId: resourceProjectId,
          workPackageId: null,
          objectId,
        },
        requiredQualifications,
        forbiddenActorIds,
        minimumAssurance,
      }, now).allowed;

      const tasks: CommandCenterTask[] = [];
      const addTask = (input: Omit<CommandCenterTask, "id" | "priority" | "overdue"> & {
        readonly preferredPriority?: CommandCenterTask["priority"];
        readonly authorized: boolean;
      }) => {
        if (!input.authorized) return;
        const { authorized: _authorized, preferredPriority = "normal", ...task } = input;
        tasks.push({
          ...task,
          id: `${task.module}:${task.recordType}:${task.recordId}:${task.action}`,
          priority: commandCenterPriority(task.dueAt, now, preferredPriority),
          overdue: task.dueAt !== null && task.dueAt.getTime() < now.getTime(),
        });
      };

      const readiness = authoritativeProjectReadiness(transaction, project, now);
      const readinessBlockers = projectReadinessBlockers(readiness);
      if (project.state === "draft") addTask({
        module: "projects", recordType: "project", recordId: project.id,
        title: readinessBlockers.length === 0 ? `Activate ${project.number}` : `Resolve ${readinessBlockers.length} project readiness blocker(s)`,
        state: readinessBlockers.length === 0 ? "ready_for_activation" : "blocked", dueAt: null,
        action: "project.activate", version: project.version, preferredPriority: "high",
        authorized: permitted("project.activate", project.id, [], [], "step-up"),
      });

      const documents = transaction.documentsForProject(project.id)
        .filter((document) => permitted("document.read_current", document.id));
      const documentRevisions = documents.flatMap((document) => transaction.revisionsForDocument(document.id)
        .filter((revision) => revision.id === document.currentRevisionId || permitted("document.read_history", document.id))
        .map((revision) => ({ document, revision })));
      const documentReviewCandidates = documents.flatMap((document) => transaction.revisionsForDocument(document.id)
        .filter((revision) => revision.state === "under_review")
        .map((revision) => ({ document, revision })));
      for (const { document, revision } of documentReviewCandidates) {
        addTask({ module: "documents", recordType: "document_revision", recordId: revision.id,
          title: `Review ${document.number} revision ${revision.revision}`, state: revision.state, dueAt: null,
          action: "document.approve", version: revision.version, preferredPriority: "high",
          authorized: permitted("document.approve", document.id, [], [revision.createdBy], "step-up") });
      }

      const materials = transaction.materialsForProject(project.id)
        .filter((material) => permitted("material.read", material.id));
      for (const material of materials.filter((candidate) => candidate.state === "received_pending")) {
        addTask({ module: "materials", recordType: "material_item", recordId: material.id,
          title: `Review material ${material.identifier} for release`, state: material.state, dueAt: null,
          action: "material.release.approve", version: material.version, preferredPriority: "medium",
          authorized: permitted("material.release.approve", material.id, ["material_release_authority"], [material.createdBy], "step-up") });
      }

      const ncrs = transaction.ncrForProject(project.id).filter((ncr) => permitted("ncr.read", ncr.id));
      const punches = transaction.punchForProject(project.id).filter((punch) => permitted("punch.read", punch.id));
      for (const punch of punches.filter((candidate) => !["closed", "transferred"].includes(candidate.state))) {
        if (punch.ownerUserId === context.userId && punch.state === "open") addTask({
          module: "quality", recordType: "punch_item", recordId: punch.id, title: `Complete punch ${punch.number}`,
          state: punch.state, dueAt: punch.targetAt, action: "punch.update.owned", version: punch.version,
          preferredPriority: punch.priority === "low" ? "normal" : punch.priority,
          authorized: permitted("punch.update.owned", punch.id),
        });
        if (punch.state === "ready_for_verification") addTask({
          module: "quality", recordType: "punch_item", recordId: punch.id, title: `Verify punch ${punch.number}`,
          state: punch.state, dueAt: punch.targetAt, action: "punch.verify", version: punch.version, preferredPriority: "high",
          authorized: permitted("punch.verify", punch.id, ["punch_verifier"], [punch.ownerUserId, punch.createdBy], "step-up"),
        });
      }
      for (const ncr of ncrs.filter((candidate) => candidate.state === "reinspection_complete")) addTask({
        module: "quality", recordType: "nonconformance", recordId: ncr.id, title: `Close NCR ${ncr.number}`,
        state: ncr.state, dueAt: null, action: "ncr.close", version: ncr.version, preferredPriority: "high",
        authorized: permitted("ncr.close", ncr.id, ["ncr_close_authority"], ncr.dispositionProposedBy ? [ncr.dispositionProposedBy] : [], "step-up"),
      });

      const linkedEstimates = transaction.estimatesForOrganization(project.businessScopeOrganizationId)
        .filter((estimate) => transaction.estimateHandoffs(estimate.id).some((handoff) => handoff.projectId === project.id))
        .filter((estimate) => permitted("estimate.read", estimate.id, [], [], "standard", null));

      const baselines = transaction.projectControlBaselines(project.id).filter((record) => permitted("controls.read", record.id));
      const changes = transaction.projectChangeRequests(project.id).filter((record) => permitted("controls.read", record.id));
      const costEntries = transaction.projectCostEntries(project.id).filter((record) => permitted("controls.read", record.id));
      const progressClaims = transaction.projectProgressClaims(project.id).filter((record) => permitted("controls.read", record.id));
      for (const baseline of baselines.filter((candidate) => candidate.state === "under_review")) addTask({
        module: "controls", recordType: "project_control_baseline", recordId: baseline.id,
        title: `Review baseline ${baseline.number} revision ${baseline.revision}`, state: baseline.state, dueAt: baseline.periodStart,
        action: "controls.baseline.approve", version: baseline.version, preferredPriority: "high",
        authorized: permitted("controls.baseline.approve", baseline.id, ["project_controls_authority"], [baseline.createdBy, baseline.submittedBy ?? baseline.createdBy], "step-up") });
      for (const entry of costEntries.filter((candidate) => candidate.state === "submitted")) addTask({
        module: "controls", recordType: "project_cost_entry", recordId: entry.id, title: `Review ${entry.entryType} cost entry`,
        state: entry.state, dueAt: entry.periodFinish, action: "controls.cost.accept", version: entry.version, preferredPriority: "medium",
        authorized: permitted("controls.cost.accept", entry.id, ["project_controls_authority"], [entry.submittedBy], "step-up") });
      for (const claim of progressClaims.filter((candidate) => candidate.state === "submitted")) addTask({
        module: "controls", recordType: "project_progress_claim", recordId: claim.id, title: "Review submitted progress claim",
        state: claim.state, dueAt: claim.periodFinish, action: "controls.progress.accept", version: claim.version, preferredPriority: "medium",
        authorized: permitted("controls.progress.accept", claim.id, ["project_controls_authority"], [claim.submittedBy], "step-up") });

      const requisitions = transaction.procurementRequisitions(project.id).filter((record) => permitted("controls.read", record.id));
      const bidPackages = transaction.procurementBidPackages(project.id).filter((record) => permitted("controls.read", record.id));
      const commitments = transaction.procurementCommitments(project.id).filter((record) => permitted("controls.read", record.id));
      for (const requisition of requisitions.filter((candidate) => candidate.state === "under_review")) addTask({
        module: "procurement", recordType: "procurement_requisition", recordId: requisition.id,
        title: `Review requisition ${requisition.number}`, state: requisition.state,
        dueAt: requisition.items.map((item) => item.needBy).sort((left, right) => left.getTime() - right.getTime())[0] ?? null,
        action: "procurement.requisition.approve", version: requisition.version, preferredPriority: "high",
        authorized: permitted("procurement.requisition.approve", requisition.id, ["procurement_authority"], [requisition.createdBy, requisition.submittedBy ?? requisition.createdBy], "step-up") });
      for (const bidPackage of bidPackages.filter((candidate) => candidate.state === "comparison")) addTask({
        module: "procurement", recordType: "procurement_bid_package", recordId: bidPackage.id,
        title: `Complete commercial comparison ${bidPackage.number}`, state: bidPackage.state,
        dueAt: bidPackage.offers.map((offer) => offer.validUntil).sort((left, right) => left.getTime() - right.getTime())[0] ?? null,
        action: "procurement.bid.recommend", version: bidPackage.version, preferredPriority: "high",
        authorized: permitted("procurement.bid.recommend", bidPackage.id, ["procurement_authority"], [], "mfa") });
      for (const commitment of commitments.filter((candidate) => candidate.state === "exception")) addTask({
        module: "procurement", recordType: "procurement_commitment", recordId: commitment.id,
        title: `Resolve procurement exception ${commitment.purchaseOrderReference}`, state: commitment.state,
        dueAt: commitment.statusEvents.at(-1)?.forecastAt ?? commitment.statusEvents.at(-1)?.promisedAt ?? null,
        action: "procurement.expedite.manage", version: commitment.version, preferredPriority: "critical",
        authorized: permitted("procurement.expedite.manage", commitment.id, [], [], "mfa") });

      const schedules = transaction.schedulePrograms(project.id).filter((schedule) => permitted("schedule.read", schedule.id));
      const scheduleRevisions = schedules.flatMap((schedule) => transaction.scheduleRevisions(schedule.id)
        .map((revision) => ({ schedule, revision })));
      for (const { revision } of scheduleRevisions.filter(({ revision }) => revision.state === "under_review")) addTask({
        module: "scheduling", recordType: "schedule_revision", recordId: revision.id,
        title: `Review schedule revision ${revision.revision}`, state: revision.state, dueAt: revision.dataDate,
        action: "schedule.approve", version: revision.version, preferredPriority: "high",
        authorized: permitted("schedule.approve", revision.id, ["scheduling_authority"], [revision.createdBy, revision.submittedBy ?? revision.createdBy], "step-up") });
      const currentScheduleRevisions = schedules.flatMap((schedule) => {
        const revision = schedule.currentRevisionId ? transaction.scheduleRevisionById(schedule.currentRevisionId) : null;
        return revision ? [{ schedule, revision }] : [];
      });
      const scheduleActivities = currentScheduleRevisions.flatMap(({ schedule, revision }) => revision.activities.map((activity) => ({ schedule, revision, activity })));
      const acceptedProgress = scheduleActivities.map(({ activity }) => Math.max(0, Math.min(100, Number(activity.acceptedProgressPercent))));
      const completedScheduleActivities = scheduleActivities.filter(({ activity }) => activity.actualFinish !== null || Number(activity.acceptedProgressPercent) >= 100).length;
      const lateScheduleActivities = scheduleActivities.filter(({ activity }) => activity.plannedFinish.getTime() < now.getTime()
        && activity.actualFinish === null && Number(activity.acceptedProgressPercent) < 100);
      for (const { schedule, revision, activity } of lateScheduleActivities) addTask({
        module: "scheduling", recordType: "schedule_activity", recordId: `${revision.id}:${activity.activityKey}`,
        title: `Recover late activity ${activity.displayId}: ${activity.name}`, state: "late", dueAt: activity.plannedFinish,
        action: "schedule.manage", version: revision.version, preferredPriority: "critical",
        authorized: permitted("schedule.manage", schedule.id, [], [], "mfa") });

      const procedures = transaction.weldingProcedures(project.id).filter((record) => permitted("execution.read", record.id));
      const qualifications = transaction.welderQualifications(project.id).filter((record) => permitted("execution.read", record.id));
      const welds = transaction.welds(project.id).filter((record) => permitted("execution.read", record.id));
      const ndeRequests = transaction.ndeRequests(project.id).filter((record) => permitted("execution.read", record.id));
      const pwhtCycles = transaction.pwhtCycles(project.id).filter((record) => permitted("execution.read", record.id));
      const testPackages = transaction.testPackages(project.id).filter((record) => permitted("execution.read", record.id));
      for (const procedure of procedures.filter((candidate) => candidate.state === "under_review")) addTask({
        module: "welding", recordType: "welding_procedure", recordId: procedure.id,
        title: `Review ${procedure.procedureType.toUpperCase()} ${procedure.number} revision ${procedure.revision}`,
        state: procedure.state, dueAt: procedure.effectiveFrom, action: "welding.procedure.approve", version: procedure.version, preferredPriority: "high",
        authorized: permitted("welding.procedure.approve", procedure.id, ["welding_authority"], [procedure.submittedBy], "step-up") });
      for (const qualification of qualifications.filter((candidate) => candidate.state === "under_review")) addTask({
        module: "welding", recordType: "welder_qualification", recordId: qualification.id,
        title: `Review welder qualification ${qualification.qualificationNumber}`, state: qualification.state,
        dueAt: qualification.validTo, action: "welding.qualification.approve", version: qualification.version, preferredPriority: "high",
        authorized: permitted("welding.qualification.approve", qualification.id, ["welding_authority"], [qualification.submittedBy, qualification.welderUserId], "step-up") });
      for (const weld of welds.filter((candidate) => candidate.state === "ready_for_release")) addTask({
        module: "welding", recordType: "weld_joint", recordId: weld.id, title: `Release weld ${weld.number}`,
        state: weld.state, dueAt: null, action: "welding.release", version: weld.version, preferredPriority: "high",
        authorized: permitted("welding.release", weld.id, ["welding_release_authority"],
          weld.events.filter((event) => ["weld_pass", "repair_weld", "visual_examination"].includes(event.eventType)).map((event) => event.performedBy), "step-up") });
      for (const request of ndeRequests.filter((candidate) => candidate.state === "requested")) addTask({
        module: "nde", recordType: "nde_request", recordId: request.id, title: `Perform ${request.methodCode} for ${request.number}`,
        state: request.state, dueAt: request.dueAt, action: "nde.perform", version: request.version, preferredPriority: "high",
        authorized: permitted("nde.perform", request.id, [request.requiredPersonnelQualification], [], "mfa") });
      for (const request of ndeRequests) for (const report of transaction.ndeReports(request.id).filter((candidate) => candidate.state === "submitted")) addTask({
        module: "nde", recordType: "nde_report", recordId: report.id, title: `Review ${request.methodCode} report ${report.revision}`,
        state: report.state, dueAt: request.dueAt, action: "nde.approve", version: report.version, preferredPriority: "high",
        authorized: permitted("nde.approve", report.id, ["nde_acceptance_authority"], [report.examinerUserId, report.submittedBy], "step-up") });
      for (const cycle of pwhtCycles.filter((candidate) => candidate.state === "submitted")) addTask({
        module: "nde", recordType: "pwht_cycle", recordId: cycle.id, title: `Review PWHT cycle ${cycle.number}`,
        state: cycle.state, dueAt: cycle.performedAt, action: "pwht.approve", version: cycle.version, preferredPriority: "high",
        authorized: permitted("pwht.approve", cycle.id, ["pwht_acceptance_authority"], [cycle.performedBy], "step-up") });
      for (const testPackage of testPackages.filter((candidate) => candidate.state === "submitted")) addTask({
        module: "testing", recordType: "test_package", recordId: testPackage.id, title: `Review test package ${testPackage.number}`,
        state: testPackage.state, dueAt: testPackage.performedAt, action: "testing.approve", version: testPackage.version, preferredPriority: "high",
        authorized: permitted("testing.approve", testPackage.id, ["testing_acceptance_authority"], [testPackage.performedBy ?? testPackage.createdBy], "step-up") });

      const fabricationAssemblies = transaction.fabricationAssemblies(project.id)
        .filter((record) => permitted("fabrication.read", record.id));
      const fabricationTravelers = transaction.fabricationTravelers(project.id)
        .filter((traveler) => fabricationAssemblies.some((assembly) => assembly.id === traveler.assemblyRevisionId));
      for (const assembly of fabricationAssemblies.filter((candidate) => candidate.state === "under_review")) addTask({
        module: "fabrication", recordType: "fabrication_assembly_revision", recordId: assembly.id,
        title: `Review fabrication ${assembly.number} revision ${assembly.revision}`, state: assembly.state, dueAt: null,
        action: "fabrication.approve", version: assembly.version, preferredPriority: "high",
        authorized: permitted("fabrication.approve", assembly.id, ["fabrication_engineering_authority"],
          [assembly.createdBy, assembly.submittedBy ?? assembly.createdBy], "step-up") });
      for (const assembly of fabricationAssemblies.filter((candidate) => candidate.state === "approved")) {
        const traveler = fabricationTravelers.find((candidate) => candidate.assemblyRevisionId === assembly.id);
        addTask({ module: "fabrication", recordType: traveler ? "fabrication_traveler" : "fabrication_assembly_revision",
          recordId: traveler?.id ?? assembly.id,
          title: traveler ? `Release traveler ${traveler.number} revision ${traveler.revision}` : `Create shop traveler for ${assembly.number}`,
          state: traveler?.state ?? assembly.state, dueAt: null,
          action: traveler ? "fabrication.release" : "fabrication.traveler.create", version: traveler?.version ?? assembly.version,
          preferredPriority: "high",
          authorized: traveler
            ? permitted("fabrication.release", assembly.id, ["fabrication_release_authority"],
              [assembly.createdBy, assembly.submittedBy ?? assembly.createdBy, assembly.reviewedBy ?? "", traveler.createdBy], "step-up")
            : permitted("fabrication.traveler.create", assembly.id, [], [], "mfa") });
      }
      for (const traveler of fabricationTravelers.filter((candidate) => candidate.state === "on_hold")) {
        const assembly = fabricationAssemblies.find((candidate) => candidate.id === traveler.assemblyRevisionId);
        const events = transaction.fabricationExecutionEvents(traveler.id);
        const heldOperation = traveler.operations.find((operation) => {
          const lastControlEvent = events.filter((event) => event.operationKey === operation.operationKey
            && ["hold", "release_hold"].includes(event.eventType)).at(-1);
          return lastControlEvent?.eventType === "hold";
        });
        if (!assembly || !heldOperation) continue;
        const operationActors = events.filter((event) => event.operationKey === heldOperation.operationKey).map((event) => event.performedBy);
        addTask({ module: "fabrication", recordType: "fabrication_traveler_operation",
          recordId: `${traveler.id}:${heldOperation.operationKey}`, title: `Release hold on ${traveler.number} · ${heldOperation.operationKey}`,
          state: traveler.state, dueAt: null, action: "fabrication.hold.release", version: traveler.version, preferredPriority: "critical",
          authorized: permitted("fabrication.hold.release", traveler.id, ["fabrication_hold_authority"], operationActors, "step-up") });
      }
      for (const assembly of fabricationAssemblies.filter((candidate) => candidate.state === "fabrication_complete")) {
        const traveler = fabricationTravelers.find((candidate) => candidate.assemblyRevisionId === assembly.id);
        const eventPerformers = traveler ? transaction.fabricationExecutionEvents(traveler.id).map((event) => event.performedBy) : [];
        addTask({ module: "fabrication", recordType: "fabrication_assembly_revision", recordId: assembly.id,
          title: `Accept completed fabrication ${assembly.number} revision ${assembly.revision}`, state: assembly.state, dueAt: null,
          action: "fabrication.accept", version: assembly.version, preferredPriority: "high",
          authorized: permitted("fabrication.accept", assembly.id, ["fabrication_quality_authority"],
            [assembly.createdBy, assembly.submittedBy ?? "", assembly.reviewedBy ?? "", assembly.releasedBy ?? "",
              traveler?.createdBy ?? "", ...eventPerformers], "step-up") });
      }

      const collaborationImports = transaction.collaborationImports(project.id);
      const collaborationItems = transaction.collaborationItems(project.id).filter((record) => permitted("collaboration.read", record.id));
      const reconciliationIssues = transaction.collaborationReconciliations(project.id)
        .filter((record) => permitted("collaboration.read", record.id));
      for (const item of collaborationItems.filter((candidate) => candidate.state === "submitted")) {
        const sourceImport = collaborationImports.find((candidate) => candidate.id === item.importId);
        addTask({ module: "bluebeam", recordType: "collaboration_item", recordId: item.id,
          title: `Review collaboration evidence: ${item.subject}`, state: item.state, dueAt: null,
          action: "collaboration.review", version: item.version, preferredPriority: "medium",
          authorized: permitted("collaboration.review", item.id, ["document_collaboration_authority"],
            [item.authorUserId, item.createdBy, sourceImport?.previewedBy ?? "", sourceImport?.committedBy ?? ""], "step-up") });
      }
      for (const issue of reconciliationIssues.filter((candidate) => candidate.state === "open")) {
        const sourceImport = collaborationImports.find((candidate) => candidate.id === issue.importId);
        addTask({ module: "bluebeam", recordType: "collaboration_reconciliation", recordId: issue.id,
          title: `Resolve collaboration issue: ${issue.code}`, state: issue.state, dueAt: null,
          action: "collaboration.reconcile", version: issue.version, preferredPriority: "high",
          authorized: permitted("collaboration.reconcile", issue.id, ["integration_authority"], [issue.createdBy, sourceImport?.previewedBy ?? ""], "step-up") });
      }

      const turnoverPackages = transaction.turnoverPackagesForProject(project.id)
        .filter((record) => permitted("turnover.read", record.id));
      for (const turnoverPackage of turnoverPackages.filter((candidate) => candidate.state === "ready")) addTask({
        module: "turnover", recordType: "turnover_package", recordId: turnoverPackage.id,
        title: `Generate turnover package ${turnoverPackage.code}`, state: turnoverPackage.state, dueAt: null,
        action: "turnover.generate", version: turnoverPackage.version, preferredPriority: "high",
        authorized: permitted("turnover.generate", turnoverPackage.id, [], [], "step-up") });

      const scheduleProgressPercent = acceptedProgress.length === 0 ? null
        : Math.round(acceptedProgress.reduce((total, value) => total + value, 0) / acceptedProgress.length);
      const executionTotal = ndeRequests.length + pwhtCycles.length + testPackages.length;
      const executionAccepted = ndeRequests.filter((record) => record.state === "accepted").length
        + pwhtCycles.filter((record) => record.state === "accepted").length
        + testPackages.filter((record) => record.state === "accepted").length;
      const openNcrs = ncrs.filter((record) => record.state !== "closed").length;
      const openPunches = punches.filter((record) => !["closed", "transferred"].includes(record.state)).length;
      const allOrderedTasks = [...tasks].sort((left, right) => {
        const rank = { critical: 0, high: 1, medium: 2, normal: 3 } as const;
        return rank[left.priority] - rank[right.priority]
          || (left.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER) - (right.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER)
          || left.id.localeCompare(right.id);
      });
      const orderedTasks = allOrderedTasks.slice(0, 100);

      const summaries: CommandCenterModuleSummary[] = [];
      const summary = (module: CommandCenterModule, label: string, total: number, completed: number, attention: number) => summaries.push({
        module, label, total, completed, attention, open: Math.max(0, total - completed), progressPercent: progressPercent(completed, total),
      });
      summary("documents", "Document control", documents.length,
        documents.filter((record) => record.currentRevisionId !== null).length,
        documentRevisions.filter(({ revision }) => ["under_review", "rejected"].includes(revision.state)).length);
      summary("materials", "Material traceability", materials.length,
        materials.filter((record) => ["released", "issued", "returned", "consumed"].includes(record.state)).length,
        materials.filter((record) => ["quarantined", "rejected"].includes(record.state)).length);
      summary("quality", "Quality / NCR / punch", ncrs.length + punches.length,
        ncrs.filter((record) => record.state === "closed").length + punches.filter((record) => ["closed", "transferred"].includes(record.state)).length,
        openNcrs + openPunches);
      summary("estimating", "Estimate handoffs", linkedEstimates.length,
        linkedEstimates.filter((record) => ["awarded", "closed"].includes(record.state)).length,
        linkedEstimates.filter((record) => record.state === "under_review").length);
      const controlRecords = [...baselines, ...changes, ...costEntries, ...progressClaims];
      summary("controls", "Project controls", controlRecords.length,
        controlRecords.filter((record) => ["approved", "accepted", "incorporated", "superseded"].includes(record.state)).length,
        controlRecords.filter((record) => ["under_review", "submitted", "rejected"].includes(record.state)).length);
      const procurementRecords = [...requisitions, ...bidPackages, ...commitments];
      summary("procurement", "Procurement", procurementRecords.length,
        procurementRecords.filter((record) => ["approved", "issued", "awarded", "received", "closed"].includes(record.state)).length,
        procurementRecords.filter((record) => ["under_review", "recommended", "exception", "rejected"].includes(record.state)).length);
      summary("scheduling", "Scheduling", scheduleActivities.length, completedScheduleActivities, lateScheduleActivities.length);
      summary("welding", "Weld management", welds.length, welds.filter((record) => record.state === "released").length,
        welds.filter((record) => ["repair_required", "pending_examination"].includes(record.state)).length);
      summary("nde", "NDE / PWHT", ndeRequests.length + pwhtCycles.length,
        ndeRequests.filter((record) => record.state === "accepted").length + pwhtCycles.filter((record) => record.state === "accepted").length,
        ndeRequests.filter((record) => ["requested", "rejected"].includes(record.state)).length + pwhtCycles.filter((record) => record.state === "rejected").length);
      summary("testing", "Testing", testPackages.length, testPackages.filter((record) => record.state === "accepted").length,
        testPackages.filter((record) => ["draft", "rejected"].includes(record.state)).length);
      summary("fabrication", "Fabrication & spools", fabricationAssemblies.length,
        fabricationAssemblies.filter((record) => ["accepted", "superseded"].includes(record.state)).length,
        fabricationAssemblies.filter((record) => ["under_review", "rejected", "fabrication_complete"].includes(record.state)
          || fabricationTravelers.some((traveler) => traveler.assemblyRevisionId === record.id && traveler.state === "on_hold")).length);
      summary("bluebeam", "Document collaboration", collaborationItems.length + reconciliationIssues.length,
        collaborationItems.filter((record) => ["accepted", "rejected"].includes(record.state)).length
          + reconciliationIssues.filter((record) => ["resolved", "waived"].includes(record.state)).length,
        collaborationItems.filter((record) => record.state === "submitted").length
          + reconciliationIssues.filter((record) => record.state === "open").length);
      summary("turnover", "Turnover", turnoverPackages.length,
        turnoverPackages.filter((record) => ["generated", "accepted", "superseded"].includes(record.state)).length,
        turnoverPackages.filter((record) => record.state === "draft").length);

      const activityVisible = permitted("audit.read", null, [], [], "mfa");
      const recentActivity = activityVisible ? transaction.auditForProject(project.id).slice(-30).reverse().map((audit) => ({
        id: audit.id, occurredAt: audit.occurredAt, actorUserId: audit.actorUserId, action: audit.action,
        module: moduleForObjectType(audit.objectType), objectType: audit.objectType, objectId: audit.objectId,
        priorState: audit.priorState, newState: audit.newState,
      })) : [];
      return {
        generatedAt: now,
        project: { id: project.id, number: project.number, name: project.name, state: project.state },
        metrics: {
          documentsCurrent: documents.filter((record) => record.currentRevisionId !== null).length,
          documentsTotal: documents.length,
          materialsTracked: materials.length,
          weldsComplete: welds.filter((record) => record.state === "released").length,
          weldsTotal: welds.length,
          executionAccepted,
          executionTotal,
          openExceptions: openNcrs + openPunches + commitments.filter((record) => record.state === "exception").length
            + reconciliationIssues.filter((record) => record.state === "open").length
            + fabricationAssemblies.filter((record) => record.state === "rejected"
              || fabricationTravelers.some((traveler) => traveler.assemblyRevisionId === record.id && traveler.state === "on_hold")).length,
          scheduleProgressPercent,
          openTasks: allOrderedTasks.length,
        },
        tasks: orderedTasks,
        recentActivity,
        activityVisible,
        modules: summaries,
        schedule: {
          sourceRevisionIds: currentScheduleRevisions.map(({ revision }) => revision.id),
          activityCount: scheduleActivities.length,
          completedActivities: completedScheduleActivities,
          lateActivities: lateScheduleActivities.length,
          progressPercent: scheduleProgressPercent,
        },
      };
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
