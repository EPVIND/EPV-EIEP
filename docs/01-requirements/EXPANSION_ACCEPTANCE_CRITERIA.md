# Enterprise Expansion Acceptance Criteria

Status: EX-AC-01 through EX-AC-08 and EX-AC-10/EX-AC-11/EX-AC-12 have local controlled-pilot evidence
and are promoted through AC-11/AC-12/AC-13/AC-14/AC-16/AC-17/AC-18. The command-center subset
is promoted through AC-15; EX-AC-09 remains proposed for its external and production evidence.
Date: 2026-07-21

## EX-AC-01 Advanced estimate lifecycle

- An authorized estimator creates a scoped estimate and a hierarchical revision from
  governed cost codes and assemblies; all labor/material/equipment/subcontract/
  allowance calculations reproduce exactly from stored inputs and rounding rules.
- Submission freezes the revision. A separate authorized reviewer can approve or
  reject the exact version; the author cannot satisfy an independence requirement.
- A revision produces a complete added/removed/changed delta without mutating its
  predecessor.

## EX-AC-02 Productivity and quote comparison

- A base assembly remains distinguishable from applied productivity, condition, and
  escalation factors, with source/justification and independent approval.
- At least three differently structured quotes can be normalized to the bid scope;
  missing scope, exclusions, qualifications, alternates, currency, validity, freight,
  and tax remain visible and block an unexplained equivalence/selection claim.
- Quote files and mappings are exact-version, authorized, malware/file-policy
  compliant, versioned, and audit linked.

## EX-AC-03 Proposal and award handoff

- Proposal generation freezes the exact approved estimate revision, adjustments,
  assumptions, exclusions, terms, price, source hashes, and artifact manifest.
- Award creates project cost/procurement/schedule/work-package mappings from the
  frozen source and reconciles every source amount/quantity or records an approved
  exception. Later project changes do not rewrite the estimate or proposal.

## EX-AC-04 Project controls and change

- Approved cost/quantity/schedule baselines are immutable and mapped to WBS, work
  package, cost code, responsible organization, and source estimate.
- Commitments, actuals, accruals, approved changes, forecast, EAC, variance,
  contingency, and reserve reconcile by period and source without double counting.
- Pending/rejected change and progress claims do not alter accepted baseline,
  quality, invoice, or payment state. Configured independent verification is enforced.

## EX-AC-05 Procurement and scheduling

- Requisition through bid comparison, recommendation, award/PO revision, expediting,
  shipment, and receipt retains exact requirement/document, quantity/unit, cost,
  work-package, approval, vendor, and turnover links.
- A schedule baseline and two updates preserve data dates, actuals, logic/constraint
  changes, forecasts, variance, source IDs, and reasons. Look-ahead constraints link
  current documents, material, inspection, and responsible parties.
- P6/Project import preview rejects unmapped/duplicate/cross-project/conflicting data;
  exact retry is idempotent and imported data cannot self-approve a baseline.

## EX-AC-06 Welding execution

- An exact material/component/drawing/WPS-qualified weld progresses through fit-up,
  welding, visual, required NDE/PWHT, repair where applicable, and final acceptance
  with complete welder/consumable/observation history.
- Wrong or superseded WPS, expired/inapplicable qualification, held material,
  incomplete required examination, or open rejection denies release and explains why.

## EX-AC-07 NDE, PWHT, and test packages

- NDE method/procedure/personnel/equipment validity, indication/result evidence,
  independent acceptance, repair cycle, and exact affected weld/component are
  preserved without treating a file or provider status as acceptance.
- PWHT cycle requirements, thermocouples/readings/chart, calibration, interruption,
  review, and affected welds satisfy configured gates or remain explicit blockers.
- A pressure/leak/functional test package proves boundary, prerequisites, gauges,
  witnesses, result, deficiencies, restoration, acceptance, and turnover inclusion.

## EX-AC-08 Bluebeam collaboration

- An approved fixture representing a Bluebeam session/export previews mappings and
  atomically imports exact revision-linked markups, comments/replies, authors,
  locations, statuses, timestamps, and provider/source identifiers.
- Exact retry creates no duplicate; changed-source conflict, unassigned project,
  unmapped user/document, unsupported content, oversized/malicious file, and provider
  status claiming EIEP acceptance all fail closed with safe reconciliation evidence.
- A live vendor sandbox exercise is required before any production outbound/write
  integration is enabled.

## EX-AC-09 Cross-module security, recovery, and usability

- Commercial, quality, and integration permissions pass positive, horizontal,
  vertical, expired/revoked, separation-of-duty, search/count/export/file, and direct
  identifier tests.
- PostgreSQL restart, rollback, concurrency, backup/restore, audit hashes, outbox/job,
  and representative estimate/schedule/weld volume preserve exact relationships.
- Estimating/project-control grids pass approved desktop keyboard/zoom/reflow and
  accessibility checks; field execution passes the supported tablet boundary.
- Production authorization still requires named product, estimating/commercial,
  procurement/project-controls, industrial/QC, welding/NDE/PWHT/testing, security,
  records, operations, vendor/integration, and production owners.

## EX-AC-10 Fabrication and spool control

- A representative pipe-spool revision retains exact released drawing/material/weld/
  inspection/boundary, BOM, cut-list, and source lineage and receives an independent
  engineering disposition without overwriting its parent.
- An independently released traveler executes at least two qualified sequenced
  operations, including an explicit hold point, append-only evidence, performer
  self-release denial, and separate hold-authority release.
- Final operation completion changes fabrication state but not quality acceptance;
  acceptance fails until exact inspection, weld, NCR, traveler, version, and
  separation-of-duty prerequisites pass.
- API authentication/scope, command-center task projection, generic normalized
  PostgreSQL restart, tablet workflow, accessibility, and audit evidence pass
  locally. Dedicated production tables, owner configuration, representative volume,
  deployed shop validation, and named approvals remain external.

## EX-AC-11 CNC, waterjet, and profiling control

- A representative approved machine profile preserves the exact capability envelope,
  units, coordinates, postprocessor version, effective interval, and independent
  authority; profile authors cannot approve their own revision.
- A machine-neutral program retains exact released source file/revision/hash,
  fabrication assembly, traveler operation, material/BOM piece, profile, stock,
  ordered normalized operations, validation-rule version, findings, and deterministic
  package hash. Any unsupported or changed prerequisite blocks submission or release.
- Independent technical approval and independent job release produce an integrity-
  checked, auditable artifact explicitly marked as providing no direct machine
  control. Operator download is separately authorized and audited.
- Execution rejects a different artifact hash/work center, invalid operator scope,
  inconsistent quantities/results, unsafe evidence, cross-project exceptions, or
  broken produced/remnant material genealogy. Reconciliation requires a separate
  authority and closed exceptions before acceptance.
- Authenticated API scope, safe schema validation, exact positive/negative lifecycle,
  command-center tasks, record-normalized persistence, tablet accessibility, and
  audit evidence pass locally. Representative machines/files, owner profiles,
  physical production tables/volume, field validation, and named approvals remain
  external production gates.

## EX-AC-12 Multidisciplinary engineering registers

- Requirement, deliverable, system, equipment, line, instrument, component, and tag
  revisions preserve stable project identity, parent/reason, exact scope and source
  relationships, controlled attributes, validation findings, canonical hash, and
  attributable lifecycle history.
- Invalid structures, organizations, documents, relationships, required system/date/
  actual-issue evidence, duplicate revision, stale version, or self-approval fail
  closed with no cross-project disclosure.
- An independently approved successor supersedes rather than overwrites its parent;
  permission-scoped projections distinguish every class, current approval, findings,
  and no-data state without seeded demonstration records.
