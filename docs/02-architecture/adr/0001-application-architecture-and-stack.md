# ADR-0001: Application architecture and technology stack

Status: Proposed  
Date: 2026-07-20  
Decision owners: Product owner, solution architect, delivery lead, security authority  
Requirements affected: All MVP requirements; NFR-MNT-001 through NFR-MNT-004

## Context

The repository has a controlled product baseline but no inherited implementation.
The first release must prove a transactional vertical slice without introducing
premature distributed-system risk.

## Decision drivers

- Fast delivery of a reviewable vertical slice.
- Strong runtime validation, server-side authorization, and transactional state.
- Shared contracts across responsive web, portal, API, worker, and tests.
- Clear module boundaries and a future extraction path.
- Maintainable deployment for a small startup implementation team.

## Considered options

- TypeScript modular monolith with React, Fastify, and PostgreSQL.
- .NET 10 modular monolith with React and PostgreSQL.
- Java/Kotlin Spring modular monolith with React and PostgreSQL.
- Microservices from the first increment.
- Commercial low-code platform.

## Decision

Propose Node.js 24 LTS, strict TypeScript 5.9, pnpm workspaces, React 19.2,
Vite 8.1, Fastify 5, and PostgreSQL 18. Deploy an API modular monolith plus a
separate background worker. Keep domain/application code independent of HTTP,
database, identity, file, queue, and cloud adapters.

Detailed rationale and alternatives are in
`../TECHNOLOGY_STACK_RECOMMENDATION.md`. This proposal is not approved for
production until the named owners accept it.

## Consequences and risks

- One primary language reduces contract and staffing overhead.
- A modular monolith preserves local transactions across release gates.
- Dependency and JavaScript ecosystem churn require pinned versions, an SBOM,
  automated scanning, and planned upgrade windows.
- Boundary erosion must be prevented through dependency rules and module-owned
  repositories.

## Security, data, and operations impact

Every HTTP input receives JSON Schema validation. Authorization and controlled
state transitions occur in application services. OCI artifacts are immutable and
run as least-privilege workload identities. Production dependencies must stay on
supported release lines.

## Migration and rollback

There is no legacy code migration. A stack reversal before persisted production
data requires replacing adapters and deployables while retaining API/data contracts.
After production data exists, use versioned export/import and a rehearsed cutover;
never rewrite controlled history in place.

## Validation evidence

Required before acceptance: clean setup/build, module-boundary checks, API contract
tests, PostgreSQL integration tests, browser/tablet validation, dependency/security
review, and accountable-team maintainability review.

## Supersedes / superseded by

None.

