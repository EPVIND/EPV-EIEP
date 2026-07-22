import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
type Notify = (tone: "success" | "error", text: string) => void;

interface MachineProfile {
  readonly id: string; readonly workCenterCode: string; readonly revision: string; readonly revisionReason: string;
  readonly processTypes: readonly string[]; readonly stockFormCodes: readonly string[]; readonly supportedOperationTypes: readonly string[];
  readonly supportedFeatureCodes: readonly string[]; readonly unitCode: string; readonly coordinateSystemCode: string;
  readonly maximumLength: string; readonly maximumWidth: string; readonly maximumThickness: string;
  readonly postprocessorName: string; readonly postprocessorVersion: string; readonly state: string; readonly version: number;
}
interface Finding { readonly code: string; readonly severity: "error" | "warning"; readonly operationKey: string | null; readonly detail: string; }
interface Operation { readonly operationKey: string; readonly sequence: number; readonly operationType: string; readonly featureCode: string; readonly instruction: string; }
interface Program {
  readonly id: string; readonly number: string; readonly revision: string; readonly revisionReason: string; readonly processType: string;
  readonly sourceFormat: string; readonly sourceVersion: string; readonly sourceSha256: string; readonly sourceFileId: string;
  readonly sourceDocumentRevisionId: string; readonly assemblyRevisionId: string; readonly travelerId: string;
  readonly travelerOperationKey: string; readonly machineProfileRevisionId: string; readonly materialItemId: string;
  readonly pieceMark: string; readonly quantity: string; readonly coordinateSystemCode: string; readonly operations: readonly Operation[];
  readonly validationFindings: readonly Finding[]; readonly normalizedPackageSha256: string; readonly releasedArtifactSha256: string | null;
  readonly state: string; readonly version: number; readonly createdBy: string; readonly submittedBy: string | null;
  readonly reviewedBy: string | null; readonly releasedBy: string | null;
}
interface Execution {
  readonly id: string; readonly programRevisionId: string; readonly releasedArtifactSha256: string; readonly workCenterCode: string;
  readonly machineIdentifier: string; readonly operatorUserId: string; readonly actualQuantity: string; readonly scrapQuantity: string;
  readonly producedMaterialItemIds: readonly string[]; readonly remnantMaterialItemIds: readonly string[];
  readonly evidenceFileIds: readonly string[]; readonly exceptionNcrIds: readonly string[]; readonly result: string;
  readonly state: string; readonly version: number;
}
interface Snapshot { readonly machineProfiles: readonly MachineProfile[]; readonly programs: readonly Program[]; readonly executions: readonly Execution[]; }
interface Artifact { readonly filename: string; readonly mediaType: string; readonly sha256: string; readonly content: string; }
interface Props { readonly projectId: string; readonly projectNumber: string; readonly request: Request; readonly working: boolean; readonly setWorking: (working: boolean) => void; readonly notify: Notify; }

const emptySnapshot: Snapshot = { machineProfiles: [], programs: [], executions: [] };
const split = (value: FormDataEntryValue | null) => String(value ?? "").split(/[\n,]+/u).map((item) => item.trim()).filter(Boolean);
const nullable = (value: FormDataEntryValue | null) => String(value ?? "").trim() || null;
const display = (value: string) => value.replaceAll("_", " ");
const errorText = (error: unknown) => error instanceof Error ? error.message : "The controlled CNC action failed.";
const rows = (value: FormDataEntryValue | null) => String(value ?? "").split(/\r?\n/u).map((row) => row.trim()).filter(Boolean)
  .map((row) => row.split("|").map((cell) => cell.trim()));

export function CncWorkspace({ projectId, projectNumber, request, working, setWorking, notify }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setWorking(true);
    try {
      const next = await request<Snapshot>(`/v1/projects/${projectId}/cnc`);
      setSnapshot(next);
      setSelectedProgramId((current) => current && next.programs.some((item) => item.id === current)
        ? current : next.programs[0]?.id ?? "");
    } catch (error) { notify("error", errorText(error)); }
    finally { if (!quiet) setWorking(false); }
  }, [notify, projectId, request, setWorking]);
  useEffect(() => { void refresh(); }, [refresh]);
  const selected = snapshot.programs.find((item) => item.id === selectedProgramId) ?? null;
  const selectedProfile = selected ? snapshot.machineProfiles.find((item) => item.id === selected.machineProfileRevisionId) ?? null : null;
  const execution = selected ? snapshot.executions.find((item) => item.programRevisionId === selected.id) ?? null : null;
  const metrics = useMemo(() => ({
    profiles: snapshot.machineProfiles.filter((item) => item.state === "approved").length,
    programs: snapshot.programs.length,
    released: snapshot.programs.filter((item) => ["released", "execution_recorded", "reconciled"].includes(item.state)).length,
    reconciled: snapshot.programs.filter((item) => item.state === "reconciled").length,
  }), [snapshot]);

  async function act(path: string, body: unknown, success: string) {
    setWorking(true);
    try { await request(path, { method: "POST", body: JSON.stringify(body) }); notify("success", success); await refresh(true); }
    catch (error) { notify("error", errorText(error)); }
    finally { setWorking(false); }
  }

  async function createProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await act(`/v1/projects/${projectId}/cnc-machine-profiles`, {
      workCenterCode: String(form.get("workCenterCode")), revision: String(form.get("revision")),
      parentRevisionId: nullable(form.get("parentRevisionId")), revisionReason: String(form.get("revisionReason")),
      processTypes: split(form.get("processTypes")), stockFormCodes: split(form.get("stockFormCodes")),
      supportedOperationTypes: split(form.get("supportedOperationTypes")), supportedFeatureCodes: split(form.get("supportedFeatureCodes")),
      unitCode: String(form.get("unitCode")), coordinateSystemCode: String(form.get("coordinateSystemCode")),
      maximumLength: String(form.get("maximumLength")), maximumWidth: String(form.get("maximumWidth")),
      maximumThickness: String(form.get("maximumThickness")), postprocessorName: String(form.get("postprocessorName")),
      postprocessorVersion: String(form.get("postprocessorVersion")), effectiveFrom: String(form.get("effectiveFrom")),
      effectiveTo: nullable(form.get("effectiveTo")),
    }, "Machine profile submitted for independent capability approval.");
  }

  async function createProgram(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const operations = rows(form.get("operations")).map(([operationKey, sequence, operationType, featureCode, x, y, z,
      length, width, depth, diameter, angleDegrees, toolCode, instruction]) => ({ operationKey, sequence: Number(sequence),
      operationType, featureCode, x, y, z, length, width, depth, diameter, angleDegrees, toolCode: toolCode || null, instruction }));
    await act(`/v1/projects/${projectId}/cnc-programs`, {
      number: String(form.get("number")), revision: String(form.get("revision")), parentRevisionId: nullable(form.get("parentRevisionId")),
      revisionReason: String(form.get("revisionReason")), processType: String(form.get("processType")),
      sourceFormat: String(form.get("sourceFormat")), sourceVersion: String(form.get("sourceVersion")),
      sourceSha256: String(form.get("sourceSha256")), sourceFileId: String(form.get("sourceFileId")),
      sourceDocumentRevisionId: String(form.get("sourceDocumentRevisionId")), assemblyRevisionId: String(form.get("assemblyRevisionId")),
      travelerId: String(form.get("travelerId")), travelerOperationKey: String(form.get("travelerOperationKey")),
      machineProfileRevisionId: String(form.get("machineProfileRevisionId")), materialItemId: String(form.get("materialItemId")),
      pieceMark: String(form.get("pieceMark")), quantity: String(form.get("quantity")), coordinateSystemCode: String(form.get("coordinateSystemCode")),
      stock: { formCode: String(form.get("stockFormCode")), unitCode: String(form.get("stockUnitCode")), length: String(form.get("stockLength")),
        width: String(form.get("stockWidth")), thickness: String(form.get("stockThickness")), diameter: nullable(form.get("stockDiameter")) },
      operations, warningDispositions: {},
    }, "Machine-neutral program package normalized, validated, and hashed.");
  }

  async function downloadArtifact() {
    if (!selected) return; setWorking(true);
    try {
      const artifact = await request<Artifact>(`/v1/cnc-programs/${selected.id}/artifact`);
      const url = URL.createObjectURL(new Blob([artifact.content], { type: artifact.mediaType }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = artifact.filename; anchor.click(); URL.revokeObjectURL(url);
      notify("success", `Exact released artifact downloaded and audited · ${artifact.sha256.slice(0, 16)}…`);
    } catch (error) { notify("error", errorText(error)); }
    finally { setWorking(false); }
  }

  async function recordExecution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected?.releasedArtifactSha256 || !selectedProfile) return; const form = new FormData(event.currentTarget);
    await act(`/v1/cnc-programs/${selected.id}/executions`, {
      expectedProgramVersion: selected.version, releasedArtifactSha256: selected.releasedArtifactSha256,
      workCenterCode: selectedProfile.workCenterCode, machineIdentifier: String(form.get("machineIdentifier")),
      startedAt: String(form.get("startedAt")), completedAt: String(form.get("completedAt")),
      actualQuantity: String(form.get("actualQuantity")), scrapQuantity: String(form.get("scrapQuantity")),
      producedMaterialItemIds: split(form.get("producedMaterialItemIds")), remnantMaterialItemIds: split(form.get("remnantMaterialItemIds")),
      evidenceFileIds: split(form.get("evidenceFileIds")), exceptionNcrIds: split(form.get("exceptionNcrIds")), result: String(form.get("result")),
    }, "Execution submitted with the exact release hash, evidence, quantities, and material genealogy.");
  }

  return <section className="panel operational-workspace fabrication-workspace" aria-labelledby="cnc-heading">
    <div className="workflow-heading"><div><p className="section-label">Governed machine-neutral handoff</p><h2 id="cnc-heading">CNC, waterjet & profiling — {projectNumber}</h2>
      <p>Exact source identity, approved machine profiles, deterministic validation, independent release, authorized download, execution genealogy, and reconciliation.</p></div>
      <button className="secondary-button" type="button" onClick={() => void refresh()} disabled={working}>Refresh workspace</button></div>
    <p className="alert"><strong>Control boundary:</strong> This workspace never starts, stops, configures, interlocks, or directly controls equipment.</p>
    <div className="estimate-summary" aria-label="CNC summary"><article><span>Approved profiles</span><strong>{metrics.profiles}</strong><small>Effective capability</small></article>
      <article><span>Program revisions</span><strong>{metrics.programs}</strong><small>Deterministic packages</small></article>
      <article><span>Released jobs</span><strong>{metrics.released}</strong><small>Exact artifact hashes</small></article>
      <article><span>Reconciled</span><strong>{metrics.reconciled}</strong><small>Independent closeout</small></article></div>
    <div className="workflow-grid">
      <article className="workflow-card"><div className="panel-heading"><div><p className="section-label">Capability authority</p><h3>Machine profiles</h3></div><span className="policy-chip">Effective revisions</span></div>
        <div className="estimate-list">{snapshot.machineProfiles.map((profile) => <article className="record-note" key={profile.id}><strong>{profile.workCenterCode} · r{profile.revision}</strong><small>{profile.processTypes.join(" · ")} · {profile.unitCode} · {display(profile.state)}</small>
          <p>{profile.postprocessorName} {profile.postprocessorVersion}</p>{profile.state === "under_review" ? <button type="button" onClick={() => void act(`/v1/cnc-machine-profiles/${profile.id}/review`, { expectedVersion: profile.version, decision: "approve", reason: "Capability envelope, units, coordinates, features, and postprocessor identity independently verified." }, "Machine profile independently approved.")}>Approve profile</button> : null}</article>)}</div>
        <details><summary>Create machine profile revision</summary><form className="compact-form form-columns" onSubmit={(event) => void createProfile(event)}>
          <label>Work center<input name="workCenterCode" required /></label><label>Revision<input name="revision" required /></label><label>Parent revision ID<input name="parentRevisionId" /></label><label>Effective from<input name="effectiveFrom" type="datetime-local" required /></label>
          <label className="form-span">Revision reason<textarea name="revisionReason" required /></label><label>Processes<input name="processTypes" placeholder="saw, waterjet" required /></label><label>Stock forms<input name="stockFormCodes" placeholder="PIPE, PLATE" required /></label>
          <label>Operations<input name="supportedOperationTypes" placeholder="cut, miter" required /></label><label>Feature codes<input name="supportedFeatureCodes" placeholder="STRAIGHT_CUT" required /></label><label>Units<input name="unitCode" defaultValue="IN" required /></label><label>Coordinates<input name="coordinateSystemCode" defaultValue="XYZ_RIGHT_HAND" required /></label>
          <label>Max length<input name="maximumLength" required /></label><label>Max width<input name="maximumWidth" defaultValue="0" required /></label><label>Max thickness<input name="maximumThickness" defaultValue="0" required /></label><label>Effective to<input name="effectiveTo" type="datetime-local" /></label>
          <label>Postprocessor name<input name="postprocessorName" required /></label><label>Postprocessor version<input name="postprocessorVersion" required /></label><button className="primary-button" disabled={working}>Submit controlled profile</button>
        </form></details>
      </article>

      <article className="workflow-card"><div className="panel-heading"><div><p className="section-label">Program register</p><h3>Machine-neutral revisions</h3></div><span className="policy-chip">No direct control</span></div>
        <div className="estimate-list">{snapshot.programs.map((program) => <button key={program.id} type="button" className={program.id === selectedProgramId ? "estimate-row is-selected" : "estimate-row"} onClick={() => setSelectedProgramId(program.id)}><span><strong>{program.number} · r{program.revision}</strong><small>{display(program.processType)} · {program.pieceMark}</small></span><span><b>{display(program.state)}</b><small>v{program.version}</small></span></button>)}</div>
        {snapshot.programs.length === 0 ? <div className="empty-state"><strong>No controlled program revisions</strong><p>Create a machine-neutral package from exact released source, fabrication, material, traveler, and profile records.</p></div> : null}
      </article>

      <article className="workflow-card workflow-card-wide"><div className="panel-heading"><div><p className="section-label">Controlled disposition</p><h3>{selected ? `${selected.number} · revision ${selected.revision}` : "Select a program"}</h3></div>{selected ? <span className={`state-badge state-${selected.state}`}>{display(selected.state)}</span> : null}</div>
        {selected ? <><dl className="compact-list"><div><dt>Source hash</dt><dd>{selected.sourceSha256.slice(0, 12)}…</dd></div><div><dt>Normalized hash</dt><dd>{selected.normalizedPackageSha256.slice(0, 12)}…</dd></div><div><dt>Piece / quantity</dt><dd>{selected.pieceMark} / {selected.quantity}</dd></div><div><dt>Findings</dt><dd>{selected.validationFindings.length}</dd></div></dl>
          <div className="lifecycle-actions">{selected.state === "validated" ? <button type="button" onClick={() => void act(`/v1/cnc-programs/${selected.id}/submit`, { expectedVersion: selected.version }, "Program submitted for independent technical approval.")}>Submit for approval</button> : null}
            {selected.state === "under_review" ? <button type="button" onClick={() => void act(`/v1/cnc-programs/${selected.id}/review`, { expectedVersion: selected.version, decision: "approve", reason: "Source, geometry, operations, material, traveler, profile, and deterministic hash independently verified." }, "Program independently technically approved.")}>Approve program</button> : null}
            {selected.state === "approved" ? <button type="button" onClick={() => void act(`/v1/cnc-programs/${selected.id}/release`, { expectedVersion: selected.version, reason: "Exact approved package released for authorized operator download; no direct machine control." }, "Exact machine-neutral job independently released.")}>Release job</button> : null}
            {["released", "execution_recorded", "reconciled"].includes(selected.state) ? <button type="button" onClick={() => void downloadArtifact()}>Download exact artifact</button> : null}</div>
          {selected.validationFindings.length ? <ul className="control-list">{selected.validationFindings.map((finding) => <li key={`${finding.code}:${finding.operationKey ?? "package"}`}><div><strong>{finding.severity.toUpperCase()} · {display(finding.code)}</strong><small>{finding.detail}</small></div></li>)}</ul> : <p className="truth-notice"><strong>Validation:</strong> No current findings in the deterministic package.</p>}
          {execution ? <div className="record-note"><strong>Execution · {execution.machineIdentifier}</strong><small>{execution.operatorUserId} · {execution.actualQuantity} actual · {execution.scrapQuantity} scrap · {display(execution.state)}</small><p>Release hash {execution.releasedArtifactSha256.slice(0, 16)}… · produced {execution.producedMaterialItemIds.length} · remnants {execution.remnantMaterialItemIds.length}</p>
            {execution.state === "submitted" ? <button type="button" onClick={() => void act(`/v1/cnc-executions/${execution.id}/reconcile`, { expectedExecutionVersion: execution.version, expectedProgramVersion: selected.version, decision: "accept", reason: "Exact release hash, work center, operator qualification, quantities, evidence, exceptions, and material genealogy independently reconciled." }, "CNC execution independently accepted and reconciled.")}>Accept reconciliation</button> : null}</div> : null}
        </> : <p className="muted">Select an exact revision to review validation, authority, release identity, and execution evidence.</p>}
      </article>

      <article className="workflow-card workflow-card-wide"><details open={snapshot.programs.length === 0}><summary>Create deterministic program revision</summary><form className="compact-form form-columns" onSubmit={(event) => void createProgram(event)}>
        <label>Program number<input name="number" required /></label><label>Revision<input name="revision" required /></label><label>Parent revision ID<input name="parentRevisionId" /></label><label>Process<select name="processType"><option value="saw">Saw</option><option value="drill">Drill</option><option value="plasma">Plasma</option><option value="oxy_fuel">Oxy-fuel</option><option value="waterjet">Waterjet</option><option value="laser">Laser</option><option value="cope">Cope</option><option value="profiling">Profiling</option></select></label>
        <label className="form-span">Revision reason<textarea name="revisionReason" required /></label><label>Source format<select name="sourceFormat"><option value="machine_neutral_json">Machine-neutral JSON</option><option value="dstv_nc1">DSTV / NC1</option><option value="dxf">DXF</option><option value="step">STEP</option><option value="ifc">IFC</option><option value="tekla">Tekla</option><option value="sds2">SDS2</option><option value="advance_steel">Advance Steel</option></select></label><label>Source version<input name="sourceVersion" required /></label>
        <label className="form-span">Source SHA-256<input name="sourceSha256" minLength={64} maxLength={64} required /></label><label>Released source file ID<input name="sourceFileId" required /></label><label>Released document revision ID<input name="sourceDocumentRevisionId" required /></label><label>Fabrication assembly revision ID<input name="assemblyRevisionId" required /></label><label>Traveler ID<input name="travelerId" required /></label><label>Traveler operation key<input name="travelerOperationKey" required /></label>
        <label>Approved machine profile<select name="machineProfileRevisionId" required><option value="">Select exact revision</option>{snapshot.machineProfiles.filter((item) => item.state === "approved").map((item) => <option key={item.id} value={item.id}>{item.workCenterCode} · r{item.revision}</option>)}</select></label><label>Material item ID<input name="materialItemId" required /></label><label>Piece mark<input name="pieceMark" required /></label><label>Quantity<input name="quantity" required /></label>
        <label>Stock form<input name="stockFormCode" required /></label><label>Stock unit<input name="stockUnitCode" defaultValue="IN" required /></label><label>Length<input name="stockLength" required /></label><label>Width<input name="stockWidth" defaultValue="0" required /></label><label>Thickness<input name="stockThickness" defaultValue="0" required /></label><label>Diameter<input name="stockDiameter" /></label><label>Coordinate system<input name="coordinateSystemCode" defaultValue="XYZ_RIGHT_HAND" required /></label>
        <label className="form-span">Operations — key | sequence | type | feature | x | y | z | length | width | depth | diameter | angle | tool | instruction<textarea name="operations" placeholder="CUT-10 | 10 | cut | STRAIGHT_CUT | 0 | 0 | 0 | 120 | 4.5 | .237 | 4.5 | 0 | | Cut and preserve heat identity" required /></label><button className="primary-button" disabled={working}>Normalize & validate package</button>
      </form></details></article>

      {selected?.state === "released" && !execution ? <article className="workflow-card workflow-card-wide"><details open><summary>Record execution from exact released artifact</summary><form className="compact-form form-columns" onSubmit={(event) => void recordExecution(event)}>
        <label>Machine identifier<input name="machineIdentifier" required /></label><label>Result<select name="result"><option value="complete">Complete</option><option value="complete_with_exception">Complete with exception</option><option value="aborted">Aborted</option></select></label><label>Started at<input name="startedAt" type="datetime-local" required /></label><label>Completed at<input name="completedAt" type="datetime-local" required /></label><label>Actual quantity<input name="actualQuantity" required /></label><label>Scrap quantity<input name="scrapQuantity" defaultValue="0" required /></label>
        <label>Produced material IDs<textarea name="producedMaterialItemIds" /></label><label>Remnant material IDs<textarea name="remnantMaterialItemIds" /></label><label>Released evidence file IDs<textarea name="evidenceFileIds" required /></label><label>Exception NCR IDs<textarea name="exceptionNcrIds" /></label><button className="primary-button" disabled={working}>Submit execution evidence</button>
      </form></details></article> : null}
    </div>
  </section>;
}
