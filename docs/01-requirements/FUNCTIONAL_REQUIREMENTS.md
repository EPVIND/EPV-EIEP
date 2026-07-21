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

