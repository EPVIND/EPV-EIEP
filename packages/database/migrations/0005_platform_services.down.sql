DELETE FROM iam.permission WHERE code IN (
  'file.validate', 'file.release', 'import.create', 'import.validate', 'import.commit',
  'material.read', 'punch.read', 'export.process', 'integration.receive', 'integration.process',
  'integration.manage', 'offline.draft.create', 'offline.draft.sync',
  'notification.subscription.manage', 'notification.dispatch', 'notification.deliver'
);
DROP TABLE platform.notification;
DROP TABLE platform.notification_subscription;
DROP TABLE platform.offline_draft;
DROP TABLE platform.workflow_connectivity_policy;
DROP TABLE platform.integration_message;
DROP TABLE platform.export_job;
DROP TABLE platform.imported_record;
DROP TABLE platform.external_identifier;
DROP TABLE platform.import_row;
DROP TABLE platform.import_job;
ALTER TABLE platform.file_object
  DROP CONSTRAINT platform_file_validation_consistent,
  DROP CONSTRAINT platform_file_size_policy,
  DROP COLUMN version,
  DROP COLUMN released_by,
  DROP COLUMN released_at,
  DROP COLUMN validated_by,
  DROP COLUMN validated_at,
  DROP COLUMN encrypted_archive_detected,
  DROP COLUMN active_content_detected,
  DROP COLUMN malware_state,
  DROP COLUMN detected_sha256;
ALTER TABLE platform.file_object
  ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE platform.file_object
  RENAME COLUMN validator_version TO validation_version;
