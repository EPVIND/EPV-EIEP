# Changelog

All notable controlled changes to the EIEP program definition and implementation should be recorded here.

## 0.9.0 - Guided activation setup and complete PMI/NCR execution detail

- Added a guided project-setup workspace for participant organizations, project
  structure, effective responsibilities, governed configuration submission, and
  identity-separated configuration approval; readiness results are invalidated after
  any authoritative setup change.
- Expanded PMI with required component location and notes plus an explicit pass/fail
  operator path. A failed result captures its NCR number, description, containment,
  responsible party, evidence, and turnover applicability in the same atomic request.
- Expanded NCR creation with initial evidence and a responsible party, and made
  corrective action mandatory before disposition can progress to approval and closure.
- Added reversible migration 0014 with truthful legacy-record markers and database
  constraints for PMI execution detail and NCR corrective-action completeness.
- Expanded integration and tablet-browser acceptance evidence and regenerated the
  112-route OpenAPI contract. Local database verification now covers fourteen
  migrations and 61 controlled constraints; external ADR approval, managed-service
  deployment, pilot acceptance, and production authorization remain required.
- Approved only the pinned Linux x64 and Windows x64 embedded-PostgreSQL install
  scripts (plus the pinned frontend compiler) so clean hosted CI and the supported
  local verification platform apply the same explicit supply-chain policy.
- Moved the pinned Chromium installation before the renderer-bearing verification
  suite and updated the three GitHub-owned workflow actions to their current
  full-commit-pinned Node 24-compatible releases.
- Made the compact tablet sidebar a bounded sticky layer beneath the header so long
  project/workflow content cannot intercept module-navigation taps.
- Published the controlled baseline to `EPVIND/EPV-EIEP`; clean hosted verification
  run `29859707003` passed every gate and retained the SBOM artifact. Restricted
  GitHub-owned Actions, protected `main`, and empty development/test/training/
  fail-closed production environments establish the live repository boundary without
  claiming cloud or production authorization.

## 0.8.0 - Governed intake, material review, controlled outputs, and derived readiness

- Added authenticated bounded multipart upload with authorization before byte
  persistence, opaque private staging keys, byte-derived SHA-256, immutable exact
  retries, changed-byte conflicts, and staged-only API identity scope.
- Added independent exact-revision MTR comparison/acceptance and append-only material
  receive, split, release, issue, return, relocation, and quarantine movement history.
- Implemented all eleven controlled MVP form/report snapshots as immutable revisioned
  JSON and searchable printable HTML with exact source identities/hashes, redaction,
  stable filenames, status/source metadata, print warnings, and audited downloads.
- Added an authorization-scoped operational dashboard for readiness, document
  currency, material/MTR/PMI controls, expirations, exception aging, subcontractor
  state, turnover completeness, and privileged actions.
- Changed project activation to ignore client readiness claims and derive its evidence
  from controlled project organizations, effective named authorities, released
  governing references, active configuration, completion baselines, and exceptions.
- Added migrations 0012-0013 for immutable MTR/movement/report history and expanded
  guided browser workflows, generated API contracts, infrastructure roles, tests,
  runbook, and traceability evidence. External ADR approval, managed-service
  validation, pilot acceptance, and production authorization remain required.

## 0.7.0 - Contract, managed-storage, turnover, and guided-workflow evidence

- Published a generated OpenAPI 3.0.3 contract for all 100 active `/v1` operations
  with TypeScript-derived runtime schemas for 85 request bodies, generated path/query
  validation, shared safe errors, stable operation IDs, route tests, and a drift gate.
- Added a managed-identity Azure Blob storage adapter with private-boundary checks,
  opaque identifiers, immutable conditional writes, SHA-256/ETag enforcement,
  bounded streaming, quarantine/release moves, and interruption/conflict recovery.
  Live Azure and managed malware validation remain external release evidence.
- Froze exact canonical source bytes in turnover package versions and added a
  network-isolated pinned-Chromium renderer for searchable PDF plus exact JSON, CSV,
  delta, and generation-log artifacts. PDF/A conformance is explicitly not claimed.
- Added an accessible tablet-guided internal workflow spanning controlled documents,
  exact-rule material/MTR receipt, receiving inspection, PMI, optional NCR and punch
  closure, turnover readiness, and immutable generation.
- Connected file validation, independent file release, and turnover rendering to
  transactional PostgreSQL outbox messages and the atomically leased worker; added
  idempotent partial-write recovery, generated-object hash checks, managed-identity
  worker-only Blob role/configuration with a distinct managed identity in the guarded
  Bicep proposal, and fail-closed production scanner configuration.
- Recorded 70 passing local unit/integration/security/acceptance tests and five
  passing Chromium tablet/accessibility workflows. Production deployment and
  managed-service validation, pilot evidence, ADR acceptance, and owner approvals
  remain required.

## 0.6.0 - Production-boundary implementation evidence

- Added governed local identity accounts/external subjects and signed RS256 OIDC
  resolution, including independent activation, organization inference/denial,
  revocation, qualification normalization, and attributable sign-in evidence.
- Added controlled UTC/IANA time, bounded exact-decimal units, versioned master-data
  schema, and retained immutable integration payloads.
- Added a bounded background worker and PostgreSQL-backed service runtime for export,
  notification, and outbound integration work; adapter-aware queue selection; real
  HTTP/HMAC transport; permanent/retry failure classification; and explicit terminal
  results.
- Added encrypted AES-256-GCM repository/file recovery bundles with authenticated
  metadata, exact type hydration, per-object integrity, clean restore, and tamper/
  wrong-key denial tests.
- Added provisional non-production performance guards, HTTPS/security headers,
  structured non-leaking errors, rate limiting, log redaction, correlation propagation,
  and a secret-protected low-cardinality OpenMetrics endpoint.
- Bound material receipt and explainable PMI applicability to the exact active,
  independently approved project-configuration revision; added governed proposal,
  separation-of-duty approval, exact released-rule linkage, stale-rule denial, and
  audit for material-specific PMI overrides.
- Added eleven total reversible migrations and least-privilege runtime/migrator/reader/
  worker roles; replaced the global aggregate row with typed record-normalized entities,
  indexed query/work metadata, optimistic row revisions, and atomic expiring work leases
  with heartbeat renewal and safe expiry reclamation.
  PostgreSQL 18 verification now covers 58 controlled constraints plus runtime restart,
  rollback, atomic outbox, typed hydration, 2,000-record behavior, concurrent stale
  updates, and competing claims.
- Added a pinned Bicep 0.45.15 toolchain and 11 compiled review templates for managed
  identity, observability, storage, vault, messaging, private networking/endpoints,
  PostgreSQL 18, and Container Apps including an atomically leased 1-5 replica worker.
  Production deployment remains authorization/digest-guarded and the safe entry point
  still creates no resources.
- Added read-only GitHub Actions verification, frozen dependency install, production
  advisory audit, CycloneDX 1.6 SBOM generation, and evidence upload.
- Recorded 65 passing local unit/integration/security/acceptance tests, four passing
  Chromium tablet/accessibility workflow tests, successful builds, eleven disposable
  PostgreSQL migrations, compiled infrastructure, and no known production dependency
  vulnerabilities. Production authorization is explicitly not claimed.

## 0.5.0 - Platform services and controlled interchange

- Added governed file staging, integrity/type/container/malware validation,
  quarantine/rejection, independent release, and authorized download.
- Added versioned import staging/validation/atomic commit with project context,
  row errors, duplicate detection, and durable external identifiers.
- Added authorized asynchronous export/outbox processing, recipient reauthorization,
  stable manifests, and documented deterministic JSON Lines/CSV v1 artifacts.
- Added canonical-payload integration idempotency, schema/external IDs, optimistic
  processing, bounded retry, dead letter, independent reconciliation, and replay.
- Added server-side scope-filtered search; fail-safe connectivity classification;
  idempotent offline punch drafts with actor/device/original/sync/conflict metadata;
  and audited denial of authoritative offline actions.
- Added payload-minimized notification subscriptions and dispatch with scope filtering,
  outbox processing, bounded delivery retry, and recipient reauthorization.
- Added PostgreSQL migrations `0005_platform_services` and `0006_repository_runtime`,
  plus a migration-gated serializable runtime adapter with typed Map/Date hydration,
  reconnect persistence, rollback, atomic outbox, and stale-update concurrency checks;
  recorded 39 passing domain/API/security tests and six disposable PostgreSQL 18
  migrations with 38 representative controlled constraints.

## 0.4.0 - Governance foundation controls

- Added time-bounded access grants with independent review/revocation and proposed,
  independently approved, expiring, reviewable, and revocable delegation projected
  into the same deny-default policy.
- Added systems, areas, WBS/work-package hierarchy, participating master-organization
  references, responsibilities, and independently activated project rule versions.
- Added exact released-revision distribution, scoped download, acknowledgement, and
  governing-record links.
- Added recursive protected audit-field redaction with audited access, and controlled
  retention-policy, legal-hold, and three-party disposition workflows that do not
  physically delete records.
- Added PostgreSQL migration `0004_governance_controls`; recorded 29 passing domain/
  API/security tests, four disposable PostgreSQL 18 migrations with 21 representative
  constraints, successful builds/browser checks, and no production dependency advisories.

## 0.3.0 - Inspection, punch, turnover configuration, and subcontractor controls

- Added versioned inspection plans with approved-current selection, qualified
  performance, required fields/evidence, assurance-bound signature meaning, and
  independent accept/reject review.
- Added governed punch ownership/evidence, independent verification, closure, audit,
  and turnover readiness/manifest behavior.
- Added completion-boundary, turnover-requirement, recipient/material package scope,
  explainable readiness, and configured immutable package generation.
- Added organization-linked subcontractor profiles and scope qualifications, seven-
  category mobilization prerequisites with expiry/renewal gates, portal scope, and
  distinct EPV submission acceptance.
- Added PostgreSQL migration `0003_subcontractor_control` and expanded the operational
  schema/verifier for turnover material scope and controlled subcontractor records.
- Recorded 24 passing domain/API/security tests, 2 Chromium accessibility tests,
  three disposable PostgreSQL 18 migrations, successful builds and boundary/secret/
  traceability gates, and no known production dependency vulnerability.

## 0.2.0 - Operational material-to-turnover review slice

- Added shared material, equipment, PMI, NCR, genealogy, and immutable turnover
  package-version contracts plus explainable release/acceptance/closure policies.
- Added scoped service and API operations for receipt/MTR, receiving inspection,
  material split/release/issue, equipment, PMI, NCR disposition/reinspection/closure,
  and turnover generation/comparison.
- Added PostgreSQL migration `0002_operational_vertical_slice` with material,
  inspection, deficiency, and turnover schemas, constraints, permissions, and
  immutable manifest grants.
- Added end-to-end positive and failure/recovery tests covering exact quantity
  reconciliation, missing MTR, expired instrument verification, atomic quarantine/
  linked NCR, separation of duty, repeat PMI, and immutable turnover version deltas.
- Recorded 17 passing domain/API/security tests, 2 passing Chromium tablet/
  accessibility tests, both passing PostgreSQL migrations, builds, boundary/secret/
  traceability checks, and no known production dependency vulnerability.

## 0.1.0 - First-run audit and review foundation

- Completed the repository/asset audit and confirmed no inherited implementation,
  source-intake payload, training payload, prior commit, or conflicting controlled
  decision.
- Completed traceability for all 40 functional and 25 nonfunctional requirements.
- Added the proposed production stack, ten Proposed ADRs, and the proposed physical
  domain/permission model.
- Added isolated environment contracts, a pnpm workspace/lockfile, production-boundary
  and secret checks, responsive internal/portal shells, shared types/rules, API,
  document-processing/integration scaffolds, and a proposed PostgreSQL migration.
- Implemented and tested deny-by-default authorization, project readiness/activation,
  controlled document approval/release/supersession, current revision, and audit
  history in a nonproduction review adapter.
- Recorded passing typecheck, build, 14-test, boundary, secret, and production
  dependency audit evidence plus unresolved deployment/integration blockers.
- Installed a repository-local PostgreSQL 18.4 verification runtime and Playwright
  Chromium 149 with axe; added passing real migration/constraint and tablet browser
  accessibility tests without creating a persistent Windows database service.

## 0.0.1 - Handoff baseline

- Established the controlled repository layout.
- Defined the MVP boundary and first operational vertical slice.
- Added program, requirements, architecture, workflow, test, security, and deployment baselines.
- Isolated unapproved source intake from nonproduction training and demonstration data.
- Added the first-run Codex implementation instruction.
