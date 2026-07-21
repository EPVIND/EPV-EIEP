# Pilot Project Test Plan

## Objective

Validate the first operational vertical slice using a controlled training rehearsal followed by an approved real project. The pilot proves usability, traceability, authorization, auditability, recovery, and turnover integrity.

## Recommended scenario

- One small pressure-equipment or exchanger-related scope.
- Several pipe spools with traceable material and weld references.
- One structural support or small pipe-rack assembly.
- One concrete equipment foundation.
- One subcontractor and one lower-tier disclosure scenario.
- Material receipts, heat/lot and MTR records, PMI pass and fail cases, inspections, one NCR, punch items, and a turnover package.
- A compact system/WBS/work-package structure and current/superseded drawing revisions.

## Test phases

1. Repository/build verification on a clean supported workstation.
2. Automated unit, integration, authorization, migration, API contract, and package-integrity tests.
3. Training-environment end-to-end rehearsal with synthetic data.
4. Security review, threat-model verification, dependency/secret/static scans, and scoped penetration test.
5. Performance, tablet, accessibility, intermittent-connectivity, file-size, and export tests.
6. Backup and coordinated restore rehearsal.
7. User acceptance with project, document control, receiving, QC, subcontractor, turnover, and administrator participants.
8. Approved real-project controlled pilot and post-pilot review.

## Critical scenarios

- Unauthorized project lookup, direct file URL, export, approval, and admin action are denied and audited.
- Superseded drawing disappears from current-for-work view while history remains.
- Material with missing MTR, required PMI, expired verification, failed PMI, quarantine, or open NCR cannot be issued/released.
- Cut piece and remnant trace to the parent heat and MTR.
- Failed PMI creates/link an NCR; disposition and reinspection preserve full history.
- Subcontractor with missing prerequisite cannot mobilize or see unrelated scope.
- Turnover excludes rejected/superseded/training records and identifies missing requirements.
- Package regeneration retains prior version and manifest comparison.
- Restore recovers database, files, permissions, audit, and package relationships.

## Evidence

Record test case, requirement, environment/build, data set, tester, time, expected/actual result, screenshots/log references where appropriate, defect, retest, and approval. Do not use customer confidential data in screenshots or defect systems unless approved.

## Exit criteria

- All MVP acceptance criteria have approved evidence.
- No unresolved critical/high security or data-integrity defect.
- No unresolved defect that permits wrong revision, unauthorized access/release, broken traceability, or incorrect turnover.
- Recovery, support, monitoring, training, and rollback are ready.
- Product owner, industrial/QC authority, security authority, and production owner approve go-live.

