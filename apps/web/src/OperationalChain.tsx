import { type FormEvent, useEffect, useState } from "react";
import type { WorkTarget } from "./work-target.js";

type ChainStep = "documents" | "materials" | "quality" | "turnover" | "reports";

interface VersionedRecord {
  readonly id: string;
  readonly version: number;
  readonly state?: string;
}

interface DocumentRecord extends VersionedRecord {
  readonly number: string;
  readonly title: string;
}

interface RevisionRecord extends VersionedRecord {
  readonly revision: string;
}

interface MaterialRecord extends VersionedRecord {
  readonly identifier: string;
  readonly receiptNumber?: string; readonly purchaseReference?: string; readonly specification?: string; readonly grade?: string;
  readonly form?: string; readonly dimensions?: string; readonly quantity?: string; readonly unitCode?: string; readonly heatLot?: string;
  readonly storageLocation?: string; readonly mtrDocumentRevisionId?: string | null;
  readonly requirements?: { readonly mtrRequired: boolean; readonly mtrAccepted: boolean; readonly mtrReviewId: string | null;
    readonly receivingInspectionRequired?: boolean; readonly receivingInspectionAccepted?: boolean; readonly pmiRequired?: boolean;
    readonly pmiAccepted?: boolean; readonly governingPmiRule?: string | null; readonly openDispositionCount?: number };
}

interface GovernedFile extends VersionedRecord {
  readonly originalFilename: string;
  readonly validationState: "staged" | "validated" | "quarantined" | "released" | "rejected";
}

interface MaterialMovement {
  readonly id: string;
  readonly movementType: string;
  readonly fromLocation: string | null;
  readonly toLocation: string;
  readonly occurredAt: string;
}

interface ControlledReport {
  readonly id: string;
  readonly formCode: string;
  readonly title: string;
  readonly recordStatus: string;
  readonly revisionNumber: number;
  readonly filenameStem: string;
}

interface ReportDashboard {
  readonly generatedAt: string;
  readonly readiness: { readonly ready: boolean; readonly blockers: readonly string[] };
  readonly documents: Readonly<Record<string, number>>;
  readonly materials: {
    readonly total: number; readonly byState: Readonly<Record<string, number>>; readonly unlocated: number;
    readonly mtr: Readonly<Record<string, number>>; readonly pmi: Readonly<Record<string, number>>;
  };
  readonly qualificationExpirations: readonly { readonly sourceType: string; readonly sourceId: string; readonly daysRemaining: number }[];
  readonly exceptions: { readonly openNcrs: readonly unknown[]; readonly openPunchItems: readonly unknown[] };
  readonly subcontractors: readonly { readonly assignmentId: string; readonly mobilizationState: string }[];
  readonly turnover: readonly { readonly packageId: string; readonly state: string; readonly requirementCount: number; readonly generatedVersionCount: number }[];
  readonly privilegedAudit: { readonly total: number };
}

interface EquipmentRecord extends VersionedRecord {
  readonly identifier: string;
}

interface PmiRecordView extends VersionedRecord {
  readonly result: "pass" | "fail";
  readonly ncrId: string | null;
}

interface TurnoverVersion {
  readonly id: string;
  readonly versionNumber: number;
  readonly manifestSha256: string;
  readonly manifest: readonly unknown[];
}

interface ReadinessItem {
  readonly requirementCode: string;
  readonly status: string;
  readonly reason: string;
}

interface InspectionQueueRecord extends VersionedRecord {
  readonly planRevisionId: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly inspectorUserId: string;
  readonly performedAt: string;
  readonly result: "pass" | "fail";
  readonly acceptedBy: string | null;
  readonly rejectionReason: string | null;
}

interface NcrQueueRecord extends VersionedRecord {
  readonly number: string;
  readonly affectedObjectType: string;
  readonly affectedObjectId: string;
  readonly requirementReference: string;
  readonly description: string;
  readonly responsibleUserId: string;
  readonly turnoverRequired: boolean;
}

interface PunchQueueRecord extends VersionedRecord {
  readonly number: string;
  readonly type: string;
  readonly priority: string;
  readonly description: string;
  readonly ownerUserId: string;
  readonly systemId: string | null;
  readonly areaId: string | null;
  readonly workPackageId: string | null;
  readonly assetId: string | null;
  readonly turnoverRequired: boolean;
}

interface TurnoverQueueRecord extends VersionedRecord {
  readonly code: string;
  readonly completionBoundaryId: string;
  readonly recipientScope: string;
  readonly materialItemIds: readonly string[];
}

interface QualityExecutionWorkspace {
  readonly inspections: readonly InspectionQueueRecord[];
  readonly ncrs: readonly NcrQueueRecord[];
  readonly punches: readonly PunchQueueRecord[];
  readonly turnoverPackages: readonly TurnoverQueueRecord[];
}

interface OperationalChainProps {
  readonly projectId: string;
  readonly projectNumber: string;
  readonly initialStep: ChainStep;
  readonly workTarget: WorkTarget | null;
  readonly request: <T>(path: string, init?: RequestInit) => Promise<T>;
  readonly download: (path: string, filename: string) => Promise<void>;
  readonly working: boolean;
  readonly setWorking: (working: boolean) => void;
  readonly notify: (tone: "success" | "error", text: string) => void;
}

const steps: readonly { key: ChainStep; number: string; label: string; description: string }[] = [
  { key: "documents", number: "01", label: "Documents", description: "Controlled revision" },
  { key: "materials", number: "02", label: "Material", description: "Receipt and release" },
  { key: "quality", number: "03", label: "Quality", description: "PMI and exceptions" },
  { key: "turnover", number: "04", label: "Turnover", description: "Readiness and package" },
  { key: "reports", number: "05", label: "Reports", description: "Controlled snapshots" },
];
type MaterialFieldRole = "receiver" | "mtr_reviewer" | "pmi_technician" | "material_controller" | "exception_owner" | "release_authority" | "turnover_coordinator";
type QualityFieldRole = "inspector" | "inspection_reviewer" | "ncr_owner" | "ncr_authority" | "punch_owner" | "punch_verifier" | "completion_authority";
type QualityObjectKind = "inspection" | "ncr" | "punch";
const materialFieldRoles: readonly { readonly value: MaterialFieldRole; readonly label: string; readonly nextAction: string }[] = [
  { value: "receiver", label: "Receiving inspector", nextAction: "Verify receipt identity, condition, heat/lot, location, and required evidence." },
  { value: "mtr_reviewer", label: "MTR reviewer", nextAction: "Compare the exact released MTR revision to heat/lot, grade, and specification." },
  { value: "pmi_technician", label: "PMI technician", nextAction: "Use verified equipment and record the governed material observation." },
  { value: "material_controller", label: "Material controller", nextAction: "Issue, return, relocate, or preserve custody against the exact item." },
  { value: "exception_owner", label: "NCR / punch owner", nextAction: "Resolve the material-linked exception with owned evidence and independent verification." },
  { value: "release_authority", label: "Material release authority", nextAction: "Review all applicable receipt, MTR, PMI, NCR, and disposition gates." },
  { value: "turnover_coordinator", label: "Turnover coordinator", nextAction: "Carry the exact material, quality, exception, and audit identities into completion readiness." },
];
const qualityFieldRoles: readonly { readonly value: QualityFieldRole; readonly label: string; readonly nextAction: string }[] = [
  { value: "inspector", label: "Inspector / examiner", nextAction: "Capture required fields and evidence against the exact approved plan and target." },
  { value: "inspection_reviewer", label: "Inspection acceptance authority", nextAction: "Accept or reject a submitted result independently with explicit meaning." },
  { value: "ncr_owner", label: "NCR responsible owner", nextAction: "Propose disposition, corrective action, and reinspection evidence without closing your own work." },
  { value: "ncr_authority", label: "NCR disposition / close authority", nextAction: "Approve disposition and close only after independent reinspection evidence exists." },
  { value: "punch_owner", label: "Punch owner", nextAction: "Attach completion evidence and route the owned item for independent verification." },
  { value: "punch_verifier", label: "Punch verifier", nextAction: "Verify completion evidence independently from the owner and creator." },
  { value: "completion_authority", label: "Completion authority", nextAction: "Close verified punch items and carry resolved records into turnover readiness." },
];

const emptyQualityExecution: QualityExecutionWorkspace = { inspections: [], ncrs: [], punches: [], turnoverPackages: [] };

function ids(value: FormDataEntryValue | null): string[] {
  return String(value ?? "").split(/[\s,]+/u).map((item) => item.trim()).filter(Boolean);
}

function value(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

function checked(form: FormData, name: string): boolean {
  return form.get(name) === "on";
}

function stateLabel(state: string | undefined): string {
  return (state ?? "created").replaceAll("_", " ");
}

function materialReleaseGates(record: MaterialRecord): readonly { readonly label: string; readonly status: "accepted" | "pending" | "not_applicable" | "blocked" }[] {
  const requirements = record.requirements;
  if (!requirements) return [{ label: "Controlled requirements unavailable", status: "blocked" }];
  return [
    { label: "Receiving inspection", status: !requirements.receivingInspectionRequired ? "not_applicable" : requirements.receivingInspectionAccepted ? "accepted" : "pending" },
    { label: "Released MTR comparison", status: !requirements.mtrRequired ? "not_applicable" : requirements.mtrAccepted ? "accepted" : "pending" },
    { label: "PMI requirement", status: !requirements.pmiRequired ? "not_applicable" : requirements.pmiAccepted ? "accepted" : "pending" },
    { label: "Open dispositions", status: (requirements.openDispositionCount ?? 0) === 0 ? "accepted" : "blocked" },
  ];
}

export function OperationalChain({
  projectId, projectNumber, initialStep, workTarget, request, download, working, setWorking, notify,
}: OperationalChainProps) {
  const [step, setStep] = useState<ChainStep>(initialStep);
  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [revision, setRevision] = useState<RevisionRecord | null>(null);
  const [governedFile, setGovernedFile] = useState<GovernedFile | null>(null);
  const [uploadIdempotencyKey, setUploadIdempotencyKey] = useState(() => crypto.randomUUID());
  const [material, setMaterial] = useState<MaterialRecord | null>(null);
  const [materials, setMaterials] = useState<readonly MaterialRecord[]>([]);
  const [materialQuery, setMaterialQuery] = useState("");
  const [materialFieldRole, setMaterialFieldRole] = useState<MaterialFieldRole>("receiver");
  const [materialMovements, setMaterialMovements] = useState<readonly MaterialMovement[]>([]);
  const [equipment, setEquipment] = useState<EquipmentRecord | null>(null);
  const [pmi, setPmi] = useState<PmiRecordView | null>(null);
  const [pmiResult, setPmiResult] = useState<"pass" | "fail">("pass");
  const [ncr, setNcr] = useState<NcrQueueRecord | null>(null);
  const [punch, setPunch] = useState<PunchQueueRecord | null>(null);
  const [ncrDisposition, setNcrDisposition] = useState("");
  const [ncrCorrectiveAction, setNcrCorrectiveAction] = useState("");
  const [ncrEvidenceFileId, setNcrEvidenceFileId] = useState("");
  const [punchOwnerEvidenceIds, setPunchOwnerEvidenceIds] = useState("");
  const [punchVerificationEvidenceId, setPunchVerificationEvidenceId] = useState("");
  const [boundary, setBoundary] = useState<VersionedRecord | null>(null);
  const [requirements, setRequirements] = useState<readonly VersionedRecord[]>([]);
  const [turnoverPackage, setTurnoverPackage] = useState<TurnoverQueueRecord | null>(null);
  const [readiness, setReadiness] = useState<readonly ReadinessItem[]>([]);
  const [generated, setGenerated] = useState<TurnoverVersion | null>(null);
  const [qualityExecution, setQualityExecution] = useState<QualityExecutionWorkspace>(emptyQualityExecution);
  const [qualityQuery, setQualityQuery] = useState("");
  const [selectedQualityObject, setSelectedQualityObject] = useState<{ readonly kind: QualityObjectKind; readonly id: string } | null>(null);
  const [qualityFieldRole, setQualityFieldRole] = useState<QualityFieldRole>("inspector");
  const [qualityDecisionNote, setQualityDecisionNote] = useState("");
  const [turnoverQuery, setTurnoverQuery] = useState("");
  const [reports, setReports] = useState<readonly ControlledReport[]>([]);
  const [dashboard, setDashboard] = useState<ReportDashboard | null>(null);

  useEffect(() => setStep(initialStep), [initialStep]);
  useEffect(() => {
    setDocument(null); setRevision(null); setGovernedFile(null); setMaterial(null); setMaterials([]); setMaterialQuery(""); setMaterialMovements([]); setEquipment(null); setPmi(null);
    setPmiResult("pass");
    setNcr(null); setPunch(null); setBoundary(null); setRequirements([]); setTurnoverPackage(null);
    setReadiness([]); setGenerated(null); setQualityExecution(emptyQualityExecution); setQualityQuery(""); setSelectedQualityObject(null); setTurnoverQuery("");
    setReports([]); setDashboard(null);
  }, [projectId]);

  useEffect(() => {
    if (!["materials", "quality", "turnover"].includes(step)) return;
    let active = true;
    request<readonly MaterialRecord[]>(`/v1/projects/${projectId}/materials`)
      .then((records) => {
        if (!active) return;
        setMaterials(records);
        setMaterial((current) => records.find((item) => item.id === current?.id) ?? records[0] ?? current);
      })
      .catch((error: unknown) => { if (active) notify("error", error instanceof Error ? error.message : "Material object lookup failed."); });
    return () => { active = false; };
  }, [notify, projectId, request, step]);

  useEffect(() => {
    if (step !== "quality" && step !== "turnover") return;
    let active = true;
    request<QualityExecutionWorkspace>(`/v1/projects/${projectId}/quality-execution`)
      .then((workspace) => {
        if (!active) return;
        setQualityExecution(workspace);
        setSelectedQualityObject((current) => {
          if (current && (current.kind === "inspection" ? workspace.inspections : current.kind === "ncr" ? workspace.ncrs : workspace.punches).some((record) => record.id === current.id)) return current;
          const first = workspace.inspections[0] ?? workspace.ncrs[0] ?? workspace.punches[0];
          return first ? { kind: workspace.inspections.includes(first as InspectionQueueRecord) ? "inspection" : workspace.ncrs.includes(first as NcrQueueRecord) ? "ncr" : "punch", id: first.id } : null;
        });
        setTurnoverPackage((current) => workspace.turnoverPackages.find((record) => record.id === current?.id) ?? workspace.turnoverPackages[0] ?? current);
      })
      .catch((error: unknown) => { if (active) notify("error", error instanceof Error ? error.message : "Quality execution lookup failed."); });
    return () => { active = false; };
  }, [notify, projectId, request, step]);

  useEffect(() => {
    if (!workTarget) return;
    const qualityKind: QualityObjectKind | null = workTarget.recordType === "inspection_record" ? "inspection"
      : workTarget.recordType === "ncr" ? "ncr" : workTarget.recordType === "punch_item" ? "punch" : null;
    if (qualityKind) {
      setStep("quality"); setQualityQuery(workTarget.recordId); setSelectedQualityObject({ kind: qualityKind, id: workTarget.recordId });
      return;
    }
    if (workTarget.recordType === "turnover_package") {
      setStep("turnover"); setTurnoverQuery(workTarget.recordId);
      const target = qualityExecution.turnoverPackages.find((record) => record.id === workTarget.recordId);
      if (target) setTurnoverPackage(target);
    }
  }, [qualityExecution.turnoverPackages, workTarget]);

  const filteredMaterials = materials.filter((item) => {
    const query = materialQuery.trim().toLocaleLowerCase();
    return !query || [item.id, item.identifier, item.receiptNumber, item.purchaseReference, item.heatLot, item.storageLocation]
      .some((candidate) => candidate?.toLocaleLowerCase().includes(query));
  });
  const activeMaterialFieldRole = materialFieldRoles.find((item) => item.value === materialFieldRole) ?? materialFieldRoles[0]!;
  const qualityObjects = [
    ...qualityExecution.inspections.map((record) => ({ kind: "inspection" as const, id: record.id, label: `Inspection ${record.id.slice(0, 8)}`, context: `${record.targetType} · ${record.targetId}`, state: record.state, record })),
    ...qualityExecution.ncrs.map((record) => ({ kind: "ncr" as const, id: record.id, label: record.number, context: `${record.affectedObjectType} · ${record.affectedObjectId}`, state: record.state, record })),
    ...qualityExecution.punches.map((record) => ({ kind: "punch" as const, id: record.id, label: record.number, context: `${record.type} · ${record.assetId ?? record.workPackageId ?? record.systemId ?? record.areaId ?? "scope pending"}`, state: record.state, record })),
  ];
  const filteredQualityObjects = qualityObjects.filter((item) => {
    const query = qualityQuery.trim().toLocaleLowerCase();
    return !query || [item.id, item.kind, item.label, item.context, item.state].some((candidate) => candidate?.toLocaleLowerCase().includes(query));
  });
  const activeQualityObject = qualityObjects.find((item) => item.kind === selectedQualityObject?.kind && item.id === selectedQualityObject.id) ?? null;
  const activeQualityFieldRole = qualityFieldRoles.find((item) => item.value === qualityFieldRole) ?? qualityFieldRoles[0]!;
  const filteredTurnoverPackages = qualityExecution.turnoverPackages.filter((record) => {
    const query = turnoverQuery.trim().toLocaleLowerCase();
    return !query || [record.id, record.code, record.recipientScope, record.completionBoundaryId, record.state]
      .some((candidate) => candidate?.toLocaleLowerCase().includes(query));
  });

  function applyMaterial(next: MaterialRecord) {
    setMaterial(next);
    setMaterials((current) => [next, ...current.filter((item) => item.id !== next.id)]);
  }

  function applyNcr(next: NcrQueueRecord) {
    setNcr(next);
    setQualityExecution((current) => ({ ...current, ncrs: [next, ...current.ncrs.filter((item) => item.id !== next.id)] }));
    setSelectedQualityObject({ kind: "ncr", id: next.id });
  }

  function applyPunch(next: PunchQueueRecord) {
    setPunch(next);
    setQualityExecution((current) => ({ ...current, punches: [next, ...current.punches.filter((item) => item.id !== next.id)] }));
    setSelectedQualityObject({ kind: "punch", id: next.id });
  }

  function applyTurnoverPackage(next: TurnoverQueueRecord) {
    setTurnoverPackage(next);
    setQualityExecution((current) => ({ ...current, turnoverPackages: [next, ...current.turnoverPackages.filter((item) => item.id !== next.id)] }));
  }

  async function execute<T>(description: string, action: () => Promise<T>, apply: (result: T) => void) {
    setWorking(true);
    try {
      const result = await action();
      apply(result);
      notify("success", description);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : `${description} failed.`);
    } finally {
      setWorking(false);
    }
  }

  function registerDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void execute("Controlled document registered.", () => request<DocumentRecord>(`/v1/projects/${projectId}/documents`, {
      method: "POST", body: JSON.stringify({
        number: value(form, "number"), title: value(form, "title"),
        type: value(form, "type"), discipline: value(form, "discipline"),
      }),
    }), setDocument);
  }

  function uploadGovernedFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || file.size < 1) return;
    const payload = new FormData();
    payload.append("file", file, file.name);
    void execute("File bytes entered the private staged boundary and processing was queued.", () =>
      request<GovernedFile>(`/v1/projects/${projectId}/file-uploads`, {
        method: "POST", body: payload,
        headers: {
          "x-eiep-retention-class": value(form, "retentionClass"),
          "x-idempotency-key": uploadIdempotencyKey,
        },
      }), (uploaded) => { setGovernedFile(uploaded); setUploadIdempotencyKey(crypto.randomUUID()); });
  }

  function refreshGovernedFile() {
    if (!governedFile) return;
    void execute("Governed file status refreshed.", () => request<GovernedFile>(`/v1/files/${governedFile.id}`), setGovernedFile);
  }

  function releaseGovernedFile() {
    if (!governedFile) return;
    void execute("Validated file released by a separately qualified authority.", () => request<GovernedFile>(
      `/v1/files/${governedFile.id}/release`, {
        method: "POST", body: JSON.stringify({ expectedVersion: governedFile.version }),
      },
    ), setGovernedFile);
  }

  function submitRevision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!document || !governedFile || governedFile.validationState !== "released") return;
    const form = new FormData(event.currentTarget);
    void execute("Revision submitted with an exact validated file reference.", () => request<RevisionRecord>(
      `/v1/documents/${document.id}/revisions`, {
        method: "POST", body: JSON.stringify({
          revision: value(form, "revision"), purpose: value(form, "purpose"), source: value(form, "source"),
          fileId: governedFile.id,
          requiredApprovalCount: Number(value(form, "requiredApprovalCount")),
        }),
      },
    ), setRevision);
  }

  function approveRevision() {
    if (!revision) return;
    void execute("Revision approval recorded; use a distinct authorized identity where policy requires.", () =>
      request<RevisionRecord>(`/v1/revisions/${revision.id}/approve`, {
        method: "POST", body: JSON.stringify({ expectedVersion: revision.version, independentApprovalRequired: true }),
      }), setRevision);
  }

  function releaseRevision() {
    if (!revision || !document) return;
    void execute("Revision released as current-for-work after server revalidation.", () =>
      request<RevisionRecord>(`/v1/revisions/${revision.id}/release`, {
        method: "POST", body: JSON.stringify({
          expectedRevisionVersion: revision.version, expectedDocumentVersion: document.version,
        }),
      }), (released) => { setRevision(released); setDocument({ ...document, version: document.version + 1 }); });
  }

  function receiveMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void execute("Material receipt captured against the exact approved project configuration.", () =>
      request<MaterialRecord>(`/v1/projects/${projectId}/materials`, {
        method: "POST", body: JSON.stringify({
          projectConfigurationRevisionId: value(form, "projectConfigurationRevisionId"),
          identifier: value(form, "identifier"), receiptNumber: value(form, "receiptNumber"),
          purchaseReference: value(form, "purchaseReference"), vendorOrganizationId: value(form, "vendorOrganizationId"),
          specification: value(form, "specification"), grade: value(form, "grade"), form: value(form, "form"),
          dimensions: value(form, "dimensions"), quantity: value(form, "quantity"), unitCode: value(form, "unitCode"),
          heatLot: value(form, "heatLot"), mtrDocumentRevisionId: value(form, "mtrDocumentRevisionId") || null,
          receiptEvidenceFileIds: ids(form.get("receiptEvidenceFileIds")), storageLocation: value(form, "storageLocation"),
          mtrRequired: checked(form, "mtrRequired"), receivingInspectionRequired: checked(form, "receivingInspectionRequired"),
          pmiRequired: checked(form, "pmiRequired"), governingPmiRule: value(form, "governingPmiRule") || null,
        }),
      }), applyMaterial);
  }

  function acceptReceivingInspection() {
    if (!material) return;
    void execute("Receiving inspection accepted.", () => request<MaterialRecord>(
      `/v1/materials/${material.id}/receiving-inspection/accept`, {
        method: "POST", body: JSON.stringify({ expectedVersion: material.version }),
      },
    ), applyMaterial);
  }

  function reviewMtr(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!material) return;
    const form = new FormData(event.currentTarget);
    void execute("Independent MTR review accepted against the exact released revision.", () => request<{
      readonly material: MaterialRecord;
    }>(`/v1/materials/${material.id}/mtr-reviews`, {
      method: "POST", body: JSON.stringify({
        expectedVersion: material.version, decision: "accepted", heatLotVerified: checked(form, "heatLotVerified"),
        gradeVerified: checked(form, "gradeVerified"), specificationVerified: checked(form, "specificationVerified"),
        reviewNotes: value(form, "reviewNotes"), evidenceFileIds: ids(form.get("evidenceFileIds")),
      }),
    }), (result) => applyMaterial(result.material));
  }

  function issueMaterial() {
    if (!material) return;
    void execute("Material issued with an immutable custody event.", () => request<MaterialRecord>(
      `/v1/materials/${material.id}/issue`, { method: "POST", body: JSON.stringify({ expectedVersion: material.version }) },
    ), applyMaterial);
  }

  function returnMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!material) return;
    const form = new FormData(event.currentTarget);
    void execute("Unused material returned to controlled storage.", () => request<MaterialRecord>(
      `/v1/materials/${material.id}/return`, { method: "POST", body: JSON.stringify({
        expectedVersion: material.version, toLocation: value(form, "toLocation"), reason: value(form, "reason"),
      }) },
    ), applyMaterial);
  }

  function moveMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!material) return;
    const form = new FormData(event.currentTarget);
    void execute("Material storage location changed with immutable history.", () => request<MaterialRecord>(
      `/v1/materials/${material.id}/move`, { method: "POST", body: JSON.stringify({
        expectedVersion: material.version, toLocation: value(form, "toLocation"), reason: value(form, "reason"),
      }) },
    ), applyMaterial);
  }

  function refreshMaterialMovements() {
    if (!material) return;
    void execute("Material movement history refreshed.", () => request<readonly MaterialMovement[]>(
      `/v1/materials/${material.id}/movements`,
    ), setMaterialMovements);
  }

  function registerEquipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void execute("Verified inspection equipment registered.", () => request<EquipmentRecord>(
      `/v1/projects/${projectId}/inspection-equipment`, {
        method: "POST", body: JSON.stringify({
          identifier: value(form, "identifier"), serialNumber: value(form, "serialNumber"),
          methodCapabilities: ids(form.get("methodCapabilities")), verificationState: "passed",
          validFrom: new Date(value(form, "validFrom")).toISOString(), validTo: new Date(value(form, "validTo")).toISOString(),
          evidenceFileId: value(form, "evidenceFileId"),
        }),
      },
    ), setEquipment);
  }

  function recordPmi(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!material || !equipment) return;
    const form = new FormData(event.currentTarget);
    void execute(pmiResult === "fail" ? "Failed PMI recorded; the material was atomically quarantined with its NCR." : "PMI result submitted for independent acceptance.", () => request<PmiRecordView>(
      `/v1/materials/${material.id}/pmi`, {
        method: "POST", body: JSON.stringify({
          governingRule: value(form, "governingRule"), requiredMaterial: value(form, "requiredMaterial"),
          observedMaterial: value(form, "observedMaterial"), method: value(form, "method"),
          componentLocation: value(form, "componentLocation"), equipmentId: equipment.id,
          inspectedAt: new Date(value(form, "inspectedAt")).toISOString(),
          readings: { result: value(form, "reading") }, evidenceFileIds: ids(form.get("evidenceFileIds")),
          notes: value(form, "notes"), result: pmiResult,
          ...(pmiResult === "fail" ? {
            failedNcrNumber: value(form, "failedNcrNumber"),
            failureDescription: value(form, "failureDescription"),
            containment: value(form, "failureContainment"),
            failureResponsibleUserId: value(form, "failureResponsibleUserId"),
            turnoverRequired: checked(form, "failureTurnoverRequired"),
          } : {}),
        }),
      },
    ), (recorded) => {
      setPmi(recorded);
      if (recorded.result === "fail" && recorded.ncrId) {
        applyNcr({
          id: recorded.ncrId, number: value(form, "failedNcrNumber"), state: "open", version: 1,
          affectedObjectType: "material", affectedObjectId: material.id,
          requirementReference: value(form, "governingRule"), description: value(form, "failureDescription"),
          responsibleUserId: value(form, "failureResponsibleUserId"), turnoverRequired: checked(form, "failureTurnoverRequired"),
        });
        applyMaterial({ ...material, state: "quarantined", version: material.version + 1 });
      }
    });
  }

  function acceptPmi() {
    if (!pmi || !material) return;
    void execute("PMI accepted by an independently authorized identity.", () => request<PmiRecordView>(
      `/v1/pmi/${pmi.id}/accept`, { method: "POST", body: JSON.stringify({ expectedVersion: pmi.version }) },
    ), (accepted) => { setPmi(accepted); applyMaterial({ ...material, version: material.version + 1 }); });
  }

  function releaseMaterial() {
    if (!material) return;
    void execute("Material released after all applicability and quality checks passed.", () => request<MaterialRecord>(
      `/v1/materials/${material.id}/release`, { method: "POST", body: JSON.stringify({ expectedVersion: material.version }) },
    ), applyMaterial);
  }

  function createNcr(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!material) return;
    const form = new FormData(event.currentTarget);
    void execute("NCR opened and affected material quarantined.", () => request<NcrQueueRecord>(
      `/v1/projects/${projectId}/ncrs`, { method: "POST", body: JSON.stringify({
        number: value(form, "number"), affectedObjectType: "material", affectedObjectId: material.id,
        requirementReference: value(form, "requirementReference"), description: value(form, "description"),
        containment: value(form, "containment"), evidenceFileIds: ids(form.get("evidenceFileIds")),
        responsibleUserId: value(form, "responsibleUserId"), turnoverRequired: checked(form, "turnoverRequired"),
      }) },
    ), (created) => { applyNcr(created); applyMaterial({ ...material, state: "quarantined", version: material.version + 1 }); });
  }

  function advanceNcr(action: "disposition" | "approve" | "reinspection" | "close", extra: Record<string, unknown>) {
    if (!ncr) return;
    const path = action === "disposition" ? "disposition" : action === "approve" ? "disposition/approve" : action;
    void execute(`NCR ${action} recorded after fresh authorization.`, () => request<NcrQueueRecord>(
      `/v1/ncrs/${ncr.id}/${path}`, { method: "POST", body: JSON.stringify({ expectedVersion: ncr.version, ...extra }) },
    ), (updated) => { applyNcr(updated); if (action === "close" && material) applyMaterial({ ...material, version: material.version + 1 }); });
  }

  function createPunch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!material) return;
    const form = new FormData(event.currentTarget);
    void execute("Punch item opened in the selected material scope.", () => request<PunchQueueRecord>(
      `/v1/projects/${projectId}/punch-items`, { method: "POST", body: JSON.stringify({
        number: value(form, "number"), type: value(form, "type"), priority: value(form, "priority"),
        systemId: null, areaId: null, workPackageId: null, assetId: material.id,
        description: value(form, "description"), ownerUserId: value(form, "ownerUserId"), targetAt: null,
        turnoverRequired: checked(form, "turnoverRequired"),
      }) },
    ), applyPunch);
  }

  function advancePunch(action: "owner-update" | "verify" | "close", extra: Record<string, unknown>) {
    if (!punch) return;
    void execute(`Punch ${action} recorded after fresh authorization.`, () => request<PunchQueueRecord>(
      `/v1/punch-items/${punch.id}/${action}`, {
        method: "POST", body: JSON.stringify({ expectedVersion: punch.version, ...extra }),
      },
    ), applyPunch);
  }

  function createBoundary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void execute("Completion boundary created.", () => request<VersionedRecord>(
      `/v1/projects/${projectId}/completion-boundaries`, { method: "POST", body: JSON.stringify({
        boundaryType: value(form, "boundaryType"), code: value(form, "code"), name: value(form, "name"),
      }) },
    ), setBoundary);
  }

  function addRequirement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!boundary) return;
    const form = new FormData(event.currentTarget);
    void execute("Turnover requirement added to the controlled boundary.", () => request<VersionedRecord>(
      `/v1/completion-boundaries/${boundary.id}/turnover-requirements`, { method: "POST", body: JSON.stringify({
        code: value(form, "code"), recordClass: value(form, "recordClass"), required: true,
        notApplicableAllowed: checked(form, "notApplicableAllowed"), acceptanceAuthority: value(form, "acceptanceAuthority"),
      }) },
    ), (created) => setRequirements((current) => [...current, created]));
  }

  function createPackage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!boundary) return;
    const form = new FormData(event.currentTarget);
    void execute("Turnover package baseline created with exact material IDs.", () => request<TurnoverQueueRecord>(
      `/v1/completion-boundaries/${boundary.id}/turnover-packages`, { method: "POST", body: JSON.stringify({
        code: value(form, "code"), recipientScope: value(form, "recipientScope"),
        materialItemIds: ids(form.get("materialItemIds")),
      }) },
    ), applyTurnoverPackage);
  }

  function selectQualityObject(item: typeof qualityObjects[number]) {
    setSelectedQualityObject({ kind: item.kind, id: item.id });
    if (item.kind === "ncr") setNcr(item.record);
    if (item.kind === "punch") setPunch(item.record);
  }

  function reviewSelectedInspection(decision: "accept" | "reject") {
    if (!activeQualityObject || activeQualityObject.kind !== "inspection") return;
    const inspection = activeQualityObject.record;
    void execute(`Inspection ${decision} decision recorded independently.`, () => request<InspectionQueueRecord>(
      `/v1/inspections/${inspection.id}/review`, {
        method: "POST",
        body: JSON.stringify({ expectedVersion: inspection.version, decision, meaningOrReason: qualityDecisionNote.trim() }),
      },
    ), (updated) => {
      setQualityExecution((current) => ({ ...current, inspections: [updated, ...current.inspections.filter((item) => item.id !== updated.id)] }));
      setSelectedQualityObject({ kind: "inspection", id: updated.id });
      setQualityDecisionNote("");
    });
  }

  function checkReadiness() {
    if (!turnoverPackage) return;
    void execute("Turnover readiness recalculated from authoritative records.", () => request<readonly ReadinessItem[]>(
      `/v1/turnover-packages/${turnoverPackage.id}/readiness`,
    ), setReadiness);
  }

  function generateTurnover() {
    if (!turnoverPackage) return;
    void execute("Immutable turnover package version generated.", () => request<TurnoverVersion>("/v1/turnover/generate", {
      method: "POST", body: JSON.stringify({ packageId: turnoverPackage.id, projectId }),
    }), setGenerated);
  }

  function refreshReports() {
    void execute("Controlled report register refreshed.", () => request<readonly ControlledReport[]>(
      `/v1/projects/${projectId}/reports`,
    ), setReports);
  }

  function refreshDashboard() {
    void execute("Operational dashboard recalculated from authoritative records.", () => request<ReportDashboard>(
      `/v1/projects/${projectId}/report-dashboard`,
    ), setDashboard);
  }

  function generateReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void execute("Immutable controlled report snapshot generated.", () => request<ControlledReport>(
      `/v1/projects/${projectId}/reports`, { method: "POST", body: JSON.stringify({
        formCode: value(form, "formCode"), targetId: value(form, "targetId"),
      }) },
    ), (report) => setReports((current) => [...current, report]));
  }

  function downloadReport(report: ControlledReport, format: "html" | "json") {
    setWorking(true);
    void download(`/v1/reports/${report.id}/download?format=${format}`, `${report.filenameStem}.${format}`)
      .then(() => notify("success", `${format.toUpperCase()} controlled snapshot downloaded.`))
      .catch((error: unknown) => notify("error", error instanceof Error ? error.message : "Report download failed."))
      .finally(() => setWorking(false));
  }

  return <section className="workflow" aria-labelledby="workflow-heading">
    <div className="workflow-heading"><div><p className="section-label">Operational chain</p><h2 id="workflow-heading">Guided controlled execution - {projectNumber}</h2></div>
      <span className="policy-chip">Online authority required</span></div>
    <ol className="workflow-steps" aria-label="Operational chain steps">
      {steps.map((item) => <li key={item.key} className={step === item.key ? "is-active" : ""}>
        <button type="button" onClick={() => setStep(item.key)} aria-current={step === item.key ? "step" : undefined}>
          <span>{item.number}</span><strong>{item.label}</strong><small>{item.description}</small>
        </button>
      </li>)}
    </ol>

    {step === "materials" ? <section className="field-object-console material-object-console" aria-labelledby="material-object-heading">
      <div className="field-object-heading"><div><p className="section-label">Object-first traceability</p><h3 id="material-object-heading">Find the material, inherit every release requirement</h3>
        <p>Scan or enter an item, heat/lot, receipt, purchase reference, location, or stable ID. The exact MTR, receipt, PMI, disposition, custody, exception, and turnover context stays attached to the authoritative material object.</p></div><span className="policy-chip">No duplicate field record</span></div>
      <div className="field-object-layout">
        <aside className="field-object-finder" aria-label="Material object lookup"><label>Scan / enter material identity<input type="search" value={materialQuery} onChange={(event) => setMaterialQuery(event.target.value)} placeholder="Item, heat, receipt, PO, location…" /></label>
          <div className="field-object-results" aria-live="polite">{filteredMaterials.map((item) => <button key={item.id} type="button" className={material?.id === item.id ? "is-selected" : ""} onClick={() => applyMaterial(item)}><span><strong>{item.identifier}</strong><small>{item.heatLot ?? item.receiptNumber ?? item.id} · {item.storageLocation ?? "Location pending"}</small></span><span className={`state-badge state-${item.state}`}>{stateLabel(item.state)}</span></button>)}</div>
          {filteredMaterials.length === 0 ? <p className="muted">No authorized material matches that identity. Receive a controlled item below or verify assignment scope.</p> : null}</aside>
        <article className="field-object-record" aria-label="Selected material object">{material ? <><div className="field-object-title"><div><span className="record-type">Material object</span><h4>{material.identifier}</h4><p>{material.specification ?? "Specification pending"} · {material.grade ?? "Grade pending"} · heat/lot {material.heatLot ?? "pending"}</p></div><span className={`state-badge state-${material.state}`}>{stateLabel(material.state)}</span></div>
          <dl className="field-object-facts"><div><dt>Receipt / purchase</dt><dd>{material.receiptNumber ?? "Pending"} · {material.purchaseReference ?? "Pending"}</dd></div><div><dt>Form / dimensions</dt><dd>{material.form ?? "Pending"} · {material.dimensions ?? "Pending"}</dd></div>
            <div><dt>Quantity</dt><dd>{material.quantity ?? "Pending"} {material.unitCode ?? ""}</dd></div><div><dt>Custody location</dt><dd>{material.storageLocation ?? "Pending"}</dd></div>
            <div><dt>Exact released MTR</dt><dd>{material.mtrDocumentRevisionId ?? "Not linked / not applicable"}</dd></div><div><dt>PMI rule</dt><dd>{material.requirements?.governingPmiRule ?? "Not applicable"}</dd></div>
            <div><dt>Material NCR</dt><dd>{ncr ? `${ncr.id} · ${stateLabel(ncr.state)}` : "No active session exception"}</dd></div><div><dt>Material punch</dt><dd>{punch ? `${punch.id} · ${stateLabel(punch.state)}` : "No active session punch"}</dd></div>
            <div><dt>Turnover package</dt><dd>{turnoverPackage ? `${turnoverPackage.id} · ${stateLabel(turnoverPackage.state)}` : "Not yet baselined"}</dd></div><div><dt>Generated record</dt><dd>{generated ? `Version ${generated.versionNumber} · ${generated.manifestSha256.slice(0, 12)}…` : "Not generated"}</dd></div></dl>
          <div className="material-gate-grid" aria-label="Material release gates">{materialReleaseGates(material).map((gate) => <div key={gate.label} className={`gate-${gate.status}`}><strong>{gate.label}</strong><span>{stateLabel(gate.status)}</span></div>)}</div>
          <details open><summary>Custody and status history</summary>{materialMovements.length ? <ol className="field-event-timeline">{materialMovements.map((movement) => <li key={movement.id}><span aria-hidden="true">M</span><div><strong>{stateLabel(movement.movementType)}</strong><small>{movement.fromLocation ?? "External receipt"} → {movement.toLocation} · {movement.occurredAt}</small></div></li>)}</ol> : <p className="muted">Refresh history to retrieve the authoritative movement chain.</p>}</details>
        </> : <div className="empty-state"><strong>No material selected</strong><p>Choose an authorized object or receive a new item through the controlled workflow.</p></div>}</article>
        <aside className="field-role-actions" aria-label="Material role-based actions"><label>Field role context<select aria-label="Material field role context" value={materialFieldRole} onChange={(event) => setMaterialFieldRole(event.target.value as MaterialFieldRole)}>{materialFieldRoles.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <p>{activeMaterialFieldRole.nextAction}</p><div className="review-boundary-note"><strong>Server authority remains decisive</strong><p>The field role controls presentation only. Current assignment, qualification, assurance, independence, project scope, and object version are revalidated for every action.</p></div>
          {materialFieldRole === "receiver" ? <button className="primary-button" type="button" onClick={acceptReceivingInspection} disabled={working || !material || material.state !== "received_pending" || material.requirements?.receivingInspectionAccepted}>Accept receiving inspection</button> : null}
          {materialFieldRole === "mtr_reviewer" ? <button className="primary-button" type="button" onClick={() => setStep("materials")} disabled={!material}>Open exact MTR comparison</button> : null}
          {materialFieldRole === "pmi_technician" ? <button className="primary-button" type="button" onClick={() => setStep("quality")} disabled={!material}>Open governed PMI capture</button> : null}
          {materialFieldRole === "material_controller" ? <><button className="secondary-button" type="button" onClick={refreshMaterialMovements} disabled={working || !material}>Refresh custody history</button><button className="primary-button" type="button" onClick={issueMaterial} disabled={working || !material || !["released", "returned"].includes(material.state ?? "")}>Issue exact material</button></> : null}
          {materialFieldRole === "exception_owner" ? <button className="primary-button" type="button" onClick={() => setStep("quality")} disabled={!material}>Open linked NCR / punch controls</button> : null}
          {materialFieldRole === "release_authority" ? <button className="primary-button" type="button" onClick={releaseMaterial} disabled={working || !material || material.state !== "received_pending" || materialReleaseGates(material).some((gate) => gate.status === "pending" || gate.status === "blocked")}>Independently release material</button> : null}
          {materialFieldRole === "turnover_coordinator" ? <button className="primary-button" type="button" onClick={() => setStep("turnover")} disabled={!material}>Open material turnover readiness</button> : null}
        </aside>
      </div>
    </section> : null}

    {step === "quality" ? <section className="field-object-console quality-object-console" aria-labelledby="quality-object-heading">
      <div className="field-object-heading"><div><p className="section-label">Object-first quality execution</p><h3 id="quality-object-heading">Find the inspection or exception, then perform the authorized work</h3>
        <p>Search inspection, NCR, and punch identities without recreating the record. The selected object carries its target, result, state, owner, evidence stage, version, and turnover consequence into the role action.</p></div><span className="policy-chip">Current version revalidated</span></div>
      <div className="field-object-layout">
        <aside className="field-object-finder" aria-label="Quality object lookup"><label>Scan / enter quality identity<input type="search" value={qualityQuery} onChange={(event) => setQualityQuery(event.target.value)} placeholder="Inspection, NCR, punch, target…" /></label>
          <div className="field-object-results" aria-live="polite">{filteredQualityObjects.map((item) => <button key={`${item.kind}:${item.id}`} type="button" className={activeQualityObject?.kind === item.kind && activeQualityObject.id === item.id ? "is-selected" : ""} onClick={() => selectQualityObject(item)}><span><strong>{item.label}</strong><small>{item.kind.toUpperCase()} · {item.context}</small></span><span className={`state-badge state-${item.state}`}>{stateLabel(item.state)}</span></button>)}</div>
          {filteredQualityObjects.length === 0 ? <p className="muted">No authorized quality object matches that identity. Use the controlled capture forms below or verify assignment scope.</p> : null}</aside>
        <article className="field-object-record" aria-label="Selected quality object">{activeQualityObject ? <><div className="field-object-title"><div><span className="record-type">{activeQualityObject.kind}</span><h4>{activeQualityObject.label}</h4><p>{activeQualityObject.context}</p></div><span className={`state-badge state-${activeQualityObject.state}`}>{stateLabel(activeQualityObject.state)}</span></div>
          {activeQualityObject.kind === "inspection" ? <dl className="field-object-facts"><div><dt>Target</dt><dd>{activeQualityObject.record.targetType} · {activeQualityObject.record.targetId}</dd></div><div><dt>Result</dt><dd>{activeQualityObject.record.result}</dd></div><div><dt>Plan revision</dt><dd>{activeQualityObject.record.planRevisionId}</dd></div><div><dt>Inspector</dt><dd>{activeQualityObject.record.inspectorUserId}</dd></div><div><dt>Performed</dt><dd>{activeQualityObject.record.performedAt}</dd></div><div><dt>Accepted by</dt><dd>{activeQualityObject.record.acceptedBy ?? "Awaiting independent review"}</dd></div></dl> : null}
          {activeQualityObject.kind === "ncr" ? <dl className="field-object-facts"><div><dt>Affected object</dt><dd>{activeQualityObject.record.affectedObjectType} · {activeQualityObject.record.affectedObjectId}</dd></div><div><dt>Requirement</dt><dd>{activeQualityObject.record.requirementReference}</dd></div><div><dt>Responsible owner</dt><dd>{activeQualityObject.record.responsibleUserId}</dd></div><div><dt>Turnover</dt><dd>{activeQualityObject.record.turnoverRequired ? "Required" : "Not required"}</dd></div><div className="fact-wide"><dt>Description</dt><dd>{activeQualityObject.record.description}</dd></div></dl> : null}
          {activeQualityObject.kind === "punch" ? <dl className="field-object-facts"><div><dt>Type / priority</dt><dd>{activeQualityObject.record.type} · {activeQualityObject.record.priority}</dd></div><div><dt>Owner</dt><dd>{activeQualityObject.record.ownerUserId}</dd></div><div><dt>Controlled scope</dt><dd>{activeQualityObject.record.assetId ?? activeQualityObject.record.workPackageId ?? activeQualityObject.record.systemId ?? activeQualityObject.record.areaId ?? "Pending"}</dd></div><div><dt>Turnover</dt><dd>{activeQualityObject.record.turnoverRequired ? "Required" : "Not required"}</dd></div><div className="fact-wide"><dt>Description</dt><dd>{activeQualityObject.record.description}</dd></div></dl> : null}
          <div className="material-gate-grid" aria-label="Quality lifecycle gates"><div className={activeQualityObject.state === "closed" || activeQualityObject.state === "accepted" ? "gate-accepted" : "gate-pending"}><strong>Lifecycle state</strong><span>{stateLabel(activeQualityObject.state)}</span></div><div className="gate-accepted"><strong>Object version</strong><span>v{activeQualityObject.record.version}</span></div><div className={activeQualityObject.kind === "ncr" || activeQualityObject.kind === "punch" ? "gate-pending" : "gate-not_applicable"}><strong>Exception consequence</strong><span>{activeQualityObject.kind === "inspection" ? "not applicable" : "tracked to turnover"}</span></div></div>
        </> : <div className="empty-state"><strong>No quality object selected</strong><p>Choose an authorized inspection, NCR, or punch item, or create one through the governed controls below.</p></div>}</article>
        <aside className="field-role-actions" aria-label="Quality role-based actions"><label>Field role context<select aria-label="Quality field role context" value={qualityFieldRole} onChange={(event) => setQualityFieldRole(event.target.value as QualityFieldRole)}>{qualityFieldRoles.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <p>{activeQualityFieldRole.nextAction}</p><div className="review-boundary-note"><strong>Presentation is not permission</strong><p>The server rechecks assignment, qualification, assurance, separation of duty, object scope, and expected version for every action.</p></div>
          {qualityFieldRole === "inspector" ? <button className="primary-button" type="button" onClick={() => globalThis.document.getElementById("quality-capture-controls")?.scrollIntoView({ behavior: "smooth" })}>Open controlled capture</button> : null}
          {qualityFieldRole === "inspection_reviewer" && activeQualityObject?.kind === "inspection" ? <><label>Acceptance meaning / rejection reason<textarea value={qualityDecisionNote} onChange={(event) => setQualityDecisionNote(event.target.value)} /></label><div className="action-row"><button type="button" onClick={() => reviewSelectedInspection("accept")} disabled={working || activeQualityObject.state !== "submitted" || activeQualityObject.record.result !== "pass" || !qualityDecisionNote.trim()}>Accept independently</button><button type="button" onClick={() => reviewSelectedInspection("reject")} disabled={working || activeQualityObject.state !== "submitted" || !qualityDecisionNote.trim()}>Reject with reason</button></div></> : null}
          {qualityFieldRole === "ncr_owner" && activeQualityObject?.kind === "ncr" ? <><label>Disposition<textarea value={ncrDisposition} onChange={(event) => setNcrDisposition(event.target.value)} /></label><label>Corrective action<textarea value={ncrCorrectiveAction} onChange={(event) => setNcrCorrectiveAction(event.target.value)} /></label><button type="button" onClick={() => advanceNcr("disposition", { disposition: ncrDisposition, correctiveAction: ncrCorrectiveAction })} disabled={working || ncr?.state !== "open" || !ncrDisposition.trim() || !ncrCorrectiveAction.trim()}>Propose disposition</button><label>Reinspection evidence file ID<input value={ncrEvidenceFileId} onChange={(event) => setNcrEvidenceFileId(event.target.value)} /></label><button type="button" onClick={() => advanceNcr("reinspection", { evidenceFileId: ncrEvidenceFileId })} disabled={working || ncr?.state !== "disposition_approved" || !ncrEvidenceFileId.trim()}>Record reinspection</button></> : null}
          {qualityFieldRole === "ncr_authority" && activeQualityObject?.kind === "ncr" ? <div className="action-row"><button type="button" onClick={() => advanceNcr("approve", {})} disabled={working || ncr?.state !== "disposition_proposed"}>Approve disposition</button><button type="button" onClick={() => advanceNcr("close", {})} disabled={working || ncr?.state !== "reinspection_complete"}>Close NCR</button></div> : null}
          {qualityFieldRole === "punch_owner" && activeQualityObject?.kind === "punch" ? <><label>Owner evidence file IDs<input value={punchOwnerEvidenceIds} onChange={(event) => setPunchOwnerEvidenceIds(event.target.value)} /></label><button type="button" onClick={() => advancePunch("owner-update", { evidenceFileIds: ids(punchOwnerEvidenceIds), readyForVerification: true })} disabled={working || punch?.state !== "open" || ids(punchOwnerEvidenceIds).length === 0}>Route for verification</button></> : null}
          {qualityFieldRole === "punch_verifier" && activeQualityObject?.kind === "punch" ? <><label>Verification evidence file ID<input value={punchVerificationEvidenceId} onChange={(event) => setPunchVerificationEvidenceId(event.target.value)} /></label><button type="button" onClick={() => advancePunch("verify", { verificationEvidenceFileId: punchVerificationEvidenceId })} disabled={working || punch?.state !== "ready_for_verification" || !punchVerificationEvidenceId.trim()}>Verify independently</button></> : null}
          {qualityFieldRole === "completion_authority" && activeQualityObject?.kind === "punch" ? <button type="button" onClick={() => advancePunch("close", { closureMeaning: "Verified complete" })} disabled={working || punch?.state !== "verified"}>Close verified punch</button> : null}
        </aside>
      </div>
    </section> : null}

    {step === "turnover" ? <section className="field-object-console turnover-object-console" aria-labelledby="turnover-object-heading">
      <div className="field-object-heading"><div><p className="section-label">Package-first completion</p><h3 id="turnover-object-heading">Find the boundary package, recalculate readiness, then generate</h3><p>Every package remains tied to its controlled boundary, exact material population, requirement statuses, resolved exceptions, recipient scope, and immutable generated versions.</p></div><span className="policy-chip">No manual ready claim</span></div>
      <div className="field-object-layout"><aside className="field-object-finder" aria-label="Turnover package lookup"><label>Find package or boundary<input type="search" value={turnoverQuery} onChange={(event) => setTurnoverQuery(event.target.value)} placeholder="Package, boundary, recipient…" /></label><div className="field-object-results">{filteredTurnoverPackages.map((record) => <button key={record.id} type="button" className={turnoverPackage?.id === record.id ? "is-selected" : ""} onClick={() => { setTurnoverPackage(record); setReadiness([]); setGenerated(null); }}><span><strong>{record.code}</strong><small>{record.completionBoundaryId} · {record.recipientScope}</small></span><span className={`state-badge state-${record.state}`}>{stateLabel(record.state)}</span></button>)}</div>{filteredTurnoverPackages.length === 0 ? <p className="muted">No authorized turnover package matches. Configure a boundary and package below or verify scope.</p> : null}</aside>
          <article className="field-object-record" aria-label="Selected turnover package">{turnoverPackage ? <><div className="field-object-title"><div><span className="record-type">Turnover package</span><h4>{turnoverPackage.code}</h4><p>{turnoverPackage.recipientScope}</p></div><span className={`state-badge state-${turnoverPackage.state}`}>{stateLabel(turnoverPackage.state)}</span></div><dl className="field-object-facts"><div><dt>Completion boundary</dt><dd>{turnoverPackage.completionBoundaryId}</dd></div><div><dt>Package version</dt><dd>v{turnoverPackage.version}</dd></div><div><dt>Exact materials</dt><dd>{turnoverPackage.materialItemIds?.length ?? 0}</dd></div><div><dt>Generated version</dt><dd>{generated ? `${generated.versionNumber} · ${generated.manifestSha256.slice(0, 12)}…` : "Not generated in this session"}</dd></div></dl><div className="material-gate-grid" aria-label="Turnover readiness gates">{readiness.length ? readiness.map((item) => <div key={item.requirementCode} className={["accepted", "not_applicable"].includes(item.status) ? "gate-accepted" : "gate-blocked"}><strong>{item.requirementCode}</strong><span>{stateLabel(item.status)} · {item.reason}</span></div>) : <div className="gate-pending"><strong>Readiness not calculated</strong><span>Recalculate from authoritative records</span></div>}</div></> : <div className="empty-state"><strong>No package selected</strong><p>Select an authorized package or establish the completion boundary below.</p></div>}</article>
        <aside className="field-role-actions" aria-label="Turnover role actions"><strong>Turnover coordinator</strong><p>Recalculate current readiness before every generation attempt. A prior screen result never becomes an authority claim.</p><div className="review-boundary-note"><strong>Generation fails closed</strong><p>Required records, current releases, material state, NCRs, punch items, and recipient scope are revalidated server-side.</p></div><button className="secondary-button" type="button" onClick={checkReadiness} disabled={working || !turnoverPackage}>Recalculate package readiness</button><button className="primary-button" type="button" onClick={generateTurnover} disabled={working || !turnoverPackage || readiness.length === 0 || readiness.some((item) => !["accepted", "not_applicable"].includes(item.status))}>Generate package version</button></aside>
      </div>
    </section> : null}

    {step === "documents" ? <div className="workflow-grid">
      <article className="workflow-card"><p className="section-label">Register</p><h3>Controlled document</h3>
        <form className="compact-form" onSubmit={registerDocument}>
          <label>Document number<input name="number" required /></label><label>Title<input name="title" required /></label>
          <label>Document type<input name="type" required /></label><label>Discipline<input name="discipline" required /></label>
          <button className="primary-button" disabled={working}>Register document</button>
        </form>{document ? <p className="record-outcome"><strong>{document.number}</strong><span>ID {document.id} - v{document.version}</span></p> : null}
      </article>
      <article className="workflow-card"><p className="section-label">Revise and release</p><h3>Exact validated revision</h3>
        <form className="compact-form" onSubmit={uploadGovernedFile}>
          <label>File to upload<input name="file" type="file" required /></label>
          <label>Retention class<input name="retentionClass" defaultValue="project-record" required /></label>
          <button className="primary-button" disabled={working}>Upload to private staging</button>
        </form>
        {governedFile ? <><p className="record-outcome"><strong>{governedFile.originalFilename}</strong>
          <span>{stateLabel(governedFile.validationState)} - v{governedFile.version}</span></p>
          <div className="action-row"><button className="secondary-button" onClick={refreshGovernedFile} disabled={working}>Refresh processing status</button>
            <button className="danger-button" onClick={releaseGovernedFile} disabled={working || governedFile.validationState !== "validated"}>Release as distinct file authority</button></div></> : null}
        <form className="compact-form" onSubmit={submitRevision}>
          <label>Revision<input name="revision" required /></label><label>Purpose<input name="purpose" required /></label>
          <label>Source<input name="source" required /></label>
          <label>Required approvals<input name="requiredApprovalCount" type="number" min="1" defaultValue="1" required /></label>
          <button className="primary-button" disabled={working || !document || governedFile?.validationState !== "released"}>Submit released-file revision</button>
        </form>{revision ? <><p className="record-outcome"><strong>Revision {revision.revision}</strong><span>{stateLabel(revision.state)} - v{revision.version}</span></p>
          <div className="action-row"><button className="secondary-button" onClick={approveRevision} disabled={working || revision.state !== "under_review"}>Approve as distinct actor</button>
            <button className="danger-button" onClick={releaseRevision} disabled={working || revision.state !== "approved"}>Release current-for-work</button></div></> : null}
      </article>
    </div> : null}

    {step === "materials" ? <div className="workflow-grid">
      <article className="workflow-card workflow-card-wide"><p className="section-label">Receive</p><h3>Material and certification traceability</h3>
        <form className="compact-form form-columns" onSubmit={receiveMaterial}>
          <label>Approved project configuration revision ID<input name="projectConfigurationRevisionId" required /></label>
          <label>Material identifier<input name="identifier" required /></label><label>Receipt number<input name="receiptNumber" required /></label>
          <label>Purchase reference<input name="purchaseReference" required /></label><label>Vendor organization ID<input name="vendorOrganizationId" required /></label>
          <label>Specification<input name="specification" required /></label><label>Grade<input name="grade" required /></label>
          <label>Form<input name="form" required /></label><label>Dimensions<input name="dimensions" required /></label>
          <label>Quantity<input name="quantity" inputMode="decimal" required /></label><label>Unit code<input name="unitCode" required /></label>
          <label>Heat / lot<input name="heatLot" required /></label><label>Released MTR revision ID<input name="mtrDocumentRevisionId" /></label>
          <label>Receipt evidence file IDs<input name="receiptEvidenceFileIds" required /></label><label>Storage location<input name="storageLocation" required /></label>
          <fieldset className="check-group"><legend>Applicability</legend><label><input type="checkbox" name="mtrRequired" defaultChecked /> MTR required</label>
            <label><input type="checkbox" name="receivingInspectionRequired" defaultChecked /> Receiving inspection</label>
            <label><input type="checkbox" name="pmiRequired" defaultChecked /> PMI required</label></fieldset>
          <label>Governing PMI rule<input name="governingPmiRule" /></label>
          <button className="primary-button" disabled={working}>Receive material</button>
        </form>{material ? <><p className="record-outcome"><strong>{material.identifier}</strong><span>{stateLabel(material.state)} - v{material.version}</span></p>
          <div className="action-row"><button className="secondary-button" onClick={acceptReceivingInspection} disabled={working || material.state !== "received_pending"}>Accept receiving inspection</button>
            <button className="danger-button" onClick={releaseMaterial} disabled={working || material.state !== "received_pending"}>Release after all checks</button></div></> : null}
      </article>
      <article className="workflow-card"><p className="section-label">Independent review</p><h3>MTR comparison and acceptance</h3>
        <form className="compact-form" onSubmit={reviewMtr}>
          <fieldset className="check-group"><legend>Controlled comparisons</legend>
            <label><input type="checkbox" name="heatLotVerified" required /> Heat / lot matches</label>
            <label><input type="checkbox" name="gradeVerified" required /> Grade matches</label>
            <label><input type="checkbox" name="specificationVerified" required /> Specification matches</label></fieldset>
          <label>MTR review notes<textarea name="reviewNotes" required /></label>
          <label>MTR review evidence file IDs<input name="evidenceFileIds" required /></label>
          <button className="danger-button" disabled={working || !material || material.requirements?.mtrAccepted === true}>Accept as distinct qualified reviewer</button>
        </form>
        {material?.requirements?.mtrReviewId ? <p className="record-outcome"><strong>MTR accepted</strong><span>Review {material.requirements.mtrReviewId}</span></p> : null}
      </article>
      <article className="workflow-card"><p className="section-label">Custody history</p><h3>Issue, return, and relocate</h3>
        <div className="action-row"><button className="primary-button" type="button" onClick={issueMaterial}
          disabled={working || !material || (material.state !== "released" && material.state !== "returned")}>Issue material</button>
          <button className="secondary-button" type="button" onClick={refreshMaterialMovements} disabled={working || !material}>Refresh history</button></div>
        <form className="compact-form" onSubmit={returnMaterial}><label>Return location<input name="toLocation" required /></label>
          <label>Return reason<textarea name="reason" required /></label><button className="secondary-button" disabled={working || material?.state !== "issued"}>Return unused material</button></form>
        <form className="compact-form" onSubmit={moveMaterial}><label>Move location<input name="toLocation" required /></label>
          <label>Move reason<textarea name="reason" required /></label><button className="secondary-button" disabled={working || !material || !["received_pending", "released", "returned"].includes(material.state ?? "")}>Record relocation</button></form>
        <ol className="history-list">{materialMovements.map((movement) => <li key={movement.id}><strong>{stateLabel(movement.movementType)}</strong>
          <span>{movement.fromLocation ?? "External receipt"} → {movement.toLocation}</span></li>)}</ol>
      </article>
    </div> : null}

    {step === "quality" ? <div className="workflow-grid" id="quality-capture-controls">
      <article className="workflow-card"><p className="section-label">PMI equipment</p><h3>Verified method capability</h3>
        <form className="compact-form" onSubmit={registerEquipment}>
          <label>Equipment identifier<input name="identifier" required /></label><label>Serial number<input name="serialNumber" required /></label>
          <label>Method capabilities<input name="methodCapabilities" required /></label><label>Verification evidence file ID<input name="evidenceFileId" required /></label>
          <label>Valid from<input name="validFrom" type="datetime-local" required /></label><label>Valid to<input name="validTo" type="datetime-local" required /></label>
          <button className="primary-button" disabled={working}>Register verified equipment</button>
        </form>{equipment ? <p className="record-outcome"><strong>{equipment.identifier}</strong><span>ID {equipment.id}</span></p> : null}
      </article>
      <article className="workflow-card"><p className="section-label">PMI record</p><h3>Observed material verification</h3>
        <form className="compact-form" onSubmit={recordPmi}>
          <label>Governing rule<input name="governingRule" required /></label><label>Required material<input name="requiredMaterial" required /></label>
          <label>Observed material<input name="observedMaterial" required /></label><label>Method<input name="method" required /></label>
          <label>Component location<input name="componentLocation" required /></label><label>PMI notes<textarea name="notes" required /></label>
          <label>Inspected at<input name="inspectedAt" type="datetime-local" required /></label><label>Reading summary<input name="reading" required /></label>
          <label>Evidence file IDs<input name="evidenceFileIds" required /></label>
          <label>PMI result<select name="result" value={pmiResult} onChange={(event) => setPmiResult(event.target.value as "pass" | "fail")}><option value="pass">Pass</option><option value="fail">Fail</option></select></label>
          {pmiResult === "fail" ? <fieldset className="failure-fields"><legend>Required atomic failure containment</legend>
            <label>Failed PMI NCR number<input name="failedNcrNumber" required /></label>
            <label>Failure description<textarea name="failureDescription" required /></label>
            <label>Failure containment<textarea name="failureContainment" required /></label>
            <label>Failure responsible user ID<input name="failureResponsibleUserId" required /></label>
            <label className="check-line"><input type="checkbox" name="failureTurnoverRequired" defaultChecked /> Include failed PMI NCR in turnover</label>
          </fieldset> : null}
          <button className="primary-button" disabled={working || !material || !equipment}>Submit PMI result</button>
        </form>{pmi ? <><p className="record-outcome"><strong>PMI {pmi.id}</strong><span>{stateLabel(pmi.state)} - v{pmi.version}</span></p>
          <button className="danger-button" onClick={acceptPmi} disabled={working || pmi.state !== "submitted"}>Accept as distinct qualified actor</button></> : null}
      </article>
      <article className="workflow-card"><p className="section-label">Nonconformance</p><h3>Optional NCR path</h3>
        <form className="compact-form" onSubmit={createNcr}><label>NCR number<input name="number" required /></label>
          <label>Requirement reference<input name="requirementReference" required /></label><label>Description<textarea name="description" required /></label>
          <label>Containment<textarea name="containment" required /></label><label>Initial evidence file IDs<input name="evidenceFileIds" required /></label>
          <label>Responsible user ID<input name="responsibleUserId" required /></label><label className="check-line"><input type="checkbox" name="turnoverRequired" /> Include in turnover</label>
          <button className="primary-button" disabled={working || !material}>Open NCR</button></form>
        {ncr ? <><p className="record-outcome"><strong>NCR {ncr.id}</strong><span>{stateLabel(ncr.state)} - v{ncr.version}</span></p>
          <div className="lifecycle-inputs"><label>Proposed disposition<input value={ncrDisposition} onChange={(event) => setNcrDisposition(event.target.value)} /></label>
            <label>Corrective action<textarea value={ncrCorrectiveAction} onChange={(event) => setNcrCorrectiveAction(event.target.value)} /></label>
            <label>Reinspection evidence file ID<input value={ncrEvidenceFileId} onChange={(event) => setNcrEvidenceFileId(event.target.value)} /></label></div>
          <div className="lifecycle-actions"><button disabled={working || ncr.state !== "open" || !ncrDisposition.trim() || !ncrCorrectiveAction.trim()} onClick={() => advanceNcr("disposition", { disposition: ncrDisposition, correctiveAction: ncrCorrectiveAction })}>Propose disposition</button>
            <button disabled={working || ncr.state !== "disposition_proposed"} onClick={() => advanceNcr("approve", {})}>Approve disposition</button>
            <button disabled={working || ncr.state !== "disposition_approved" || !ncrEvidenceFileId.trim()} onClick={() => advanceNcr("reinspection", { evidenceFileId: ncrEvidenceFileId })}>Record reinspection</button>
            <button disabled={working || ncr.state !== "reinspection_complete"} onClick={() => advanceNcr("close", {})}>Close NCR</button></div></> : null}
      </article>
      <article className="workflow-card"><p className="section-label">Completion exception</p><h3>Optional punch path</h3>
        <form className="compact-form" onSubmit={createPunch}><label>Punch number<input name="number" required /></label><label>Type<input name="type" required /></label>
          <label>Priority<select name="priority"><option>low</option><option>medium</option><option>high</option><option>critical</option></select></label>
          <label>Owner user ID<input name="ownerUserId" required /></label><label>Description<textarea name="description" required /></label>
          <label className="check-line"><input type="checkbox" name="turnoverRequired" /> Include in turnover</label><button className="primary-button" disabled={working || !material}>Open punch</button></form>
        {punch ? <><p className="record-outcome"><strong>Punch {punch.id}</strong><span>{stateLabel(punch.state)} - v{punch.version}</span></p>
          <div className="lifecycle-inputs"><label>Owner evidence file IDs<input value={punchOwnerEvidenceIds} onChange={(event) => setPunchOwnerEvidenceIds(event.target.value)} /></label>
            <label>Verification evidence file ID<input value={punchVerificationEvidenceId} onChange={(event) => setPunchVerificationEvidenceId(event.target.value)} /></label></div>
          <div className="lifecycle-actions"><button disabled={working || punch.state !== "open" || ids(punchOwnerEvidenceIds).length === 0} onClick={() => advancePunch("owner-update", { evidenceFileIds: ids(punchOwnerEvidenceIds), readyForVerification: true })}>Owner complete</button>
            <button disabled={working || punch.state !== "ready_for_verification" || !punchVerificationEvidenceId.trim()} onClick={() => advancePunch("verify", { verificationEvidenceFileId: punchVerificationEvidenceId })}>Verify independently</button>
            <button disabled={working || punch.state !== "verified"} onClick={() => advancePunch("close", { closureMeaning: "Verified complete" })}>Close punch</button></div></> : null}
      </article>
    </div> : null}

    {step === "turnover" ? <div className="workflow-grid">
      <article className="workflow-card"><p className="section-label">Boundary</p><h3>Completion scope</h3>
        <form className="compact-form" onSubmit={createBoundary}><label>Boundary type<select name="boundaryType"><option value="system">System</option><option value="area">Area</option><option value="asset">Asset</option><option value="work_package">Work package</option><option value="contract">Contract</option></select></label>
          <label>Boundary code<input name="code" required /></label><label>Boundary name<input name="name" required /></label><button className="primary-button" disabled={working}>Create boundary</button></form>
        {boundary ? <p className="record-outcome"><strong>Boundary {boundary.id}</strong><span>v{boundary.version}</span></p> : null}
      </article>
      <article className="workflow-card"><p className="section-label">Requirement</p><h3>Accepted record class</h3>
        <form className="compact-form" onSubmit={addRequirement}><label>Requirement code<input name="code" required /></label>
          <label>Record class<select name="recordClass"><option value="material">Material</option><option value="pmi">PMI</option><option value="ncr">NCR</option><option value="punch">Punch</option><option value="document_revision">Document revision</option></select></label>
          <label>Acceptance authority<input name="acceptanceAuthority" required /></label><label className="check-line"><input type="checkbox" name="notApplicableAllowed" /> Not-applicable may be approved</label>
          <button className="primary-button" disabled={working || !boundary}>Add requirement</button></form>
        <p className="record-outcome"><strong>{requirements.length} requirement(s)</strong><span>Each is independently versioned</span></p>
      </article>
      <article className="workflow-card"><p className="section-label">Package baseline</p><h3>Exact selected material</h3>
        <form className="compact-form" onSubmit={createPackage}><label>Package code<input name="code" required /></label><label>Recipient scope<input name="recipientScope" required /></label>
          <label>Material item IDs<input name="materialItemIds" defaultValue={material?.id ?? ""} required /></label><button className="primary-button" disabled={working || !boundary}>Create package</button></form>
        {turnoverPackage ? <p className="record-outcome"><strong>Package {turnoverPackage.id}</strong><span>{stateLabel(turnoverPackage.state)} - v{turnoverPackage.version}</span></p> : null}
      </article>
      <article className="workflow-card"><p className="section-label">Readiness and generation</p><h3>Authoritative final gate</h3>
        <div className="action-row"><button className="secondary-button" onClick={checkReadiness} disabled={working || !turnoverPackage}>Recalculate readiness</button>
          <button className="danger-button" onClick={generateTurnover} disabled={working || !turnoverPackage || readiness.some((item) => !["accepted", "not_applicable"].includes(item.status))}>Generate immutable version</button></div>
        <ul className="readiness-list">{readiness.map((item) => <li key={item.requirementCode}><strong>{item.requirementCode}</strong><span className={`state-badge state-${item.status}`}>{stateLabel(item.status)}</span><small>{item.reason}</small></li>)}</ul>
        {generated ? <p className="record-outcome"><strong>Version {generated.versionNumber} generated</strong><span>{generated.manifest.length} sources - SHA-256 {generated.manifestSha256}</span></p> : null}
      </article>
    </div> : null}

    {step === "reports" ? <div className="workflow-grid">
      <article className="workflow-card workflow-card-wide"><div className="panel-heading"><div><p className="section-label">Live controls</p><h3>Operational dashboard</h3></div>
        <button className="secondary-button" type="button" onClick={refreshDashboard} disabled={working}>Recalculate dashboard</button></div>
        {dashboard ? <>
          <div className="metrics" aria-label="Controlled dashboard summary">
            <article><span>Readiness blockers</span><strong>{dashboard.readiness.blockers.length}</strong><small>{dashboard.readiness.ready ? "Ready" : "Action required"}</small></article>
            <article><span>Documents</span><strong>{dashboard.documents.total ?? 0}</strong><small>{dashboard.documents.currentReleased ?? 0} current released</small></article>
            <article><span>Materials</span><strong>{dashboard.materials.total}</strong><small>{dashboard.materials.mtr.pending ?? 0} MTR · {dashboard.materials.pmi.pending ?? 0} PMI pending</small></article>
            <article><span>Open exceptions</span><strong>{dashboard.exceptions.openNcrs.length + dashboard.exceptions.openPunchItems.length}</strong><small>{dashboard.exceptions.openNcrs.length} NCR · {dashboard.exceptions.openPunchItems.length} punch</small></article>
          </div>
          <div className="results">
            <article><span className="record-type">Expiry</span><div><strong>{dashboard.qualificationExpirations.length} qualification/equipment records within 60 days</strong><small>{dashboard.qualificationExpirations.slice(0, 3).map((item) => `${item.sourceType}:${item.sourceId} (${item.daysRemaining}d)`).join(" · ") || "No upcoming expirations"}</small></div></article>
            <article><span className="record-type">Subcontractors</span><div><strong>{dashboard.subcontractors.length} project assignment(s)</strong><small>{dashboard.subcontractors.map((item) => `${item.assignmentId}: ${stateLabel(item.mobilizationState)}`).join(" · ") || "No assignments"}</small></div></article>
            <article><span className="record-type">Turnover</span><div><strong>{dashboard.turnover.length} package(s)</strong><small>{dashboard.turnover.map((item) => `${item.packageId}: ${stateLabel(item.state)}, ${item.requirementCount} requirement(s), ${item.generatedVersionCount} version(s)`).join(" · ") || "No packages"}</small></div></article>
            <article><span className="record-type">Audit</span><div><strong>{dashboard.privilegedAudit.total} privileged project action(s)</strong><small>Generated {new Date(dashboard.generatedAt).toLocaleString()}</small></div></article>
          </div>
        </> : <p className="muted">Recalculate to view current readiness, currency, traceability, exception, subcontractor, turnover, and audit indicators.</p>}
      </article>
      <article className="workflow-card"><p className="section-label">Inventory</p><h3>Generate controlled snapshot</h3>
        <form className="compact-form" onSubmit={generateReport}><label>Form / report code<select name="formCode">
          <option value="FORM-PRJ-001">Project profile and readiness</option><option value="FORM-DOC-001">Document history and transmittal</option>
          <option value="FORM-MAT-001">Receiving report and label</option><option value="FORM-MTR-001">MTR review record</option>
          <option value="FORM-PMI-001">PMI report</option><option value="FORM-INS-001">Inspection report</option>
          <option value="FORM-NCR-001">NCR report and history</option><option value="FORM-PCH-001">Punch report</option>
          <option value="FORM-SUB-001">Qualification summary</option><option value="FORM-SUB-002">Mobilization release</option>
          <option value="FORM-TOV-001">Turnover readiness and package</option></select></label>
          <label>Target record ID<input key={projectId} name="targetId" defaultValue={projectId} required /></label>
          <button className="primary-button" disabled={working}>Generate immutable report</button></form>
      </article>
      <article className="workflow-card workflow-card-wide"><div className="panel-heading"><div><p className="section-label">Register</p><h3>Authorized report outputs</h3></div>
        <button className="secondary-button" type="button" onClick={refreshReports} disabled={working}>Refresh reports</button></div>
        <div className="results">{reports.map((report) => <article key={report.id}><span className="record-type">{report.formCode}</span>
          <div><strong>{report.title}</strong><small>{report.recordStatus} · revision {report.revisionNumber} · {report.id}</small></div>
          <div className="action-row"><button type="button" onClick={() => downloadReport(report, "html")} disabled={working}>HTML</button>
            <button type="button" onClick={() => downloadReport(report, "json")} disabled={working}>JSON</button></div></article>)}</div>
        {reports.length === 0 ? <p className="muted">Generate or refresh to view exact authorized snapshots.</p> : null}
      </article>
    </div> : null}
  </section>;
}
