# Fabrication and Spool Control

Status: Controlled pilot workflow; production authorization pending  
Last updated: 2026-07-21  
Requirements: FR-FAB-001 through FR-FAB-006

## Purpose

Control the path from an exact released fabrication definition through engineering
review, shop release, sequenced execution, hold disposition, completion, and
independent quality acceptance. The workflow covers pipe spools, structural
assemblies, equipment skids, and modules without replacing document control,
material genealogy, welding/NDE, inspection, NCR, or turnover authority.

## Authoritative records

| Record | Authority retained |
|---|---|
| Fabrication assembly revision | Immutable revision lineage, project/boundary scope, exact source and execution inputs |
| BOM and cut list | Material-item mapping, piece marks, quantities/units, and controlled cut geometry |
| Shop traveler | Revision-controlled operation route, qualifications, procedures, scope, hours, and hold points |
| Execution event | Append-only actor/time/result/quantity/observation/evidence history for one traveler operation |
| Document revision | Current released fabrication drawing/procedure status |
| Material item | Heat/lot identity, release/issue state, quantity, location, and genealogy |
| Weld joint | Exact drawing/material/component relationship, WPS, execution, examination, PWHT, repair, and release |
| Inspection/NCR | Independent acceptance and unresolved-deficiency authority |
| Completion boundary | Project-configured completion and turnover scope |

The fabrication module references these records by stable ID. It does not copy their
status into editable fabrication fields or use a dashboard value as release evidence.

## Controlled lifecycle

1. **Define revision.** A planner creates a draft assembly revision with number,
   type, revision reason, project structure, completion boundary, released drawings,
   material items, welds, inspections, BOM, and cut list. A model import additionally
   requires a source version and SHA-256 fingerprint.
2. **Submit.** Submission freezes the draft for independent engineering review.
3. **Engineer disposition.** A qualified engineering authority other than the
   creator/submitter approves or rejects the exact version. A successor revision
   links its parent and reason; an executing parent cannot be silently superseded.
4. **Create traveler.** The planner defines ordered operations with stable keys,
   sequence, operation type, work center, planned hours, qualifications, exact
   procedure revision, material/weld scope, instructions, and hold-point flag.
5. **Release to shop.** An independent fabrication release authority verifies the
   approved assembly and current traveler versions plus released drawings/material,
   planned weld linkage, and exact operation scope. Assembly and traveler release in
   one transaction.
6. **Execute.** Qualified performers append start, complete, hold, rework, or scrap
   events. Operations execute in sequence. Completion uses `pass`; start, hold,
   hold-release, and rework use `observed`; scrap uses `fail`.
7. **Release hold.** A current unresolved hold may be released only by a step-up
   fabrication hold authority independent of the operation's prior performers.
8. **Complete fabrication.** The final valid operation completion sets the traveler
   to complete and the assembly to fabrication complete. This is not acceptance.
9. **Quality accept.** A separate step-up fabrication quality authority verifies the
   complete traveler, accepted required inspections, released welds, material scope,
   no open affected NCR, and separation from all planning/review/release/execution
   actors before accepting the assembly.

## Release gate

Shop release fails closed if any of the following is true:

- assembly is not independently approved at the expected version;
- traveler is absent, not draft, stale, empty, duplicated, or out of sequence;
- drawing or procedure revision is not current, released, and project-applicable;
- material item is outside the exact assembly scope or is not released/issued;
- weld is outside the assembly, wrong project/drawing/material/component scope, or
  not in its planned pre-execution state;
- traveler operation material or weld scope is outside the assembly revision;
- a required operation qualification, work center, instruction, or planned-hours
  value is absent;
- releaser violates the engineering/planning/traveler separation-of-duty boundary.

## Execution rules

- Events are inserted; previous events are never updated or deleted by normal
  workflow actions.
- Traveler event sequence is monotonically assigned within the transaction.
- An operation must be started once before another event can be recorded.
- A prior operation must have a valid complete event before a later operation starts.
- A held traveler blocks operation completion until an independent release-hold
  event resolves the current operation hold.
- A hold-point operation requires its explicit release-hold event before completion.
- Non-start events require released governed evidence files.
- Expected traveler version prevents concurrent actors from overwriting state.
- Rework and scrap place the traveler on hold for controlled disposition; they do
  not manufacture engineering or NCR closure authority.

## Quality-acceptance gate

Acceptance fails closed when:

- traveler is absent or not complete;
- assembly is not in fabrication-complete state at the expected version;
- a required inspection is missing, not independently accepted, or not `pass`;
- an assembly weld is not released after its current repair/examination cycle;
- an open NCR affects the assembly, its material, or its welds;
- the proposed acceptor created, submitted, reviewed, released, planned, or executed
  the controlled work.

## Permission and assurance matrix

| Action | Minimum assurance | Required authority/qualification | Independence |
|---|---|---|---|
| Read workspace | Standard | `fabrication.read` | Exact assigned project/object |
| Plan / submit | MFA | `fabrication.plan`, `fabrication.submit` | Current editable version |
| Engineering approve/reject | Step-up | `fabrication_engineering_authority` | Not creator or submitter |
| Create traveler | MFA | `fabrication.traveler.create` | Approved exact assembly |
| Release to shop | Step-up | `fabrication_release_authority` | Not planner, submitter, reviewer, or traveler author |
| Execute operation | MFA | Operation qualification codes | Issued exact operation and sequence |
| Release hold | Step-up | `fabrication_hold_authority` | Not a performer on the held operation |
| Quality accept | Step-up | `fabrication_quality_authority` | Not a planning, review, release, traveler, or execution actor |

## Connected projections

- The command center counts only fabrication revisions visible under
  `fabrication.read` and offers only actions the current actor may presently perform.
- Under-review assemblies, shop-release work, active holds, and quality acceptance
  appear as source-linked tasks; opening a task does not pre-authorize its command.
- Accepted fabrication can satisfy completion/turnover requirements only through
  configured exact source links. Fabrication complete alone cannot.
- Schedule/progress integrations may consume accepted quantities or governed field
  claims but cannot transform a shop event into accepted project progress.

## Pilot and production boundary

The controlled pilot includes the domain service, authenticated/scoped API, visible
tablet workspace, command-center projection, generic normalized PostgreSQL
persistence, optimistic concurrency, audit, and automated positive/negative tests.
Production promotion additionally requires dedicated normalized fabrication tables
and indexes, migration/rollback and volume evidence, approved owner numbering and
work-center dictionaries, representative spool/structural data, controlled shop
devices, qualification assignments, drawing/model mappings, field usability, and
named engineering/fabrication/quality acceptance.

