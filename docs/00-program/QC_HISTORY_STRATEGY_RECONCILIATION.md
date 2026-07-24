# QC History Strategy Reconciliation

Status: Under review — candidate strategy, not approved requirements

Date: 2026-07-22

Source asset: `ASSET-0001`

Decision owners: Product owner, quality authority, welding authority, project-controls authority, security/privacy authority, solution architect

## Purpose and authority boundary

This report reconciles the user-owned ChatGPT `QC` project history with the current
EIEP controlled baseline. It may guide backlog and module design, but it does not
approve a requirement, code rule, engineering acceptance limit, third-party
integration, or production release. `AGENTS.md`, controlled requirements, approved
ADRs, and independently accepted implementation evidence remain authoritative.

The intake consists of four browser-rendered conversations:

1. `PMI in Inspection Criteria` — repository handoff and controlled-source strategy.
2. `Digital Quality Manual Review` — digital quality modernization, field workflow,
   engineering/welding data, Bluebeam, turnover, and simplification history.
3. `Compilation Merge Complete` — merged-package claims and the internal-schedule
   versus P6 boundary.
4. `Primavera P6–class Software` — project-controls prototype claims and integration
   requirements.

The QC project Sources tab was empty at capture time. Referenced manuals, PDFs,
spreadsheets, ZIPs, databases, source code, and executables were not available and
were not transferred. Statements that such packages were generated or tested are
historical claims only.

## Strategy accepted for continued evaluation

The following themes are consistent with the current controlled architecture and
should remain active design principles, subject to normal approval:

### 1. One controlled data thread

- Create projects, users, organizations, WBS/work packages, documents, materials,
  welds, inspections, schedules, and turnover identities once and reference them by
  stable ID across modules.
- Do not create separate project, user, material, weld, or document masters inside
  scheduling, Bluebeam, estimating, finance, or field-form modules.
- Keep database state authoritative. Drawings, PDFs, dashboards, exports, and
  integrations are views, evidence, or interchange surfaces—not release authority.

### 2. Object-first, role-based field experience

The strongest human-factors conclusion is:

> The system carries the complexity; the worker sees the object, assigned task,
> required actuals, exception, and next permitted action.

Field workflows should normally begin with scan/search/assignment rather than asking
the worker to traverse Project → WBS → Activity → module → form. The selected object
should inherit project, area/system, drawing revision, code basis, work package,
schedule activity, procedure, material, and inspection context. Manual hierarchy
selection remains an authorized fallback.

Role-oriented entry surfaces should include at least:

- Field/craft: My Work, Scan Object, Drawings, Create Issue.
- Quality: Inspections Due, Holds, Reviews, NCRs, Releases.
- Engineering/welding: Materials, Components, line classes, WPS/PQR/WPQ,
  qualifications, deviations.
- Project controls: mapping, constraints, look-ahead, progress, recovery, forecast.
- Administration: users, roles, catalogs/templates, revisions, audit, deployment.

Internal IDs, lookup-package versions, provider metadata, authorization plumbing, and
schedule keys belong in Details/Audit views unless the task specifically requires
them.

### 3. Explainable governed cascades

Controlled option chains should narrow downstream choices and explain why an option
is eligible, conditional, excluded, or held. The candidate chain preserved in the QC
history is:

Project/code basis → application → object/material → joint → process → procedure →
qualified person/equipment → execution variables → examination/testing → release.

This supports the current WPS/PQR builder direction. The production rule source must
be an owner-approved, versioned catalog with effective dates, provenance, tests, and
independent authority. Client-side illustrative catalogs and copyrighted standard
tables cannot become compliance truth.

### 4. Digital traceability and evidence

- QR/barcode representations should resolve a stable EIEP object without exposing
  sensitive information in the label.
- Material receiving, MTR review, PMI, issue/cut/remnant history, weld assignment,
  inspection, NDE, PWHT, pressure testing, repair/NCR, and turnover should remain one
  linked evidence chain.
- Photos, instrument identity/verification, actor, UTC/originating time, location when
  approved, and released file revisions should be captured as governed evidence—not
  embedded as mutable free-form dashboard data.
- NCR, hold, repair, punch, and turnover readiness must be derived from authoritative
  record state and explicit gates.

### 5. Product boundaries

- EIEP web/tablet: workflow, identity, permissions, audit, governed rules,
  synchronization, authoritative records, and release decisions.
- Bluebeam/provider collaboration: drawings, markups, location/status metadata,
  evidence links, revision transfer, and controlled import/reconciliation.
- P6/Microsoft Project: controlled schedule interchange when contractually required;
  no provider credential is required for the internal pilot.
- PDF: clean issued/customer record and portable evidence, not the primary workflow
  engine.
- Paper: controlled contingency capture only.

### 6. Project-controls linkage

Material holds, document revisions, qualification status, incomplete NDE/PWHT, open
NCRs, accepted quantities, test completion, and turnover readiness may inform
schedule readiness and accepted progress through governed mappings. Schedule records
reference execution objects; they do not duplicate or override quality state.

## Reconciliation with the current EIEP baseline

| QC-history theme | Current EIEP position | Reconciliation |
|---|---|---|
| Dedicated controlled repository, `AGENTS.md`, source-intake isolation, training-data separation | Implemented | Preserve. The current repository already follows the recommended handoff structure. |
| Shared project/user/document/material/audit model | Implemented in the modular pilot | Preserve and harden; do not replace with historical standalone SQLite/FastAPI packages. |
| Project → documents → materials/MTR → PMI/inspection → NCR/punch → turnover | Implemented controlled pilot | Continue production hardening and representative pilot acceptance. |
| Advanced estimating, quote comparison, proposal handoff | Implemented controlled pilot | Continue catalog/authority validation and representative commercial fixtures. |
| Project controls, procurement, scheduling, look-ahead, exchange boundary | Implemented controlled pilot | Preserve EIEP/provider-neutral authority; validate real P6/MS Project files later. |
| WPS/PQR/WPQ, weld execution, NDE, PWHT, testing | Implemented controlled pilot | Deepen governed catalog, applicability, field usability, and independent authority. |
| Explainable cascading WPS selections | Implemented in the visible pilot builder | Move dependency catalogs server-side and owner-controlled before compliance use. |
| Bluebeam import/reconciliation | Implemented provider-neutral inbound pilot | Outbound markup creation/write-back remains gated by product contract, sandbox, identity, tenancy, retention, coordinate fidelity, and authorization. |
| Command dashboard | Implemented derived/permission-filtered pilot | Add role-oriented landing views without duplicating authoritative state. |
| QR/object-first field launch | Partially represented in requirements/workflows | Promote as a high-priority UX increment after pilot security/persistence gates. |
| Broad offline mutation | Explicitly not claimed | Preserve bounded offline policy; no offline approval/release authority. |
| Finance/payroll/general ledger | Future, separately governed | Do not infer payroll/tax/accounting rules from the QC history. |

## Conflicts and resolutions

### Schedule system of record

The history contains both “P6 is the schedule source of truth” and a later controlling
decision that the internal EPV CPM/project-controls platform is authoritative while
P6 is an interchange tool. The current EIEP controlled baseline uses immutable EIEP
schedule revisions with provider-neutral P6/MS Project preview, mapping, idempotent
commit, conflict handling, and independent approval. Preserve the current baseline;
any change requires a superseding ADR and contract-specific authority analysis.

### Bluebeam automation

The history first described packages as integrated, then explicitly corrected that
they lacked reliable X/Y geometry, automatic markup placement, verified heat
assignment, and round-trip synchronization. Preserve the correction. A weld markup
may be proposed only from verified drawing geometry; a heat number may appear only
after accepted receiving/issue/component traceability. Provider-originated status is
a claim until EIEP reconciliation and acceptance.

### Generated packages and audits

Claims involving hundreds of files, working applications, clean ZIPs, broken-link
counts, checksums, test passes, sample databases, executable packages, or named
release versions cannot be verified because the underlying artifacts were not in the
QC project Sources tab. They must not influence implementation status or release
claims until the exact files are received, hashed, scanned, inventoried, and tested.

### Standards and compliance

The history references ASME/API/AWS/ISO concepts and example classifications. EIEP
may store code profile identifiers, editions, owner configuration, qualification
evidence, and decisions, but it must not copy licensed tables or represent an
illustrative dropdown as code acceptance. Qualified welding/quality authorities must
approve the exact catalog and applicability logic.

## Module-building priority influenced by this intake

1. **Controlled-pilot hardening:** deployed identity, object authorization, managed
   file/storage/scanning, durable audit, backup/restore, concurrency, monitoring,
   representative data, and acceptance evidence.
2. **Object-first field shell:** My Work, scan/search, task context, exception/release
   path, role views, large touch targets, and hidden advanced metadata.
3. **Advanced estimating and project controls hardening:** governed catalogs,
   approvals, immutable handoff, readiness/progress links, procurement, forecast/EAC,
   and real exchange fixtures.
4. **Welding/quality depth:** server-side versioned code profiles, WPS/PQR/WPQ
   applicability, welder continuity, consumables, fit-up/pass/preheat/interpass,
   repair-cycle NDE, PWHT, testing, bolting, coatings, and turnover gates.
5. **Traceability and evidence UX:** QR labels, photo/evidence capture, material/weld
   maps, automatic NCR/inspection requests, and evidence-derived turnover indexes.
6. **Bluebeam/provider integration:** inbound fidelity first; coordinate-based markup
   proposal and write-back only after the external gates and field pilot pass.
7. **Multidiscipline and enterprise expansion:** civil/concrete, structural,
   electrical/instrumentation, subcontractor execution, commissioning, customer
   portals, analytics, then separately governed finance/payroll/ERP authority.

## Required follow-up before promotion

- Product owner reviews and accepts/rejects each candidate strategy item.
- Quality and welding authorities review code-profile and evidence-chain implications.
- Security/privacy review classifies the raw conversations and approves any Git or
  external-storage disposition.
- Obtain the exact referenced source packages only if the user chooses to transfer
  them; hash, scan, inventory, and test each item separately.
- Add or revise controlled requirements/ADRs before any candidate changes an
  authority boundary, integration contract, offline behavior, or production release
  gate.
- Maintain `ASSET-0001` as Under review until those actions are recorded.
