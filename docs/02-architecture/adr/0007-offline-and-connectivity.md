# ADR-0007: Offline and intermittent-connectivity strategy

Status: Proposed  
Date: 2026-07-20  
Decision owners: Product owner, industrial/QC authority, security/privacy authority,
field UX owner  
Requirements affected: NFR-OFF-001 through NFR-OFF-003, NFR-USE-001, FR-DOC-002,
FR-MAT-005, FR-INS-002

## Context

Field connectivity can be unreliable, but stale clients must not claim current
revision, authorization, or release authority.

## Decision drivers

- Field usability and preservation of captured facts.
- Current-revision, material-release, and approval correctness.
- Lost-device, conflict, revocation, and audit risk.
- Incremental validation on actual pilot devices/networks.

## Considered options

- Online-only MVP with PWA shell and controlled read cache.
- Broad offline-first replication.
- Native mobile application with local database.
- Server-rendered web with no cache.

## Decision

Propose Phase 1 online-required mutations. Permit only explicitly downloaded,
assigned read-only documents to be cached with revision, authoritative sync time,
expiry, user/project binding, and an offline warning. Release, approval, signature,
project activation, authorization administration, current-for-work determination,
material issue/release, NCR disposition/closure, and turnover generation remain
online-only.

After pilot measurement and approval, add a bounded queue for draft observations,
evidence metadata, non-authoritative measurements, or punch drafts. Preserve user,
acting organization, device, original/sync time, project scope, idempotency key, and
conflict history. Server revalidation is mandatory.

## Consequences and risks

- The first implementation makes no unsupported offline acceptance claim.
- Field work may pause without connectivity for controlled actions.
- Cached confidential data requires approved browser/device encryption, retention,
  revocation, and lost-device policy before production use.

## Security, data, and operations impact

Never cache tokens longer than approved session policy or store production secrets.
Clear data on sign-out/revocation where the platform permits. Telemetry must identify
sync age/conflict without exposing document content.

## Migration and rollback

Offline schema versions are independent and migratable. Disable queue submission by
server policy, preserve/export unresolved drafts for authorized recovery, and clear
revoked caches. No queued item becomes accepted merely because the feature is rolled
back.

## Validation evidence

Pilot connectivity profile, supported-device review, stale-revision warning,
revocation/lost-device behavior, offline release denial, duplicate sync, conflict,
clock-skew, storage quota, and accessibility tests.

## Supersedes / superseded by

None.

