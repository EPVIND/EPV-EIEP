# ADR-0006: Background jobs, events, and API versioning

Status: Proposed  
Date: 2026-07-20  
Decision owners: Solution architect, delivery lead, integration owner, operations owner  
Requirements affected: FR-INT-001 through FR-INT-003, FR-TOV-003, FR-TOV-004,
NFR-REL-003, NFR-REL-004, NFR-PER-003, NFR-MNT-001, NFR-MNT-004

## Context

Imports, exports, document processing, notifications, package generation, and
external integrations cannot hold core transactions open or silently lose work.

## Decision drivers

- Atomic business state and work scheduling.
- Idempotent retry and visible reconciliation.
- Minimal MVP infrastructure with a managed-queue path when justified.
- Stable external contracts and correlation.

## Considered options

- PostgreSQL transactional outbox/inbox plus worker.
- Azure Service Bus for every internal job.
- In-process fire-and-forget tasks.
- Event-sourced core domain.

## Decision

Propose a PostgreSQL outbox/inbox and job table claimed by a separately deployed
worker with bounded retries, lease/heartbeat, dead-letter review, idempotency key,
correlation/causation IDs, schema version, and visible outcome. Use Azure Service
Bus only at an approved external-integration or independent-scaling boundary.

Expose HTTP APIs under `/v1`. Publish OpenAPI and version message schemas. Additive
compatible changes stay within the version; breaking changes require a new version,
deprecation window, migration guidance, and contract tests.

## Consequences and risks

- No Redis/broker is required for the initial internal workflow.
- Polling and database contention need measurement and indexes.
- Message side effects still require receiver idempotency and reconciliation.
- Event sourcing is not introduced; controlled history remains explicit domain and
  audit records.

## Security, data, and operations impact

Workers use separate identities and least privilege. Job payloads carry stable IDs,
not secrets or unnecessary record content. Monitor queue age, retries, poison jobs,
and reconciliation gaps.

## Migration and rollback

Outbox messages are immutable/versioned. A new worker can process both old and new
schema versions during transition. Pause claiming, roll back the worker, and retain
pending jobs; never delete failed work to make a queue appear healthy.

## Validation evidence

Atomic outbox tests, duplicate delivery, worker crash/lease expiry, bounded retry,
dead-letter/replay authorization, schema compatibility, correlation propagation,
and external adapter contract tests.

Local review evidence currently includes PostgreSQL `SKIP LOCKED` claims, unique
expiring lease tokens, heartbeat renewal, safe expiry reclamation, competing-worker
exactly-once claim tests, receiver idempotency keys, and a proposed 1-5 replica worker.
It also includes TypeScript-derived runtime request/parameter/query schemas for all
170 active `/v1` routes, a generated OpenAPI 3.0.3 artifact with 135 request bodies,
shared safe errors, stable operation IDs, bearer-security declarations, boundary
validation tests, and deterministic source/contract drift gates. This evidence does
not accept this ADR or prove deployed crash/replay behavior or external contract
compatibility.

## Supersedes / superseded by

None.
