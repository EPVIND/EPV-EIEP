# Controlled Change: Immediate Enterprise Expansion

Change ID: EIEP-CC-2026-07-21-01  
Status: Repository implementation directed; production promotion not authorized  
Date: 2026-07-21  
Change class: Controlled

## Request and reason

The task owner directed immediate expansion beyond the MVP into:

1. production-grade advanced estimating, including assemblies,
   labor/productivity factors, quote comparison, proposal handoff, revision history,
   approvals, and auditability;
2. project controls, procurement, and scheduling;
3. welding, NDE, PWHT, pressure/leak testing, and adjacent execution disciplines;
4. governed Bluebeam integration; and
5. adjacent shared modules where they are genuine dependencies.

The requested outcome is earlier operational value and avoidance of a long pause
between the controlled MVP foundation and enterprise module delivery.

The task owner subsequently identified the supplied enterprise dashboard as the
source of their capability assumptions. Its complete interpreted surface and source
hash are recorded in `PRODUCT_VISION_CAPABILITY_BASELINE.md`. That direction adds
fabrication, spool generation, CNC/waterjet/profiling, engineering registers,
customer access, unified tasks/activity, and enterprise projections to the product
vision without turning illustrative dashboard data into implementation evidence.

## Scope and sequence

The implementation sequence is dependency driven:

1. Advanced estimating and proposal handoff.
2. Cost/control baseline, procurement, commitments, schedule baseline, and progress.
3. Welding/NDE/PWHT/test execution on shared material, document, equipment,
   qualification, deficiency, and turnover identities.
4. Bluebeam document/markup exchange through a provider adapter.

Shared cost codes, organizations/vendors, files, documents, requirements, work
packages, qualifications, audit, jobs, exports, and turnover links are reused rather
than duplicated. CRM, payroll, billing, general ledger, robotic/machine control,
automatic engineering acceptance, and unapproved vendor-specific writes remain
outside the current implementation change even where the vision reserves a future
integration surface.

## Repository implementation status

- Sequence 1 has a locally verified controlled-pilot implementation: advanced
  estimating domain/API/tablet workflow, exact calculations, immutable revisions and
  deltas, independently approved assembly/productivity/monetary-authority catalogs,
  released organization-file-backed quote comparison, deterministic hash-verified
  printable proposal issue/download, audit, and exact award handoff.
- The implementation passes 84 source tests, six Chromium tablet/accessibility
  workflows, 140-route contract drift verification, PostgreSQL restart/concurrency,
  production build/runtime gates, and the production dependency audit.
- Sequence 1 is not production authorized. Normalized physical estimating
  migrations, owner-approved numbers/rates/productivity/authority limits and
  qualification assignments, customer proposal/PDF acceptance, deployed security,
  and pilot sign-off remain required.
- Sequence 2 now has a locally verified domain/API/PostgreSQL controlled-pilot
  implementation for cost/quantity baselines, changes, period ledger/EAC, progress,
  requisitions, comparative bidding, thresholded award, commitments/expediting,
  receiving linkage, schedule baseline/updates/look-ahead, and provider-neutral
  P6/Microsoft Project preview/commit, plus a verified visible browser workspace.
- Sequence 2 complete local verification passes 88 source tests, seven Chromium
  tablet/accessibility workflows, 170 active secured `/v1` routes with 135 request
  bodies, 86 controlled-requirement traceability checks, PostgreSQL 18 restart and
  concurrency checks, and exact receiving-link denial/acceptance evidence.
- Sequence 2 is not production authorized. Owner control structures, currencies,
  thresholds, calendars, mapping fixtures, live provider/accounting/vendor
  sandboxes, normalized production migrations, deployed validation, and pilot
  sign-off remain required.
- Sequence 3 is the active implementation target after the Sequence 2 controlled
  increment is sealed. Sequence 4 remains pending.

## Controlled impact

- **Requirements:** adds the proposed expansion requirements and acceptance criteria
  in `../01-requirements/EXPANSION_REQUIREMENTS.md` and
  `../01-requirements/EXPANSION_ACCEPTANCE_CRITERIA.md`. Each requirement moves into
  the controlled functional baseline only with executable evidence.
- **Approved decisions:** accelerates work previously categorized as Next/Later but
  does not weaken DEC-003, DEC-004, DEC-005, DEC-009, DEC-010, DEC-013, or DEC-015.
  It interprets DEC-006 as satisfied for repository review by the locally complete
  MVP digital thread; live pilot acceptance remains a separate external gate.
- **Architecture:** introduces Proposed ADR-0011 through ADR-0013. They extend the
  current modular monolith, PostgreSQL repository, outbox/job, file, audit, and OIDC
  decisions and do not supersede an Accepted ADR.
- **Safety and quality:** software may enforce prerequisites and record qualified
  decisions, but it cannot invent productivity, code acceptance, examination
  technique, heat-treatment cycle, test pressure, or engineering disposition.
- **Security/privacy:** commercial rates, vendor quotes, bid decisions, labor data,
  qualifications, examination results, and controlled markups require explicit
  organization/project/object scope, protected exports, and independently reviewed
  privileged actions.
- **Data:** new records use stable opaque IDs, exact decimals/currencies/units,
  immutable approved revisions, effective dates, and exact source references.
- **Integration:** Bluebeam, scheduling, accounting, vendor, and equipment boundaries
  use versioned adapters, idempotency, retained source identifiers, reconciliation,
  and fail-closed authorization. No production credential or counterpart contract is
  inferred.

## Migration and rollback

Each vertical slice receives a reversible migration before its production path is
enabled. Structural catalogs contain no customer, employee, project, rate,
productivity, code, or demonstration data. An incomplete slice remains disabled from
production navigation and permissions. Rollback disables new commands and adapters,
preserves created controlled history, and reverses only schema elements proven safe
to remove; released estimates, proposals, quality records, and audit events are not
silently deleted.

## Verification and release

Every promoted requirement needs positive and negative authorization, calculation or
state-machine evidence, PostgreSQL restart/rollback, audit integrity, export/file
scope, browser/tablet accessibility where applicable, documentation, traceability,
and cross-module turnover evidence. External adapters additionally need contract,
retry/reconciliation, sandbox, credential, rate-limit, and vendor acceptance tests.

Repository implementation direction was supplied by the task owner on 2026-07-21,
together with edit and GitHub authorization. The repository does not record that
person's controlled name or formal corporate role, so this direction authorizes work
in the current task but is not evidence of named product-owner, industrial/QC,
security, finance/procurement, Bluebeam/vendor, or production-owner approval. Those
approvals, cost/budget authorization, training, deployed validation, and production
promotion remain mandatory external gates.
