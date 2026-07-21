DELETE FROM iam.permission WHERE code = 'pmi.override.manage';
ALTER TABLE material.material_item
  DROP CONSTRAINT material_item_override_rule_consistent,
  DROP COLUMN pmi_override_id,
  DROP COLUMN project_rule_version_id;
DROP TABLE inspection.pmi_override;
