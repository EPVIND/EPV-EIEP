import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { EnvironmentBanner } from "@eiep/ui-components";
import { EstimatingWorkspace } from "./EstimatingWorkspace.js";
import { ExecutionDisciplinesWorkspace } from "./ExecutionDisciplinesWorkspace.js";
import { OperationalChain } from "./OperationalChain.js";
import { ProjectSetup } from "./ProjectSetup.js";
import { ProjectControlsWorkspace } from "./ProjectControlsWorkspace.js";
import { DocumentCollaborationWorkspace } from "./DocumentCollaborationWorkspace.js";
import { CommandCenterWorkspace } from "./CommandCenterWorkspace.js";
import { FabricationWorkspace } from "./FabricationWorkspace.js";
import { CncWorkspace } from "./CncWorkspace.js";
import { EngineeringRegisterWorkspace } from "./EngineeringRegisterWorkspace.js";
import { ModuleReviewWorkspace, reviewDocumentNavigation } from "./ModuleReviewWorkspace.js";
import type { WorkTarget } from "./work-target.js";

interface HealthStatus {
  readonly status: string;
  readonly environment: string;
  readonly training: boolean;
  readonly productionReady: boolean;
  readonly blockers: readonly string[];
}

declare global {
  interface Window {
    readonly __EIEP_RUNTIME_CONFIG__?: {
      readonly apiBaseUrl?: string;
      readonly pilotIdentities?: readonly PilotIdentityProfile[];
    };
  }
}

interface IdentitySettings {
  readonly userId: string;
  readonly organizationId: string;
  readonly assurance: "standard" | "mfa" | "step-up";
}

interface PilotIdentityProfile {
  readonly displayName: string;
  readonly userId: string;
  readonly organizationId: string;
}

interface SessionStatus extends IdentitySettings {
  readonly actingOrganizationId: string;
  readonly assignmentCount: number;
  readonly environment: string;
  readonly training: boolean;
}

interface ProjectRecord {
  readonly id: string;
  readonly number: string;
  readonly name: string;
  readonly customerOrganizationId: string;
  readonly facilityId: string;
  readonly timeZone: string;
  readonly state: string;
  readonly version: number;
  readonly readiness?: Readonly<Record<string, unknown>>;
}

interface SearchResult {
  readonly recordType: string;
  readonly recordId: string;
  readonly label: string;
  readonly state: string;
  readonly version: number;
}

interface ProjectReadinessStatus {
  readonly readiness: Readonly<Record<string, unknown>>;
  readonly blockers: readonly string[];
}

type ModuleKey = "overview" | "estimating" | "controls" | "procurement" | "scheduling" | "engineering" | "welding" | "nde" | "testing" | "fabrication" | "cnc" | "bluebeam" | "projects" | "documents" | "materials" | "quality" | "turnover" | "reports" | "integrations" | "administration";

const modules: readonly { key: ModuleKey; label: string; eyebrow: string }[] = [
  { key: "overview", label: "Overview", eyebrow: "Control room" },
  { key: "estimating", label: "Estimating", eyebrow: "Cost · quotes · proposals" },
  { key: "controls", label: "Project Controls", eyebrow: "Budget · change · EAC" },
  { key: "procurement", label: "Procurement", eyebrow: "Bid · award · expedite" },
  { key: "scheduling", label: "Scheduling", eyebrow: "Logic · updates · look-ahead" },
  { key: "engineering", label: "Engineering Database", eyebrow: "Requirements · tags · deliverables" },
  { key: "welding", label: "Welding", eyebrow: "WPS · WPQ · weld map" },
  { key: "nde", label: "NDE / PWHT", eyebrow: "Examination · heat treatment" },
  { key: "testing", label: "Testing", eyebrow: "Boundaries · safety · results" },
  { key: "fabrication", label: "Fabrication & Spools", eyebrow: "BOM · traveler · shop release" },
  { key: "cnc", label: "CNC / Waterjet", eyebrow: "Validate · release · reconcile" },
  { key: "bluebeam", label: "Bluebeam", eyebrow: "Markup · reconcile · evidence" },
  { key: "projects", label: "Projects", eyebrow: "Setup & structure" },
  { key: "documents", label: "Documents", eyebrow: "Current for work" },
  { key: "materials", label: "Materials", eyebrow: "Traceability" },
  { key: "quality", label: "Quality", eyebrow: "PMI · inspection · NCR" },
  { key: "turnover", label: "Turnover", eyebrow: "Completion evidence" },
  { key: "reports", label: "Reports", eyebrow: "Controlled outputs" },
  { key: "integrations", label: "Integrations", eyebrow: "Jobs & interchange" },
  { key: "administration", label: "Administration", eyebrow: "Access & governance" },
];

const moduleCapabilityItems: Readonly<Partial<Record<ModuleKey, readonly (readonly [string, string])[]>>> = {
  estimating: [["Estimate build-up", "Assemblies, labor/productivity factors, direct cost, adjustments, and exact revision deltas."], ["Quote leveling", "Released-source vendor quotes, comparison gaps, selection authority, and audit."], ["Proposal & handoff", "Approved printable proposal, issue/download integrity, award, and reconciled project-controls handoff."]],
  controls: [["Cost & quantity baseline", "Immutable estimate-handoff mapping to WBS, control accounts, work packages, budget, and quantities."], ["Change & forecast", "Thresholded change, actuals, accruals, forecast remaining, EAC, and variance."], ["Progress evidence", "Accepted quantity progress remains separate from quality, invoice, and completion acceptance."]],
  procurement: [["Requisition & bid package", "Exact released-document scope, comparative offers, exclusions, and source hashes."], ["Award & commitment", "Independent recommendation, monetary authority, commitment, and controlled change history."], ["Expediting & receiving", "Milestones, vendor status, evidence, and same-project controlled receipt linkage."]],
  scheduling: [["Logic & baselines", "Calendars, stable activities, relationships, constraints, independent baseline approval, and history."], ["Updates & look-ahead", "Progress, forecast, variance, blockers, and authorized short-interval planning."], ["Controlled exchange", "Validated idempotent P6 and Microsoft Project imports remain unapproved drafts until review."]],
  welding: [["WPS / PQR / WPQ", "Exact approved procedure applicability, welder qualification ranges, and continuity."], ["Weld map & execution", "Material, drawing, joint identity, fit-up, consumables, heat input, visual results, and attribution."], ["Repair & release", "Append-only repair cycles, examination prerequisites, independent acceptance, and turnover linkage."]],
  nde: [["Requests & techniques", "Repair-cycle requests with qualified personnel, procedures, methods, equipment, and calibration."], ["Reports & indications", "Versioned media, conditions, findings, disposition, and independent review."], ["PWHT evidence", "Procedure, cycle parameters, thermocouples, charts, interruptions, equipment, and acceptance."]],
  testing: [["Boundary packages", "Exact system/completion boundary, documents, welds, safety, isolation, and restoration scope."], ["Readiness & execution", "Prerequisites, valid instruments, participants, witnesses, evidence, deficiencies, and results."], ["Independent acceptance", "Release remains distinct from execution and feeds completion and turnover without replacing authority judgment."]],
  bluebeam: [["Protected preview", "Released source/export identity, page/region content, user/organization/status mapping, and validation issues."], ["Import & reconciliation", "Idempotent atomic commit, changed-source collision, unsupported-content issues, and exact lineage."], ["Evidence review", "Independent review, audit, scoped search/export, and an explicit no-outbound-write boundary."]],
  projects: [["Project setup", "Project/customer/facility identity, scope, dates, time zone, and governing references."], ["Structure & responsibility", "Organizations, systems, areas, WBS, work packages, responsibilities, and governed configuration."], ["Readiness & activation", "Server-derived blockers, independent authorities, exact version, typed confirmation, and audit."]],
  documents: [["Controlled registration", "Document identity, classifications, governing references, and protected file linkage."], ["Revision lifecycle", "Submit, approve, release, supersede, distribution, acknowledgement, and current-for-work invariants."], ["Exact access", "Permission-scoped search/download with file validation, hashes, audit, and no stale-current claim."]],
  materials: [["Receipt & MTR", "Purchase/receipt context, heat and lot identity, exact released MTR comparison, and evidence."], ["Traceable genealogy", "Quantities, dimensions, locations, movements, cuts, pieces, remnants, issue, return, and quarantine."], ["PMI & release", "Project-rule applicability, qualified instrument results, independent acceptance, NCR linkage, and release blockers."]],
  quality: [["Inspection & PMI", "Approved plans, qualified execution, evidence, signature meaning, and independent acceptance."], ["NCR control", "Containment, responsibility, corrective action, disposition, approval, reinspection, and closure."], ["Punch & release", "Ownership, evidence, independent verification, closure, completion, and turnover blocking/inclusion."]],
  turnover: [["Completion boundaries", "Configured systems/packages, exact requirements, source state, deficiencies, and readiness."], ["Immutable package", "Versioned exact-source manifest, searchable PDF, JSON, CSV, generation log, hashes, and audit."], ["Review & handover", "Regeneration/deltas, recipient scope, acceptance evidence, preservation, and explicit production gates."]],
  reports: [["Operational dashboards", "Permission-scoped derived readiness, quality, material, schedule, exceptions, and progress."], ["Controlled reports", "Immutable project/document/material/inspection/NCR/punch/subcontractor/turnover snapshots."], ["Exports & analytics", "Authorized asynchronous CSV/JSON Lines exports with stable IDs, manifests, and recipient reauthorization."]],
  integrations: [["Controlled imports", "Versioned schema validation, preview, atomic commit, source IDs, and exact idempotency."], ["Jobs & delivery", "Transactional outbox, worker leases, bounded retry, dead letter, recipient reauthorization, and audit."], ["Reconciliation", "Explicit permanent/transient outcomes and governed reconciliation without silent external-state claims."]],
  administration: [["Identity & assignments", "OIDC resolution, account lifecycle, organization/project/work-package scope, qualifications, and assurance."], ["Governed authority", "Effective/revoked assignments, delegation, step-up, separation of duty, and break-glass review."], ["Audit & operations", "Retention, legal hold, three-party disposition, health, recovery, configuration, and release boundaries."]],
};

function ModuleCapabilityLanding({ module }: { readonly module: (typeof modules)[number] }) {
  const items = moduleCapabilityItems[module.key] ?? [];
  return <section className="module-access-preview" aria-labelledby={`${module.key}-access-heading`}>
    <div className="workspace-hero module-access-hero"><div><p className="section-label">Module workspace</p><h2 id={`${module.key}-access-heading`}>Explore {module.label}</h2>
      <p>{module.eyebrow}. The functional surface is available here; controlled project records remain hidden until an authorized identity and project are selected.</p></div><span className="policy-chip">Access boundary active</span></div>
    <div className="module-access-grid">{items.map(([title, description], index) => <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{title}</h3><p>{description}</p></div></article>)}</div>
    <div className="module-access-note"><strong>Two execution layers</strong><p>Use the review workbench below to inspect and exercise document design now. Authoritative project actions load only after a controlled API identity and project are selected.</p></div>
  </section>;
}

function initialModule(): ModuleKey {
  const requested = window.location.hash.replace(/^#/u, "") as ModuleKey;
  return modules.some((module) => module.key === requested) ? requested : "overview";
}

function initialWorkTarget(): WorkTarget | null {
  const query = new URLSearchParams(window.location.search);
  const recordType = query.get("workRecordType")?.trim();
  const recordId = query.get("workRecordId")?.trim();
  const action = query.get("workAction")?.trim();
  const version = Number(query.get("workVersion"));
  return recordType && recordId && action && Number.isSafeInteger(version) && version > 0
    ? { recordType, recordId, action, version }
    : null;
}

function FabricationCapabilityPreview() {
  const controlStages = [
    ["01", "Revision-controlled assembly", "Spool, skid, structural assembly, or custom fabrication definition with immutable lineage."],
    ["02", "Exact material & weld scope", "BOM, cut list, released drawings, procedures, material items, welds, and inspection points remain connected."],
    ["03", "Independent engineering review", "Submit, reject, approve, and supersede through qualified authority with creator/reviewer separation."],
    ["04", "Issued shop traveler", "Sequenced operations declare qualifications, procedures, material scope, weld scope, evidence, and hold points."],
    ["05", "Controlled execution", "Append-only start, complete, hold, rework, scrap, and independent hold-release events preserve exact history."],
    ["06", "Independent quality acceptance", "Acceptance is blocked until inspection, weld release, material, NCR, and traveler prerequisites are satisfied."],
  ] as const;
  return <section className="fabrication-capability-preview" aria-labelledby="fabrication-capability-heading">
    <div className="workspace-hero fabrication-preview-hero">
      <div><p className="section-label">Implemented control surface</p><h2 id="fabrication-capability-heading">Fabrication & spool governance</h2>
        <p>The governed workflow is live in this build. Apply an authorized review identity and select an assigned project to load its permission-scoped records.</p></div>
      <div className="preview-status"><span aria-hidden="true" />Available in pilot build</div>
    </div>
    <div className="fabrication-preview-metrics" aria-label="Fabrication capability summary">
      <article><strong>6</strong><span>Controlled stages</span></article>
      <article><strong>3</strong><span>Independent authorities</span></article>
      <article><strong>6</strong><span>Execution event types</span></article>
      <article><strong>100%</strong><span>Linked evidence trail</span></article>
    </div>
    <div className="fabrication-control-path">
      {controlStages.map(([number, title, description]) => <article key={number}>
        <span>{number}</span><div><h3>{title}</h3><p>{description}</p></div>
      </article>)}
    </div>
    <div className="fabrication-preview-footer">
      <div><strong>Connected records</strong><p>Drawings · procedures · materials · welds · inspections · NCRs · evidence files · audit events</p></div>
      <p className="truth-notice"><strong>Data truth:</strong> No production counts or sample work objects are displayed without an authorized project context.</p>
    </div>
  </section>;
}

function CncCapabilityPreview() {
  const controlStages = [
    ["01", "Exact released source", "A protected file hash and released drawing/model revision are bound to the approved assembly, traveler operation, piece mark, and material."],
    ["02", "Approved machine profile", "Effective work-center capabilities govern process, stock form, dimensions, units, coordinates, features, and postprocessor identity."],
    ["03", "Deterministic validation", "A machine-neutral package is normalized and hashed; unsupported operations, geometry, units, sequence, and source drift become explicit findings."],
    ["04", "Independent approval & release", "Technical approval and job release require distinct qualified authorities, step-up assurance, and current-version revalidation."],
    ["05", "Authorized operator download", "The exact released artifact is reauthorized and audited at download; its integrity hash follows the shop execution record."],
    ["06", "Execution reconciliation", "Work center, operator qualification, quantities, evidence, exceptions, produced pieces, remnants, and source-material genealogy are independently reconciled."],
  ] as const;
  return <section className="fabrication-capability-preview" aria-labelledby="cnc-capability-heading">
    <div className="workspace-hero fabrication-preview-hero">
      <div><p className="section-label">Implemented controlled-pilot surface</p><h2 id="cnc-capability-heading">CNC, waterjet & profiling governance</h2>
        <p>The machine-neutral workflow is live in this build. Apply an authorized identity and select an assigned project to load permission-scoped profiles, programs, releases, and execution evidence.</p></div>
      <div className="preview-status"><span aria-hidden="true" />Available in pilot build</div>
    </div>
    <div className="fabrication-preview-metrics" aria-label="CNC capability summary">
      <article><strong>6</strong><span>Controlled stages</span></article><article><strong>3</strong><span>Independent authorities</span></article>
      <article><strong>10</strong><span>Authenticated API actions</span></article><article><strong>SHA-256</strong><span>Exact release identity</span></article>
    </div>
    <div className="fabrication-control-path">{controlStages.map(([number, title, description]) => <article key={number}>
      <span>{number}</span><div><h3>{title}</h3><p>{description}</p></div></article>)}</div>
    <div className="fabrication-preview-footer"><div><strong>Connected records</strong><p>Source files · drawings/models · assemblies · travelers · materials · profiles · NCRs · evidence · audit</p></div>
      <p className="truth-notice"><strong>Safety boundary:</strong> No direct machine control, start/stop, interlock, or equipment configuration is performed.</p></div>
  </section>;
}

function EngineeringCapabilityPreview() {
  const stages = [
    ["01", "Stable engineering identity", "Requirements, deliverables, systems, equipment, lines, instruments, components, and tags share durable project identity."],
    ["02", "Exact project scope", "Discipline, system, area, work package, and responsible organization resolve against active controlled structures."],
    ["03", "Released-source linkage", "Exact released document revisions and approved related register revisions preserve the engineering digital thread."],
    ["04", "Deterministic validation", "Missing scope, invalid relationships, duplicate identity, dates, and actual-issue evidence become explicit findings."],
    ["05", "Independent approval", "Submit and review enforce current version, step-up engineering authority, and creator/submitter separation of duty."],
    ["06", "Immutable successor history", "Approved successors supersede, never overwrite, exact canonical SHA-256 revisions and retain attributable audit history."],
  ] as const;
  return <section className="fabrication-capability-preview" aria-labelledby="engineering-capability-heading"><div className="workspace-hero fabrication-preview-hero">
    <div><p className="section-label">Implemented controlled-pilot surface</p><h2 id="engineering-capability-heading">Multidisciplinary engineering registers</h2>
      <p>The engineering database is live in this build. Apply an authorized identity and select a project to manage permission-scoped controlled register revisions.</p></div>
    <div className="preview-status"><span aria-hidden="true" />Available in pilot build</div></div>
    <div className="fabrication-preview-metrics"><article><strong>8</strong><span>Register classes</span></article><article><strong>6</strong><span>Control stages</span></article>
      <article><strong>4</strong><span>Authenticated API actions</span></article><article><strong>SHA-256</strong><span>Canonical revision</span></article></div>
    <div className="fabrication-control-path">{stages.map(([number, title, description]) => <article key={number}><span>{number}</span><div><h3>{title}</h3><p>{description}</p></div></article>)}</div>
    <div className="fabrication-preview-footer"><div><strong>Connected records</strong><p>Project structures · organizations · documents · requirements · tags · deliverables · audit</p></div>
      <p className="truth-notice"><strong>Data truth:</strong> No illustrative engineering records or project counts are shown without authorized scope.</p></div></section>;
}

function storedIdentity(): IdentitySettings {
  return {
    userId: sessionStorage.getItem("eiep.userId") ?? "",
    organizationId: sessionStorage.getItem("eiep.organizationId") ?? "",
    assurance: (sessionStorage.getItem("eiep.assurance") as IdentitySettings["assurance"] | null) ?? "mfa",
  };
}

function localPilotIdentityProfiles(): readonly PilotIdentityProfile[] {
  let parsed: unknown = window.__EIEP_RUNTIME_CONFIG__?.pilotIdentities;
  const source = import.meta.env.VITE_LOCAL_PILOT_IDENTITIES;
  try {
    if (!parsed && source) parsed = JSON.parse(source) as unknown;
    if (!Array.isArray(parsed)) return [];
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
    return parsed.filter((value): value is PilotIdentityProfile => Boolean(value)
      && typeof value === "object"
      && typeof (value as PilotIdentityProfile).displayName === "string"
      && (value as PilotIdentityProfile).displayName.length > 0
      && uuid.test((value as PilotIdentityProfile).userId)
      && uuid.test((value as PilotIdentityProfile).organizationId));
  } catch {
    return [];
  }
}

function displayCode(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

export function App() {
  const apiBase = window.__EIEP_RUNTIME_CONFIG__?.apiBaseUrl
    ?? import.meta.env.VITE_API_BASE_URL
    ?? "http://127.0.0.1:3100";
  const apiCredentials: RequestCredentials = new URL(apiBase).origin === window.location.origin
    ? "same-origin"
    : "omit";
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [apiUnavailable, setApiUnavailable] = useState(false);
  const [identity, setIdentity] = useState<IdentitySettings>(storedIdentity);
  const pilotIdentities = useMemo(localPilotIdentityProfiles, []);
  const [session, setSession] = useState<SessionStatus | null>(null);
  const [projects, setProjects] = useState<readonly ProjectRecord[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [activeModule, setActiveModule] = useState<ModuleKey>(initialModule);
  const [workTarget, setWorkTarget] = useState<WorkTarget | null>(initialWorkTarget);
  const [expandedModules, setExpandedModules] = useState<ReadonlySet<ModuleKey>>(() => new Set([initialModule()]));
  const [reviewDocumentRequest, setReviewDocumentRequest] = useState<{ readonly moduleKey: ModuleKey; readonly code: string; readonly token: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<readonly SearchResult[]>([]);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [activationConfirmation, setActivationConfirmation] = useState("");
  const [readinessStatus, setReadinessStatus] = useState<ProjectReadinessStatus | null>(null);
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;

  const request = useCallback(async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      credentials: apiCredentials,
      headers: {
        ...(init.body instanceof FormData ? {} : { "content-type": "application/json" }),
        "x-eiep-user-id": identity.userId,
        "x-eiep-organization-id": identity.organizationId,
        "x-eiep-assurance": identity.assurance,
        ...(init.headers ?? {}),
      },
    });
    const body = await response.json().catch(() => ({})) as { error?: string; details?: readonly string[]; correlationId?: string };
    if (!response.ok) {
      const details = body.details?.map(displayCode).join(", ");
      throw new Error(`${displayCode(body.error ?? `HTTP ${response.status}`)}${details ? `: ${details}` : ""}`);
    }
    return body as T;
  }, [apiBase, apiCredentials, identity]);

  const download = useCallback(async (path: string, filename: string) => {
    const response = await fetch(`${apiBase}${path}`, {
      credentials: apiCredentials,
      headers: {
        "x-eiep-user-id": identity.userId, "x-eiep-organization-id": identity.organizationId,
        "x-eiep-assurance": identity.assurance,
      },
    });
    if (!response.ok) throw new Error(`Download failed (${response.status}).`);
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = filename; anchor.click();
    URL.revokeObjectURL(url);
  }, [apiBase, apiCredentials, identity]);

  const notify = useCallback((tone: "success" | "error", text: string) => {
    setMessage({ tone, text });
  }, []);

  const openModule = useCallback((module: ModuleKey, target?: WorkTarget) => {
    setActiveModule(module);
    setWorkTarget(target ?? null);
    const url = new URL(window.location.href);
    for (const key of ["workRecordType", "workRecordId", "workAction", "workVersion"]) url.searchParams.delete(key);
    if (target) {
      url.searchParams.set("workRecordType", target.recordType);
      url.searchParams.set("workRecordId", target.recordId);
      url.searchParams.set("workAction", target.action);
      url.searchParams.set("workVersion", String(target.version));
    }
    url.hash = module;
    window.history.pushState(null, "", url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const clearWorkTarget = useCallback(() => {
    setWorkTarget(null);
    const url = new URL(window.location.href);
    for (const key of ["workRecordType", "workRecordId", "workAction", "workVersion"]) url.searchParams.delete(key);
    window.history.replaceState(null, "", url);
  }, []);

  const refreshWorkspace = useCallback(async () => {
    if (!identity.userId || !identity.organizationId || apiUnavailable) return;
    setWorking(true);
    setMessage(null);
    try {
      const [nextSession, visibleProjects] = await Promise.all([
        request<SessionStatus>("/v1/session"),
        request<readonly ProjectRecord[]>("/v1/projects"),
      ]);
      setSession(nextSession);
      setProjects(visibleProjects);
      setSelectedProjectId((current) => current || visibleProjects[0]?.id || "");
    } catch (error) {
      setSession(null);
      setProjects([]);
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Workspace access failed." });
    } finally {
      setWorking(false);
    }
  }, [apiUnavailable, identity.organizationId, identity.userId, request]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiBase}/health`, { signal: controller.signal, credentials: apiCredentials })
      .then(async (response) => {
        if (!response.ok) throw new Error("Health check failed.");
        setHealth((await response.json()) as HealthStatus);
        setApiUnavailable(false);
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setApiUnavailable(true);
      });
    return () => controller.abort();
  }, [apiBase, apiCredentials]);

  useEffect(() => { void refreshWorkspace(); }, [refreshWorkspace]);
  useEffect(() => { setReadinessStatus(null); setActivationConfirmation(""); }, [selectedProjectId]);
  useEffect(() => {
    const followHash = () => { setActiveModule(initialModule()); setWorkTarget(initialWorkTarget()); };
    window.addEventListener("hashchange", followHash);
    window.addEventListener("popstate", followHash);
    return () => { window.removeEventListener("hashchange", followHash); window.removeEventListener("popstate", followHash); };
  }, []);
  useEffect(() => {
    setExpandedModules((current) => new Set([...current, activeModule]));
  }, [activeModule]);
  useEffect(() => {
    if (reviewDocumentRequest?.moduleKey !== activeModule) return;
    const frame = window.requestAnimationFrame(() => document.getElementById(`${activeModule}-review-documents`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [activeModule, reviewDocumentRequest]);

  const moduleCounts = useMemo(() => ({
    projects: projects.length,
    assignments: session?.assignmentCount ?? 0,
    search: searchResults.length,
    blockers: health?.blockers.length ?? 0,
  }), [health?.blockers.length, projects.length, searchResults.length, session?.assignmentCount]);
  const activeModuleDefinition = modules.find((module) => module.key === activeModule) ?? modules[0]!;
  const requiresProjectContext = activeModule !== "estimating";
  const showGenericCapabilityLanding = activeModule !== "overview"
    && (activeModule === "integrations" || activeModule === "administration" || !session || (requiresProjectContext && !selectedProject));

  function saveIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sessionStorage.setItem("eiep.userId", identity.userId);
    sessionStorage.setItem("eiep.organizationId", identity.organizationId);
    sessionStorage.setItem("eiep.assurance", identity.assurance);
    void refreshWorkspace();
  }

  function toggleModuleNavigation(moduleKey: ModuleKey) {
    setExpandedModules((current) => {
      const next = new Set(current);
      if (next.has(moduleKey)) next.delete(moduleKey); else next.add(moduleKey);
      return next;
    });
  }

  function openReviewDocument(moduleKey: ModuleKey, code: string) {
    openModule(moduleKey);
    setReviewDocumentRequest({ moduleKey, code, token: Date.now() });
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setWorking(true);
    setMessage(null);
    try {
      const created = await request<ProjectRecord>("/v1/projects", {
        method: "POST",
        body: JSON.stringify({
          businessScopeOrganizationId: identity.organizationId,
          number: String(form.get("number") ?? ""), name: String(form.get("name") ?? ""),
          customerOrganizationId: String(form.get("customerOrganizationId") ?? ""),
          facilityId: String(form.get("facilityId") ?? ""), timeZone: String(form.get("timeZone") ?? "UTC"),
          readiness: {
            scopeStatement: String(form.get("scopeStatement") ?? ""),
            governingRequirementReferences: String(form.get("governingRequirementReferences") ?? "").split(/[\n,]+/u).map((item) => item.trim()).filter(Boolean),
            plannedStartDate: String(form.get("plannedStartDate") ?? ""),
            plannedFinishDate: String(form.get("plannedFinishDate") ?? ""),
            responsibleRoleCodes: String(form.get("responsibleRoleCodes") ?? "").split(/[\n,]+/u).map((item) => item.trim()).filter(Boolean),
          },
        }),
      });
      setProjects((current) => [...current.filter((project) => project.id !== created.id), created]);
      setSelectedProjectId(created.id);
      setReadinessStatus(null);
      setShowCreateProject(false);
      setActiveModule("projects");
      setMessage({ tone: "success", text: `${created.number} created in Draft. Complete controlled configuration before activation.` });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Project creation failed." });
    } finally {
      setWorking(false);
    }
  }

  async function activateProject() {
    if (!selectedProject) return;
    setWorking(true);
    setMessage(null);
    try {
      const activated = await request<ProjectRecord>(`/v1/projects/${selectedProject.id}/activate`, {
        method: "POST", body: JSON.stringify({ expectedVersion: selectedProject.version }),
      });
      setProjects((current) => current.map((project) => project.id === activated.id ? activated : project));
      setActivationConfirmation("");
      setReadinessStatus({ readiness: activated.readiness ?? {}, blockers: [] });
      setMessage({ tone: "success", text: `${activated.number} activated after server-side readiness revalidation.` });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Activation failed." });
    } finally {
      setWorking(false);
    }
  }

  async function checkProjectReadiness() {
    if (!selectedProject) return;
    setWorking(true);
    setMessage(null);
    try {
      setReadinessStatus(await request<ProjectReadinessStatus>(`/v1/projects/${selectedProject.id}/readiness`));
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Readiness check failed." });
    } finally {
      setWorking(false);
    }
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProject || searchQuery.trim().length < 2) return;
    setWorking(true);
    setMessage(null);
    try {
      setSearchResults(await request<readonly SearchResult[]>(
        `/v1/projects/${selectedProject.id}/search?q=${encodeURIComponent(searchQuery.trim())}`,
      ));
    } catch (error) {
      setSearchResults([]);
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Search failed." });
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="app-shell">
      <EnvironmentBanner environment={health?.environment ?? "unconnected"} training={health?.training ?? false} />
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">E</div>
        <div className="brand-copy">
          <p>EPV Industrial Enterprise Platform</p>
          <strong>Execution control</strong>
        </div>
        <div className={`connection-pill ${apiUnavailable ? "is-offline" : "is-online"}`} role="status">
          <span aria-hidden="true" />{apiUnavailable ? "API unavailable" : health ? "API connected" : "Connecting"}
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <nav aria-label="EIEP modules">
            {modules.map((module) => {
              const capabilities = moduleCapabilityItems[module.key] ?? [];
              const documents = reviewDocumentNavigation(module.key);
              const expanded = expandedModules.has(module.key);
              return <div key={module.key} className={`module-nav-group ${activeModule === module.key ? "is-active" : ""}`}>
                <div className="module-nav-row">
                  <a href={`#${module.key}`} aria-current={activeModule === module.key ? "page" : undefined} onClick={() => openModule(module.key)}>
                    <span>{module.label}</span><small>{module.eyebrow}</small>
                  </a>
                  {module.key !== "overview" ? <button type="button" className="module-nav-toggle" aria-label={`${expanded ? "Collapse" : "Expand"} ${module.label} functions`}
                    aria-expanded={expanded} onClick={() => toggleModuleNavigation(module.key)}><span aria-hidden="true">⌄</span></button> : null}
                </div>
                {module.key !== "overview" && expanded ? <div className="module-nav-children">
                  <button type="button" className="module-nav-workspace" onClick={() => openModule(module.key)}>Open complete workspace</button>
                  {capabilities.length > 0 ? <><span className="module-nav-label">Workflows</span>{capabilities.map(([title]) => <button key={title} type="button" onClick={() => openModule(module.key)}>{title}</button>)}</> : null}
                  {documents.length > 0 ? <><span className="module-nav-label">Documents & registers</span>{documents.map((document) => <button key={document.code} type="button"
                    onClick={() => openReviewDocument(module.key, document.code)}><small>{document.code}</small>{document.title}</button>)}</> : null}
                </div> : null}
              </div>;
            })}
          </nav>
          <form className="identity-card" onSubmit={saveIdentity}>
            <div><p className="section-label">Review identity</p><span className="security-dot" title="Headers are development-only" /></div>
            {pilotIdentities.length > 0 ? <label>Controlled pilot role<select value={pilotIdentities.find((profile) => profile.userId === identity.userId)?.userId ?? ""}
              onChange={(event) => {
                const profile = pilotIdentities.find((candidate) => candidate.userId === event.target.value);
                if (profile) setIdentity({ ...identity, userId: profile.userId, organizationId: profile.organizationId });
              }}>
              <option value="">Custom identity</option>
              {pilotIdentities.map((profile) => <option key={profile.userId} value={profile.userId}>{profile.displayName}</option>)}
            </select></label> : null}
            <label>User ID<input value={identity.userId} onChange={(event) => setIdentity({ ...identity, userId: event.target.value })} required /></label>
            <label>Acting organization<input value={identity.organizationId} onChange={(event) => setIdentity({ ...identity, organizationId: event.target.value })} required /></label>
            <label>Assurance<select value={identity.assurance} onChange={(event) => setIdentity({ ...identity, assurance: event.target.value as IdentitySettings["assurance"] })}>
              <option value="standard">Standard</option><option value="mfa">MFA</option><option value="step-up">Step-up</option>
            </select></label>
            <button className="secondary-button" type="submit" disabled={working || apiUnavailable}>Apply identity</button>
            <p className="fine-print">Development/test adapter only. Hosted environments require OIDC.</p>
          </form>
        </aside>

        <main id={activeModule}>
          {apiUnavailable ? <p className="alert alert-error" role="alert">The API is unavailable. No record actions are enabled.</p> : null}
          {message ? <p className={`alert alert-${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>{message.text}</p> : null}
          <div className="page-heading">
            <div><p className="eyebrow">{activeModuleDefinition.eyebrow}</p><h1>{activeModule === "overview" ? "Controlled project execution" : `${activeModuleDefinition.label} workspace`}</h1>
              <p className="lede">{activeModule === "overview" ? "One governed workspace for material traceability, quality decisions, subcontractor claims, and turnover evidence." : `Explore ${activeModuleDefinition.label} functions and open controlled records when an authorized project context is available.`}</p></div>
            {activeModule === "overview" || activeModule === "projects" ? <button className="primary-button" type="button" onClick={() => setShowCreateProject(true)} disabled={!session || working}>New project</button> : null}
          </div>

          {activeModule === "overview" || activeModule === "projects" ? <><section className="metrics" aria-label="Workspace summary">
            <article><span>Visible projects</span><strong>{moduleCounts.projects}</strong><small>Server-scoped</small></article>
            <article><span>Active assignments</span><strong>{moduleCounts.assignments}</strong><small>{session ? session.assurance : "No session"}</small></article>
            <article><span>Search results</span><strong>{moduleCounts.search}</strong><small>Exact permission filter</small></article>
            <article className={moduleCounts.blockers ? "metric-warning" : ""}><span>Release blockers</span><strong>{moduleCounts.blockers}</strong><small>Production boundary</small></article>
          </section>

          {activeModule === "overview" ? <section className="module-directory" aria-label="Capability directory">
            <div className="module-directory-heading"><div><p className="section-label">Enterprise capability directory</p><h2>Open a module</h2></div>
              <p>Every bucket is interactive. Modules requiring controlled records will show their access boundary until an authorized identity and project are selected.</p></div>
            <div className="module-directory-grid">{modules.filter((module) => module.key !== "overview").map((module) => <button
              key={module.key} type="button" className="capability-bucket" onClick={() => openModule(module.key)} aria-label={`Open ${module.label}`}
            ><span><strong>{module.label}</strong><small>{module.eyebrow}</small></span><b aria-hidden="true">Open →</b></button>)}</div>
          </section> : null}

          <div className="content-grid">
            <section className="panel project-panel" aria-labelledby="project-heading">
              <div className="panel-heading"><div><p className="section-label">Project portfolio</p><h2 id="project-heading">Assigned scope</h2></div>
                <button className="text-button" type="button" onClick={() => void refreshWorkspace()} disabled={working || !session}>Refresh</button></div>
              {!session ? <div className="empty-state"><strong>Identity required</strong><p>Enter a development review identity to request its current assignments.</p></div> : null}
              {session && projects.length === 0 ? <div className="empty-state"><strong>No assigned projects</strong><p>Deny-by-default filtering returned no readable project. Ask an access authority for a bounded assignment.</p></div> : null}
              <div className="project-list">
                {projects.map((project) => (
                  <button key={project.id} type="button" className={project.id === selectedProjectId ? "project-row is-selected" : "project-row"} onClick={() => setSelectedProjectId(project.id)}>
                    <span className="project-code">{project.number}</span><span><strong>{project.name}</strong><small>{project.customerOrganizationId} · {project.timeZone}</small></span>
                    <span className={`state-badge state-${project.state}`}>{displayCode(project.state)}</span>
                  </button>
                ))}
              </div>
            </section>

            <aside className="panel context-panel" aria-labelledby="context-heading">
              <p className="section-label">Current context</p><h2 id="context-heading">{selectedProject ? selectedProject.number : "No project selected"}</h2>
              {selectedProject ? <>
                <dl className="compact-list"><div><dt>State</dt><dd>{displayCode(selectedProject.state)}</dd></div><div><dt>Version</dt><dd>{selectedProject.version}</dd></div><div><dt>Facility</dt><dd>{selectedProject.facilityId}</dd></div></dl>
                <div className="critical-action">
                  <strong>Activate project</strong><p>Requires Step-up assurance, authoritative readiness evidence, permission, and a fresh version check.</p>
                  <button className="secondary-button" type="button" onClick={() => void checkProjectReadiness()} disabled={working}>Check activation readiness</button>
                  {readinessStatus ? <div><p><strong>{readinessStatus.blockers.length} blocker(s)</strong></p>
                    <ul>{readinessStatus.blockers.map((blocker) => <li key={blocker}>{displayCode(blocker)}</li>)}</ul></div> : null}
                  <label>Type {selectedProject.number} to confirm<input value={activationConfirmation} onChange={(event) => setActivationConfirmation(event.target.value)} /></label>
                  <button className="danger-button" type="button" onClick={() => void activateProject()} disabled={working || selectedProject.state === "active" || identity.assurance !== "step-up" || activationConfirmation !== selectedProject.number || readinessStatus?.blockers.length !== 0}>Activate after revalidation</button>
                </div>
              </> : <p className="muted">Select an assigned project to reveal its governed actions.</p>}
            </aside>

            <section className="panel search-panel" aria-labelledby="search-heading">
              <div className="panel-heading"><div><p className="section-label">Cross-record lookup</p><h2 id="search-heading">Scoped search</h2></div><span className="policy-chip">Max 100</span></div>
              <form className="search-form" onSubmit={(event) => void search(event)}><label className="sr-only" htmlFor="record-search">Search assigned records</label><input id="record-search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Document, heat, NCR, punch, external ID…" minLength={2} required /><button className="primary-button" disabled={!selectedProject || working}>Search</button></form>
              <div className="results" aria-live="polite">
                {searchResults.map((result) => <article key={`${result.recordType}:${result.recordId}`}><span className="record-type">{result.recordType}</span><div><strong>{result.label}</strong><small>{result.recordId} · v{result.version}</small></div><span className="state-badge">{displayCode(result.state)}</span></article>)}
                {searchResults.length === 0 ? <p className="muted">Only exact records authorized for this identity appear here.</p> : null}
              </div>
            </section>

            <section className="panel control-panel" aria-labelledby="controls-heading">
              <p className="section-label">Safety boundary</p><h2 id="controls-heading">Connectivity & release</h2>
              <ul className="control-list"><li><span className="control-icon">O</span><div><strong>Authoritative actions</strong><small>Release, acceptance, current-for-work, issue, and turnover generation require online state.</small></div></li><li><span className="control-icon">Q</span><div><strong>Queued offline capture</strong><small>Punch observations retain actor, device, original time, idempotency, and conflicts.</small></div></li><li><span className="control-icon">R</span><div><strong>Read-only cache</strong><small>Only explicitly assigned exact revisions; never a current-state claim.</small></div></li></ul>
            </section>
          </div></> : null}

          {showGenericCapabilityLanding ? <ModuleCapabilityLanding module={activeModuleDefinition} /> : null}

          {workTarget ? <section className="work-target-banner" aria-label="Selected My Work target">
            <div><p className="section-label">My Work target</p><strong>{workTarget.title ?? displayCode(workTarget.action)}</strong>
              <small>{displayCode(workTarget.recordType)} · {workTarget.recordId} · expected v{workTarget.version}</small></div>
            <div><span className="policy-chip">Server revalidation required</span><button type="button" className="text-button" onClick={clearWorkTarget}>Clear target</button></div>
          </section> : null}

          {selectedProject && session && activeModule === "overview" ? <CommandCenterWorkspace
            key={`${identity.userId}:${identity.organizationId}:${selectedProject.id}:command-center`}
            projectId={selectedProject.id}
            projectNumber={selectedProject.number}
            request={request}
            working={working}
            setWorking={setWorking}
            notify={notify}
            openModule={openModule}
          /> : null}

          {selectedProject && activeModule === "projects" ? <ProjectSetup
            projectId={selectedProject.id}
            projectNumber={selectedProject.number}
            request={request}
            working={working}
            setWorking={setWorking}
            notify={notify}
            onChanged={() => setReadinessStatus(null)}
          /> : null}

          {activeModule === "estimating" && session ? <EstimatingWorkspace
            key={`${identity.userId}:${identity.organizationId}`}
            organizationId={identity.organizationId}
            projects={projects}
            request={request}
            download={download}
            working={working}
            setWorking={setWorking}
            notify={notify}
          /> : null}

          {selectedProject && session && (activeModule === "controls" || activeModule === "procurement" || activeModule === "scheduling") ? <ProjectControlsWorkspace
            key={`${identity.userId}:${identity.organizationId}:${selectedProject.id}`}
            projectId={selectedProject.id}
            projectNumber={selectedProject.number}
            organizationId={identity.organizationId}
            initialView={activeModule}
            request={request}
            working={working}
            setWorking={setWorking}
            notify={notify}
          /> : null}

          {selectedProject && session && (activeModule === "welding" || activeModule === "nde" || activeModule === "testing") ? <ExecutionDisciplinesWorkspace
            key={`${identity.userId}:${identity.organizationId}:${selectedProject.id}:execution`}
            projectId={selectedProject.id}
            projectNumber={selectedProject.number}
            initialView={activeModule}
            workTarget={workTarget}
            request={request}
            working={working}
            setWorking={setWorking}
            notify={notify}
          /> : null}

          {selectedProject && session && activeModule === "bluebeam" ? <DocumentCollaborationWorkspace
            key={`${identity.userId}:${identity.organizationId}:${selectedProject.id}:collaboration`}
            projectId={selectedProject.id}
            projectNumber={selectedProject.number}
            userId={identity.userId}
            organizationId={identity.organizationId}
            request={request}
            working={working}
            setWorking={setWorking}
            notify={notify}
          /> : null}

          {selectedProject && session && activeModule === "fabrication" ? <FabricationWorkspace
            key={`${identity.userId}:${identity.organizationId}:${selectedProject.id}:fabrication`}
            projectId={selectedProject.id}
            projectNumber={selectedProject.number}
            request={request}
            working={working}
            setWorking={setWorking}
            notify={notify}
          /> : null}

          {activeModule === "fabrication" && (!selectedProject || !session) ? <FabricationCapabilityPreview /> : null}

          {selectedProject && session && activeModule === "cnc" ? <CncWorkspace
            key={`${identity.userId}:${identity.organizationId}:${selectedProject.id}:cnc`}
            projectId={selectedProject.id}
            projectNumber={selectedProject.number}
            request={request}
            working={working}
            setWorking={setWorking}
            notify={notify}
          /> : null}

          {activeModule === "cnc" && (!selectedProject || !session) ? <CncCapabilityPreview /> : null}

          {selectedProject && session && activeModule === "engineering" ? <EngineeringRegisterWorkspace
            key={`${identity.userId}:${identity.organizationId}:${selectedProject.id}:engineering`}
            projectId={selectedProject.id} projectNumber={selectedProject.number} request={request} working={working}
            setWorking={setWorking} notify={notify}
          /> : null}

          {activeModule === "engineering" && (!selectedProject || !session) ? <EngineeringCapabilityPreview /> : null}

          {selectedProject && (activeModule === "documents" || activeModule === "materials" || activeModule === "quality" || activeModule === "turnover" || activeModule === "reports")
            ? <OperationalChain
              projectId={selectedProject.id}
              projectNumber={selectedProject.number}
              initialStep={activeModule}
              workTarget={workTarget}
              request={request}
              download={download}
              working={working}
              setWorking={setWorking}
              notify={notify}
            />
            : null}

          {activeModule !== "overview" ? <ModuleReviewWorkspace
            key={`${activeModule}:review`}
            moduleKey={activeModule}
            moduleLabel={activeModuleDefinition.label}
            {...(reviewDocumentRequest?.moduleKey === activeModule
              ? { requestedDocumentCode: reviewDocumentRequest.code, requestToken: reviewDocumentRequest.token }
              : {})}
          /> : null}

          {health && !health.productionReady ? <section className="release-boundary" aria-labelledby="release-heading"><div><p className="section-label">Release boundary</p><h2 id="release-heading">Production authorization remains blocked</h2></div><ul>{health.blockers.map((blocker) => <li key={blocker}>{displayCode(blocker)}</li>)}</ul></section> : null}
        </main>
      </div>

      {showCreateProject ? <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="create-project-title">
        <div className="panel-heading"><div><p className="section-label">Controlled setup</p><h2 id="create-project-title">Create draft project</h2></div><button className="icon-button" type="button" aria-label="Close project form" onClick={() => setShowCreateProject(false)}>×</button></div>
        <p>Creation establishes identity only. Authorities, requirements, responsibilities, boundaries, and turnover configuration remain explicit activation blockers.</p>
        <form className="form-grid" onSubmit={(event) => void createProject(event)}>
          <label>Project number<input name="number" required /></label><label>Project name<input name="name" required /></label>
          <label>Customer organization ID<input name="customerOrganizationId" required /></label><label>Facility ID<input name="facilityId" required /></label>
          <label>Time zone<input name="timeZone" defaultValue="UTC" required /></label><label>Scope statement<textarea name="scopeStatement" required /></label>
          <label>Governing requirement references<textarea name="governingRequirementReferences" placeholder="One code/specification per line" required /></label>
          <label>Responsible role codes<textarea name="responsibleRoleCodes" placeholder="project_manager, quality_manager" required /></label>
          <label>Planned start date<input name="plannedStartDate" type="date" required /></label><label>Planned finish date<input name="plannedFinishDate" type="date" required /></label>
          <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setShowCreateProject(false)}>Cancel</button><button className="primary-button" type="submit" disabled={working}>Create draft</button></div>
        </form>
      </section></div> : null}
    </div>
  );
}
