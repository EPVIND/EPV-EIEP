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
```

Record source revision, lockfile SHA, workflow run/build ID, Bicep version, fourteen migration checksums, 61-constraint result, test reports, CycloneDX artifact, image digests/scans/signatures, approvals, deployment record, and smoke/observation results. `.github/workflows/verify.yml` supplies a read-only CI review implementation; live repository protection and environment approvals must be configured by an owner.

The tracked `docs/02-architecture/openapi-v1.json` and runtime route-schema registry
are generated from the API's TypeScript route contracts; `pnpm run verify` fails on
either source-schema or published-contract drift. Record the OpenAPI hash and review
any breaking change under ADR-0006 before promotion.

## Environment and deployment gates

Development, test, training, and production must use distinct identity registrations, workload identities, database/storage/queue/vault/telemetry resources, configuration, keys, data, and access. Training retains its visible banner and persistent isolation. Production rejects development authentication, memory persistence, plaintext ingress, missing runtime DB role, missing HTTPS CORS origins, missing metrics secret, or missing managed upload/scanner configuration. API containers use `eiep_runtime` and a distinct managed identity whose Blob Data Contributor scope is limited to the private `staged` container. Worker containers use `eiep_job_worker`, atomic leases, heartbeat renewal, a separate user-assigned worker identity, the private Blob account, and an explicitly supplied private `CLAMAV_HOST`; only this worker receives the account-level data role required to validate, quarantine, release, and generate artifacts. Web and portal containers receive neither data role. Keep the lease duration above normal per-message latency and below the operational stuck-work threshold.

`infrastructure/bicep/main.bicep` deploys nothing. The proposed environment is eligible for an authorized what-if only after ADR-0009, subscription, region/residency, capacity, budget, RPO/RTO, DNS/certificates, app registrations, role assignments, and action groups are approved. The proposal fails closed for production without a controlled authorization reference and for every environment unless API/web/portal/job-worker images use immutable `@sha256:` references.

Deployment sequence after those approvals:

1. Confirm release/change window, migration and rollback plans, communications, on-call owner, backup currency, and authorization record.
2. Run and review cloud what-if; verify no public data-service path, password database auth, shared storage key, or unapproved resource/region appears.
3. Validate Key Vault references and managed identities without displaying secret values.
4. Capture a coordinated pre-change database/object/configuration/audit/package recovery point.
5. Run the checksum migration runner using the migrator identity; never use the API runtime identity for DDL.
6. Deploy the already-reviewed image digests, smoke test, observe agreed signals, and either close or execute the rehearsed rollback.

## Smoke checks

- HTTPS health responds with the expected environment/training boundary and still reports `productionReady: false` until all blockers are closed.
- OIDC issuer/audience/MFA and a current local subject map correctly; disabled/unassigned/cross-project/direct-object cases fail closed.
- Runtime DB identity is `eiep_runtime`; schema mutation is denied; expected migration checksum/revision is present.
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
pnpm exec tsx --test tests/acceptance/operations.backup.test.ts tests/acceptance/operations.restore.test.ts
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
