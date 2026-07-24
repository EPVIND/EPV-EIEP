import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { WeldingProcedureBuilder } from "./WeldingProcedureBuilder.js";
import type { WorkTarget } from "./work-target.js";

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
type Notify = (tone: "success" | "error", text: string) => void;
export type ExecutionView = "welding" | "nde" | "testing";

interface Procedure { readonly id: string; readonly procedureType: string; readonly number: string; readonly revision: string; readonly processCodes: readonly string[]; readonly materialGroupCodes: readonly string[]; readonly state: string; readonly version: number; }
interface Qualification { readonly id: string; readonly welderUserId: string; readonly qualificationNumber: string; readonly processCodes: readonly string[]; readonly validTo: string; readonly state: string; readonly version: number; }
interface WeldEvent { readonly id: string; readonly eventType: string; readonly repairCycle: number; readonly performedBy: string; readonly result: string; }
interface Weld { readonly id: string; readonly number: string; readonly systemCode: string; readonly workPackageCode: string; readonly weldMapLocation: string; readonly wpsRevisionId: string; readonly processCode?: string; readonly materialGroupCode?: string; readonly requiredExaminationMethods: readonly string[]; readonly pwhtRequired: boolean; readonly repairCycle: number; readonly events: readonly WeldEvent[]; readonly state: string; readonly version: number; }
interface NdeRequest { readonly id: string; readonly number: string; readonly weldId: string; readonly repairCycle: number; readonly methodCode: string; readonly reportRevisionIds: readonly string[]; readonly state: string; readonly version: number; }
interface NdeReport { readonly id: string; readonly requestId: string; readonly revision: string; readonly examinerUserId: string; readonly result: string; readonly state: string; readonly version: number; }
interface PwhtCycle { readonly id: string; readonly number: string; readonly weldIds: readonly string[]; readonly result: string; readonly interruptions: readonly string[]; readonly state: string; readonly version: number; }
interface TestPackage { readonly id: string; readonly number: string; readonly testType: string; readonly completionBoundaryId: string; readonly targetPressure: string | null; readonly result: string | null; readonly deficiencyNcrIds: readonly string[]; readonly state: string; readonly version: number; }
interface Snapshot { readonly procedures: readonly Procedure[]; readonly welderQualifications: readonly Qualification[]; readonly welds: readonly Weld[]; readonly ndeRequests: readonly NdeRequest[]; readonly ndeReports: readonly NdeReport[]; readonly pwhtCycles: readonly PwhtCycle[]; readonly testPackages: readonly TestPackage[]; readonly weldReadiness: readonly { readonly weldId: string; readonly blockers: readonly string[] }[]; }
interface Props { readonly projectId: string; readonly projectNumber: string; readonly initialView: ExecutionView; readonly workTarget: WorkTarget | null; readonly request: Request; readonly working: boolean; readonly setWorking: (working: boolean) => void; readonly notify: Notify; }

const emptySnapshot: Snapshot = { procedures: [], welderQualifications: [], welds: [], ndeRequests: [], ndeReports: [], pwhtCycles: [], testPackages: [], weldReadiness: [] };
const views: readonly { readonly key: ExecutionView; readonly number: string; readonly label: string; readonly description: string }[] = [
  { key: "welding", number: "01", label: "Welding", description: "WPS · WPQ · weld history" },
  { key: "nde", number: "02", label: "NDE & PWHT", description: "Request · report · heat cycle" },
  { key: "testing", number: "03", label: "Testing", description: "Boundary · readiness · result" },
];
const split = (value: FormDataEntryValue | null) => String(value ?? "").split(/[\n,]+/u).map((item) => item.trim()).filter(Boolean);
const nullable = (value: FormDataEntryValue | null) => String(value ?? "").trim() || null;
const dateAfter = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const errorText = (error: unknown) => error instanceof Error ? error.message : "The controlled action failed.";
const display = (value: string) => value.replaceAll("_", " ");
type FieldRole = "fitter" | "welder" | "qc_inspector" | "nde_examiner" | "quality_authority";
const fieldRoles: readonly { readonly value: FieldRole; readonly label: string; readonly purpose: string; readonly eventTypes: readonly string[] }[] = [
  { value: "fitter", label: "Fitter / joint preparer", purpose: "Fit-up identity, geometry, cleanliness, and acceptance evidence", eventTypes: ["fit_up"] },
  { value: "welder", label: "Welder", purpose: "Consumable, preheat, pass, and repair execution against an active qualification", eventTypes: ["consumable_issue", "preheat_observation", "weld_pass", "repair_weld"] },
  { value: "qc_inspector", label: "QC inspector", purpose: "Independent visual result and repair-excavation evidence", eventTypes: ["visual_examination", "repair_excavation"] },
  { value: "nde_examiner", label: "NDE examiner", purpose: "Current repair-cycle request, technique, qualification, media, and report context", eventTypes: [] },
  { value: "quality_authority", label: "Quality authority", purpose: "Explainable release readiness and independent release decision", eventTypes: [] },
];
const defaultFieldRole = fieldRoles[0]!;
const fieldEventLabels: Readonly<Record<string, string>> = {
  fit_up: "Fit-up verification", consumable_issue: "Consumable issue", preheat_observation: "Preheat observation",
  weld_pass: "Weld pass", visual_examination: "Visual examination", repair_excavation: "Repair excavation", repair_weld: "Repair weld",
};
const nowForInput = () => new Date().toISOString().slice(0, 16);

export function ExecutionDisciplinesWorkspace({ projectId, projectNumber, initialView, workTarget, request, working, setWorking, notify }: Props) {
  const [view, setView] = useState<ExecutionView>(initialView);
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [fieldRole, setFieldRole] = useState<FieldRole>("fitter");
  const [objectQuery, setObjectQuery] = useState("");
  const [selectedWeldId, setSelectedWeldId] = useState("");
  useEffect(() => setView(initialView), [initialView]);
  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setWorking(true);
    try { setSnapshot(await request<Snapshot>(`/v1/projects/${projectId}/execution-disciplines`)); }
    catch (error) { notify("error", errorText(error)); }
    finally { if (!quiet) setWorking(false); }
  }, [notify, projectId, request, setWorking]);
  useEffect(() => { void refresh(); }, [refresh]);
  const approvedProcedures = useMemo(() => snapshot.procedures.filter((item) => item.state === "approved"), [snapshot.procedures]);
  const activeQualifications = useMemo(() => snapshot.welderQualifications.filter((item) => item.state === "active"), [snapshot.welderQualifications]);
  const filteredWelds = useMemo(() => {
    const query = objectQuery.trim().toLocaleLowerCase();
    return query ? snapshot.welds.filter((item) => [item.id, item.number, item.systemCode, item.workPackageCode, item.weldMapLocation]
      .some((candidate) => candidate.toLocaleLowerCase().includes(query))) : snapshot.welds;
  }, [objectQuery, snapshot.welds]);
  const selectedWeld = snapshot.welds.find((item) => item.id === selectedWeldId) ?? filteredWelds[0] ?? null;
  const selectedReadiness = selectedWeld ? snapshot.weldReadiness.find((item) => item.weldId === selectedWeld.id) ?? null : null;
  const selectedProcedure = selectedWeld ? snapshot.procedures.find((item) => item.id === selectedWeld.wpsRevisionId) ?? null : null;
  const selectedNdeRequests = selectedWeld ? snapshot.ndeRequests.filter((item) => item.weldId === selectedWeld.id && item.repairCycle === selectedWeld.repairCycle) : [];
  const selectedPwhtCycles = selectedWeld ? snapshot.pwhtCycles.filter((item) => item.weldIds.includes(selectedWeld.id)) : [];
  const activeFieldRole = fieldRoles.find((item) => item.value === fieldRole) ?? defaultFieldRole;
  useEffect(() => {
    if (selectedWeldId && snapshot.welds.some((item) => item.id === selectedWeldId)) return;
    setSelectedWeldId(snapshot.welds[0]?.id ?? "");
  }, [selectedWeldId, snapshot.welds]);
  useEffect(() => {
    if (!workTarget) return;
    if (workTarget.recordType === "weld_joint") {
      setView("welding"); setObjectQuery(workTarget.recordId); setSelectedWeldId(workTarget.recordId); return;
    }
    if (workTarget.recordType === "nde_request" || workTarget.recordType === "nde_report") {
      setView("nde");
      const report = snapshot.ndeReports.find((item) => item.id === workTarget.recordId);
      const ndeRequest = snapshot.ndeRequests.find((item) => item.id === (report?.requestId ?? workTarget.recordId));
      if (ndeRequest) setSelectedWeldId(ndeRequest.weldId);
      return;
    }
    if (workTarget.recordType === "pwht_cycle") {
      setView("nde");
      const cycle = snapshot.pwhtCycles.find((item) => item.id === workTarget.recordId);
      if (cycle?.weldIds[0]) setSelectedWeldId(cycle.weldIds[0]);
      return;
    }
    if (workTarget.recordType === "test_package") setView("testing");
  }, [snapshot.ndeReports, snapshot.ndeRequests, snapshot.pwhtCycles, workTarget]);
  async function act(path: string, body: unknown, success: string) {
    setWorking(true);
    try { await request(path, { method: "POST", body: JSON.stringify(body) }); notify("success", success); await refresh(true); }
    catch (error) { notify("error", errorText(error)); }
    finally { setWorking(false); }
  }
  async function submitProcedure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await act(`/v1/projects/${projectId}/welding-procedures`, {
      procedureType: String(form.get("procedureType")), number: String(form.get("number")), revision: String(form.get("revision")),
      governingDocumentRevisionId: String(form.get("governingDocumentRevisionId")), supportingPqrIds: split(form.get("supportingPqrIds")),
      processCodes: split(form.get("processCodes")), materialGroupCodes: split(form.get("materialGroupCodes")), positionCodes: split(form.get("positionCodes")),
      thicknessMinimum: String(form.get("thicknessMinimum")), thicknessMaximum: String(form.get("thicknessMaximum")),
      diameterMinimum: String(form.get("diameterMinimum")), diameterMaximum: String(form.get("diameterMaximum")), jointDesignCodes: split(form.get("jointDesignCodes")),
      consumableClassifications: split(form.get("consumables")), preheatMinimum: String(form.get("preheatMinimum")), interpassMaximum: String(form.get("interpassMaximum")),
      effectiveFrom: String(form.get("effectiveFrom")), effectiveTo: nullable(form.get("effectiveTo")), supersedesRevisionId: nullable(form.get("supersedesRevisionId")),
    }, "Procedure revision submitted for independent welding-authority review.");
  }
  async function submitQualification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await act(`/v1/projects/${projectId}/welder-qualifications`, {
      welderUserId: String(form.get("welderUserId")), employerOrganizationId: String(form.get("employerOrganizationId")),
      qualificationNumber: String(form.get("qualificationNumber")), governingDocumentRevisionId: String(form.get("governingDocumentRevisionId")),
      processCodes: split(form.get("processCodes")), materialGroupCodes: split(form.get("materialGroupCodes")), positionCodes: split(form.get("positionCodes")),
      thicknessMinimum: String(form.get("thicknessMinimum")), thicknessMaximum: String(form.get("thicknessMaximum")),
      diameterMinimum: String(form.get("diameterMinimum")), diameterMaximum: String(form.get("diameterMaximum")),
      qualifiedAt: String(form.get("qualifiedAt")), validTo: String(form.get("validTo")), continuityIntervalDays: Number(form.get("continuityIntervalDays")),
      lastContinuityAt: String(form.get("lastContinuityAt")), evidenceFileIds: split(form.get("evidenceFileIds")),
    }, "Welder qualification submitted with exact scope, validity, continuity, and evidence.");
  }
  async function createWeld(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await act(`/v1/projects/${projectId}/welds`, {
      number: String(form.get("number")), systemCode: String(form.get("systemCode")), areaCode: String(form.get("areaCode")),
      workPackageCode: String(form.get("workPackageCode")), componentReferences: split(form.get("componentReferences")), materialItemIds: split(form.get("materialItemIds")),
      drawingRevisionId: String(form.get("drawingRevisionId")), weldMapLocation: String(form.get("weldMapLocation")), wpsRevisionId: String(form.get("wpsRevisionId")),
      processCode: String(form.get("processCode")), materialGroupCode: String(form.get("materialGroupCode")), positionCode: String(form.get("positionCode")),
      thickness: String(form.get("thickness")), diameter: String(form.get("diameter")), jointDesignCode: String(form.get("jointDesignCode")),
      requiredExaminationMethods: split(form.get("requiredExaminationMethods")), pwhtRequired: form.get("pwhtRequired") === "on",
      completionBoundaryId: String(form.get("completionBoundaryId")),
    }, "Weld created against exact structure, material, drawing, WPS, and completion boundary identities.");
  }
  async function recordWeldEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const weld = snapshot.welds.find((item) => item.id === String(form.get("weldId"))); if (!weld) return;
    const observations = Object.fromEntries(split(form.get("observations")).map((row) => { const [key, ...rest] = row.split("="); return [key?.trim() ?? "", rest.join("=").trim()]; }).filter(([key, value]) => key && value));
    await act(`/v1/welds/${weld.id}/events`, { expectedVersion: weld.version, eventType: String(form.get("eventType")), performedAt: String(form.get("performedAt")),
      welderQualificationIds: split(form.get("welderQualificationIds")), consumableClassification: nullable(form.get("consumableClassification")),
      observations, evidenceFileIds: split(form.get("evidenceFileIds")), result: String(form.get("result")),
    }, "Append-only weld event recorded with actor, time, evidence, qualification, and repair-cycle context.");
  }
  async function recordFieldEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWeld) { notify("error", "Select an authorized weld object before recording field activity."); return; }
    const form = new FormData(event.currentTarget);
    const eventType = String(form.get("eventType"));
    if (!activeFieldRole.eventTypes.includes(eventType)) { notify("error", "The selected field role does not expose that workflow action."); return; }
    const observations = Object.fromEntries(split(form.get("observations")).map((row) => {
      const [key, ...rest] = row.split("="); return [key?.trim() ?? "", rest.join("=").trim()];
    }).filter(([key, entryValue]) => key && entryValue));
    await act(`/v1/welds/${selectedWeld.id}/events`, {
      expectedVersion: selectedWeld.version, eventType, performedAt: String(form.get("performedAt")),
      welderQualificationIds: split(form.get("welderQualificationIds")), consumableClassification: nullable(form.get("consumableClassification")),
      observations, evidenceFileIds: split(form.get("evidenceFileIds")), result: String(form.get("result")),
    }, `${fieldEventLabels[eventType] ?? "Field event"} appended to ${selectedWeld.number} with current repair-cycle context.`);
  }
  async function createNdeRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await act(`/v1/projects/${projectId}/nde-requests`, { number: String(form.get("number")), weldId: String(form.get("weldId")), methodCode: String(form.get("methodCode")),
      extent: String(form.get("extent")), techniqueDocumentRevisionId: String(form.get("techniqueDocumentRevisionId")), acceptanceReference: String(form.get("acceptanceReference")),
      examinationStage: String(form.get("examinationStage")), requiredPersonnelQualification: String(form.get("requiredPersonnelQualification")),
      dueAt: String(form.get("dueAt")), holdWitnessContext: String(form.get("holdWitnessContext")),
    }, "NDE request created for the weld's current repair cycle.");
  }
  async function submitNdeReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await act(`/v1/nde-requests/${String(form.get("requestId"))}/reports`, { revision: String(form.get("revision")), examinerOrganizationId: String(form.get("examinerOrganizationId")),
      personnelQualificationReference: String(form.get("personnelQualificationReference")), equipmentIds: split(form.get("equipmentIds")), mediaFileIds: split(form.get("mediaFileIds")),
      performedAt: String(form.get("performedAt")), conditions: { EXAMINATION_CONDITION: String(form.get("conditions")) }, indications: split(form.get("indications")),
      result: String(form.get("result")), evidenceFileIds: split(form.get("evidenceFileIds")),
    }, "NDE report revision submitted with qualified examiner, valid equipment, media, and indications.");
  }
  async function submitPwht(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await act(`/v1/projects/${projectId}/pwht-cycles`, { number: String(form.get("number")), procedureDocumentRevisionId: String(form.get("procedureDocumentRevisionId")),
      weldIds: split(form.get("weldIds")), heatingRate: String(form.get("heatingRate")), coolingRate: String(form.get("coolingRate")),
      soakTemperatureMinimum: String(form.get("soakTemperatureMinimum")), soakTemperatureMaximum: String(form.get("soakTemperatureMaximum")),
      soakDurationMinutes: String(form.get("soakDurationMinutes")), thermocouples: [{ thermocoupleId: String(form.get("thermocoupleId")),
        location: String(form.get("thermocoupleLocation")), minimumTemperature: String(form.get("thermocoupleMinimum")), maximumTemperature: String(form.get("thermocoupleMaximum")),
        withinTolerance: form.get("withinTolerance") === "on" }], equipmentIds: split(form.get("equipmentIds")), chartFileId: String(form.get("chartFileId")),
      evidenceFileIds: split(form.get("evidenceFileIds")), interruptions: split(form.get("interruptions")), result: String(form.get("result")), performedAt: String(form.get("performedAt")),
    }, "PWHT cycle submitted with exact weld scope, chart, equipment, thermocouples, and interruptions.");
  }
  async function createTestPackage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await act(`/v1/projects/${projectId}/test-packages`, { number: String(form.get("number")), testType: String(form.get("testType")), completionBoundaryId: String(form.get("completionBoundaryId")),
      governingDocumentRevisionIds: split(form.get("governingDocumentRevisionIds")), drawingRevisionIds: split(form.get("drawingRevisionIds")), testMedium: String(form.get("testMedium")),
      targetPressure: nullable(form.get("targetPressure")), holdDurationMinutes: String(form.get("holdDurationMinutes")), hazardPermitReferences: split(form.get("hazardPermitReferences")),
      prerequisiteReferences: split(form.get("prerequisiteReferences")), blindValveInstrumentReferences: split(form.get("blindValveInstrumentReferences")), gaugeEquipmentIds: split(form.get("gaugeEquipmentIds")),
      participantUserIds: split(form.get("participantUserIds")), witnessUserIds: split(form.get("witnessUserIds")),
    }, "Controlled test package created against an exact completion boundary.");
  }
  async function submitTestResult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const item = snapshot.testPackages.find((record) => record.id === String(form.get("testPackageId"))); if (!item) return;
    await act(`/v1/test-packages/${item.id}/results`, { expectedVersion: item.version, performedAt: String(form.get("performedAt")), result: String(form.get("result")),
      evidenceFileIds: split(form.get("evidenceFileIds")), deficiencyNcrIds: split(form.get("deficiencyNcrIds")), restorationConfirmation: String(form.get("restorationConfirmation")),
    }, "Test result submitted; independent acceptance and deficiency closure remain required.");
  }

  return <section className="panel operational-workspace execution-workspace" aria-labelledby="execution-heading">
    <div className="workflow-heading"><div><p className="section-label">Connected execution disciplines</p><h2 id="execution-heading">Welding, NDE, PWHT & testing — {projectNumber}</h2><p>Exact controlled references, independent acceptance, immutable event history, and completion-boundary readiness.</p></div><button className="secondary-button" type="button" onClick={() => void refresh()} disabled={working}>Refresh workspace</button></div>
    <ol className="workflow-steps" aria-label="Execution discipline stages">{views.map((item) => <li key={item.key} className={view === item.key ? "is-active" : ""}><button type="button" onClick={() => setView(item.key)}><span>{item.number}</span><strong>{item.label}</strong><small>{item.description}</small></button></li>)}</ol>
    <div className="estimate-summary" aria-label="Execution discipline summary">
      <article><span>Welds</span><strong>{snapshot.welds.length}</strong><small>{snapshot.welds.filter((item) => item.state === "released").length} released</small></article>
      <article><span>NDE requests</span><strong>{snapshot.ndeRequests.length}</strong><small>{snapshot.ndeRequests.filter((item) => item.state === "accepted").length} accepted</small></article>
      <article><span>PWHT cycles</span><strong>{snapshot.pwhtCycles.length}</strong><small>{snapshot.pwhtCycles.filter((item) => item.state === "accepted").length} accepted</small></article>
      <article><span>Test packages</span><strong>{snapshot.testPackages.length}</strong><small>{snapshot.testPackages.filter((item) => item.state === "accepted").length} accepted</small></article>
    </div>

    {view === "welding" ? <section className="field-object-console" aria-labelledby="field-object-heading">
      <div className="field-object-heading"><div><p className="section-label">Object-first field execution</p><h3 id="field-object-heading">Find the object, then perform the authorized work</h3>
        <p>Scan or enter a weld number, map location, system, work package, or stable object ID. EIEP resolves the exact procedure, repair cycle, examinations, PWHT, blockers, and immutable history before exposing role-appropriate actions.</p></div><span className="policy-chip">Online authority enforced</span></div>
      <div className="field-object-layout">
        <aside className="field-object-finder" aria-label="Field object lookup">
          <label>Scan / enter object identity<input type="search" value={objectQuery} onChange={(event) => setObjectQuery(event.target.value)} placeholder="Weld, QR token, system, work package…" /></label>
          <div className="field-object-results" aria-live="polite">{filteredWelds.map((item) => <button key={item.id} type="button" className={selectedWeld?.id === item.id ? "is-selected" : ""} onClick={() => setSelectedWeldId(item.id)}>
            <span><strong>{item.number}</strong><small>{item.weldMapLocation}</small></span><span className={`state-badge state-${item.state}`}>{display(item.state)}</span></button>)}</div>
          {filteredWelds.length === 0 ? <p className="muted">No authorized weld object matches that identity.</p> : null}
        </aside>

        <article className="field-object-record" aria-label="Selected field object">
          {selectedWeld ? <><div className="field-object-title"><div><span className="record-type">Weld object</span><h4>{selectedWeld.number} · repair cycle {selectedWeld.repairCycle}</h4><p>{selectedWeld.systemCode} · {selectedWeld.workPackageCode} · {selectedWeld.weldMapLocation}</p></div><span className={`state-badge state-${selectedWeld.state}`}>{display(selectedWeld.state)}</span></div>
            <dl className="field-object-facts"><div><dt>Exact WPS</dt><dd>{selectedProcedure ? `${selectedProcedure.number} r${selectedProcedure.revision} · ${display(selectedProcedure.state)}` : selectedWeld.wpsRevisionId}</dd></div>
              <div><dt>Process / material</dt><dd>{selectedWeld.processCode ?? "From exact WPS"} · {selectedWeld.materialGroupCode ?? "From exact material link"}</dd></div>
              <div><dt>Required NDE</dt><dd>{selectedWeld.requiredExaminationMethods.join(", ") || "None configured"}</dd></div><div><dt>PWHT</dt><dd>{selectedWeld.pwhtRequired ? "Required" : "Not required by weld record"}</dd></div>
              <div><dt>Current-cycle NDE</dt><dd>{selectedNdeRequests.length ? selectedNdeRequests.map((item) => `${item.number} (${display(item.state)})`).join(" · ") : "No request"}</dd></div>
              <div><dt>PWHT cycles</dt><dd>{selectedPwhtCycles.length ? selectedPwhtCycles.map((item) => `${item.number} (${display(item.state)})`).join(" · ") : "No cycle"}</dd></div></dl>
            <div className={selectedReadiness?.blockers.length ? "field-readiness has-blockers" : "field-readiness is-ready"}><strong>{selectedReadiness?.blockers.length ? `${selectedReadiness.blockers.length} release blocker(s)` : "Release prerequisites complete"}</strong>
              {selectedReadiness?.blockers.length ? <ul>{selectedReadiness.blockers.map((item) => <li key={item}>{display(item)}</li>)}</ul> : <p>Current repair-cycle material, visual, NDE, PWHT, NCR, and evidence gates report complete.</p>}</div>
            <details open><summary>Immutable event timeline</summary>{selectedWeld.events.length ? <ol className="field-event-timeline">{selectedWeld.events.map((item) => <li key={item.id}><span>{item.repairCycle}</span><div><strong>{display(item.eventType)} — {item.result}</strong><small>{item.performedBy} · immutable event {item.id}</small></div></li>)}</ol> : <p className="muted">No field events have been recorded.</p>}</details>
          </> : <div className="empty-state"><strong>No weld selected</strong><p>Choose an authorized object from the lookup results.</p></div>}
        </article>

        <aside className="field-role-actions" aria-label="Role-based field actions">
          <label>Field role context<select aria-label="Field role context" value={fieldRole} onChange={(event) => setFieldRole(event.target.value as FieldRole)}>{fieldRoles.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <p>{activeFieldRole.purpose}</p><div className="review-boundary-note"><strong>Permission boundary</strong><p>This selector organizes the interface only. The authenticated assignment, qualification, assurance level, separation of duty, current version, and server-side permission still decide whether an action is accepted.</p></div>
          {selectedWeld && activeFieldRole.eventTypes.length ? <form className="compact-form field-action-form" onSubmit={(event) => void recordFieldEvent(event)}>
            <label>Authorized action<select name="eventType" required>{activeFieldRole.eventTypes.map((item) => <option key={item} value={item}>{fieldEventLabels[item]}</option>)}</select></label>
            <label>Performed at<input name="performedAt" type="datetime-local" defaultValue={nowForInput()} required /></label><label>Result<select name="result"><option value="observed">Observed</option><option value="pass">Pass</option><option value="fail">Fail</option></select></label>
            <label>Active qualification IDs<input name="welderQualificationIds" list="field-qualification-ids" placeholder="Required when applicable" /></label><datalist id="field-qualification-ids">{activeQualifications.map((item) => <option key={item.id} value={item.id}>{item.qualificationNumber}</option>)}</datalist>
            <label>Consumable classification<input name="consumableClassification" placeholder="Required for consumable/pass events" /></label><label>Observations<small className="dependency-note">KEY=value, one per line</small><textarea name="observations" rows={4} defaultValue="IDENTITY_CONFIRMED=true" required /></label>
            <label>Released evidence file IDs<input name="evidenceFileIds" placeholder="One or more immutable file IDs" required /></label><button className="primary-button" disabled={working}>Append controlled event</button>
          </form> : null}
          {selectedWeld && fieldRole === "nde_examiner" ? <button className="primary-button" type="button" onClick={() => setView("nde")}>Open current-cycle NDE workspace</button> : null}
          {selectedWeld && fieldRole === "quality_authority" ? <button className="primary-button" type="button" disabled={working || selectedWeld.state === "released" || Boolean(selectedReadiness?.blockers.length)} onClick={() => void act(`/v1/welds/${selectedWeld.id}/release`, { expectedVersion: selectedWeld.version, reason: "Object-first field review verified all current repair-cycle material, visual, NDE, PWHT, NCR, and evidence gates." }, `${selectedWeld.number} independently released.`)}>Independently release current weld</button> : null}
        </aside>
      </div>
    </section> : null}

    {view === "welding" ? <WeldingProcedureBuilder
      projectNumber={projectNumber}
      approvedPqrs={approvedProcedures.filter((item) => item.procedureType === "pqr").map((item) => ({ id: item.id, number: item.number, revision: item.revision }))}
      working={working}
      submit={(body) => act(`/v1/projects/${projectId}/welding-procedures`, body, "Complete welding procedure revision submitted for independent welding-authority review.")}
    /> : null}

    {view === "welding" ? <div className="workflow-grid">
      <article className="workflow-card"><h3>Procedure revisions</h3><div className="basis-list">{snapshot.procedures.map((item) => <article key={item.id}><div><strong>{item.procedureType.toUpperCase()} {item.number} · revision {item.revision}</strong><small>{item.processCodes.join(", ")} · {item.materialGroupCodes.join(", ")}</small></div><span className={`state-badge state-${item.state}`}>{display(item.state)}</span>{item.state === "under_review" ? <button className="primary-button" type="button" onClick={() => void act(`/v1/welding-procedures/${item.id}/review`, { expectedVersion: item.version, decision: "approve", reason: "Exact source, qualification ranges, and support records verified." }, "Procedure independently approved.")}>Approve procedure</button> : null}</article>)}</div>
        <details><summary>Submit PQR / WPS revision</summary><form className="compact-form form-columns" onSubmit={(event) => void submitProcedure(event)}><label>Procedure type<select name="procedureType"><option value="wps">WPS</option><option value="pqr">PQR</option></select></label><label>Procedure number<input name="number" required /></label><label>Revision<input name="revision" required /></label><label>Governing document revision ID<input name="governingDocumentRevisionId" required /></label><label>Supporting approved PQR IDs<input name="supportingPqrIds" /></label><label>Process codes<input name="processCodes" required /></label><label>Material group codes<input name="materialGroupCodes" required /></label><label>Position codes<input name="positionCodes" required /></label><label>Thickness minimum<input name="thicknessMinimum" inputMode="decimal" required /></label><label>Thickness maximum<input name="thicknessMaximum" inputMode="decimal" required /></label><label>Diameter minimum<input name="diameterMinimum" inputMode="decimal" required /></label><label>Diameter maximum<input name="diameterMaximum" inputMode="decimal" required /></label><label>Joint design codes<input name="jointDesignCodes" required /></label><label>Consumable classifications<input name="consumables" /></label><label>Preheat minimum<input name="preheatMinimum" inputMode="decimal" required /></label><label>Interpass maximum<input name="interpassMaximum" inputMode="decimal" required /></label><label>Effective from<input name="effectiveFrom" type="date" defaultValue={dateAfter(0)} required /></label><label>Effective to<input name="effectiveTo" type="date" /></label><label>Supersedes procedure revision ID<input name="supersedesRevisionId" /></label><button className="primary-button" disabled={working}>Submit procedure</button></form></details></article>
      <article className="workflow-card"><h3>Welder qualifications</h3><div className="basis-list">{snapshot.welderQualifications.map((item) => <article key={item.id}><div><strong>{item.qualificationNumber} · {item.welderUserId}</strong><small>{item.processCodes.join(", ")} · valid to {item.validTo.slice(0, 10)}</small></div><span className={`state-badge state-${item.state}`}>{display(item.state)}</span>{item.state === "under_review" ? <button className="primary-button" type="button" onClick={() => void act(`/v1/welder-qualifications/${item.id}/review`, { expectedVersion: item.version, decision: "approve", reason: "Scope, validity, and continuity independently verified." }, "Qualification independently activated.")}>Approve qualification</button> : null}</article>)}</div>
        <details><summary>Submit welder qualification</summary><form className="compact-form form-columns" onSubmit={(event) => void submitQualification(event)}><label>Welder user ID<input name="welderUserId" required /></label><label>Employer organization ID<input name="employerOrganizationId" required /></label><label>Qualification number<input name="qualificationNumber" required /></label><label>Governing document revision ID<input name="governingDocumentRevisionId" required /></label><label>Process codes<input name="processCodes" required /></label><label>Material group codes<input name="materialGroupCodes" required /></label><label>Position codes<input name="positionCodes" required /></label><label>Thickness minimum<input name="thicknessMinimum" required /></label><label>Thickness maximum<input name="thicknessMaximum" required /></label><label>Diameter minimum<input name="diameterMinimum" required /></label><label>Diameter maximum<input name="diameterMaximum" required /></label><label>Qualified at<input name="qualifiedAt" type="date" required /></label><label>Valid to<input name="validTo" type="date" required /></label><label>Continuity interval days<input name="continuityIntervalDays" type="number" defaultValue="180" required /></label><label>Last continuity at<input name="lastContinuityAt" type="date" required /></label><label>Released evidence file IDs<input name="evidenceFileIds" required /></label><button className="primary-button" disabled={working}>Submit qualification</button></form></details></article>
      <article className="workflow-card workflow-card-wide"><h3>Weld map & immutable event history</h3><div className="commitment-grid">{snapshot.welds.map((item) => { const readiness = snapshot.weldReadiness.find((entry) => entry.weldId === item.id); return <article key={item.id}><div><strong>{item.number} · {item.systemCode} · repair cycle {item.repairCycle}</strong><small>{item.weldMapLocation} · WPS {item.wpsRevisionId}</small></div><span className={`state-badge state-${item.state}`}>{display(item.state)}</span><p>{readiness?.blockers.length ? `Blockers: ${readiness.blockers.join(" · ")}` : "Release prerequisites complete"}</p><ol>{item.events.map((entry) => <li key={entry.id}><strong>{display(entry.eventType)}</strong> — {entry.result} · cycle {entry.repairCycle} · {entry.performedBy}</li>)}</ol>{readiness?.blockers.length === 0 && item.state !== "released" ? <button className="primary-button" type="button" onClick={() => void act(`/v1/welds/${item.id}/release`, { expectedVersion: item.version, reason: "All current repair-cycle, material, examination, PWHT, and NCR prerequisites verified." }, "Weld independently released.")}>Release weld</button> : null}</article>; })}</div>
        <details><summary>Create weld</summary><form className="compact-form form-columns" onSubmit={(event) => void createWeld(event)}><label>Weld number<input name="number" required /></label><label>System code<input name="systemCode" required /></label><label>Area code<input name="areaCode" required /></label><label>Work package code<input name="workPackageCode" required /></label><label>Component references<input name="componentReferences" required /></label><label>Material item IDs<input name="materialItemIds" required /></label><label>Drawing revision ID<input name="drawingRevisionId" required /></label><label>Weld map location<input name="weldMapLocation" required /></label><label>Approved WPS<select name="wpsRevisionId" required><option value="">Select…</option>{approvedProcedures.filter((item) => item.procedureType === "wps").map((item) => <option key={item.id} value={item.id}>{item.number} r{item.revision}</option>)}</select></label><label>Process code<input name="processCode" required /></label><label>Material group code<input name="materialGroupCode" required /></label><label>Position code<input name="positionCode" required /></label><label>Thickness<input name="thickness" required /></label><label>Diameter<input name="diameter" required /></label><label>Joint design code<input name="jointDesignCode" required /></label><label>Required examination methods<input name="requiredExaminationMethods" /></label><label>Completion boundary ID<input name="completionBoundaryId" required /></label><label className="check-row"><input name="pwhtRequired" type="checkbox" />PWHT required</label><button className="primary-button" disabled={working}>Create weld</button></form></details>
        <details><summary>Append weld execution / visual / repair event</summary><form className="compact-form form-columns" onSubmit={(event) => void recordWeldEvent(event)}><label>Weld<select name="weldId" required>{snapshot.welds.filter((item) => item.state !== "released").map((item) => <option key={item.id} value={item.id}>{item.number} · {display(item.state)}</option>)}</select></label><label>Event type<select name="eventType"><option value="fit_up">Fit-up</option><option value="consumable_issue">Consumable issue</option><option value="preheat_observation">Preheat observation</option><option value="weld_pass">Weld pass</option><option value="visual_examination">Visual examination</option><option value="repair_excavation">Repair excavation</option><option value="repair_weld">Repair weld</option></select></label><label>Performed at<input name="performedAt" type="datetime-local" required /></label><label>Result<select name="result"><option value="observed">Observed</option><option value="pass">Pass</option><option value="fail">Fail</option></select></label><label>Welder qualification IDs<input name="welderQualificationIds" list="qualification-ids" /></label><datalist id="qualification-ids">{activeQualifications.map((item) => <option key={item.id} value={item.id}>{item.qualificationNumber}</option>)}</datalist><label>Consumable classification<input name="consumableClassification" /></label><label className="form-span">Observations (KEY=value, one per line)<textarea name="observations" placeholder="TEMPERATURE=150" required /></label><label>Released evidence file IDs<input name="evidenceFileIds" required /></label><button className="primary-button" disabled={working}>Append event</button></form></details></article>
    </div> : null}

    {view === "nde" ? <div className="workflow-grid">
      <article className="workflow-card"><h3>NDE requests & reports</h3><div className="basis-list">{snapshot.ndeRequests.map((item) => <article key={item.id}><div><strong>{item.number} · {item.methodCode} · repair cycle {item.repairCycle}</strong><small>Weld {snapshot.welds.find((weld) => weld.id === item.weldId)?.number ?? item.weldId} · {item.reportRevisionIds.length} report revision(s)</small></div><span className={`state-badge state-${item.state}`}>{display(item.state)}</span></article>)}</div><div className="basis-list">{snapshot.ndeReports.map((item) => <article key={item.id}><div><strong>Report {item.revision} · {item.result}</strong><small>Examiner {item.examinerUserId}</small></div><span className={`state-badge state-${item.state}`}>{display(item.state)}</span>{item.state === "submitted" ? <button className="primary-button" type="button" onClick={() => void act(`/v1/nde-reports/${item.id}/review`, { expectedVersion: item.version, decision: "accept", reason: "Technique, personnel, equipment, media, indications, and result independently reviewed." }, "NDE report independently accepted; weld disposition updated from its reported result.")}>Accept report review</button> : null}</article>)}</div>
        <details><summary>Create repair-cycle NDE request</summary><form className="compact-form form-columns" onSubmit={(event) => void createNdeRequest(event)}><label>Request number<input name="number" required /></label><label>Weld<select name="weldId" required>{snapshot.welds.map((item) => <option key={item.id} value={item.id}>{item.number} · cycle {item.repairCycle}</option>)}</select></label><label>Method code<input name="methodCode" placeholder="RT, UT, MT, PT" required /></label><label>Extent<input name="extent" defaultValue="100%" required /></label><label>Technique document revision ID<input name="techniqueDocumentRevisionId" required /></label><label>Acceptance reference<input name="acceptanceReference" required /></label><label>Examination stage<input name="examinationStage" defaultValue="FINAL" required /></label><label>Required personnel qualification<input name="requiredPersonnelQualification" required /></label><label>Due at<input name="dueAt" type="date" defaultValue={dateAfter(1)} required /></label><label>Hold / witness context<input name="holdWitnessContext" required /></label><button className="primary-button" disabled={working}>Create NDE request</button></form></details>
        <details><summary>Submit NDE report revision</summary><form className="compact-form form-columns" onSubmit={(event) => void submitNdeReport(event)}><label>Open request<select name="requestId" required>{snapshot.ndeRequests.filter((item) => item.state === "requested" || item.state === "submitted").map((item) => <option key={item.id} value={item.id}>{item.number} · {item.methodCode}</option>)}</select></label><label>Report revision<input name="revision" required /></label><label>Examiner organization ID<input name="examinerOrganizationId" required /></label><label>Personnel qualification reference<input name="personnelQualificationReference" required /></label><label>Equipment IDs<input name="equipmentIds" required /></label><label>Media file IDs<input name="mediaFileIds" /></label><label>Performed at<input name="performedAt" type="datetime-local" required /></label><label>Examination conditions<input name="conditions" required /></label><label>Indications<input name="indications" /></label><label>Result<select name="result"><option value="accept">Accept</option><option value="reject">Reject</option></select></label><label>Released evidence file IDs<input name="evidenceFileIds" required /></label><button className="primary-button" disabled={working}>Submit NDE report</button></form></details></article>
      <article className="workflow-card"><h3>PWHT cycle control</h3><div className="basis-list">{snapshot.pwhtCycles.map((item) => <article key={item.id}><div><strong>{item.number} · {item.result}</strong><small>{item.weldIds.length} weld(s) · {item.interruptions.length} interruption(s)</small></div><span className={`state-badge state-${item.state}`}>{display(item.state)}</span>{item.state === "submitted" ? <button className="primary-button" type="button" onClick={() => void act(`/v1/pwht-cycles/${item.id}/review`, { expectedVersion: item.version, decision: "accept", reason: "Procedure, chart, equipment, thermocouple coverage, soak, and interruptions independently reviewed." }, "PWHT cycle independently accepted.")}>Accept PWHT</button> : null}</article>)}</div>
        <details><summary>Submit PWHT cycle</summary><form className="compact-form form-columns" onSubmit={(event) => void submitPwht(event)}><label>Cycle number<input name="number" required /></label><label>Procedure document revision ID<input name="procedureDocumentRevisionId" required /></label><label>Weld IDs<input name="weldIds" required /></label><label>Heating rate<input name="heatingRate" required /></label><label>Cooling rate<input name="coolingRate" required /></label><label>Soak temperature minimum<input name="soakTemperatureMinimum" required /></label><label>Soak temperature maximum<input name="soakTemperatureMaximum" required /></label><label>Soak duration minutes<input name="soakDurationMinutes" required /></label><label>Thermocouple ID<input name="thermocoupleId" required /></label><label>Thermocouple location<input name="thermocoupleLocation" required /></label><label>Observed minimum<input name="thermocoupleMinimum" required /></label><label>Observed maximum<input name="thermocoupleMaximum" required /></label><label className="check-row"><input name="withinTolerance" type="checkbox" defaultChecked />Thermocouple within tolerance</label><label>Equipment IDs<input name="equipmentIds" required /></label><label>Chart file ID<input name="chartFileId" required /></label><label>Released evidence file IDs<input name="evidenceFileIds" required /></label><label>Interruptions<input name="interruptions" /></label><label>Result<select name="result"><option value="pass">Pass</option><option value="fail">Fail</option></select></label><label>Performed at<input name="performedAt" type="datetime-local" required /></label><button className="primary-button" disabled={working}>Submit PWHT cycle</button></form></details></article>
    </div> : null}

    {view === "testing" ? <div className="workflow-grid">
      <article className="workflow-card workflow-card-wide"><h3>Completion-boundary test packages</h3><div className="commitment-grid">{snapshot.testPackages.map((item) => <article key={item.id}><div><strong>{item.number} · {display(item.testType)} test</strong><small>Boundary {item.completionBoundaryId} · target {item.targetPressure ?? "functional"}</small></div><span className={`state-badge state-${item.state}`}>{display(item.state)}</span><p>{item.result ? `Result ${item.result}` : "Not executed"}{item.deficiencyNcrIds.length ? ` · deficiencies ${item.deficiencyNcrIds.join(", ")}` : ""}</p>{item.state === "draft" || item.state === "ready" ? <button className="secondary-button" type="button" onClick={() => void act(`/v1/test-packages/${item.id}/readiness`, { expectedVersion: item.version }, "Test readiness recalculated from exact boundary welds, documents, gauges, and NCRs.")}>Refresh readiness</button> : null}{item.state === "submitted" ? <button className="primary-button" type="button" onClick={() => void act(`/v1/test-packages/${item.id}/review`, { expectedVersion: item.version, decision: "accept", reason: "Safety prerequisites, execution evidence, result, deficiencies, and restoration independently accepted." }, "Test result independently accepted.")}>Accept test result</button> : null}</article>)}</div>
        <details><summary>Create test package</summary><form className="compact-form form-columns" onSubmit={(event) => void createTestPackage(event)}><label>Test package number<input name="number" required /></label><label>Test type<select name="testType"><option value="pressure">Pressure</option><option value="leak">Leak</option><option value="functional">Functional</option></select></label><label>Completion boundary ID<input name="completionBoundaryId" required /></label><label>Governing document revision IDs<input name="governingDocumentRevisionIds" required /></label><label>Drawing revision IDs<input name="drawingRevisionIds" required /></label><label>Test medium<input name="testMedium" required /></label><label>Target pressure<input name="targetPressure" /></label><label>Hold duration minutes<input name="holdDurationMinutes" required /></label><label>Hazard / permit references<input name="hazardPermitReferences" required /></label><label>Prerequisite references<input name="prerequisiteReferences" required /></label><label>Blind / valve / instrument references<input name="blindValveInstrumentReferences" required /></label><label>Gauge equipment IDs<input name="gaugeEquipmentIds" required /></label><label>Participant user IDs<input name="participantUserIds" required /></label><label>Witness user IDs<input name="witnessUserIds" required /></label><button className="primary-button" disabled={working}>Create test package</button></form></details>
        <details><summary>Submit ready-package result</summary><form className="compact-form form-columns" onSubmit={(event) => void submitTestResult(event)}><label>Ready test package<select name="testPackageId" required>{snapshot.testPackages.filter((item) => item.state === "ready").map((item) => <option key={item.id} value={item.id}>{item.number}</option>)}</select></label><label>Performed at<input name="performedAt" type="datetime-local" required /></label><label>Result<select name="result"><option value="pass">Pass</option><option value="fail">Fail</option></select></label><label>Released evidence file IDs<input name="evidenceFileIds" required /></label><label>Deficiency NCR IDs<input name="deficiencyNcrIds" /></label><label className="form-span">Restoration confirmation<textarea name="restorationConfirmation" required /></label><button className="primary-button" disabled={working}>Submit test result</button></form></details></article>
    </div> : null}
  </section>;
}
