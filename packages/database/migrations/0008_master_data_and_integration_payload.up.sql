ALTER TABLE platform.integration_message
  ADD COLUMN payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT integration_message_payload_object CHECK (jsonb_typeof(payload) = 'object');

CREATE TABLE platform.unit_definition (
  code text PRIMARY KEY CHECK (code ~ '^[A-Z][A-Z0-9_]{0,31}$'),
  symbol text NOT NULL,
  dimension text NOT NULL CHECK (dimension IN ('count', 'length', 'area', 'volume', 'mass', 'time', 'temperature', 'pressure', 'force', 'ratio')),
  maximum_scale integer NOT NULL CHECK (maximum_scale BETWEEN 0 AND 8),
  state text NOT NULL CHECK (state IN ('active', 'retired')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL
);

CREATE TABLE platform.code_list (
  id uuid PRIMARY KEY,
  business_scope_organization_id uuid NOT NULL REFERENCES party.organization(id),
  project_id uuid REFERENCES project.project(id),
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_.-]{0,63}$'),
  revision integer NOT NULL CHECK (revision > 0),
  state text NOT NULL CHECK (state IN ('draft', 'active', 'superseded', 'retired')),
  effective_from timestamptz,
  proposed_by uuid NOT NULL,
  approved_by uuid,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT code_list_revision_unique UNIQUE (business_scope_organization_id, project_id, code, revision),
  CONSTRAINT code_list_approval_separation CHECK (approved_by IS NULL OR approved_by <> proposed_by),
  CONSTRAINT code_list_state_consistent CHECK (
    (state = 'draft' AND approved_by IS NULL AND effective_from IS NULL)
    OR (state IN ('active', 'superseded', 'retired') AND approved_by IS NOT NULL AND effective_from IS NOT NULL)
  )
);

CREATE UNIQUE INDEX code_list_one_active_scope
  ON platform.code_list (business_scope_organization_id, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid), code)
  WHERE state = 'active';

CREATE TABLE platform.code_list_entry (
  code_list_id uuid NOT NULL REFERENCES platform.code_list(id),
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_.-]{0,63}$'),
  label text NOT NULL,
  display_order integer NOT NULL CHECK (display_order >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  PRIMARY KEY (code_list_id, code)
);

INSERT INTO iam.permission (code, description) VALUES
  ('master_data.manage', 'Propose scoped unit and code-list configuration.'),
  ('master_data.approve', 'Independently approve scoped unit and code-list configuration.');
