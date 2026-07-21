# ADR-0009: Cloud platform, environment isolation, regions, backup, and recovery

Status: Proposed  
Date: 2026-07-20  
Decision owners: Executive sponsor, product owner, security/privacy authority,
solution architect, operations owner  
Requirements affected: NFR-SEC-001 through NFR-SEC-003, NFR-REL-001,
NFR-REL-002, NFR-MNT-001, NFR-MNT-003, AC-01, AC-10

## Context

EIEP needs reproducible isolated environments and coordinated recovery of database,
files, configuration, audit evidence, and generated packages. Contracts, data
classification, regions, RPO/RTO, and budget are not yet supplied.

## Decision drivers

- Entra/managed-identity integration and reduced platform operations.
- Strong production/training isolation.
- Immutable promotion, monitoring, backup, and restore.
- Region and vendor-risk approval before data placement.

## Considered options

- Azure managed services and Container Apps.
- AWS managed services.
- Kubernetes managed by EPV.
- On-premises virtual machines.

## Decision

Propose Azure with Bicep infrastructure as code. Use Azure Container Apps for web/API
and worker/jobs, Container Registry, Database for PostgreSQL Flexible Server, Blob
Storage, Key Vault, Monitor/Application Insights, and optional Service Bus adapters.

Create distinct development, test, training, and production resource boundaries,
databases, storage, identities/app registrations, vaults/keys, queues, notification
routes, and telemetry access. Production uses a separate subscription. Other
environments use separate subscriptions where approved and at minimum separate
resource groups/resources/RBAC with no production trust.

Keep primary/secondary regions parameterized and undecided until customer/contract
data residency, service availability, latency, cost, and approved RPO/RTO are known.
No scaffold default authorizes a region or production deployment.

## Consequences and risks

- Managed identities and platform services reduce secret and cluster operations.
- Azure dependency and service cost require vendor, exit, quota, and cost review.
- Resource separation costs more but is required to prevent training/production
  contamination.
- A database-only backup is insufficient.

## Security, data, and operations impact

Use private networking where practical, least-privilege managed identities, protected
administrative access, centralized security telemetry, current base images, managed
keys, and restricted deployment identities. Build once and promote the same image
digest with environment configuration.

Back up and restore PostgreSQL, blobs/versions, configuration needed to recreate
keys/resources, audit segments, and packages as a coordinated evidence set. Key
material recovery follows approved managed-key policy without exporting secrets into
the repository.

## Migration and rollback

Bicep changes are reviewed and previewed. Application rollback uses a prior image
revision only when database compatibility is proven. Infrastructure/data rollback
uses rehearsed roll-forward or coordinated restore. A provider exit exports
PostgreSQL, objects with hashes/metadata, audit segments, identities/assignments,
configuration contracts, and deployment records.

## Validation evidence

Architecture/cost/data-residency approval, IaC lint/what-if, environment-boundary
tests, managed-identity tests, image promotion evidence, capacity/alert tests,
coordinated restore meeting approved RPO/RTO, region-failure exercise, and rollback.
The guarded Bicep and four rootless image definitions compile and pass local static
and process checks; no Azure what-if, registry digest, live identity, restore, or
capacity evidence exists yet. The proposal compiles twelve Azure Monitor metric
rules, but deliberately supplies no action destination, thresholds, windows, or
severity defaults; owners must approve those values and validate live signal/action
routing. The optional secure Service Bus module also compiles,
but the MVP proposal intentionally does not instantiate it because ADR-0006 selects
the PostgreSQL outbox/worker until a separate integration or scale boundary is approved.

## Supersedes / superseded by

None.
