# Form and Report Inventory

Forms are views of controlled domain records, not isolated PDF replicas. Printable outputs must identify project, record ID, status, revision, generation time, and source system.

## MVP forms

| ID | Form/workspace | Primary records | Required MVP output |
|---|---|---|---|
| FORM-PRJ-001 | Project setup/readiness | Project, systems, areas, WBS, assignments, configuration | Project profile and readiness report |
| FORM-DOC-001 | Document registration/revision | Document, revision, file, review, distribution | Document cover/history and transmittal |
| FORM-MAT-001 | Material receipt | Receipt, lot/item, source, heat, dimensions, location | Receiving report and material label |
| FORM-MTR-001 | MTR review | Certification, represented material, reviewer, result | MTR review record |
| FORM-PMI-001 | PMI inspection | PMI record, instrument, verification, readings, evidence | PMI report |
| FORM-INS-001 | Generic governed inspection | Assignment, plan revision, measurements, result | Inspection report |
| FORM-NCR-001 | Nonconformance | NCR, containment, disposition, approvals, reinspection | NCR report and history |
| FORM-PCH-001 | Punch item | Punch, owner, evidence, verification | Punch register/item report |
| FORM-SUB-001 | Subcontractor profile/qualification | Organization, credentials, approved scopes | Qualification summary |
| FORM-SUB-002 | Mobilization release | Project assignment, checklist, evidence | Mobilization status/release |
| FORM-TOV-001 | Turnover readiness/package | Boundary, requirements, records, manifest | Readiness report and versioned package |

## Near-term discipline forms

- WPS/PQR/WPQ and welder continuity.
- Weld map/log, fit-up, visual, repair, NDE request/result, PWHT, and pressure test.
- Structural member/assembly traveler, dimensional, bolting, coating, shipping, and erection inspection.
- Excavation/subgrade, compaction, rebar/embeds/pre-pour, concrete placement, sample/strength, grout, and survey.
- Equipment receiving, setting, alignment, lubrication, rotation, and commissioning.
- Daily report, manpower/equipment, quantities, constraints, look-ahead, and progress verification.

## MVP reports and dashboards

- Project readiness and open configuration exceptions.
- Current document register and superseded revision history.
- Materials received, pending, released, quarantined, rejected, unlocated, and genealogy trace.
- MTR/PMI requirement and completion matrix.
- Expiring qualifications, credentials, insurance, licenses, calibration, and verification.
- Open NCR and punch aging by owner/system/area/work package.
- Subcontractor mobilization and deliverable status.
- Turnover completeness by boundary and requirement state.
- Audit history and privileged action review.

The eleven controlled snapshots are implemented by `ReportingService` and exercised together in `tests/acceptance/controlled-reports.test.ts`. Each generation stores an immutable, revisioned JSON and searchable printable-HTML snapshot with exact source identifiers, versions, states, SHA-256 values, stable filenames, print warnings, recipient authorization, redaction, and generation/download audit. The project dashboard is calculated on demand by the same authorization boundary at `GET /v1/projects/{projectId}/report-dashboard`; it does not replace an immutable controlled snapshot.

## Output controls

- Apply recipient authorization at generation and download.
- Watermark training/demo and non-controlled previews.
- Include current status and warn when printed output is uncontrolled unless the contract defines otherwise.
- Use stable filenames, manifests, hashes, page numbering, and searchable text for turnover.
- Avoid exposing internal comments, margin, private data, or other contractors in client/subcontractor exports.
