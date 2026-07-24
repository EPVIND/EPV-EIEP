import { useCallback, useEffect, useState } from "react";
import {
  analyzeBluebeamExport,
  sha256File,
  suggestedEvidenceStatus,
  type BluebeamEvidenceStatus,
  type BluebeamExportAnalysis,
} from "./bluebeam-import.js";

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
type Notify = (tone: "success" | "error", text: string) => void;
interface ImportRecord { readonly id: string; readonly providerProduct: string; readonly providerProjectId: string;
  readonly providerSessionId: string; readonly sourceVersion: string; readonly sourceSha256: string;
  readonly previewIssues: readonly { readonly code: string; readonly sourceObjectId: string | null; readonly detail: string }[];
  readonly committedItemIds: readonly string[]; readonly state: string; readonly version: number; readonly previewedBy: string; }
interface CollaborationItem { readonly id: string; readonly providerItemId: string; readonly providerDocumentId: string;
  readonly documentRevisionId: string; readonly parentItemId: string | null; readonly itemType: string; readonly pageNumber: number;
  readonly authorUserId: string; readonly providerStatusCode: string; readonly evidenceStatus: string;
  readonly subject: string; readonly sourceUpdatedAt: string; readonly state: string; readonly version: number; }
interface Reconciliation { readonly id: string; readonly importId: string; readonly code: string;
  readonly sourceObjectId: string | null; readonly field: string | null; readonly detail: string; readonly state: string; readonly version: number; }
interface Outbound { readonly enabled: false; readonly provider: "bluebeam"; readonly blockers: readonly string[]; }
interface Snapshot { readonly imports: readonly ImportRecord[]; readonly items: readonly CollaborationItem[];
  readonly reconciliations: readonly Reconciliation[]; readonly outbound: Outbound; }
interface GovernedFile { readonly id: string; readonly originalFilename: string; readonly sha256: string;
  readonly detectedSha256: string | null; readonly validationState: string; readonly malwareState: string;
  readonly version: number; }
interface RevisionCandidate { readonly documentId: string; readonly documentNumber: string; readonly documentTitle: string;
  readonly revisionId: string; readonly revision: string; readonly sourceFilename: string; }
interface Props { readonly projectId: string; readonly projectNumber: string; readonly request: Request;
  readonly userId: string; readonly organizationId: string; readonly working: boolean;
  readonly setWorking: (working: boolean) => void; readonly notify: Notify; }

const emptySnapshot: Snapshot = { imports: [], items: [], reconciliations: [], outbound: { enabled: false, provider: "bluebeam", blockers: [] } };
const display = (value: string) => value.replaceAll("_", " ");
const errorText = (error: unknown) => error instanceof Error ? error.message : "The collaboration action failed.";
const statusOptions: readonly BluebeamEvidenceStatus[] = ["open", "resolved_claim", "closed_claim", "unknown"];
const mappingKey = (value: string) => value.toLocaleLowerCase()
  .replace(/\.(pdf|dwg|dxf|tif|tiff)$/u, "")
  .replace(/[^a-z0-9]+/gu, "");

function suggestedRevision(
  providerDocumentId: string,
  candidates: readonly RevisionCandidate[],
): RevisionCandidate | null {
  const sourceKey = mappingKey(providerDocumentId);
  const scored = candidates.map((candidate) => {
    const numberKey = mappingKey(candidate.documentNumber);
    const fileKey = mappingKey(candidate.sourceFilename);
    const titleKey = mappingKey(candidate.documentTitle);
    const score = sourceKey === fileKey || sourceKey === numberKey ? 100
      : numberKey.length >= 4 && sourceKey.includes(numberKey) ? 80
        : sourceKey === titleKey ? 60 : 0;
    return { candidate, score };
  }).filter(({ score }) => score > 0).sort((left, right) => right.score - left.score);
  if (!scored[0] || scored[1]?.score === scored[0].score) return null;
  return scored[0].candidate;
}

export function DocumentCollaborationWorkspace({
  projectId, projectNumber, request, userId, organizationId, working, setWorking, notify,
}: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceHash, setSourceHash] = useState("");
  const [analysis, setAnalysis] = useState<BluebeamExportAnalysis | null>(null);
  const [governedFile, setGovernedFile] = useState<GovernedFile | null>(null);
  const [revisionCandidates, setRevisionCandidates] = useState<readonly RevisionCandidate[]>([]);
  const [providerProjectId, setProviderProjectId] = useState("");
  const [providerSessionId, setProviderSessionId] = useState("");
  const [releasedRevisionIds, setReleasedRevisionIds] = useState<Record<string, string>>({});
  const [authorAccountIds, setAuthorAccountIds] = useState<Record<string, string>>({});
  const [statusMappings, setStatusMappings] = useState<Record<string, BluebeamEvidenceStatus>>({});
  const [idempotencyKey, setIdempotencyKey] = useState(() => `bluebeam-${crypto.randomUUID()}`);
  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setWorking(true);
    try { setSnapshot(await request<Snapshot>(`/v1/projects/${projectId}/collaboration`)); }
    catch (error) { notify("error", errorText(error)); }
    finally { if (!quiet) setWorking(false); }
  }, [notify, projectId, request, setWorking]);
  const refreshRevisionCandidates = useCallback(async () => {
    try {
      setRevisionCandidates(await request<readonly RevisionCandidate[]>(
        `/v1/projects/${projectId}/current-document-revisions`,
      ));
    } catch (error) {
      notify("error", `Released drawing catalog is unavailable: ${errorText(error)}`);
    }
  }, [notify, projectId, request]);
  useEffect(() => {
    void refresh(true);
    void refreshRevisionCandidates();
  }, [refresh, refreshRevisionCandidates]);
  useEffect(() => {
    if (!analysis) return;
    setReleasedRevisionIds((current) => Object.fromEntries(analysis.providerDocumentIds.map((id) => [
      id, current[id] || suggestedRevision(id, revisionCandidates)?.revisionId || "",
    ])));
  }, [analysis, revisionCandidates]);

  async function receiveExport(file: File) {
    setWorking(true);
    try {
      const [nextAnalysis, hash] = await Promise.all([analyzeBluebeamExport(file), sha256File(file)]);
      const payload = new FormData();
      const canonicalMediaType = nextAnalysis.format === "csv" ? "text/csv"
        : nextAnalysis.format === "xml" ? "application/xml" : "application/json";
      const protectedSource = new File([file], file.name, { type: canonicalMediaType, lastModified: file.lastModified });
      payload.append("file", protectedSource, protectedSource.name);
      const staged = await request<GovernedFile>(`/v1/projects/${projectId}/file-uploads`, {
        method: "POST",
        body: payload,
        headers: { "x-eiep-retention-class": "project-record", "x-idempotency-key": idempotencyKey },
      });
      if (staged.sha256 !== hash) throw new Error("The server and browser source hashes do not match.");
      setSourceFile(file);
      setSourceHash(hash);
      setAnalysis(nextAnalysis);
      setGovernedFile(staged);
      setProviderProjectId((current) => current || projectNumber);
      setProviderSessionId((current) => current || file.name.replace(/\.[^.]+$/u, ""));
      setReleasedRevisionIds(Object.fromEntries(nextAnalysis.providerDocumentIds.map((id) => [
        id, suggestedRevision(id, revisionCandidates)?.revisionId ?? "",
      ])));
      setAuthorAccountIds(Object.fromEntries(nextAnalysis.providerAuthorIds.map((id) => [
        id, mappingKey(id) === mappingKey(userId) ? userId : "",
      ])));
      setStatusMappings(Object.fromEntries(nextAnalysis.providerStatusCodes.map((status) => [
        status, suggestedEvidenceStatus(status),
      ])));
      notify("success", `${nextAnalysis.items.length} Bluebeam item(s) received, hashed, and mapped into a controlled preview draft.`);
    } catch (error) {
      setSourceFile(null); setSourceHash(""); setAnalysis(null); setGovernedFile(null);
      notify("error", errorText(error));
    } finally {
      setWorking(false);
    }
  }

  async function refreshSource() {
    if (!governedFile) return;
    setWorking(true);
    try {
      const refreshed = await request<GovernedFile>(`/v1/files/${governedFile.id}`);
      setGovernedFile(refreshed);
      notify("success", `Protected source is ${display(refreshed.validationState)}.`);
    } catch (error) { notify("error", errorText(error)); } finally { setWorking(false); }
  }

  async function releaseSource() {
    if (!governedFile) return;
    setWorking(true);
    try {
      const released = await request<GovernedFile>(`/v1/files/${governedFile.id}/release`, {
        method: "POST", body: JSON.stringify({ expectedVersion: governedFile.version }),
      });
      setGovernedFile(released);
      notify("success", "The validated Bluebeam export is released as the protected reconciliation source.");
    } catch (error) { notify("error", errorText(error)); } finally { setWorking(false); }
  }

  async function preview() {
    if (!analysis || !governedFile) return;
    setWorking(true);
    try {
      const documentMappings = analysis.providerDocumentIds.map((providerDocumentId) => ({
        providerDocumentId, documentRevisionId: releasedRevisionIds[providerDocumentId]?.trim() ?? "",
      }));
      const authorMappings = analysis.providerAuthorIds.map((providerAuthorId) => ({
        providerAuthorId, userAccountId: authorAccountIds[providerAuthorId]?.trim() ?? "", organizationId,
      }));
      const mappings = analysis.providerStatusCodes.map((providerStatusCode) => ({
        providerStatusCode, evidenceStatus: statusMappings[providerStatusCode] ?? "unknown",
      }));
      const created = await request<ImportRecord>(`/v1/projects/${projectId}/collaboration-imports/preview`, {
        method: "POST", body: JSON.stringify({
          provider: "bluebeam_export",
          providerProduct: `Bluebeam Revu Markups List ${analysis.format.toUpperCase()} export`,
          providerProjectId,
          providerSessionId,
          sourceFileId: governedFile.id,
          sourceVersion: analysis.sourceVersion,
          sourceSha256: governedFile.sha256,
          schemaVersion: 1,
          mappingVersion: "automatic-mapping-1",
          idempotencyKey,
          documentMappings,
          authorMappings,
          statusMappings: mappings,
          items: analysis.items,
        }),
      });
      notify(created.state === "previewed" ? "success" : "error", created.state === "previewed"
        ? `Preview ${created.id} is valid and ready for independent commit.`
        : `Preview retained ${created.previewIssues.length} issue(s) for reconciliation.`);
      setIdempotencyKey(`bluebeam-${crypto.randomUUID()}`);
      await refresh(true);
    } catch (error) { notify("error", errorText(error)); } finally { setWorking(false); }
  }

  async function commit(record: ImportRecord) {
    setWorking(true);
    try { await request(`/v1/collaboration-imports/${record.id}/commit`, { method: "POST", body: JSON.stringify({ expectedVersion: record.version }) });
      notify("success", "Collaboration evidence committed atomically; provider status did not change an EIEP approval."); await refresh(true);
    } catch (error) { notify("error", errorText(error)); } finally { setWorking(false); }
  }

  async function review(item: CollaborationItem, decision: "accept" | "reject") {
    const reason = window.prompt(`${decision === "accept" ? "Acceptance" : "Rejection"} reason for ${item.providerItemId}:`)?.trim();
    if (!reason) return; setWorking(true);
    try { await request(`/v1/collaboration-items/${item.id}/review`, { method: "POST",
      body: JSON.stringify({ expectedVersion: item.version, decision, reason }) });
      notify("success", `${item.providerItemId} ${decision}ed as collaboration evidence.`); await refresh(true);
    } catch (error) { notify("error", errorText(error)); } finally { setWorking(false); }
  }

  async function resolve(record: Reconciliation, decision: "resolved" | "waived") {
    const resolution = window.prompt(`${decision === "resolved" ? "Resolution" : "Waiver basis"} for ${record.code}:`)?.trim();
    if (!resolution) return; setWorking(true);
    try { await request(`/v1/collaboration-reconciliations/${record.id}/resolve`, { method: "POST",
      body: JSON.stringify({ expectedVersion: record.version, decision, resolution }) });
      notify("success", `Reconciliation ${record.code} marked ${decision}.`); await refresh(true);
    } catch (error) { notify("error", errorText(error)); } finally { setWorking(false); }
  }

  const documentMappingsComplete = analysis?.providerDocumentIds.every((id) => releasedRevisionIds[id]?.trim()) ?? false;
  const authorMappingsComplete = analysis?.providerAuthorIds.every((id) => authorAccountIds[id]?.trim()) ?? false;
  const automaticallyMappedDocuments = analysis?.providerDocumentIds.filter((id) =>
    suggestedRevision(id, revisionCandidates)?.revisionId === releasedRevisionIds[id]).length ?? 0;
  const sourceReleased = governedFile?.validationState === "released"
    && governedFile.malwareState === "clean"
    && governedFile.detectedSha256 === governedFile.sha256;
  const previewReady = Boolean(analysis && sourceReleased && providerProjectId.trim() && providerSessionId.trim()
    && documentMappingsComplete && authorMappingsComplete);

  return <section className="workflow collaboration-workspace" aria-labelledby="collaboration-heading" data-testid="collaboration-workspace">
    <div className="workflow-heading"><div><p className="section-label">Provider-neutral document collaboration</p>
      <h2 id="collaboration-heading">Bluebeam governed import — {projectNumber}</h2>
      <p>Preview and reconcile a protected export before atomic import. Provider statuses remain evidence; EIEP keeps release and acceptance authority.</p></div>
      <button className="secondary-button" type="button" onClick={() => void refresh()} disabled={working}>Refresh workspace</button></div>
    <div className="estimate-summary" aria-label="Collaboration summary">
      <article><span>Import packages</span><strong>{snapshot.imports.length}</strong><small>Versioned source</small></article>
      <article><span>Evidence items</span><strong>{snapshot.items.length}</strong><small>Markup · comment · reply</small></article>
      <article><span>Open reconciliation</span><strong>{snapshot.reconciliations.filter((item) => item.state === "open").length}</strong><small>Commit blockers visible</small></article>
      <article><span>Outbound adapter</span><strong>Disabled</strong><small>Contract and sandbox gated</small></article>
    </div>
    <div className="workflow-grid">
      <article className="workflow-card workflow-card-wide bluebeam-wizard">
        <div className="wizard-heading"><div><p className="section-label">Automatic reception</p><h3>01 · Receive the Bluebeam Markups List</h3>
          <p>Export the Markups List from Revu as CSV or XML. EIEP hashes the exact file, stages it privately, extracts markup rows, and proposes mappings without sending anything back to Bluebeam.</p></div>
          <span className="policy-chip">CSV · XML · adapter JSON</span></div>
        <label className="upload-dropzone">Bluebeam Markups List export
          <input type="file" accept=".csv,.xml,.json,text/csv,application/xml,text/xml,application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void receiveExport(file);
            }} disabled={working} />
          <span>{sourceFile ? sourceFile.name : "Choose the exported markup summary"}</span>
          <small>The export is treated as controlled evidence; PDF-only summaries require a separate extraction adapter.</small>
        </label>
        {analysis && governedFile ? <div className="wizard-source-summary" aria-live="polite">
          <div><span>Received items</span><strong>{analysis.items.length}</strong><small>{analysis.format.toUpperCase()} parsed locally</small></div>
          <div><span>Documents found</span><strong>{analysis.providerDocumentIds.length}</strong><small>Mapping candidates</small></div>
          <div><span>Authors found</span><strong>{analysis.providerAuthorIds.length}</strong><small>Identity review required</small></div>
          <div><span>Protected source</span><strong>{display(governedFile.validationState)}</strong><small>{sourceHash.slice(0, 16)}…</small></div>
        </div> : null}
        {analysis?.diagnostics.length ? <ul className="wizard-diagnostics">{analysis.diagnostics.map((item) => <li key={item}>{item}</li>)}</ul> : null}
        {governedFile ? <div className="wizard-actions">
          <button type="button" className="secondary-button" onClick={() => void refreshSource()} disabled={working}>Refresh validation</button>
          <button type="button" className="danger-button" onClick={() => void releaseSource()}
            disabled={working || governedFile.validationState !== "validated"}>Release protected source</button>
          <span className={`state-badge state-${governedFile.validationState}`}>{display(governedFile.validationState)}</span>
        </div> : null}
      </article>

      {analysis ? <article className="workflow-card workflow-card-wide bluebeam-wizard">
        <div className="wizard-heading"><div><p className="section-label">Mapping proposal</p><h3>02 · Confirm drawing, author, and status mappings</h3>
          <p>EIEP matched filenames and drawing numbers against the authorized current-for-work register. Confirm exact released revisions and preserve the real markup author; blank or ambiguous mappings remain visible blockers.</p></div>
          <span className={documentMappingsComplete && authorMappingsComplete ? "readiness-chip is-ready" : "readiness-chip has-blockers"}>
            {documentMappingsComplete && authorMappingsComplete ? "Mappings complete" : "Review required"}</span></div>
        <div className="compact-form form-columns wizard-provider-fields">
          <label>Bluebeam project ID<input value={providerProjectId} onChange={(event) => setProviderProjectId(event.target.value)} required /></label>
          <label>Bluebeam session / package ID<input value={providerSessionId} onChange={(event) => setProviderSessionId(event.target.value)} required /></label>
        </div>
        <div className="mapping-sections">
          <section><h4>Drawing revisions</h4><p>{automaticallyMappedDocuments} of {analysis.providerDocumentIds.length} matched automatically against {revisionCandidates.length} authorized released revision(s).</p>
            <div className="mapping-list">{analysis.providerDocumentIds.map((id) => <label key={id}><span>{id}</span>
              <select value={releasedRevisionIds[id] ?? ""} onChange={(event) => setReleasedRevisionIds((current) => ({ ...current, [id]: event.target.value }))}
                aria-label={`Released revision for ${id}`} required>
                <option value="">Select a released EIEP revision</option>
                {revisionCandidates.map((candidate) => <option key={candidate.revisionId} value={candidate.revisionId}>
                  {candidate.documentNumber} · Rev {candidate.revision} · {candidate.documentTitle}
                </option>)}
              </select></label>)}</div></section>
          <section><div className="mapping-section-heading"><div><h4>Bluebeam authors</h4><p>Map provider authors to active EIEP user accounts.</p></div>
            <button type="button" className="text-button" onClick={() => setAuthorAccountIds(Object.fromEntries(
              analysis.providerAuthorIds.map((id) => [id, userId]),
            ))}>Map all to signed-in user</button></div>
            <div className="mapping-list">{analysis.providerAuthorIds.map((id) => <label key={id}><span>{id}</span>
              <input value={authorAccountIds[id] ?? ""} onChange={(event) => setAuthorAccountIds((current) => ({ ...current, [id]: event.target.value }))}
                placeholder="Active EIEP user ID" aria-label={`EIEP user for ${id}`} required /></label>)}</div></section>
          <section><h4>Provider statuses</h4><p>Bluebeam statuses remain evidence claims and never become EIEP approvals.</p>
            <div className="mapping-list">{analysis.providerStatusCodes.map((status) => <label key={status}><span>{status}</span>
              <select value={statusMappings[status] ?? "unknown"} onChange={(event) => setStatusMappings((current) => ({
                ...current, [status]: event.target.value as BluebeamEvidenceStatus,
              }))} aria-label={`Evidence status for ${status}`}>{statusOptions.map((option) => <option key={option} value={option}>{display(option)}</option>)}</select>
            </label>)}</div></section>
        </div>
      </article> : null}

      {analysis ? <article className="workflow-card workflow-card-wide bluebeam-wizard">
        <div className="wizard-heading"><div><p className="section-label">Controlled reconciliation</p><h3>03 · Validate and create the governed preview</h3>
          <p>The server rechecks the released source, SHA-256, project scope, drawing revisions, author accounts, statuses, timestamps, parent relationships, and unsupported content.</p></div>
          <span className={previewReady ? "readiness-chip is-ready" : "readiness-chip has-blockers"}>{previewReady ? "Ready to validate" : "Blocked"}</span></div>
        <div className="wizard-readiness">
          <div className={sourceReleased ? "is-ready" : "has-blockers"}><strong>Protected source</strong><span>{sourceReleased ? "Released, clean, and hash matched" : "Awaiting validation and release"}</span></div>
          <div className={documentMappingsComplete ? "is-ready" : "has-blockers"}><strong>Drawing mappings</strong><span>{documentMappingsComplete ? "Every drawing has a released revision" : "One or more revision IDs are blank"}</span></div>
          <div className={authorMappingsComplete ? "is-ready" : "has-blockers"}><strong>Author mappings</strong><span>{authorMappingsComplete ? "Every provider author is attributed" : "One or more authors are unresolved"}</span></div>
          <div className={providerProjectId.trim() && providerSessionId.trim() ? "is-ready" : "has-blockers"}><strong>Provider identity</strong><span>{providerProjectId.trim() && providerSessionId.trim() ? "Project and session identified" : "Project or session ID is blank"}</span></div>
        </div>
        <button className="primary-button" type="button" disabled={working || !previewReady} onClick={() => void preview()}>Validate and create preview</button>
      </article> : null}

      <article className="workflow-card"><h3>04 · Preview and commit register</h3><div className="basis-list">
        {snapshot.imports.map((record) => <article key={record.id}><div><strong>{record.providerSessionId}</strong>
          <small>{record.providerProjectId} · {record.sourceVersion} · {record.previewedBy}</small></div>
          <span className={`state-badge state-${record.state}`}>{display(record.state)}</span>
          <small>{record.sourceSha256.slice(0, 16)}… · {record.previewIssues.length} issue(s) · {record.committedItemIds.length} committed</small>
          {record.state === "previewed" ? <button className="primary-button" type="button" disabled={working} onClick={() => void commit(record)}>Commit with independent authority</button> : null}
        </article>)}{snapshot.imports.length === 0 ? <p className="muted">No collaboration package has been previewed.</p> : null}</div></article>

      <article className="workflow-card"><h3>05 · Reconciliation</h3><div className="basis-list">
        {snapshot.reconciliations.map((record) => <article key={record.id}><div><strong>{display(record.code)}</strong>
          <small>{record.sourceObjectId ?? "package"} · {record.field ?? "general"}</small></div>
          <span className={`state-badge state-${record.state}`}>{display(record.state)}</span><small>{record.detail}</small>
          {record.state === "open" ? <div className="action-row"><button type="button" onClick={() => void resolve(record, "resolved")} disabled={working}>Resolve</button><button type="button" onClick={() => void resolve(record, "waived")} disabled={working}>Waive with authority</button></div> : null}
        </article>)}{snapshot.reconciliations.length === 0 ? <p className="muted">No reconciliation issues.</p> : null}</div></article>

      <article className="workflow-card workflow-card-wide"><h3>06 · Imported collaboration evidence</h3><div className="cost-table"><table><thead><tr><th>Provider item</th><th>Type</th><th>Document revision</th><th>Page</th><th>Author</th><th>Provider status</th><th>Evidence status</th><th>Review</th></tr></thead><tbody>
        {snapshot.items.map((item) => <tr key={item.id}><td>{item.providerItemId}<br /><small>{item.subject}</small></td><td>{display(item.itemType)}</td><td>{item.documentRevisionId}</td><td>{item.pageNumber}</td><td>{item.authorUserId}</td><td>{item.providerStatusCode}</td><td>{display(item.evidenceStatus)}</td><td>{item.state === "submitted" ? <span className="action-row"><button type="button" onClick={() => void review(item, "accept")} disabled={working}>Accept evidence</button><button type="button" onClick={() => void review(item, "reject")} disabled={working}>Reject</button></span> : display(item.state)}</td></tr>)}
        {snapshot.items.length === 0 ? <tr><td colSpan={8}>No collaboration evidence committed.</td></tr> : null}</tbody></table></div></article>

      <article className="workflow-card workflow-card-wide critical-action"><h3>Outbound/write boundary</h3>
        <p>No live Bluebeam write action is exposed. This boundary stays closed until contract, tenant ownership, sandbox behavior, least privilege, retry/rate handling, retention, and vendor terms are independently accepted.</p>
        <ul>{snapshot.outbound.blockers.map((blocker) => <li key={blocker}>{display(blocker)}</li>)}</ul></article>
    </div>
  </section>;
}
