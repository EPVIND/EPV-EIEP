# Environment Strategy

## Required environments

| Environment | Purpose | Data policy | Access and promotion |
|---|---|---|---|
| Development | Local/integrated feature work. | Synthetic or approved sanitized data only. | Developers; frequent rebuild. |
| Test | Automated integration, security, performance, and acceptance preparation. | Controlled synthetic fixtures; no production credentials. | Delivery/test team; promoted builds. |
| Training/Demo | User training and demonstrations. | Clearly fictitious, isolated data only. | Trainees/demonstrators; nonproduction banner. |
| Production | Authorized live EPV projects and controlled records. | Real approved operational data. | Least privilege; change/release control. |

Create short-lived preview environments only if they inherit test data and security controls and are automatically removed.

## Isolation requirements

- Separate databases, object stores, encryption/key boundaries, secrets, identity applications/tenants where approved, queues, search indexes, email recipients, integration endpoints, and telemetry access.
- Production secrets must never be available to development, test, training, pull requests, or client-side builds.
- Training/demo must have prominent persistent labeling in the UI and all exports.
- No direct copy of production data to lower environments without approved sanitization and authorization.

## Promotion

Build an immutable version once, verify it, then promote the same version with environment-specific protected configuration. Record source revision, build evidence, dependencies, migrations, approvals, deployment time, operator, and verification.

## Database changes

- Use versioned forward migrations and a tested recovery approach.
- Separate schema change from destructive data cleanup where practical.
- Back up before production-impacting migrations.
- Rehearse representative data volume and rollback/roll-forward.

## Release flow

Feature review -> integrated development checks -> test deployment -> acceptance/security evidence -> release approval -> production deployment -> smoke verification -> monitored observation -> closure or rollback.

## Production readiness

Confirm DNS/certificates, identity, authorization, secrets, backups, restore, capacity, monitoring, alerts, runbooks, on-call ownership, vendor support, data retention, incident contacts, and rollback before pilot go-live.

