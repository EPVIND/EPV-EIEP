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

## Inspection and equipment

- `InspectionPlan` and `InspectionPlanRevision` define versioned stages, required fields, hold/witness/review points, acceptance references, and roles.
- `InspectionAssignment` applies a plan stage to project objects and designated parties.
- `InspectionRecord` identifies target, plan revision, inspector, event time, status, result, evidence, and approvals.
- `Measurement` stores named value, units, precision, acceptance range/reference, instrument, and result.
- `InspectionEquipment` identifies instrument, serial/asset number, owner, type, and status.
- `CalibrationVerification` identifies calibration or daily/reference verification, evidence, result, and validity window.
- `PmiRecord` specializes inspection context with required/observed material, method, component location, sampling basis, readings, evidence, notes, and alloy decision.

## Work objects

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

The physical review schema currently advances through reversible migration
`0014_pmi_ncr_execution_detail`, which makes PMI component location/notes and NCR
responsibility/corrective-action data explicit without rewriting legacy evidence.
