import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
type Notify = (tone: "success" | "error", text: string) => void;
export type ControlsView = "controls" | "procurement" | "scheduling";

interface BaselineLine {
  readonly lineKey: string; readonly sourceEstimateLineKey: string; readonly costCode: string;
  readonly wbsCode: string | null; readonly workPackageCode: string | null; readonly controlAccountCode: string;
  readonly budgetQuantity: string; readonly unitCode: string; readonly budgetAmount: string;
}
interface Baseline {
  readonly id: string; readonly sourceHandoffId: string; readonly number: string; readonly revision: string;
  readonly revisionReason: string; readonly currency: string; readonly currentBudgetAmount: string;
  readonly managementReserveAmount: string; readonly state: string; readonly version: number;
  readonly lines: readonly BaselineLine[];
}
interface ChangeRequest {
  readonly id: string; readonly number: string; readonly title: string; readonly origin: string;
  readonly totalCostImpact: string; readonly scheduleDaysImpact: string; readonly state: string; readonly version: number;
}
interface CostEntry {
  readonly id: string; readonly entryType: string; readonly amount: string; readonly currency: string;
  readonly periodStart: string; readonly sourceId: string; readonly state: string; readonly version: number;
}
interface ProgressClaim {
  readonly id: string; readonly baselineLineKey: string; readonly claimedQuantity: string;
  readonly claimedEarnedAmount: string; readonly qualityAcceptanceState: string;
  readonly invoiceApprovalState: string; readonly state: string; readonly version: number;
}
interface RequisitionItem {
  readonly itemKey: string; readonly description: string; readonly quantity: string; readonly unitCode: string;
  readonly needBy: string; readonly specificationReference: string; readonly governingDocumentRevisionIds: readonly string[];
}
interface Requisition {
  readonly id: string; readonly number: string; readonly title: string; readonly state: string;
  readonly version: number; readonly items: readonly RequisitionItem[];
}
interface Offer {
  readonly offerKey: string; readonly vendorOrganizationId: string; readonly totalAmount: string;
  readonly currency: string; readonly validUntil: string; readonly unresolvedItemKeys: readonly string[];
  readonly sourceSha256: string;
}
interface BidPackage {
  readonly id: string; readonly number: string; readonly state: string; readonly version: number;
  readonly offers: readonly Offer[]; readonly recommendedOfferKey: string | null; readonly awardedOfferKey: string | null;
}
interface StatusEvent { readonly eventType: string; readonly status: string; readonly sourceReference: string; }
interface Commitment {
  readonly id: string; readonly purchaseOrderReference: string; readonly revision: string; readonly vendorOrganizationId: string;
  readonly amount: string; readonly currency: string; readonly state: string; readonly version: number;
  readonly statusEvents: readonly StatusEvent[];
}
interface ScheduleProgram {
  readonly id: string; readonly number: string; readonly name: string; readonly timeZone: string;
  readonly currentRevisionId: string | null; readonly version: number;
}
interface ScheduleRevision {
  readonly id: string; readonly scheduleId: string; readonly revision: string; readonly revisionType: string;
  readonly dataDate: string; readonly baselineVarianceDays: string; readonly sourceSystem: string;
  readonly activities: readonly { readonly activityKey: string; readonly name: string; readonly plannedStart: string;
    readonly plannedFinish: string; readonly fieldClaimPercent: string; readonly acceptedProgressPercent: string;
    readonly constraintCodes: readonly string[] }[];
  readonly state: string; readonly version: number;
}
interface ScheduleImport { readonly id: string; readonly sourceSystem: string; readonly sourceVersion: string; readonly mappingVersion: string; readonly targetRevision: string; readonly state: string; readonly previewErrors: readonly string[]; readonly version: number; }
interface Snapshot {
  readonly baselines: readonly Baseline[]; readonly changes: readonly ChangeRequest[];
  readonly costEntries: readonly CostEntry[]; readonly progressClaims: readonly ProgressClaim[];
  readonly requisitions: readonly Requisition[]; readonly bidPackages: readonly BidPackage[];
  readonly commitments: readonly Commitment[]; readonly schedules: readonly ScheduleProgram[];
  readonly scheduleRevisions: readonly ScheduleRevision[]; readonly scheduleImports: readonly ScheduleImport[];
}
interface CostSummary {
  readonly currency: string; readonly currentBudget: string; readonly commitments: string; readonly actuals: string;
  readonly accruals: string; readonly acceptedProgress: string; readonly forecastRemaining: string;
  readonly estimateAtCompletion: string; readonly varianceAtCompletion: string; readonly contingencyDraws: string;
  readonly reserveMovements: string;
}
interface AuthorityPolicy { readonly id: string; readonly currency: string; readonly revision: string; readonly standardChangeApprovalLimit: string; readonly standardProcurementAwardLimit: string; readonly state: string; }
interface LookAheadItem { readonly activity: ScheduleRevision["activities"][number]; readonly blockers: readonly string[]; }

interface Props {
  readonly projectId: string; readonly projectNumber: string; readonly organizationId: string;
  readonly initialView: ControlsView; readonly request: Request; readonly working: boolean;
  readonly setWorking: (working: boolean) => void; readonly notify: Notify;
}

const emptySnapshot: Snapshot = { baselines: [], changes: [], costEntries: [], progressClaims: [], requisitions: [], bidPackages: [], commitments: [], schedules: [], scheduleRevisions: [], scheduleImports: [] };
const views: readonly { readonly key: ControlsView; readonly number: string; readonly label: string; readonly description: string }[] = [
  { key: "controls", number: "01", label: "Cost & change", description: "Baseline · EAC · progress" },
  { key: "procurement", number: "02", label: "Procurement", description: "Bid · award · expedite" },
  { key: "scheduling", number: "03", label: "Scheduling", description: "Logic · updates · look-ahead" },
];
const dateAfter = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const split = (value: FormDataEntryValue | null) => String(value ?? "").split(/[\n,]+/u).map((item) => item.trim()).filter(Boolean);
const mappingRows = (value: FormDataEntryValue | null, defaultOrganizationId: string) => String(value ?? "").split(/\r?\n/u)
  .map((row) => row.trim()).filter(Boolean).map((row) => {
    const [sourceEstimateLineKey, controlAccountCode, wbsCode = "", workPackageCode = "", responsibleOrganizationId = defaultOrganizationId] = row.split("|").map((cell) => cell.trim());
    return { sourceEstimateLineKey, controlAccountCode, responsibleOrganizationId, wbsCode: wbsCode || null, workPackageCode: workPackageCode || null };
  });
const errorText = (error: unknown) => error instanceof Error ? error.message : "The controlled action failed.";

function ScheduleActivityFields({ submitLabel = "Create schedule revision" }: { readonly submitLabel?: string }) {
  return <>
    <label>Stable activity key<input name="activityKey" required /></label><label>Display ID<input name="displayId" required /></label>
    <label className="form-span">Activity name<input name="activityName" required /></label>
    <label>Activity type<select name="activityType"><option value="activity">Activity</option><option value="milestone">Milestone</option></select></label>
    <label>Calendar code<input name="calendarCode" defaultValue="STANDARD" required /></label>
    <label>WBS code<input name="wbsCode" required /></label><label>Work package code<input name="workPackageCode" /></label>
    <label>Completion boundary ID<input name="completionBoundaryId" /></label><label>External activity ID<input name="sourceExternalId" required /></label>
    <label>Planned start<input name="plannedStart" type="date" defaultValue={dateAfter(1)} required /></label>
    <label>Planned finish<input name="plannedFinish" type="date" defaultValue={dateAfter(10)} required /></label>
    <label>Remaining duration days<input name="remainingDurationDays" inputMode="decimal" defaultValue="10" required /></label>
    <label>Quantity<input name="quantity" inputMode="decimal" /></label><label>Unit code<input name="unitCode" defaultValue="EA" /></label>
    <label>Field claim percent<input name="fieldClaimPercent" inputMode="decimal" defaultValue="0" required /></label>
    <label>Accepted progress percent<input name="acceptedProgressPercent" inputMode="decimal" defaultValue="0" required /></label>
    <label>Resource codes<input name="resourceCodes" /></label><label>Constraint codes<input name="constraintCodes" /></label>
    <label>Required document revision IDs<input name="documentRevisionIds" /></label>
    <label>Required material item IDs<input name="materialItemIds" /></label>
    <label>Required inspection IDs<input name="inspectionIds" /></label>
    <button className="primary-button" type="submit">{submitLabel}</button>
  </>;
}

export function ProjectControlsWorkspace({ projectId, projectNumber, organizationId, initialView, request, working, setWorking, notify }: Props) {
  const [view, setView] = useState<ControlsView>(initialView);
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [policies, setPolicies] = useState<readonly AuthorityPolicy[]>([]);
  const [lookAhead, setLookAhead] = useState<readonly LookAheadItem[]>([]);
  useEffect(() => setView(initialView), [initialView]);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setWorking(true);
    try {
      const next = await request<Snapshot>(`/v1/projects/${projectId}/controls`);
      setSnapshot(next);
      const [summaryResult, policyResult] = await Promise.allSettled([
        request<CostSummary>(`/v1/projects/${projectId}/cost-summary`),
        request<readonly AuthorityPolicy[]>("/v1/project-controls-authority-policies"),
      ]);
      setSummary(summaryResult.status === "fulfilled" ? summaryResult.value : null);
      setPolicies(policyResult.status === "fulfilled" ? policyResult.value : []);
    } catch (error) { notify("error", errorText(error)); }
    finally { if (!quiet) setWorking(false); }
  }, [notify, projectId, request, setWorking]);
  useEffect(() => { void refresh(); }, [refresh]);

  const currentBaseline = useMemo(() => snapshot.baselines.find((item) => item.state === "approved") ?? null, [snapshot.baselines]);
  const currentLine = currentBaseline?.lines[0] ?? null;

  async function act(path: string, body: unknown, success: string) {
    setWorking(true);
    try { await request(path, { method: "POST", body: JSON.stringify(body) }); notify("success", success); await refresh(true); }
    catch (error) { notify("error", errorText(error)); }
    finally { setWorking(false); }
  }

  async function createBaseline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await act(`/v1/projects/${projectId}/control-baselines`, {
      sourceHandoffId: String(form.get("sourceHandoffId")), number: String(form.get("number")),
      revision: String(form.get("revision")), revisionReason: String(form.get("reason")),
      periodStart: String(form.get("periodStart")), periodFinish: String(form.get("periodFinish")),
      managementReserveAmount: String(form.get("reserve")), mappings: mappingRows(form.get("mappings"), organizationId),
    }, "Draft control baseline created from the exact award handoff.");
  }

  async function createChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!currentBaseline || !currentLine) return; const form = new FormData(event.currentTarget);
    await act(`/v1/projects/${projectId}/changes`, {
      baselineId: currentBaseline.id, number: String(form.get("number")), title: String(form.get("title")),
      origin: String(form.get("origin")), description: String(form.get("description")),
      scheduleDaysImpact: String(form.get("scheduleDaysImpact")), quotationReference: String(form.get("quotationReference")) || null,
      evidenceFileIds: split(form.get("evidenceFileIds")), lineImpacts: [{ baselineLineKey: String(form.get("baselineLineKey")),
        quantityDelta: String(form.get("quantityDelta")), amountDelta: String(form.get("amountDelta")), reason: String(form.get("reason")) }],
    }, "Change submitted for thresholded independent review.");
  }

  async function createCostEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!currentBaseline) return; const form = new FormData(event.currentTarget);
    await act(`/v1/projects/${projectId}/cost-entries`, { baselineId: currentBaseline.id,
      baselineLineKey: String(form.get("baselineLineKey")) || null, entryType: String(form.get("entryType")), amount: String(form.get("amount")),
      periodStart: String(form.get("periodStart")), periodFinish: String(form.get("periodFinish")), sourceType: String(form.get("sourceType")),
      sourceId: String(form.get("sourceId")), sourceSha256: String(form.get("sourceSha256")), description: String(form.get("description")),
    }, "Period cost entry submitted; EAC will change only after independent acceptance.");
  }

  async function createProgress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!currentBaseline || !currentLine) return; const form = new FormData(event.currentTarget);
    await act(`/v1/projects/${projectId}/progress-claims`, { baselineId: currentBaseline.id, baselineLineKey: String(form.get("baselineLineKey")),
      periodStart: String(form.get("periodStart")), periodFinish: String(form.get("periodFinish")),
      claimedQuantity: String(form.get("quantity")), evidenceFileIds: split(form.get("evidenceFileIds")), fieldStatus: String(form.get("fieldStatus")),
    }, "Quantity progress submitted; quality and invoice acceptance remain separate.");
  }

  async function createRequisition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!currentBaseline || !currentLine) return; const form = new FormData(event.currentTarget);
    await act(`/v1/projects/${projectId}/procurement-requisitions`, { baselineId: currentBaseline.id,
      number: String(form.get("number")), title: String(form.get("title")), items: [{ itemKey: String(form.get("itemKey")),
        baselineLineKey: String(form.get("baselineLineKey")), itemType: String(form.get("itemType")), description: String(form.get("description")),
        specificationReference: String(form.get("specificationReference")), governingDocumentRevisionIds: split(form.get("documentRevisionIds")),
        quantity: String(form.get("quantity")), unitCode: currentLine.unitCode, needBy: String(form.get("needBy")),
        deliveryTerms: String(form.get("deliveryTerms")), inspectionRequirements: split(form.get("inspectionRequirements")),
        documentRequirements: split(form.get("documentRequirements")), turnoverRequirements: split(form.get("turnoverRequirements")),
        costCode: String(form.get("costCode")), workPackageCode: String(form.get("workPackageCode")) || null, budgetAmount: String(form.get("budgetAmount")),
      }] }, "Draft requisition created against the current approved baseline.");
  }

  async function createBidPackage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await act(`/v1/projects/${projectId}/procurement-bid-packages`, { requisitionId: String(form.get("requisitionId")),
      number: String(form.get("number")), bidderOrganizationIds: split(form.get("bidders")) }, "Bid package issued to the declared bidders.");
  }

  async function recordOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const bidPackage = snapshot.bidPackages.find((item) => item.id === String(form.get("bidPackageId")));
    if (!bidPackage) return;
    await act(`/v1/procurement-bid-packages/${bidPackage.id}/offers`, { expectedVersion: bidPackage.version,
      offerKey: String(form.get("offerKey")), vendorOrganizationId: String(form.get("vendorOrganizationId")),
      quoteReference: String(form.get("quoteReference")), sourceFileId: String(form.get("sourceFileId")),
      sourceSha256: String(form.get("sourceSha256")), currency: currentBaseline?.currency ?? "USD",
      validUntil: String(form.get("validUntil")), totalAmount: String(form.get("totalAmount")),
      promisedDate: String(form.get("promisedDate")), inclusions: split(form.get("inclusions")),
      exclusions: split(form.get("exclusions")), clarifications: split(form.get("clarifications")),
      unresolvedItemKeys: split(form.get("unresolvedItemKeys")),
    }, "Offer recorded with its exact released source and visible scope gaps.");
  }

  async function recommendOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const bidPackage = snapshot.bidPackages.find((item) => item.id === String(form.get("bidPackageId")));
    if (!bidPackage) return;
    await act(`/v1/procurement-bid-packages/${bidPackage.id}/recommend`, { expectedVersion: bidPackage.version,
      offerKey: String(form.get("offerKey")), reason: String(form.get("reason")) }, "Complete offer independently recommended.");
  }

  async function awardOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const bidPackage = snapshot.bidPackages.find((item) => item.id === String(form.get("bidPackageId")));
    if (!bidPackage) return;
    await act(`/v1/procurement-bid-packages/${bidPackage.id}/award`, { expectedVersion: bidPackage.version,
      reason: String(form.get("reason")), purchaseOrderReference: String(form.get("purchaseOrderReference")),
      revision: String(form.get("revision")) }, "Recommended offer awarded under the active authority policy.");
  }

  async function recordCommitmentStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const commitment = snapshot.commitments.find((item) => item.id === String(form.get("commitmentId")));
    if (!commitment) return;
    const dateOrNull = (name: string) => String(form.get(name)) || null;
    await act(`/v1/procurement-commitments/${commitment.id}/status-events`, { expectedVersion: commitment.version,
      eventType: String(form.get("eventType")), status: String(form.get("status")), promisedAt: dateOrNull("promisedAt"),
      forecastAt: dateOrNull("forecastAt"), actualAt: dateOrNull("actualAt"), sourceReference: String(form.get("sourceReference")),
      evidenceFileIds: split(form.get("evidenceFileIds")), receivedMaterialItemIds: split(form.get("receivedMaterialItemIds")),
      responsibleUserId: String(form.get("responsibleUserId")),
    }, "Expediting status appended without replacing vendor evidence.");
  }

  async function createSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await act(`/v1/projects/${projectId}/schedules`, { number: String(form.get("number")), name: String(form.get("name")),
      timeZone: String(form.get("timeZone")) }, "Controlled schedule program created.");
  }

  function scheduleActivity(form: FormData) {
    const quantity = String(form.get("quantity"));
    return { activityKey: String(form.get("activityKey")), displayId: String(form.get("displayId")),
      name: String(form.get("activityName")), activityType: String(form.get("activityType")),
      calendarCode: String(form.get("calendarCode")), wbsCode: String(form.get("wbsCode")),
      workPackageCode: String(form.get("workPackageCode")) || null, responsibleOrganizationId: organizationId,
      completionBoundaryId: String(form.get("completionBoundaryId")) || null,
      plannedStart: String(form.get("plannedStart")), plannedFinish: String(form.get("plannedFinish")),
      actualStart: null, actualFinish: null, remainingDurationDays: String(form.get("remainingDurationDays")),
      quantity: quantity || null, unitCode: quantity ? String(form.get("unitCode")) : null,
      resourceCodes: split(form.get("resourceCodes")), constraintCodes: split(form.get("constraintCodes")),
      requiredDocumentRevisionIds: split(form.get("documentRevisionIds")), requiredMaterialItemIds: split(form.get("materialItemIds")),
      requiredInspectionIds: split(form.get("inspectionIds")), fieldClaimPercent: String(form.get("fieldClaimPercent")),
      acceptedProgressPercent: String(form.get("acceptedProgressPercent")), sourceExternalId: String(form.get("sourceExternalId")) || null };
  }

  async function createScheduleRevision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const schedule = snapshot.schedules.find((item) => item.id === String(form.get("scheduleId")));
    if (!schedule || !currentBaseline) return;
    const revisionType = String(form.get("revisionType"));
    await act(`/v1/schedules/${schedule.id}/revisions`, { expectedScheduleVersion: schedule.version,
      revision: String(form.get("revision")), revisionType, parentRevisionId: revisionType === "update" ? schedule.currentRevisionId : null,
      sourceBaselineId: currentBaseline.id, dataDate: String(form.get("dataDate")), reason: String(form.get("reason")),
      sourceSystem: "manual", sourceVersion: null, sourceSha256: null, activities: [scheduleActivity(form)], dependencies: [],
    }, "Immutable draft schedule revision created with stable activity identity.");
  }

  async function previewScheduleImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const schedule = snapshot.schedules.find((item) => item.id === String(form.get("scheduleId")));
    if (!schedule) return;
    await act(`/v1/schedules/${schedule.id}/imports/preview`, { idempotencyKey: String(form.get("idempotencyKey")),
      sourceSystem: String(form.get("sourceSystem")), sourceVersion: String(form.get("sourceVersion")),
      sourceFileId: String(form.get("sourceFileId")), sourceSha256: String(form.get("sourceSha256")),
      mappingVersion: String(form.get("mappingVersion")), targetRevision: String(form.get("revision")),
      targetRevisionType: "update", parentRevisionId: schedule.currentRevisionId, dataDate: String(form.get("dataDate")),
      activities: [scheduleActivity(form)], dependencies: [],
    }, "Schedule import preview retained with validation and reconciliation results.");
  }

  async function loadLookAhead(schedule: ScheduleProgram) {
    setWorking(true);
    try { setLookAhead(await request<readonly LookAheadItem[]>(`/v1/schedules/${schedule.id}/look-ahead?windowDays=30`)); notify("success", "30-day look-ahead derived from the current approved revision."); }
    catch (error) { notify("error", errorText(error)); }
    finally { setWorking(false); }
  }

  const metric = (label: string, value: string, note: string, warning = false) => <article className={warning ? "metric-warning" : ""}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
  return <section className="workflow controls-workspace" aria-labelledby="controls-workspace-heading">
    <div className="workflow-heading"><div><p className="section-label">Integrated project controls</p><h2 id="controls-workspace-heading">Controls, procurement & schedule — {projectNumber}</h2><p className="muted">Exact award basis, independent approvals, attributable changes, commitments, period cost, progress, and schedule logic.</p></div><button className="secondary-button" type="button" onClick={() => void refresh()} disabled={working}>Refresh controls</button></div>
    <ol className="workflow-steps controls-steps">{views.map((item) => <li key={item.key} className={view === item.key ? "is-active" : ""}><button type="button" onClick={() => setView(item.key)}><span>{item.number}</span><strong>{item.label}</strong><small>{item.description}</small></button></li>)}</ol>
    <section className="metrics controls-metrics" aria-label="Project cost summary">
      {metric("Current budget", summary ? `${summary.currency} ${summary.currentBudget}` : "—", currentBaseline ? `${currentBaseline.number} r${currentBaseline.revision}` : "Approved baseline required")}
      {metric("Commitments", summary ? `${summary.currency} ${summary.commitments}` : "—", `${snapshot.commitments.length} controlled commitment(s)`)}
      {metric("Estimate at completion", summary ? `${summary.currency} ${summary.estimateAtCompletion}` : "—", summary ? `Actual ${summary.actuals} + accrual ${summary.accruals} + forecast ${summary.forecastRemaining}` : "Accepted entries only")}
      {metric("Variance at completion", summary ? `${summary.currency} ${summary.varianceAtCompletion}` : "—", summary ? `Earned ${summary.acceptedProgress}` : "Accepted quantity progress", Boolean(summary?.varianceAtCompletion.startsWith("-")))}
    </section>

    {view === "controls" ? <div className="workflow-grid">
      <article className="workflow-card"><h3>Baseline history</h3><div className="basis-list">{snapshot.baselines.map((item) => <article key={item.id}><div><strong>{item.number} · revision {item.revision}</strong><small>{item.currency} {item.currentBudgetAmount} · reserve {item.managementReserveAmount}</small></div><span className={`state-badge state-${item.state}`}>{item.state}</span>{item.state === "draft" ? <button className="secondary-button" type="button" onClick={() => void act(`/v1/project-control-baselines/${item.id}/submit`, { expectedVersion: item.version }, "Baseline submitted for independent review.")}>Submit baseline</button> : null}{item.state === "under_review" ? <button className="primary-button" type="button" onClick={() => void act(`/v1/project-control-baselines/${item.id}/review`, { expectedVersion: item.version, decision: "approve", reason: "Exact handoff reconciliation verified." }, "Baseline independently approved.")}>Approve baseline</button> : null}</article>)}</div>{snapshot.baselines.length === 0 ? <form className="compact-form form-columns" onSubmit={(event) => void createBaseline(event)}><label>Award handoff ID<input name="sourceHandoffId" required /></label><label>Baseline number<input name="number" required /></label><label>Revision<input name="revision" defaultValue="0" required /></label><label>Revision reason<input name="reason" defaultValue="Initial award baseline" required /></label><label>Period start<input name="periodStart" type="date" defaultValue={dateAfter(0)} required /></label><label>Period finish<input name="periodFinish" type="date" defaultValue={dateAfter(365)} required /></label><label>Management reserve<input name="reserve" inputMode="decimal" defaultValue="0" required /></label><label className="form-span">Award mapping lines<textarea name="mappings" placeholder="estimate-line-key | control-account | WBS | work-package | responsible-org (optional)" required /></label><p className="record-note form-span">Enter one row for every direct and adjustment line in the immutable handoff. The server requires exact zero-difference reconciliation.</p><button className="primary-button" disabled={working}>Create from handoff</button></form> : null}</article>
      <article className="workflow-card"><h3>Change control</h3><div className="basis-list">{snapshot.changes.map((item) => <article key={item.id}><div><strong>{item.number} · {item.title}</strong><small>{item.origin} · impact {item.totalCostImpact} / {item.scheduleDaysImpact} days</small></div><span className={`state-badge state-${item.state}`}>{item.state}</span>{item.state === "under_review" ? <button className="primary-button" type="button" onClick={() => void act(`/v1/project-changes/${item.id}/review`, { expectedVersion: item.version, decision: "approve", reason: "Scope, evidence, and authority threshold verified." }, "Change independently approved.")}>Approve change</button> : null}</article>)}</div><form className="compact-form form-columns" onSubmit={(event) => void createChange(event)}><label>Change number<input name="number" required /></label><label>Title<input name="title" required /></label><label>Baseline line<select name="baselineLineKey" required>{currentBaseline?.lines.map((line) => <option key={line.lineKey} value={line.lineKey}>{line.lineKey} · {line.costCode}</option>)}</select></label><label>Origin<input name="origin" required /></label><label>Schedule impact days<input name="scheduleDaysImpact" inputMode="decimal" defaultValue="0" required /></label><label>Quantity delta<input name="quantityDelta" inputMode="decimal" defaultValue="0" required /></label><label>Cost impact<input name="amountDelta" inputMode="decimal" defaultValue="0" required /></label><label>Quotation reference<input name="quotationReference" /></label><label>Released evidence file IDs<input name="evidenceFileIds" required /></label><label className="form-span">Description<textarea name="description" required /></label><label className="form-span">Line-impact reason<input name="reason" required /></label><button className="primary-button" disabled={working || !currentLine}>Submit change</button></form></article>
      <article className="workflow-card"><h3>Period cost ledger</h3><div className="basis-list">{snapshot.costEntries.map((item) => <article key={item.id}><div><strong>{item.entryType.replaceAll("_", " ")} · {item.currency} {item.amount}</strong><small>{item.sourceId} · {item.periodStart.slice(0, 10)}</small></div><span className={`state-badge state-${item.state}`}>{item.state}</span>{item.state === "submitted" ? <button className="primary-button" type="button" onClick={() => void act(`/v1/project-cost-entries/${item.id}/review`, { expectedVersion: item.version, decision: "accept", reason: "Period source reconciled." }, "Cost entry independently accepted.")}>Accept entry</button> : null}</article>)}</div><form className="compact-form form-columns" onSubmit={(event) => void createCostEntry(event)}><label>Entry type<select name="entryType"><option value="actual">Actual</option><option value="accrual">Accrual</option><option value="forecast_remaining">Forecast remaining</option><option value="contingency_draw">Contingency draw</option><option value="reserve_movement">Reserve movement</option></select></label><label>Baseline line (optional)<select name="baselineLineKey"><option value="">Whole baseline</option>{currentBaseline?.lines.map((line) => <option key={line.lineKey} value={line.lineKey}>{line.lineKey} · {line.costCode}</option>)}</select></label><label>Amount<input name="amount" inputMode="decimal" required /></label><label>Period start<input name="periodStart" type="date" defaultValue={dateAfter(-30)} required /></label><label>Period finish<input name="periodFinish" type="date" defaultValue={dateAfter(0)} required /></label><label>Source type<input name="sourceType" defaultValue="CONTROLLED_IMPORT" required /></label><label>Source ID<input name="sourceId" required /></label><label className="form-span">Source SHA-256<input name="sourceSha256" minLength={64} maxLength={64} required /></label><label className="form-span">Description<input name="description" required /></label><button className="primary-button" disabled={working || !currentBaseline}>Submit period entry</button></form></article>
      <article className="workflow-card"><h3>Quantity progress</h3><p className="record-note"><strong>Separation boundary:</strong> accepting quantity evidence never accepts quality or approves an invoice.</p><div className="basis-list">{snapshot.progressClaims.map((item) => <article key={item.id}><div><strong>{item.baselineLineKey} · {item.claimedQuantity} · earned {item.claimedEarnedAmount}</strong><small>Quality {item.qualityAcceptanceState} · invoice {item.invoiceApprovalState}</small></div><span className={`state-badge state-${item.state}`}>{item.state}</span>{item.state === "submitted" ? <button className="primary-button" type="button" onClick={() => void act(`/v1/project-progress-claims/${item.id}/review`, { expectedVersion: item.version, decision: "accept", reason: "Quantity and evidence verified independently." }, "Quantity progress accepted; quality and invoice states unchanged.")}>Accept quantity</button> : null}</article>)}</div><form className="compact-form form-columns" onSubmit={(event) => void createProgress(event)}><label>Baseline line<select name="baselineLineKey" required>{currentBaseline?.lines.map((line) => <option key={line.lineKey} value={line.lineKey}>{line.lineKey} · {line.costCode}</option>)}</select></label><label>Period start<input name="periodStart" type="date" defaultValue={dateAfter(-30)} required /></label><label>Period finish<input name="periodFinish" type="date" defaultValue={dateAfter(0)} required /></label><label>Claimed quantity<input name="quantity" inputMode="decimal" required /></label><label>Released evidence file IDs<input name="evidenceFileIds" required /></label><label className="form-span">Field status<input name="fieldStatus" required /></label><button className="primary-button" disabled={working || !currentLine}>Submit quantity claim</button></form></article>
      <article className="workflow-card workflow-card-wide"><h3>Active authority policy</h3><div className="basis-list">{policies.map((item) => <article key={item.id}><div><strong>{item.currency} · revision {item.revision}</strong><small>Change limit {item.standardChangeApprovalLimit} · procurement award limit {item.standardProcurementAwardLimit}</small></div><span className={`state-badge state-${item.state}`}>{item.state}</span></article>)}</div></article>
    </div> : null}

    {view === "procurement" ? <div className="workflow-grid">
      <article className="workflow-card"><h3>Requisitions</h3><div className="basis-list">{snapshot.requisitions.map((item) => <article key={item.id}><div><strong>{item.number} · {item.title}</strong><small>{item.items.length} line(s) · {item.items[0]?.description}</small></div><span className={`state-badge state-${item.state}`}>{item.state}</span>{item.state === "draft" ? <button className="secondary-button" type="button" onClick={() => void act(`/v1/procurement-requisitions/${item.id}/submit`, { expectedVersion: item.version }, "Requisition submitted for independent review.")}>Submit requisition</button> : null}{item.state === "under_review" ? <button className="primary-button" type="button" onClick={() => void act(`/v1/procurement-requisitions/${item.id}/review`, { expectedVersion: item.version, decision: "approve", reason: "Scope, requirement, and budget verified." }, "Requisition independently approved.")}>Approve requisition</button> : null}</article>)}</div><form className="compact-form form-columns" onSubmit={(event) => void createRequisition(event)}><label>Requisition number<input name="number" required /></label><label>Title<input name="title" required /></label><label>Baseline line<select name="baselineLineKey" required>{currentBaseline?.lines.map((line) => <option key={line.lineKey} value={line.lineKey}>{line.lineKey} · {line.costCode}</option>)}</select></label><label>Item key<input name="itemKey" required /></label><label>Item type<select name="itemType"><option value="material">Material</option><option value="service">Service</option><option value="equipment">Equipment</option><option value="subcontract">Subcontract</option></select></label><label>Description<input name="description" required /></label><label>Specification reference<input name="specificationReference" required /></label><label>Released document revision IDs<input name="documentRevisionIds" required /></label><label>Cost code<input name="costCode" defaultValue={currentLine?.costCode} required /></label><label>Work package code<input name="workPackageCode" defaultValue={currentLine?.workPackageCode ?? ""} /></label><label>Need by<input name="needBy" type="date" defaultValue={dateAfter(45)} required /></label><label>Quantity ({currentLine?.unitCode ?? "unit"})<input name="quantity" inputMode="decimal" required /></label><label>Budget amount<input name="budgetAmount" inputMode="decimal" required /></label><label>Delivery terms<input name="deliveryTerms" required /></label><label>Inspection requirements<input name="inspectionRequirements" /></label><label>Document requirements<input name="documentRequirements" /></label><label>Turnover requirements<input name="turnoverRequirements" /></label><button className="primary-button" disabled={working || !currentLine}>Create requisition</button></form></article>
      <article className="workflow-card"><h3>Bid comparison & award</h3><div className="basis-list">{snapshot.bidPackages.map((item) => <article key={item.id}><div><strong>{item.number} · {item.offers.length} offer(s)</strong><small>Recommended {item.recommendedOfferKey ?? "—"} · awarded {item.awardedOfferKey ?? "—"}</small></div><span className={`state-badge state-${item.state}`}>{item.state}</span>{item.offers.map((offer) => <p className="record-note" key={offer.offerKey}><strong>{offer.offerKey} · {offer.vendorOrganizationId} · {offer.currency} {offer.totalAmount}</strong><br />{offer.unresolvedItemKeys.length ? `Scope gaps: ${offer.unresolvedItemKeys.join(", ")}` : "Complete mapped scope"}<br /><small>Source {offer.sourceSha256}</small></p>)}</article>)}</div><form className="compact-form" onSubmit={(event) => void createBidPackage(event)}><label>Approved requisition<select name="requisitionId" required><option value="">Select…</option>{snapshot.requisitions.filter((item) => item.state === "approved" || item.state === "issued").map((item) => <option key={item.id} value={item.id}>{item.number} · {item.title}</option>)}</select></label><label>Bid package number<input name="number" required /></label><label>Bidder organization IDs<textarea name="bidders" placeholder="One per line" required /></label><button className="primary-button" disabled={working}>Issue bid package</button></form><details><summary>Record exact vendor offer</summary><form className="compact-form form-columns" onSubmit={(event) => void recordOffer(event)}><label>Bid package<select name="bidPackageId" required>{snapshot.bidPackages.filter((item) => item.state === "issued" || item.state === "comparison").map((item) => <option key={item.id} value={item.id}>{item.number}</option>)}</select></label><label>Offer key<input name="offerKey" required /></label><label>Vendor organization ID<input name="vendorOrganizationId" required /></label><label>Quote reference<input name="quoteReference" required /></label><label>Released source file ID<input name="sourceFileId" required /></label><label>Total amount<input name="totalAmount" inputMode="decimal" required /></label><label className="form-span">Source SHA-256<input name="sourceSha256" minLength={64} maxLength={64} required /></label><label>Valid until<input name="validUntil" type="date" defaultValue={dateAfter(30)} required /></label><label>Promised date<input name="promisedDate" type="date" defaultValue={dateAfter(45)} required /></label><label>Inclusions<input name="inclusions" /></label><label>Exclusions<input name="exclusions" /></label><label>Clarifications<input name="clarifications" /></label><label>Unresolved item keys<input name="unresolvedItemKeys" /></label><button className="primary-button" disabled={working}>Record offer</button></form></details><details><summary>Recommend or award</summary><form className="compact-form" onSubmit={(event) => void recommendOffer(event)}><label>Bid package<select name="bidPackageId" required>{snapshot.bidPackages.filter((item) => item.state === "comparison").map((item) => <option key={item.id} value={item.id}>{item.number}</option>)}</select></label><label>Complete offer key<input name="offerKey" required /></label><label>Recommendation reason<input name="reason" required /></label><button className="secondary-button" disabled={working}>Recommend offer</button></form><form className="compact-form" onSubmit={(event) => void awardOffer(event)}><label>Recommended bid package<select name="bidPackageId" required>{snapshot.bidPackages.filter((item) => item.state === "recommended").map((item) => <option key={item.id} value={item.id}>{item.number}</option>)}</select></label><label>Purchase order / contract reference<input name="purchaseOrderReference" required /></label><label>Revision<input name="revision" defaultValue="0" required /></label><label>Award reason<input name="reason" required /></label><button className="primary-button" disabled={working}>Award under authority policy</button></form></details></article>
      <article className="workflow-card workflow-card-wide"><h3>Commitments & expediting</h3><div className="commitment-grid">{snapshot.commitments.map((item) => <article key={item.id}><div><strong>{item.purchaseOrderReference} · revision {item.revision}</strong><small>{item.vendorOrganizationId}</small></div><b>{item.currency} {item.amount}</b><span className={`state-badge state-${item.state}`}>{item.state}</span><ol>{item.statusEvents.map((event, index) => <li key={`${event.eventType}-${index}`}><strong>{event.eventType.replaceAll("_", " ")}</strong> — {event.status} <small>{event.sourceReference}</small></li>)}</ol></article>)}</div>{snapshot.commitments.length === 0 ? <p className="muted">Awarded offers become commitments here. Receipt events must link same-project controlled material records.</p> : null}<form className="compact-form form-columns" onSubmit={(event) => void recordCommitmentStatus(event)}><label>Commitment<select name="commitmentId" required>{snapshot.commitments.map((item) => <option key={item.id} value={item.id}>{item.purchaseOrderReference} r{item.revision}</option>)}</select></label><label>Event type<select name="eventType"><option value="acknowledgement">Acknowledgement</option><option value="submittal">Submittal</option><option value="fabrication_milestone">Fabrication milestone</option><option value="shipment">Shipment</option><option value="exception">Exception</option><option value="receipt">Receipt</option></select></label><label>Status<input name="status" required /></label><label>Responsible user ID<input name="responsibleUserId" required /></label><label>Promised date<input name="promisedAt" type="date" /></label><label>Forecast date<input name="forecastAt" type="date" /></label><label>Actual date<input name="actualAt" type="date" /></label><label>Vendor source reference<input name="sourceReference" required /></label><label>Released evidence file IDs<input name="evidenceFileIds" required /></label><label>Received material item IDs<input name="receivedMaterialItemIds" placeholder="Required for receipt" /></label><button className="primary-button" disabled={working || snapshot.commitments.length === 0}>Append status event</button></form></article>
    </div> : null}

    {view === "scheduling" ? <div className="workflow-grid">
      <article className="workflow-card"><h3>Schedule programs</h3><div className="basis-list">{snapshot.schedules.map((item) => <article key={item.id}><div><strong>{item.number} · {item.name}</strong><small>{item.timeZone} · current {item.currentRevisionId ?? "not baselined"}</small></div><button className="secondary-button" type="button" disabled={!item.currentRevisionId || working} onClick={() => void loadLookAhead(item)}>30-day look-ahead</button></article>)}</div><form className="compact-form" onSubmit={(event) => void createSchedule(event)}><label>Schedule number<input name="number" required /></label><label>Schedule name<input name="name" required /></label><label>Time zone<input name="timeZone" defaultValue="America/Denver" required /></label><button className="primary-button" disabled={working}>Create schedule</button></form></article>
      <article className="workflow-card"><h3>Revision history</h3><div className="basis-list">{snapshot.scheduleRevisions.map((item) => <article key={item.id}><div><strong>{item.revision} · {item.revisionType}</strong><small>{item.sourceSystem} · data date {item.dataDate.slice(0, 10)} · variance {item.baselineVarianceDays} day(s)</small></div><span className={`state-badge state-${item.state}`}>{item.state}</span>{item.state === "draft" ? <button className="secondary-button" type="button" onClick={() => void act(`/v1/schedule-revisions/${item.id}/submit`, { expectedVersion: item.version }, "Schedule revision submitted for independent review.")}>Submit revision</button> : null}{item.state === "under_review" ? <button className="primary-button" type="button" onClick={() => void act(`/v1/schedule-revisions/${item.id}/review`, { expectedVersion: item.version, decision: "approve", reason: "Logic, actuals, forecast, and source verified." }, "Schedule revision independently approved.")}>Approve revision</button> : null}</article>)}</div><p className="record-note">P6 and Microsoft Project imports enter as draft revisions after released-file/hash and mapping validation. Imported data cannot self-approve.</p><details><summary>Create manual baseline/update</summary><form className="compact-form form-columns" onSubmit={(event) => void createScheduleRevision(event)}><label>Schedule<select name="scheduleId" required>{snapshot.schedules.map((item) => <option key={item.id} value={item.id}>{item.number}</option>)}</select></label><label>Revision type<select name="revisionType"><option value="baseline">Baseline</option><option value="update">Update</option></select></label><label>Revision<input name="revision" required /></label><label>Data date<input name="dataDate" type="date" defaultValue={dateAfter(0)} required /></label><label className="form-span">Revision reason<input name="reason" required /></label><ScheduleActivityFields /></form></details></article>
      <article className="workflow-card"><h3>30-day look-ahead</h3><div className="lookahead-list">{lookAhead.map((item) => <article key={item.activity.activityKey}><div><strong>{item.activity.activityKey} · {item.activity.name}</strong><small>{item.activity.plannedStart.slice(0, 10)} → {item.activity.plannedFinish.slice(0, 10)} · field {item.activity.fieldClaimPercent}% / accepted {item.activity.acceptedProgressPercent}%</small></div><span className={item.blockers.length ? "state-badge state-draft" : "state-badge state-active"}>{item.blockers.length ? `${item.blockers.length} blocker(s)` : "ready"}</span>{item.blockers.length ? <p>{item.blockers.join(" · ")}</p> : null}</article>)}</div>{lookAhead.length === 0 ? <p className="muted">Select a current schedule to derive its authorized look-ahead and exact prerequisites.</p> : null}</article>
      <article className="workflow-card"><h3>Provider-neutral imports</h3><div className="basis-list">{snapshot.scheduleImports.map((item) => <article key={item.id}><div><strong>{item.sourceSystem} {item.sourceVersion} → {item.targetRevision}</strong><small>Mapping {item.mappingVersion} · {item.previewErrors.length ? item.previewErrors.join(", ") : "validated"}</small></div><span className={`state-badge state-${item.state}`}>{item.state}</span>{item.state === "previewed" ? <button className="primary-button" type="button" onClick={() => void act(`/v1/schedule-imports/${item.id}/commit`, { expectedVersion: item.version }, "Validated import committed as an unapproved draft revision.")}>Commit preview</button> : null}</article>)}</div><p className="record-note">Live P6/MS Project credentials are not required for the local pilot. Production adapters remain disabled until approved mapping fixtures, credentials, sandbox, retry, and reconciliation evidence exist.</p><details><summary>Preview exact P6 / Microsoft Project source</summary><form className="compact-form form-columns" onSubmit={(event) => void previewScheduleImport(event)}><label>Schedule<select name="scheduleId" required>{snapshot.schedules.map((item) => <option key={item.id} value={item.id}>{item.number}</option>)}</select></label><label>Provider<select name="sourceSystem"><option value="p6">P6</option><option value="microsoft_project">Microsoft Project</option></select></label><label>Provider version<input name="sourceVersion" required /></label><label>Mapping version<input name="mappingVersion" required /></label><label>Idempotency key<input name="idempotencyKey" required /></label><label>Target revision<input name="revision" required /></label><label>Released source file ID<input name="sourceFileId" required /></label><label>Data date<input name="dataDate" type="date" defaultValue={dateAfter(0)} required /></label><label className="form-span">Source SHA-256<input name="sourceSha256" minLength={64} maxLength={64} required /></label><ScheduleActivityFields submitLabel="Preview import" /></form></details></article>
    </div> : null}
  </section>;
}
