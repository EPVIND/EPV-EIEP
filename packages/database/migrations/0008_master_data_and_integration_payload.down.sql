DELETE FROM iam.permission WHERE code IN ('master_data.manage', 'master_data.approve');
DROP TABLE platform.code_list_entry;
DROP TABLE platform.code_list;
DROP TABLE platform.unit_definition;
ALTER TABLE platform.integration_message
  DROP CONSTRAINT integration_message_payload_object,
  DROP COLUMN payload;
