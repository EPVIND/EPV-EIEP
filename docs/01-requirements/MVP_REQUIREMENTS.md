# MVP Requirements

## Objective

The MVP must manage one approved live project through a complete, secure digital thread from setup to turnover. It is not a thin demonstration: each included capability must meet the repository completion standard.

## In scope

### Foundation

- Organizations, users, roles, project assignments, systems, areas, WBS elements, and responsibility assignments.
- External identity/MFA integration or an approved equivalent.
- Object-level authorization, immutable audit history, notifications, controlled files, search, and exports.
- Separate development, test, training, and production configuration and data.

### Project and document control

- Project number, customer, facility/site, code/specification references, systems, areas, WBS, managers, scope performer, and turnover index.
- Upload, metadata, document number, type, discipline, revision, status, effective use, review/approval, supersession, and distribution.
- Clear current-revision access and retained historical revisions.

### Material receiving and traceability

- PO/vendor reference, material specification/grade, size, quantity, heat/lot, MTR, receiving evidence, storage location, and unique EPV material identifier.
- Acceptance, quarantine, release, issue, return, cut-piece/remnant relationship, and status history.
- MTR review and linkage without treating a filename as sufficient traceability.

### PMI and inspection

- Project-configured PMI requirement and sampling basis.
- Required versus observed alloy/material, method, instrument, calibration/verification status, inspector, timestamp, location/component, readings or imported evidence, result, notes, photos/files, and approval.
- Prevent unauthorized material release when mandatory PMI, MTR, calibration/verification, or disposition is incomplete.

### Deficiency control

- Create NCR from a failed inspection or material issue.
- Containment/hold, requirement, description, evidence, responsible party, disposition, approvals, corrective action, reinspection, closure, and history.
- Punch items with system/area/work-package/asset linkage, priority, owner, target, evidence, verification, and closure.

### Subcontractor controls - focused MVP

- Organization profile, approved scopes, qualification status, license/insurance expiration metadata, project assignment, lower-tier disclosure, mobilization status, required submissions, inspections, NCR/punch ownership, and turnover deliverables.
- Scope-limited portal authorization is required before external pilot access.

### Turnover

- Project-configurable turnover index.
- Package by system, area, asset, test package, work package, or contract boundary.
- Include only accepted/current records; expose missing, rejected, superseded, or incomplete requirements.
- Produce a stable, indexed export with manifest, revision, generation timestamp, and source record identifiers.

## Out of scope for MVP implementation

The architecture must not block these capabilities, but MVP acceptance does not require full estimating, finance, payroll, fleet, advanced scheduling, full warehouse optimization, CNC/model integration, instrument docking, full welding/NDE execution, electrical/instrumentation, digital twin, or AI assistance.

## Constraints

- No hard-coded EPV customer, project, user, material, code, or specification data.
- No training/demo data in production paths.
- No copying of copyrighted codebooks or standards.
- No quality/safety/engineering release by an unauthorized or unqualified role.
- No silent deletion or overwrite of controlled records.
- MVP must be usable on supported desktop and tablet browsers; designated field forms require an approved intermittent-connectivity strategy.

