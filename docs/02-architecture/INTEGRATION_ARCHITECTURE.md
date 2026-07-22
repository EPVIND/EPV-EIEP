# Integration Architecture

## Principles

- The EIEP system of record owns EIEP state; external systems retain authority for their defined domains.
- Every interface has an owner, purpose, data classification, contract/version, authentication, authorization, direction, frequency, retry, reconciliation, monitoring, retention, and support plan.
- Imports are staged, validated, previewed, and attributable before commit.
- External identifiers are preserved alongside EIEP stable IDs.
- Duplicate deliveries must not create duplicate business records.
- Failures are visible and recoverable; integrations never silently discard records.

## Priority tiers

### MVP

- Identity provider and MFA.
- Email/notification service.
- Protected file/object storage.
- PDF/turnover generation.
- Controlled CSV/XLSX import/export where approved.

### Near term

- Provider-neutral Bluebeam protected-export preview/import, reconciliation, and
  evidence review are implemented for a controlled pilot. Live outbound/write
  exchange remains disabled until the ADR-0012 contract and sandbox gates pass.
- Primavera P6 and Microsoft Project schedule exchange.
- Accounting/ERP, procurement, payroll, and customer data exchange.
- Vendor/laboratory and subcontractor portal interfaces.

### Later

- PMI and NDE instrument imports.
- Tekla, SDS2, Advance Steel, IFC, DSTV/NC1, and CNC systems.
- Laser scan/point cloud, survey/GIS, robotic welding, and equipment telemetry.
- Owner systems, CMMS/EAM, data warehouses, and governed AI services.

## Interface pattern selection

Choose deliberately among synchronous API, webhook/event, managed queue, scheduled file exchange, secure manual import, and read-only link. Do not force real-time coupling when a governed asynchronous exchange is safer.

## Required controls

- Versioned schema and backward-compatibility policy.
- Service identity and least-privilege scopes.
- Correlation and idempotency keys.
- Input validation, size limits, malware/content checks, and quarantine.
- Transaction boundary and partial-failure behavior.
- Retry with bounded backoff, dead-letter/review queue, and reconciliation report.
- Audit trail connecting source, import/export job, user/service, created/updated records, and errors.
- Contract tests and nonproduction test endpoint/data.

## Instrument import caution

Instrument data must retain the raw source file, instrument identifier, method/software context, collection time, operator, integrity hash, parsing version, and any transformation. Imported data does not bypass inspector review, calibration/verification requirements, or acceptance authority.
