import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
type Notify = (tone: "success" | "error", text: string) => void;
interface Finding { readonly code: string; readonly severity: string; readonly detail: string; }
interface Item { readonly id: string; readonly registerType: string; readonly tag: string; readonly revision: string; readonly parentRevisionId: string | null;
  readonly title: string; readonly disciplineCode: string; readonly systemCode: string | null; readonly areaCode: string | null; readonly workPackageCode: string | null;
  readonly responsibleOrganizationId: string; readonly documentRevisionIds: readonly string[]; readonly relatedItemRevisionIds: readonly string[];
  readonly attributes: Readonly<Record<string, string>>; readonly validationFindings: readonly Finding[]; readonly canonicalSha256: string;
  readonly state: string; readonly version: number; readonly createdBy: string; readonly submittedBy: string | null; readonly reviewedBy: string | null; }
interface Snapshot { readonly generatedAt: string; readonly items: readonly Item[]; readonly counts: Readonly<Record<string, number>>; readonly openValidationFindingCount: number; }
interface Props { readonly projectId: string; readonly projectNumber: string; readonly request: Request; readonly working: boolean;
  readonly setWorking: (working: boolean) => void; readonly notify: Notify; }
const types = ["requirement", "deliverable", "system", "equipment", "line", "instrument", "component", "tag"] as const;
const split = (value: FormDataEntryValue | null) => String(value ?? "").split(/[\n,]+/u).map((item) => item.trim()).filter(Boolean);
const nullable = (value: FormDataEntryValue | null) => String(value ?? "").trim() || null;
const display = (value: string) => value.replaceAll("_", " ");
const empty: Snapshot = { generatedAt: "", items: [], counts: {}, openValidationFindingCount: 0 };

export function EngineeringRegisterWorkspace({ projectId, projectNumber, request, working, setWorking, notify }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot>(empty); const [selectedId, setSelectedId] = useState("");
  const refresh = useCallback(async (quiet = false) => { if (!quiet) setWorking(true); try {
    const next = await request<Snapshot>(`/v1/projects/${projectId}/engineering-registers`); setSnapshot(next);
    setSelectedId((current) => current && next.items.some((item) => item.id === current) ? current : next.items[0]?.id ?? "");
  } catch (error) { notify("error", error instanceof Error ? error.message : "Engineering register load failed."); } finally { if (!quiet) setWorking(false); } }, [notify, projectId, request, setWorking]);
  useEffect(() => { void refresh(); }, [refresh]);
  const selected = snapshot.items.find((item) => item.id === selectedId) ?? null;
  const approved = useMemo(() => snapshot.items.filter((item) => item.state === "approved").length, [snapshot.items]);
  async function act(path: string, body: unknown, message: string) { setWorking(true); try {
    await request(path, { method: "POST", body: JSON.stringify(body) }); notify("success", message); await refresh(true);
  } catch (error) { notify("error", error instanceof Error ? error.message : "Engineering register action failed."); } finally { setWorking(false); } }
  async function create(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget);
    const attributeRows = split(form.get("attributes")).map((row) => row.split("=").map((part) => part.trim()));
    await act(`/v1/projects/${projectId}/engineering-register-items`, { registerType: String(form.get("registerType")), tag: String(form.get("tag")),
      revision: String(form.get("revision")), parentRevisionId: nullable(form.get("parentRevisionId")), revisionReason: String(form.get("revisionReason")),
      title: String(form.get("title")), disciplineCode: String(form.get("disciplineCode")), systemCode: nullable(form.get("systemCode")),
      areaCode: nullable(form.get("areaCode")), workPackageCode: nullable(form.get("workPackageCode")), responsibleOrganizationId: String(form.get("responsibleOrganizationId")),
      documentRevisionIds: split(form.get("documentRevisionIds")), relatedItemRevisionIds: split(form.get("relatedItemRevisionIds")),
      attributes: Object.fromEntries(attributeRows.filter(([key, value]) => key && value)), plannedIssueDate: nullable(form.get("plannedIssueDate")),
      forecastIssueDate: nullable(form.get("forecastIssueDate")), actualIssueDate: nullable(form.get("actualIssueDate")) }, "Register revision created with deterministic validation and hash.");
  }
  return <section className="workspace-section" aria-labelledby="engineering-heading">
    <div className="workspace-hero"><div><p className="section-label">Multidisciplinary engineering database</p><h2 id="engineering-heading">Engineering registers · {projectNumber}</h2>
      <p>Stable requirements, deliverables, systems, equipment, lines, instruments, components, and tags with exact revision lineage.</p></div><button className="secondary-button" type="button" onClick={() => void refresh()} disabled={working}>Refresh</button></div>
    <div className="fabrication-preview-metrics" aria-label="Engineering register summary"><article><strong>{snapshot.items.length}</strong><span>Controlled revisions</span></article>
      <article><strong>{approved}</strong><span>Approved current</span></article><article><strong>{snapshot.openValidationFindingCount}</strong><span>Open findings</span></article>
      <article><strong>SHA-256</strong><span>Canonical identity</span></article></div>
    <div className="workspace-grid"><section className="panel"><div className="panel-heading"><div><p className="section-label">Register index</p><h3>Permission-scoped items</h3></div></div>
      <div className="project-list">{snapshot.items.map((item) => <button key={item.id} type="button" className={item.id === selectedId ? "project-row is-selected" : "project-row"} onClick={() => setSelectedId(item.id)}>
        <span className="project-code">{item.tag}</span><span><strong>{item.title}</strong><small>{display(item.registerType)} · Rev {item.revision} · {item.disciplineCode}</small></span><span className={`state-badge state-${item.state}`}>{display(item.state)}</span></button>)}</div>
      {snapshot.items.length === 0 ? <div className="empty-state"><strong>No authorized register items</strong><p>Create the first controlled revision or request project scope.</p></div> : null}</section>
      <aside className="panel">{selected ? <><p className="section-label">Selected revision</p><h3>{selected.tag} · Rev {selected.revision}</h3>
        <dl className="compact-list"><div><dt>Register</dt><dd>{display(selected.registerType)}</dd></div><div><dt>System</dt><dd>{selected.systemCode ?? "—"}</dd></div>
          <div><dt>Documents</dt><dd>{selected.documentRevisionIds.length}</dd></div><div><dt>Related records</dt><dd>{selected.relatedItemRevisionIds.length}</dd></div>
          <div><dt>Canonical hash</dt><dd>{selected.canonicalSha256.slice(0, 16)}…</dd></div></dl>
        {selected.validationFindings.map((finding) => <p className="alert alert-error" key={finding.code}>{display(finding.code)} · {finding.detail}</p>)}
        <div className="action-row"><button className="secondary-button" disabled={working || selected.state !== "draft" || selected.validationFindings.some((finding) => finding.severity === "error")} onClick={() => void act(`/v1/engineering-register-items/${selected.id}/submit`, { expectedVersion: selected.version }, "Submitted for independent engineering approval.")}>Submit</button>
          <button className="primary-button" disabled={working || selected.state !== "under_review"} onClick={() => void act(`/v1/engineering-register-items/${selected.id}/review`, { expectedVersion: selected.version, decision: "approve", reason: "Scope, references, attributes, lineage, and hash independently verified." }, "Register revision approved; predecessor superseded where applicable.")}>Approve</button></div></> : <p className="muted">Select a register revision.</p>}</aside></div>
    <section className="panel"><div className="panel-heading"><div><p className="section-label">Controlled authoring</p><h3>Create register revision</h3></div><span className="policy-chip">Independent approval</span></div>
      <form className="form-grid" onSubmit={(event) => void create(event)}><label>Register type<select name="registerType">{types.map((type) => <option key={type}>{type}</option>)}</select></label>
        <label>Tag / number<input name="tag" required /></label><label>Revision<input name="revision" defaultValue="0" required /></label><label>Parent revision ID<input name="parentRevisionId" /></label>
        <label className="form-span-2">Title<input name="title" required /></label><label>Discipline<input name="disciplineCode" required /></label><label>Responsible organization<input name="responsibleOrganizationId" required /></label>
        <label>System code<input name="systemCode" /></label><label>Area code<input name="areaCode" /></label><label>Work package code<input name="workPackageCode" /></label><label>Planned issue<input name="plannedIssueDate" type="date" /></label>
        <label>Forecast issue<input name="forecastIssueDate" type="date" /></label><label>Actual issue<input name="actualIssueDate" type="date" /></label>
        <label className="form-span-2">Released document revision IDs<textarea name="documentRevisionIds" rows={2} /></label><label className="form-span-2">Approved related register revision IDs<textarea name="relatedItemRevisionIds" rows={2} /></label>
        <label className="form-span-2">Attributes (KEY=value per line)<textarea name="attributes" rows={3} /></label><label className="form-span-2">Revision reason<textarea name="revisionReason" rows={2} required /></label>
        <button className="primary-button" disabled={working}>Create validated revision</button></form></section>
  </section>;
}
