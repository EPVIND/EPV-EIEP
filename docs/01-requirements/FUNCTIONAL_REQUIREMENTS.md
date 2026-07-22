# Functional Requirements

Requirement IDs are stable traceability anchors. Splitting or superseding an ID requires updating the traceability matrix.

## Identity and authorization

- **FR-IAM-001** The system shall authenticate internal and approved external users through the selected identity architecture and enforce MFA according to the security baseline.
- **FR-IAM-002** The system shall authorize actions by role, project assignment, organization, work package, and record state where applicable.
- **FR-IAM-003** The system shall prevent a portal user from discovering or accessing unassigned projects or records, including through direct identifiers and exports.
- **FR-IAM-004** Privileged and delegated access shall be time-bounded, attributable, reviewable, and revocable.

## Audit and records

- **FR-AUD-001** The system shall record attributable create, update, approval, rejection, release, supersession, signature, export, and administrative events with UTC timestamps.
- **FR-AUD-002** Audit history shall show changed fields and preserve prior controlled values without exposing protected secrets.
- **FR-AUD-003** Controlled records shall use explicit states and permitted transitions; deletion shall be restricted to approved retention and administrative processes.

## Project setup

- **FR-PRJ-001** An authorized administrator shall create a project with unique number, customer, facility, scope, governing-requirement references, dates, and responsible roles.
- **FR-PRJ-002** A project shall contain systems, areas, WBS elements, work packages, organizations, and responsibility assignments without duplicating master organizations.
- **FR-PRJ-003** The project shall configure inspection, material, document, subcontractor, and turnover requirements.

## Advanced estimating and proposal handoff

- **FR-EST-001** Authorized users shall create organization-scoped estimates with unique number, customer/facility context, inquiry, scope, due date, currency, time zone, basis references, and explicit state.
- **FR-EST-002** Submitted estimate revisions shall be immutable; a correction creates a new parent-linked revision with reason and exact added/removed/changed line comparison.
- **FR-EST-003** Estimate revisions shall contain hierarchical cost-code/bid-item/work-package breakdowns using exact quantities, controlled units, and independently governed versioned assemblies.
- **FR-EST-004** Estimate calculations shall preserve exact labor hours/rates, material, equipment, subcontract, allowance, other cost, currency, rounding version, and reproducible component totals.
- **FR-EST-005** Productivity factors shall preserve source, justification, applicability/effective interval, multiplier, proposer, and independent approval, and remain distinguishable from base quantity/hours.
- **FR-EST-006** Vendor/subcontractor quotes shall preserve exact source identity/hash, currency/validity, normalized scope lines, inclusions, exclusions, qualifications, freight/tax, gaps, and versioned state.
- **FR-EST-007** Quote selection and contingency, escalation, markup, tax, risk, and alternates shall remain attributable and independently approved according to configured authority.
- **FR-EST-008** Estimate create/read/edit/submit/approve/revise, quote, proposal, export, and download actions shall enforce organization/object scope, version, assurance, qualification, separation of duty, and audit.
- **FR-EST-009** A proposal shall freeze the exact approved revision, price, terms/references, validity, source hash, artifact manifest hash, and independent approval/issue history.
- **FR-EST-010** Award handoff shall immutably map and reconcile the approved proposal revision into a same-organization project baseline without rewriting the estimate or proposal.

## Project controls, procurement, and scheduling

- **FR-PJC-001** Project controls shall establish independently approved, immutable, versioned cost and quantity baselines mapped to WBS, work packages, cost codes, control accounts, responsible organizations, and the exact awarded estimate handoff.
- **FR-PJC-002** Commitments, approved changes, actuals/imports, accruals, progress, forecast, estimate-at-completion, variance, contingency draw, and management reserve shall remain distinguishable and traceable to source and period.
- **FR-PJC-003** Change requests shall preserve origin, schedule/cost/quantity impact, affected baseline items, released evidence, quotation, thresholded independent approval, disposition, and resulting baseline revision; pending or rejected changes shall not alter the baseline.
- **FR-PJC-004** Progress claims shall be quantity/evidence based, periodized, scoped, independently accepted, and explicitly separated from invoice/payment approval and quality acceptance.
- **FR-PRC-001** Procurement shall manage requisition, bid package, bidders, clarifications, comparison, recommendation, thresholded independent award, purchase-order revision, commitment, and approval against exact estimate and project scope.
- **FR-PRC-002** Purchase items shall retain material/service identity, specification and exact governing document revisions, quantity/unit, need date, delivery, inspection/document/turnover requirements, cost code, work package, budget, and receiving linkage.
- **FR-PRC-003** Expediting shall preserve acknowledgements, submittals, fabrication milestones, promised/forecast/actual dates, shipment, exceptions, receipt, responsible follow-up, released evidence, and linked controlled receiving records without replacing vendor evidence.
- **FR-SCH-001** Scheduling shall model time zone/calendar, WBS-linked stable activity identity, milestones, logic, constraints, resources/quantities, responsible organization, completion boundary, and schedule state without using display IDs as identity.
- **FR-SCH-002** A schedule baseline shall be independently approved and immutable; updates shall retain data date, actuals, remaining duration, forecast, logic changes, reasons, source/import identifiers, and baseline variance.
- **FR-SCH-003** Look-aheads shall derive from the current approved schedule update, expose constraints and required documents/materials/inspections, and keep field claim progress distinct from accepted progress.
- **FR-SCH-004** P6 and Microsoft Project exchange shall use released exact source files, versioned mappings, preview validation, stable external IDs, idempotent commit, conflict/reconciliation, and independent schedule approval.

## Welding, NDE, PWHT, and testing

- **FR-WLD-001** Welding procedure specifications, PQRs, welder/operator qualifications, continuity, processes, materials, positions, thickness/diameter ranges, consumables, and governing references shall be versioned and effective at the work time without reproducing copyrighted standards.
- **FR-WLD-002** A weld/joint shall link the exact project, system/area/work package, components/material heat identity, drawing/isometric revision, weld-map location, WPS revision, joint design, required examinations, turnover boundary, and stable weld number.
- **FR-WLD-003** Fit-up, welding, consumable control, preheat/interpass observations, welder attribution, visual examination, repair/excavation, and final status shall preserve event history and deny release for expired qualification, wrong WPS applicability, material hold, open rejection, or incomplete required examination.
- **FR-NDE-001** NDE requests shall identify exact weld/component, repair cycle, method, extent, technique/procedure revision, acceptance reference, examination stage, required personnel qualification, due/status, and hold/witness context.
- **FR-NDE-002** NDE results shall preserve examiner/organization, qualification, equipment/media, calibration/verification, event conditions/time, indications, result, evidence, report revision, independent acceptance, and linked repair cycle.
- **FR-PWH-001** PWHT requirements and cycles shall preserve governing procedure, component/weld scope, heating/cooling/soak parameters and tolerances, thermocouple layout/readings, equipment/calibration, chart/source evidence, interruptions, result, reviewer, and exact affected welds.
- **FR-TST-001** Pressure, leak, and functional test packages shall define boundaries, drawings, test medium/pressure/duration, hazards/permits owned by the approved safety process, prerequisites, blinds/valves/instruments, calibrated gauges, participants/witnesses, results, deficiencies, restoration, and acceptance.
- **FR-TST-002** Welding, NDE, PWHT, and test readiness/release shall be projections of authoritative current records and shall feed deficiencies, completion, progress, and turnover without allowing software to replace qualified inspection, engineering, Authorized Inspector, client, or regulatory judgment.

## Fabrication and spool control

- **FR-FAB-001** Fabrication assembly revisions shall identify spool, structural assembly, equipment skid, or module; retain immutable parent/revision reason and exact manual or model-import source/version/hash; and link project system, area, work package, completion boundary, and released drawings.
- **FR-FAB-002** A fabrication revision shall retain an exact bill of material and cut list mapped to released material items, piece marks, quantities, units, cut geometry, welds, required inspections, and governing document revisions without breaking heat/lot genealogy.
- **FR-FAB-003** Submission, engineering approval/rejection, successor creation, traveler creation, and shop release shall enforce current version, state, scope, assurance, required qualification, independent authority, and audit; an executing parent revision shall not be silently superseded.
- **FR-FAB-004** A revision-controlled shop traveler shall preserve ordered operations, work centers, planned hours, qualifications, exact procedure revision, material/weld scope, instructions, and hold points; release shall fail for unapproved assemblies, unreleased source material/documents, or mismatched weld lineage.
- **FR-FAB-005** Fabrication execution shall append immutable, sequential start, complete, hold, independent hold-release, rework, and scrap events with exact operation, actor, time, controlled result meaning, quantity/unit, observations, and released evidence; later operations shall not start before required predecessors complete.
- **FR-FAB-006** Fabrication completion shall remain distinct from independent quality acceptance, which shall fail closed for incomplete travelers, unaccepted required inspections, unreleased welds, open affected NCRs, or violated creator/reviewer/releaser/performer separation of duty.

## CNC, waterjet, and profiling control

- **FR-CNC-001** Machine-profile revisions shall preserve work-center identity, supported process/stock/operation/feature scope, units, coordinate convention, dimensional envelope, postprocessor identity/version, effective interval, parent/reason, and independent qualified approval.
- **FR-CNC-002** A CNC program revision shall bind the exact released source file/version/SHA-256 and document revision to the approved fabrication assembly, traveler operation, released or issued material item, piece mark/BOM quantity, and approved effective machine profile.
- **FR-CNC-003** Machine-neutral preparation shall normalize stock and ordered operations into a deterministic, versioned package; unsupported process, form, unit, coordinates, envelope, feature, operation, geometry, sequence, or source lineage shall remain explicit validation findings and block submission.
- **FR-CNC-004** Submission, technical approval, job release, and artifact download shall revalidate exact version/state/current prerequisites, enforce independent qualified step-up authorities, preserve normalized and released SHA-256 identities, audit every release/download, and explicitly prohibit direct machine control.
- **FR-CNC-005** Execution shall require the exact released artifact hash, approved work center, process-qualified operator, attributable time/result/quantities, released evidence, controlled exceptions, and parent/child material genealogy for produced pieces and remnants.
- **FR-CNC-006** A distinct qualified authority shall reconcile execution against the released program, artifact hash, operator/work center, quantities, evidence, genealogy, and closed exceptions; creator/submitter/reviewer/releaser/operator self-reconciliation shall fail closed and history shall remain immutable.

## Multidisciplinary engineering registers

- **FR-ENG-001** Requirements, deliverables, systems, equipment, lines, instruments, components, and tags shall use stable project-scoped identity with immutable revision, parent, reason, title, discipline, responsible organization, and lifecycle history.
- **FR-ENG-002** Each revision shall preserve exact system, area, work-package, released-document, and approved related-register links plus controlled attributes without duplicating shared project, organization, document, or structure identity.
- **FR-ENG-003** Server-side deterministic validation shall expose invalid structure, organization, document, relationship, required system, deliverable date, and actual-issue evidence findings before submission and preserve a canonical SHA-256.
- **FR-ENG-004** Submission and approval/rejection shall enforce current version, project/object scope, MFA or step-up assurance, qualified independent engineering authority, creator/submitter separation of duty, and attributable audit.
- **FR-ENG-005** An approved successor shall supersede rather than overwrite its approved parent; rejected, approved, and superseded revisions and their exact hashes shall remain retained and searchable.
- **FR-ENG-006** Permission-scoped engineering projections shall distinguish each register class, current approved revisions, draft/rejected validation findings, exact source links, and an explicit no-data state without presenting illustrative records as project truth.

## Bluebeam and provider-neutral document collaboration

- **FR-BBM-001** A provider-neutral collaboration adapter shall ingest an approved Bluebeam Studio/export package only after exact project, released document revision, active user/organization, and protected source-file mapping succeeds.
- **FR-BBM-002** Imported markups, comments, replies, and status evidence shall preserve provider project/session/document/item identifiers, page/region, parent relationship, author, timestamps, appearance, exact source version/hash, and exact EIEP document revision.
- **FR-BBM-003** Preview shall report unmapped documents/users/statuses, duplicates, invalid parent/region/time data, unsupported content, and changed-source collisions before an atomic, idempotent commit; failures shall remain explicit reconciliation records.
- **FR-BBM-004** Provider content and completion/approval statuses shall remain submitted collaboration evidence only; independently authorized EIEP review shall not mutate or imply document release, quality acceptance, NCR closure, or work acceptance.
- **FR-BBM-005** Outbound provider writes shall remain disabled until an approved vendor contract/API, sandbox, least-privilege identity, tenant/project ownership, rate/retry/reconciliation behavior, retention, terms, and production authorization are verified.

## Unified enterprise command center

- **FR-CMD-001** The command center shall derive project metrics and module health on demand from authorized current source records, preserve generation time and exact schedule-revision lineage, and shall not store or imply an independent workflow state.
- **FR-CMD-002** “My open tasks” shall include only work explicitly owned by the current user or currently authorized under the exact action, organization, project, object, assurance, qualification, and separation-of-duty boundary; source identity/version, due date, overdue state, and priority shall remain visible.
- **FR-CMD-003** Recent activity shall be a separately authorized, permission-filtered projection of immutable audit events preserving actor, time, action, object identity, module, and prior/new state without exposing protected changed-field content.
- **FR-CMD-004** Document, material, quality, estimating handoff, controls, procurement, schedule, welding, NDE/PWHT, testing, fabrication, CNC, collaboration, and turnover summaries shall expose explicit numerators/denominators, distinguish absent data from zero percent, and drill through to the authoritative module.

## Documents

- **FR-DOC-001** The system shall register a controlled document with number, title, type, discipline, revision, status, source, and project applicability.
- **FR-DOC-002** The system shall prevent superseded or non-released revisions from appearing as current-for-work.
- **FR-DOC-003** Revision review, approval, release, supersession, distribution, acknowledgement when required, and download shall be auditable.
- **FR-DOC-004** A record shall link to the exact document revision governing it, not only a mutable document number.

## Materials

- **FR-MAT-001** Receiving shall create a material lot/item with procurement/vendor reference, specification/grade, dimensions, quantity, heat/lot, MTR, and receipt evidence.
- **FR-MAT-002** Each controlled material item shall have a unique EPV identifier and status history.
- **FR-MAT-003** The system shall maintain parent/child genealogy for cut pieces and remnants.
- **FR-MAT-004** Quarantined or rejected material shall not be available for issue or release.
- **FR-MAT-005** Material release shall verify project-configured MTR, inspection, PMI, and disposition requirements.

## PMI and inspection

- **FR-PMI-001** The system shall determine and display whether PMI is required and the governing project rule or approved override.
- **FR-PMI-002** A PMI record shall identify material/component, required material, method, instrument, calibration/verification evidence, inspector, readings/evidence, result, and time.
- **FR-PMI-003** An expired or failed instrument/calibration/verification condition shall block acceptance when required by the configured procedure.
- **FR-PMI-004** A failed PMI result shall quarantine affected material and allow creation/linkage of an NCR.
- **FR-INS-001** Inspection templates and required fields shall be version-controlled and project-applicable.
- **FR-INS-002** Inspection acceptance shall be limited to authorized roles and preserve signatures/approvals at the approved assurance level.

## NCR and punch

- **FR-NCR-001** An authorized user shall create an NCR linked to affected projects, assets/materials/work, requirement, evidence, and containment.
- **FR-NCR-002** Disposition and closure shall enforce configured approval roles and reinspection evidence.
- **FR-NCR-003** Closed NCRs shall remain searchable and linked to turnover where contractually required.
- **FR-PCH-001** Punch items shall track type/priority, system/area/asset, description, owner, target, evidence, verification, and closure.

## Subcontractors

- **FR-SUB-001** A subcontractor master record shall contain approved scope and qualification/expiration metadata without duplicating the organization.
- **FR-SUB-002** Project mobilization release shall evaluate configured commercial, safety, quality, insurance, license, lower-tier, and submission prerequisites.
- **FR-SUB-003** Subcontractor users shall access only assigned projects and work packages and shall submit records into EPV-controlled workflows.
- **FR-SUB-004** EPV acceptance authority shall remain explicit for subcontractor inspections, progress, deficiencies, and turnover deliverables.

## Turnover

- **FR-TOV-001** The system shall define turnover requirements and packages by project-configured completion boundary.
- **FR-TOV-002** Turnover status shall distinguish missing, submitted, under review, rejected, accepted, superseded, and not applicable requirements.
- **FR-TOV-003** A generated package shall include an index/manifest, record identifiers, current accepted revisions, generation metadata, and integrity checks.
- **FR-TOV-004** Regeneration shall create a new package version and retain prior package history.

## Import, export, and integration

- **FR-INT-001** Imports shall validate schema, authorization, duplicates, project context, and errors before commit.
- **FR-INT-002** Exports shall apply the requesting user's authorization and create an audit event.
- **FR-INT-003** Integration operations shall be idempotent where practical and preserve external/source identifiers.
