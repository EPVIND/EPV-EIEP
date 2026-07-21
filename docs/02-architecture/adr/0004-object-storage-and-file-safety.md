# ADR-0004: Object storage, file scanning, preview, and retention

Status: Proposed  
Date: 2026-07-20  
Decision owners: Security/privacy authority, document controller, solution architect,
operations owner  
Requirements affected: FR-DOC-001 through FR-DOC-004, FR-MAT-001, FR-PMI-002,
FR-TOV-003, NFR-SEC-005, NFR-DAT-001, NFR-DAT-002

## Context

Documents, MTRs, inspection evidence, photos, exports, and turnover packages are
untrusted files until validated and must remain linked to exact controlled records.

## Decision drivers

- Malware/type/size validation before release.
- Immutable content identity and recipient authorization.
- Coordinated retention, legal hold, package generation, and restore.
- Isolation between environments and processing stages.

## Considered options

- Azure Blob Storage with staged processing boundaries.
- Database binary storage.
- Shared filesystem.
- Third-party document-management system as the primary store.

## Decision

Propose Azure Blob Storage with opaque keys and separate staging, quarantine,
released, generated-package, and immutable-audit-evidence boundaries. Persist SHA-256
hash, detected media type, size, scan status/version, uploader, project scope,
retention class, and storage version in `file_object`.

An isolated worker validates type/signature, size, archive policy, active content,
and malware status before authorized release. Preview generation is isolated and
never changes the original. Downloads require a fresh scope check and a short-lived
scoped token/stream; no object is public.

## Consequences and risks

- File content scales independently of relational records.
- Database and object restore must be coordinated.
- Managed malware capabilities, unsupported formats, encrypted archives, and large
  files require explicit policy and failure handling.

## Security, data, and operations impact

Use separate accounts/containers, keys, identities, retention, and telemetry per
environment. Production storage is inaccessible from development/test/training.
Log scan failures and downloads without exposing content or permanent URLs.

## Migration and rollback

Future imports retain raw source files/hashes before transformation. A storage
provider migration copies by content hash, verifies every object and manifest, then
switches the adapter; prior storage remains read-only until reconciliation approval.

## Validation evidence

Type spoofing, oversize, malware test artifact, archive, authorization, expired URL,
hash mismatch, preview isolation, retention/legal-hold, and coordinated restore
tests. Production scan validation requires the deployed service.

Local review evidence now includes an authenticated multipart API that authorizes
before reading or persisting bytes, derives SHA-256 from exact content, assigns an
opaque project key, and converges exact idempotent retries while rejecting changed
bytes. It also includes an Azure SDK adapter constructed with managed
identity, private-container assertions, opaque multi-segment identifiers, immutable
conditional writes, SHA-256 metadata, exact ETag reads/deletes, bounded streams,
and idempotent interruption/conflict recovery for release and quarantine moves.
Transactional file-processing and release outbox messages are now claimed by the
leased worker, which scans/records/moves objects and recovers repeated operations
idempotently. The guarded Bicep proposal grants a distinct API identity write access
only to the private staged container and grants the worker identity the account-scoped
role required across governed boundaries; web/portal receive no Blob data role. An
explicit private scanner host remains required. This evidence neither accepts
this ADR nor validates deployed Azure role assignments, private endpoints, service
behavior, managed malware scanning, or worker execution.

## Supersedes / superseded by

None.
