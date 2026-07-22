# Production Data Model Baseline

This is a conceptual model. Physical names and persistence choices require ADR review and migrations.

## Identity and organization

- `Organization`: EPV entity, customer, subcontractor, vendor, owner, laboratory, inspector agency, or other party.
- `Person`: human identity independent of employment or portal account.
- `UserAccount`: identity-provider subject, status, assurance, and lifecycle metadata.
- `OrganizationRelationship`: customer/vendor/subcontractor/lower-tier/delegation relationship with effective dates.
- `RoleAssignment`: permission bundle scoped to organization, project, work package, object, and time.
- `Qualification`: person/organization credential, issuer, scope, evidence, effective/expiration, and verification.

## Project structure

- `Facility`, `Project`, `Area`, `System`, `WbsElement`, `WorkPackage`, `Activity`, and `CostCode` use stable unique identifiers.
- `ResponsibilityAssignment` links a scope/object to performer, supplier, inspector, approver, turnover owner, and warranty party.
- `RequirementReference` identifies contract, specification, standard, procedure, drawing, customer rule, or approved interpretation without reproducing copyrighted text.
- `ProjectRuleSet` applies versioned requirements and workflow configuration by project context.

## Documents and files

- `Document` is the stable document identity/number.
- `DocumentRevision` holds revision, status, applicability, effective time, source, review/approval, and supersession.
- `FileObject` holds storage key, hash, media type, size, scan/validation status, and retention class.
- `DocumentFile` links an exact file to a revision and representation/purpose.
- `Distribution` and `Acknowledgement` record controlled issue and receipt.
- Business records link to the exact `DocumentRevision` that governed the work.

## Materials

- `PurchaseReference` and `Receipt` identify source transaction and receipt evidence.
- `MaterialLot` represents common source, specification/grade, heat/lot, MTR, and supplier/manufacturer attributes.
- `MaterialItem` represents an individually traceable piece or controlled quantity with EPV identifier, dimensions, quantity/unit, and status.
- `MaterialGenealogy` links parent item to cut piece, remnant, assembly consumption, return, or scrap.
- `StorageLocation` and `MaterialMovement` preserve custody and physical location history.
- `MaterialCertification` links MTR/certificate revisions to represented lots/items and approval status.
- `MaterialHold` prevents issue/use/release and links reason, NCR, affected quantity, and authorized resolution.

## Commercial estimating and award handoff

- `Estimate` is an organization-scoped opportunity identity with customer/facility,
  inquiry, scope, due date/time zone, currency, owner, basis, and lifecycle state.
- `EstimateRevision` is the immutable submitted/approved commercial baseline. A
  successor retains the exact parent and reason; stable line keys support an exact
  added/removed/changed delta without rewriting the parent.
- `EstimateLine` maps hierarchical cost code, bid item, alternate, WBS, and work
  package context to exact quantity/unit and a versioned calculation snapshot.
- `EstimateAssemblyRevision` freezes controlled labor, material, equipment, and
  subcontract components; `ProductivityFactorRevision` freezes source,
  justification, discipline/condition, effective interval, and independent approval.
- `EstimateAuthorityPolicyRevision` freezes currency-specific standard limits and
  the separately managed elevated qualifications required above each estimate,
  quote-selection, and proposal-approval limit. A proposed revision cannot activate
  without an independent approval and supersedes the prior active policy.
- `EstimateQuote` links an integrity-matched released organization-scoped
  `FileObject` to normalized bid-scope lines, validity, currency, inclusions,
  exclusions, qualifications, freight/tax, gaps, and independent selection.
- `EstimateProposal` freezes an approved revision, commercial terms, validity,
  exact source hash, price, artifact filename/media type/content hash, and
  artifact-manifest hash. Approval, issue, and integrity-checked download are
  distinct attributable actions.
- `EstimateHandoff` maps the issued proposal snapshot into a same-organization
  project by direct/contingency/escalation/markup/tax categories and requires an
  exact zero-difference reconciliation. The source estimate is never rewritten.

## Project controls, procurement, and scheduling

- `ProjectControlBaseline` freezes the exact awarded handoff, period, currency,
  management reserve, and mapped cost/quantity lines. An approved change produces a
  parent-linked successor; approved and superseded revisions remain immutable.
- `ProjectChangeRequest` preserves origin, released evidence, quotation reference,
  schedule impact, and exact quantity/amount changes before thresholded independent
  approval and baseline incorporation.
- `ProjectCostEntry` is a period/source/hash-attributed actual, accrual, remaining
  forecast, contingency draw, or reserve movement. `ProjectProgressClaim` records
  quantity/evidence and earned amount while quality and invoice states remain
  explicitly outside the claim.
- `ProjectControlsAuthorityPolicyRevision` holds active currency-specific change and
  procurement thresholds plus separately assigned elevated qualifications.
- `ProcurementRequisition` and its items bind exact baseline, governing document
  revisions, specification, quantity/unit, need date, requirements, budget, cost
  code, and work package. `ProcurementBidPackage` preserves comparative vendor
  source files/hashes, gaps, recommendation, and award. `ProcurementCommitment`
  freezes PO/contract revision and retains append-only expediting events, including
  exact controlled material-item links at receipt.
- `ScheduleProgram` owns `ScheduleRevision` history. Revisions freeze stable activity
  keys, display IDs, calendar, WBS/work package, logic, resources, quantities,
  constraints, completion boundaries, document/material/inspection prerequisites,
  field claims, accepted progress, source, and variance. `ScheduleImport` preserves
  released source file/hash, provider/mapping version, idempotency, preview errors,
  and committed draft revision.

## Inspection and equipment

- `InspectionPlan` and `InspectionPlanRevision` define versioned stages, required fields, hold/witness/review points, acceptance references, and roles.
- `InspectionAssignment` applies a plan stage to project objects and designated parties.
- `InspectionRecord` identifies target, plan revision, inspector, event time, status, result, evidence, and approvals.
- `Measurement` stores named value, units, precision, acceptance range/reference, instrument, and result.
- `InspectionEquipment` identifies instrument, serial/asset number, owner, type, and status.
- `CalibrationVerification` identifies calibration or daily/reference verification, evidence, result, and validity window.
- `PmiRecord` specializes inspection context with required/observed material, method, component location, sampling basis, readings, evidence, notes, and alloy decision.

## Welding, examination, heat treatment, and testing

- `WeldingProcedureRevision` represents a PQR or WPS exact revision with a released governing document, approved supporting PQR revisions, effective interval, process/material/position/joint/consumable applicability, dimensional ranges, preheat/interpass limits, and independent review. Supersession preserves the prior approved revision.
- `WelderQualification` links a person and employer to an exact released qualification record, process/material/position/dimensional scope, original validity, continuity interval/latest continuity evidence, and independent review state.
- `WeldJoint` is the stable joint identity linking project structure, component references, controlled material items, released drawing revision, weld-map location, exact WPS revision, examination/PWHT requirements, and completion boundary. Its append-only `WeldExecutionEvent` sequence records fit-up, consumable issue, preheat/interpass, weld passes, visual examination, excavation, repair welds, actor/time/evidence, and repair cycle.
- `NdeRequest` binds method/extent, exact technique revision, acceptance reference, stage, required personnel qualification, hold/witness context, due state, weld, and current repair cycle. `NdeReportRevision` preserves the qualified examiner/organization, valid method-capable equipment, media, conditions, indications, result, evidence, and independent review; accepting a valid report does not rewrite a reject result.
- `PwhtCycle` binds exact welds and a released procedure to heating/cooling/soak values, thermocouple locations/ranges/tolerance status, valid equipment, source chart, supporting evidence, interruptions, result, performer, and independent acceptance.
- `TestPackage` owns an exact active `CompletionBoundary` and its released procedures/drawings, medium/pressure/hold, approved safety/permit and prerequisite references, blind/valve/instrument list, valid gauges, participants/witnesses, evidence, deficiencies/NCRs, restoration confirmation, result, and independent acceptance.
- Weld and test readiness are computed projections over current controlled material, event repair cycle, accepted NDE/PWHT, open NCR, released boundary weld, exact document, and valid-equipment records. A projection never replaces the underlying acceptance authority.

## Work objects

## Provider-neutral document collaboration

- `DocumentCollaborationImport` freezes the protected source-file identity/hash, provider product/project/session/source version, schema/mapping/idempotency versions, exact document/author/status mappings, source items, preview issues, actor/time, and atomic commit result. Exact retries converge; a changed source with the same provider identity becomes a visible conflict.
- `CollaborationItem` preserves the provider document/item/parent identity, exact EIEP document revision, page/region, markup/comment/reply/status type, mapped user/organization, provider status, evidence-only normalized status, subject/body/appearance, source times/hash, source import, independent review, and supersession history.
- `CollaborationReconciliation` preserves a safe issue code/object/field/detail plus independent resolution or waiver; it does not log protected markup body content and cannot convert an invalid preview into an approved EIEP record.
- Provider completion or approval is never a document-release, quality, NCR, work, or turnover transition. No outbound write aggregate or command exists until the ADR-0012 external gates are independently accepted.

Provide a shared `WorkObject` or equivalent stable abstraction with typed extensions:

- Pipe spool, weld, line/component, pressure item, vessel component.
- Structural member, piece mark, assembly, connection, bolt lot.
- Civil feature, excavation, underground segment, survey point.
- Foundation, rebar/embeds, concrete placement, sample/test.
- Equipment item, installation, alignment, grout, connection.

Do not force discipline-specific attributes into one wide nullable table. Use stable common identity and explicit typed models.

## Deficiencies and change

- `Nonconformance`, `Containment`, `Disposition`, `CorrectiveAction`, `Reinspection`, and `NcrApproval` preserve initial evidence, responsible party, state, and authority.
- `PunchItem`, `PunchEvidence`, and `PunchVerification` link completion deficiencies to systems/areas/assets/work packages.
- `ChangeRequest`, `Deviation`, or `Concession` must remain distinct when contractual meaning differs.

## Subcontractors

- `SubcontractorProfile` extends organization with approved scope and performance state.
- `CredentialRequirement` and `CredentialEvidence` control license, insurance, bonding, safety, quality, and client requirements.
- `LowerTierDeclaration`, `MobilizationChecklist`, `ProjectAssignment`, `Submittal`, and `DeliverableRequirement` control delegated execution.

## Turnover

- `CompletionBoundary` defines system, area, asset, work package, test package, or contract handover scope.
- `TurnoverRequirement` identifies required record class, applicability, source, acceptance authority, and not-applicable approval.
- `TurnoverPackage` and `TurnoverPackageVersion` preserve package history and status.
- `TurnoverItem` links the package version to an exact accepted record/file revision.
- `PackageManifestEntry` records source identifier, revision, filename, hash, size, and inclusion reason.

## Cross-cutting history

- All controlled entities use stable IDs, created/updated metadata, explicit state, optimistic concurrency, and project/organization scope as applicable.
- `AuditEvent` records actor, acting organization, session, action, object, state transition, changed fields, reason, UTC time, originating time zone where relevant, IP/device/correlation metadata, and result.
- Avoid soft-delete as a universal substitute for retention. Model void, supersede, archive, and approved disposition states according to record meaning.

## Data constraints to test

- Unique project number within the approved business scope.
- Unique document number/revision within project applicability.
- Unique EPV material identifier and no broken genealogy cycles.
- Only one current released revision for a defined document/use context.
- No release when a required hold, inspection, calibration, MTR, or disposition is open.
- No turnover item pointing to a rejected, superseded, unauthorized, or mutable file.
- No quote referencing a project-scoped, unreleased, cross-organization, or
  hash-mismatched file; no submitted estimate-line mutation; no award handoff with a
  nonzero reconciliation difference; no above-limit estimating decision without the
  active policy's exact elevated qualification; no proposal download after artifact
  content/hash divergence; no pending/rejected change altering an approved baseline;
  no accepted progress above baseline quantity; no procurement receipt without a
  same-project controlled material item; no cyclic schedule logic, duplicate import
  external ID, or imported revision bypassing independent approval; no WPS/WPQ use
  outside its exact effective scope, performer self-release, stale repair-cycle NDE
  acceptance, PWHT pass with out-of-tolerance thermocouples, boundary test before
  weld release, failed test acceptance, or result self-acceptance.

The physical review schema currently advances through reversible migration
`0014_pmi_ncr_execution_detail`, which makes PMI component location/notes and NCR
responsibility/corrective-action data explicit without rewriting legacy evidence.
