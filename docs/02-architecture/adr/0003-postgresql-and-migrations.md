# ADR-0003: Relational database and migration strategy

Status: Proposed  
Date: 2026-07-20  
Decision owners: Solution/data architect, delivery lead, operations owner  
Requirements affected: FR-AUD-001 through FR-INT-003, NFR-REL-001 through
NFR-DAT-003

## Context

The vertical slice requires shared stable identities, exact revision links,
material genealogy, release constraints, record history, and package integrity.

## Decision drivers

- Strong transactions and constraints.
- Relational traceability and recursive genealogy queries.
- Portable durable exports and mature recovery tooling.
- Explicit, reviewable, reproducible schema change.

## Considered options

- PostgreSQL relational system of record.
- Microsoft SQL Server.
- Document database as primary store.
- Multiple databases per domain from the first increment.

## Decision

Propose PostgreSQL 18 on the current supported minor. Use one database per
environment with module-owned schemas/tables and explicit foreign-key contracts.
Use opaque stable IDs, `timestamptz` UTC storage, explicit state, optimistic
concurrency versions, check/unique/foreign-key constraints, and transactions.

Store migrations under `packages/database/migrations`. Apply ordered forward
migrations through a dedicated migration identity during deployment, never from
normal application startup. Migrations must record version/checksum and use a
tested roll-forward or restore strategy. No production schema is edited manually.

## Consequences and risks

- Cross-module invariants can remain transactional.
- Schema and SQL skills are required; uncontrolled JSON columns or cross-module
  table access could weaken the model.
- A single database is a shared failure domain, addressed through managed
  availability, monitored backup, restore testing, and careful connection limits.

## Security, data, and operations impact

Use separate migration, application, worker, audit-writer, reporting, and operator
roles. Normal application roles cannot update/delete audit history. Parameterize all
queries. Protect network access, encryption, backups, credentials/managed identity,
and privileged statements.

For the proposed Entra-only Azure service, API and worker connection pools obtain a
short-lived token for each new connection and use it as the PostgreSQL password while
enforcing certificate verification. Passwords and connection-string TLS overrides
are rejected on that path. Migration/verification tools use the same token contract;
an administrator-only idempotent bootstrap verifies exact Entra object IDs before
granting distinct identities membership in `eiep_runtime` and `eiep_job_worker`.

## Migration and rollback

Prefer expand/migrate/contract changes. Separate destructive cleanup from schema
introduction. Back up and rehearse representative volume before production-impacting
migrations. Restore or roll forward under an approved change; never silently edit
controlled records to force rollback.

## Validation evidence

Migration up/checksum tests, constraint and concurrency tests, representative-volume
timing, permission tests, backup/restore rehearsal, genealogy-cycle tests, and
current-revision uniqueness tests.

Local review evidence currently includes fourteen reversible migrations, 61 named
controls, a typed record-normalized repository with optimistic row revisions,
serializable retry, rollback/restart/hydration checks, a 2,000-record guard, dynamic
Entra-token/TLS configuration tests, and compiled Entra administrator/Key Vault role
controls. This evidence does not accept this ADR or replace live token, principal,
managed-service, or pilot validation.

## Supersedes / superseded by

None.
