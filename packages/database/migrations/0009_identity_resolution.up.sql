ALTER TABLE iam.external_identity
  ADD COLUMN version bigint NOT NULL DEFAULT 1,
  ADD CONSTRAINT external_identity_version_positive CHECK (version > 0);

CREATE TABLE iam.user_qualification (
  id uuid PRIMARY KEY,
  user_account_id uuid NOT NULL REFERENCES iam.user_account(id),
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_.-]{0,63}$'),
  evidence_file_id uuid REFERENCES platform.file_object(id),
  state text NOT NULL CHECK (state IN ('proposed', 'active', 'expired', 'revoked')),
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  proposed_by uuid NOT NULL,
  approved_by uuid,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT user_qualification_unique UNIQUE (user_account_id, code, valid_from),
  CONSTRAINT user_qualification_validity CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT user_qualification_approval_separation CHECK (approved_by IS NULL OR approved_by <> proposed_by),
  CONSTRAINT user_qualification_state_consistent CHECK (
    (state = 'proposed' AND approved_by IS NULL)
    OR (state IN ('active', 'expired', 'revoked') AND approved_by IS NOT NULL)
  )
);

CREATE INDEX user_qualification_current
  ON iam.user_qualification (user_account_id, code, valid_to)
  WHERE state = 'active';

INSERT INTO iam.permission (code, description) VALUES
  ('identity.account.manage', 'Provision, link, disable, and maintain governed local identity accounts.'),
  ('identity.account.approve', 'Independently activate a governed local identity account.');
