import { type FormEvent, useCallback, useEffect, useState } from "react";

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
interface Props { readonly projectId: string; readonly projectNumber: string; readonly request: Request;
  readonly working: boolean; readonly setWorking: (working: boolean) => void; readonly notify: Notify; }

const emptySnapshot: Snapshot = { imports: [], items: [], reconciliations: [], outbound: { enabled: false, provider: "bluebeam", blockers: [] } };
const display = (value: string) => value.replaceAll("_", " ");
const errorText = (error: unknown) => error instanceof Error ? error.message : "The collaboration action failed.";
function parseArray(value: FormDataEntryValue | null, label: string): readonly Record<string, unknown>[] {
  const parsed = JSON.parse(String(value ?? "[]")) as unknown;
  if (!Array.isArray(parsed)) throw new Error(`${label} must be a JSON array.`);
  return parsed as readonly Record<string, unknown>[];
}

export function DocumentCollaborationWorkspace({ projectId, projectNumber, request, working, setWorking, notify }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setWorking(true);
    try { setSnapshot(await request<Snapshot>(`/v1/projects/${projectId}/collaboration`)); }
    catch (error) { notify("error", errorText(error)); }
    finally { if (!quiet) setWorking(false); }
  }, [notify, projectId, request, setWorking]);
  useEffect(() => { void refresh(true); }, [refresh]);

  async function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setWorking(true);
    try {
      const documentMappings = parseArray(form.get("documentMappings"), "Document mappings");
      const authorMappings = parseArray(form.get("authorMappings"), "Author mappings");
      const statusMappings = parseArray(form.get("statusMappings"), "Status mappings");
      const rawItems = parseArray(form.get("items"), "Source items");
      const created = await request<ImportRecord>(`/v1/projects/${projectId}/collaboration-imports/preview`, {
        method: "POST", body: JSON.stringify({ provider: "bluebeam_export", providerProduct: String(form.get("providerProduct") ?? ""),
          providerProjectId: String(form.get("providerProjectId") ?? ""), providerSessionId: String(form.get("providerSessionId") ?? ""),
          sourceFileId: String(form.get("sourceFileId") ?? ""), sourceVersion: String(form.get("sourceVersion") ?? ""),
          sourceSha256: String(form.get("sourceSha256") ?? ""), schemaVersion: 1,
          mappingVersion: String(form.get("mappingVersion") ?? ""), idempotencyKey: String(form.get("idempotencyKey") ?? ""),
          documentMappings, authorMappings, statusMappings, items: rawItems }),
      });
      notify(created.state === "previewed" ? "success" : "error", created.state === "previewed"
        ? `Preview ${created.id} is valid and ready for independent commit.`
        : `Preview retained ${created.previewIssues.length} issue(s) for reconciliation.`);
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
      <article className="workflow-card workflow-card-wide"><h3>01 · Preview protected Bluebeam export</h3>
        <form className="compact-form form-columns" onSubmit={(event) => void preview(event)}>
          <label>Provider product<input name="providerProduct" defaultValue="Bluebeam Revu Studio export" required /></label>
          <label>Provider project ID<input name="providerProjectId" required /></label>
          <label>Provider session ID<input name="providerSessionId" required /></label>
          <label>Source version<input name="sourceVersion" placeholder="2026-07-21T17:30Z" required /></label>
          <label>Released source file ID<input name="sourceFileId" required /></label>
          <label>Exact source SHA-256<input name="sourceSha256" minLength={64} maxLength={64} required /></label>
          <label>Mapping version<input name="mappingVersion" defaultValue="mapping-1" required /></label>
          <label>Idempotency key<input name="idempotencyKey" required /></label>
          <label className="form-span">Document mappings JSON<textarea name="documentMappings" rows={3} defaultValue={'[{"providerDocumentId":"BB-DOC-1","documentRevisionId":"released-revision-id"}]'} required /></label>
          <label className="form-span">Author mappings JSON<textarea name="authorMappings" rows={3} defaultValue={'[{"providerAuthorId":"BB-USER-1","userAccountId":"active-user-id","organizationId":"org-epv"}]'} required /></label>
          <label className="form-span">Status mappings JSON<textarea name="statusMappings" rows={3} defaultValue={'[{"providerStatusCode":"Accepted","evidenceStatus":"closed_claim"}]'} required /></label>
          <label className="form-span">Markup, comment, reply, and status items JSON<textarea name="items" rows={8} defaultValue={'[{"providerItemId":"BB-MARKUP-1","providerDocumentId":"BB-DOC-1","parentProviderItemId":null,"itemType":"markup","pageNumber":1,"region":{"x":"0.1","y":"0.1","width":"0.2","height":"0.1","units":"normalized"},"authorProviderId":"BB-USER-1","providerStatusCode":"Accepted","subject":"Review note","body":"Controlled markup content","appearance":"cloud:red","createdAt":"2026-07-21T16:00:00.000Z","updatedAt":"2026-07-21T16:30:00.000Z","unsupportedContentCodes":[]}'} required /></label>
          <button className="primary-button" type="submit" disabled={working}>Validate and preview</button>
        </form></article>

      <article className="workflow-card"><h3>02 · Preview and commit register</h3><div className="basis-list">
        {snapshot.imports.map((record) => <article key={record.id}><div><strong>{record.providerSessionId}</strong>
          <small>{record.providerProjectId} · {record.sourceVersion} · {record.previewedBy}</small></div>
          <span className={`state-badge state-${record.state}`}>{display(record.state)}</span>
          <small>{record.sourceSha256.slice(0, 16)}… · {record.previewIssues.length} issue(s) · {record.committedItemIds.length} committed</small>
          {record.state === "previewed" ? <button className="primary-button" type="button" disabled={working} onClick={() => void commit(record)}>Commit with independent authority</button> : null}
        </article>)}{snapshot.imports.length === 0 ? <p className="muted">No collaboration package has been previewed.</p> : null}</div></article>

      <article className="workflow-card"><h3>03 · Reconciliation</h3><div className="basis-list">
        {snapshot.reconciliations.map((record) => <article key={record.id}><div><strong>{display(record.code)}</strong>
          <small>{record.sourceObjectId ?? "package"} · {record.field ?? "general"}</small></div>
          <span className={`state-badge state-${record.state}`}>{display(record.state)}</span><small>{record.detail}</small>
          {record.state === "open" ? <div className="action-row"><button type="button" onClick={() => void resolve(record, "resolved")} disabled={working}>Resolve</button><button type="button" onClick={() => void resolve(record, "waived")} disabled={working}>Waive with authority</button></div> : null}
        </article>)}{snapshot.reconciliations.length === 0 ? <p className="muted">No reconciliation issues.</p> : null}</div></article>

      <article className="workflow-card workflow-card-wide"><h3>04 · Imported collaboration evidence</h3><div className="cost-table"><table><thead><tr><th>Provider item</th><th>Type</th><th>Document revision</th><th>Page</th><th>Author</th><th>Provider status</th><th>Evidence status</th><th>Review</th></tr></thead><tbody>
        {snapshot.items.map((item) => <tr key={item.id}><td>{item.providerItemId}<br /><small>{item.subject}</small></td><td>{display(item.itemType)}</td><td>{item.documentRevisionId}</td><td>{item.pageNumber}</td><td>{item.authorUserId}</td><td>{item.providerStatusCode}</td><td>{display(item.evidenceStatus)}</td><td>{item.state === "submitted" ? <span className="action-row"><button type="button" onClick={() => void review(item, "accept")} disabled={working}>Accept evidence</button><button type="button" onClick={() => void review(item, "reject")} disabled={working}>Reject</button></span> : display(item.state)}</td></tr>)}
        {snapshot.items.length === 0 ? <tr><td colSpan={8}>No collaboration evidence committed.</td></tr> : null}</tbody></table></div></article>

      <article className="workflow-card workflow-card-wide critical-action"><h3>Outbound/write boundary</h3>
        <p>No live Bluebeam write action is exposed. This boundary stays closed until contract, tenant ownership, sandbox behavior, least privilege, retry/rate handling, retention, and vendor terms are independently accepted.</p>
        <ul>{snapshot.outbound.blockers.map((blocker) => <li key={blocker}>{display(blocker)}</li>)}</ul></article>
    </div>
  </section>;
}
