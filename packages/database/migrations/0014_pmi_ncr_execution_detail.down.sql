ALTER TABLE deficiency.nonconformance
  DROP CONSTRAINT ncr_corrective_action_complete,
  DROP COLUMN corrective_action,
  DROP COLUMN responsible_user_id,
  DROP COLUMN initial_evidence_file_ids;

ALTER TABLE inspection.pmi_record
  DROP CONSTRAINT pmi_notes_present,
  DROP CONSTRAINT pmi_component_location_present,
  DROP COLUMN notes,
  DROP COLUMN component_location;
