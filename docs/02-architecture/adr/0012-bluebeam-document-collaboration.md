# ADR-0012: Bluebeam and Provider-Neutral Document Collaboration

Status: Proposed  
Date: 2026-07-21  
Decision owners: Product owner, document-control authority, industrial/QC authority,
integration owner, security/privacy authority, solution architect  
Requirements affected: FR-BBM-001 through FR-BBM-005, FR-DOC-001 through FR-DOC-004,
FR-INT-001 through FR-INT-003

## Context

Bluebeam collaboration is requested quickly, but available products, licensing,
Studio/API capabilities, customer tenancy, exports, authentication, and contractual
permissions can vary. A provider status must not become an EIEP document release or
quality acceptance by implication.

## Decision drivers

- Immediate development without fabricating a vendor contract or credential.
- Exact controlled-document revision and provider-source traceability.
- Markup/comment/reply fidelity and safe file handling.
- Idempotent retry, conflict visibility, and reconciliation.
- Provider exit path and EIEP authority over releases/acceptance.

## Considered options

- Deep direct Bluebeam API dependency in document services.
- Manual attachment with no structured markup identity.
- Provider-neutral collaboration port with Bluebeam export and future live adapters.
- Treat Bluebeam as the system of record for document status and approval.

## Decision

Propose a provider-neutral document-collaboration port. The first implementation is a
versioned, deterministic Bluebeam Studio/export-package adapter with a fixture-backed
contract. It previews and then atomically imports projects/sessions, exact source
documents, pages/regions, markups, comments/replies, authors, statuses, timestamps,
and provider identifiers after resolving the EIEP project, controlled document
revision, users/organizations, and source file.

The adapter stores original protected input as a governed file, calculates its hash,
and makes exact provider/source versions idempotent. Changed-source collisions,
unmapped identities/documents/statuses, unsupported content, authorization failure,
and file-policy failure block commit and enter reconciliation. Provider completion or
approval status remains collaboration evidence only; EIEP commands retain document
release, estimate approval, NCR closure, inspection acceptance, and work acceptance.

Outbound/write behavior stays disabled until a reviewed Bluebeam product/API
contract, sandbox, least-privilege identity, rate/error limits, retention, tenant/
project ownership, and vendor terms are supplied and tested.

## Consequences and risks

- Work can begin now with deterministic import contracts and no secret/vendor claim.
- A live adapter can be added without changing domain records or authority.
- Export fidelity and APIs may differ by Bluebeam product/version and need real
  fixtures/owner validation.
- Markup authors may not map cleanly to active EIEP accounts; unresolved identities
  remain explicit and cannot inherit access.

## Security, data, and operations impact

Inputs remain isolated until file validation/malware policy and scoped preview pass.
Source files, markups, comments, authorship, and commercial/quality annotations may
be sensitive. Lists, counts, search, export, notifications, and source download use
the underlying project/document authorization. Credentials stay outside source and
client code. Jobs retain provider request/result IDs, bounded retries, dead letter,
and reconciliation without logging markup content or tokens.

## Migration and rollback

Add provider-agnostic connection, import, source-object, mapping, collaboration-item,
and reconciliation records. Disable the adapter and preserve imported evidence to
roll back; do not delete accepted links or audit. A new adapter version remaps through
stable external/source identifiers and never overwrites a prior source version.

## Validation evidence

Required: approved representative export fixtures, schema/size/malware validation,
exact revision/user/project mapping, page/region/markup/comment/reply fidelity,
idempotency and changed-source conflict, cross-project/direct-ID denial, atomic
rollback, PostgreSQL restart, reconciliation, audit/redaction, large-session budget,
and live sandbox evidence before outbound production use.

## Supersedes / superseded by

None. This proposal extends ADR-0004, ADR-0005, ADR-0006, and ADR-0008.
