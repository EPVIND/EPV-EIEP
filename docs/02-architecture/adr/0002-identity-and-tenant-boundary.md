# ADR-0002: Identity, MFA, external users, and tenant boundary

Status: Proposed  
Date: 2026-07-20  
Decision owners: Product owner, security/privacy authority, identity administrator  
Requirements affected: FR-IAM-001 through FR-IAM-004, FR-SUB-003, FR-SUB-004,
NFR-SEC-001 through NFR-SEC-004

## Context

EIEP must serve internal users and approved subcontractor, client, inspector, and
vendor users without managing reusable passwords or treating authentication as
project authorization. Commercial multi-tenancy is deferred.

## Decision drivers

- MFA, Conditional Access, lifecycle, access reviews, and federation.
- Scope-limited partner access and rapid revocation.
- Separate environment credentials and app registrations.
- Standards-based exit path.

## Considered options

- Microsoft Entra workforce tenant plus B2B collaboration.
- Separate Entra external tenant/CIAM application.
- Application-managed local credentials.
- A non-Microsoft hosted OIDC provider.

## Decision

Propose the EPV Entra workforce tenant as the resource tenant. Use OIDC authorization
code flow with PKCE for people, Entra B2B collaboration for approved business
guests, Conditional Access for MFA, and managed/workload identities for services.
Use separate app registrations and protected redirect/origin configuration per
environment.

Map immutable token issuer/subject to a local `user_account`; do not use email as
the durable identity key. Authentication creates no project access. Local active
role, organization, project/work-package/object scope, record state, effective time,
qualification, delegation, and separation-of-duty policy remain authoritative.

## Consequences and risks

- EPV avoids storing user passwords and gains governed guest lifecycle controls.
- Entra licensing, partner identity compatibility, invitation governance, and
  Conditional Access must be confirmed.
- B2B guest presence in the workforce tenant requires periodic review and prompt
  project-close revocation.
- If the product becomes commercial multi-tenant, a superseding tenant ADR is
  required.

## Security, data, and operations impact

Validate issuer, audience, signature, expiry, nonce/state, and required assurance
context. Deny ambiguous tenant/subject mappings. Break-glass identities remain
separate, time-bounded, monitored, and reviewed. No production token or app secret
is available to lower environments.

## Migration and rollback

OIDC and a provider-neutral identity adapter isolate the application. A provider
change preserves local user IDs and adds a governed identity-link migration. Disable
the affected app registration and revoke sessions to roll back an onboarding error.

## Validation evidence

Required: tenant/licensing review, MFA/step-up tests, guest invitation/removal,
disabled-user/session revocation, direct-ID/search/export/file denial, service
identity tests, and break-glass exercise.

Implementation evidence now includes a separate one-time operator command for the
otherwise circular first-account boundary. Before any application identity, access,
delegation, or audit state exists, it requires an external authorization reference,
two distinct authority UUIDs, and exactly two distinct time-bounded internal
identity/access administrators. It records provision, independent activation,
immutable subject linkage, grant, independent review, and completion audits; grants
no project or business authority; verifies only an exact idempotent retry; and rejects
partial/conflicting state without mutation. Local in-memory, OIDC-resolution, and
PostgreSQL restart evidence passes. This does not accept this Proposed ADR or prove
live Entra policy, subjects, invitation, MFA, review, or revocation behavior.

## Supersedes / superseded by

None.
