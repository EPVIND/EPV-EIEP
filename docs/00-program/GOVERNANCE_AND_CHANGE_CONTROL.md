# Governance and Change Control

## Roles

- Executive sponsor: approves program funding, risk posture, and production authorization.
- Product owner: owns priority, scope, accepted decisions, and MVP acceptance.
- Industrial/QC authority: approves workflow fidelity and quality requirements.
- Security/privacy authority: approves security baseline exceptions and risk treatment.
- Solution architect: owns technical coherence and ADR quality.
- Delivery lead: coordinates backlog, releases, evidence, and dependencies.
- Quality/test lead: owns verification independence and acceptance evidence.
- Document controller: governs controlled product documents and revisions.

One person may hold multiple roles during startup, but approvals that require independence must be identified and handled explicitly.

## Change classes

- Editorial: no behavior, scope, data, security, or acceptance impact.
- Normal: behavior within approved scope; product-owner approval through the backlog.
- Controlled: changes an approved decision, data model, role, workflow gate, integration contract, acceptance criterion, or production configuration.
- Emergency: urgent production correction with abbreviated approval, documented risk, rollback, and retrospective review.

## Controlled change record

Record the request, reason, affected requirements and ADRs, safety/quality impact, security/privacy impact, migration and rollback, testing, training, schedule/cost impact, approvals, release, and post-release verification.

## Release gates

- Requirements and traceability current.
- Peer review complete.
- Automated and manual evidence accepted.
- Authorization and negative-access tests passed.
- Data migration and rollback rehearsed when applicable.
- Security findings resolved or formally accepted.
- Backup and restore verified for production-impacting releases.
- Training/support material ready.
- Product owner and required authorities approve promotion.

