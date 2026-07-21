# Infrastructure review baseline

Status: Compiled review implementation; ADR-0009 remains Proposed and no cloud deployment is authorized.

## Safe boundaries

- `bicep/main.bicep` is the only safe entry point before approval. It deliberately compiles to zero resources.
- `bicep/proposed-environment.bicep` composes the review modules. Every module uses one deployment guard.
- Production requires `productionAuthorized=true` and a nonempty controlled authorization reference.
- Application containers require both `runtimeAuthorized=true` and a nonempty
  controlled `runtimeAuthorizationReference`; runtime also requires an approved
  action-group resource ID, alert-configuration reference, evaluation windows,
  severities, and measured thresholds. The authorization references default closed,
  so foundation deployment cannot start code before migrations, managed-identity
  mappings, and alert routing are reviewed.
- Every environment requires API, web, portal, and job-worker images addressed by `@sha256:` digest. A mutable tag disables the proposed deployment.
- `containers/Dockerfile` supplies the four corresponding rootless build targets
  from one Node 24 base pinned by digest; definition and compiled-runtime checks run
  locally, and clean hosted run `29865776583` built/smoked all four. Its runner-local
  image IDs do not replace approved ACR digests, scans, or signatures.
- No template accepts a PostgreSQL administrator or runtime password. Separate API
  and worker URLs are constructed from their deployed identity names and the managed
  database FQDN; both pools acquire short-lived Entra tokens and enforce certificate
  verification.
- Development, test, training, and production parameters/resources must be distinct. Production requires a separate approved subscription.

## Proposed modules

The 12 compiled templates cover virtual networking/private DNS, separate frontend, API, and job-worker user-assigned identities, Log Analytics, private storage, Key Vault, private endpoints, Entra-only PostgreSQL 18 with an explicitly supplied administrator plus HA/backup settings, Container Apps for API/web/portal plus the background job worker, and Azure Monitor metric alerts. A secure Service Bus module is compiled for a future approved external-integration or independent-scaling boundary, but the MVP environment deliberately does not instantiate it, its queues, private endpoint, or DNS zone; ADR-0006 selects the PostgreSQL transactional outbox/worker instead. The Container Apps environment routes all supported resource-log categories to dedicated Log Analytics tables through a diagnostic setting. Twelve proposed metric rules cover missing replicas and excessive restarts for all four Container Apps, API request timeouts, PostgreSQL availability and storage saturation, and managed-storage availability. Every rule uses the externally approved action group; thresholds, windows, evaluation frequency, and paging/ticket severities are mandatory parameters with no repository defaults. The API identity receives Blob Data Contributor only on the private `staged` container; the worker identity receives the account-level Blob data role needed to validate, quarantine, release, and generate governed artifacts. The template creates the metrics token as a secure Key Vault secret and grants only the API identity secret-read access at that exact secret scope; the worker and browser-facing containers receive no vault role. Both database clients use distinct generated URLs and dynamic Entra tokens; the governed post-migration bootstrap verifies exact Entra object IDs before granting the API and worker different NOLOGIN application roles. The worker may scale from one to five replicas because PostgreSQL claims are atomic, expiring, and token-released. API liveness is process-only, readiness checks PostgreSQL and managed staging, and browser containers receive only the generated API HTTPS origin at runtime. Public access is disabled on data services; application ingress rejects insecure transport. These are proposed settings, not deployed evidence.

## Pinned verification tool

`bicep/toolchain.json` pins Bicep 0.45.15 and the official Windows/Linux x64 SHA-256 values. Install that release from the official Microsoft Bicep release, verify its platform hash, and either place it on `PATH`, set `BICEP_PATH`, or on Windows place it at `%USERPROFILE%\.bicep\bicep.exe`.

```powershell
$env:BICEP_PATH = "$env:USERPROFILE\.bicep\bicep.exe"
pnpm run infrastructure:verify
```

The check compiles all templates in memory, rejects compiler diagnostics, verifies that `main.bicep` has no resources, and checks the authorization/digest guard, representative private-service controls, approved-action routing, metric validation, and absence of invented alert defaults. `pnpm run containers:verify` separately checks the production image definitions, unprivileged users, pinned base, runtime configuration, and Bicep wiring without requiring Docker.

## Proposed deployment inputs

Before an authorized what-if, supply environment, location, unique deployment stamp, registry server, four digest-qualified images, the metrics token through a protected secure-parameter channel, OIDC issuer/audience, exact HTTPS CORS origins, the PostgreSQL Entra administrator name/object/type, an active least-privilege worker account/organization, the approved action-group resource ID, alert-configuration reference, evaluation frequency/windows, paging/ticket severities, and measured timeout/restart/database-storage/storage-availability thresholds. The alert values have no defaults. Deploy the foundation with `runtimeAuthorized=false`, apply migrations and the exact-identity bootstrap, then review a second what-if before setting it true with the controlled runtime and alert evidence references. Do not put the metrics token or any other secret value in a parameter file or command history.

## Missing authorization/evidence

Subscription ownership, regions/residency, RPO/RTO, DNS/certificates, service tiers/capacity, budget, action groups/alert routing, app registrations, ACR pull and deployment/migrator authority, what-if review, deployment, smoke tests, backup/restore, and operations acceptance are not available in this repository. Until those are approved, do not invoke the proposed template against a cloud resource group.

Local PostgreSQL may instead be exercised with `pnpm run database:verify`, which uses disposable repository-local PostgreSQL 18 and removes its data afterward.
