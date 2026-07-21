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

## Production authorization

MVP acceptance requires documented approval by the product owner, industrial/QC authority, security authority, and designated production owner. Passing tests alone does not authorize live use.
