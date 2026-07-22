# EPV Industrial Enterprise Platform

This repository is the controlled Codex handoff for the EPV Industrial Enterprise Platform (EIEP). EIEP is intended to manage full-scope industrial fabrication and construction through one digital thread while allowing self-perform, subcontracted, or blended execution.

## Start here

1. Read `AGENTS.md`.
2. Read `PROJECT_HANDOFF.md`.
3. Review the controlled documents under `docs/`.
4. Place prior prototypes and source artifacts only in `source-intake/` and record them in `docs/00-program/EXISTING_ASSETS_INDEX.md`.
5. Keep all fictitious projects and demonstration data in `training-demo/`.
6. Open this folder as a Codex project and use `FIRST_RUN_CODEX_INSTRUCTION.md` as the first implementation instruction.

## First operational objective

Deliver one secure, testable vertical slice:

Project setup -> controlled document -> received material and MTR -> PMI decision and inspection -> release or quarantine -> NCR when needed -> accepted turnover record.

The complete enterprise vision remains in scope for architecture, but it must not delay this first usable chain.

## Repository map

- `docs/`: controlled program definition, requirements, architecture, workflows, testing, and deployment.
- `source-intake/`: unapproved references awaiting inventory and reconciliation.
- `training-demo/`: isolated nonproduction examples and demonstrations.
- `apps/`: user-facing web and portal applications.
- `services/`: API, background-job, document-processing, integration, and recovery services.
- `packages/`: shared database, types, rules, and user-interface components.
- `infrastructure/`: environment and deployment definitions.
- `scripts/`: repeatable developer and operator tasks.
- `tests/`: unit, integration, acceptance, and security tests.

No technology stack is approved by this handoff. The first Codex review must recommend and record the stack through architecture decision records before broad implementation.

## First-run foundation status

The 2026-07-20 first-run task completed the repository audit, full requirement
mapping, proposed stack/ADRs, proposed physical domain and permission model, and a
review-only foundation scaffold.

Implemented review surfaces include:

- a Node.js/TypeScript workspace with locked dependencies;
- authenticated multipart staging, independent MTR review, immutable material movement history, all eleven controlled MVP report snapshots, and an authorization-scoped operational dashboard;
- responsive internal and scope-limited portal shells;
- Fastify API with signed OIDC-to-local-account resolution, bounded requests,
  secure transport/response policy, correlation, redacted logs, and protected metrics;
- deny-by-default scoped RBAC/ABAC policy with assignment effective/revoked time,
  assurance, qualification, and separation-of-duty checks;
- project create/readiness/activation application services;
- a guided project-setup workspace for participant organizations, systems/areas/WBS/work packages,
  effective responsibilities, and independently approved governed configuration;
- document registration, revision submission/approval/release/supersession and
  current-for-work invariants;
- material receipt bound to the exact active approved project-configuration revision,
  exact released MTR linkage, unique identity, decimal cut/remnant genealogy,
  quarantine, issue, and explainable release gates;
- governed PMI requirement display and independently approved material-specific
  override, qualified instrument/evidence capture, independent acceptance, and
  expired-verification denial;
- PMI component location and notes, selectable pass/fail execution, atomic failed-PMI
  quarantine/NCR creation, initial evidence/responsible party, corrective action,
  independent disposition approval, reinspection/closure, and required closed-NCR turnover linkage;
- approved-current inspection plan revisions, qualified execution, explicit signature
  meaning, and independent inspection acceptance;
- owned punch evidence, independent verification, controlled closure, and turnover
  blocking/inclusion;
- configured completion boundaries, turnover requirements/readiness, immutable source
  manifests, regeneration, and version comparison;
- organization-linked subcontractor qualification, expiring mobilization prerequisites,
  assigned-work portal scope, controlled submissions, and separate EPV acceptance;
- time-bounded managed access and independently approved/reviewed/revoked delegation;
- project system/area/WBS/work-package structure, master-organization participation,
  responsibility assignment, and versioned governed configuration;
- exact-revision distribution/download/acknowledgement and governing-record links;
- redacted audit views plus independently approved retention, legal hold, and
  three-party disposition without direct physical deletion;
- staged file size/type/hash/container/malware validation with quarantine,
  independent release, and download authorization;
- versioned import validation/atomic commit, canonical-idempotent integration inbox,
  bounded retry/dead-letter/reconciliation, and server-filtered project search;
- authorized asynchronous CSV/JSON Lines exports with durable manifests, stable
  identifiers, recipient reauthorization, and documented format contracts;
- field-workflow connectivity classifications, idempotent offline punch drafts with
  actor/device/conflict metadata, and audited denial of authoritative offline actions;
- scope-filtered, payload-minimized notification subscriptions, outbox dispatch,
  delivery retry, and recipient reauthorization;
- transactional in-memory review adapter with attributable audit hashes;
- bounded export/integration/notification job processing, HTTP/HMAC transport, and
  explicit retry/dead-letter/reconciliation outcomes;
- encrypted coordinated repository/file recovery bundles with clean-restore,
  tamper, and wrong-key acceptance checks;
- fourteen proposed PostgreSQL migrations, a checksum-enforcing migration runner, and
  a record-normalized, migration-gated serializable persistence adapter with indexed
  metadata, optimistic row revisions, restart/rollback/concurrency, 2,000-record, and
  competing-worker lease verification;
- passwordless Azure PostgreSQL runtime/migration adapters that acquire short-lived
  Microsoft Entra tokens dynamically, verify TLS, reject embedded passwords, and map
  distinct API/worker managed identities to separate least-privilege database roles;
- isolated environment contracts and production/training boundary checks;
- local filesystem/ClamAV boundaries plus a managed-identity Azure Blob adapter with
  private-container, immutable-write, ETag, hash, bounded-stream, quarantine, and
  crash-recovery contract evidence;
- an advanced-estimating workspace and service covering organization-scoped
  opportunities, immutable revisions/deltas, governed assemblies and productivity,
  independently approved currency authority policies, exact price build-up,
  released-file-backed quote comparison/selection, hash-verified printable proposal
  issue/download, audit, and exact same-organization award handoff;
- an integrated project-controls workspace and service covering exact handoff-based
  cost/quantity baselines, thresholded change, period actual/accrual/forecast/EAC,
  separately accepted quantity progress, requisitions, comparative bids,
  thresholded award/commitments, expediting and controlled receiving linkage,
  independently approved schedule baselines/updates, look-aheads, and validated
  idempotent P6/Microsoft Project import drafts;
- a connected welding/NDE/PWHT/testing workspace and service covering exact approved
  PQR/WPS and welder-qualification ranges/continuity, structure/material/drawing/weld-
  map links, append-only weld/visual/repair events, qualified NDE requests and report
  revisions by repair cycle, PWHT parameters/thermocouples/chart evidence, independent
  acceptance/release, and completion-boundary pressure/leak/functional test readiness,
  evidence, deficiencies, restoration, and audit;
- a provider-neutral Bluebeam collaboration workspace and service covering protected
  export preview, exact document/user/organization/status mapping, markup/comment/
  reply page-region/source fidelity, idempotent atomic commit, changed-source and
  unsupported-content reconciliation, independent evidence review, audit, scoped
  search/export, and an explicit disabled outbound/write boundary;
- a unified enterprise command center that derives permission-filtered project
  metrics, exact-revision schedule progress, module health, authorized or explicitly
  owned work, recent audit activity, quick actions, and authoritative drill-through
  without creating a competing workflow-state aggregate;
- a tracked OpenAPI 3.0.3 `/v1` contract with deterministic TypeScript-derived runtime
  schemas for 195 active `/v1` routes and 155 request bodies, drift verification, bearer security,
  shared safe errors, stable operation IDs, and route-inventory tests;
- immutable turnover source-byte snapshots and a network-isolated pinned-Chromium
  renderer that emits searchable versioned PDF, exact JSON, CSV, and generation-log
  review artifacts while explicitly declining PDF/A conformance;
- a responsive guided internal workflow covering document control through exact
  project-rule material receipt, PMI, NCR/punch closure, readiness, and turnover;
- delivery CI/CycloneDX evidence and a production-guarded private Azure Bicep baseline
  compiled by a pinned toolchain, with a separate fail-closed runtime-start gate so
  database migration and identity mapping precede application startup;
- portable compiled workspace artifacts plus four digest-pinned, rootless OCI build
  targets for API, job worker, internal web, and partner portal; the browser images
  validate their runtime API origin, omit source maps, emit security headers, and use
  separate liveness/readiness endpoints in the Container Apps proposal.

This is not production authorization. Configured PostgreSQL startup requires the
current migration ledger and uses the verified record-normalized runtime adapter, but
deployed integration, managed-service recovery, approved production volume, and
approved RPO/RTO evidence remain release blockers. No users, organizations, roles, projects,
customers, materials, codes, specifications, or demonstration records are seeded.

## Provisional review commands

These commands exercise the Proposed ADR stack. They are not canonical production
commands until the decision owners accept the ADRs.

Prerequisites: Node.js 24 LTS and pnpm 11. PostgreSQL 18 verification is
repository-local; a Windows service or Docker installation is not required. The
infrastructure check uses pinned Bicep 0.45.15; see `infrastructure/README.md`.

```powershell
pnpm install
pnpm exec playwright install chromium
pnpm run verify
pnpm run build
pnpm run database:verify
pnpm run test:browser
pnpm audit --prod --audit-level high
pnpm run sbom:generate
pnpm run containers:verify
```

`pnpm run verify` runs the production-boundary check, secret-pattern scan,
OpenAPI drift, Bicep/container-definition checks, strict typechecks,
102 unit/integration/security/acceptance tests, 109-requirement/240-path traceability,
and compiled runtime process smoke tests. `pnpm run build` builds the two web
applications, API, worker/contracts,
shared packages, and validates the migration runner syntax. `pnpm run
containers:build` additionally requires Docker with BuildKit; it builds and smokes
all four production targets and emits revision-linked image evidence. `pnpm run
database:verify` creates a disposable PostgreSQL 18 cluster,
applies fourteen migrations, checks the ledger, 61 representative constraints, runtime
roles, and repository restart/rollback/concurrency, then removes all database files.
That PostgreSQL path also creates, exactly retries, restarts, and verifies the guarded
first-application-authority bootstrap; the production operator contract is in
`docs/06-deployment/DEPLOYMENT_AND_OPERATIONS.md`.

`pnpm run test:browser` runs eleven internal/portal workflow cases in a Chromium tablet
profile with axe accessibility checks.

Local review servers:

```powershell
pnpm run dev:api
pnpm run dev:web
pnpm run dev:portal
```

The development API uses an in-memory adapter and contains no access assignments;
therefore `/health` is available, but business operations remain denied unless a
test harness supplies explicit assignments. Development identity headers are never
accepted by training or production configuration.

The proposed persistent database migration command is:

```powershell
pnpm --filter @eiep/database migrate
```

It requires a protected `DATABASE_URL`. The migration has passed the disposable
PostgreSQL 18 verification path, but it has not been authorized for a persistent or
hosted environment; see `docs/05-testing/FIRST_RUN_VERIFICATION_REPORT.md`.

After an approved Entra-only Azure database is migrated, an authorized administrator
maps the exact API and worker managed-identity names/object IDs to their respective
`eiep_runtime` and `eiep_job_worker` roles with:

```powershell
pnpm run database:bootstrap-azure
```

That command requires a passwordless `DATABASE_ADMIN_URL` targeting the `postgres`
database plus the four `API_DATABASE_PRINCIPAL_*` / `WORKER_DATABASE_PRINCIPAL_*`
values. It verifies an existing mapping before reuse and refuses identity aliasing.

## Production blockers

- Product-owner/architecture/security/operations approval of Proposed ADRs.
- Entra tenant, app registrations, MFA/Conditional Access, external-user governance,
  and deployed identity-to-local-account validation.
- Managed PostgreSQL deployment/failover at approved production volume, managed
  backup/coordinated restore, and approved RPO/RTO.
- Live managed-object-storage and malware-scanning validation, preview, immutable
  audit export, external notification delivery, and deployed validation of the locally
  wired Azure Blob/file-processing/turnover-renderer worker path.
- Cloud subscription, region/data-residency, network, service-tier, budget, proposed
  IaC approval/what-if, alert routing, and deployment.
- Managed file/package-generation deployment, contractual PDF/A decision/validation,
  and the broader post-MVP enterprise modules.
- Manual screen-reader/keyboard and approved physical-tablet evidence,
  intermittent-connectivity, performance, manual security, and production operations
  evidence.
