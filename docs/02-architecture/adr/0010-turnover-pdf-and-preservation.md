# ADR-0010: PDF, turnover generation, and long-term preservation

Status: Proposed  
Date: 2026-07-20  
Decision owners: Product owner, document controller, industrial/QC authority,
solution architect, records owner  
Requirements affected: FR-TOV-001 through FR-TOV-004, FR-INT-002, NFR-PER-003,
NFR-DAT-001, NFR-DAT-002

## Context

Turnover packages must include only exact authorized current accepted records,
retain every generated version, and remain verifiable independently of a filename.
Contractual PDF/A and retention requirements are not yet supplied.

## Decision drivers

- Deterministic, versioned generation with source integrity.
- Searchable human-readable output plus durable structured data.
- Recipient authorization and immutable prior versions.
- Honest preservation claims and a tool/provider exit path.

## Considered options

- Versioned HTML templates rendered by pinned Chromium in an isolated worker.
- Commercial reporting/PDF SDK.
- Office-template automation.
- Merge uploaded PDFs without a structured manifest.

## Decision

Propose versioned HTML/report templates and a pinned Playwright/Chromium renderer in
an isolated worker for initial searchable PDF output. Before rendering, freeze a
`turnover_package_version` and exact accepted source revisions. Generate a JSON and
CSV manifest containing stable source ID, revision, filename, hash, size, inclusion
reason, recipient scope, generator/template/configuration version, actor, and UTC
time.

Store the PDF, structured manifest, and generation logs as immutable package-version
objects. Regeneration always creates a new version and delta. Do not claim PDF/A
conformance until a separately approved converter/validator, license, target profile,
font/color policy, and validation evidence exist.

## Consequences and risks

- HTML templates are testable and share design tokens with the web product.
- Browser rendering needs pinned binaries/fonts, resource limits, and visual
  regression tests.
- Uploaded third-party PDFs may not meet preservation/accessibility requirements;
  originals remain retained and are identified in the manifest.
- A commercial tool may still be required by contract.

## Security, data, and operations impact

Render without network access to arbitrary URLs, active script, or untrusted local
paths. Resolve files through authorized internal storage by exact ID/hash. Apply
recipient scope at selection, generation, and download. Monitor duration, failures,
resource limits, and manifest verification.

## Migration and rollback

Templates and renderer versions are immutable inputs. Keep earlier generator images
where retention/support policy permits reproducibility. Roll back to a prior compatible
renderer for new versions only; never replace an already generated package object.
A future PDF service must reproduce and reconcile the structured manifest.

## Validation evidence

Current/accepted authorization selection, rejected/superseded/training exclusion,
hash verification, deterministic metadata, prior-version retention, delta, large
package failure/retry, malicious content isolation, searchability, visual regression,
and approved PDF/A validation when applicable.

Local review evidence freezes each selected accepted record as exact canonical JSON
bytes with filename, byte size, and SHA-256; validates those snapshots before render;
and emits searchable PDF, exact JSON, CSV, version delta, and a generation log through
pinned Playwright/Chromium with arbitrary network and JavaScript disabled. A synthetic
72-entry fixture produced seven letter-size pages, no embedded JavaScript, searchable
text, verified hashes, and clean individual-page visual inspection. Chromium's raw PDF
metadata may include its creation time; stable package identity and generation time
remain in the manifest/log and visible report content. PDF/A conformance remains
explicitly `not_claimed`. Turnover generation now schedules the renderer through the
transactional outbox; the leased worker writes immutable PDF/JSON/CSV/log objects,
places the hash-verifying log last, and adopts a complete prior set on replay without
rerendering. This local path is not deployed against managed storage and does not
accept the ADR.

## Supersedes / superseded by

None.
