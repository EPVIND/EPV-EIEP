# ADR-0013: Welding, Examination, Heat Treatment, and Test Execution Model

Status: Proposed  
Date: 2026-07-21  
Decision owners: Product owner, responsible engineering authority, industrial/QC
authority, welding authority, NDE Level III authority, testing/commissioning authority,
records owner, solution architect  
Requirements affected: FR-WLD-001 through FR-WLD-003, FR-NDE-001 through FR-NDE-002,
FR-PWH-001, FR-TST-001 through FR-TST-002

## Context

EIEP must add detailed weld, NDE, PWHT, and test execution without duplicating
materials, drawings, work packages, equipment/calibration, qualifications,
deficiencies, completion boundaries, or turnover records. Requirements vary by
project, code edition, client, jurisdiction, Authorized Inspector, and procedure.

## Decision drivers

- One traceable joint/component identity through work, examination, repair, and
  turnover.
- Exact effective procedure, qualification, material, equipment, and drawing links.
- Configured quality hold/witness/review gates and independent acceptance.
- Repair cycles and many-to-many examination/PWHT/test relationships.
- No encoded copyrighted standard text or invented engineering acceptance.

## Considered options

- Independent welding/NDE/testing logs joined by display numbers.
- Generic inspection forms with all detail in JSON.
- Shared execution objects with module-owned versioned records and explicit links.
- Make an NDE/PWHT equipment or laboratory provider authoritative.

## Decision

Propose module-owned `welding`, `examination`, `heat_treatment`, and `testing` records
that reference shared project/work-package/component/material/document/equipment/
qualification/deficiency/turnover identities. Stable weld/joint IDs are distinct from
project-visible weld numbers. Procedure and qualification applicability is evaluated
from exact governed revisions/effective intervals; rules store references and approved
interpretations, not copyrighted clauses.

A weld owns joint/component context and append-only execution events. NDE requests
and report revisions link one or more targets and a repair cycle. PWHT cycles link all
affected welds/components and preserve time-series/evidence provenance. Test packages
own a controlled completion boundary and prerequisite/readiness projection. Quality
states advance only through commands that check current materials, procedures,
qualifications, examinations, equipment validity, deficiencies, and configured
independent authorities.

## Consequences and risks

- One digital thread can feed progress, deficiency, completion, and turnover.
- Project-specific rule configuration and authority review are substantial and
  cannot be replaced by generic defaults.
- Time-series PWHT/equipment files may be large and belong in governed object storage
  with indexed metadata, not ordinary row payloads.
- Jurisdictional/Authorized Inspector and customer acceptance must remain explicit.

## Security, data, and operations impact

Welder/examiner qualifications and signatures are personnel records; reports and
acceptance decisions are controlled project records. Server authorization includes
project/work package/object, organization, state, qualification, effective time,
assurance, and separation of duty. External provider results are submissions until
accepted. Every release, rejection, repair, technique/procedure change, override,
and acceptance is audited. Equipment/media ingestion uses isolated files and durable
jobs.

## Migration and rollback

Add procedure/qualification references first, then weld/joint/execution, NDE,
PWHT, and test-package tables/collections with reversible structural migrations.
Seed only permissions/code identifiers. Disable incomplete commands/adapters during
rollback while retaining controlled records and audit; accepted history is never
silently removed.

## Validation evidence

Required: WPS/WPQ applicability boundaries, material/drawing linkage, qualification
expiry/continuity, fit-up/weld/visual history, NDE personnel/equipment/procedure and
repair cycles, PWHT chart/thermocouple/calibration/interruption, pressure/leak test
readiness/restoration, independent acceptance, failed-path NCR/hold, PostgreSQL
restart/concurrency/restore, field tablet/accessibility, and exact turnover manifest.

## Supersedes / superseded by

None. This proposal extends ADR-0003 through ADR-0008 and the existing PMI/
inspection/deficiency/turnover model.
