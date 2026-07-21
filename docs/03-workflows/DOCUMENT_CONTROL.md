# Workflow: Controlled Documents

## Flow

1. Register stable document identity: project, number, title, type, discipline, originator, and applicability.
2. Upload file to restricted staging; validate detected type, size, integrity hash, malware status, and authorization.
3. Create a document revision with revision identifier, purpose/status, received/issued date, source transmittal, and applicable systems/areas/work packages.
4. Route to configured review and approval roles; record comments and dispositions without altering the submitted file.
5. Release the revision for its approved purpose and distribute/notify scoped users.
6. When a new revision is released, mark the prior applicable revision superseded and remove it from current-for-work views.
7. Preserve historical files, approvals, distribution, acknowledgements, links, and audit events.

## Controls

- One current released revision per document and defined applicability/use context.
- Draft, under-review, rejected, void, and superseded files cannot appear as current for work.
- Business records bind to the exact governing revision.
- Downloads, previews, markups, transmittals, and exports respect project authorization.
- Field cache/offline views display revision, last synchronization, and authoritative-state limitations.

## Exceptions

Emergency field issue, customer-originated revision conflict, illegible/corrupt file, duplicate number, and retroactive receipt each require an explicit controlled exception; never silently replace a file.

