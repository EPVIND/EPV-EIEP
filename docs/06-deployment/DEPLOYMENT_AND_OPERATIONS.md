# Deployment and Operations Baseline

Status: Local runbook and guarded infrastructure proposal; no production deployment is authorized.

## Reproducible release evidence

Use Node.js 24 and pnpm 11 with the frozen lockfile. Use the Bicep version/hash in `infrastructure/bicep/toolchain.json`. From a clean reviewed source revision run:

```powershell
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm run verify
pnpm run build
pnpm run database:verify
pnpm run test:browser
pnpm audit --prod --audit-level high
pnpm run sbom:generate
pnpm run containers:verify
```

Record source revision, lockfile SHA, workflow run/build ID, Bicep version, fourteen migration checksums, 61-constraint result, test reports, CycloneDX artifact, image digests/scans/signatures, approvals, deployment record, and smoke/observation results. `.github/workflows/verify.yml` supplies read-only hosted verification. The `EPVIND/EPV-EIEP` bootstrap restricts Actions to GitHub-owned actions, pins each action by commit, protects `main` with the `controlled-verification` check and pull-request review, and defines empty development/test/training/production environments. Production prevents self-review and has a wait gate; it remains blocked until an additional authorized reviewer and every cloud/release prerequisite below are supplied.

The tracked `docs/02-architecture/openapi-v1.json` and runtime route-schema registry
are generated from the API's TypeScript route contracts; `pnpm run verify` fails on
either source-schema or published-contract drift. Record the OpenAPI hash and review
any breaking change under ADR-0006 before promotion.

## Container build and promotion

`containers/Dockerfile` builds four targets (`api`, `job-worker`, `web`, and
`portal`) from a single Node 24 image pinned by SHA-256. Each production target runs
as the unprivileged `node` user and records the full source commit in OCI metadata.
API and worker receive portable production-only pnpm deployments; the worker image
installs the pinned Chromium used for governed turnover rendering. Web and portal
contain only their compiled public bundle plus the minimal runtime server, publish no
source maps, and receive their exact API origin through `API_BASE_URL` at startup.

On a clean Docker BuildKit host, set `SOURCE_REVISION` to the full reviewed commit and
optionally set `CONTAINER_BUILD_EVIDENCE`, then run `pnpm run containers:build`. The
command builds all four targets, confirms their unprivileged user and revision label,
starts API/web/portal smoke containers, and exercises the compiled worker graph. The
hosted workflow records the result as `artifacts/container-build.json`.
Clean hosted run `29865776583` executed this path for commit `82aa645` and retained
the four runner-local image IDs with the 150-component SBOM.

For a release, retag and push those same images to the approved ACR, run the approved
vulnerability scan and signature/attestation process, and record the four registry
`@sha256:` digests. Only those digests enter Bicep. A local image ID, mutable tag, CI
success, or source revision alone is not registry promotion evidence.

## Environment and deployment gates

The first Azure handoff is subscription access, not another tenant-only device
login. The deployment operator must be able to create the proposed resources and the
scoped role assignments, or a separate Azure RBAC administrator must perform the
role-assignment steps. Begin with `development`; production stays a distinct later
authorization.

Record these non-secret inputs in the controlled deployment request before what-if:

| Decision/input | Required record |
|---|---|
| Azure scope | Active subscription ID, billing/scope owner, resource group, environment, naming/deployment stamp |
| Authority | IaC operator plus the administrator who can approve/create managed-identity role assignments |
| Location and cost | Approved region/data residency, service tiers/capacity/quotas, budget and cost-alert owner |
| Identity | Tenant, approved OIDC issuer/audience, PostgreSQL Entra administrator name/object ID/type, MFA/Conditional Access/B2B policy |
| Network/name | DNS names, certificate owner, exact HTTPS CORS origins, private-connectivity/DNS owner |
| Images | Approved ACR, GitHub OIDC deployment principal, pull identity/role, four scanned/signed image digests |
| Work processing | Private malware-scanner hostname, active least-privilege worker user and organization IDs |
| Operations | RPO/RTO, backup/retention choices, alert/action routes, on-call and incident/support owners |
| Governance | Accepted/superseded ADRs, foundation/runtime authorization records, and—only later—production authorization |

Never record a client secret, access token, database password, signing key, or metrics
token in this table, a parameter file, GitHub issue, shell history, or chat. Generate
and transfer protected values only through the approved secure deployment channel.

Development, test, training, and production must use distinct identity registrations, workload identities, database/storage/queue/vault/telemetry resources, configuration, keys, data, and access. Training retains its visible banner and persistent isolation. Production rejects development authentication, memory persistence, plaintext ingress, static database authentication, missing runtime DB role, missing HTTPS CORS origins, missing metrics secret, missing managed upload/scanner configuration, or a non-HTTPS browser API origin. API containers use `eiep_runtime` and a distinct managed identity whose Blob Data Contributor scope is limited to the private `staged` container. Worker containers use `eiep_job_worker`, atomic leases, heartbeat renewal, a separate user-assigned worker identity, the private Blob account, and an explicitly supplied private `CLAMAV_HOST`; only this worker receives the account-level data role required to validate, quarantine, release, and generate artifacts. The template constructs separate passwordless URLs from those deployed identities and both clients obtain short-lived Entra PostgreSQL tokens dynamically while enforcing TLS certificate verification. Only the API receives Key Vault Secrets User at the exact generated metrics-secret scope; worker, web, and portal receive no vault role. Web and portal also receive no Blob data role. Keep the lease duration above normal per-message latency and below the operational stuck-work threshold.

ADR-0006 uses the PostgreSQL transactional outbox/inbox and leased worker for the MVP.
The repository retains a secure Service Bus blueprint, but the proposed environment
does not instantiate a namespace, queues, private endpoint, DNS zone, credentials, or
runtime configuration. Adding that boundary requires a separately approved external
integration or scale decision and its own adapter/identity/contract evidence.

`infrastructure/bicep/main.bicep` deploys nothing. The proposed environment is eligible for an authorized what-if only after ADR-0009, subscription, region/residency, capacity, budget, RPO/RTO, DNS/certificates, app registrations, role assignments, and action groups are approved. The proposal fails closed for production without a controlled authorization reference and for every environment unless API/web/portal/job-worker images use immutable `@sha256:` references.

Deployment sequence after those approvals:

1. Confirm release/change window, migration and rollback plans, communications, on-call owner, backup currency, and authorization record.
2. Build once from the reviewed revision, scan/sign and push all four images, and record their ACR digests plus build evidence.
3. Run and review a foundation cloud what-if with `runtimeAuthorized=false`; verify no public data-service path, password database auth, shared storage key, application container, or unapproved resource/region appears.
4. Deploy that foundation and validate private connectivity, the generated metrics secret/API-only role, PostgreSQL Entra administrator, storage roles, and managed identities without displaying protected values.
5. For an existing environment, capture a coordinated pre-change database/object/configuration/audit/package recovery point.
6. Run the checksum migration runner using the approved Entra administrator/migrator identity; never use the API runtime identity for DDL or retain an access token.
7. From the `postgres` administration database, run `pnpm run database:bootstrap-azure` with the exact API/worker identity names and object IDs emitted by the reviewed deployment. Verify each Entra mapping and its distinct `eiep_runtime`/`eiep_job_worker` membership.
8. Run and approve the runtime what-if, confirm ACR pull authority and the same immutable image digests, then set `runtimeAuthorized=true` with the controlled migration/bootstrap evidence reference, smoke test, observe agreed signals, and either close or execute the rehearsed rollback.

## Smoke checks

- HTTPS health responds with the expected environment/training boundary and still reports `productionReady: false` until all blockers are closed.
- API `/livez` proves only that the process can answer; `/readyz` fails closed until
  PostgreSQL and managed staging are reachable. Web and portal `/healthz` answer, and
  `/runtime-config.js` exposes only the reviewed HTTPS API origin with `no-store`.
- OIDC issuer/audience/MFA and a current local subject map correctly; disabled/unassigned/cross-project/direct-object cases fail closed.
- Runtime DB identity is the expected API managed identity with membership in `eiep_runtime`; worker identity is distinct with membership in `eiep_job_worker`; static passwords/TLS overrides and schema mutation are denied; expected migration checksum/revision is present.
- An authenticated multipart upload persists exact bytes once under an opaque server key in the staged boundary; retry is idempotent, changed bytes conflict, and an unauthorized request writes nothing. The safe test object then moves staged -> scanned/validated -> independently released -> newly authorized download; quarantine and spoof/malware cases deny.
- Project activation ignores client-supplied readiness claims and recalculates customer participation, effective named authorities, released governing references, active configuration, boundaries/turnover requirements, and open exceptions before transition.
- All eleven controlled MVP report snapshots enforce generation/download authorization, exact source identifiers/versions/states/hashes, redaction, print warning, and immutable revisions; the live dashboard recalculates from authoritative project records.
- The Azure Blob adapter resolves through the workload identity, asserts every stage
  container is private, preserves opaque keys/hash/ETag across interrupted release or
  quarantine moves, and never returns a public object URL.
- With competing worker replicas, one export and one integration/notification message are each claimed once and reach a visible terminal state; heartbeat renewal, expiry reclaim, retry, dead-letter, reconciliation, and replay are operable.
- A current controlled revision supersedes correctly; quarantine denies material issue; one turnover readiness/package manifest verifies exact source hashes.
- One turnover job resolves each authorized source by exact ID/hash, renders without
  arbitrary network or script access, and immutably stores the PDF, exact JSON, CSV,
  delta, and generation log under the package-version prefix. Do not claim PDF/A until
  ADR-0010's separate approval and validation conditions are met.
- Protected `/metrics` can be scraped with the rotated secret and is 404 without it; correlation is present without sensitive labels/content.

## Monitoring and proposed alert conditions

Monitor availability, latency, status classes, saturation, DB/storage/queue health, job age/failures/dead letters, file scan failures, integration reconciliation, package generation, authentication anomalies, authorization denials, privileged changes/exports, configuration changes, orphaned/broken relationships, conflicting current revisions, and failed manifest verification.

The API exposes low-cardinality OpenMetrics counters, in-flight gauge, and duration histogram at `/metrics`. Supply `x-eiep-metrics-token` from protected scraper configuration; never place it in dashboards, logs, code, or client bundles. Rotate it after suspected exposure.

Alert thresholds and destinations are intentionally not claimed as approved. Before pilot, owners must set measured availability/error/latency/saturation targets and action routes. At minimum page on sustained unavailability, database/storage/queue unreachability, failed restore/backup, integrity failure, malware escape, authorization anomaly, migration failure, and growing dead-letter backlog; ticket sustained latency or stuck-review/job/business-integrity conditions.

## Backup and restore

The local acceptance suite creates an AES-256-GCM authenticated bundle containing typed repository state and exact object bytes, then restores into a clean store and verifies relationships, audit hashes, permissions, dates, storage keys, and bytes. It also fails closed for wrong keys and tampering:

```powershell
pnpm exec tsx --conditions=development --test tests/acceptance/operations.backup.test.ts tests/acceptance/operations.restore.test.ts
```

This is review evidence, not the production backup mechanism. Production needs monitored PostgreSQL backups, object/version retention, protected configuration/key recovery, immutable audit/package coverage, cross-failure-domain copies where approved, and a coordinated restore. A database-only restore is insufficient.

For every governed rehearsal: record approved RPO/RTO, scenario, source recovery point, isolated target, actor/approver, start/end, recovered counts/hashes, relationship/permission/audit validation, lost interval, achieved RPO/RTO, exceptions/remediation, and evidence location. Never overwrite production during a test. Rotate/decommission the isolated environment under retention policy after approval.

## Incident and rollback runbooks

- Service outage: freeze change, establish correlation/time window, inspect dependencies/capacity, restore service or last known-good digest, verify smoke checks, preserve evidence.
- Failed migration/data corruption: stop writes, do not edit schema manually, capture state, use the rehearsed rollback or isolated coordinated restore, reconcile audit/object/outbox integrity before reopening.
- Credential/key exposure: revoke/rotate affected identity, secret, certificate, or token; review access/audit/export evidence; redeploy protected configuration; notify per policy.
- Unauthorized access: contain identity/session/network path, preserve logs/audit, determine affected scope/exports/files, engage security/privacy/contract owners, remediate and revalidate authorization.
- Malicious upload: quarantine object/boundary, stop related preview/download, preserve scanner evidence, investigate uploader/scope, rescan/reconcile released derivatives.
- Integration backlog: stop unsafe retries, classify transient/permanent failures, reconcile by idempotency/external ID, require independent reason for replay, monitor terminal result.
- Incorrect controlled record/package: do not overwrite history; suspend use/distribution, issue governed correction/supersession/new package version, identify recipients and source delta.
- Lost device/offline queue: revoke identity/device, deny authoritative claims, inspect queued draft scope/timestamps/conflicts, reconcile only through controlled sync.

## Required operating ownership

Before pilot, name the service owner, product owner, industrial/QC authority, security/privacy contact, on-call/support path, data/records owner, identity administrator, backup/recovery owner, integration owners, and vendor escalation. Record support hours and severity/response/communication targets.

## Production authorization checklist

- All ten ADRs accepted or superseded.
- Managed PostgreSQL sizing, connection limits, failover, and approved pilot volume validated.
- Identity/MFA/Conditional Access/B2B/break-glass/access-review evidence approved.
- Managed database/storage/scanner/queue/vault/telemetry, DNS/certificates, alert routes, backups, and restores validated.
- Retention, legal hold, immutable audit, customer/contract data handling, and PDF/preservation decisions approved.
- Approved load/network/file/package budgets pass; intermittent connectivity and lost-device cases pass.
- Manual WCAG 2.2 AA, assistive-technology, keyboard/zoom/reflow, physical tablet/field review, security review, and incident/support exercise complete.
- Product owner, industrial/QC authority, security authority, and designated production owner record explicit authorization.
