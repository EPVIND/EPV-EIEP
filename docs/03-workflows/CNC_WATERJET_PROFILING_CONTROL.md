# CNC, Waterjet, and Profiling Control

Status: Locally implemented controlled pilot; direct machine control prohibited
Last updated: 2026-07-21
Requirements: FR-CNC-001 through FR-CNC-006

## Purpose

Control the handoff from an exact approved detail/model/drawing and fabrication
assembly revision into a machine-neutral program package, independent review and
release, operator download, execution evidence, material genealogy, exception
reconciliation, and fabrication-traveler completion.

The module prepares and verifies governed information. It does not start, stop,
configure, interlock, or otherwise control a saw, drill line, plasma table,
oxy-fuel table, waterjet, laser, coping machine, robot, or other equipment.

## Supported pilot processes

- Saw cut and miter.
- Drill, punch, slot, and countersink definition.
- Plasma, oxy-fuel, laser, and waterjet profile cutting.
- Cope, notch, bevel, scribe/mark, and part-identification operations.
- Machine-neutral program package exchange for pipe, plate, shape, bar, and custom
  profile work.

DSTV/NC1, DXF, STEP, IFC, Tekla, SDS2, Advance Steel, and vendor-native files may be
retained as protected source evidence, but no format is claimed as supported until
its versioned parser/mapping and representative owner fixture pass controlled tests.

## Authoritative records

| Record | Authority retained |
|---|---|
| Source file/document revision | Exact released design/detail/model bytes, revision, hash, and project applicability |
| Fabrication assembly revision | Approved piece/assembly, BOM/cut list, drawing, material, weld, inspection, work-package, and boundary scope |
| Material item | Heat/lot, specification/grade/form/dimensions, available quantity, state, location, and parent/child genealogy |
| Machine profile revision | Owner-approved capabilities, units, coordinate rules, dimensional envelope, feature support, postprocessor identity, and effective state |
| CNC program revision | Immutable source/assembly/material/profile mapping, normalized geometry/operations, validation findings, and deterministic package hash |
| CNC job release | Exact independently approved program version released for a named work center without commanding the machine |
| CNC execution record | Operator, machine/work center, event times, exact downloaded hash, quantities, result, remnants/scrap, evidence, and exceptions |
| Reconciliation | Independent comparison of planned versus actual pieces/operations/material, linked NCR/inspection, and acceptance/rejection |

## Controlled lifecycle

1. **Register machine profile.** An authorized configuration owner proposes a
   versioned work-center profile with approved units, coordinate convention,
   supported stock/process/feature codes, envelope limits, postprocessor name and
   version, and effective interval. A separate technical authority approves it.
2. **Create program revision.** A planner selects an approved fabrication revision,
   released source file/document revision, exact material item, piece mark/quantity,
   approved machine profile, source format/version/hash, and declared normalized
   operations.
3. **Validate preview.** The server recalculates deterministic normalized content,
   verifies file/hash/revision, material/assembly scope, units, stock/envelope,
   feature support, operation identity/order, geometry bounds, quantity, and machine
   profile applicability. Every error or warning is preserved by stable code.
4. **Submit and independently approve.** Submission freezes the previewed program
   revision. A qualified CNC technical authority other than the creator validates
   the exact source, normalized geometry, warnings, and expected output hash.
5. **Release job.** A separate shop release authority verifies the approved current
   program, current machine profile, released/issued material, open dispositions,
   exact fabrication traveler operation, and a still-identical deterministic job
   package. Release creates an immutable download artifact; it does not transmit to
   or operate equipment.
6. **Download.** An authorized operator downloads the exact released artifact. The
   server reauthorizes the operator, project, work center, and release state and
   audits the content hash at download time.
7. **Record execution.** A qualified operator records start/completion, exact
   downloaded artifact hash, machine/work center, actual quantity, consumed source
   material, produced child pieces/remnants, scrap, evidence, event times, and
   result. Hash mismatch or unsafe/unreleased state fails closed.
8. **Reconcile.** An independent quality/production authority compares planned and
   actual identity, quantity, operations, material genealogy, inspection results,
   and exceptions. Rejection links an NCR/hold; acceptance may satisfy the exact
   fabrication traveler operation but does not accept the assembly or close turnover.

## Validation findings

Errors block submission, approval, release, and download. Warnings require an
explicit technical-review disposition before approval.

| Finding | Minimum meaning |
|---|---|
| `source_hash_mismatch` | Retained source bytes do not match the declared fingerprint |
| `source_revision_not_released` | Design/detail/model revision is not current and released for the project |
| `assembly_not_approved` | Fabrication revision is not approved/current for program preparation |
| `piece_not_in_bom` | Piece mark or quantity cannot be reconciled to the exact assembly BOM/cut list |
| `material_scope_mismatch` | Material item is outside assembly/program scope or incompatible with declared stock |
| `machine_profile_not_active` | Work-center capability revision is not independently approved/effective |
| `unit_or_coordinate_unsupported` | Declared units or coordinate convention are outside the selected profile |
| `stock_envelope_exceeded` | Stock dimensions or normalized geometry exceed approved profile limits |
| `feature_unsupported` | Hole, slot, bevel, cope, mark, or profile feature is outside the approved feature set |
| `geometry_out_of_bounds` | Operation geometry cannot fit the exact declared stock with configured tolerance |
| `quantity_mismatch` | Planned parts cannot reconcile to assembly/material quantity |
| `open_material_or_quality_hold` | Material, assembly, inspection, or linked NCR state blocks release |
| `artifact_hash_changed` | Recalculated machine-neutral package differs from the independently approved hash |

No validation result is a machine-safety certification or a substitute for the
machine manufacturer's limits, operator procedure, guarding, interlock, lockout/
tagout, hazard analysis, training, or competent-person judgment.

## Machine-neutral package

The pilot package is deterministic UTF-8 JSON with a versioned schema and contains:

- EIEP program/revision, project, assembly, material, piece, traveler-operation, and
  machine-profile stable IDs;
- exact released source file/document revision, source format/version/SHA-256, and
  postprocessor identity/version;
- governed units, coordinate convention, stock form/dimensions, quantity, and
  normalized ordered operations;
- validation schema/rule version, warning dispositions, approval/release identity,
  creation time, and canonical package SHA-256.

Vendor-native or machine-executable content is never synthesized without a
separately approved postprocessor contract, fixture corpus, sandbox/offline proving,
licensing review, and production authorization. Even then, operator-controlled
transfer remains distinct from machine control.

## Permission and separation matrix

| Action | Minimum assurance | Required authority/qualification | Independence |
|---|---|---|---|
| Read program/job | Standard | `cnc.read` | Exact assigned project/object/work center |
| Manage machine profile | MFA | `cnc.profile.manage` | Draft version only |
| Approve machine profile | Step-up | `cnc_profile_authority` | Not profile creator |
| Create/preview program | MFA | `cnc.program.plan` | Exact approved assembly/source/material scope |
| Approve/reject program | Step-up | `cnc_technical_authority` | Not creator or submitter |
| Release job | Step-up | `cnc_release_authority` | Not profile/program creator or technical reviewer |
| Download released package | MFA | `cnc.job.download` plus operator qualification | Exact release/work center/current hash |
| Record execution | MFA | `cnc.execute` plus process/work-center qualification | Exact downloaded release/hash |
| Reconcile execution | Step-up | `cnc_reconciliation_authority` | Not planner, reviewer, releaser, downloader, or operator |

## Production boundary

Controlled-pilot completion requires source-file protection, exact revision/hash,
versioned machine profile, deterministic machine-neutral package, independent
approval/release/reconciliation, scoped API/download, PostgreSQL restart, audit,
negative authorization/state/hash tests, and a visible tablet/desktop workflow.

Production promotion additionally requires named owner engineering, shop,
operations, safety, quality, security, and records approval; approved machines and
work centers; representative format fixtures and geometry corpus; parser/
postprocessor licensing; vendor/manufacturer constraints; offline proving; physical
device and network validation; backup/recovery; training; and a separately accepted
deployment. Direct machine control remains prohibited unless a future controlled
change establishes an industrial-control safety architecture outside this module.
