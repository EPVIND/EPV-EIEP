# Engineering Register Control

Status: Locally implemented controlled pilot
Last updated: 2026-07-21

## Purpose

Provide one permission-scoped multidisciplinary engineering database for controlled
requirements, deliverables, systems, equipment, lines, instruments, components, and
tag identities without replacing discipline engineering judgment or source documents.

## Controlled record

Every register revision preserves project and organization scope; register class;
stable tag/number; revision and parent; reason; title; discipline; system, area, and
work-package scope; responsible organization; exact released document revisions;
approved related register revisions; controlled attributes; planned, forecast, and
actual issue dates; validation findings; canonical SHA-256; state; authorship;
submission/review facts; timestamps; and optimistic version.

## Workflow

1. An authorized author creates a draft revision under an active project.
2. Server-side normalization resolves codes and hashes a deterministic canonical
   payload. It reports invalid structures, organizations, documents, relationships,
   required system scope, deliverable plan dates, and actual-issue evidence.
3. A draft containing any error cannot be submitted. Warnings remain visible for
   engineering review.
4. Submission freezes the reviewed revision and requires current-version MFA.
5. A distinct qualified engineering authority uses step-up assurance to approve or
   reject. Creators and submitters cannot approve their own work.
6. Approval of a successor supersedes the approved parent without deleting or
   rewriting either revision. Audit records preserve exact canonical hashes.

## Register-specific rules

- Equipment, line, instrument, and component revisions require an active system.
- Deliverables require a planned issue date.
- An actual issue date requires an exact released document revision.
- Related register links resolve only to approved or retained superseded revisions.
- Responsible organizations must be active project participants.
- No sample register rows or counts are displayed outside authorized project scope.

## Permissions and qualifications

- `engineering.register.read`
- `engineering.register.manage`
- `engineering.register.submit`
- `engineering.register.approve` plus `engineering_authority`

## Production boundary

The local implementation includes types, service, API, request schemas, PostgreSQL
record-normalized persistence, audit, positive/negative tests, and a tablet workspace.
Owner-approved discipline dictionaries, bulk import/export mappings, representative
register volumes, customer formats, named authorities, and deployed pilot acceptance
remain external production gates.
