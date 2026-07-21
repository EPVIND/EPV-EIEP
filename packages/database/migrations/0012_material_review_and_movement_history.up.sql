CREATE INDEX repository_mtr_review_project_lookup
  ON platform.repository_entity (project_id, occurred_at, entity_id)
  WHERE entity_type = 'mtrReviews';

CREATE INDEX repository_material_movement_project_lookup
  ON platform.repository_entity (project_id, occurred_at, entity_id)
  WHERE entity_type = 'materialMovements';

CREATE FUNCTION platform.reject_immutable_material_history_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, platform
AS $$
BEGIN
  IF OLD.entity_type IN ('mtrReviews', 'materialMovements') THEN
    RAISE EXCEPTION 'controlled material history is immutable'
      USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER repository_immutable_material_history
BEFORE UPDATE OR DELETE ON platform.repository_entity
FOR EACH ROW
EXECUTE FUNCTION platform.reject_immutable_material_history_change();

REVOKE ALL ON FUNCTION platform.reject_immutable_material_history_change() FROM PUBLIC;

