# Enterprise Expansion Requirements

Status: Estimating, project-controls/procurement/scheduling, welding/NDE/PWHT/
testing, and governed Bluebeam collaboration requirements promoted into the controlled baseline
Date: 2026-07-21

These requirements define the active post-MVP expansion. They supplement rather
than weaken the existing security, audit, record, file, integration, usability,
recovery, and data requirements.

## Advanced estimating and proposals

- **FR-EST-001** An authorized estimator shall create an organization-scoped estimate
  with a unique number, customer organization, facility/site context, opportunity or
  inquiry reference, scope, due date, estimator, currency, originating time zone,
  basis references, assumptions, exclusions, and explicit lifecycle state.
- **FR-EST-002** Estimate revisions shall be immutable after submission; a correction
  or scope change creates a new revision with parent, reason, author, timestamps, and
  an exact added/removed/changed comparison.
- **FR-EST-003** A revision shall contain a hierarchical cost breakdown linked to
  governed cost codes, bid items, alternates, work packages, quantities, units, and
  versioned assemblies without duplicating shared project or organization identity.
- **FR-EST-004** Each estimate line shall preserve exact labor hours/rates, material,
  equipment, subcontract, allowance, burden, and other cost components; derived
  values use governed decimal rounding and expose their calculation trace.
- **FR-EST-005** Productivity factors shall identify source, discipline, scope,
  location/condition applicability, effective interval, justification, confidence,
  proposer, and independent approver. A factor cannot silently overwrite the base
  quantity, crew, or hours.
- **FR-EST-006** Vendor/subcontractor quotes shall retain invited scope, source file,
  version, currency, validity, normalized line mapping, inclusions, exclusions,
  qualifications, freight/tax, alternates, and commercial-review state. Comparison
  shall not imply equivalence where scope is unresolved.
- **FR-EST-007** Quote selection, contingency, escalation, markup, tax, risk,
  alternates, and final price adjustments shall be separately attributable and
  independently approved according to configured authority thresholds.
- **FR-EST-008** Estimate submission, review, approval, rejection, supersession,
  proposal generation, export, and download shall enforce organization/object scope,
  assurance, authority, separation of duty, version checks, and audit history.
- **FR-EST-009** A proposal shall freeze the exact approved estimate revision,
  commercial terms/references, scope, assumptions, exclusions, alternates, price,
  currency, validity, approvals, source hashes, and generated artifact manifest.
- **FR-EST-010** Award/handoff shall create an immutable mapping from the approved
  estimate/proposal snapshot into the project cost, procurement, schedule, work
  package, and turnover baselines without rewriting the source estimate.

## Project controls, procurement, and scheduling

- **FR-PJC-001** Project controls shall establish independently approved, versioned
  cost and quantity baselines mapped to project WBS, work packages, cost codes,
  control accounts, responsible organizations, and the awarded estimate handoff.
- **FR-PJC-002** Commitments, approved changes, actuals/imports, accruals, progress,
  forecast, estimate-at-completion, variance, contingency draw, and management
  reserve shall remain distinguishable and traceable to their source and period.
- **FR-PJC-003** Change requests shall preserve origin, scope/time/cost impact,
  affected baseline items, evidence, quotation, approval threshold, disposition, and
  resulting baseline revision; pending or rejected changes do not alter the baseline.
- **FR-PJC-004** Progress claims shall be quantity/evidence based, periodized, scoped,
  independently verified where configured, and separated from invoice/payment
  approval and from quality acceptance.
- **FR-PRC-001** Procurement shall manage requisitions, bid packages, bidders,
  technical/commercial clarification, comparison, recommendation, award, purchase
  order/contract reference, revisions, and approvals against exact estimate and
  project scope.
- **FR-PRC-002** Purchase items shall retain material/service identity, specification
  and exact governing document revisions, quantity/unit, need date, delivery terms,
  inspection/document/turnover requirements, cost code, work package, and receiving
  linkage.
- **FR-PRC-003** Expediting and logistics shall track acknowledgements, submittals,
  fabrication/milestone status, promised/forecast dates, shipment, exceptions,
  receipt, and responsible follow-up without replacing vendor source evidence.
- **FR-SCH-001** Scheduling shall model calendars, WBS-linked activities, milestones,
  logic/dependencies, constraints, resources/quantities, responsible organization,
  completion boundary, and schedule state without using display IDs as identity.
- **FR-SCH-002** A schedule baseline shall be independently approved and immutable;
  updates retain data date, actuals, remaining duration, forecast, logic changes,
  reasons, source/import identifiers, and baseline variance.
- **FR-SCH-003** Look-aheads shall derive from a current authorized schedule update,
  expose constraints and required documents/materials/inspections, and preserve
  field status as a claim until accepted by the configured authority.
- **FR-SCH-004** P6 and Microsoft Project exchange shall use versioned mappings,
  preview validation, stable external IDs, idempotent commit, conflict/reconciliation,
  and protected credentials; imported logic never bypasses baseline approval.

## Welding, NDE, PWHT, and testing

- **FR-WLD-001** Welding procedure specifications, PQRs, welder/operator
  qualifications, continuity, processes, materials, positions, thickness/diameter
  ranges, consumables, and governing references shall be versioned and effective at
  the work time without reproducing copyrighted standards.
- **FR-WLD-002** A weld/joint shall link the exact project, system/area/work package,
  components/material heat identity, drawing/isometric revision, weld map location,
  WPS revision, joint design, required examinations, turnover boundary, and stable
  weld number.
- **FR-WLD-003** Fit-up, welding, consumable control, preheat/interpass observations,
  welder attribution, visual examination, repair/excavation, and final status shall
  preserve event history and deny release for expired qualification, wrong WPS
  applicability, material hold, open rejection, or incomplete required examination.
- **FR-NDE-001** NDE requests shall identify exact weld/component, method, extent,
  technique/procedure revision, acceptance reference, examination stage, required
  personnel qualification, due/status, and hold/witness context.
- **FR-NDE-002** NDE results shall preserve examiner/organization, qualification,
  equipment/media, calibration/verification, event conditions/time, indications,
  result, evidence, report revision, independent acceptance, and linked repair cycle.
- **FR-PWH-001** PWHT requirements and cycles shall preserve governing procedure,
  component/weld scope, heating/cooling/soak parameters and tolerances, thermocouple
  layout/readings, equipment/calibration, chart/source evidence, interruptions,
  result, reviewer, and exact affected welds.
- **FR-TST-001** Pressure, leak, and functional test packages shall define boundaries,
  drawings, test medium/pressure/duration, hazards/permits owned by the approved
  safety process, prerequisites, blinds/valves/instruments, calibrated gauges,
  participants/witnesses, results, deficiencies, restoration, and acceptance.
- **FR-TST-002** Welding, NDE, PWHT, and test readiness/release shall be projections of
  authoritative current records and shall feed deficiencies, completion, progress,
  and turnover without allowing software to replace qualified inspection,
  engineering, Authorized Inspector, client, or regulatory judgment.

## Bluebeam document collaboration

- **FR-BBM-001** A provider-neutral document-collaboration adapter shall ingest an
  approved Bluebeam Studio or export package only after project/document/revision,
  organization, session, file, and actor authorization is resolved server-side.
- **FR-BBM-002** Imported markups/comments/status shall preserve provider project,
  session, document, page/region, markup, author, timestamps, source version/hash,
  reply/resolution relationships, and the exact EIEP controlled document revision.
- **FR-BBM-003** Preview shall report unmapped documents/users/statuses, duplicates,
  changed-source conflicts, unsupported content, and scope violations before atomic
  commit. Reimport shall be idempotent by provider identifiers and source version.
- **FR-BBM-004** Bluebeam-originated content remains submitted collaboration evidence
  until EIEP's configured document/QC authority accepts or rejects it; it cannot
  release/supersede a drawing, approve an estimate, close an NCR, or accept work by
  provider status alone.
- **FR-BBM-005** Any outbound session/document/markup operation shall require an
  approved versioned contract, least-privilege credential, recipient reauthorization,
  retained request/result identifiers, bounded retry, reconciliation, and audit.

## Shared nonfunctional expansion constraints

- Commercial calculations use bounded exact decimals with explicit currency, unit,
  rate basis, rounding rule, and calculation version; binary floating point is not an
  authoritative amount.
- Approved revisions and generated proposals/reports are immutable, hash-verifiable,
  retained, searchable, and regenerated only as a new version.
- Sensitive rates, quotes, labor/resource data, commercial evaluations, personnel
  qualifications, and examination evidence are excluded from logs and unauthorized
  counts/search/export/notifications.
- No catalog seed contains EPV customer, employee, project, rate, productivity,
  vendor, code/specification, or demonstration values. Governed configuration owns
  those values.
- Project and field screens meet the existing tablet/accessibility boundary; dense
  estimating and scheduling grids additionally require keyboard, zoom/reflow, export,
  and large-dataset evidence.
- Integration and long-running calculation/generation jobs use the durable job,
  idempotency, terminal-state, retry, dead-letter, and reconciliation controls already
  defined for the platform.
