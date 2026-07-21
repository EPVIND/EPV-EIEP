# Security Baseline

Security controls must be refined through threat modeling and approved architecture decisions before production use.

## Identity and access

- Use a supported identity provider, MFA, secure session management, and automated deprovisioning where practical.
- Separate internal, subcontractor, client, service, integration, and break-glass identities.
- Enforce least privilege and object-level authorization server-side.
- Review privileged and external access on a governed schedule and at project close.
- Require stronger assurance or step-up authentication for configured critical approvals.

## Application security

- Follow current OWASP application and API guidance applicable to the selected stack.
- Validate all input; use parameterized persistence; encode output; protect against request forgery and unsafe redirects.
- Rate-limit and monitor authentication, file, search, export, and integration endpoints.
- Use secure headers, cookies, origin policy, dependency pinning, software composition analysis, secret scanning, static analysis, and tested patch procedures.
- Never trust client-side role checks, hidden fields, or record state.

## Files and documents

- Place new uploads in a restricted staging state.
- Validate size, extension, detected type, archive content policy, malware scan, project scope, and uploader authorization.
- Store immutable content hashes and prevent executable active content where not required.
- Use short-lived, authorized download access; do not expose permanent public object URLs.
- Generate previews in an isolated process and record processing status/errors.

## Data protection

- Encrypt data in transit and production storage with approved managed keys and rotation.
- Classify customer confidential, export-controlled, personal, safety, quality, commercial, and credential data.
- Minimize sensitive data in logs, search indexes, caches, notifications, analytics, and training/demo.
- Define retention, legal hold, archival, and secure disposition by record class and contract.

## Audit and nonrepudiation

- Protect audit events from ordinary application modification or deletion.
- Record successful and failed privileged actions, authorization denials, exports, configuration changes, key record transitions, and integration actions.
- Electronic signatures must bind signer, record/revision, meaning, time, and authentication context at the approved assurance level.
- Administrative impersonation, if permitted at all, must be visible, consented/authorized, time-bounded, and audited.

## Infrastructure and operations

- Use infrastructure as code, controlled promotion, separate accounts/subscriptions/projects where approved, private networking where practical, and restricted administrative access.
- Centralize security logs, health, metrics, alerting, time synchronization, vulnerability management, and incident response.
- Back up database, files, keys/configuration, and required audit evidence; test coordinated restore.
- Document supplier/service dependencies and incident, outage, exit, and data-export plans.

## Secure delivery gates

- Threat model for the vertical slice.
- Code and configuration review.
- Automated dependency, secret, static, and container/image scans as applicable.
- Authorization matrix tests and manual penetration testing proportional to risk.
- No unresolved critical/high finding without formal risk acceptance and time-bounded treatment.
- Restore, key recovery, logging, alerting, and incident runbooks tested before go-live.

