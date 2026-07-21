CREATE TABLE inspection.pmi_override (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  material_item_id uuid NOT NULL REFERENCES material.material_item(id),
  project_rule_version_id uuid NOT NULL REFERENCES project.project_rule_version(id),
  governing_document_revision_id uuid NOT NULL REFERENCES document.document_revision(id),
  required boolean NOT NULL,
  justification text NOT NULL,
  state text NOT NULL CHECK (state IN ('proposed', 'active')),
  proposed_by uuid NOT NULL,
  approved_by uuid,
  approved_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT pmi_override_justification_present CHECK (length(btrim(justification)) > 0),
  CONSTRAINT pmi_override_approval_separation CHECK (approved_by IS NULL OR approved_by <> proposed_by),
  CONSTRAINT pmi_override_state_consistent CHECK (
    (state = 'proposed' AND approved_by IS NULL AND approved_at IS NULL)
    OR (state = 'active' AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX pmi_override_open_per_material
  ON inspection.pmi_override (material_item_id)
  WHERE state IN ('proposed', 'active');

ALTER TABLE material.material_item
  ADD COLUMN project_rule_version_id uuid NOT NULL REFERENCES project.project_rule_version(id),
  ADD COLUMN pmi_override_id uuid REFERENCES inspection.pmi_override(id),
  ADD CONSTRAINT material_item_override_rule_consistent CHECK (
    pmi_override_id IS NULL
    OR (pmi_required AND governing_pmi_rule = 'PMI-OVERRIDE:' || pmi_override_id::text)
    OR (NOT pmi_required AND governing_pmi_rule IS NULL AND pmi_accepted)
  );

INSERT INTO iam.permission (code, description) VALUES
  ('pmi.override.manage', 'Propose a material-specific PMI applicability override.');
