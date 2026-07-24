import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
type Notify = (tone: "success" | "error", text: string) => void;

interface BomLine { readonly lineKey: string; readonly materialItemId: string; readonly description: string; readonly quantity: string; readonly unitCode: string; readonly pieceMark: string; }
interface CutLine { readonly lineKey: string; readonly bomLineKey: string; readonly materialItemId: string; readonly cutLength: string; readonly lengthUnitCode: string; readonly cutAngleDegrees: string; readonly bevelCode: string | null; readonly quantity: string; }
interface Assembly {
  readonly id: string; readonly number: string; readonly revision: string; readonly assemblyType: string; readonly parentRevisionId: string | null;
  readonly revisionReason: string; readonly sourceSystem: string; readonly sourceVersion: string | null; readonly sourceSha256: string | null;
  readonly systemCode: string; readonly areaCode: string; readonly workPackageCode: string; readonly completionBoundaryId: string;
  readonly drawingRevisionIds: readonly string[]; readonly materialItemIds: readonly string[]; readonly weldIds: readonly string[];
  readonly requiredInspectionIds: readonly string[]; readonly bomLines: readonly BomLine[]; readonly cutLines: readonly CutLine[];
  readonly state: string; readonly submittedBy: string | null; readonly reviewedBy: string | null; readonly releasedBy: string | null;
  readonly acceptedBy: string | null; readonly version: number;
}
interface Operation {
  readonly operationKey: string; readonly sequence: number; readonly operationType: string; readonly workCenterCode: string;
  readonly requiredQualificationCodes: readonly string[]; readonly procedureDocumentRevisionId: string | null; readonly holdPoint: boolean;
  readonly materialItemIds: readonly string[]; readonly weldIds: readonly string[]; readonly plannedHours: string; readonly instructions: string;
}
interface Traveler { readonly id: string; readonly assemblyRevisionId: string; readonly number: string; readonly revision: string; readonly operations: readonly Operation[]; readonly state: string; readonly issuedBy: string | null; readonly version: number; }
interface ExecutionEvent { readonly id: string; readonly sequence: number; readonly travelerId: string; readonly operationKey: string; readonly eventType: string; readonly result: string; readonly performedBy: string; readonly performedAt: string; }
interface Snapshot {
  readonly assemblies: readonly Assembly[]; readonly travelers: readonly Traveler[]; readonly events: readonly ExecutionEvent[];
  readonly releaseReadiness: readonly { readonly assemblyRevisionId: string; readonly blockers: readonly string[] }[];
  readonly acceptanceReadiness: readonly { readonly assemblyRevisionId: string; readonly blockers: readonly string[] }[];
}
interface Props { readonly projectId: string; readonly projectNumber: string; readonly request: Request; readonly working: boolean; readonly setWorking: (working: boolean) => void; readonly notify: Notify; }

const emptySnapshot: Snapshot = { assemblies: [], travelers: [], events: [], releaseReadiness: [], acceptanceReadiness: [] };
const split = (value: FormDataEntryValue | null) => String(value ?? "").split(/[\n,]+/u).map((item) => item.trim()).filter(Boolean);
const nullable = (value: FormDataEntryValue | null) => String(value ?? "").trim() || null;
const display = (value: string) => value.replaceAll("_", " ");
const errorText = (error: unknown) => error instanceof Error ? error.message : "The controlled fabrication action failed.";
const rows = (value: FormDataEntryValue | null) => String(value ?? "").split(/\r?\n/u).map((row) => row.trim()).filter(Boolean).map((row) => row.split("|").map((cell) => cell.trim()));

export function FabricationWorkspace({ projectId, projectNumber, request, working, setWorking, notify }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [selectedAssemblyId, setSelectedAssemblyId] = useState("");
  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setWorking(true);
    try {
      const next = await request<Snapshot>(`/v1/projects/${projectId}/fabrication`);
      setSnapshot(next);
      setSelectedAssemblyId((current) => current && next.assemblies.some((item) => item.id === current)
        ? current : next.assemblies[0]?.id ?? "");
    } catch (error) { notify("error", errorText(error)); }
    finally { if (!quiet) setWorking(false); }
  }, [notify, projectId, request, setWorking]);
  useEffect(() => { void refresh(); }, [refresh]);
  const selected = snapshot.assemblies.find((item) => item.id === selectedAssemblyId) ?? null;
  const traveler = selected ? snapshot.travelers.find((item) => item.assemblyRevisionId === selected.id) ?? null : null;
  const events = traveler ? snapshot.events.filter((item) => item.travelerId === traveler.id) : [];
  const release = selected ? snapshot.releaseReadiness.find((item) => item.assemblyRevisionId === selected.id) : null;
  const acceptance = selected ? snapshot.acceptanceReadiness.find((item) => item.assemblyRevisionId === selected.id) : null;
  const metrics = useMemo(() => ({
    revisions: snapshot.assemblies.length,
    released: snapshot.assemblies.filter((item) => ["released_to_fabrication", "in_fabrication", "fabrication_complete", "accepted"].includes(item.state)).length,
    active: snapshot.travelers.filter((item) => ["issued", "in_progress", "on_hold"].includes(item.state)).length,
    accepted: snapshot.assemblies.filter((item) => item.state === "accepted").length,
  }), [snapshot]);

  async function act(path: string, body: unknown, success: string) {
    setWorking(true);
    try { await request(path, { method: "POST", body: JSON.stringify(body) }); notify("success", success); await refresh(true); }
    catch (error) { notify("error", errorText(error)); }
    finally { setWorking(false); }
  }

  async function createAssembly(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const bomLines = rows(form.get("bomLines")).map(([lineKey, materialItemId, description, quantity, unitCode, pieceMark]) =>
      ({ lineKey, materialItemId, description, quantity, unitCode, pieceMark }));
    const cutLines = rows(form.get("cutLines")).map(([lineKey, bomLineKey, materialItemId, cutLength, lengthUnitCode, cutAngleDegrees, bevelCode, quantity]) =>
      ({ lineKey, bomLineKey, materialItemId, cutLength, lengthUnitCode, cutAngleDegrees, bevelCode: bevelCode || null, quantity }));
    await act(`/v1/projects/${projectId}/fabrication-assemblies`, {
      number: String(form.get("number")), revision: String(form.get("revision")), assemblyType: String(form.get("assemblyType")),
      parentRevisionId: nullable(form.get("parentRevisionId")), revisionReason: String(form.get("revisionReason")),
      sourceSystem: String(form.get("sourceSystem")), sourceVersion: nullable(form.get("sourceVersion")),
      sourceSha256: nullable(form.get("sourceSha256")), systemCode: String(form.get("systemCode")), areaCode: String(form.get("areaCode")),
      workPackageCode: String(form.get("workPackageCode")), completionBoundaryId: String(form.get("completionBoundaryId")),
      drawingRevisionIds: split(form.get("drawingRevisionIds")), materialItemIds: split(form.get("materialItemIds")),
      weldIds: split(form.get("weldIds")), requiredInspectionIds: split(form.get("requiredInspectionIds")), bomLines, cutLines,
    }, "Fabrication assembly revision created with exact drawing, material, weld, BOM, cut-list, and completion-boundary lineage.");
  }

  async function createTraveler(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; const form = new FormData(event.currentTarget);
    const operations = rows(form.get("operations")).map(([operationKey, sequence, operationType, workCenterCode, holdPoint,
      qualifications, procedureDocumentRevisionId, materialItemIds, weldIds, plannedHours, instructions]) => ({
      operationKey, sequence: Number(sequence), operationType, workCenterCode, holdPoint: /^(yes|true|hold)$/iu.test(holdPoint ?? ""),
      requiredQualificationCodes: split(qualifications ?? ""), procedureDocumentRevisionId: procedureDocumentRevisionId || null,
      materialItemIds: split(materialItemIds ?? ""), weldIds: split(weldIds ?? ""), plannedHours, instructions,
    }));
    await act(`/v1/fabrication-assemblies/${selected.id}/travelers`, {
      number: String(form.get("number")), revision: String(form.get("revision")), operations,
    }, "Revision-controlled shop traveler created with sequenced operations, qualifications, procedures, hours, and hold points.");
  }

  async function recordEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!traveler) return; const form = new FormData(event.currentTarget);
    const observations = Object.fromEntries(rows(form.get("observations")).map(([key, ...rest]) => [key, rest.join(" | ")]));
    await act(`/v1/fabrication-travelers/${traveler.id}/events`, {
      expectedTravelerVersion: traveler.version, operationKey: String(form.get("operationKey")), eventType: String(form.get("eventType")),
      result: String(form.get("result")), quantity: String(form.get("quantity")), unitCode: String(form.get("unitCode")),
      observations, evidenceFileIds: split(form.get("evidenceFileIds")), performedAt: String(form.get("performedAt")),
    }, "Append-only traveler event recorded with exact operation, actor, time, evidence, quantity, and result.");
  }

  return <section className="panel operational-workspace fabrication-workspace" aria-labelledby="fabrication-heading">
    <div className="workflow-heading"><div><p className="section-label">Governed shop execution</p><h2 id="fabrication-heading">Fabrication & spool generation — {projectNumber}</h2><p>Revision-controlled assemblies, exact material and weld lineage, independent shop release, sequenced travelers, hold points, rework evidence, and quality acceptance.</p></div><button className="secondary-button" type="button" onClick={() => void refresh()} disabled={working}>Refresh workspace</button></div>
    <div className="estimate-summary" aria-label="Fabrication summary">
      <article><span>Assembly revisions</span><strong>{metrics.revisions}</strong><small>Immutable revision lineage</small></article>
      <article><span>Released to shop</span><strong>{metrics.released}</strong><small>Independent release</small></article>
      <article><span>Active travelers</span><strong>{metrics.active}</strong><small>Issued · work · hold</small></article>
      <article><span>Quality accepted</span><strong>{metrics.accepted}</strong><small>Distinct from completion</small></article>
    </div>
    <div className="workflow-grid">
      <article className="workflow-card">
        <div className="panel-heading"><div><p className="section-label">Revision register</p><h3>Assemblies & spools</h3></div><span className="policy-chip">Exact source</span></div>
        <div className="estimate-list">{snapshot.assemblies.map((item) => <button key={item.id} type="button" className={item.id === selectedAssemblyId ? "estimate-row is-selected" : "estimate-row"} onClick={() => setSelectedAssemblyId(item.id)}><span><strong>{item.number} · revision {item.revision}</strong><small>{display(item.assemblyType)} · {item.workPackageCode}</small></span><span><b>{display(item.state)}</b><small>v{item.version}</small></span></button>)}</div>
        {snapshot.assemblies.length === 0 ? <div className="empty-state"><strong>No controlled assembly revisions</strong><p>Create the first spool or fabrication assembly from exact released project records.</p></div> : null}
        <details><summary>Create assembly revision</summary><form className="compact-form form-columns" onSubmit={(event) => void createAssembly(event)}>
          <label>Assembly / spool number<input name="number" required /></label><label>Revision<input name="revision" required /></label>
          <label>Assembly type<select name="assemblyType"><option value="pipe_spool">Pipe spool</option><option value="structural_assembly">Structural assembly</option><option value="equipment_skid">Equipment skid</option><option value="module">Module</option></select></label>
          <label>Parent revision ID<input name="parentRevisionId" /></label><label className="form-span">Revision reason<textarea name="revisionReason" required /></label>
          <label>Source<select name="sourceSystem"><option value="manual">Controlled manual definition</option><option value="model_import">Model import</option></select></label><label>Source version<input name="sourceVersion" /></label>
          <label className="form-span">Source SHA-256 (model import)<input name="sourceSha256" minLength={64} maxLength={64} /></label>
          <label>System code<input name="systemCode" required /></label><label>Area code<input name="areaCode" required /></label><label>Work package code<input name="workPackageCode" required /></label><label>Completion boundary ID<input name="completionBoundaryId" required /></label>
          <label>Released drawing revision IDs<textarea name="drawingRevisionIds" required /></label><label>Material item IDs<textarea name="materialItemIds" required /></label><label>Weld IDs<textarea name="weldIds" /></label><label>Required inspection IDs<textarea name="requiredInspectionIds" /></label>
          <label className="form-span">BOM lines — line | material ID | description | quantity | unit | piece mark<textarea name="bomLines" placeholder="BOM-001 | material-id | NPS 4 pipe | 10 | FT | P-100" required /></label>
          <label className="form-span">Cut list — line | BOM line | material ID | length | unit | angle | bevel | quantity<textarea name="cutLines" placeholder="CUT-001 | BOM-001 | material-id | 120 | IN | 0 | BW-V | 1" /></label>
          <button className="primary-button" disabled={working}>Create controlled revision</button>
        </form></details>
      </article>

      <article className="workflow-card">
        <div className="panel-heading"><div><p className="section-label">Controlled disposition</p><h3>{selected ? `${selected.number} · revision ${selected.revision}` : "Select an assembly"}</h3></div>{selected ? <span className={`state-badge state-${selected.state}`}>{display(selected.state)}</span> : null}</div>
        {selected ? <>
          <dl className="compact-list"><div><dt>Drawings</dt><dd>{selected.drawingRevisionIds.length}</dd></div><div><dt>Materials / welds</dt><dd>{selected.materialItemIds.length} / {selected.weldIds.length}</dd></div><div><dt>BOM / cuts</dt><dd>{selected.bomLines.length} / {selected.cutLines.length}</dd></div><div><dt>Boundary</dt><dd>{selected.completionBoundaryId}</dd></div></dl>
          <p className="record-note">{selected.revisionReason}<small>{selected.sourceSystem}{selected.sourceVersion ? ` · ${selected.sourceVersion}` : ""}</small></p>
          <div className="lifecycle-actions">
            {selected.state === "draft" ? <button type="button" onClick={() => void act(`/v1/fabrication-assemblies/${selected.id}/submit`, { expectedVersion: selected.version }, "Assembly revision submitted for independent engineering review.")}>Submit revision</button> : null}
            {selected.state === "under_review" ? <button type="button" onClick={() => void act(`/v1/fabrication-assemblies/${selected.id}/review`, { expectedVersion: selected.version, decision: "approve", reason: "Exact drawing, material, weld, BOM, cut-list, and boundary lineage independently verified." }, "Assembly revision independently approved.")}>Approve revision</button> : null}
            {selected.state === "approved" && traveler ? <button type="button" onClick={() => void act(`/v1/fabrication-assemblies/${selected.id}/release`, { expectedAssemblyVersion: selected.version, expectedTravelerVersion: traveler.version, reason: "Released inputs and independently approved traveler scope verified at the shop gate." }, "Assembly and traveler independently released to fabrication.")}>Release to shop</button> : null}
            {selected.state === "fabrication_complete" ? <button type="button" onClick={() => void act(`/v1/fabrication-assemblies/${selected.id}/accept`, { expectedVersion: selected.version, reason: "Completed traveler, accepted inspections, released welds, and closed dispositions independently verified." }, "Fabrication assembly independently quality accepted.")}>Quality accept</button> : null}
          </div>
          <div className="readiness-stack"><div><strong>Shop release readiness</strong><p>{release?.blockers.length ? release.blockers.map(display).join(" · ") : "Prerequisites satisfied or release already recorded."}</p></div><div><strong>Quality acceptance readiness</strong><p>{acceptance?.blockers.length ? acceptance.blockers.map(display).join(" · ") : "Prerequisites satisfied or acceptance already recorded."}</p></div></div>
        </> : <p className="muted">Select an exact revision to review its source lineage and controlled actions.</p>}
      </article>

      <article className="workflow-card workflow-card-wide">
        <div className="panel-heading"><div><p className="section-label">Shop traveler</p><h3>{traveler ? `${traveler.number} · revision ${traveler.revision}` : "Sequenced fabrication traveler"}</h3></div>{traveler ? <span className={`state-badge state-${traveler.state}`}>{display(traveler.state)}</span> : null}</div>
        {traveler ? <div className="traveler-grid">{traveler.operations.map((operation) => { const operationEvents = events.filter((item) => item.operationKey === operation.operationKey); return <article key={operation.operationKey}><span className="operation-sequence">{operation.sequence}</span><div><strong>{operation.operationKey} · {display(operation.operationType)}</strong><small>{operation.workCenterCode} · {operation.plannedHours} h{operation.holdPoint ? " · HOLD POINT" : ""}</small><p>{operation.instructions}</p></div><ol>{operationEvents.map((item) => <li key={item.id}><b>{display(item.eventType)}</b> · {item.result} · {item.performedBy}</li>)}</ol></article>; })}</div> : null}
        {selected?.state === "approved" && !traveler ? <details open><summary>Create revision-controlled traveler</summary><form className="compact-form form-columns" onSubmit={(event) => void createTraveler(event)}><label>Traveler number<input name="number" required /></label><label>Revision<input name="revision" required /></label><label className="form-span">Operations — key | sequence | type | work center | hold | qualifications | procedure revision | materials | welds | hours | instructions<textarea name="operations" placeholder="CUT | 10 | cut | SAW-01 | no | FABRICATOR | procedure-revision-id | material-id | | 1.5 | Cut and preserve heat identity" required /></label><button className="primary-button" disabled={working}>Create traveler</button></form></details> : null}
        {traveler && ["issued", "in_progress", "on_hold"].includes(traveler.state) ? <details open><summary>Append operation event</summary><form className="compact-form form-columns" onSubmit={(event) => void recordEvent(event)}><label>Operation<select name="operationKey" required>{traveler.operations.map((item) => <option key={item.operationKey} value={item.operationKey}>{item.sequence} · {item.operationKey}</option>)}</select></label><label>Event<select name="eventType"><option value="start">Start</option><option value="complete">Complete</option><option value="hold">Place on hold</option><option value="release_hold">Release hold</option><option value="rework">Rework</option><option value="scrap">Scrap</option></select></label><label>Result<select name="result"><option value="observed">Observed</option><option value="pass">Pass</option><option value="fail">Fail</option></select></label><label>Performed at<input name="performedAt" type="datetime-local" required /></label><label>Quantity<input name="quantity" defaultValue="1" required /></label><label>Unit code<input name="unitCode" defaultValue="EA" required /></label><label className="form-span">Observations — key | value<textarea name="observations" placeholder="STATUS | operation complete" required /></label><label className="form-span">Released evidence file IDs<textarea name="evidenceFileIds" /></label><button className="primary-button" disabled={working}>Append immutable event</button></form></details> : null}
      </article>
    </div>
  </section>;
}
