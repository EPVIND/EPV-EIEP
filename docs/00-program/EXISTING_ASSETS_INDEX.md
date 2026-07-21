# Existing Assets Index

Use this controlled index for every artifact transferred into `source-intake/`. Do not approve an asset merely by listing it.

## Status values

- Unreviewed
- Under review
- Approved for reference
- Approved for transformation
- Superseded
- Rejected
- Training/demo only

## Asset register

| Asset ID | Intake path | Original source/owner | Date received | Confidentiality | Production or demo | Description | Status | Conflicts/risks | Approved destination | Reviewer/date |
|---|---|---|---|---|---|---|---|---|---|---|

_No source-intake payloads were present at the 2026-07-20 repository audit. The
controlled `source-intake/README.md` and directory placeholders are repository
infrastructure, not intake assets. The first received artifact will use
`ASSET-0001`._

## Repository audit snapshot

- Inventory date: 2026-07-20.
- Source-intake payloads: 0.
- Training/demo payloads: 0; only the controlled README and placeholders exist.
- Existing application prototypes, databases, forms, exports, and customer files: 0.
- Assets approved for reference or transformation: 0.
- Active implementation at audit start: placeholder directories only.
- Reconciliation result: there is no inherited asset to approve, reject, migrate,
  deduplicate, or reuse. Controlled documents under `docs/` remain the sole product
  baseline.
- Detailed evidence and gap analysis: `REPOSITORY_AUDIT.md`.

## Review checklist

- Provenance and usage rights confirmed.
- Hash recorded when evidentiary integrity matters.
- Malware and secret scan completed.
- Personal/customer data classified.
- Fictitious, obsolete, duplicate, and uncontrolled content identified.
- Applicable requirement and current revision identified.
- Reuse method documented: reference, extract, transform, rewrite, or reject.
- Approval recorded before content enters active implementation.

## Expected first intake

- Clean QC baseline and current application prototypes.
- Current form, report, WPS/PQR/WPQ, material, MTR, PMI, NDE, structural, civil, and concrete templates.
- Subcontractor-control and scheduling/estimating prototypes.
- Bluebeam-related assets and integration examples.
- Database, spreadsheet, CSV, screenshot, and workflow examples.
- Demonstration packages routed to `training-demo/`, not mixed into source intake.
