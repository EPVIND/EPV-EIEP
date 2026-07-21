ALTER TABLE inspection.pmi_record
  ADD COLUMN component_location text,
  ADD COLUMN notes text;

UPDATE inspection.pmi_record AS pmi
SET component_location = COALESCE(
      NULLIF(BTRIM(material_item.storage_location), ''),
      '[migration] Location was not captured on legacy PMI record ' || pmi.id::text
    ),
    notes = '[migration] Legacy PMI record; retained readings and evidence remain authoritative.'
FROM material.material_item AS material_item
WHERE material_item.id = pmi.material_item_id;

UPDATE inspection.pmi_record
SET component_location = '[migration] Location was not captured on legacy PMI record ' || id::text,
    notes = COALESCE(
      notes,
      '[migration] Legacy PMI record; retained readings and evidence remain authoritative.'
    )
WHERE component_location IS NULL OR notes IS NULL;

ALTER TABLE inspection.pmi_record
  ALTER COLUMN component_location SET NOT NULL,
  ALTER COLUMN notes SET NOT NULL,
  ADD CONSTRAINT pmi_component_location_present CHECK (BTRIM(component_location) <> ''),
  ADD CONSTRAINT pmi_notes_present CHECK (BTRIM(notes) <> '');

ALTER TABLE deficiency.nonconformance
  ADD COLUMN initial_evidence_file_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN responsible_user_id uuid,
  ADD COLUMN corrective_action text;

UPDATE deficiency.nonconformance
SET responsible_user_id = created_by,
    corrective_action = CASE
      WHEN state = 'open' THEN NULL
      WHEN disposition IS NOT NULL AND BTRIM(disposition) <> ''
        THEN '[migration] Corrective-action detail was not captured separately; prior disposition: ' || disposition
      ELSE '[migration] Corrective-action detail requires governance review for this legacy record.'
    END;

ALTER TABLE deficiency.nonconformance
  ALTER COLUMN initial_evidence_file_ids DROP DEFAULT,
  ALTER COLUMN responsible_user_id SET NOT NULL,
  ADD CONSTRAINT ncr_corrective_action_complete CHECK (
    state = 'open' OR (corrective_action IS NOT NULL AND BTRIM(corrective_action) <> '')
  );
