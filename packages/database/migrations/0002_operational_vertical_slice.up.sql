CREATE SCHEMA material;
CREATE SCHEMA inspection;
CREATE SCHEMA deficiency;
CREATE SCHEMA turnover;

CREATE TABLE material.receipt (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  receipt_number text NOT NULL,
  purchase_reference text NOT NULL,
  vendor_organization_id uuid NOT NULL REFERENCES party.organization(id),
  received_at timestamptz NOT NULL,
  received_by uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT material_receipt_number_unique UNIQUE (project_id, receipt_number)
);

CREATE TABLE material.material_lot (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  receipt_id uuid NOT NULL REFERENCES material.receipt(id),
  specification text NOT NULL,
  grade text NOT NULL,
  material_form text NOT NULL,
  dimensions text NOT NULL,
  heat_lot text NOT NULL,
  mtr_document_revision_id uuid REFERENCES document.document_revision(id),
  CONSTRAINT material_lot_heat_unique UNIQUE (receipt_id, heat_lot)
);

CREATE TABLE material.material_item (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  lot_id uuid NOT NULL REFERENCES material.material_lot(id),
  identifier text NOT NULL,
  quantity numeric(24, 8) NOT NULL,
  unit_code text NOT NULL,
  storage_location text NOT NULL,
  parent_item_id uuid REFERENCES material.material_item(id),
  state text NOT NULL,
  mtr_required boolean NOT NULL,
  mtr_accepted boolean NOT NULL,
  receiving_inspection_required boolean NOT NULL,
  receiving_inspection_accepted boolean NOT NULL,
  pmi_required boolean NOT NULL,
  pmi_accepted boolean NOT NULL,
  governing_pmi_rule text,
  open_disposition_count integer NOT NULL DEFAULT 0,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL,
  CONSTRAINT material_item_identifier_unique UNIQUE (project_id, identifier),
  CONSTRAINT material_item_quantity_positive CHECK (quantity > 0),
  CONSTRAINT material_item_state_valid CHECK (state IN ('received_pending', 'quarantined', 'released', 'issued', 'returned', 'consumed', 'rejected')),
  CONSTRAINT material_item_version_positive CHECK (version > 0),
  CONSTRAINT material_item_open_disposition_nonnegative CHECK (open_disposition_count >= 0),
  CONSTRAINT material_item_parent_not_self CHECK (parent_item_id IS NULL OR parent_item_id <> id),
  CONSTRAINT material_item_pmi_rule_present CHECK (NOT pmi_required OR governing_pmi_rule IS NOT NULL)
);

CREATE TABLE material.material_genealogy (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  parent_item_id uuid NOT NULL REFERENCES material.material_item(id),
  child_item_id uuid NOT NULL REFERENCES material.material_item(id),
  relationship text NOT NULL CHECK (relationship IN ('cut_piece', 'remnant')),
  quantity_transferred numeric(24, 8) NOT NULL CHECK (quantity_transferred > 0),
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  CONSTRAINT material_genealogy_pair_unique UNIQUE (parent_item_id, child_item_id),
  CONSTRAINT material_genealogy_not_self CHECK (parent_item_id <> child_item_id)
);

CREATE INDEX material_genealogy_child_lookup ON material.material_genealogy (child_item_id);

CREATE TABLE material.material_status_history (
  id uuid PRIMARY KEY,
  material_item_id uuid NOT NULL REFERENCES material.material_item(id),
  prior_state text,
  new_state text NOT NULL,
  reason text,
  occurred_at timestamptz NOT NULL,
  actor_user_id uuid NOT NULL,
  correlation_id uuid NOT NULL
);

CREATE TABLE inspection.inspection_plan (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  template_code text NOT NULL,
  title text NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT inspection_plan_code_unique UNIQUE (project_id, template_code)
);

CREATE TABLE inspection.inspection_plan_revision (
  id uuid PRIMARY KEY,
  plan_id uuid NOT NULL REFERENCES inspection.inspection_plan(id),
  project_id uuid NOT NULL REFERENCES project.project(id),
  revision text NOT NULL,
  required_fields text[] NOT NULL,
  applicable_target_types text[] NOT NULL,
  required_performer_qualifications text[] NOT NULL,
  required_acceptor_qualifications text[] NOT NULL,
  acceptance_reference text NOT NULL,
  minimum_acceptance_assurance text NOT NULL,
  state text NOT NULL,
  supersedes_revision_id uuid REFERENCES inspection.inspection_plan_revision(id),
  approved_by uuid,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL,
  CONSTRAINT inspection_plan_revision_unique UNIQUE (plan_id, revision),
  CONSTRAINT inspection_plan_fields_present CHECK (cardinality(required_fields) > 0),
  CONSTRAINT inspection_plan_targets_present CHECK (cardinality(applicable_target_types) > 0),
  CONSTRAINT inspection_plan_assurance_valid CHECK (minimum_acceptance_assurance IN ('mfa', 'step-up')),
  CONSTRAINT inspection_plan_state_valid CHECK (state IN ('under_review', 'approved', 'superseded', 'rejected')),
  CONSTRAINT inspection_plan_approval_consistent CHECK ((state = 'approved' AND approved_by IS NOT NULL) OR state <> 'approved'),
  CONSTRAINT inspection_plan_version_positive CHECK (version > 0)
);

CREATE UNIQUE INDEX inspection_one_approved_revision
  ON inspection.inspection_plan_revision (plan_id)
  WHERE state = 'approved';

CREATE TABLE inspection.inspection_record (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  plan_revision_id uuid NOT NULL REFERENCES inspection.inspection_plan_revision(id),
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  inspector_user_id uuid NOT NULL,
  performed_at timestamptz NOT NULL,
  field_values jsonb NOT NULL,
  evidence_file_ids uuid[] NOT NULL,
  result text NOT NULL,
  state text NOT NULL,
  accepted_by uuid,
  acceptance_meaning text,
  accepted_assurance text,
  rejection_reason text,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT inspection_record_fields_present CHECK (field_values <> '{}'::jsonb),
  CONSTRAINT inspection_record_evidence_present CHECK (cardinality(evidence_file_ids) > 0),
  CONSTRAINT inspection_record_result_valid CHECK (result IN ('pass', 'fail')),
  CONSTRAINT inspection_record_state_valid CHECK (state IN ('submitted', 'accepted', 'rejected', 'void')),
  CONSTRAINT inspection_record_acceptance_consistent CHECK (
    (state = 'accepted' AND result = 'pass' AND accepted_by IS NOT NULL AND acceptance_meaning IS NOT NULL AND accepted_assurance IN ('mfa', 'step-up'))
    OR state <> 'accepted'
  ),
  CONSTRAINT inspection_record_rejection_consistent CHECK ((state = 'rejected' AND rejection_reason IS NOT NULL) OR state <> 'rejected'),
  CONSTRAINT inspection_record_version_positive CHECK (version > 0)
);

CREATE TABLE inspection.inspection_approval (
  id uuid PRIMARY KEY,
  inspection_record_id uuid NOT NULL REFERENCES inspection.inspection_record(id),
  decision text NOT NULL CHECK (decision IN ('accepted', 'rejected')),
  signer_user_id uuid NOT NULL,
  assurance text NOT NULL CHECK (assurance IN ('mfa', 'step-up')),
  meaning text NOT NULL,
  signed_at timestamptz NOT NULL,
  record_version bigint NOT NULL CHECK (record_version > 0),
  canonical_sha256 text NOT NULL CHECK (canonical_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT inspection_one_decision_per_version UNIQUE (inspection_record_id, record_version)
);

CREATE TABLE inspection.inspection_equipment (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  identifier text NOT NULL,
  serial_number text NOT NULL,
  method_capabilities text[] NOT NULL,
  verification_state text NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz NOT NULL,
  evidence_file_id uuid NOT NULL REFERENCES platform.file_object(id),
  state text NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  CONSTRAINT inspection_equipment_identifier_unique UNIQUE (project_id, identifier),
  CONSTRAINT inspection_equipment_methods_present CHECK (cardinality(method_capabilities) > 0),
  CONSTRAINT inspection_equipment_verification_valid CHECK (verification_state IN ('passed', 'failed')),
  CONSTRAINT inspection_equipment_state_valid CHECK (state IN ('active', 'inactive')),
  CONSTRAINT inspection_equipment_validity_order CHECK (valid_to > valid_from),
  CONSTRAINT inspection_equipment_version_positive CHECK (version > 0)
);

CREATE TABLE inspection.pmi_record (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  material_item_id uuid NOT NULL REFERENCES material.material_item(id),
  governing_rule text NOT NULL,
  required_material text NOT NULL,
  observed_material text NOT NULL,
  method text NOT NULL,
  equipment_id uuid NOT NULL REFERENCES inspection.inspection_equipment(id),
  inspector_user_id uuid NOT NULL,
  inspected_at timestamptz NOT NULL,
  readings jsonb NOT NULL,
  evidence_file_ids uuid[] NOT NULL,
  result text NOT NULL,
  state text NOT NULL,
  ncr_id uuid,
  accepted_by uuid,
  version bigint NOT NULL DEFAULT 1,
  CONSTRAINT pmi_result_valid CHECK (result IN ('pass', 'fail')),
  CONSTRAINT pmi_state_valid CHECK (state IN ('submitted', 'accepted', 'failed', 'void')),
  CONSTRAINT pmi_readings_present CHECK (readings <> '{}'::jsonb),
  CONSTRAINT pmi_evidence_present CHECK (cardinality(evidence_file_ids) > 0),
  CONSTRAINT pmi_version_positive CHECK (version > 0),
  CONSTRAINT pmi_acceptance_consistent CHECK ((state = 'accepted' AND result = 'pass' AND accepted_by IS NOT NULL) OR state <> 'accepted'),
  CONSTRAINT pmi_failure_consistent CHECK ((state = 'failed' AND result = 'fail') OR state <> 'failed')
);

CREATE TABLE deficiency.nonconformance (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  number text NOT NULL,
  affected_object_type text NOT NULL,
  affected_object_id uuid NOT NULL,
  requirement_reference text NOT NULL,
  description text NOT NULL,
  containment text NOT NULL,
  state text NOT NULL,
  disposition text,
  disposition_proposed_by uuid,
  disposition_approved_by uuid,
  reinspection_evidence_file_id uuid REFERENCES platform.file_object(id),
  turnover_required boolean NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL,
  CONSTRAINT ncr_number_unique UNIQUE (project_id, number),
  CONSTRAINT ncr_object_type_valid CHECK (affected_object_type IN ('material', 'inspection', 'work')),
  CONSTRAINT ncr_state_valid CHECK (state IN ('open', 'disposition_proposed', 'disposition_approved', 'reinspection_complete', 'closed')),
  CONSTRAINT ncr_version_positive CHECK (version > 0),
  CONSTRAINT ncr_disposition_approval_separation CHECK (disposition_proposed_by IS NULL OR disposition_approved_by IS NULL OR disposition_proposed_by <> disposition_approved_by),
  CONSTRAINT ncr_closed_complete CHECK (state <> 'closed' OR (disposition IS NOT NULL AND disposition_approved_by IS NOT NULL AND reinspection_evidence_file_id IS NOT NULL))
);

ALTER TABLE inspection.pmi_record
  ADD CONSTRAINT pmi_ncr_reference FOREIGN KEY (ncr_id) REFERENCES deficiency.nonconformance(id);

CREATE TABLE deficiency.punch_item (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  number text NOT NULL,
  punch_type text NOT NULL,
  priority text NOT NULL,
  system_id uuid,
  area_id uuid,
  work_package_id uuid,
  asset_id uuid,
  description text NOT NULL,
  owner_user_id uuid NOT NULL,
  target_at timestamptz,
  state text NOT NULL,
  verified_by uuid,
  verification_evidence_file_id uuid REFERENCES platform.file_object(id),
  closure_meaning text,
  turnover_required boolean NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL,
  CONSTRAINT punch_number_unique UNIQUE (project_id, number),
  CONSTRAINT punch_priority_valid CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT punch_scope_present CHECK (system_id IS NOT NULL OR area_id IS NOT NULL OR work_package_id IS NOT NULL OR asset_id IS NOT NULL),
  CONSTRAINT punch_state_valid CHECK (state IN ('open', 'ready_for_verification', 'verified', 'closed', 'transferred')),
  CONSTRAINT punch_verification_consistent CHECK ((state IN ('verified', 'closed') AND verified_by IS NOT NULL AND verification_evidence_file_id IS NOT NULL) OR state NOT IN ('verified', 'closed')),
  CONSTRAINT punch_closure_consistent CHECK ((state = 'closed' AND closure_meaning IS NOT NULL) OR state <> 'closed'),
  CONSTRAINT punch_version_positive CHECK (version > 0)
);

CREATE TABLE deficiency.punch_evidence (
  punch_item_id uuid NOT NULL REFERENCES deficiency.punch_item(id),
  file_object_id uuid NOT NULL REFERENCES platform.file_object(id),
  evidence_purpose text NOT NULL,
  added_at timestamptz NOT NULL,
  added_by uuid NOT NULL,
  PRIMARY KEY (punch_item_id, file_object_id, evidence_purpose)
);

CREATE TABLE material.material_hold (
  id uuid PRIMARY KEY,
  material_item_id uuid NOT NULL REFERENCES material.material_item(id),
  ncr_id uuid REFERENCES deficiency.nonconformance(id),
  reason text NOT NULL,
  state text NOT NULL CHECK (state IN ('open', 'released', 'rejected')),
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  resolved_at timestamptz,
  resolved_by uuid,
  CONSTRAINT material_hold_resolution_consistent CHECK ((state = 'open' AND resolved_at IS NULL AND resolved_by IS NULL) OR state <> 'open')
);

CREATE UNIQUE INDEX material_one_open_hold_per_ncr
  ON material.material_hold (material_item_id, ncr_id)
  WHERE state = 'open' AND ncr_id IS NOT NULL;

CREATE TABLE material.material_release (
  id uuid PRIMARY KEY,
  material_item_id uuid NOT NULL REFERENCES material.material_item(id),
  released_at timestamptz NOT NULL,
  released_by uuid NOT NULL,
  requirements_snapshot jsonb NOT NULL,
  correlation_id uuid NOT NULL,
  CONSTRAINT material_release_item_unique UNIQUE (material_item_id)
);

CREATE TABLE turnover.turnover_requirement (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  completion_boundary_id uuid NOT NULL REFERENCES project.completion_boundary(id),
  code text NOT NULL,
  record_class text NOT NULL CHECK (record_class IN ('material', 'pmi', 'ncr', 'punch', 'document_revision')),
  required boolean NOT NULL,
  not_applicable_allowed boolean NOT NULL,
  acceptance_authority text NOT NULL,
  state text NOT NULL CHECK (state IN ('active', 'retired')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  CONSTRAINT turnover_requirement_unique UNIQUE (completion_boundary_id, code)
);

CREATE TABLE turnover.turnover_package (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  completion_boundary_id uuid NOT NULL REFERENCES project.completion_boundary(id),
  package_code text NOT NULL,
  recipient_scope text NOT NULL,
  state text NOT NULL CHECK (state IN ('draft', 'ready', 'generated', 'accepted', 'superseded')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL,
  CONSTRAINT turnover_package_code_unique UNIQUE (project_id, package_code)
);

CREATE TABLE turnover.package_material_scope (
  package_id uuid NOT NULL REFERENCES turnover.turnover_package(id),
  material_item_id uuid NOT NULL REFERENCES material.material_item(id),
  PRIMARY KEY (package_id, material_item_id)
);

CREATE TABLE turnover.turnover_package_version (
  id uuid PRIMARY KEY,
  package_id uuid NOT NULL REFERENCES turnover.turnover_package(id),
  version_number integer NOT NULL CHECK (version_number > 0),
  recipient_scope text NOT NULL,
  generated_at timestamptz NOT NULL,
  generated_by uuid NOT NULL,
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  generator_version text NOT NULL,
  CONSTRAINT turnover_package_version_unique UNIQUE (package_id, version_number)
);

CREATE TABLE turnover.package_manifest_entry (
  id uuid PRIMARY KEY,
  package_version_id uuid NOT NULL REFERENCES turnover.turnover_package_version(id),
  source_type text NOT NULL CHECK (source_type IN ('material', 'pmi', 'ncr', 'punch', 'document_revision')),
  source_id uuid NOT NULL,
  source_version bigint NOT NULL CHECK (source_version > 0),
  source_state text NOT NULL,
  inclusion_reason text NOT NULL,
  canonical_sha256 text NOT NULL CHECK (canonical_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT turnover_manifest_source_unique UNIQUE (package_version_id, source_type, source_id)
);

REVOKE UPDATE, DELETE ON turnover.turnover_package_version FROM PUBLIC;
REVOKE UPDATE, DELETE ON turnover.package_manifest_entry FROM PUBLIC;

INSERT INTO iam.permission (code, description) VALUES
  ('material.receive', 'Receive and identify material in assigned project scope.'),
  ('material.certification.submit', 'Submit material certification evidence.'),
  ('material.genealogy.manage', 'Create traceable child and remnant relationships.'),
  ('material.hold.create', 'Quarantine material and create a controlled hold.'),
  ('material.issue', 'Issue released material in assigned scope.'),
  ('material.release.evaluate', 'Evaluate material release blockers.'),
  ('material.release.approve', 'Approve material release after all configured checks pass.'),
  ('pmi.read', 'Read the governed PMI requirement and authorized PMI evidence.'),
  ('pmi.perform', 'Perform and submit PMI with qualified personnel and equipment.'),
  ('pmi.accept', 'Independently accept a passing PMI record.'),
  ('pmi.override.approve', 'Approve a governed PMI applicability override.'),
  ('inspection.equipment.manage', 'Register and control inspection equipment validity.'),
  ('inspection.plan.manage', 'Manage inspection plan revisions.'),
  ('inspection.plan.approve', 'Approve inspection plan revisions.'),
  ('inspection.perform', 'Perform assigned inspection work.'),
  ('inspection.accept', 'Independently accept an assigned inspection.'),
  ('ncr.create', 'Create and contain a nonconformance in assigned scope.'),
  ('ncr.read', 'Read authorized nonconformance history.'),
  ('ncr.disposition.propose', 'Propose an NCR disposition.'),
  ('ncr.disposition.approve', 'Independently approve an NCR disposition.'),
  ('ncr.reinspect', 'Record qualified reinspection evidence.'),
  ('ncr.close', 'Close an NCR after disposition and reinspection gates pass.'),
  ('punch.create', 'Create a punch item in assigned project scope.'),
  ('punch.update.owned', 'Update evidence and status for an owned punch item.'),
  ('punch.verify', 'Independently verify completed punch work.'),
  ('punch.close', 'Close an independently verified punch item.'),
  ('turnover.configure', 'Configure turnover requirements and completion boundaries.'),
  ('turnover.package.create', 'Create a turnover package identity.'),
  ('turnover.read', 'Read turnover readiness and package history in recipient scope.'),
  ('turnover.generate', 'Generate an immutable turnover package version.'),
  ('turnover.download', 'Download an authorized exact turnover package version.');
