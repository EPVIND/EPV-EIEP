import { type FormEvent, useEffect, useState } from "react";

interface SetupRecord {
  readonly id: string;
  readonly state: string;
  readonly version: number;
  readonly code?: string;
  readonly name?: string;
  readonly organizationId?: string;
  readonly participationRole?: string;
  readonly responsibilityType?: string;
  readonly targetType?: string;
  readonly targetId?: string;
}

interface ConfigurationRecord extends SetupRecord {
  readonly configurationCode: string;
  readonly revision: string;
}

interface ProjectSetupProps {
  readonly projectId: string;
  readonly projectNumber: string;
  readonly request: <T>(path: string, init?: RequestInit) => Promise<T>;
  readonly working: boolean;
  readonly setWorking: (working: boolean) => void;
  readonly notify: (tone: "success" | "error", text: string) => void;
  readonly onChanged: () => void;
}

function value(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

function ids(raw: string): string[] {
  return raw.split(/[\s,]+/u).map((item) => item.trim()).filter(Boolean);
}

function configurationSettings(raw: string): Readonly<Record<string, string | number | boolean>> {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Configuration settings must be a JSON object.");
  }
  const entries = Object.entries(parsed);
  if (entries.length === 0 || entries.some(([, entry]) => !["string", "number", "boolean"].includes(typeof entry))) {
    throw new Error("Configuration settings require at least one string, number, or boolean value.");
  }
  return Object.fromEntries(entries) as Readonly<Record<string, string | number | boolean>>;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ProjectSetup({
  projectId, projectNumber, request, working, setWorking, notify, onChanged,
}: ProjectSetupProps) {
  const [organizations, setOrganizations] = useState<readonly SetupRecord[]>([]);
  const [structure, setStructure] = useState<readonly SetupRecord[]>([]);
  const [responsibilities, setResponsibilities] = useState<readonly SetupRecord[]>([]);
  const [configuration, setConfiguration] = useState<ConfigurationRecord | null>(null);

  useEffect(() => {
    setOrganizations([]); setStructure([]); setResponsibilities([]); setConfiguration(null);
  }, [projectId]);

  async function execute<T>(description: string, action: () => Promise<T>, apply: (result: T) => void) {
    setWorking(true);
    try {
      const result = await action();
      apply(result);
      onChanged();
      notify("success", description);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : `${description} failed.`);
    } finally {
      setWorking(false);
    }
  }

  function addOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void execute("Participant organization added to the project.", () => request<SetupRecord>(
      `/v1/projects/${projectId}/organizations`, {
        method: "POST",
        body: JSON.stringify({
          organizationId: value(form, "organizationId"), participationRole: value(form, "participationRole"),
        }),
      },
    ), (record) => setOrganizations((current) => [...current, record]));
  }

  function addStructure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void execute("Project structure element created.", () => request<SetupRecord>(
      `/v1/projects/${projectId}/structure`, {
        method: "POST",
        body: JSON.stringify({
          type: value(form, "type"), parentId: value(form, "parentId") || null,
          code: value(form, "code"), name: value(form, "name"),
        }),
      },
    ), (record) => setStructure((current) => [...current, record]));
  }

  function assignResponsibility(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const targetType = value(form, "targetType");
    void execute("Effective project responsibility assigned.", () => request<SetupRecord>(
      `/v1/projects/${projectId}/responsibilities`, {
        method: "POST",
        body: JSON.stringify({
          targetType, targetId: targetType === "project" ? projectId : value(form, "targetId"),
          responsibilityType: value(form, "responsibilityType"), organizationId: value(form, "organizationId"),
          personId: value(form, "personId") || null, effectiveFrom: value(form, "effectiveFrom"),
          effectiveTo: value(form, "effectiveTo") || null,
        }),
      },
    ), (record) => setResponsibilities((current) => [...current, record]));
  }

  function submitConfiguration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void execute("Project configuration submitted for independent approval.", async () => {
      const settings = configurationSettings(value(form, "settings"));
      return request<ConfigurationRecord>(`/v1/projects/${projectId}/configurations`, {
        method: "POST",
        body: JSON.stringify({
          configurationCode: value(form, "configurationCode"), revision: value(form, "revision"), settings,
          governingDocumentRevisionIds: ids(value(form, "governingDocumentRevisionIds")),
          effectiveFrom: value(form, "effectiveFrom"),
        }),
      });
    }, setConfiguration);
  }

  function approveConfiguration() {
    if (!configuration) return;
    void execute("Configuration independently approved and activated.", () => request<ConfigurationRecord>(
      `/v1/project-configurations/${configuration.id}/approve`, {
        method: "POST", body: JSON.stringify({ expectedVersion: configuration.version }),
      },
    ), setConfiguration);
  }

  return <section className="workflow" aria-labelledby="project-setup-heading">
    <div className="workflow-heading"><div><p className="section-label">Activation evidence</p>
      <h2 id="project-setup-heading">Controlled project setup - {projectNumber}</h2></div>
      <span className="policy-chip">MFA · independent approval</span>
    </div>
    <p className="muted">Create the authoritative organizations, structure, effective responsibilities, and released-governing-document configuration used by the activation gate.</p>
    <div className="workflow-grid">
      <article className="workflow-card"><p className="section-label">Participation</p><h3>Project organization</h3>
        <form className="compact-form" onSubmit={addOrganization}>
          <label>Participant organization ID<input name="organizationId" required /></label>
          <label>Participation role<select name="participationRole"><option value="customer">Customer</option><option value="supplier">Supplier</option><option value="subcontractor">Subcontractor</option><option value="inspector">Inspector</option><option value="business_scope">Business scope</option><option value="other">Other</option></select></label>
          <button className="primary-button" disabled={working}>Add participant</button>
        </form>
        {organizations.map((record) => <p className="record-note" key={record.id}><strong>{record.organizationId}</strong> · {record.participationRole} · {record.id}</p>)}
      </article>

      <article className="workflow-card"><p className="section-label">Breakdown</p><h3>System, area, WBS, or work package</h3>
        <form className="compact-form" onSubmit={addStructure}>
          <label>Structure type<select name="type"><option value="system">System</option><option value="area">Area</option><option value="wbs">WBS</option><option value="work_package">Work package</option></select></label>
          <label>Parent structure ID<input name="parentId" placeholder="Required for a work package; optional for WBS" list="project-structure-ids" /></label>
          <datalist id="project-structure-ids">{structure.map((record) => <option key={record.id} value={record.id}>{record.code}</option>)}</datalist>
          <label>Structure code<input name="code" required /></label><label>Structure name<input name="name" required /></label>
          <button className="primary-button" disabled={working}>Create structure</button>
        </form>
        {structure.map((record) => <p className="record-note" key={record.id}><strong>{record.code}</strong> · {record.name} · {record.id}</p>)}
      </article>

      <article className="workflow-card"><p className="section-label">Accountability</p><h3>Effective responsibility</h3>
        <form className="compact-form" onSubmit={assignResponsibility}>
          <label>Responsibility target<select name="targetType"><option value="project">Project</option><option value="system">System</option><option value="area">Area</option><option value="wbs">WBS</option><option value="work_package">Work package</option></select></label>
          <label>Target structure ID<input name="targetId" placeholder={`Leave blank for project ${projectNumber}`} list="project-structure-ids" /></label>
          <label>Responsibility type<input name="responsibilityType" placeholder="project_manager" required /></label>
          <label>Responsible organization ID<input name="organizationId" required /></label>
          <label>Responsible person ID<input name="personId" placeholder="Optional named person" /></label>
          <label>Effective from<input name="effectiveFrom" type="date" defaultValue={today()} required /></label>
          <label>Effective to<input name="effectiveTo" type="date" /></label>
          <button className="primary-button" disabled={working}>Assign responsibility</button>
        </form>
        {responsibilities.map((record) => <p className="record-note" key={record.id}><strong>{record.responsibilityType}</strong> · {record.targetType} {record.targetId} · {record.id}</p>)}
      </article>

      <article className="workflow-card"><p className="section-label">Configuration</p><h3>Versioned governed settings</h3>
        <form className="compact-form" onSubmit={submitConfiguration}>
          <label>Configuration code<input name="configurationCode" placeholder="PROJECT_BASELINE" required /></label>
          <label>Revision<input name="revision" placeholder="A" required /></label>
          <label>Settings JSON<textarea name="settings" defaultValue={'{\n  "inspectionPlanRequired": true\n}'} required /></label>
          <label>Released governing revision IDs<textarea name="governingDocumentRevisionIds" placeholder="One exact released revision ID per line" required /></label>
          <label>Effective from<input name="effectiveFrom" type="date" defaultValue={today()} required /></label>
          <button className="primary-button" disabled={working}>Submit configuration</button>
        </form>
        {configuration ? <div className="record-note"><strong>{configuration.configurationCode} · {configuration.revision}</strong><br />
          {configuration.state} · {configuration.id}
          <button className="secondary-button" type="button" onClick={approveConfiguration} disabled={working || configuration.state !== "under_review"}>Approve as separate authority</button>
          <small>Switch to a distinct step-up identity holding project-configuration authority before approval.</small>
        </div> : null}
      </article>
    </div>
  </section>;
}
