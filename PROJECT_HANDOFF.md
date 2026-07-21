# EPV EIEP Project Handoff

## Purpose

EPV is moving from concept design into controlled implementation of an Industrial Enterprise Execution Platform. The quality management operating system remains the quality backbone, but EIEP spans the full project lifecycle: opportunity, estimate, planning, engineering, procurement, fabrication, construction, inspection, commissioning, turnover, and future asset history.

## Operating premise

EPV may self-perform a scope, subcontract it, or use a blended model. The performer may change; control, traceability, and accountability do not. Every work package must identify who performs, supplies, inspects, accepts, documents, and warrants the work.

## Product principles

- A project object exists once and is referenced across modules.
- Materials retain identity from receiving through cut pieces, fabrication, installation, and turnover.
- A weld, member, foundation, equipment item, or spool connects to its documents, materials, inspections, releases, deficiencies, and turnover records.
- Controlled revisions remain available and superseded revisions cannot be mistaken for current work.
- Quality and safety gates prevent unauthorized release without attempting to replace competent professional judgment.
- Turnover is assembled continuously from accepted records rather than compiled manually at the end.
- Portal users see only their authorized projects, packages, records, and actions.

## MVP outcome

The first production release must support one real project through:

1. project setup, organizations, users, systems, areas, and responsibilities;
2. controlled drawings and documents with revision history;
3. material receiving, MTR association, identity, traceability, and quarantine;
4. PMI requirement determination and inspection capture;
5. NCR and punch-item creation, disposition, reinspection, and closure;
6. accepted-record assembly into a turnover package;
7. foundational roles, audit events, signatures/approvals, exports, and backups;
8. focused subcontractor qualification and assignment controls.

## Pilot boundary

The recommended pilot contains a small pressure-equipment or exchanger scope, several pipe spools, one structural support or small rack, one concrete foundation, one subcontractor, a small schedule, material/MTR records, PMI, welding/NDE references, coating records, and a complete turnover package. Training data remains isolated; production acceptance uses an approved real project.

## Program tracks

- Enterprise architecture: shared data, security, permissions, APIs, rules, and module boundaries.
- Core platform development: working product capabilities delivered incrementally.
- Industrial knowledge base: governed EPV requirements, interpretations, procedures, templates, and lessons learned; not copies of copyrighted standards.
- Business deployment: procedures, training, devices, administration, support, and adoption.

## First Codex assignment

Audit this repository, reconcile requirements, recommend the technology stack, create ADRs, propose the domain model, establish test and environment foundations, and scaffold only what is justified. Do not attempt the entire enterprise platform in one change.

