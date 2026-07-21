# Infrastructure review baseline

Status: Compiled review implementation; ADR-0009 remains Proposed and no cloud deployment is authorized.

## Safe boundaries

- `bicep/main.bicep` is the only safe entry point before approval. It deliberately compiles to zero resources.
- `bicep/proposed-environment.bicep` composes the review modules. Every module uses one deployment guard.
- Production requires `productionAuthorized=true` and a nonempty controlled authorization reference.
- Every environment requires API, web, portal, and job-worker images addressed by `@sha256:` digest. A mutable tag disables the proposed deployment.
- No template accepts a PostgreSQL administrator password. Runtime secrets are Key Vault references consumed through scoped workload identities.
- Development, test, training, and production parameters/resources must be distinct. Production requires a separate approved subscription.

## Proposed modules

The 11 compiled templates cover virtual networking/private DNS, separate frontend, API, and job-worker user-assigned identities, Log Analytics, private storage, Key Vault, Service Bus, private endpoints, Entra-only PostgreSQL 18 with HA/backup settings, and Container Apps for API/web/portal plus the background job worker. The API identity receives Blob Data Contributor only on the private `staged` container; the worker identity receives the account-level Blob data role needed to validate, quarantine, release, and generate governed artifacts. Browser-facing containers receive neither data role. The worker may scale from one to five replicas because PostgreSQL claims are atomic, expiring, and token-released. Public access is disabled on data services; application ingress rejects insecure transport. These are proposed settings, not deployed evidence.

## Pinned verification tool

`bicep/toolchain.json` pins Bicep 0.45.15 and the official Windows/Linux x64 SHA-256 values. Install that release from the official Microsoft Bicep release, verify its platform hash, and either place it on `PATH`, set `BICEP_PATH`, or on Windows place it at `%USERPROFILE%\.bicep\bicep.exe`.

```powershell
$env:BICEP_PATH = "$env:USERPROFILE\.bicep\bicep.exe"
pnpm run infrastructure:verify
```

The check compiles all templates in memory, rejects diagnostics, verifies that `main.bicep` has no resources, and checks the authorization/digest guard and representative private-service controls.

## Proposed deployment inputs

Before an authorized what-if, supply environment, location, unique deployment stamp, registry server, four digest-qualified images, Key Vault secret URIs for the database URL and metrics token, OIDC issuer/audience, exact HTTPS CORS origins, and an active least-privilege worker account/organization. Do not put secret values in parameter files.

## Missing authorization/evidence

Subscription ownership, regions/residency, RPO/RTO, DNS/certificates, service tiers/capacity, budget, action groups/alert routing, app registrations, managed-service role assignments, what-if review, deployment, smoke tests, backup/restore, and operations acceptance are not available in this repository. Until those are approved, do not invoke the proposed template against a cloud resource group.

Local PostgreSQL may instead be exercised with `pnpm run database:verify`, which uses disposable repository-local PostgreSQL 18 and removes its data afterward.
