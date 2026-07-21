# System Architecture Baseline

This document defines constraints and logical boundaries. The implementation stack remains an open ADR.

## Logical view

1. User experiences: internal responsive web application, restricted external portal, and field/tablet views.
2. Application/API layer: versioned business operations, server-side authorization, validation, orchestration, and audit emission.
3. Domain modules: projects, documents, materials, inspections/PMI, deficiencies, subcontractors, and turnover on shared identities and master data.
4. Data services: relational system of record, protected object storage, search/indexing as approved, append-resistant audit evidence, and background processing.
5. Integration boundary: import/export, email/notification, identity, document markup, scheduling, ERP, instrument, and customer adapters.
6. Operations: configuration/secrets, deployment, monitoring, backup/restore, security scanning, incident response, and support.

## Architectural rules

- The relational system of record owns business state; object storage owns file content; links use stable identifiers and integrity metadata.
- Modules share platform identity, organization, project, document, material, and work object identifiers instead of copying records.
- Domain state changes occur through authorized application services, not direct client/database updates.
- Files are untrusted until validated; download authorization is evaluated at request time or through short-lived scoped access.
- Long-running document processing, imports, exports, package generation, and integrations use observable background jobs.
- External calls are isolated behind adapters and must not hold core transactions open.
- Events and integration messages are versioned, attributable, retryable, and idempotent where practical.
- Business rules carry effective dates, project applicability, version, approval, and explanation.
- User interfaces display why a release is blocked and what authorized action resolves it.
- Audit history and controlled record history remain queryable independently of the current projection.

## MVP bounded contexts

- Identity and access.
- Organization and project structure.
- Controlled documents.
- Material assurance.
- Inspection and PMI.
- NCR and punch.
- Subcontractor qualification/assignment.
- Completion and turnover.
- Platform audit, files, notification, reporting, and configuration.

## Deployment shape

Start with the simplest production shape that satisfies isolation, availability, recovery, security, and scale. A modular monolith may be preferable to premature microservices if domain boundaries and background/integration interfaces remain explicit. Record the decision in an ADR.

## Architecture qualities to prove

- Server-side project and object authorization.
- Transactional material/inspection/release consistency.
- Current-revision correctness.
- File and record integrity in turnover exports.
- Restore of database, objects, keys/configuration, and audit evidence.
- Safe migration and rollback.
- Representative field connectivity behavior.

