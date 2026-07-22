import { useEffect, useMemo, useState } from "react";

type ReviewState = "not_started" | "draft" | "validated" | "in_review" | "approved" | "released";

interface DocumentTemplate {
  readonly code: string;
  readonly title: string;
  readonly requirement: string;
  readonly purpose: string;
  readonly fields: readonly string[];
}

interface ReviewEvent {
  readonly action: string;
  readonly occurredAt: string;
}

interface ReviewCopy {
  readonly state: ReviewState;
  readonly values: Readonly<Record<string, string>>;
  readonly events: readonly ReviewEvent[];
}

interface Props {
  readonly moduleKey: string;
  readonly moduleLabel: string;
  readonly requestedDocumentCode?: string;
  readonly requestToken?: number;
}

export interface ReviewDocumentNavigationItem {
  readonly code: string;
  readonly title: string;
}

const template = (
  code: string,
  title: string,
  requirement: string,
  purpose: string,
  fields: readonly string[],
): DocumentTemplate => ({ code, title, requirement, purpose, fields });

const templatesByModule: Readonly<Record<string, readonly DocumentTemplate[]>> = {
  estimating: [
    template("EST-BAS", "Estimate Basis & Revision", "FR-EST-001–005", "Define estimate identity, scope, revision lineage, currency, calculation basis, and productivity sources.", ["Estimate number", "Revision and reason", "Currency and time zone", "Scope, exclusions, and basis"]),
    template("EST-ASM", "Assembly Cost Build-up", "FR-EST-003–005", "Build hierarchical direct cost from controlled quantities, units, labor, productivity, material, equipment, and subcontract inputs.", ["Assembly / cost code", "Quantity and unit", "Labor hours, rate, and factor", "Material, equipment, and subcontract basis"]),
    template("EST-QTE", "Vendor Quote Comparison", "FR-EST-006–007", "Normalize bid coverage, qualifications, freight, tax, currency, gaps, and independent selection.", ["Bid package / invited scope", "Vendor quote references", "Normalized commercial comparison", "Gaps, exclusions, and selection basis"]),
    template("EST-PRP", "Proposal & Award Handoff", "FR-EST-008–010", "Freeze the approved revision, proposal terms, source and artifact hashes, award, and project-control reconciliation.", ["Proposal / award reference", "Price, validity, and terms", "Approved estimate revision", "WBS, budget, and quantity handoff mapping"]),
  ],
  controls: [
    template("PJC-BAS", "Cost & Quantity Baseline", "FR-PJC-001–002", "Map an immutable approved estimate handoff into WBS, control accounts, work packages, budgets, and quantities.", ["Baseline / handoff reference", "WBS and control account", "Budget and quantity", "Source estimate reconciliation"]),
    template("PJC-CHG", "Change Control Request", "FR-PJC-002", "Preserve cause, scope, schedule and cost effect, authority, disposition, and baseline impact.", ["Change number and cause", "Scope and affected records", "Cost and schedule effect", "Approval and implementation basis"]),
    template("PJC-FCT", "Forecast & EAC Update", "FR-PJC-003", "Record actuals, accruals, forecast remaining, estimate at completion, variance, and explanation.", ["Status period / data date", "Actuals and accruals", "Forecast remaining and EAC", "Variance explanation and corrective action"]),
    template("PJC-PRG", "Progress Measurement Record", "FR-PJC-004", "Keep quantity progress evidence distinct from quality acceptance, invoice approval, and physical completion.", ["Work package / quantity item", "Installed and accepted quantity", "Evidence references", "Claim, quality, and invoice distinctions"]),
  ],
  procurement: [
    template("PRC-REQ", "Purchase Requisition", "FR-PRC-001–002", "Define exact released scope, quantities, need dates, requirements, cost mapping, and budget guard.", ["Requisition / package number", "Released scope and document revisions", "Items, quantities, units, and need dates", "Budget and work-package mapping"]),
    template("PRC-BID", "Bid Tabulation & Recommendation", "FR-PRC-001", "Compare offers, commercial and technical gaps, qualifications, currency, and independent recommendation.", ["Bid package and bidders", "Comparative price and currency", "Gaps, exclusions, and qualifications", "Recommendation and authority"]),
    template("PRC-PO", "Purchase Order / Commitment", "FR-PRC-001–002", "Preserve award authority, exact commitment scope, revision, value, and material/service identity.", ["PO / commitment number", "Award and vendor organization", "Committed value and currency", "Revision reason and exact item scope"]),
    template("PRC-EXP", "Expediting & Receiving Status", "FR-PRC-003", "Capture acknowledgements, submittals, fabrication, shipment, evidence, exceptions, and receiving linkage.", ["PO and milestone", "Responsible party and forecast date", "Status evidence / source reference", "Receipt, exception, and recovery action"]),
  ],
  scheduling: [
    template("SCH-LOG", "Activity Logic Register", "FR-SCH-001", "Define stable activities, calendars, WBS, resources, quantities, completion boundaries, relationships, and constraints.", ["Activity ID and description", "Calendar, duration, and time zone", "Predecessors, successors, and constraints", "WBS, work package, quantity, and boundary"]),
    template("SCH-BAS", "Schedule Baseline", "FR-SCH-002", "Submit and independently approve an immutable logic-validated schedule baseline.", ["Baseline revision and data date", "Source schedule / file hash", "Logic and constraint validation", "Approval basis and authority"]),
    template("SCH-UPD", "Schedule Update & Look-ahead", "FR-SCH-002–003", "Record actuals, remaining duration, variance, blockers, and authorized short-interval plan.", ["Update cycle and data date", "Actual and forecast dates", "Variance and reason", "Document, material, inspection, and field constraints"]),
    template("SCH-IMP", "P6 / MS Project Import", "FR-SCH-004", "Preview versioned mappings, external IDs, duplicates, conflicts, and idempotent commit before independent approval.", ["Provider and source file hash", "Mapping version", "Preview issues and reconciliation", "Import and approval decision"]),
  ],
  engineering: [
    template("ENG-REQ", "Requirements Register", "FR-ENG-001–006", "Maintain stable, revisioned requirement identity, ownership, structure, source, validation, and approval.", ["Requirement ID and revision", "Title, discipline, and owner", "System, area, work package, and source links", "Validation findings and disposition"]),
    template("ENG-TAG", "Equipment / Line / Instrument Register", "FR-ENG-001–006", "Control tag identity, attributes, relationships, released documents, revision lineage, and lifecycle state.", ["Register class and tag", "Revision and reason", "System / area / work package", "Controlled attributes and related records"]),
    template("ENG-DEL", "Engineering Deliverables Register", "FR-ENG-001–006", "Track deliverable identity, planned and actual issue, responsible organization, exact source links, and status.", ["Deliverable number and revision", "Discipline and responsible organization", "Planned / forecast / actual issue", "Released document and evidence links"]),
    template("ENG-RVW", "Engineering Revision Review", "FR-ENG-003–005", "Expose deterministic validation and independent submit, reject, approve, and supersede decisions.", ["Register revision and SHA-256", "Validation summary", "Review decision and reason", "Successor / supersession linkage"]),
  ],
  welding: [
    template("WLD-WPS", "WPS / PQR Control Record", "FR-WLD-001", "Bind exact released procedures, applicability ranges, processes, materials, consumables, and independent approval.", ["WPS / PQR number and revision", "Process and material groups", "Thickness, diameter, position, and variables", "Released source and approval basis"]),
    template("WLD-WPQ", "Welder Qualification & Continuity", "FR-WLD-001", "Preserve qualification ranges, effective dates, continuity, governing evidence, and work-time validity.", ["Welder and qualification number", "Process, position, and ranges", "Qualified / valid-through dates", "Continuity and evidence reference"]),
    template("WLD-MAP", "Weld Map / Joint Register", "FR-WLD-002", "Link stable weld identity to structure, material heat, drawing, WPS, examinations, and completion boundary.", ["Weld number and joint design", "Components and heat / lot identity", "Drawing and WPS revisions", "Required NDE, PWHT, and boundary"]),
    template("WLD-EXE", "Weld Execution & Release", "FR-WLD-003", "Append fit-up, preheat, welding, consumable, visual, repair, examination, and independent release history.", ["Weld and repair cycle", "Performer, equipment, and consumables", "Parameters, observations, and evidence", "Readiness blockers and release decision"]),
  ],
  nde: [
    template("NDE-REQ", "NDE Request", "FR-NDE-001", "Define weld/component, repair cycle, method, extent, technique, acceptance reference, due date, and hold/witness context.", ["Request number and weld / component", "Repair cycle, method, and extent", "Technique / procedure and acceptance reference", "Qualification, due date, and witness context"]),
    template("NDE-RPT", "NDE Examination Report", "FR-NDE-002", "Preserve qualified examiner, equipment/media, conditions, indications, result, evidence, revision, and independent review.", ["Report number and revision", "Examiner, qualification, and equipment", "Conditions, indications, and result", "Evidence, repair disposition, and review"]),
    template("PWH-CYC", "PWHT Cycle Record", "FR-PWH-001", "Capture exact procedure, equipment, thermocouples, rates, soak, charts, interruptions, evidence, and acceptance.", ["Cycle number and affected welds", "Procedure and equipment", "Thermocouples, rates, soak, and interruptions", "Chart, result, evidence, and acceptance"]),
    template("NDE-RPR", "Repair / Re-examination Cycle", "FR-WLD-003, FR-NDE-002", "Connect rejected indication, excavation/repair, new cycle request, report, and final disposition without overwriting history.", ["Weld, indication, and repair cycle", "Repair instruction and performer", "Re-examination request and report", "Current-cycle disposition and release impact"]),
  ],
  testing: [
    template("TST-PKG", "Test Boundary Package", "FR-TST-001", "Define completion boundary, drawings, medium, pressure, duration, hazards, permits, isolation, gauges, and witnesses.", ["Package number and test type", "Completion boundary and drawings", "Medium, pressure, duration, and gauges", "Hazards, permits, isolation, and witnesses"]),
    template("TST-RDY", "Test Readiness Checklist", "FR-TST-001–002", "Revalidate exact documents, welds, NDE/PWHT, gauges, NCRs, safety prerequisites, and witness status.", ["Package and readiness version", "Document / weld / examination status", "Gauge and safety prerequisite status", "Open blockers and disposition"]),
    template("TST-RES", "Test Result & Restoration", "FR-TST-001", "Record attributable execution, observations, result, evidence, deficiencies, depressurization, and restoration.", ["Performed date, participants, and witnesses", "Observed parameters and result", "Evidence and deficiencies", "Restoration confirmation"]),
    template("TST-ACC", "Independent Test Acceptance", "FR-TST-001–002", "Keep execution separate from independent acceptance and feed deficiencies, completion, progress, and turnover.", ["Package revision and result", "Readiness revalidation", "Acceptance / rejection reason", "Deficiency and turnover linkage"]),
  ],
  fabrication: [
    template("FAB-ASM", "Assembly / Spool Revision", "FR-FAB-001–003", "Preserve stable assembly identity, parent/reason, model/manual source fingerprint, structure, boundary, and released drawings.", ["Assembly / spool number and revision", "Parent and revision reason", "System, area, work package, and boundary", "Source version / hash and drawing revisions"]),
    template("FAB-BOM", "BOM & Cut List", "FR-FAB-002", "Map exact material items, heat identity, quantities, piece marks, geometry, welds, and inspection points.", ["Assembly revision", "Material items and heat / lot identity", "Piece marks, quantities, units, and geometry", "Weld and inspection links"]),
    template("FAB-TRV", "Shop Traveler", "FR-FAB-004–005", "Release ordered operations with work centers, hours, qualifications, procedures, materials, welds, instructions, and hold points.", ["Traveler number and revision", "Operation sequence and work centers", "Qualifications, procedures, and instructions", "Hold points and execution evidence"]),
    template("FAB-ACC", "Fabrication Completion & Acceptance", "FR-FAB-005–006", "Separate execution completion from independent quality acceptance and expose every release blocker.", ["Assembly and traveler revision", "Execution event summary", "Inspection, weld, material, and NCR status", "Completion and independent acceptance decision"]),
  ],
  cnc: [
    template("CNC-PRF", "Machine Capability Profile", "FR-CNC-001", "Control work-center capability, processes, stock, features, units, coordinates, envelope, and postprocessor identity.", ["Work center and profile revision", "Processes, stock, operations, and features", "Units, coordinates, and dimensional envelope", "Postprocessor, effective dates, and approval"]),
    template("CNC-VAL", "Program Validation Package", "FR-CNC-002–003", "Bind exact released source and normalize stock/operations with explicit blocking validation findings.", ["Program / source revision and SHA-256", "Assembly, traveler, material, and piece mark", "Normalized stock and operations", "Validation findings and dispositions"]),
    template("CNC-REL", "CNC Job Release", "FR-CNC-004", "Independently approve and release the exact normalized artifact for authorized, audited download without machine control.", ["Program version and released hash", "Machine profile and prerequisites", "Technical approval and release authority", "Download authorization and audit reference"]),
    template("CNC-EXE", "Execution & Reconciliation", "FR-CNC-005–006", "Capture operator, work center, exact artifact hash, quantities, evidence, material genealogy, exceptions, and independent reconciliation.", ["Release hash and work center", "Operator, time, result, and quantities", "Produced / remnant genealogy and evidence", "Exceptions and reconciliation decision"]),
  ],
  bluebeam: [
    template("BBM-IMP", "Protected Export Import Package", "FR-BBM-001–003", "Bind provider project/session/source identity, exact released document mapping, source hash, and preview results.", ["Provider project and session", "Source file, version, and SHA-256", "Document, author, and status mappings", "Preview issues and idempotency key"]),
    template("BBM-MRK", "Markup / Comment Evidence", "FR-BBM-002–004", "Preserve page/region, parent thread, author, timestamps, appearance, provider status, and exact document revision.", ["Provider item and document IDs", "Page, region, and parent item", "Author, timestamps, and status", "Subject, content, and appearance"]),
    template("BBM-REC", "Import Reconciliation", "FR-BBM-003", "Resolve unmapped, duplicate, invalid, unsupported, or changed-source issues before atomic commit.", ["Import and issue code", "Source object and field", "Issue detail and evidence", "Resolution / waiver basis"]),
    template("BBM-RVW", "Independent Evidence Review", "FR-BBM-004–005", "Accept or reject collaboration evidence without implying document release or quality/work acceptance; preserve outbound boundary.", ["Evidence item and source revision", "Independent review decision", "Reason and related EIEP records", "Outbound boundary confirmation"]),
  ],
  projects: [
    template("PRJ-CHR", "Project Charter & Scope", "FR-PRJ-001", "Define project/customer/facility identity, dates, time zone, execution scope, governing requirements, and readiness basis.", ["Project number and name", "Customer, facility, and time zone", "Planned dates and execution scope", "Governing requirements and references"]),
    template("PRJ-STR", "Project Structure Register", "FR-PRJ-002", "Control systems, areas, WBS, work packages, completion boundaries, and organizational responsibility.", ["Structure type and code", "Parent structure and description", "Responsible organization", "Effective dates and status"]),
    template("PRJ-RSP", "Responsibility Assignment", "FR-PRJ-002–003", "Assign named, effective, independently approved responsibilities and qualification requirements.", ["Responsibility type and scope", "Assigned user and organization", "Effective / expiry dates", "Qualification and approval basis"]),
    template("PRJ-ACT", "Activation Readiness Review", "FR-PRJ-001–003", "Derive blockers from authoritative organizations, responsibilities, references, configuration, boundaries, and exceptions.", ["Project version", "Readiness calculation timestamp", "Blocking and advisory findings", "Independent activation decision"]),
  ],
  documents: [
    template("DOC-REG", "Controlled Document Register", "FR-DOC-001", "Register number, title, type, discipline, project applicability, source, and current lifecycle state.", ["Document number and title", "Type and discipline", "Project / structure applicability", "Source organization and owner"]),
    template("DOC-REV", "Document Revision & Review", "FR-DOC-001–004", "Bind exact file, revision, hash, review comments, approval, release, rejection, and supersession history.", ["Document and revision", "Released file ID and SHA-256", "Review comments and dispositions", "Approval / release / supersession decision"]),
    template("DOC-TRN", "Document Transmittal", "FR-DOC-003", "Control recipient scope, exact revisions, purpose, issue timestamp, distribution, and acknowledgements.", ["Transmittal number and purpose", "Recipient organizations / users", "Exact document revisions", "Distribution and acknowledgement status"]),
    template("DOC-CFW", "Current-for-Work Verification", "FR-DOC-002–004", "Reauthorize exact current released revision at point of use and expose superseded or unavailable status.", ["Document number", "Requested revision / work context", "Current released revision and hash", "Verification result and audit reference"]),
  ],
  materials: [
    template("MAT-RCV", "Material Receipt Report", "FR-MAT-001–002", "Capture purchase/vendor context, specification, dimensions, quantity, heat/lot, MTR, evidence, and storage status.", ["Receipt / receiving number", "PO, vendor, and item reference", "Specification, grade, dimensions, and quantity", "Heat / lot, MTR, evidence, and storage location"]),
    template("MAT-MTR", "MTR Compliance Review", "FR-MAT-001, FR-MAT-005", "Compare exact released MTR identity and required chemistry/mechanical evidence to project-configured requirements.", ["Material item and heat / lot", "MTR document revision and hash", "Specification / grade comparison", "Findings, disposition, and reviewer"]),
    template("MAT-PMI", "PMI Examination Record", "FR-MAT-005, FR-PMI-001–003", "Record instrument validity, spot/location, observed elements, evidence, result, and independent acceptance.", ["Material item and examination location", "Instrument and calibration status", "Observed chemistry / alloy result", "Evidence, disposition, and acceptance"]),
    template("MAT-GEN", "Cut, Remnant & Issue Genealogy", "FR-MAT-002–005", "Preserve parent/child quantities, units, piece marks, dimensions, locations, issue/return, quarantine, and release history.", ["Parent material item", "Child piece / remnant identifiers", "Quantity, dimensions, unit, and location", "Cut, issue, return, hold, and release event"]),
  ],
  quality: [
    template("QLT-ITP", "Inspection & Test Plan", "FR-INS-001–003", "Control characteristics, acceptance references, stages, hold/witness points, qualifications, and required evidence.", ["ITP number and revision", "Scope and acceptance references", "Inspection points and characteristics", "Hold / witness parties and evidence requirements"]),
    template("QLT-INS", "Inspection Record", "FR-INS-001–003", "Capture qualified execution, exact scope, observations, evidence, result, signature meaning, and independent acceptance.", ["Inspection / ITP point", "Inspector, qualification, and equipment", "Observations, measurements, and result", "Evidence and acceptance decision"]),
    template("QLT-NCR", "Nonconformance Report", "FR-NCR-001–004", "Preserve condition, containment, responsibility, cause, disposition, corrective action, approval, reinspection, and closure.", ["NCR number and affected scope", "Condition and immediate containment", "Cause, disposition, and corrective action", "Approvals, reinspection, and closure evidence"]),
    template("QLT-PCH", "Punch Item Record", "FR-PCH-001–003", "Assign category, owner, due date, evidence, independent verification, closure, and completion/turnover effect.", ["Punch number and category", "Location / affected record and description", "Owner, due date, and corrective action", "Evidence, verification, and closure"]),
  ],
  turnover: [
    template("TOV-REQ", "Turnover Requirements Register", "FR-TOV-001–002", "Define package requirements by completion boundary and distinguish missing, submitted, review, rejected, accepted, superseded, and N/A.", ["Package and completion boundary", "Requirement code and source", "Responsible organization and due date", "Current state and accepted record"]),
    template("TOV-RDY", "Completion Readiness Review", "FR-TOV-001–002", "Expose exact missing, rejected, superseded, deficient, or blocked records before package generation.", ["Boundary / package version", "Required versus available records", "Open NCR, punch, test, and document blockers", "Readiness decision and exceptions"]),
    template("TOV-PKG", "Turnover Package Index & Manifest", "FR-TOV-003–004", "Freeze exact accepted source revisions into searchable PDF, JSON, CSV, manifest, hashes, and generation log.", ["Package number and revision", "Included source record manifest", "Artifact and manifest hashes", "Generation metadata and exception log"]),
    template("TOV-HOV", "Handover Review & Acceptance", "FR-TOV-002–004", "Preserve recipient scope, package version, review comments, acceptance evidence, supersession, and preservation history.", ["Package version and recipient", "Review comments and dispositions", "Acceptance / rejection decision", "Regeneration, supersession, and preservation evidence"]),
  ],
  reports: [
    template("RPT-OPS", "Operational Dashboard Definition", "FR-RPT-001–003", "Define permission-scoped metrics, sources, filters, calculation time, status meaning, and drill-through.", ["Dashboard / view name", "Metric and source records", "Scope filters and time basis", "Status rules and drill-through target"]),
    template("RPT-CTL", "Controlled Report Request", "FR-RPT-001–003", "Generate an immutable permission-scoped snapshot with title, sources, revision, status, manifest, and audit.", ["Report type and target", "Project / work-package scope", "As-of timestamp and filters", "Recipient and purpose"]),
    template("RPT-EXP", "Data Export Manifest", "FR-INT-002, FR-RPT-003", "Authorize asynchronous CSV/JSON Lines export with stable IDs, source manifest, recipient reauthorization, and delivery evidence.", ["Export type and requested fields", "Authorized scope and filters", "Recipient and delivery method", "Manifest, hash, and expiry"]),
    template("RPT-AUD", "Report / Export Audit Review", "FR-AUD-001–003", "Review actor, authority, exact sources, output identity, downloads, recipients, and retention disposition.", ["Report / export ID", "Actor, authority, and purpose", "Source and output hashes", "Download, recipient, and retention events"]),
  ],
  integrations: [
    template("INT-IMP", "Controlled Import Job", "FR-INT-001–003", "Validate schema, authorization, source identity, duplicates, project context, preview issues, and idempotency before commit.", ["Adapter and source system", "Source file / message identity and hash", "Schema / mapping version and project scope", "Preview issues and idempotency key"]),
    template("INT-REC", "Integration Reconciliation", "FR-INT-001–003", "Classify validation, mapping, collision, retry, or permanent failure and preserve attributable resolution.", ["Job and issue code", "Source object / field", "Failure detail and classification", "Resolution, waiver, or replay basis"]),
    template("INT-OUT", "Outbound Delivery Record", "FR-INT-002–003", "Reauthorize recipient and payload at send time, preserve outbox lease/retry, response, and audit evidence.", ["Destination and recipient", "Payload type, scope, and hash", "Authorization / delivery attempt", "Response, retry, and final disposition"]),
    template("INT-DLQ", "Dead-Letter Review", "FR-INT-003", "Review exhausted deliveries without silent success and control replay, correction, waiver, or closure.", ["Dead-letter item and attempts", "Last failure and payload identity", "Corrective action and authorization", "Replay / close decision and evidence"]),
  ],
  administration: [
    template("IAM-ACC", "Identity Account Record", "FR-IAM-001–004", "Control account lifecycle, immutable issuer/subject linkage, organization, activation, disablement, and audit.", ["User account and organization", "Identity issuer / subject", "Lifecycle state and assurance", "Provision / activation / disable reason"]),
    template("IAM-ASG", "Role Assignment & Delegation", "FR-IAM-002–004", "Define action, organization, project, work-package, object, qualification, assurance, effective period, and independent grant.", ["User, role, and action scope", "Organization / project / work package", "Qualifications and assurance", "Effective / expiry dates and grant authority"]),
    template("IAM-BRG", "Break-glass Access Review", "FR-IAM-004", "Preserve exceptional authority, reason, bounded scope/time, monitoring, revocation, and independent after-action review.", ["Requester and emergency reason", "Exact elevated scope and duration", "Monitoring and actions performed", "Revocation and independent review"]),
    template("ADM-AUD", "Audit, Retention & Legal Hold", "FR-AUD-001–003", "Control immutable audit review, retention policy, preservation hold, export, and authorized disposition.", ["Record class and scope", "Retention policy and trigger", "Legal hold / preservation status", "Review, export, or disposition authority"]),
  ],
};

export function reviewDocumentNavigation(moduleKey: string): readonly ReviewDocumentNavigationItem[] {
  return (templatesByModule[moduleKey] ?? []).map(({ code, title }) => ({ code, title }));
}

const emptyCopy: ReviewCopy = { state: "not_started", values: {}, events: [] };
const stateLabel = (state: ReviewState) => state.replaceAll("_", " ");
const fieldId = (field: string) => field.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

function readCopies(moduleKey: string): Record<string, ReviewCopy> {
  try {
    return JSON.parse(sessionStorage.getItem(`eiep.review-copies.${moduleKey}`) ?? "{}") as Record<string, ReviewCopy>;
  } catch {
    return {};
  }
}

export function ModuleReviewWorkspace({ moduleKey, moduleLabel, requestedDocumentCode, requestToken }: Props) {
  const templates = templatesByModule[moduleKey] ?? [];
  const [selectedCode, setSelectedCode] = useState(templates[0]?.code ?? "");
  const [copies, setCopies] = useState<Record<string, ReviewCopy>>(() => readCopies(moduleKey));
  const [message, setMessage] = useState("Select a document to inspect its controlled structure or begin a local review copy.");
  const selected = (templates.find((item) => item.code === selectedCode) ?? templates[0])!;
  const copy = selected ? copies[selected.code] ?? emptyCopy : emptyCopy;

  useEffect(() => {
    sessionStorage.setItem(`eiep.review-copies.${moduleKey}`, JSON.stringify(copies));
  }, [copies, moduleKey]);

  useEffect(() => {
    if (requestedDocumentCode && templates.some((item) => item.code === requestedDocumentCode)) {
      setSelectedCode(requestedDocumentCode);
      setMessage(`${templates.find((item) => item.code === requestedDocumentCode)?.title ?? requestedDocumentCode} opened from enterprise navigation.`);
    }
  }, [requestToken, requestedDocumentCode, templates]);

  const completedFields = useMemo(() => selected
    ? selected.fields.filter((field) => copy.values[fieldId(field)]?.trim()).length
    : 0, [copy.values, selected]);

  if (!selected) return null;

  function updateCopy(next: ReviewCopy) {
    setCopies((current) => ({ ...current, [selected.code]: next }));
  }

  function addEvent(state: ReviewState, action: string, values = copy.values) {
    updateCopy({ state, values, events: [...copy.events, { action, occurredAt: new Date().toISOString() }] });
    setMessage(`${selected.title}: ${action}. This remains a browser-session review copy.`);
  }

  function startCopy() {
    addEvent("draft", copy.state === "not_started" ? "Working copy opened" : "New draft revision opened", copy.values);
  }

  function updateValue(field: string, value: string) {
    const values = { ...copy.values, [fieldId(field)]: value };
    updateCopy({ state: copy.state === "not_started" ? "draft" : copy.state, values, events: copy.state === "not_started"
      ? [...copy.events, { action: "Working copy opened", occurredAt: new Date().toISOString() }]
      : copy.events });
  }

  function validate() {
    const missing = selected.fields.filter((field) => !copy.values[fieldId(field)]?.trim());
    if (missing.length) {
      setMessage(`Validation found ${missing.length} required field${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`);
      return;
    }
    addEvent("validated", "Required-field validation passed");
  }

  function transition(required: ReviewState, next: ReviewState, action: string) {
    if (copy.state !== required) {
      setMessage(`${action} requires the document to be ${stateLabel(required)} first.`);
      return;
    }
    addEvent(next, action);
  }

  function openDocumentTab() {
    const fields = selected.fields.map((field) => `<tr><th>${escapeHtml(field)}</th><td>${escapeHtml(copy.values[fieldId(field)]?.trim() || "Not entered")}</td></tr>`).join("");
    const history = copy.events.map((event) => `<li><strong>${escapeHtml(event.action)}</strong><span>${escapeHtml(new Date(event.occurredAt).toLocaleString())}</span></li>`).join("") || "<li>No review events recorded.</li>";
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(selected.title)}</title><style>body{font:14px/1.45 Arial,sans-serif;color:#173e45;max-width:960px;margin:0 auto;padding:32px}header{border-bottom:4px solid #0a6669;padding-bottom:18px;margin-bottom:24px}.eyebrow{color:#0a6669;font-weight:700;text-transform:uppercase;letter-spacing:.08em}h1{margin:.25rem 0}aside{background:#fff4df;border-left:5px solid #d1832d;padding:12px 16px;margin:18px 0}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cddcda;padding:12px;text-align:left;vertical-align:top}th{width:32%;background:#edf7f4}li{display:flex;justify-content:space-between;gap:16px;border-bottom:1px solid #dce6e4;padding:8px 0}footer{margin-top:28px;color:#637579;font-size:12px}@media print{aside{break-inside:avoid}}</style></head><body><header><p class="eyebrow">EPV EIEP · ${escapeHtml(moduleLabel)} · ${escapeHtml(selected.code)}</p><h1>${escapeHtml(selected.title)}</h1><p>${escapeHtml(selected.purpose)}</p></header><aside><strong>LOCAL REVIEW COPY — NOT A CONTROLLED PROJECT RECORD</strong><p>This document was generated from the browser review workbench. Authoritative submission, approval, release, signatures, and audit require a connected EIEP identity and project.</p></aside><p><strong>Requirement:</strong> ${escapeHtml(selected.requirement)} &nbsp; <strong>Review state:</strong> ${escapeHtml(stateLabel(copy.state))}</p><table><tbody>${fields}</tbody></table><h2>Review-session history</h2><ol>${history}</ol><footer>Generated ${escapeHtml(new Date().toLocaleString())}. Uncontrolled when printed; verify current status and revision in EIEP before use.</footer></body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const opened = window.open(url, "_blank");
    if (!opened) setMessage("The document tab was blocked by the browser. Allow pop-ups for this local preview and try again.");
    else setMessage(`${selected.title} opened in a separate review tab.`);
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  const startedCount = Object.values(copies).filter((item) => item.state !== "not_started").length;
  const reviewCount = Object.values(copies).filter((item) => item.state === "in_review").length;

  return <section id={`${moduleKey}-review-documents`} className="module-review-workspace" aria-labelledby={`${moduleKey}-review-heading`}>
    <div className="workflow-heading module-review-heading"><div><p className="section-label">Controlled design review</p>
      <h2 id={`${moduleKey}-review-heading`}>Working documents and execution</h2>
      <p>Open document structures, enter a browser-session review copy, exercise validation and lifecycle controls, and inspect the audit sequence.</p></div>
      <span className="review-mode-chip">Local review · no record authority</span></div>

    <div className="estimate-summary module-review-summary" aria-label={`${moduleLabel} document review summary`}>
      <article><span>Working documents</span><strong>{templates.length}</strong><small>Controlled structures</small></article>
      <article><span>Review copies</span><strong>{startedCount}</strong><small>Browser session only</small></article>
      <article><span>In review</span><strong>{reviewCount}</strong><small>Exercise state</small></article>
      <article><span>Authoritative records</span><strong>0</strong><small>API connection required</small></article>
    </div>

    <div className="module-review-layout">
      <nav className="document-template-list" aria-label={`${moduleLabel} working documents`}>
        <div><p className="section-label">Document register</p><h3>Select a working document</h3></div>
        {templates.map((item) => {
          const state = copies[item.code]?.state ?? "not_started";
          return <button key={item.code} type="button" className={item.code === selected.code ? "is-selected" : ""} onClick={() => { setSelectedCode(item.code); setMessage(`${item.title} opened for review.`); }}>
            <span><strong>{item.title}</strong><small>{item.code} · {item.requirement}</small></span><b className={`state-badge state-${state}`}>{stateLabel(state)}</b>
          </button>;
        })}
      </nav>

      <article className="document-workbench">
        <div className="document-workbench-heading"><div><p className="section-label">{selected.code} · {selected.requirement}</p><h3>{selected.title}</h3></div><span className={`state-badge state-${copy.state}`}>{stateLabel(copy.state)}</span></div>
        <p>{selected.purpose}</p>
        <div className="document-form-grid">
          {selected.fields.map((field, index) => <label key={field} htmlFor={`${moduleKey}-${selected.code}-${fieldId(field)}`}>{field}<span>Required</span>
            {index === selected.fields.length - 1 ? <textarea id={`${moduleKey}-${selected.code}-${fieldId(field)}`} rows={4} value={copy.values[fieldId(field)] ?? ""} onChange={(event) => updateValue(field, event.target.value)} placeholder={`Enter ${field.toLowerCase()}`} />
              : <input id={`${moduleKey}-${selected.code}-${fieldId(field)}`} value={copy.values[fieldId(field)] ?? ""} onChange={(event) => updateValue(field, event.target.value)} placeholder={`Enter ${field.toLowerCase()}`} />}
          </label>)}
        </div>
        <div className="document-progress"><span style={{ width: `${selected.fields.length ? (completedFields / selected.fields.length) * 100 : 0}%` }} /><small>{completedFields} of {selected.fields.length} required fields complete</small></div>
        <div className="document-action-row">
          <button type="button" className="secondary-button" onClick={startCopy}>Start review copy</button>
          <button type="button" onClick={validate}>Validate</button>
          <button type="button" onClick={() => transition("validated", "in_review", "Routed for review")}>Route for review</button>
          <button type="button" onClick={() => transition("in_review", "approved", "Review approval exercised")}>Approve</button>
          <button type="button" onClick={() => transition("approved", "released", "Release exercised")}>Release</button>
          <button type="button" className="primary-button" onClick={openDocumentTab}>Open document tab</button>
        </div>
        <p className="review-workbench-message" role="status">{message}</p>
        <aside className="review-boundary-note"><strong>Review boundary</strong><p>These controls exercise the form and state sequence only. They do not create, approve, release, sign, distribute, or audit a project record. Connect an authorized API identity and select a project for governed execution.</p></aside>
      </article>

      <aside className="review-audit-panel" aria-label={`${selected.title} review history`}>
        <p className="section-label">Review-session audit</p><h3>Lifecycle history</h3>
        {copy.events.length ? <ol>{[...copy.events].reverse().map((event, index) => <li key={`${event.occurredAt}-${index}`}><span aria-hidden="true" /><div><strong>{event.action}</strong><small>{new Date(event.occurredAt).toLocaleString()}</small></div></li>)}</ol>
          : <p className="muted">No events yet. Open a review copy or type into a field to begin the visible history.</p>}
      </aside>
    </div>
  </section>;
}
