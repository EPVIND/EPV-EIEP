# Workflow: Completion and Turnover

## Plan early

At project setup, define completion boundaries and turnover requirements by system, area, equipment, test package, work package, or contract deliverable. Assign source workflow, responsible party, acceptance authority, required timing, and not-applicable rules.

## Continuous assembly

1. Source workflows create controlled records using stable identifiers.
2. Reviews and inspections move records through submitted, under-review, rejected, accepted, superseded, or void states.
3. Turnover status projects those authoritative states; users do not upload duplicate copies to appear complete.
4. The coordinator resolves missing applicability, rejected items, open NCR/punch, and boundary conflicts.
5. Authorized parties review readiness and approve package generation.

## Package generation

- Freeze a package version and generation time.
- Select only exact current accepted record/file revisions authorized for the recipient.
- Generate cover/index, requirement status, record identifiers, revision, source object, filename, hash, size, and inclusion reason.
- Identify open items or approved exceptions explicitly; never hide them.
- Produce searchable PDFs and durable structured exports according to contract/ADR.
- Record generator version, configuration, actor, authorization, and integrity evidence.

## Revision and handover

Regeneration creates a new immutable package version and comparison. Record transmittal, receipt, client review/comments/acceptance, transferred punch where approved, final acceptance, retention, and future correction process.

## Controls

No rejected, superseded, unscanned, unauthorized, training, or mutable working file enters a production turnover package. Source-record correction follows its governing workflow; users cannot edit the package copy as a substitute.

