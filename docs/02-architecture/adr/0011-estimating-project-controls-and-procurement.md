# ADR-0011: Estimating, Project Controls, Procurement, and Scheduling Boundary

Status: Proposed  
Date: 2026-07-21  
Decision owners: Product owner, estimating/commercial authority, procurement authority,
project-controls authority, solution architect, security/privacy authority  
Requirements affected: FR-EST-001 through FR-EST-010, FR-PJC-001 through
FR-PJC-004, FR-PRC-001 through FR-PRC-003, FR-SCH-001 through FR-SCH-004

## Context

EIEP needs advanced estimating and downstream controls quickly without creating a
second organization, project, WBS, work-package, document, material, file, access,
or audit model. Approved estimate inputs must remain distinct from awarded project
baselines and later execution changes.

## Decision drivers

- Exact reproducible commercial calculations and revisions.
- Reusable governed assemblies/productivity knowledge without hard-coded rates.
- Visible quote scope normalization and qualifications.
- Immutable proposal and award handoff.
- Shared WBS/cost/work-package identities across estimate, procurement, schedule,
  progress, quality, and turnover.
- Provider-neutral import/export and finance/schedule integration boundaries.

## Considered options

- Embed estimate/control data in generic project JSON configuration.
- Separate estimating and project-control applications/databases.
- Extend the EIEP modular monolith and shared PostgreSQL repository with owned module
  records and published handoff contracts.
- Make an ERP or scheduling provider the immediate system of record.

## Decision

Propose dedicated `estimating`, `controls`, `procurement`, and `scheduling` modules in
the existing modular monolith and repository. They reference shared organizations,
facilities, projects, WBS, work packages, documents/files, requirements, users, and
audit records by stable IDs; they never recreate those masters.

An estimate exists in business-organization scope before award. Each revision owns a
hierarchical breakdown and exact decimal calculation inputs. Catalog cost codes,
assemblies, crews, rates, and productivity factors are independently versioned,
effective-dated governed configuration; estimate revisions freeze copied calculation
inputs and their catalog provenance so catalog changes cannot rewrite history.

Quote comparison maps provider lines to explicit bid-scope items and preserves gaps,
exclusions, qualifications, currency/validity/freight/tax, and source files. Selection
is a controlled decision, not an automatic lowest-number outcome. Proposal generation
freezes one approved revision and produces immutable artifacts. Award emits one
idempotent handoff contract that creates/reconciles project baseline mappings while
retaining the estimate and proposal unchanged.

Project controls distinguish baseline, commitment, approved change, actual/import,
accrual, progress, forecast/EAC, contingency, and reserve. Schedule baselines and
updates are immutable revisions. Procurement links exact estimate/project scope and
governing documents through receiving and turnover. Provider imports use preview,
stable external IDs, idempotency, conflicts, and explicit approval.

## Consequences and risks

- Shared identifiers enable one digital thread and avoid reconciliation by name/code.
- The design supports development before ERP/P6/Project credentials exist.
- Catalog governance and exact calculation traces add data volume and review work.
- Currency conversion, tax, labor agreements, accounting treatment, and productivity
  ownership require organization-specific approval and cannot be guessed.
- Automated estimating/optimization and full ERP/general-ledger authority remain
  separate future decisions.

## Security, data, and operations impact

Rates, quotes, labor/resource data, commercial decisions, and proposal artifacts are
sensitive. Server-side organization/project/object policy applies to lists, totals,
search, export, notifications, files, jobs, and handoffs. Submission/approval,
factor approval, quote selection, contingency/reserve use, proposal approval, award,
baseline approval, change approval, and progress acceptance support configured
assurance and separation of duty. Amounts are exact decimals with currency, unit,
rounding rule, calculation version, and UTC/effective context.

## Migration and rollback

Add reversible module tables/repository collections in dependency order: catalogs,
estimate/revisions/breakdown/calculation, sourcing/quotes, proposal/handoff, control
baseline/change/progress, procurement, then schedules. Seed only permission/code
identifiers. Disable commands/adapters to roll back an incomplete release while
retaining created controlled history; never delete an approved revision or proposal.

## Validation evidence

Required: exact-decimal and rounding fixtures, catalog revision provenance,
revision/delta immutability, three-quote normalization and gaps, permission/SOD,
proposal artifact hashes, idempotent handoff reconciliation, baseline/change/progress
gates, PostgreSQL restart/concurrency/restore, representative volume, accessible
desktop grids, tablet approval views, and sandboxed provider imports.

## Supersedes / superseded by

None. This proposal extends ADR-0001, ADR-0003, ADR-0005, ADR-0006, and ADR-0008.
