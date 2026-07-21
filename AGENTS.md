# EPV EIEP Repository Instructions

## Governing objective

Build the EPV Industrial Enterprise Platform (EIEP) as a secure, modular industrial construction, fabrication, quality, and turnover system. The first release must prove a narrow end-to-end operational chain while preserving the broader enterprise architecture.

## Authority order

When instructions conflict, use this order:

1. Applicable law, contract requirements, and approved EPV policies.
2. This `AGENTS.md` file.
3. Controlled decisions and requirements under `docs/`.
4. Approved architecture decision records.
5. Current implementation and tests.
6. Unapproved reference material under `source-intake/`.

Do not infer code, engineering, or contractual requirements from unapproved reference material.

## Controlled areas

- Treat `docs/` as the controlled product and program definition.
- Treat `source-intake/` as read-only, unapproved reference material. Inventory and reconcile an item before reuse.
- Treat `training-demo/` as strictly nonproduction. Never include its data in production seeds, builds, navigation, reports, analytics, or migrations.
- Treat `apps/`, `services/`, `packages/`, `infrastructure/`, `scripts/`, and `tests/` as active implementation areas.

## First implementation chain

Project setup -> controlled documents -> material receiving and traceability -> inspection and PMI -> NCR and punch control -> turnover package.

## Required disciplines

The shared data model must be able to extend to piping, pressure vessels, structural fabrication, civil, concrete, mechanical equipment, modular work, electrical and instrumentation, coatings, insulation, fireproofing, materials, welding, PMI, NDE, subcontractors, project controls, commissioning, and turnover.

## Development rules

- Work in small, reviewable changes tied to requirement identifiers.
- Do not change an approved architecture decision without a superseding ADR.
- Do not hard-code customers, projects, employees, welders, specifications, codes, or demonstration data.
- Use database migrations; never edit a production schema manually.
- Apply least-privilege role-based access on both server and user-interface paths.
- Record auditable create, update, approval, release, rejection, supersession, signature, export, and administrative events.
- Keep development, test, training, and production configurations and data isolated.
- Store secrets outside source control and generated artifacts.
- Validate uploaded files by type, size, malware scanning status, and authorization before release.
- Use UTC for stored timestamps and retain the originating time zone when it has business significance.
- Preserve record history. Do not silently overwrite controlled records.
- Reference standards and customer requirements without copying copyrighted standards into the repository.
- Do not represent software rules as a substitute for qualified engineering, inspection, or Authorized Inspector judgment.

## Completion standard

A feature is complete only when:

- its requirement and acceptance criteria are identified;
- database changes are migrated and reversible where practical;
- authorization and object-level access are tested;
- validation, error handling, and audit events are implemented;
- automated tests pass at the appropriate levels;
- controlled documentation and the traceability matrix are updated;
- accessibility and tablet use have been checked for field-facing screens;
- no training or fictitious data can enter a production path;
- known residual risks are documented.

## Verification commands

Once the technology stack is approved, document canonical setup, lint, test, security-scan, migration, build, and local-run commands here. Until then, do not invent a stack-specific command set.

## Change control

If a requested change expands the MVP, changes a controlled decision, affects an external integration, or changes a safety/quality release gate, document the impact and obtain product-owner approval before implementation.

