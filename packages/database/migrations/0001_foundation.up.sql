CREATE SCHEMA party;
CREATE SCHEMA iam;
CREATE SCHEMA project;
CREATE SCHEMA platform;
CREATE SCHEMA document;

CREATE TABLE party.organization (
  id uuid PRIMARY KEY,
  code text NOT NULL,
  name text NOT NULL,
  organization_type text NOT NULL,
  state text NOT NULL CHECK (state IN ('active', 'inactive', 'suspended')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL,
  CONSTRAINT organization_code_unique UNIQUE (code)
);

CREATE TABLE party.person (
  id uuid PRIMARY KEY,
  display_name text NOT NULL,
  state text NOT NULL CHECK (state IN ('active', 'inactive')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL
);

CREATE TABLE iam.user_account (
  id uuid PRIMARY KEY,
  person_id uuid NOT NULL REFERENCES party.person(id),
  state text NOT NULL CHECK (state IN ('invited', 'active', 'disabled', 'closed')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL
);

CREATE TABLE iam.external_identity (
  id uuid PRIMARY KEY,
  user_account_id uuid NOT NULL REFERENCES iam.user_account(id),
  issuer text NOT NULL,
  subject text NOT NULL,
  identity_type text NOT NULL CHECK (identity_type IN ('internal', 'guest', 'service', 'break_glass')),
  last_verified_at timestamptz,
  CONSTRAINT external_identity_subject_unique UNIQUE (issuer, subject)
);

CREATE TABLE iam.permission (
  code text PRIMARY KEY,
  description text NOT NULL
);

CREATE TABLE iam.role (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  state text NOT NULL CHECK (state IN ('draft', 'active', 'retired')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);

CREATE TABLE iam.role_permission (
  role_id uuid NOT NULL REFERENCES iam.role(id),
  permission_code text NOT NULL REFERENCES iam.permission(code),
  PRIMARY KEY (role_id, permission_code)
);

CREATE TABLE project.facility (
  id uuid PRIMARY KEY,
  owner_organization_id uuid NOT NULL REFERENCES party.organization(id),
  code text NOT NULL,
  name text NOT NULL,
  time_zone text NOT NULL,
  state text NOT NULL CHECK (state IN ('active', 'inactive')),
  CONSTRAINT facility_owner_code_unique UNIQUE (owner_organization_id, code)
);

CREATE TABLE project.project (
  id uuid PRIMARY KEY,
  business_scope_organization_id uuid NOT NULL REFERENCES party.organization(id),
  customer_organization_id uuid NOT NULL REFERENCES party.organization(id),
  facility_id uuid NOT NULL REFERENCES project.facility(id),
  project_number text NOT NULL,
  name text NOT NULL,
  time_zone text NOT NULL,
  state text NOT NULL CHECK (state IN ('draft', 'readiness_review', 'active', 'suspended', 'closing', 'closed')),
  readiness jsonb NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL,
  CONSTRAINT project_number_unique_in_scope UNIQUE (business_scope_organization_id, project_number)
);

CREATE TABLE project.completion_boundary (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  boundary_type text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  state text NOT NULL CHECK (state IN ('draft', 'active', 'retired')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  CONSTRAINT completion_boundary_code_unique UNIQUE (project_id, code)
);

CREATE TABLE project.responsibility_assignment (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  responsibility_type text NOT NULL,
  organization_id uuid NOT NULL REFERENCES party.organization(id),
  person_id uuid REFERENCES party.person(id),
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  state text NOT NULL CHECK (state IN ('active', 'revoked', 'expired')),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE TABLE iam.role_assignment (
  id uuid PRIMARY KEY,
  user_account_id uuid NOT NULL REFERENCES iam.user_account(id),
  acting_organization_id uuid NOT NULL REFERENCES party.organization(id),
  role_id uuid NOT NULL REFERENCES iam.role(id),
  scope_type text NOT NULL CHECK (scope_type IN ('organization', 'project', 'work_package', 'object')),
  scope_id uuid NOT NULL,
  effective_from timestamptz NOT NULL,
  effective_to timestamptz NOT NULL,
  revoked_at timestamptz,
  granted_by uuid NOT NULL,
  grant_reason text NOT NULL,
  reviewed_at timestamptz,
  reviewed_by uuid,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  CONSTRAINT access_assignment_time_bounded CHECK (effective_to > effective_from)
);

CREATE INDEX role_assignment_active_lookup
  ON iam.role_assignment (user_account_id, acting_organization_id, scope_type, scope_id)
  WHERE revoked_at IS NULL;

CREATE TABLE iam.delegation (
  id uuid PRIMARY KEY,
  delegator_user_id uuid NOT NULL REFERENCES iam.user_account(id),
  delegate_user_id uuid NOT NULL REFERENCES iam.user_account(id),
  acting_organization_id uuid NOT NULL REFERENCES party.organization(id),
  permission_codes text[] NOT NULL CHECK (cardinality(permission_codes) > 0),
  scope_type text NOT NULL CHECK (scope_type IN ('organization', 'project', 'work_package', 'object')),
  scope_id uuid NOT NULL,
  effective_from timestamptz NOT NULL,
  effective_to timestamptz NOT NULL,
  justification text NOT NULL,
  state text NOT NULL CHECK (state IN ('proposed', 'active', 'revoked', 'expired')),
  approved_at timestamptz,
  approved_by uuid,
  revoked_at timestamptz,
  revoked_by uuid,
  reviewed_at timestamptz,
  reviewed_by uuid,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  CONSTRAINT delegation_time_bounded CHECK (effective_to > effective_from),
  CONSTRAINT delegation_approval_separation CHECK (
    delegate_user_id <> delegator_user_id
    AND (approved_by IS NULL OR (approved_by <> delegator_user_id AND approved_by <> delegate_user_id))
  ),
  CONSTRAINT delegation_state_consistent CHECK (
    (state = 'proposed' AND approved_at IS NULL AND approved_by IS NULL AND revoked_at IS NULL AND revoked_by IS NULL)
    OR (state = 'active' AND approved_at IS NOT NULL AND approved_by IS NOT NULL AND revoked_at IS NULL AND revoked_by IS NULL)
    OR (state = 'revoked' AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL)
    OR state = 'expired'
  )
);

CREATE TABLE platform.file_object (
  id uuid PRIMARY KEY,
  project_id uuid REFERENCES project.project(id),
  storage_key text NOT NULL UNIQUE,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  declared_media_type text NOT NULL,
  detected_media_type text,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  validation_state text NOT NULL CHECK (validation_state IN ('staged', 'validated', 'quarantined', 'released', 'rejected')),
  validation_version text,
  retention_class text NOT NULL,
  original_filename text NOT NULL,
  uploaded_at timestamptz NOT NULL,
  uploaded_by uuid NOT NULL
);

CREATE TABLE document.document (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  document_number text NOT NULL,
  title text NOT NULL,
  document_type text NOT NULL,
  discipline text NOT NULL,
  originator_organization_id uuid NOT NULL REFERENCES party.organization(id),
  current_revision_id uuid,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL,
  CONSTRAINT document_number_unique_in_project UNIQUE (project_id, document_number),
  CONSTRAINT document_identity_pair UNIQUE (id, project_id)
);

CREATE TABLE document.document_revision (
  id uuid PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES document.document(id),
  revision text NOT NULL,
  purpose text NOT NULL,
  source text NOT NULL,
  state text NOT NULL CHECK (state IN ('draft', 'staged', 'under_review', 'approved', 'released', 'superseded', 'rejected', 'void')),
  approval_count integer NOT NULL DEFAULT 0 CHECK (approval_count >= 0),
  required_approval_count integer NOT NULL DEFAULT 1 CHECK (required_approval_count >= 0),
  supersedes_revision_id uuid REFERENCES document.document_revision(id),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL,
  CONSTRAINT document_revision_unique UNIQUE (document_id, revision),
  CONSTRAINT document_revision_identity_pair UNIQUE (id, document_id),
  CHECK (approval_count <= required_approval_count)
);

ALTER TABLE document.document
  ADD CONSTRAINT document_current_revision_belongs_to_document
  FOREIGN KEY (current_revision_id, id)
  REFERENCES document.document_revision(id, document_id);

CREATE UNIQUE INDEX one_released_revision_per_document
  ON document.document_revision (document_id)
  WHERE state = 'released';

CREATE TABLE document.document_file (
  document_revision_id uuid NOT NULL REFERENCES document.document_revision(id),
  file_object_id uuid NOT NULL REFERENCES platform.file_object(id),
  representation_purpose text NOT NULL,
  display_filename text NOT NULL,
  PRIMARY KEY (document_revision_id, file_object_id, representation_purpose)
);

CREATE TABLE document.document_approval (
  id uuid PRIMARY KEY,
  document_revision_id uuid NOT NULL REFERENCES document.document_revision(id),
  assigned_user_id uuid NOT NULL REFERENCES iam.user_account(id),
  decision text NOT NULL CHECK (decision IN ('pending', 'approved', 'rejected')),
  meaning text NOT NULL,
  decided_at timestamptz,
  assurance_context jsonb,
  comment text,
  CONSTRAINT one_approval_assignment UNIQUE (document_revision_id, assigned_user_id, meaning)
);

CREATE TABLE platform.audit_event (
  id uuid PRIMARY KEY,
  occurred_at timestamptz NOT NULL,
  actor_user_id uuid NOT NULL,
  acting_organization_id uuid NOT NULL,
  project_id uuid,
  action text NOT NULL,
  object_type text NOT NULL,
  object_id uuid NOT NULL,
  prior_state text,
  new_state text,
  reason text,
  correlation_id uuid NOT NULL,
  changed_fields jsonb NOT NULL,
  canonical_sha256 text NOT NULL CHECK (canonical_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE INDEX audit_event_project_time ON platform.audit_event (project_id, occurred_at DESC);
CREATE INDEX audit_event_object_time ON platform.audit_event (object_type, object_id, occurred_at DESC);
REVOKE UPDATE, DELETE ON platform.audit_event FROM PUBLIC;

CREATE TABLE platform.outbox_message (
  id uuid PRIMARY KEY,
  occurred_at timestamptz NOT NULL,
  topic text NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version > 0),
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  correlation_id uuid NOT NULL,
  causation_id uuid,
  payload jsonb NOT NULL,
  available_at timestamptz NOT NULL,
  claimed_until timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  completed_at timestamptz,
  dead_lettered_at timestamptz,
  last_error_code text
);

CREATE INDEX outbox_available
  ON platform.outbox_message (available_at, occurred_at)
  WHERE completed_at IS NULL AND dead_lettered_at IS NULL;

INSERT INTO iam.permission (code, description) VALUES
  ('access.assignment.read', 'Read authorized access assignments.'),
  ('access.assignment.manage', 'Create and revoke access assignments within grant authority.'),
  ('access.assignment.review', 'Independently review access assignments.'),
  ('access.delegation.create', 'Propose a bounded delegation within owned authority.'),
  ('access.delegation.manage', 'Independently approve a proposed delegation.'),
  ('access.delegation.review', 'Review active, expired, or revoked delegations.'),
  ('access.delegation.revoke', 'Revoke a controlled delegation.'),
  ('audit.read', 'Read authorized audit history.'),
  ('project.create', 'Create a project within an approved business scope.'),
  ('project.read', 'Read an assigned project.'),
  ('project.structure.manage', 'Manage authorized project structure.'),
  ('project.assignment.manage', 'Manage authorized project assignments.'),
  ('project.configuration.manage', 'Propose project configuration versions.'),
  ('project.configuration.approve', 'Approve project configuration versions.'),
  ('project.activate', 'Activate a ready project.'),
  ('document.create', 'Register a controlled document.'),
  ('document.revision.submit', 'Submit a controlled document revision.'),
  ('document.review', 'Review an assigned document revision.'),
  ('document.approve', 'Approve an assigned document revision.'),
  ('document.release', 'Release an approved document revision.'),
  ('document.supersede', 'Supersede a released document revision.'),
  ('document.read_current', 'Read current released documents in scope.'),
  ('document.read_history', 'Read authorized document history.'),
  ('document.distribute', 'Distribute an exact released document revision.'),
  ('document.acknowledge', 'Acknowledge an exact distributed document revision.'),
  ('file.upload', 'Upload a file into restricted staging.'),
  ('file.download', 'Download an authorized file.'),
  ('export.create', 'Create an authorized export.'),
  ('export.download', 'Download an authorized export.');
