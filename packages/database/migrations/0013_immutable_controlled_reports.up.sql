CREATE INDEX repository_controlled_report_project_lookup
  ON platform.repository_entity (project_id, occurred_at, entity_id)
  WHERE entity_type = 'controlledReports';

CREATE FUNCTION platform.reject_immutable_controlled_report_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, platform
AS $$
BEGIN
  IF OLD.entity_type = 'controlledReports' THEN
    RAISE EXCEPTION 'controlled report snapshots are immutable'
      USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER repository_immutable_controlled_report
BEFORE UPDATE OR DELETE ON platform.repository_entity
FOR EACH ROW
EXECUTE FUNCTION platform.reject_immutable_controlled_report_change();

REVOKE ALL ON FUNCTION platform.reject_immutable_controlled_report_change() FROM PUBLIC;

