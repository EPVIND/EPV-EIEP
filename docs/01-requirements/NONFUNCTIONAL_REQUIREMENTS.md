# Nonfunctional Requirements

## Security and privacy

- **NFR-SEC-001** Encrypt supported network traffic in transit and production data at rest using approved managed controls.
- **NFR-SEC-002** Keep secrets out of source control, logs, exports, screenshots, client code, and training data.
- **NFR-SEC-003** Apply least privilege, secure defaults, dependency scanning, code review, vulnerability management, and documented incident response.
- **NFR-SEC-004** Authorization must be enforced server-side and tested for horizontal and vertical privilege escalation.
- **NFR-SEC-005** Uploaded content must be isolated until validation and malware-scanning policy is satisfied.

## Reliability and recovery

- **NFR-REL-001** Production shall use monitored backups with defined recovery point and recovery time objectives approved before go-live.
- **NFR-REL-002** Restore tests shall occur before pilot go-live and on a governed recurring schedule.
- **NFR-REL-003** Critical state changes shall be transactional or recoverable without orphaning record relationships.
- **NFR-REL-004** External-integration failures shall not silently lose work and shall support safe retry/reconciliation.

## Performance and scale

- **NFR-PER-001** Performance budgets shall be defined from pilot devices, expected project size, concurrent users, file sizes, and network conditions before production acceptance.
- **NFR-PER-002** Common project lists and record detail screens should respond within the approved pilot budget under representative load.
- **NFR-PER-003** Large exports and document processing shall run asynchronously with visible status and failure recovery.

## Usability and accessibility

- **NFR-USE-001** Field workflows shall support current approved tablet browsers, large touch targets, clear states, and minimal repeated entry.
- **NFR-USE-002** Interfaces shall target WCAG 2.2 AA for applicable web content, subject to documented exceptions.
- **NFR-USE-003** Destructive, release, rejection, and supersession actions shall be explicit and difficult to perform accidentally.

## Offline and connectivity

- **NFR-OFF-001** The team shall classify each field workflow as online-required, queued/offline-capable, or read-only cached.
- **NFR-OFF-002** Offline changes shall preserve user, device, original time, synchronization time, project scope, and conflict history.
- **NFR-OFF-003** The system shall not claim a release or current revision while a device lacks the authoritative state needed to make that determination.

## Maintainability and operability

- **NFR-MNT-001** Use versioned APIs, migrations, automated tests, structured logs, health checks, metrics, alerts, and documented runbooks.
- **NFR-MNT-002** Business rules that vary by project or customer should be governed configuration with effective dates and approvals.
- **NFR-MNT-003** Production changes shall be reproducible from source and promoted through controlled environments.
- **NFR-MNT-004** Logs and telemetry shall use correlation identifiers and avoid unnecessary sensitive content.

## Data portability and retention

- **NFR-DAT-001** Controlled data shall be exportable in documented, durable formats with relationships and identifiers preserved.
- **NFR-DAT-002** Retention, legal hold, archival, and disposition policies shall be configurable by record class and contract.
- **NFR-DAT-003** Time, units, measurement precision, and code lists shall be stored consistently and displayed with project context.

