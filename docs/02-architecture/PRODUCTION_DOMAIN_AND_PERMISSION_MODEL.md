# Proposed Production Domain and Permission Model

Status: Proposed - design baseline before physical migrations  
Date: 2026-07-20  
Decision dependencies: ADR-0001 through ADR-0006  
Requirements mapped: `../05-testing/REQUIREMENTS_TRACEABILITY_MATRIX.md`

This document refines `DATA_MODEL.md` and `USER_ROLES.md`. It does not supersede
either controlled baseline. Physical migrations may exercise this proposal in
development, but production use requires accepted ADRs and data/security review.

## Modeling conventions

- Every persistent entity uses an opaque stable `id` (proposed UUIDv7). Human
  numbers/codes are separate mutable or versioned attributes and are never
  cross-module identity keys.
- Project-controlled rows carry `project_id`. Organization-scoped rows carry the
  owning/acting organization where meaningful. A resource's scope is derived on the
  server; clients cannot nominate an unrelated project.
- Controlled mutable rows carry explicit `state`, `version` for optimistic
  concurrency, `created_at`, `created_by`, `updated_at`, and `updated_by`.
- Time is stored as `timestamptz` UTC. Capture an IANA `originating_time_zone` and
  local offset when the business event's local context matters.
- Quantities use decimal values plus governed unit codes; measurements retain raw
  observation precision and unit, not a binary floating-point approximation.
- Code/specification/customer requirements are `requirement_reference` records with
  source, revision/effective context, and governed interpretation links. Copyrighted
  standards text is not copied into configuration.
- `void`, `superseded`, `archived`, and approved `disposition` are explicit business
  meanings. A universal soft-delete flag is prohibited.
- Extension attributes require a versioned schema and approval. JSON is not a
  substitute for modeled identifiers, status, relationships, or release fields.

## Proposed schemas and ownership

| Schema/module | Owns | May reference |
|---|---|---|
| `iam` | Accounts, external identities, roles, permissions, assignments, delegation | Organizations, projects, work packages, qualifications |
| `party` | People, organizations, organization relationships, qualifications | Files and requirement references |
| `project` | Facilities, projects, systems, areas, WBS, work packages, responsibilities, project rules | Parties, requirements, users |
| `document` | Stable documents, revisions, applicability, review/approval, distribution, acknowledgement, exact governing links | Projects, files, users |
| `material` | Receipts, lots, items, certifications, holds, movements, genealogy, releases | Projects, documents/files, inspections, NCRs |
| `inspection` | Plans/revisions, assignments, records, measurements, equipment, calibration/verification, PMI | Projects, work/material objects, documents/files, users |
| `deficiency` | NCR, containment, disposition, approvals, corrective action, reinspection, punch | Projects, governed objects, documents/files |
| `subcontract` | Profiles, credential requirements/evidence, lower tiers, mobilization, deliverables | Parties, projects, work packages, files |
| `turnover` | Completion boundaries, requirements/status, packages/versions/items/manifests | Projects and exact accepted source revisions/files |
| `estimate` | Opportunity estimates, immutable revisions/lines, assembly, productivity, and authority-policy catalogs, quote comparisons, proposal artifacts/manifests, award handoffs | Parties, facilities, files, projects, WBS/work packages, cost codes, qualifications, audit |
| `fabrication` | Assembly/spool revisions, exact BOM/cut lists, shop travelers, ordered operations, append-only execution/hold events, engineering/release/quality decisions | Projects, materials, welds, inspections, NCRs, exact document/file revisions, qualifications, completion boundaries, audit |
| `collaboration` | Protected provider imports, exact mappings, markups/comments/replies/status evidence, reconciliation, independent evidence review, outbound capability boundary | Projects, released document revisions, files, accounts, organizations, audit |
| `platform` | File metadata, audit, outbox/inbox/jobs, imports/exports, retention/legal hold, code lists | Stable IDs from all modules |

Modules expose application operations and events. A module must not update another
module's tables directly. Cross-module reads use a published query/repository
contract or a purpose-built read projection.

## Foundation physical model

### Identity, parties, and access

| Table | Essential columns and constraints |
|---|---|
| `party.person` | Stable person identity; display/contact fields classified separately |
| `party.organization` | Unique governed code within business scope; type; active state; no duplicate subcontractor/customer table |
| `party.organization_relationship` | From/to organization, type, effective interval, approval/state |
| `party.qualification` | Subject person/organization, type, issuer, scope, effective/expiry, evidence file, verification state |
| `iam.user_account` | Local ID, person ID, state, assurance metadata; no password hash in the proposed Entra model |
| `iam.external_identity` | Unique `(issuer, subject)`, user account, identity type, last verified time |
| `iam.role` / `iam.permission` / `iam.role_permission` | Governed permission bundles; role names are not trusted token claims |
| `iam.role_assignment` | User, acting organization, role, scope type/ID, effective interval, granted/revoked metadata, reason |
| `iam.delegation` | Delegator/delegate, exact permissions/scope, start/end, justification, approver, revocation/review |

Role assignment scope types initially are `organization`, `project`, `work_package`,
and `object`. Portfolio/global scope is limited to explicitly approved administrative
and audit roles.

### Project structure and configuration

| Table | Essential columns and constraints |
|---|---|
| `project.facility` | Owning/customer organization, name/location/time zone, active state |
| `project.project` | Unique project number in approved business scope, customer/facility, name, dates, time zone, confidentiality, state/version |
| `project.system` / `project.area` | Unique code within project; hierarchy allowed with cycle prevention |
| `project.wbs_element` | Unique code within project; parent hierarchy with cycle prevention |
| `project.work_package` | Project/WBS, performer, state, scope, effective responsibility context |
| `project.project_organization` | Organization participation, approved role/type, effective interval |
| `project.responsibility_assignment` | Target type/ID, responsibility type, organization/person, effective interval; prevents ambiguous active owner where exclusivity is configured |
| `project.requirement_reference` | Type, source identifier/title, revision/effective date, applicability, approved interpretation link |
| `project.rule_set` / `project.rule_version` | Draft/review/active/superseded versions, effective time, approver and explanation |

Project activation requires a unique number, active customer/facility, named project,
quality, and document-control authorities, at least one completion boundary and
responsibility assignment, approved requirement references, turnover baseline, and
no blocking readiness exception.

### Controlled documents and files

| Table | Essential columns and constraints |
|---|---|
| `platform.file_object` | Opaque key, SHA-256, declared/detected media type, size, scan/validation state/version, retention class, immutable source metadata |
| `document.document` | Project, stable document number, title/type/discipline/originator; uniqueness by project/applicability rule |
| `document.document_revision` | Document, revision, purpose/status, source/effective dates, exact file set, state/version, supersession link |
| `document.document_applicability` | Exact revision to system/area/WBS/work package/object and use context |
| `document.document_file` | Exact revision/file, representation/purpose, display filename |
| `document.review` / `document.approval` | Assignment, decision, comment/reason, signer context, exact revision/version |
| `document.distribution` / `document.acknowledgement` | Recipient/scope, issue purpose/time, exact revision, receipt state/time |
| `document.governing_document_link` | Business object stable ID to exact document revision and governing purpose |

A partial unique constraint (or transactionally equivalent invariant) allows at most
one current released revision for a document/applicability/use context. A release
transaction verifies file release status and approvals, releases the new revision,
supersedes the prior applicable revision, emits audit/outbox events, and increments
versions atomically.

## Vertical-slice extension model

### Materials

- `receipt` groups a receiving event and source evidence.
- `material_lot` owns common manufacturer/specification/grade/heat/lot/MTR context.
- `material_item` owns the unique EPV identifier, controlled quantity/dimensions,
  location, and state.
- `material_certification` links exact controlled certificate revisions to represented
  lot/items and review state.
- `material_movement` is append-only custody/location/quantity history.
- `material_genealogy` links parent/child with operation and quantity. Constraints
  prevent self-link, cycles, incompatible project/lot context, and over-allocation.
- `material_hold` blocks issue/use/release until an authorized resolution.
- `material_release` records evaluated rule version, prerequisites, decision, actor,
  and explanation.

### Advanced estimating

- `estimate` owns the organization-scoped commercial opportunity and current
  controlled revision identity.
- `estimate_revision` and `estimate_line` preserve exact decimal input components,
  governed unit/currency, productivity snapshots, calculation version, rounding,
  totals, submission/review, and immutable parent history.
- `estimate_assembly_revision` and `estimate_productivity_factor_revision` are
  independently approved, effective, superseding catalog records; customer rates or
  productivity are never seeded by the platform.
- `estimate_authority_policy_revision` is independently approved and superseding by
  organization/currency. It stores standard monetary limits plus the exact elevated
  qualification code required above estimate, quote-selection, and proposal limits;
  owner-approved values and qualification assignments are controlled configuration.
- `estimate_quote` retains the exact released organization file/hash and normalized
  scope gaps. Provider content remains source evidence; selection is a distinct EIEP
  decision.
- `estimate_proposal` retains deterministic printable artifact content, filename,
  media type, source/artifact/manifest hashes, and attributable approval/issue
  history; download verifies the content hash before release. `estimate_handoff`
  retains the same-organization project mapping and exact reconciliation.
- The record-normalized PostgreSQL adapter persists these types during the pilot;
  normalized physical migrations remain required before production promotion.

### Fabrication and spool control

- `fabrication_assembly_revision` owns immutable assembly identity, revision lineage,
  source/import fingerprint, project-structure and completion-boundary scope, and the
  exact released drawing, material, weld, and inspection references.
- `fabrication_bom_line` and `fabrication_cut_line` retain controlled quantities,
  units, piece marks, cut geometry, and material-item identity; they never replace
  material genealogy or receiving authority.
- `fabrication_traveler` and `fabrication_traveler_operation` preserve the exact
  revision-controlled shop route, sequence, work center, planned hours,
  qualifications, procedure revision, material/weld scope, instructions, and hold
  points independently released to shop.
- `fabrication_execution_event` is append-only and monotonically sequenced per
  traveler. It retains event type, controlled result meaning, quantity/unit,
  observations, evidence, event time, and performer. Current traveler/assembly state
  is a transactionally updated projection and never erases event history.
- Engineering approval, shop release, hold release, and final quality acceptance are
  distinct authorities with exact version/state and separation-of-duty checks.
- The record-normalized PostgreSQL adapter persists these pilot records; dedicated
  normalized fabrication tables, indexes, volume tests, and rollback evidence remain
  required before production promotion.

### Inspection and PMI

- `inspection_plan` has versioned `inspection_plan_revision` records; assignments
  always reference the exact revision.
- `inspection_record` owns target, assignment/plan revision, inspector, event time,
  result/state, evidence, and concurrency version.
- `measurement` stores value/unit/precision, acceptance reference/range where
  approved, equipment, and observed result.
- `inspection_equipment` and `calibration_verification` provide effective validity
  at the event time.
- `pmi_record` extends an inspection record with required/observed material, method,
  sampling basis, readings, and alloy decision. Software does not invent metallurgy
  acceptance.
- A failed PMI transaction records the failure, creates a material hold/quarantine,
  and creates or links one NCR without duplicating material identity.

### Deficiencies and turnover

- NCR subrecords (`containment`, `disposition`, `ncr_approval`,
  `corrective_action`, `reinspection`) preserve original and final history.
- Punch evidence and verification are separate from the punch item so submission
  cannot equal acceptance.
- Turnover readiness is a projection of authoritative source states, not duplicated
  uploaded copies.
- A package version freezes requirement status and exact accepted item/file revisions.
  Manifest entries include hashes and cannot reference rejected, superseded,
  unauthorized, unscanned, mutable, or training content.

## Proposed state machines

| Entity | Allowed primary progression | Important denials |
|---|---|---|
| Project | `draft -> readiness_review -> active -> closing -> closed`; governed `suspended` | Activate with blocking readiness exception or missing authority/boundary |
| Document revision | `draft -> staged -> under_review -> approved -> released -> superseded`; terminal `rejected/void` | Current-for-work before release; release unvalidated file; overwrite released file |
| Material item | `received_pending -> accepted -> released -> issued/installed`; controlled `quarantined/rejected/returned/scrapped` | Issue/release with open hold or missing configured MTR/inspection/PMI |
| Inspection/PMI | `draft -> submitted -> under_review -> accepted/rejected`; correction creates a new controlled version | Self-accept when independence required; accept expired equipment/qualification |
| NCR | `open -> contained -> disposition_review -> disposition_approved -> reinspection -> closed`; governed reopen | Close without required approval/reinspection; silent replacement of failed evidence |
| Punch | `open -> assigned -> work_complete -> verification -> closed`; governed transfer/defer | Closure by submitter when independent verification required |
| Turnover package | `draft -> readiness_review -> approved_for_generation -> generated -> transmitted -> accepted`; new version for regeneration | Include nonaccepted/wrong-recipient/training record; mutate generated version |
| Estimate revision | `draft -> under_review -> approved/rejected -> superseded`; correction creates a successor | Mutate submitted line; self-approve; approve stale parent; use unapproved assembly/factor |
| Estimate quote | `normalized -> selected/not_selected`; immutable source file/hash | Select expired/incomplete/cross-scope source or self-select own normalization |
| Estimate proposal | `draft -> approved -> issued`; rejected draft becomes superseded | Generate from noncurrent/nonapproved revision; self-approve; issue expired/unapproved proposal |
| Fabrication assembly revision | `draft -> under_review -> approved -> released_to_fabrication -> in_fabrication -> fabrication_complete -> accepted`; governed `rejected/superseded` | Self-review/release/accept; execute from unreleased inputs; supersede executing parent; equate completion with acceptance |
| Fabrication traveler | `draft -> issued -> in_progress -> on_hold -> in_progress -> complete`; governed `superseded` | Execute out of sequence; skip hold release; use unqualified performer; mutate prior event; release mismatched scope |

Transitions are commands with preconditions and audit, never arbitrary state-field
updates.

## Permission model

### Decision model

Authorization is RBAC plus contextual attributes, not role-name checks alone:

`allow = authenticated AND active-account AND permission-in-active-assignment AND
scope-match AND organization-boundary-match AND state-allows-action AND
qualification-valid AND separation-of-duty-satisfied AND assurance-sufficient AND
recipient-policy-allows`

Missing or ambiguous context denies. Every protected list/query applies the same
scope at the data source. File URLs, search suggestions/counts, notifications,
exports, jobs, and package downloads are resources, not side channels.

The project command center follows the same rule independently for every source
module; `report.read` is necessary but never sufficient to reveal an underlying
count. Each queue candidate must additionally pass the exact action check or be an
explicitly owned action whose ownership permission passes. Policy-thresholded
approvals are omitted when the complete threshold decision cannot be evaluated by
the projection. Recent activity is independently empty unless `audit.read` passes,
and it excludes protected changed-field content. Opening a card never delegates or
pre-authorizes its command; the authoritative module rechecks all conditions.

### Required access context

Every application command/query receives an immutable server-created context:

- local user/account and immutable external issuer/subject;
- acting organization;
- authenticated session/assurance and recent-auth time;
- active role assignments/delegations and effective interval;
- project/work-package/object scope;
- correlation ID, originating IP/device metadata, and UTC time.

Client-supplied role, organization, project, state, or qualification claims are never
trusted without server lookup and relationship validation.

### Foundation permission catalog

| Permission | Scope | Extra conditions |
|---|---|---|
| `access.assignment.read/manage` | Organization/project/work package/object | Manage requires authorized administrator; cannot grant beyond grantor authority |
| `access.delegation.manage` | Exact delegated scope/action/time | Justification, approver, expiry, review, revocation |
| `audit.read` | Authorized project/portfolio | Protected-field redaction; access itself audited where configured |
| `project.create` | Approved business organization | Unique number/customer/facility validation |
| `project.read` | Assigned project | External users limited to assigned work/record visibility |
| `project.structure.manage` | Assigned project | Project state and effective change rules |
| `project.assignment.manage` | Assigned project | Cannot grant disallowed cross-organization scope |
| `project.configuration.manage` | Assigned project | Produces draft version only |
| `project.configuration.approve` | Assigned project | Separate configured authority; cannot silently approve own proposal |
| `project.activate` | Assigned project | Readiness gates and designated authority |
| `document.create` | Assigned project | Document numbering/applicability validation |
| `document.revision.submit` | Assigned project/document | File must be staged and uploader authorized |
| `document.review/approve` | Assigned project/document | Configured role, qualification, state, and separation of duty |
| `document.release/supersede` | Assigned project/document | Document controller plus completed approvals and validated files |
| `document.read_current` | Assigned scope | Returns only current released authorized applicability |
| `document.read_history` | Assigned scope with historical permission | Never implies current-for-work |
| `document.distribute/acknowledge` | Assigned project/recipient | Exact revision and recipient scope |
| `file.upload` | Underlying object create/update scope | Restricted staging only |
| `file.download` | Exact underlying record/file scope | Reauthorize at request time; released/recipient rules |
| `export.create/download` | Underlying record set and recipient scope | Capture/revalidate authorization; audit every result/download |
| `estimate.catalog.manage/approve` | Organization/catalog or authority-policy revision | Independent estimating authority; exact active supersession; owner-controlled currency limits and qualification codes |
| `estimate.create/read/edit/submit/revise/approve` | Organization/estimate | State/version/assurance; approval requires estimating authority, separation, and the active policy's elevated qualification above its limit |
| `estimate.quote.manage/select` | Organization/estimate/quote | Released source file/hash; complete current scope; independent selection and above-limit qualification |
| `estimate.proposal.generate/approve/issue/download` | Organization/estimate/proposal | Current approved source; commercial authority and separation; above-limit qualification; future validity; artifact-hash verification before download |
| `estimate.handoff` | Organization/estimate/project | Project-controls authority; same organization; exact reconciliation |
| `fabrication.plan/submit/read` | Assigned project/assembly | Exact released source scope; current version/state; project structure and completion boundary |
| `fabrication.approve` | Assigned project/assembly revision | Step-up fabrication engineering authority; independent of creator/submitter; exact lineage and current parent |
| `fabrication.traveler.create/release` | Assigned project/assembly/traveler | Ordered exact scope; release requires independent fabrication release authority and approved inputs |
| `fabrication.execute` | Assigned project/traveler/operation | MFA; active issued traveler; required operation qualifications; exact sequence/evidence/result meaning |
| `fabrication.hold.release` | Assigned project/traveler/operation | Step-up hold authority independent of operation performers; current unresolved hold only |
| `fabrication.accept` | Assigned project/assembly revision | Step-up fabrication quality authority independent of plan/review/release/execution; all inspection/weld/NCR/traveler prerequisites |
| `collaboration.import.preview` | Assigned project/import source | MFA; released clean source/hash; exact mappings; creates no collaboration item |
| `collaboration.import.commit` | Assigned project/import | Step-up collaboration-import authority, independent of previewer; current valid preview; atomic commit |
| `collaboration.read` | Assigned project/item | Search/export/download reauthorize the underlying project and exact source/document scope |
| `collaboration.review` | Assigned project/item | Step-up document-collaboration authority, version/state check, independent of source author/previewer/committer |
| `collaboration.reconcile` | Assigned project/issue | Step-up integration authority, independent resolution/waiver with reason; cannot grant EIEP document/quality approval |

Material, inspection, NCR/punch, subcontractor, and turnover permissions follow the
same pattern and the detailed role baseline in `../01-requirements/USER_ROLES.md`.
They must be added before those module endpoints are enabled.

### Role bundle guardrails

- System administrator manages identity/configuration/operations but receives no
  routine business approval, project content, or QC release merely from admin role.
- Project manager manages project scope and assignments but receives no quality
  disposition or inspection acceptance unless separately assigned/qualified.
- Document controller registers, distributes, releases, and supersedes after
  configured approvals; technical approval is separate.
- Receiver records material facts but cannot release material when QC approval is
  configured.
- Inspector performs assigned inspection; QC manager/technical/client/third-party
  approvals remain explicit and can require independence.
- Subcontractor roles may submit only for their organization and assigned scope;
  submission never grants EPV acceptance.
- Auditor/read-only cannot create, transition, approve, release, or export beyond
  explicitly assigned scope.

### Separation of duty

Store the actor for creation/submission/proposed disposition and evaluate configured
independence rules before approval. Required examples:

- a document's technical approver cannot be inferred from its uploader;
- an NCR disposition proposer cannot supply every independent approval;
- a receiver/PMI recorder cannot release when QC approval is configured;
- a subcontractor submitter cannot grant EPV acceptance;
- an administrator cannot alter or approve content through break-glass activity.

Emergency access, if approved, uses an explicit time-bounded delegation with reason,
alert, visible banner, restricted actions, and post-use review.

## Enforcement layers

1. Browser: usability only; hides actions and displays denial/gate reasons.
2. API edge: token/session validation, schema/size/rate limits, correlation.
3. Application policy: authoritative permission, scope, state, qualification,
   assurance, recipient, and separation-of-duty evaluation.
4. Scoped repository: requires an access context or a trusted worker context and
   applies project/organization/object predicates at query source.
5. PostgreSQL: least-privilege roles, constraints, transactions, protected audit,
   and selected row-level defense after pooling/session behavior is proven.
6. Storage/queue: managed identity, opaque keys, short-lived scoped access, separate
   worker grants.
7. Test/evidence: positive, horizontal, vertical, state, revocation, export, search,
   notification, and file tests.

## Transaction boundaries for the first implementation

- Project creation: project + initial responsibility/configuration draft + audit +
  outbox in one transaction.
- Project activation: locked/version-checked readiness evaluation + state + audit +
  outbox in one transaction.
- Document release: validate approvals/files + release new revision + supersede prior
  applicable revision + audit + outbox in one transaction.
- Permission assignment/revocation: assignment change + audit + session/policy cache
  invalidation outbox in one transaction.
- Failed authorization: no business mutation; emit a protected denial event without
  exposing whether an unassigned resource exists.

## Initial migration sequence

Migrations must follow this design order and contain no customer, employee, project,
material, code, specification, or demonstration data:

1. platform extensions, schemas, migration metadata, code-list structure;
2. parties, identities, permission catalog, assignments/delegation;
3. projects, structure, responsibility, references, rule versions;
4. files, documents, revisions, applicability, review/approval/distribution;
5. protected audit and outbox/inbox/job records;
6. later vertical-slice modules only when their permissions, invariants, and tests
   are ready.

Seed only stable permission identifiers and other approved structural metadata.
Role bundles are controlled configuration, not hard-coded users or projects.

## Open approvals and validation

Before production migration approval, confirm:

- UUID/time/unit conventions and database naming;
- authoritative organization/customer master ownership;
- record-state and signature matrices by record type;
- permission bundles, external visibility, and separation-of-duty rules;
- retention/legal hold and physical disposition authority;
- Entra tenant/licensing and project-close revocation;
- RPO/RTO and region/data residency;
- industrial/QC acceptance of every release-gate input and explanation.

Executable schema, policy, authorization, migration, restore, and acceptance evidence
must update the traceability matrix. This proposal alone is not acceptance evidence.
