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

## Supersedes / superseded by

None.

