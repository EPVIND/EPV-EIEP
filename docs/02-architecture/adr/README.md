# Architecture Decision Records

Use one Markdown file per significant decision. Name files `NNNN-short-title.md` and never rewrite accepted history; supersede it with a new ADR.

## Template

```text
# ADR-NNNN: Decision title

Status: Proposed | Accepted | Superseded | Rejected
Date:
Decision owners:
Requirements affected:

## Context
## Decision drivers
## Considered options
## Decision
## Consequences and risks
## Security, data, and operations impact
## Migration and rollback
## Validation evidence
## Supersedes / superseded by
```

## Initial ADR queue

All initial decisions were drafted on 2026-07-20 and remain Proposed pending the
owners named in each record:

1. `0001-application-architecture-and-stack.md`.
2. `0002-identity-and-tenant-boundary.md`.
3. `0003-postgresql-and-migrations.md`.
4. `0004-object-storage-and-file-safety.md`.
5. `0005-audit-and-electronic-signatures.md`.
6. `0006-jobs-events-and-api-versioning.md`.
7. `0007-offline-and-connectivity.md`.
8. `0008-search-and-reporting.md`.
9. `0009-azure-environments-and-recovery.md`.
10. `0010-turnover-pdf-and-preservation.md`.
11. `0011-estimating-project-controls-and-procurement.md`.
12. `0012-bluebeam-document-collaboration.md`.
13. `0013-welding-nde-pwht-and-testing.md`.

Do not implement a proposal as though it were production-approved. The first
scaffold may exercise these proposals for review; production promotion remains
blocked until the required approvals and validation evidence are recorded.
