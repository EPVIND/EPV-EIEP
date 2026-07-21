import { StrictMode, type FormEvent, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { EnvironmentBanner } from "@eiep/ui-components";
import "./styles.css";

interface HealthStatus { readonly environment: string; readonly training: boolean; }
declare global {
  interface Window {
    readonly __EIEP_RUNTIME_CONFIG__?: { readonly apiBaseUrl?: string };
  }
}
interface AssignedWork {
  readonly id: string;
  readonly projectId: string;
  readonly organizationId: string;
  readonly approvedScopeCode: string;
  readonly workPackageIds: readonly string[];
  readonly authorizationReference: string;
  readonly mobilizationState: "pending" | "released" | "suspended";
  readonly version: number;
}
interface Submission {
  readonly id: string;
  readonly projectId: string;
  readonly workPackageId: string;
  readonly category: string;
  readonly title: string;
  readonly state: string;
  readonly version: number;
}

function Portal() {
  const apiBase = window.__EIEP_RUNTIME_CONFIG__?.apiBaseUrl
    ?? import.meta.env.VITE_API_BASE_URL
    ?? "http://127.0.0.1:3100";
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [userId, setUserId] = useState(() => sessionStorage.getItem("eiep.portal.userId") ?? "");
  const [organizationId, setOrganizationId] = useState(() => sessionStorage.getItem("eiep.portal.organizationId") ?? "");
  const [assignedWork, setAssignedWork] = useState<readonly AssignedWork[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [working, setWorking] = useState(false);
  const selectedAssignment = assignedWork.find((assignment) => assignment.id === selectedAssignmentId) ?? null;

  const request = useCallback(async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    const response = await fetch(`${apiBase}${path}`, {
      ...init, credentials: "omit", headers: {
        "content-type": "application/json", "x-eiep-user-id": userId,
        "x-eiep-organization-id": organizationId, "x-eiep-assurance": "mfa", ...(init.headers ?? {}),
      },
    });
    const body = await response.json().catch(() => ({})) as { error?: string; details?: readonly string[] };
    if (!response.ok) throw new Error(body.details?.join(", ") || body.error || `Request failed (${response.status}).`);
    return body as T;
  }, [apiBase, organizationId, userId]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiBase}/health`, { signal: controller.signal, credentials: "omit" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setHealth((await response.json()) as HealthStatus);
        setUnavailable(false);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setUnavailable(true);
      });
    return () => controller.abort();
  }, [apiBase]);

  async function loadAssignedWork(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    sessionStorage.setItem("eiep.portal.userId", userId);
    sessionStorage.setItem("eiep.portal.organizationId", organizationId);
    setWorking(true);
    setMessage(null);
    try {
      const work = await request<readonly AssignedWork[]>("/v1/portal/assigned-work");
      setAssignedWork(work);
      setSelectedAssignmentId((current) => current || work[0]?.id || "");
      setMessage({ error: false, text: work.length ? "Assigned scope refreshed." : "No work is currently assigned to this identity." });
    } catch (error) {
      setAssignedWork([]);
      setMessage({ error: true, text: error instanceof Error ? error.message : "Assigned-work request failed." });
    } finally {
      setWorking(false);
    }
  }

  async function submitClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAssignment) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const workPackageId = String(form.get("workPackageId") ?? "");
    const progressText = String(form.get("claimedProgressPercent") ?? "").trim();
    setWorking(true);
    setMessage(null);
    try {
      const submission = await request<Submission>(
        `/v1/portal/projects/${selectedAssignment.projectId}/work-packages/${encodeURIComponent(workPackageId)}/submissions`,
        {
          method: "POST", body: JSON.stringify({
            category: String(form.get("category") ?? "progress"), title: String(form.get("title") ?? ""),
            claimedProgressPercent: progressText ? Number(progressText) : null,
            evidenceFileIds: String(form.get("evidenceFileIds") ?? "").split(",").map((value) => value.trim()).filter(Boolean),
          }),
        },
      );
      formElement.reset();
      setMessage({ error: false, text: `${submission.title} submitted. It remains a claim until distinct EPV acceptance.` });
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : "Submission failed." });
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="portal-shell">
      <EnvironmentBanner environment={health?.environment ?? "unconnected"} training={health?.training ?? false} />
      <header className="portal-header"><div className="portal-brand"><span aria-hidden="true">E</span><div><p>EPV Industrial Enterprise Platform</p><strong>Partner workspace</strong></div></div><div className={unavailable ? "status-pill offline" : "status-pill"}>{unavailable ? "Pilot access offline" : "Secure API connected"}</div></header>
      <main>
        <section className="hero"><p className="eyebrow">EIEP partner portal</p><h1>Assigned scope only</h1><p>Submit controlled progress and quality evidence without crossing organization, project, or work-package boundaries.</p><div className="boundary-note"><strong>EPV remains the acceptance authority.</strong><span>Every submission is a claim until a separate authorized EPV reviewer accepts it.</span></div></section>
        {unavailable ? <div className="notice" role="status">External pilot access is not enabled. No project identifiers or records are displayed.</div> : null}
        {message ? <p className={message.error ? "notice notice-error" : "notice notice-success"} role={message.error ? "alert" : "status"}>{message.text}</p> : null}
        <div className="portal-grid">
          <aside className="card identity-panel"><p className="section-label">Portal identity</p><h2>Access context</h2><form onSubmit={(event) => void loadAssignedWork(event)}><label>User ID<input value={userId} onChange={(event) => setUserId(event.target.value)} required /></label><label>Organization ID<input value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} required /></label><div className="assurance-row"><span>MFA assurance</span><strong>Required</strong></div><button type="submit" disabled={unavailable || working}>Load assigned work</button></form><small className="fine-print">Development headers are available only in local review. Hosted access uses approved OIDC guest identity and lifecycle controls.</small></aside>
          <section className="card work-panel" aria-labelledby="work-title"><div className="card-heading"><div><p className="section-label">Authorized portfolio</p><h2 id="work-title">Assigned work packages</h2></div><span className="count-badge">{assignedWork.length}</span></div>{assignedWork.length === 0 ? <div className="empty"><strong>No scope loaded</strong><p>Assignment discovery fails closed. Enter an approved review identity or contact an EPV access authority.</p></div> : <div className="assignment-list">{assignedWork.map((assignment) => <button key={assignment.id} type="button" className={assignment.id === selectedAssignmentId ? "assignment is-selected" : "assignment"} onClick={() => setSelectedAssignmentId(assignment.id)}><span><strong>{assignment.approvedScopeCode}</strong><small>Project {assignment.projectId}</small></span><span><strong>{assignment.workPackageIds.length}</strong><small>packages</small></span><span className={`state state-${assignment.mobilizationState}`}>{assignment.mobilizationState}</span></button>)}</div>}</section>
          <section className="card submit-panel" aria-labelledby="submit-title"><p className="section-label">Controlled handoff</p><h2 id="submit-title">Submit an EPV review claim</h2>{selectedAssignment?.mobilizationState !== "released" ? <div className="gate"><strong>Mobilization gate closed</strong><p>Commercial, safety, quality, insurance, license, lower-tier, and submission prerequisites must be independently accepted and current.</p></div> : <form className="submission-form" onSubmit={(event) => void submitClaim(event)}><label>Work package<select name="workPackageId" required>{selectedAssignment.workPackageIds.map((id) => <option key={id}>{id}</option>)}</select></label><label>Category<select name="category"><option value="progress">Progress</option><option value="inspection">Inspection</option><option value="deficiency">Deficiency</option><option value="turnover">Turnover</option></select></label><label className="wide">Title<input name="title" required /></label><label>Claimed progress (%)<input name="claimedProgressPercent" type="number" min="0" max="100" step="0.1" /></label><label>Released evidence file IDs<input name="evidenceFileIds" placeholder="file-id-1, file-id-2" required /></label><button className="wide" type="submit" disabled={working}>Submit for EPV review</button></form>}</section>
          <aside className="card rules-panel"><p className="section-label">Scope controls</p><h2>What this portal enforces</h2><ul><li>Acting organization must match the assignment.</li><li>Project and work package must be explicitly assigned.</li><li>Mobilization must be released and current.</li><li>Evidence IDs remain governed files.</li><li>Submission never implies EPV acceptance.</li></ul></aside>
        </div>
      </main>
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Application root is missing.");
createRoot(root).render(<StrictMode><Portal /></StrictMode>);
