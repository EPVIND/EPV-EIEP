CREATE TABLE project.system (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  code text NOT NULL,
  name text NOT NULL,
  state text NOT NULL CHECK (state IN ('active', 'retired')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  CONSTRAINT project_system_code_unique UNIQUE (project_id, code)
);

CREATE TABLE project.area (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  code text NOT NULL,
  name text NOT NULL,
  state text NOT NULL CHECK (state IN ('active', 'retired')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  CONSTRAINT project_area_code_unique UNIQUE (project_id, code)
);

CREATE TABLE project.wbs_element (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  parent_id uuid REFERENCES project.wbs_element(id),
  code text NOT NULL,
  name text NOT NULL,
  state text NOT NULL CHECK (state IN ('active', 'retired')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  CONSTRAINT project_wbs_code_unique UNIQUE (project_id, code),
  CONSTRAINT project_wbs_not_self_parent CHECK (parent_id IS NULL OR parent_id <> id)
);

ALTER TABLE project.work_package
  ADD COLUMN wbs_element_id uuid NOT NULL REFERENCES project.wbs_element(id);

CREATE TABLE project.project_organization (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  organization_id uuid NOT NULL REFERENCES party.organization(id),
  participation_role text NOT NULL CHECK (participation_role IN ('business_scope', 'customer', 'supplier', 'subcontractor', 'inspector', 'other')),
  state text NOT NULL CHECK (state IN ('active', 'inactive')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  CONSTRAINT project_organization_unique UNIQUE (project_id, organization_id)
);

CREATE TABLE project.project_rule_set (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  configuration_code text NOT NULL,
  CONSTRAINT project_rule_set_code_unique UNIQUE (project_id, configuration_code)
);

CREATE TABLE project.project_rule_version (
  id uuid PRIMARY KEY,
  rule_set_id uuid NOT NULL REFERENCES project.project_rule_set(id),
  project_id uuid NOT NULL REFERENCES project.project(id),
  revision text NOT NULL,
  settings jsonb NOT NULL CHECK (jsonb_typeof(settings) = 'object' AND settings <> '{}'::jsonb),
  effective_from timestamptz NOT NULL,
  state text NOT NULL CHECK (state IN ('under_review', 'active', 'superseded', 'rejected')),
  supersedes_revision_id uuid REFERENCES project.project_rule_version(id),
  approved_at timestamptz,
  approved_by uuid,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL,
  CONSTRAINT project_rule_version_unique UNIQUE (rule_set_id, revision),
  CONSTRAINT project_rule_approval_separation CHECK (approved_by IS NULL OR approved_by <> created_by),
  CONSTRAINT project_rule_state_consistent CHECK (
    (state = 'under_review' AND approved_at IS NULL AND approved_by IS NULL)
    OR (state IN ('active', 'superseded') AND approved_at IS NOT NULL AND approved_by IS NOT NULL)
    OR state = 'rejected'
  )
);

CREATE UNIQUE INDEX one_active_project_rule_version
  ON project.project_rule_version (rule_set_id)
  WHERE state = 'active';

CREATE TABLE project.project_rule_governing_revision (
  project_rule_version_id uuid NOT NULL REFERENCES project.project_rule_version(id),
  document_revision_id uuid NOT NULL REFERENCES document.document_revision(id),
  PRIMARY KEY (project_rule_version_id, document_revision_id)
);

CREATE TABLE document.distribution (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  document_revision_id uuid NOT NULL REFERENCES document.document_revision(id),
  recipient_organization_id uuid NOT NULL REFERENCES party.organization(id),
  recipient_user_id uuid REFERENCES iam.user_account(id),
  work_package_id uuid REFERENCES project.work_package(id),
  purpose text NOT NULL,
  acknowledgement_required boolean NOT NULL,
  distributed_at timestamptz NOT NULL,
  distributed_by uuid NOT NULL,
  downloaded_at timestamptz,
  downloaded_by uuid,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT document_distribution_unique UNIQUE (
    document_revision_id, recipient_organization_id, recipient_user_id, work_package_id, purpose
  )
);

CREATE TABLE document.acknowledgement (
  id uuid PRIMARY KEY,
  distribution_id uuid NOT NULL UNIQUE REFERENCES document.distribution(id),
  document_revision_id uuid NOT NULL REFERENCES document.document_revision(id),
  acknowledged_at timestamptz NOT NULL,
  acknowledged_by uuid NOT NULL,
  assurance text NOT NULL CHECK (assurance IN ('mfa', 'step-up')),
  meaning text NOT NULL
);

CREATE TABLE document.governing_document_link (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  document_revision_id uuid NOT NULL REFERENCES document.document_revision(id),
  governing_purpose text NOT NULL,
  state text NOT NULL CHECK (state IN ('active', 'superseded', 'void')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  CONSTRAINT governing_document_exact_link_unique UNIQUE (
    project_id, target_type, target_id, document_revision_id, governing_purpose
  )
);

CREATE TABLE platform.audit_change (
  id uuid PRIMARY KEY,
  audit_event_id uuid NOT NULL REFERENCES platform.audit_event(id),
  field_name text NOT NULL,
  prior_value jsonb,
  new_value jsonb,
  protected boolean NOT NULL,
  redaction_class text,
  CONSTRAINT audit_change_field_unique UNIQUE (audit_event_id, field_name),
  CONSTRAINT audit_change_redaction_consistent CHECK ((protected AND redaction_class IS NOT NULL) OR NOT protected)
);

REVOKE UPDATE, DELETE ON platform.audit_change FROM PUBLIC;

CREATE TABLE platform.retention_policy (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  record_class text NOT NULL,
  contract_reference text NOT NULL,
  retention_duration_days integer NOT NULL CHECK (retention_duration_days >= 0),
  disposition_action text NOT NULL CHECK (disposition_action IN ('archive', 'destroy', 'anonymize')),
  state text NOT NULL CHECK (state IN ('under_review', 'active', 'retired')),
  approved_at timestamptz,
  approved_by uuid,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  CONSTRAINT retention_policy_approval_separation CHECK (approved_by IS NULL OR approved_by <> created_by)
);

CREATE UNIQUE INDEX one_active_retention_policy
  ON platform.retention_policy (project_id, record_class)
  WHERE state = 'active';

CREATE TABLE platform.legal_hold (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  reason text NOT NULL,
  state text NOT NULL CHECK (state IN ('active', 'released')),
  placed_at timestamptz NOT NULL,
  placed_by uuid NOT NULL,
  released_at timestamptz,
  released_by uuid,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT legal_hold_release_separation CHECK (released_by IS NULL OR released_by <> placed_by),
  CONSTRAINT legal_hold_state_consistent CHECK (
    (state = 'active' AND released_at IS NULL AND released_by IS NULL)
    OR (state = 'released' AND released_at IS NOT NULL AND released_by IS NOT NULL)
  )
);

CREATE UNIQUE INDEX one_active_legal_hold_per_target
  ON platform.legal_hold (project_id, target_type, target_id)
  WHERE state = 'active';

CREATE TABLE platform.retention_disposition (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  policy_id uuid NOT NULL REFERENCES platform.retention_policy(id),
  record_class text NOT NULL,
  target_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('archive', 'destroy', 'anonymize')),
  state text NOT NULL CHECK (state IN ('proposed', 'approved', 'executed', 'rejected')),
  reason text NOT NULL,
  requested_at timestamptz NOT NULL,
  requested_by uuid NOT NULL,
  approved_at timestamptz,
  approved_by uuid,
  executed_at timestamptz,
  executed_by uuid,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT retention_disposition_separation CHECK (
    (approved_by IS NULL OR approved_by <> requested_by)
    AND (executed_by IS NULL OR (executed_by <> requested_by AND executed_by <> approved_by))
  ),
  CONSTRAINT retention_disposition_state_consistent CHECK (
    (state = 'proposed' AND approved_at IS NULL AND approved_by IS NULL AND executed_at IS NULL AND executed_by IS NULL)
    OR (state = 'approved' AND approved_at IS NOT NULL AND approved_by IS NOT NULL AND executed_at IS NULL AND executed_by IS NULL)
    OR (state = 'executed' AND approved_at IS NOT NULL AND approved_by IS NOT NULL AND executed_at IS NOT NULL AND executed_by IS NOT NULL)
    OR state = 'rejected'
  )
);

INSERT INTO iam.permission (code, description) VALUES
  ('record.governing_document.link', 'Link an exact released governing revision to an authorized business record.'),
  ('records.retention.manage', 'Propose record-class and contract retention policies.'),
  ('records.retention.approve', 'Independently approve retention policies.'),
  ('records.legal_hold.manage', 'Place or independently release a legal hold.'),
  ('records.disposition.manage', 'Request disposition after the approved retention period.'),
  ('records.disposition.approve', 'Independently approve a retention disposition.'),
  ('records.disposition.execute', 'Execute an approved disposition as a separate operator.');
