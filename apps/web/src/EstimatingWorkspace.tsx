import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Notify = (tone: "success" | "error", text: string) => void;
type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
type EstimateStep = "portfolio" | "basis" | "build-up" | "quotes" | "proposal";

interface EstimateRecord {
  readonly id: string;
  readonly number: string;
  readonly name: string;
  readonly customerOrganizationId: string;
  readonly dueAt: string;
  readonly currency: string;
  readonly state: string;
  readonly currentRevisionId: string;
  readonly version: number;
}

interface EstimateTotals {
  readonly version: string;
  readonly currency: string;
  readonly directCost: string;
  readonly contingencyAmount: string;
  readonly escalationAmount: string;
  readonly markupAmount: string;
  readonly taxAmount: string;
  readonly finalPrice: string;
}

interface EstimateRevision {
  readonly id: string;
  readonly revision: string;
  readonly parentRevisionId: string | null;
  readonly revisionReason: string;
  readonly state: string;
  readonly totals: EstimateTotals;
  readonly reviewReason: string | null;
  readonly version: number;
}

interface EstimateLine {
  readonly id: string;
  readonly revisionId: string;
  readonly lineKey: string;
  readonly sortOrder: number;
  readonly costCode: string;
  readonly description: string;
  readonly quantity: string;
  readonly unitCode: string;
  readonly productivityFactors: readonly { readonly factorRevisionId: string; readonly multiplier: string }[];
  readonly calculation: {
    readonly adjustedLaborHours: string;
    readonly laborCost: string;
    readonly materialCost: string;
    readonly equipmentCost: string;
    readonly subcontractCost: string;
    readonly totalCost: string;
  };
  readonly state: string;
  readonly version: number;
}

interface EstimateQuote {
  readonly id: string;
  readonly quoteNumber: string;
  readonly vendorOrganizationId: string;
  readonly normalizedTotal: string;
  readonly currency: string;
  readonly validUntil: string;
  readonly unresolvedScopeLineKeys: readonly string[];
  readonly exclusions: readonly string[];
  readonly qualifications: readonly string[];
  readonly state: string;
  readonly version: number;
}

interface EstimateProposal {
  readonly id: string;
  readonly proposalNumber: string;
  readonly totalPrice: string;
  readonly currency: string;
  readonly validUntil: string;
  readonly sourceCanonicalSha256: string;
  readonly artifactManifestSha256: string;
  readonly artifactSha256: string;
  readonly artifactFilename: string;
  readonly state: string;
  readonly version: number;
}

interface EstimateHandoff {
  readonly id: string;
  readonly projectId: string;
  readonly mappedTotal: string;
  readonly sourceTotal: string;
  readonly reconciliationDifference: string;
}

interface QuoteSourceFile {
  readonly id: string;
  readonly originalFilename: string;
  readonly sha256: string;
  readonly validationState: string;
  readonly version: number;
}

interface EstimateDetail {
  readonly estimate: EstimateRecord;
  readonly revisions: readonly EstimateRevision[];
  readonly lines: readonly EstimateLine[];
  readonly quotes: readonly EstimateQuote[];
  readonly proposals: readonly EstimateProposal[];
  readonly handoffs: readonly EstimateHandoff[];
}

interface AssemblyRevision {
  readonly id: string;
  readonly code: string;
  readonly revision: string;
  readonly description: string;
  readonly costCode: string;
  readonly unitCode: string;
  readonly baseLaborHoursPerUnit: string;
  readonly state: string;
  readonly version: number;
}

interface ProductivityFactorRevision {
  readonly id: string;
  readonly code: string;
  readonly revision: string;
  readonly name: string;
  readonly multiplier: string;
  readonly discipline: string;
  readonly sourceReference: string;
  readonly state: string;
  readonly version: number;
}

interface AuthorityPolicyRevision {
  readonly id: string;
  readonly currency: string;
  readonly revision: string;
  readonly standardEstimateApprovalLimit: string;
  readonly standardQuoteSelectionLimit: string;
  readonly standardProposalApprovalLimit: string;
  readonly estimateAboveThresholdQualification: string;
  readonly quoteAboveThresholdQualification: string;
  readonly proposalAboveThresholdQualification: string;
  readonly state: string;
  readonly version: number;
}

interface ProjectOption {
  readonly id: string;
  readonly number: string;
  readonly name: string;
}

interface EstimatingWorkspaceProps {
  readonly organizationId: string;
  readonly projects: readonly ProjectOption[];
  readonly request: Request;
  readonly download: (path: string, filename: string) => Promise<void>;
  readonly working: boolean;
  readonly setWorking: (working: boolean) => void;
  readonly notify: Notify;
}

const steps: readonly { key: EstimateStep; number: string; label: string; description: string }[] = [
  { key: "portfolio", number: "01", label: "Opportunities", description: "Scope and revisions" },
  { key: "basis", number: "02", label: "Cost basis", description: "Assemblies and factors" },
  { key: "build-up", number: "03", label: "Build-up", description: "Labor and direct cost" },
  { key: "quotes", number: "04", label: "Quotes", description: "Normalize and compare" },
  { key: "proposal", number: "05", label: "Proposal", description: "Approve and hand off" },
];

function dateAfter(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

function split(value: FormDataEntryValue | null): readonly string[] {
  return String(value ?? "").split(/[\n,]+/u).map((item) => item.trim()).filter(Boolean);
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function EstimatingWorkspace({
  organizationId, projects, request, download, working, setWorking, notify,
}: EstimatingWorkspaceProps) {
  const [step, setStep] = useState<EstimateStep>("portfolio");
  const [estimates, setEstimates] = useState<readonly EstimateRecord[]>([]);
  const [assemblies, setAssemblies] = useState<readonly AssemblyRevision[]>([]);
  const [factors, setFactors] = useState<readonly ProductivityFactorRevision[]>([]);
  const [authorityPolicies, setAuthorityPolicies] = useState<readonly AuthorityPolicyRevision[]>([]);
  const [selectedEstimateId, setSelectedEstimateId] = useState("");
  const [detail, setDetail] = useState<EstimateDetail | null>(null);
  const [quoteComparison, setQuoteComparison] = useState<readonly EstimateQuote[]>([]);
  const [quoteSource, setQuoteSource] = useState<QuoteSourceFile | null>(null);

  const loadDetail = useCallback(async (estimateId: string) => {
    if (!estimateId) { setDetail(null); return; }
    const next = await request<EstimateDetail>(`/v1/estimates/${estimateId}`);
    setDetail(next);
    setEstimates((current) => current.map((estimate) => estimate.id === next.estimate.id ? next.estimate : estimate));
  }, [request]);

  const refresh = useCallback(async () => {
    setWorking(true);
    try {
      const [nextEstimates, nextAssemblies, nextFactors, nextAuthorityPolicies] = await Promise.all([
        request<readonly EstimateRecord[]>("/v1/estimates"),
        request<readonly AssemblyRevision[]>("/v1/estimate-assemblies"),
        request<readonly ProductivityFactorRevision[]>("/v1/estimate-productivity-factors"),
        request<readonly AuthorityPolicyRevision[]>("/v1/estimate-authority-policies"),
      ]);
      setEstimates(nextEstimates);
      setAssemblies(nextAssemblies);
      setFactors(nextFactors);
      setAuthorityPolicies(nextAuthorityPolicies);
      const nextSelected = selectedEstimateId || nextEstimates[0]?.id || "";
      setSelectedEstimateId(nextSelected);
      if (nextSelected) await loadDetail(nextSelected);
      else setDetail(null);
    } catch (error) {
      notify("error", errorText(error, "Estimating workspace refresh failed."));
    } finally {
      setWorking(false);
    }
  }, [loadDetail, notify, request, selectedEstimateId, setWorking]);

  useEffect(() => { void refresh(); }, []); // Identity changes remount this workspace from App.

  const currentRevision = useMemo(
    () => detail?.revisions.find((revision) => revision.id === detail.estimate.currentRevisionId) ?? null,
    [detail],
  );
  const currentLines = useMemo(
    () => detail?.lines.filter((line) => line.revisionId === currentRevision?.id && line.state === "active") ?? [],
    [currentRevision?.id, detail?.lines],
  );
  const currentProposals = useMemo(
    () => detail?.proposals.filter((proposal) => proposal.id) ?? [], [detail?.proposals],
  );

  async function run(action: () => Promise<void>, failure: string) {
    setWorking(true);
    try { await action(); } catch (error) { notify("error", errorText(error, failure)); } finally { setWorking(false); }
  }

  function createEstimate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      const created = await request<EstimateDetail>("/v1/estimates", { method: "POST", body: JSON.stringify({
        businessScopeOrganizationId: organizationId,
        number: String(form.get("number") ?? ""), name: String(form.get("name") ?? ""),
        customerOrganizationId: String(form.get("customerOrganizationId") ?? ""),
        facilityId: String(form.get("facilityId") ?? ""), opportunityReference: String(form.get("opportunityReference") ?? "") || null,
        scopeStatement: String(form.get("scopeStatement") ?? ""), dueAt: `${String(form.get("dueAt"))}T17:00:00.000Z`,
        originatingTimeZone: String(form.get("originatingTimeZone") ?? "America/Denver"), currency: String(form.get("currency") ?? "USD"),
        basisReferences: split(form.get("basisReferences")), initialRevision: String(form.get("initialRevision") ?? "A"),
        assumptions: split(form.get("assumptions")), exclusions: split(form.get("exclusions")), alternates: split(form.get("alternates")),
        contingencyPercent: String(form.get("contingencyPercent") ?? "0"), escalationPercent: String(form.get("escalationPercent") ?? "0"),
        markupPercent: String(form.get("markupPercent") ?? "0"), taxPercent: String(form.get("taxPercent") ?? "0"),
      }) });
      setEstimates((current) => [...current, created.estimate]);
      setSelectedEstimateId(created.estimate.id); setDetail(created); setStep("build-up");
      notify("success", `${created.estimate.number} created with immutable revision A history.`);
      event.currentTarget.reset();
    }, "Estimate creation failed.");
  }

  function proposeAssembly(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void run(async () => {
      const created = await request<AssemblyRevision>("/v1/estimate-assemblies", { method: "POST", body: JSON.stringify({
        businessScopeOrganizationId: organizationId, code: String(form.get("code")), revision: String(form.get("revision")),
        description: String(form.get("description")), costCode: String(form.get("costCode")), unitCode: String(form.get("unitCode")),
        baseLaborHoursPerUnit: String(form.get("baseLaborHoursPerUnit")), laborRatePerHour: String(form.get("laborRatePerHour")),
        materialUnitCost: String(form.get("materialUnitCost")), equipmentUnitCost: String(form.get("equipmentUnitCost")),
        subcontractUnitCost: String(form.get("subcontractUnitCost")), supersedesRevisionId: String(form.get("supersedesRevisionId")) || null,
      }) });
      setAssemblies((current) => [...current, created]); notify("success", `${created.code} revision ${created.revision} submitted for independent review.`);
    }, "Assembly proposal failed.");
  }

  function proposeFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void run(async () => {
      const created = await request<ProductivityFactorRevision>("/v1/estimate-productivity-factors", { method: "POST", body: JSON.stringify({
        businessScopeOrganizationId: organizationId, code: String(form.get("code")), revision: String(form.get("revision")),
        name: String(form.get("name")), multiplier: String(form.get("multiplier")), sourceReference: String(form.get("sourceReference")),
        justification: String(form.get("justification")), discipline: String(form.get("discipline")), conditionCode: String(form.get("conditionCode")),
        effectiveFrom: `${String(form.get("effectiveFrom"))}T00:00:00.000Z`,
        effectiveTo: form.get("effectiveTo") ? `${String(form.get("effectiveTo"))}T00:00:00.000Z` : null,
        supersedesRevisionId: String(form.get("supersedesRevisionId")) || null,
      }) });
      setFactors((current) => [...current, created]); notify("success", `${created.code} ${created.multiplier} submitted for independent review.`);
    }, "Productivity factor proposal failed.");
  }

  function proposeAuthorityPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void run(async () => {
      const created = await request<AuthorityPolicyRevision>("/v1/estimate-authority-policies", {
        method: "POST", body: JSON.stringify({
          businessScopeOrganizationId: organizationId, currency: String(form.get("currency")),
          revision: String(form.get("revision")), standardEstimateApprovalLimit: String(form.get("standardEstimateApprovalLimit")),
          standardQuoteSelectionLimit: String(form.get("standardQuoteSelectionLimit")),
          standardProposalApprovalLimit: String(form.get("standardProposalApprovalLimit")),
          estimateAboveThresholdQualification: String(form.get("estimateAboveThresholdQualification")),
          quoteAboveThresholdQualification: String(form.get("quoteAboveThresholdQualification")),
          proposalAboveThresholdQualification: String(form.get("proposalAboveThresholdQualification")),
          supersedesRevisionId: String(form.get("supersedesRevisionId")) || null,
        }),
      });
      setAuthorityPolicies((current) => [...current, created]);
      notify("success", `${created.currency} authority policy revision ${created.revision} submitted for independent review.`);
    }, "Authority policy proposal failed.");
  }

  function reviewCatalog(kind: "assembly" | "factor" | "policy", id: string, version: number, decision: "approve" | "reject") {
    const route = kind === "assembly" ? "estimate-assemblies"
      : kind === "factor" ? "estimate-productivity-factors" : "estimate-authority-policies";
    void run(async () => {
      await request(`/${`v1/${route}/${id}/review`}`, { method: "POST", body: JSON.stringify({
        expectedVersion: version, decision, reason: decision === "approve" ? "Controlled basis independently verified." : "Basis requires correction.",
      }) });
      const label = kind === "assembly" ? "Assembly" : kind === "factor" ? "Factor" : "Authority policy";
      await refresh(); notify("success", `${label} ${decision} decision recorded.`);
    }, `${kind} review failed.`);
  }

  function addLine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!currentRevision) return; const form = new FormData(event.currentTarget);
    const assemblyRevisionId = String(form.get("assemblyRevisionId") ?? "") || null;
    void run(async () => {
      await request(`/v1/estimate-revisions/${currentRevision.id}/lines`, { method: "POST", body: JSON.stringify({
        lineKey: String(form.get("lineKey")) || null, parentLineKey: String(form.get("parentLineKey")) || null,
        sortOrder: Number(form.get("sortOrder")), costCode: assemblyRevisionId ? null : String(form.get("costCode")),
        bidItemCode: String(form.get("bidItemCode")) || null, alternateCode: String(form.get("alternateCode")) || null,
        wbsCode: String(form.get("wbsCode")) || null, workPackageCode: String(form.get("workPackageCode")) || null,
        assemblyRevisionId, description: String(form.get("description")), quantity: String(form.get("quantity")),
        unitCode: assemblyRevisionId ? null : String(form.get("unitCode")),
        baseLaborHoursPerUnit: assemblyRevisionId ? null : String(form.get("baseLaborHoursPerUnit")),
        laborRatePerHour: assemblyRevisionId ? null : String(form.get("laborRatePerHour")),
        materialUnitCost: assemblyRevisionId ? null : String(form.get("materialUnitCost")),
        equipmentUnitCost: assemblyRevisionId ? null : String(form.get("equipmentUnitCost")),
        subcontractUnitCost: assemblyRevisionId ? null : String(form.get("subcontractUnitCost")),
        allowanceCost: String(form.get("allowanceCost")), otherCost: String(form.get("otherCost")),
        productivityFactorRevisionIds: split(form.get("productivityFactorRevisionIds")),
      }) });
      await loadDetail(detail!.estimate.id); notify("success", "Estimate line calculated and added to the draft revision.");
      event.currentTarget.reset();
    }, "Estimate line calculation failed.");
  }

  function submitRevision() {
    if (!currentRevision || !detail) return;
    void run(async () => {
      await request(`/v1/estimate-revisions/${currentRevision.id}/submit`, { method: "POST", body: JSON.stringify({ expectedVersion: currentRevision.version }) });
      await loadDetail(detail.estimate.id); notify("success", `Revision ${currentRevision.revision} submitted as an immutable snapshot.`);
    }, "Revision submission failed.");
  }

  function reviewRevision(decision: "approve" | "reject") {
    if (!currentRevision || !detail) return;
    void run(async () => {
      await request(`/v1/estimate-revisions/${currentRevision.id}/review`, { method: "POST", body: JSON.stringify({
        expectedVersion: currentRevision.version, decision,
        reason: decision === "approve" ? "Scope, basis, pricing, and qualifications independently verified." : "Revision requires correction.",
      }) });
      await loadDetail(detail.estimate.id); notify("success", `Revision ${decision} decision recorded.`);
    }, "Revision review failed.");
  }

  function createSuccessor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!detail || !currentRevision) return; const form = new FormData(event.currentTarget);
    void run(async () => {
      await request(`/v1/estimates/${detail.estimate.id}/revisions`, { method: "POST", body: JSON.stringify({
        expectedEstimateVersion: detail.estimate.version, revision: String(form.get("revision")), revisionReason: String(form.get("revisionReason")),
        assumptions: split(form.get("assumptions")), exclusions: split(form.get("exclusions")), alternates: split(form.get("alternates")),
        contingencyPercent: String(form.get("contingencyPercent")), escalationPercent: String(form.get("escalationPercent")),
        markupPercent: String(form.get("markupPercent")), taxPercent: String(form.get("taxPercent")),
      }) });
      await loadDetail(detail.estimate.id); setStep("build-up"); notify("success", "Controlled successor revision cloned with exact line identity for delta review.");
    }, "Successor revision creation failed.");
  }

  function receiveQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!currentRevision || !detail) return; const form = new FormData(event.currentTarget);
    const lineAmounts = currentLines.map((line) => ({
      bidScopeLineKey: line.lineKey, description: line.description, quantity: line.quantity, unitCode: line.unitCode,
      amount: String(form.get(`amount:${line.lineKey}`) ?? "0"),
    })).filter((line) => line.amount.trim() !== "");
    void run(async () => {
      await request(`/v1/estimate-revisions/${currentRevision.id}/quotes`, { method: "POST", body: JSON.stringify({
        vendorOrganizationId: String(form.get("vendorOrganizationId")), quoteNumber: String(form.get("quoteNumber")),
        sourceFileId: String(form.get("sourceFileId")), sourceSha256: String(form.get("sourceSha256")), currency: detail.estimate.currency,
        validUntil: `${String(form.get("validUntil"))}T23:59:59.000Z`, inclusions: split(form.get("inclusions")),
        exclusions: split(form.get("exclusions")), qualifications: split(form.get("qualifications")),
        freightAmount: String(form.get("freightAmount")), taxAmount: String(form.get("taxAmount")), lines: lineAmounts,
      }) });
      await loadDetail(detail.estimate.id); await compareQuotes(); notify("success", "Vendor quote normalized against the controlled bid scope.");
    }, "Quote normalization failed.");
  }

  async function compareQuotes() {
    if (!currentRevision) return;
    setQuoteComparison(await request<readonly EstimateQuote[]>(`/v1/estimate-revisions/${currentRevision.id}/quote-comparison`));
  }

  function uploadQuoteSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      notify("error", "Select a quote source file.");
      return;
    }
    const payload = new FormData();
    payload.set("file", file);
    void run(async () => {
      const staged = await request<QuoteSourceFile>(
        `/v1/organizations/${encodeURIComponent(organizationId)}/file-uploads`,
        {
          method: "POST",
          headers: {
            "x-eiep-retention-class": "commercial-quote",
            "x-idempotency-key": `quote-${Date.now()}`,
          },
          body: payload,
        },
      );
      setQuoteSource(staged);
      notify("success", "Quote source staged. Normalization remains blocked until validation and independent release complete.");
    }, "Quote source upload failed.");
  }

  function refreshQuoteSource() {
    if (!quoteSource) return;
    void run(async () => {
      const current = await request<QuoteSourceFile>(`/v1/files/${quoteSource.id}`);
      setQuoteSource(current);
      notify("success", `Quote source is ${current.validationState.replaceAll("_", " ")}.`);
    }, "Quote source status check failed.");
  }

  function selectQuote(quote: EstimateQuote) {
    if (!detail) return;
    void run(async () => {
      await request(`/v1/estimate-quotes/${quote.id}/select`, { method: "POST", body: JSON.stringify({
        expectedVersion: quote.version, reason: "Best evaluated complete scope.",
      }) });
      await loadDetail(detail.estimate.id); await compareQuotes(); notify("success", `${quote.quoteNumber} independently selected.`);
    }, "Quote selection failed.");
  }

  function generateProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!currentRevision || !detail) return; const form = new FormData(event.currentTarget);
    void run(async () => {
      await request(`/v1/estimate-revisions/${currentRevision.id}/proposals`, { method: "POST", body: JSON.stringify({
        proposalNumber: String(form.get("proposalNumber")), validUntil: `${String(form.get("validUntil"))}T23:59:59.000Z`,
        commercialTermsReferences: split(form.get("commercialTermsReferences")),
      }) });
      await loadDetail(detail.estimate.id); notify("success", "Proposal manifest generated from the exact approved revision.");
    }, "Proposal generation failed.");
  }

  function proposalAction(proposal: EstimateProposal, action: "approve" | "reject" | "issue") {
    if (!detail) return;
    void run(async () => {
      const path = action === "issue" ? "issue" : "review";
      const body = action === "issue" ? { expectedVersion: proposal.version } : {
        expectedVersion: proposal.version, decision: action, reason: action === "approve" ? "Commercial terms independently approved." : "Commercial correction required.",
      };
      await request(`/v1/estimate-proposals/${proposal.id}/${path}`, { method: "POST", body: JSON.stringify(body) });
      await loadDetail(detail.estimate.id); notify("success", `Proposal ${action} action recorded.`);
    }, `Proposal ${action} failed.`);
  }

  function downloadProposal(proposal: EstimateProposal) {
    void run(async () => {
      await download(`/v1/estimate-proposals/${proposal.id}/download`, proposal.artifactFilename);
      notify("success", `${proposal.proposalNumber} downloaded after server-side scope and hash verification.`);
    }, "Proposal download failed.");
  }

  function handoff(event: FormEvent<HTMLFormElement>, proposal: EstimateProposal) {
    event.preventDefault(); if (!detail) return; const form = new FormData(event.currentTarget);
    void run(async () => {
      await request(`/v1/estimate-proposals/${proposal.id}/handoff`, { method: "POST", body: JSON.stringify({
        projectId: String(form.get("projectId")), authorizationReference: String(form.get("authorizationReference")),
        adjustmentCostCodes: { contingency: "CONTINGENCY", escalation: "ESCALATION", markup: "MARKUP", tax: "TAX" },
      }) });
      await loadDetail(detail.estimate.id); notify("success", "Award handoff reconciled exactly into the project-controls baseline.");
    }, "Award handoff failed.");
  }

  return <section className="workflow estimating-workflow" aria-labelledby="estimating-heading">
    <div className="workflow-heading"><div><p className="section-label">Controlled commercial workflow</p><h2 id="estimating-heading">Advanced estimating</h2>
      <p className="muted">Governed cost basis, exact calculations, quote leveling, revisions, independent decisions, and award handoff.</p></div>
      <button className="secondary-button" type="button" onClick={() => void refresh()} disabled={working}>Refresh estimating</button></div>
    <ol className="workflow-steps estimating-steps">
      {steps.map((item) => <li key={item.key} className={step === item.key ? "is-active" : ""}><button type="button" onClick={() => setStep(item.key)}>
        <span>{item.number}</span><strong>{item.label}</strong><small>{item.description}</small>
      </button></li>)}
    </ol>

    <section className="estimate-summary" aria-label="Estimating summary">
      <article><span>Opportunities</span><strong>{estimates.length}</strong><small>Organization scoped</small></article>
      <article><span>Approved assemblies</span><strong>{assemblies.filter((item) => item.state === "active").length}</strong><small>Version controlled</small></article>
      <article><span>Active factors</span><strong>{factors.filter((item) => item.state === "active").length}</strong><small>Sourced and effective</small></article>
      <article><span>Current sell price</span><strong>{currentRevision ? `${currentRevision.totals.currency} ${currentRevision.totals.finalPrice}` : "—"}</strong><small>{currentRevision ? `Revision ${currentRevision.revision}` : "Select an estimate"}</small></article>
    </section>

    {step === "portfolio" ? <div className="workflow-grid">
      <article className="workflow-card"><h3>Estimate portfolio</h3><div className="estimate-list">
        {estimates.map((estimate) => <button key={estimate.id} type="button" className={estimate.id === selectedEstimateId ? "estimate-row is-selected" : "estimate-row"} onClick={() => {
          setSelectedEstimateId(estimate.id); void run(() => loadDetail(estimate.id), "Estimate load failed.");
        }}><span><strong>{estimate.number}</strong><small>{estimate.name}</small></span><span><b>{estimate.currency}</b><small>{estimate.state.replaceAll("_", " ")}</small></span></button>)}
        {estimates.length === 0 ? <p className="muted">No readable estimates. Create an opportunity or request a bounded estimating assignment.</p> : null}
      </div></article>
      <article className="workflow-card"><h3>Create controlled opportunity</h3><form className="compact-form form-columns" onSubmit={createEstimate}>
        <label>Estimate number<input name="number" placeholder="EST-2026-001" required /></label><label>Estimate name<input name="name" required /></label>
        <label>Customer organization ID<input name="customerOrganizationId" required /></label><label>Facility ID<input name="facilityId" required /></label>
        <label>Opportunity / RFQ reference<input name="opportunityReference" /></label><label>Due date<input name="dueAt" type="date" defaultValue={dateAfter(30)} required /></label>
        <label>Time zone<input name="originatingTimeZone" defaultValue="America/Denver" required /></label><label>Currency<input name="currency" defaultValue="USD" maxLength={3} required /></label>
        <label className="form-span">Scope statement<textarea name="scopeStatement" required /></label><label>Basis references<textarea name="basisReferences" placeholder="Drawing/specification, one per line" required /></label>
        <label>Initial revision<input name="initialRevision" defaultValue="A" required /></label><label>Assumptions<textarea name="assumptions" /></label>
        <label>Exclusions<textarea name="exclusions" /></label><label>Alternates<textarea name="alternates" /></label>
        <label>Contingency %<input name="contingencyPercent" inputMode="decimal" defaultValue="5" required /></label><label>Escalation %<input name="escalationPercent" inputMode="decimal" defaultValue="0" required /></label>
        <label>Markup %<input name="markupPercent" inputMode="decimal" defaultValue="10" required /></label><label>Tax %<input name="taxPercent" inputMode="decimal" defaultValue="0" required /></label>
        <button className="primary-button" disabled={working || !organizationId}>Create draft estimate</button>
      </form></article>
    </div> : null}

    {step === "basis" ? <div className="workflow-grid">
      <article className="workflow-card"><h3>Assembly revisions</h3><form className="compact-form form-columns" onSubmit={proposeAssembly}>
        <label>Assembly code<input name="code" placeholder="PIPE-INSTALL" required /></label><label>Revision<input name="revision" defaultValue="1" required /></label>
        <label className="form-span">Description<input name="description" required /></label><label>Cost code<input name="costCode" required /></label><label>Unit<input name="unitCode" defaultValue="EA" required /></label>
        <label>Base labor hours / unit<input name="baseLaborHoursPerUnit" inputMode="decimal" required /></label><label>Labor rate / hour<input name="laborRatePerHour" inputMode="decimal" required /></label>
        <label>Material / unit<input name="materialUnitCost" inputMode="decimal" defaultValue="0" required /></label><label>Equipment / unit<input name="equipmentUnitCost" inputMode="decimal" defaultValue="0" required /></label>
        <label>Subcontract / unit<input name="subcontractUnitCost" inputMode="decimal" defaultValue="0" required /></label><label>Superseded revision ID<input name="supersedesRevisionId" /></label>
        <button className="primary-button" disabled={working}>Submit assembly revision</button></form>
        <div className="basis-list">{assemblies.map((assembly) => <article key={assembly.id}><div><strong>{assembly.code} · rev {assembly.revision}</strong><small>{assembly.description} · {assembly.baseLaborHoursPerUnit} hr/{assembly.unitCode}</small></div><span className={`state-badge state-${assembly.state}`}>{assembly.state.replaceAll("_", " ")}</span>{assembly.state === "under_review" ? <div className="action-row"><button type="button" onClick={() => reviewCatalog("assembly", assembly.id, assembly.version, "approve")}>Approve</button><button type="button" onClick={() => reviewCatalog("assembly", assembly.id, assembly.version, "reject")}>Reject</button></div> : null}</article>)}</div>
      </article>
      <article className="workflow-card"><h3>Productivity factors</h3><form className="compact-form form-columns" onSubmit={proposeFactor}>
        <label>Factor code<input name="code" placeholder="CONGESTED" required /></label><label>Revision<input name="revision" defaultValue="1" required /></label>
        <label>Name<input name="name" required /></label><label>Multiplier<input name="multiplier" inputMode="decimal" placeholder="1.25" required /></label>
        <label>Discipline<input name="discipline" placeholder="PIPING" required /></label><label>Condition code<input name="conditionCode" placeholder="CONGESTED" required /></label>
        <label>Source reference<input name="sourceReference" required /></label><label>Justification<input name="justification" required /></label>
        <label>Effective from<input name="effectiveFrom" type="date" defaultValue={dateAfter(0)} required /></label><label>Effective to<input name="effectiveTo" type="date" defaultValue={dateAfter(365)} /></label>
        <label>Superseded revision ID<input name="supersedesRevisionId" /></label><button className="primary-button" disabled={working}>Submit factor revision</button></form>
        <div className="basis-list">{factors.map((factor) => <article key={factor.id}><div><strong>{factor.code} · ×{factor.multiplier}</strong><small>{factor.discipline} · {factor.sourceReference}</small></div><span className={`state-badge state-${factor.state}`}>{factor.state.replaceAll("_", " ")}</span>{factor.state === "under_review" ? <div className="action-row"><button type="button" onClick={() => reviewCatalog("factor", factor.id, factor.version, "approve")}>Approve</button><button type="button" onClick={() => reviewCatalog("factor", factor.id, factor.version, "reject")}>Reject</button></div> : null}</article>)}</div>
      </article>
      <article className="workflow-card workflow-card-wide"><h3>Commercial authority thresholds</h3><form className="compact-form form-columns" onSubmit={proposeAuthorityPolicy}><label>Currency<input name="currency" defaultValue="USD" maxLength={3} required /></label><label>Revision<input name="revision" defaultValue="1" required /></label><label>Standard estimate approval limit<input name="standardEstimateApprovalLimit" inputMode="decimal" required /></label><label>Above-limit estimate qualification<input name="estimateAboveThresholdQualification" defaultValue="EXECUTIVE_ESTIMATE_AUTHORITY" required /></label><label>Standard quote selection limit<input name="standardQuoteSelectionLimit" inputMode="decimal" required /></label><label>Above-limit quote qualification<input name="quoteAboveThresholdQualification" defaultValue="EXECUTIVE_QUOTE_AUTHORITY" required /></label><label>Standard proposal approval limit<input name="standardProposalApprovalLimit" inputMode="decimal" required /></label><label>Above-limit proposal qualification<input name="proposalAboveThresholdQualification" defaultValue="EXECUTIVE_COMMERCIAL_AUTHORITY" required /></label><label>Superseded policy revision ID<input name="supersedesRevisionId" /></label><button className="primary-button" disabled={working}>Submit authority policy</button></form>
        <div className="basis-list">{authorityPolicies.map((policy) => <article key={policy.id}><div><strong>{policy.currency} · rev {policy.revision}</strong><small>Estimate {policy.standardEstimateApprovalLimit} · quote {policy.standardQuoteSelectionLimit} · proposal {policy.standardProposalApprovalLimit}</small></div><span className={`state-badge state-${policy.state}`}>{policy.state.replaceAll("_", " ")}</span>{policy.state === "under_review" ? <div className="action-row"><button type="button" onClick={() => reviewCatalog("policy", policy.id, policy.version, "approve")}>Approve independently</button><button type="button" onClick={() => reviewCatalog("policy", policy.id, policy.version, "reject")}>Reject</button></div> : null}</article>)}</div></article>
    </div> : null}

    {step === "build-up" ? <div className="workflow-grid">
      <article className="workflow-card workflow-card-wide"><h3>Current revision build-up</h3>{detail && currentRevision ? <>
        <div className="revision-bar"><div><strong>{detail.estimate.number} · revision {currentRevision.revision}</strong><small>{currentRevision.revisionReason} · v{currentRevision.version}</small></div><span className={`state-badge state-${currentRevision.state}`}>{currentRevision.state.replaceAll("_", " ")}</span></div>
        <div className="cost-table" role="region" aria-label="Estimate line calculations" tabIndex={0}><table><thead><tr><th>Line</th><th>Description</th><th>Qty</th><th>Labor hrs</th><th>Labor</th><th>Material</th><th>Equipment</th><th>Subcontract</th><th>Total</th></tr></thead><tbody>{currentLines.map((line) => <tr key={line.id}><td>{line.lineKey}</td><td>{line.description}</td><td>{line.quantity} {line.unitCode}</td><td>{line.calculation.adjustedLaborHours}</td><td>{line.calculation.laborCost}</td><td>{line.calculation.materialCost}</td><td>{line.calculation.equipmentCost}</td><td>{line.calculation.subcontractCost}</td><td><strong>{line.calculation.totalCost}</strong></td></tr>)}</tbody></table></div>
        <div className="totals-grid"><span>Direct <b>{currentRevision.totals.directCost}</b></span><span>Contingency <b>{currentRevision.totals.contingencyAmount}</b></span><span>Escalation <b>{currentRevision.totals.escalationAmount}</b></span><span>Markup <b>{currentRevision.totals.markupAmount}</b></span><span>Tax <b>{currentRevision.totals.taxAmount}</b></span><span className="total-final">Sell price <b>{currentRevision.totals.currency} {currentRevision.totals.finalPrice}</b></span></div>
        <div className="action-row"><button className="primary-button" type="button" onClick={submitRevision} disabled={working || currentRevision.state !== "draft" || currentLines.length === 0}>Submit immutable revision</button><button type="button" onClick={() => reviewRevision("approve")} disabled={working || currentRevision.state !== "under_review"}>Approve independently</button><button type="button" onClick={() => reviewRevision("reject")} disabled={working || currentRevision.state !== "under_review"}>Reject with reason</button></div>
      </> : <p className="muted">Select or create an estimate first.</p>}</article>
      <article className="workflow-card"><h3>Add calculated line</h3><form className="compact-form form-columns" onSubmit={addLine}>
        <label>Line key<input name="lineKey" placeholder="PIPE-001" /></label><label>Parent line key<input name="parentLineKey" /></label><label>Sort order<input name="sortOrder" type="number" defaultValue="10" min="0" required /></label><label>Description<input name="description" required /></label>
        <label>Assembly revision<select name="assemblyRevisionId" defaultValue=""><option value="">Direct cost input</option>{assemblies.filter((item) => item.state === "active").map((item) => <option key={item.id} value={item.id}>{item.code} rev {item.revision}</option>)}</select></label><label>Factor revision IDs<textarea name="productivityFactorRevisionIds" placeholder={factors.filter((item) => item.state === "active").map((item) => item.id).join(", ")} /></label>
        <label>Cost code<input name="costCode" defaultValue="PIPING" required /></label><label>Bid item<input name="bidItemCode" defaultValue="BASE" /></label><label>Alternate<input name="alternateCode" /></label><label>WBS code<input name="wbsCode" /></label><label>Work package<input name="workPackageCode" /></label><label>Quantity<input name="quantity" inputMode="decimal" defaultValue="1" required /></label><label>Unit<input name="unitCode" defaultValue="EA" required /></label>
        <label>Base labor hours / unit<input name="baseLaborHoursPerUnit" inputMode="decimal" defaultValue="0" required /></label><label>Labor rate / hour<input name="laborRatePerHour" inputMode="decimal" defaultValue="0" required /></label><label>Material / unit<input name="materialUnitCost" inputMode="decimal" defaultValue="0" required /></label><label>Equipment / unit<input name="equipmentUnitCost" inputMode="decimal" defaultValue="0" required /></label><label>Subcontract / unit<input name="subcontractUnitCost" inputMode="decimal" defaultValue="0" required /></label><label>Allowance<input name="allowanceCost" inputMode="decimal" defaultValue="0" required /></label><label>Other cost<input name="otherCost" inputMode="decimal" defaultValue="0" required /></label>
        <button className="primary-button" disabled={working || currentRevision?.state !== "draft"}>Calculate and add line</button></form></article>
      <article className="workflow-card"><h3>Create successor revision</h3><form className="compact-form form-columns" onSubmit={createSuccessor}><label>New revision<input name="revision" placeholder="B" required /></label><label>Revision reason<input name="revisionReason" required /></label><label>Assumptions<textarea name="assumptions" /></label><label>Exclusions<textarea name="exclusions" /></label><label>Alternates<textarea name="alternates" /></label><label>Contingency %<input name="contingencyPercent" defaultValue="5" required /></label><label>Escalation %<input name="escalationPercent" defaultValue="0" required /></label><label>Markup %<input name="markupPercent" defaultValue="10" required /></label><label>Tax %<input name="taxPercent" defaultValue="0" required /></label><button className="secondary-button" disabled={working || !currentRevision || !["approved", "rejected"].includes(currentRevision.state)}>Clone controlled revision</button></form>
        {detail ? <ol className="revision-history">{[...detail.revisions].reverse().map((revision) => <li key={revision.id}><strong>Rev {revision.revision}</strong><span>{revision.state.replaceAll("_", " ")} · v{revision.version}</span><small>{revision.reviewReason ?? revision.revisionReason}</small></li>)}</ol> : null}</article>
    </div> : null}

    {step === "quotes" ? <div className="workflow-grid">
      <article className="workflow-card"><h3>Governed quote source</h3><form className="compact-form" onSubmit={uploadQuoteSource}><label>Vendor quote file<input name="file" type="file" accept="application/pdf,image/jpeg,image/png,text/csv,application/json" required /></label><button className="primary-button" disabled={working || !organizationId}>Stage organization file</button></form>
        {quoteSource ? <div className="record-outcome"><strong>{quoteSource.originalFilename}</strong><span>{quoteSource.validationState.replaceAll("_", " ")} · {quoteSource.sha256}</span><button className="secondary-button" type="button" onClick={refreshQuoteSource}>Check validation/release</button></div> : <p className="record-note">Bytes enter private staging, are hash-checked and scanned, then require an independent release before quote normalization.</p>}</article>
      <article className="workflow-card"><h3>Normalize vendor quote</h3><form className="compact-form form-columns" onSubmit={receiveQuote}><label>Vendor organization ID<input name="vendorOrganizationId" required /></label><label>Quote number<input name="quoteNumber" required /></label><label>Governed source file ID<input name="sourceFileId" value={quoteSource?.id ?? ""} readOnly required /></label><label>Source SHA-256<input name="sourceSha256" value={quoteSource?.sha256 ?? ""} readOnly pattern="[0-9a-f]{64}" required /></label><label>Valid until<input name="validUntil" type="date" defaultValue={dateAfter(30)} required /></label><label>Freight<input name="freightAmount" defaultValue="0" required /></label><label>Tax<input name="taxAmount" defaultValue="0" required /></label><label>Inclusions<textarea name="inclusions" /></label><label>Exclusions<textarea name="exclusions" /></label><label>Qualifications<textarea name="qualifications" /></label>{currentLines.map((line) => <label key={line.id}>Amount · {line.lineKey}<input name={`amount:${line.lineKey}`} inputMode="decimal" required /></label>)}<button className="primary-button" disabled={working || quoteSource?.validationState !== "released" || currentRevision?.state !== "draft" || currentLines.length === 0}>Normalize quote</button></form></article>
      <article className="workflow-card workflow-card-wide"><div className="panel-heading"><h3>Quote comparison</h3><button className="secondary-button" type="button" onClick={() => void run(compareQuotes, "Quote comparison failed.")} disabled={working || !currentRevision}>Compare</button></div><div className="quote-grid">{quoteComparison.map((quote) => <article key={quote.id}><div><strong>{quote.quoteNumber}</strong><small>{quote.vendorOrganizationId}</small></div><b>{quote.currency} {quote.normalizedTotal}</b><span className={`state-badge state-${quote.state}`}>{quote.state.replaceAll("_", " ")}</span><small>{quote.unresolvedScopeLineKeys.length ? `${quote.unresolvedScopeLineKeys.length} scope gap(s)` : "Complete mapped scope"}</small><button type="button" onClick={() => selectQuote(quote)} disabled={working || quote.state !== "normalized" || quote.unresolvedScopeLineKeys.length > 0}>Select independently</button></article>)}{quoteComparison.length === 0 ? <p className="muted">Normalize at least one quote, then compare scope, price, validity, exclusions, and qualifications.</p> : null}</div></article>
    </div> : null}

    {step === "proposal" ? <div className="workflow-grid">
      <article className="workflow-card"><h3>Generate proposal manifest</h3><form className="compact-form" onSubmit={generateProposal}><label>Proposal number<input name="proposalNumber" placeholder="PROP-2026-001" required /></label><label>Valid until<input name="validUntil" type="date" defaultValue={dateAfter(30)} required /></label><label>Commercial terms references<textarea name="commercialTermsReferences" required /></label><button className="primary-button" disabled={working || currentRevision?.state !== "approved"}>Generate from approved revision</button></form></article>
      <article className="workflow-card"><h3>Approval, issue, and award handoff</h3><div className="proposal-list">{currentProposals.map((proposal) => <article key={proposal.id}><div className="revision-bar"><div><strong>{proposal.proposalNumber}</strong><small>{proposal.currency} {proposal.totalPrice} · valid {proposal.validUntil.slice(0, 10)}</small></div><span className={`state-badge state-${proposal.state}`}>{proposal.state}</span></div><dl className="hash-list"><div><dt>Source</dt><dd>{proposal.sourceCanonicalSha256}</dd></div><div><dt>Artifact</dt><dd>{proposal.artifactSha256}</dd></div><div><dt>Manifest</dt><dd>{proposal.artifactManifestSha256}</dd></div></dl><div className="action-row"><button type="button" onClick={() => proposalAction(proposal, "approve")} disabled={proposal.state !== "draft"}>Approve independently</button><button type="button" onClick={() => proposalAction(proposal, "reject")} disabled={proposal.state !== "draft"}>Reject</button><button type="button" onClick={() => proposalAction(proposal, "issue")} disabled={proposal.state !== "approved"}>Issue</button><button type="button" onClick={() => downloadProposal(proposal)} disabled={proposal.state !== "approved" && proposal.state !== "issued"}>Download controlled HTML</button></div>{proposal.state === "issued" ? <form className="compact-form" onSubmit={(event) => handoff(event, proposal)}><label>Award project<select name="projectId" required defaultValue=""><option value="" disabled>Select same-organization project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.number} · {project.name}</option>)}</select></label><label>Award authorization reference<input name="authorizationReference" required /></label><button className="primary-button">Reconcile and hand off</button></form> : null}</article>)}{currentProposals.length === 0 ? <p className="muted">An approved estimate revision can generate a source-hashed proposal for independent commercial approval.</p> : null}</div>
        {detail?.handoffs.map((item) => <p className="record-outcome" key={item.id}><strong>Handoff reconciled to {item.projectId}</strong><span>{item.mappedTotal} mapped · difference {item.reconciliationDifference}</span></p>)}</article>
    </div> : null}
  </section>;
}
