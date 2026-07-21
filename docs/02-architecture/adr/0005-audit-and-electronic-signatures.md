# ADR-0005: Audit history and electronic-signature assurance

Status: Proposed  
Date: 2026-07-20  
Decision owners: Product owner, industrial/QC authority, security/privacy authority,
document controller  
Requirements affected: FR-AUD-001 through FR-AUD-003, FR-INS-002, FR-NCR-002,
FR-TOV-003, NFR-SEC-003, NFR-DAT-002

## Context

Controlled actions must remain attributable and reviewable. The application must
not imply that every click has the same contractual or electronic-signature
assurance.

## Decision drivers

- Atomic business and audit history.
- Protection from ordinary modification/deletion.
- Field-level prior/new values with secret redaction.
- Signer, meaning, exact record revision, time, and authentication context binding.

## Considered options

- Transactional PostgreSQL audit plus immutable exported evidence.
- Application logs only.
- Database change-data capture only.
- External ledger/event store as the initial source of truth.

## Decision

Propose a structured append-only `audit_event`/`audit_change` model written in the
same transaction as controlled state. Restrict update/delete grants, hash canonical
event payloads into ordered segments, monitor privileged DB actions, and export
closed segments to retention-locked object storage for reconciliation.

Define two initial signature assurance classes, subject to record-by-record approval:

- authenticated acknowledgement: active session, explicit meaning, exact record
  revision/hash, actor, acting organization, UTC and originating context;
- controlled approval: all acknowledgement evidence plus configured recent/step-up
  authentication, qualification/scope/state checks, separation of duty, and a
  supplied reason where required.

No record type may use a signature class until the product owner, industrial/QC
authority, and security authority approve its meaning and assurance.

## Consequences and risks

- Audit is queryable with business context and independently reconcilable.
- Hashing does not replace access control, immutable retention, backup, or monitoring.
- Contract/regulatory signature requirements remain an approval dependency.

## Security, data, and operations impact

Redact tokens, secrets, unnecessary personal data, and protected file content.
Record failed privileged actions and authorization denials. Audit readers receive
separate scope. Administrative impersonation is disabled unless a superseding
approved design defines visible consent, time bounds, and review.

## Migration and rollback

Audit schemas are additive. Correct a bad event through a linked corrective event,
not mutation. If immutable export fails, retain segments pending retry and block
production authorization when the approved evidence window is exceeded.

## Validation evidence

Atomic failure tests, no-update/delete privilege tests, canonical hash verification,
redaction, time/actor/revision binding, separation-of-duty, step-up, segment export,
and coordinated restore/reconciliation.

## Supersedes / superseded by

None.

