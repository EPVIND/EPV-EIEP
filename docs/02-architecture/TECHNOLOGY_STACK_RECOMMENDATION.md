# Production Technology Stack Recommendation

Status: Proposed - requires product-owner, solution-architecture, security, and
operations approval  
Date: 2026-07-20  
Requirements affected: All MVP functional requirements; NFR-SEC-001 through
NFR-DAT-003

## Recommendation

Build the first vertical slice as a TypeScript modular monolith with two responsive
React web applications, a Fastify API, a separate background worker, PostgreSQL as
the relational system of record, protected object storage for files, and Azure as
the initial managed deployment platform.

Use the current patched release within these approved major lines at build time:

| Layer | Proposed technology |
|---|---|
| Runtime | Node.js 24 LTS |
| Language/package management | TypeScript 5.9 in strict mode; pnpm 11 workspace with a committed lockfile |
| Internal and external UX | React 19.2, Vite 8.1, responsive PWA shell; separate `apps/web` and `apps/portal` entry points sharing controlled UI packages |
| API | Fastify 5 modular monolith; JSON Schema request/response validation; generated OpenAPI contract |
| Persistence | PostgreSQL 18, current minor; parameterized repository layer and explicit versioned SQL migrations |
| Files | Azure Blob Storage with staging, quarantine, released, package, and audit-evidence boundaries |
| Identity | Microsoft Entra ID workforce tenant with B2B collaboration for approved business guests; separate app registrations and protected configuration per environment |
| Background work | PostgreSQL transactional outbox/inbox plus a Node worker; Azure Service Bus adapter when an external integration or scale requirement justifies it |
| Search/reporting | PostgreSQL full-text/trigram search and read projections for MVP; dedicated managed search only after measured need |
| Observability | OpenTelemetry-compatible structured logs, traces, metrics, correlation IDs, Azure Monitor/Application Insights in hosted environments |
| Infrastructure | Azure Container Apps, Azure Database for PostgreSQL Flexible Server, Blob Storage, Key Vault, Container Registry, Monitor, and infrastructure as code |
| Tests | Node test runner for domain/integration tests, Playwright for browser/acceptance, axe-based accessibility checks, containerized PostgreSQL integration tests, and a governed load-test tool |

Version lines are approval boundaries, not permission for automatic major upgrades.
Patch and security updates remain required. Node's official policy identifies v24 as
LTS and recommends production use of LTS lines. PostgreSQL supports each major for
five years and currently lists PostgreSQL 18 as supported through 2030. Sources:
[Node.js releases](https://nodejs.org/en/about/previous-releases),
[PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/),
[Fastify v5 documentation](https://fastify.dev/docs/latest/Reference/),
[Vite supported releases](https://vite.dev/releases.html), and
[React 19](https://react.dev/blog/2024/12/05/react-19).

## Why this fits the first release

- One language across browser, API, worker, shared validation, and test fixtures
  reduces translation overhead while the domain is still being established.
- A modular monolith provides transactional consistency for document revision,
  material release, inspection, NCR, and turnover gates without premature network
  boundaries.
- Fastify's schema-first validation supports explicit API contracts and rejection of
  unknown/invalid input. Domain policy remains independent of HTTP or Fastify.
- PostgreSQL provides transactions, constraints, recursive queries for genealogy,
  JSON support for controlled extension data, full-text search, and mature backup
  tooling without making mutable JSON the primary domain model.
- React supports desktop/tablet workflows and a narrowly controlled offline PWA
  strategy while keeping release decisions on the authoritative server.
- Azure managed identity, Entra integration, protected storage, managed PostgreSQL,
  and Container Apps reduce infrastructure operations for the initial team.
  Container Apps supports managed identities, revisions, jobs, internal ingress,
  virtual networks, and event-driven scaling. Sources:
  [Container Apps overview](https://learn.microsoft.com/en-us/azure/container-apps/overview)
  and [security overview](https://learn.microsoft.com/en-us/azure/container-apps/security).

## Application and module shape

Deploy one API artifact and one worker artifact while keeping code boundaries
explicit:

- identity/access;
- organizations/project structure;
- controlled documents/files;
- material assurance;
- inspection/PMI;
- NCR/punch;
- subcontractors;
- completion/turnover;
- audit, configuration, reporting, and integrations.

Modules may reference shared stable identifiers and published domain contracts. A
module must not query another module's tables as an undocumented shortcut. Extract
a service only when independent scaling, isolation, ownership, or lifecycle is
demonstrated.

## Identity and permission implications

Use OIDC/OAuth authorization code flow with PKCE. Entra authenticates and applies
MFA/Conditional Access; EIEP maps the immutable issuer/subject to a local
`UserAccount`. B2B collaboration lets approved external users bring existing
credentials while EPV retains resource-tenant control. Source:
[Microsoft Entra B2B collaboration](https://learn.microsoft.com/en-us/entra/external-id/what-is-b2b).

Authentication never grants project access by itself. Every query and command must
intersect:

1. authenticated user and acting organization;
2. active role/delegation and effective time;
3. project, work-package, organization, and object scope;
4. record state and required qualification/separation of duty;
5. requested action and recipient/export scope.

The UI may hide unavailable actions, but the API is authoritative. Database roles,
constraints, scoped repositories, and selected row-level policies provide defense
in depth after connection-pooling behavior is proven.

## Data, audit, and file implications

- Use UUIDv7 or another approved time-sortable opaque stable ID. Business numbers
  remain separately constrained and never become cross-module foreign keys.
- Store UTC timestamps and the originating IANA time-zone identifier when business
  context requires it.
- Use explicit state and optimistic concurrency version columns on controlled
  records. Model supersede, void, archive, and governed disposition rather than a
  generic delete flag.
- Write state change, audit event, and outbox message in the same database
  transaction. Ordinary application roles receive no audit update/delete grant.
- Hash audit canonical payloads and export signed/immutable audit segments to
  protected storage according to the audit ADR.
- Upload to restricted staging. Release only after authorization, size/type/content
  validation, malware status, hash, and retention metadata pass.
- Store content by opaque storage key. Never place customer/project names in public
  URLs or trust a filename as identity.

## Offline and intermittent-connectivity strategy

Classify MVP operations conservatively:

| Classification | Initial workflows |
|---|---|
| Online required | Release/approval/signature, current-for-work decision, authorization administration, project activation, material issue/release, NCR disposition/closure, turnover generation |
| Queued capture candidate after pilot validation | Draft observations, photos/evidence metadata, non-authoritative measurements, punch draft |
| Read-only cache candidate | Explicitly downloaded assigned current documents with revision, sync time, expiry, and offline warning |

Phase 1 ships online workflows and a PWA shell; it does not claim offline mutation
acceptance. A later controlled increment may use IndexedDB with encrypted-at-rest
device policy where supported, per-device queue identity, original/sync times,
idempotency keys, conflict history, revocation, and remote-wipe/retention treatment.
An offline client never asserts release or current authority.

## Deployment and environment implications

- Use separate development, test, training, and production resource boundaries.
  Production and training must not share database, storage account/containers,
  identity app registration, keys, queues, search index, notification recipients, or
  telemetry access.
- Build immutable OCI images once and promote the same digest with protected
  environment configuration.
- Run API and worker with separate managed identities and least-privilege storage,
  database, queue, and vault permissions.
- Use Entra-only PostgreSQL with a passwordless connection descriptor, dynamically
  acquired access tokens, verified TLS, an independently supplied administrator, and
  exact object-ID mapping to separate NOLOGIN application roles. See Microsoft’s
  [managed-identity connection guidance](https://learn.microsoft.com/en-us/azure/postgresql/security/security-connect-with-managed-identity)
  and [Entra role-management contract](https://learn.microsoft.com/en-us/azure/postgresql/security/security-manage-entra-users).
- Parameterize Azure region. Do not approve a primary/secondary region until data
  classification, customer contracts, latency, service availability, and disaster
  recovery objectives are accepted.
- Do not authorize production until coordinated PostgreSQL, object, configuration,
  audit-evidence, and package restore is rehearsed.

## PDF and turnover generation

Generate packages in an isolated worker from versioned HTML/report templates and a
pinned Chromium renderer. Freeze source revisions before rendering and create a
JSON/CSV manifest with stable IDs, hashes, sizes, inclusion reasons, generator
version, actor, recipient scope, and configuration version. PDF/A conversion and
validation require a separately approved tool/license and contract retention
decision; a normal PDF must not be mislabeled PDF/A.

## Migration path

No legacy payload exists at the audit date. Future migrations must use the
integration boundary:

1. register the original asset in `EXISTING_ASSETS_INDEX.md`;
2. preserve source identifiers and immutable raw files/hashes;
3. stage into versioned import tables;
4. validate schema, project scope, duplicate keys, code lists, permissions, and
   controlled-state meaning;
5. preview reconciliation and errors;
6. obtain data-owner approval;
7. commit idempotently through domain services and audit every result;
8. retain rollback/reconciliation evidence.

## Maintainability

- Keep the domain packages independent of Fastify, React, Azure, and PostgreSQL
  adapters so policies can be tested without infrastructure.
- Pin dependencies through `pnpm-lock.yaml`, use automated update proposals, and
  prohibit unreviewed major upgrades.
- Keep SQL migrations forward-only and recovery-tested; never infer schema from an
  ORM at production startup.
- Publish an OpenAPI contract and test backward compatibility for supported API
  versions.
- Prefer platform primitives before adding Redis, Kubernetes, a separate search
  engine, a rules product, or microservices.

## Principal risks and mitigations

| Risk | Mitigation |
|---|---|
| Node/React ecosystem churn | LTS runtime, supported major lines, committed lockfile, SBOM, automated scans, small dependency surface, planned upgrade windows |
| TypeScript types do not enforce runtime input | Full JSON Schema validation, database constraints, explicit domain constructors, negative tests |
| Single deployable could erode module boundaries | Dependency rules, module-owned repositories, contract tests, architecture review |
| Azure lock-in | Keep domain/application code provider-neutral; isolate identity, storage, queue, telemetry, and deployment behind adapters/IaC modules |
| Entra B2B policy/licensing may not fit every external party | Validate pilot partner identities and licensing; retain standards-based OIDC boundary and document fallback before onboarding |
| PostgreSQL audit is not independently immutable by itself | Restrict DB grants, hash events, monitor privileged actions, export immutable segments, reconcile restores |
| PWA offline data may be exposed on lost devices | Start online-only for mutations; approve device, encryption, retention, revocation, and conflict controls before expansion |
| HTML-to-PDF fidelity and long-term preservation vary | Pin renderer/fonts/templates, compare manifests/hashes, visual regression tests, approve PDF/A tool separately |

## Alternatives considered

### .NET 10 / ASP.NET Core with React

Strong alternative for an Azure/Entra-centered organization, with an LTS runtime,
excellent authorization and database libraries, and mature enterprise support.
Choose it instead if the accountable delivery team has materially stronger C# than
TypeScript capability. The tradeoff is a two-language product, duplicated contract
types unless generation is disciplined, and no .NET SDK in the audited workstation
at first run. The official .NET policy lists .NET 10 as active LTS through November
2028: [support policy](https://dotnet.microsoft.com/en-us/platform/support/policy).

### Java/Kotlin with Spring Boot and React

Mature, portable, and well suited to large enterprise teams. It carries more initial
build/runtime complexity for the narrow first slice and offers no documented team or
existing-asset advantage in this repository.

### Microservices from the first increment

Rejected for the first release. Distributed transactions, identity propagation,
versioned events, deployment, and observability would add failure modes before
module scaling or ownership boundaries are demonstrated. The modular design keeps a
future extraction path.

### Commercial low-code platform

Not recommended without a separate fit/security/portability study. The controlled
record history, object-level authorization, offline restrictions, file quarantine,
material genealogy, and immutable turnover versioning require evidence that a
candidate can meet the completion standard without proprietary data lock-in.

## Approval questions before production commitment

- Confirm accountable team skills and support ownership.
- Confirm Azure tenant/subscription strategy, contracts, data residency, regions,
  budget, and vendor-risk posture.
- Confirm Entra licensing, Conditional Access, external-user onboarding, access
  reviews, and break-glass policy.
- Approve RPO/RTO, retention/legal hold, audit immutability, electronic-signature
  assurance, and PDF/A requirements.
- Approve pilot devices, supported browsers, connectivity profile, file sizes,
  expected concurrency, and performance budgets.

Until those questions are resolved, this recommendation and its ADRs remain
Proposed and no scaffold is production-authorized.
