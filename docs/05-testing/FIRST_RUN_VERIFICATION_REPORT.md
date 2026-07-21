# Local Verification and Acceptance-Evidence Report

Status: Local review gates pass; production acceptance is not claimed  
Date: 2026-07-21  
Workstation evidence: Windows, Node.js 24.14.0, pnpm 11.9.0, repository-local PostgreSQL 18.4.0, Bicep 0.45.15, Playwright 1.61.1 / Chromium 149.0.7827.55

## Result

The controlled MVP vertical slice and supporting platform services build and pass the available local automated gates. The evidence includes governed identity mapping, scoped authorization, guided authoritative project setup/readiness, authenticated file upload, independent MTR review and material movement, complete PMI component/result capture, NCR responsibility/corrective action, all eleven controlled form/report snapshots, an operational dashboard, project/documents/material/PMI/inspection/NCR/punch/turnover/subcontractor workflows, interchange, background work, offline safety, recovery, provisional performance, browser accessibility, infrastructure compilation, and delivery controls.

This report does not authorize live use. No deployable Azure subscription access,
approved Entra applications/policies, managed database/storage/scanner/queue,
production identity, real project data, approved pilot budget, or owner authorization
was supplied.

## Executed evidence

| Command/check | Result | Evidence |
|---|---|---|
| `pnpm run verify` | Passed | Production/training boundary, secret scan, 40/25 requirement traceability, generated OpenAPI drift, 11 Bicep templates, four container-definition targets, strict TypeScript, 77 unit/integration/security/acceptance tests, and compiled API/worker/browser process checks |
| `pnpm run build` | Passed | 12 build-bearing workspaces; internal web and partner portal production bundles without source maps; API, workers, recovery, contracts, shared packages |
| `pnpm run containers:verify` | Passed within `verify` | One digest-pinned Node 24 base, four rootless production targets, portable compiled workspace deployment, runtime browser configuration/security headers, and Bicep environment wiring |
| `pnpm run database:verify` | Passed | Fourteen reversible migration pairs applied on disposable PostgreSQL 18.4; 61 controlled constraints and runtime/worker role boundaries; immutable MTR/movement/report tables; required PMI/NCR execution detail; record-normalized restart, typed hydration, rollback, atomic outbox, 2,000-record behavior, concurrent stale updates, and competing leases |
| `pnpm run test:browser` | Passed | Five tablet-Chromium tests including the guided document-to-turnover chain; fail-closed states, scoped workflows, typed confirmation/current-version submission, 44-pixel actions, and zero serious/critical axe findings |
| `pnpm audit --prod --audit-level high` | Passed | No known production dependency vulnerability reported by the configured registry |
| `pnpm run infrastructure:verify` | Passed within `verify` | Pinned Bicep 0.45.15 compiled 11 templates; `main.bicep` remains zero-resource review-only; proposed deployment has separate foundation/runtime authorization guards, private services, an explicit Entra PostgreSQL administrator, and scoped Blob/Key Vault roles |
| `pnpm run openapi:verify` | Passed within `verify` | TypeScript-derived runtime schemas match 112 active `/v1` routes; generated OpenAPI 3.0.3 publishes 89 request bodies, path/query validation, bearer security, and shared safe errors while excluding internal metrics/training/source-intake surfaces |
| `pnpm run sbom:generate` | Passed | CycloneDX 1.6 production inventory contains 150 components, a merged transitive dependency graph across workspaces, the lockfile SHA, and no local filesystem paths |
| GitHub Actions `verify` run `29862697475` at `355dfca` | Passed | Clean hosted Linux run completed source verification, build, PostgreSQL 18 verification, five tablet/axe workflows, production dependency audit, and a retained `controlled-verification-evidence` SBOM artifact; this earlier run predates the new hosted image-build step |
| Turnover renderer review fixture | Passed | Seven searchable letter-size pages; 72 exact source snapshots; JSON/CSV/log hash verification; no JavaScript; individual visual page inspection; PDF/A explicitly unclaimed |

## Automated coverage summary

- AC-01: isolated environments, source/training exclusion, frozen dependency policy, CI/SBOM, pinned IaC compiler, guarded production proposal.
- AC-02: signed OIDC-to-local-account resolution; lifecycle disable; deny-default organization/project/work-package/object scope; portal/search/export/file leakage checks; bounded grants/delegations.
- AC-03: attributable UTC audit, correlation, hashes, recursive redaction, controlled transitions, legal hold, retention, three-party disposition, and no normal physical delete.
- AC-04: guided participant/structure/responsibility/configuration setup, server-derived activation readiness, independently approved effective-dated rules, authenticated exact-byte staging, exact controlled document revision, release/supersession/distribution/acknowledgement, and governed files.
- AC-05: receipt bound to the exact active approved project rules, independent exact-revision MTR comparison, immutable receipt/split/release/issue/return/relocation/quarantine movements, heat/quantity/dimensions/evidence, genealogy, issue denial, and explainable release blockers.
- AC-06: PMI applicability with exact rule provenance and independently approved material override, component location/notes, instrument/method/verification/validity/qualification/evidence gates, independent acceptance, and an explicit atomic failed-result quarantine/NCR path, plus versioned inspection plans.
- AC-07: NCR initial evidence/responsible party, containment, required corrective action, disposition/independent approval/reinspection/closure plus governed punch ownership/evidence/verification/closure.
- AC-08: subcontractor qualification, seven prerequisite classes, expiry/renewal, scoped portal submissions, and separate EPV acceptance.
- AC-09: completion boundaries, requirement readiness states, exact immutable source-byte snapshots, searchable PDF plus JSON/CSV/log artifacts, regeneration, source hashes, and deltas.
- AC-10: request bounds, safe errors/headers, protected metrics, jobs, retry/dead letter/reconciliation, offline metadata/denial, encrypted coordinated repository/file backup and clean restore, provisional performance guards.

## Important architecture boundary

PostgreSQL migrations define controlled schemas, constraints, permissions, master data, and identity data. The running adapter persists one typed row per domain record with indexed project/state/work metadata, optimistic row revisions, serializable retry, bulk changes, append-only audit behavior, and atomic expiring worker leases with heartbeat renewal. The retired aggregate baseline remains unchanged only for reversible migration history, and runtime access to it is revoked. Restart, rollback, atomic outbox, competing claims, lease renewal/expiry reclaim, and 2,000-record behavior pass locally. Production still requires approved managed-service sizing, failover, monitoring, backup/restore, and pilot-volume evidence.

The proposed Entra-only PostgreSQL path now rejects embedded passwords and connection-string TLS overrides, obtains a new short-lived managed-identity token for each pool connection, and verifies the server certificate. The API, worker, migration, and verification clients share this contract. A governed bootstrap checks exact Entra object IDs and refuses API/worker identity aliasing before granting their distinct NOLOGIN application roles. Bicep supplies an explicit PostgreSQL Entra administrator, constructs separate passwordless API/worker URLs from deployed resource identities, creates the metrics secret from a secure parameter, and grants only the API access at that exact secret scope. Unit/static/compiled evidence passes; no live token, administrator, principal creation, or role membership has been exercised without an Azure subscription.

Local file intake accepts authenticated multipart bytes only after project-scope authorization, derives SHA-256 server-side, writes under an opaque project key, converges exact retries, rejects changed bytes, and leaves no record for unauthorized requests. Validation is exercised through an opaque-key filesystem adapter with byte-derived type/hash/container checks and an optional ClamAV boundary. A separate Azure SDK adapter passes local private-container, immutable-write, SHA-256/ETag, bounded-stream, quarantine/release/generated-object, and interrupted-move recovery contracts using managed-identity construction. File staging and independent release enqueue transactional outbox work that the atomically leased worker scans, records, moves, and completes idempotently. The guarded Bicep proposal grants the API identity Blob Data Contributor only on the staged container and the worker identity the account-level data scope, and requires a private scanner host. This does not prove a deployed Azure account, private endpoint, role assignment, scanner, or worker. Integration delivery has a bounded job worker and real HTTP/HMAC transport, but no customer/ERP/email endpoint or managed queue credentials were supplied.

All eleven controlled MVP forms/reports generate immutable revisioned structured JSON and searchable printable HTML with exact source identifiers, versions, states, canonical hashes, stable filenames, status/source metadata, redaction, print warning, and audited download. The live project dashboard recalculates readiness, currency, traceability, expirations, exceptions, subcontractor state, turnover completeness, and privileged activity through the same report-read authorization boundary. These local outputs have not received business-owner/pilot acceptance.

Turnover generation now freezes the exact canonical source bytes behind every manifest digest and enqueues an outbox message. The leased worker invokes a pinned Chromium renderer and idempotently persists searchable PDF plus exact JSON, CSV, and a last-written hash-verifying generation log without arbitrary network or JavaScript access; a replay adopts a complete immutable set without rerendering. The local 72-entry review fixture renders cleanly across seven inspected pages. The path is not deployed against managed object storage, and PDF/A conformance remains deliberately unclaimed pending an approved profile, converter/validator, fonts/color policy, and contractual evidence.

Production artifacts now have four Docker build targets derived from one Node 24
base pinned by digest. API and worker use portable production-only pnpm deployments;
web and portal serve compiled bundles through a minimal Node server that validates an
exact API origin at startup, injects it at request time, emits a restrictive CSP and
other browser protections, and exposes a separate health endpoint. All targets run as
the unprivileged `node` user and carry the full source revision. Local compiled
artifact and server smoke tests pass. Docker is not installed on this workstation,
so an actual Linux image build, image IDs, and Chromium-in-image validation remain
pending the updated hosted workflow; registry digests, vulnerability scans, and
signatures remain release evidence rather than local claims.

## Evidence not available locally

| Required production evidence | Blocking dependency |
|---|---|
| Accepted application, identity, database, storage, audit/signature, job, offline, search, Azure/recovery, and PDF ADRs | Named product, QC, security, records, architecture, and operations owners |
| Entra MFA/Conditional Access/B2B lifecycle, disabled/revoked users, break-glass and cross-tenant cases | Tenant/app registrations, policies, licensing, test identities |
| Managed PostgreSQL sizing, connection limits, failover, and approved pilot-volume behavior | Subscription, approved service tier, deployed environment, and pilot profile |
| Managed Blob boundaries, short-lived downloads, malware service, immutable audit retention | Subscription, identities, policies, service selection, keys |
| Managed queue/provider crash/replay, notification and external-interface contracts | Counterpart owners, endpoints, credentials, network |
| Approved RPO/RTO and recurring coordinated restore meeting them | Production owner, backup policy, deployed database/object/config/audit/package services |
| Approved load, device, file, network, large-package, and concurrency budgets | Pilot scope, supported devices, network profile, user volume |
| Manual WCAG 2.2 AA, screen-reader, keyboard, zoom/reflow, touch/outdoor field review | Accessibility reviewer and approved physical devices |
| Manual security/threat/penetration/container-image review and incident exercise | Security authority, deployed images/environment, support team |
| Built image IDs, registry digests, vulnerability results, and signatures | Clean hosted builder, approved ACR, scanner/signing policy, and deployment identity |
| Production authorization | Product owner, industrial/QC authority, security authority, designated production owner |

## Conclusion

The repository is reproducibly installable, type-safe, tested, buildable, migratable on disposable PostgreSQL 18, and browser-exercised both on this workstation and a clean GitHub-hosted Linux runner. Its health response intentionally reports `productionReady: false`. The requirements matrix records every remaining external acceptance boundary.
