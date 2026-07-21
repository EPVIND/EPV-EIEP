CREATE SCHEMA subcontractor;

CREATE TABLE project.work_package (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  code text NOT NULL,
  title text NOT NULL,
  state text NOT NULL CHECK (state IN ('draft', 'active', 'complete', 'closed')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL,
  CONSTRAINT work_package_code_unique UNIQUE (project_id, code)
);

CREATE TABLE subcontractor.subcontractor_profile (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES party.organization(id),
  legal_tax_reference text NOT NULL,
  declared_scopes text[] NOT NULL CHECK (cardinality(declared_scopes) > 0),
  approved_scopes text[] NOT NULL DEFAULT '{}',
  geography text[] NOT NULL CHECK (cardinality(geography) > 0),
  labor_model text NOT NULL,
  lower_tier_disclosure_required boolean NOT NULL,
  qualification_state text NOT NULL CHECK (qualification_state IN ('candidate', 'qualified', 'suspended', 'inactive')),
  qualification_valid_to timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL,
  CONSTRAINT subcontractor_profile_org_unique UNIQUE (organization_id),
  CONSTRAINT subcontractor_profile_qualification_consistent CHECK (
    (qualification_state = 'qualified' AND qualification_valid_to IS NOT NULL AND cardinality(approved_scopes) > 0)
    OR qualification_state <> 'qualified'
  )
);

CREATE TABLE subcontractor.qualification (
  id uuid PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES subcontractor.subcontractor_profile(id),
  organization_id uuid NOT NULL REFERENCES party.organization(id),
  category text NOT NULL CHECK (category IN ('license', 'insurance', 'bonding', 'safety', 'quality', 'personnel', 'equipment', 'client')),
  code text NOT NULL,
  approved_scopes text[] NOT NULL CHECK (cardinality(approved_scopes) > 0),
  issuer text NOT NULL,
  effective_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  exception_reason text,
  state text NOT NULL CHECK (state IN ('verified', 'revoked')),
  verified_at timestamptz NOT NULL,
  verified_by uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT subcontractor_qualification_code_unique UNIQUE (profile_id, code),
  CONSTRAINT subcontractor_qualification_validity CHECK (expires_at > effective_at)
);

CREATE TABLE subcontractor.credential_evidence (
  id uuid PRIMARY KEY,
  qualification_id uuid NOT NULL REFERENCES subcontractor.qualification(id),
  file_object_id uuid NOT NULL REFERENCES platform.file_object(id),
  issuer_reference text NOT NULL,
  verified_at timestamptz NOT NULL,
  verified_by uuid NOT NULL,
  CONSTRAINT credential_evidence_file_unique UNIQUE (qualification_id, file_object_id)
);

CREATE TABLE subcontractor.project_assignment (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  profile_id uuid NOT NULL REFERENCES subcontractor.subcontractor_profile(id),
  organization_id uuid NOT NULL REFERENCES party.organization(id),
  approved_scope_code text NOT NULL,
  authorization_reference text NOT NULL,
  mobilization_state text NOT NULL CHECK (mobilization_state IN ('pending', 'released', 'suspended')),
  mobilized_at timestamptz,
  mobilized_by uuid,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL,
  CONSTRAINT subcontractor_project_assignment_unique UNIQUE (project_id, organization_id),
  CONSTRAINT subcontractor_mobilization_release_consistent CHECK (
    (mobilization_state = 'released' AND mobilized_at IS NOT NULL AND mobilized_by IS NOT NULL)
    OR (mobilization_state <> 'released' AND mobilized_at IS NULL AND mobilized_by IS NULL)
  )
);

CREATE TABLE subcontractor.project_assignment_work_package (
  assignment_id uuid NOT NULL REFERENCES subcontractor.project_assignment(id),
  work_package_id uuid NOT NULL REFERENCES project.work_package(id),
  PRIMARY KEY (assignment_id, work_package_id)
);

CREATE TABLE subcontractor.mobilization_checklist (
  id uuid PRIMARY KEY,
  assignment_id uuid NOT NULL UNIQUE REFERENCES subcontractor.project_assignment(id),
  project_id uuid NOT NULL REFERENCES project.project(id),
  state text NOT NULL CHECK (state IN ('draft', 'under_review', 'ready', 'released', 'superseded')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL
);

CREATE TABLE subcontractor.mobilization_requirement (
  id uuid PRIMARY KEY,
  checklist_id uuid NOT NULL REFERENCES subcontractor.mobilization_checklist(id),
  project_id uuid NOT NULL REFERENCES project.project(id),
  code text NOT NULL,
  category text NOT NULL CHECK (category IN ('commercial', 'safety', 'quality', 'insurance', 'license', 'lower_tier', 'submission')),
  title text NOT NULL,
  required boolean NOT NULL,
  qualification_id uuid REFERENCES subcontractor.qualification(id),
  evidence_file_id uuid REFERENCES platform.file_object(id),
  state text NOT NULL CHECK (state IN ('missing', 'submitted', 'accepted', 'rejected')),
  submitted_by uuid,
  reviewed_by uuid,
  review_reason text,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL,
  CONSTRAINT mobilization_requirement_code_unique UNIQUE (checklist_id, code),
  CONSTRAINT mobilization_review_separation CHECK (reviewed_by IS NULL OR submitted_by IS NULL OR reviewed_by <> submitted_by),
  CONSTRAINT mobilization_requirement_state_consistent CHECK (
    (state = 'missing' AND submitted_by IS NULL AND reviewed_by IS NULL)
    OR (state = 'submitted' AND submitted_by IS NOT NULL AND reviewed_by IS NULL)
    OR (state IN ('accepted', 'rejected') AND submitted_by IS NOT NULL AND reviewed_by IS NOT NULL AND review_reason IS NOT NULL)
  )
);

CREATE TABLE subcontractor.submission (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  assignment_id uuid NOT NULL REFERENCES subcontractor.project_assignment(id),
  organization_id uuid NOT NULL REFERENCES party.organization(id),
  work_package_id uuid NOT NULL REFERENCES project.work_package(id),
  category text NOT NULL CHECK (category IN ('inspection', 'progress', 'deficiency', 'turnover')),
  title text NOT NULL,
  claimed_progress_percent numeric(5,2),
  evidence_file_ids uuid[] NOT NULL CHECK (cardinality(evidence_file_ids) > 0),
  state text NOT NULL CHECK (state IN ('submitted', 'accepted', 'rejected')),
  submitted_at timestamptz NOT NULL,
  submitted_by uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT subcontractor_claimed_progress_range CHECK (
    claimed_progress_percent IS NULL OR (claimed_progress_percent >= 0 AND claimed_progress_percent <= 100)
  )
);

CREATE TABLE subcontractor.epv_acceptance (
  id uuid PRIMARY KEY,
  submission_id uuid NOT NULL UNIQUE REFERENCES subcontractor.submission(id),
  decision text NOT NULL CHECK (decision IN ('accepted', 'rejected')),
  submitted_by uuid NOT NULL,
  reviewed_at timestamptz NOT NULL,
  reviewed_by uuid NOT NULL,
  assurance text NOT NULL CHECK (assurance IN ('step-up')),
  meaning_or_reason text NOT NULL,
  submission_version bigint NOT NULL CHECK (submission_version > 0),
  CONSTRAINT subcontractor_submission_review_separation CHECK (reviewed_by <> submitted_by)
);

INSERT INTO iam.permission (code, description) VALUES
  ('subcontractor.profile.manage', 'Create and maintain an organization-linked subcontractor profile.'),
  ('subcontractor.qualify', 'Independently verify subcontractor scope qualification and evidence.'),
  ('subcontractor.assign', 'Assign a currently qualified subcontractor to a project scope.'),
  ('mobilization.configure', 'Configure project mobilization prerequisites.'),
  ('mobilization.submit', 'Submit mobilization evidence for the acting subcontractor organization.'),
  ('mobilization.evaluate', 'Evaluate submitted mobilization evidence.'),
  ('mobilization.release', 'Release a subcontractor for mobilization after all prerequisites pass.'),
  ('portal.work.read', 'Read work assigned to the acting subcontractor organization.'),
  ('subcontractor.submit', 'Submit controlled records for an assigned work package.'),
  ('epv.accept', 'Accept or reject a subcontractor submission as an EPV authority.');
