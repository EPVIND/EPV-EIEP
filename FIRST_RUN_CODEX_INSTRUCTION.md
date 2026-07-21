# First-run Codex instruction

Copy the instruction below into the first Codex task opened for this repository.

---

You are taking over implementation of the EPV Industrial Enterprise Platform (EIEP).

Begin by auditing this repository. Do not immediately rewrite existing files or start broad application development.

Controlled requirements are under `/docs`. Files under `/source-intake` are unapproved references that must be inventoried, evaluated, and reconciled before reuse. Files under `/training-demo` are strictly nonproduction and must remain isolated from active navigation, controlled data, production seed data, analytics, migrations, and release packages.

First complete the following:

1. Read `AGENTS.md`, `PROJECT_HANDOFF.md`, and all controlled documents under `/docs`.
2. Inventory the repository and identify incomplete, duplicated, obsolete, conflicting, demonstration, and potentially reusable assets.
3. Update `/docs/00-program/EXISTING_ASSETS_INDEX.md` and produce `/docs/00-program/REPOSITORY_AUDIT.md`.
4. Complete the requirements traceability matrix linking requirement IDs to proposed modules, database objects, APIs, screens, permissions, tests, and acceptance criteria.
5. Recommend the production technology stack, documenting reasoning, risks, alternatives, deployment implications, maintainability, offline strategy, and migration path.
6. Create architecture decision records for all major technical decisions.
7. Propose the production domain model and permission model before generating migrations.
8. Scaffold the application, services, database, tests, documentation, infrastructure, and environment configuration without inserting fictitious production data.
9. Establish isolated development, test, training, and production configurations.
10. Implement authentication, role-based access control, audit logging, project setup, and controlled document management as the first foundation.
11. Run all available tests and document anything that cannot yet be validated.

The system must use one controlled industrial data model capable of supporting piping, pressure vessels, structural fabrication, civil, concrete, mechanical equipment, materials, PMI, welding, NDE, subcontractors, project controls, NCRs, punch lists, commissioning, and turnover.

The first operational vertical slice is:

Project setup -> controlled documents -> material receiving and traceability -> inspection and PMI -> NCR and punch control -> turnover package.

Work incrementally. Preserve traceability, use reviewable changes, and report assumptions, conflicts, risks, tests, and recommended next tasks. Do not reopen approved product decisions without identifying the conflict and proposing formal change control.

---

