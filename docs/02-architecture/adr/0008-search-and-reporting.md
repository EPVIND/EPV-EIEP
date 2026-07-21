# ADR-0008: Search and reporting architecture

Status: Proposed  
Date: 2026-07-20  
Decision owners: Product owner, solution/data architect, security/privacy authority  
Requirements affected: FR-IAM-003, FR-NCR-003, FR-TOV-002, FR-INT-002,
NFR-PER-002, NFR-PER-003, NFR-DAT-001

## Context

MVP users need scoped registers, readiness views, audit search, and durable exports.
A separate search platform would duplicate authorization-sensitive data before scale
is known.

## Decision drivers

- Authorization correctness in lists, search, reports, and exports.
- Low operational complexity and transactional freshness.
- Asynchronous large outputs and durable manifests.
- Future dedicated-search path.

## Considered options

- PostgreSQL full-text/trigram search and read projections.
- Azure AI Search from the first increment.
- Elasticsearch/OpenSearch.
- Client-side search of downloaded data.

## Decision

Propose PostgreSQL indexed relational queries, full-text/trigram search, and
module-owned read projections for MVP. Apply scope predicates at the query source;
never retrieve a broad result and filter only in the client. Run large reports and
exports as authorized background jobs with immutable parameters, recipient scope,
manifest, status, expiry, and audit events.

Introduce a dedicated search service only after measured data/latency requirements,
with an authorization-safe indexing/deletion/reconciliation design and a superseding
ADR.

## Consequences and risks

- Fewer copies and more immediate controlled-state correctness.
- Complex analytics may burden the primary database; use read replicas/projections
  only after monitoring justifies them.
- Search ranking must not leak unassigned record existence through counts,
  suggestions, timing, notifications, or cached exports.

## Security, data, and operations impact

Reports execute with the requesting user's captured authorization and revalidate at
download. Redact protected fields by output contract. Record query/job correlation,
generation, result, download, expiry, and failure.

## Migration and rollback

Read projections are rebuildable from authoritative records. A future search index
is disposable and reconciled by stable ID/version. Rollback disables the index and
returns to PostgreSQL without losing source state.

## Validation evidence

Horizontal/vertical leakage tests, stale projection reconciliation, common-view
budgets, large asynchronous export, cancellation/failure, recipient redaction, and
download reauthorization.

Local review evidence now generates immutable revisioned snapshots for all eleven
controlled MVP form/report codes as structured JSON and searchable printable HTML.
Every snapshot records exact source IDs, versions, states, canonical hashes, stable
filenames, current status, source system, generation identity/time, and a print
warning; protected tax references are redacted and generation/download are audited.
An authorization-scoped live dashboard derives project readiness, document currency,
material/MTR/PMI state, expiring qualification/equipment records, NCR/punch aging,
subcontractor status, turnover completeness, and privileged action history from the
authoritative transaction. Deployed scale, alert routing, and owner acceptance remain
external evidence.

## Supersedes / superseded by

None.
