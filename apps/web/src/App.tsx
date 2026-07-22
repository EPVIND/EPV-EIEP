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

interface HealthStatus {
  readonly status: string;
  readonly environment: string;
  readonly training: boolean;
  readonly productionReady: boolean;
  readonly blockers: readonly string[];
}

declare global {
  interface Window {
    readonly __EIEP_RUNTIME_CONFIG__?: { readonly apiBaseUrl?: string };
  }
}

interface IdentitySettings {
  readonly userId: string;
  readonly organizationId: string;
  readonly assurance: "standard" | "mfa" | "step-up";
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

type ModuleKey = "overview" | "estimating" | "controls" | "procurement" | "scheduling" | "welding" | "nde" | "testing" | "fabrication" | "bluebeam" | "projects" | "documents" | "materials" | "quality" | "turnover" | "reports" | "integrations" | "administration";

const modules: readonly { key: ModuleKey; label: string; eyebrow: string }[] = [
  { key: "overview", label: "Overview", eyebrow: "Control room" },
  { key: "estimating", label: "Estimating", eyebrow: "Cost · quotes · proposals" },
  { key: "controls", label: "Project Controls", eyebrow: "Budget · change · EAC" },
  { key: "procurement", label: "Procurement", eyebrow: "Bid · award · expedite" },
  { key: "scheduling", label: "Scheduling", eyebrow: "Logic · updates · look-ahead" },
  { key: "welding", label: "Welding", eyebrow: "WPS · WPQ · weld map" },
  { key: "nde", label: "NDE / PWHT", eyebrow: "Examination · heat treatment" },
  { key: "testing", label: "Testing", eyebrow: "Boundaries · safety · results" },
  { key: "fabrication", label: "Fabrication & Spools", eyebrow: "BOM · traveler · shop release" },
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

function initialModule(): ModuleKey {
  const requested = window.location.hash.replace(/^#/u, "") as ModuleKey;
  return modules.some((module) => module.key === requested) ? requested : "overview";
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

function storedIdentity(): IdentitySettings {
  return {
    userId: sessionStorage.getItem("eiep.userId") ?? "",
    organizationId: sessionStorage.getItem("eiep.organizationId") ?? "",
    assurance: (sessionStorage.getItem("eiep.assurance") as IdentitySettings["assurance"] | null) ?? "mfa",
  };
}

function displayCode(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

export function App() {
  const apiBase = window.__EIEP_RUNTIME_CONFIG__?.apiBaseUrl
    ?? import.meta.env.VITE_API_BASE_URL
    ?? "http://127.0.0.1:3100";
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [apiUnavailable, setApiUnavailable] = useState(false);
  const [identity, setIdentity] = useState<IdentitySettings>(storedIdentity);
  const [session, setSession] = useState<SessionStatus | null>(null);
  const [projects, setProjects] = useState<readonly ProjectRecord[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [activeModule, setActiveModule] = useState<ModuleKey>(initialModule);
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
      credentials: "omit",
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
  }, [apiBase, identity]);

  const download = useCallback(async (path: string, filename: string) => {
    const response = await fetch(`${apiBase}${path}`, {
      credentials: "omit",
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
  }, [apiBase, identity]);

  const notify = useCallback((tone: "success" | "error", text: string) => {
    setMessage({ tone, text });
  }, []);

  const openModule = useCallback((module: ModuleKey) => {
    setActiveModule(module);
    window.location.hash = module;
    window.scrollTo({ top: 0, behavior: "smooth" });
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
    fetch(`${apiBase}/health`, { signal: controller.signal, credentials: "omit" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Health check failed.");
        setHealth((await response.json()) as HealthStatus);
        setApiUnavailable(false);
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setApiUnavailable(true);
      });
    return () => controller.abort();
  }, [apiBase]);

  useEffect(() => { void refreshWorkspace(); }, [refreshWorkspace]);
  useEffect(() => { setReadinessStatus(null); setActivationConfirmation(""); }, [selectedProjectId]);
  useEffect(() => {
    const followHash = () => setActiveModule(initialModule());
    window.addEventListener("hashchange", followHash);
    return () => window.removeEventListener("hashchange", followHash);
  }, []);

  const moduleCounts = useMemo(() => ({
    projects: projects.length,
    assignments: session?.assignmentCount ?? 0,
    search: searchResults.length,
    blockers: health?.blockers.length ?? 0,
  }), [health?.blockers.length, projects.length, searchResults.length, session?.assignmentCount]);

  function saveIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sessionStorage.setItem("eiep.userId", identity.userId);
    sessionStorage.setItem("eiep.organizationId", identity.organizationId);
    sessionStorage.setItem("eiep.assurance", identity.assurance);
    void refreshWorkspace();
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
            {modules.map((module) => (
              <a
                key={module.key}
                href={`#${module.key}`}
                aria-current={activeModule === module.key ? "page" : undefined}
                onClick={() => openModule(module.key)}
              >
                <span>{module.label}</span><small>{module.eyebrow}</small>
              </a>
            ))}
          </nav>
          <form className="identity-card" onSubmit={saveIdentity}>
            <div><p className="section-label">Review identity</p><span className="security-dot" title="Headers are development-only" /></div>
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
            <div><p className="eyebrow">{modules.find((module) => module.key === activeModule)?.eyebrow}</p><h1>Controlled project execution</h1>
              <p className="lede">One governed workspace for material traceability, quality decisions, subcontractor claims, and turnover evidence.</p></div>
            <button className="primary-button" type="button" onClick={() => setShowCreateProject(true)} disabled={!session || working}>New project</button>
          </div>

          <section className="metrics" aria-label="Workspace summary">
            <article><span>Visible projects</span><strong>{moduleCounts.projects}</strong><small>Server-scoped</small></article>
            <article><span>Active assignments</span><strong>{moduleCounts.assignments}</strong><small>{session ? session.assurance : "No session"}</small></article>
            <article><span>Search results</span><strong>{moduleCounts.search}</strong><small>Exact permission filter</small></article>
            <article className={moduleCounts.blockers ? "metric-warning" : ""}><span>Release blockers</span><strong>{moduleCounts.blockers}</strong><small>Production boundary</small></article>
          </section>

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
          </div>

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
            request={request}
            working={working}
            setWorking={setWorking}
            notify={notify}
          /> : null}

          {selectedProject && session && activeModule === "bluebeam" ? <DocumentCollaborationWorkspace
            key={`${identity.userId}:${identity.organizationId}:${selectedProject.id}:collaboration`}
            projectId={selectedProject.id}
            projectNumber={selectedProject.number}
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

          {selectedProject && (activeModule === "documents" || activeModule === "materials" || activeModule === "quality" || activeModule === "turnover" || activeModule === "reports")
            ? <OperationalChain
              projectId={selectedProject.id}
              projectNumber={selectedProject.number}
              initialStep={activeModule}
              request={request}
              download={download}
              working={working}
              setWorking={setWorking}
              notify={notify}
            />
            : null}

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
