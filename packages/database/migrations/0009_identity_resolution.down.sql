DELETE FROM iam.permission WHERE code IN ('identity.account.manage', 'identity.account.approve');
DROP TABLE iam.user_qualification;
ALTER TABLE iam.external_identity
  DROP CONSTRAINT external_identity_version_positive,
  DROP COLUMN version;
