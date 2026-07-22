# MVP Acceptance Criteria

## AC-01 Repository and environments

- The controlled repository builds from documented commands on a clean supported workstation.
- Development, test, training, and production use separate configuration and data resources.
- Automated checks prevent training/demo data and secrets from entering a production build.

## AC-02 Identity and access

- MFA and identity lifecycle operate according to the approved identity ADR.
- Project and object authorization tests pass for internal, subcontractor, client, and administrator roles.
- Direct URL/identifier, search, export, and file-download tests show no unassigned data leakage.

## AC-03 Audit and controlled records

- Required state changes show actor, time, prior/new value, reason, project, and source correlation where applicable.
- A controlled record cannot be silently overwritten or physically deleted through normal use.
- Audit evidence is queryable by authorized users and protected from application-user alteration.

## AC-04 Project and documents

- An administrator creates the pilot project, systems, areas, WBS, responsibilities, and turnover index.
- Users see only the current released revision for work while authorized reviewers can retrieve history.
- Superseding a drawing immediately removes the prior revision from current-for-work views and records distribution/audit evidence.

## AC-05 Materials and MTRs

- Receiving records the pilot material, MTR, heat/lot, dimensions, quantity, source, evidence, identifier, and location.
- Cut-piece genealogy preserves the parent heat/lot and MTR relationship.
- Quarantined material cannot be issued or selected for authorized work.

## AC-06 PMI and inspection

- The project rule identifies whether PMI is required and displays the reason.
- Valid PMI can be completed only with the required instrument, verification/calibration, inspector, evidence, and result fields.
- Expired verification, failed result, missing MTR, or incomplete required PMI blocks release.
- A failed result quarantines affected material and creates or links an NCR without duplicating the material.

## AC-07 NCR and punch

- The pilot NCR progresses through containment, disposition, required approvals, reinspection, and closure with complete history.
- Invalid transitions and unauthorized disposition/closure are rejected.
- Punch items remain visible to completion/turnover until verified or formally transferred by approved rule.

## AC-08 Subcontractor

- A subcontractor cannot mobilize when a configured prerequisite is missing or expired.
- A subcontractor user accesses only assigned work and submits evidence into EPV-controlled review.
- EPV acceptance remains distinct from subcontractor submission.

## AC-09 Turnover

- The package status identifies every required missing, rejected, superseded, accepted, and not-applicable item.
- Generation includes only authorized current accepted records and a versioned manifest with source identifiers and hashes.
- Regeneration retains the prior package and identifies what changed.

## AC-10 Operations and recovery

- Monitoring, backup, restore, incident, and support runbooks are tested before production authorization.
- The pilot restore meets approved recovery objectives and preserves files, relationships, audit history, and permissions.
- Representative load, tablet, accessibility, intermittent-connectivity, and large-export tests meet approved budgets or have accepted remediation plans.

## AC-11 Advanced estimating and proposal handoff

- Governed assemblies and independently approved effective productivity factors reproduce exact labor/material/equipment/subcontract/allowance calculations and adjustment rounding.
- Submitted revisions are immutable and independently reviewed; a successor shows exact added, removed, and changed lines.
- Quote comparison preserves scope gaps, qualifications, source identity/hash, validity, and independently justified selection rather than implying lowest price is equivalent scope.
- An independently approved/issued proposal freezes source and artifact hashes; award handoff reconciles exact direct and adjustment categories to a same-scope project without mutating the source.

## AC-12 Project controls, procurement, and scheduling

- An awarded estimate handoff produces an exact, independently approved project cost/quantity baseline; an approved change produces a successor without rewriting either source.
- Period actuals, accruals, forecast, accepted earned progress, commitments, EAC, variance, contingency, and reserve remain distinct and reproducible, while progress does not imply quality or invoice acceptance.
- Requisition, comparative offers, independent recommendation, thresholded award, PO revision, expediting, released source evidence, and controlled receiving linkage remain attributable and version checked.
- An independently approved schedule baseline and at least two updates retain logic, actual/claim/accepted progress, constraints, source identifiers, and baseline variance; look-ahead is derived from the current approved revision.
- P6 and Microsoft Project fixtures preview duplicate/conflict/mapping failures, commit exact retries idempotently, and cannot bypass independent schedule approval. Live provider credentials and sandbox acceptance remain production gates.

## AC-13 Welding, NDE, PWHT, and testing

- An exact material/component/drawing/WPS-qualified weld progresses through fit-up, preheat/interpass observation, qualified welding, independent visual examination, required NDE/PWHT, repair where applicable, and separately authorized release with immutable event and repair-cycle history.
- Wrong/inapplicable WPS, expired or out-of-range qualification, held material, stale repair-cycle examination, rejected result, incomplete NDE/PWHT, open NCR, or performer self-release is denied with explicit blockers.
- NDE preserves exact request/technique/personnel/equipment/media/conditions/indications/report revision and an independent review that distinguishes accepting the report from the report's accept/reject result.
- PWHT preserves exact weld scope, procedure, parameters, thermocouple tolerances, valid equipment, chart/evidence, interruptions, result, and independent acceptance.
- Pressure/leak/functional test readiness derives from the exact completion boundary, released welds/documents, valid gauges, prerequisites, safety references, and deficiencies; execution and acceptance remain separate and preserve result evidence plus restoration confirmation.

## AC-14 Bluebeam and provider-neutral document collaboration

- A protected representative Bluebeam export previews and atomically commits exact project/session/source/document-revision/user/organization/status mappings plus markup, comment, reply, page, region, appearance, and timestamps.
- Exact retries do not duplicate evidence; changed source, unmapped identity/document/status, invalid parent/region/time, unsupported content, unsafe file, and cross-project/direct-identifier access fail closed with safe reconciliation evidence.
- Provider completion/approval remains evidence-only, while independent step-up EIEP review is version checked, audited, separated from importer/provider author, and cannot rewrite the controlled document revision.
- The operator workspace exposes import, reconciliation, review, source lineage, and an explicit disabled outbound boundary; a live vendor sandbox and all named provider gates remain required before any write operation exists.

## AC-15 Unified enterprise command center

- A scoped user sees only authorized current source records in dashboard counts and module-health projections; revoking the underlying read scope removes those counts without disclosing their existence.
- The user work queue contains only explicitly owned or currently authorized actions and preserves exact source identity/version, due/overdue state, and deterministic priority; another user's owned work is never relabeled as “mine.”
- Schedule progress derives from the exact current approved revision and accepted activity progress, identifies late work, retains the source revision IDs, and returns no percentage when no authorized activities exist.
- Recent activity requires separate audit-read authority and exposes only safe actor/time/action/object/prior/new-state fields with authoritative module drill-through.
- The tablet command center supports module and priority filters, module-health drill-through, quick actions, 44-pixel controls, and no serious or critical automated accessibility findings.

## AC-16 Fabrication and spool control

- A pipe-spool revision preserves immutable parent/reason and exact released drawing, material, weld, inspection, project-structure, completion-boundary, BOM, and cut-list lineage; a model import additionally preserves version and SHA-256.
- Independent engineering approval and shop release enforce exact version/state, required authority, scope, assurance, and separation from creators, submitters, reviewers, and traveler authors; an executing parent cannot be silently superseded.
- A released traveler preserves ordered operations, qualifications, exact procedure revision, material/weld scope, hours, instructions, and hold points. Qualified execution appends immutable, sequential actor/time/result/quantity/evidence events and blocks out-of-order work.
- A hold blocks completion until a separate step-up hold authority resolves the current hold; the operation's performer cannot self-release it.
- Fabrication completion remains distinct from quality acceptance. Acceptance is denied for incomplete traveler, missing/rejected inspection, unreleased weld, open affected NCR, stale version, or quality-authority separation-of-duty failure.
- The authenticated tablet workspace and command center expose exact source state and currently authorized tasks with no serious or critical automated accessibility findings.

## Production authorization

MVP acceptance requires documented approval by the product owner, industrial/QC authority, security authority, and designated production owner. Passing tests alone does not authorize live use.
