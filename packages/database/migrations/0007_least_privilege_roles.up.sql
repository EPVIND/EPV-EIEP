DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'eiep_runtime') THEN
    CREATE ROLE eiep_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'eiep_job_worker') THEN
    CREATE ROLE eiep_job_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'eiep_audit_reader') THEN
    CREATE ROLE eiep_audit_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$roles$;

REVOKE ALL ON ALL TABLES IN SCHEMA party, iam, project, platform, document, material, inspection, deficiency, turnover, subcontractor FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA party, iam, project, platform, document, material, inspection, deficiency, turnover, subcontractor FROM PUBLIC;

ALTER DEFAULT PRIVILEGES IN SCHEMA party, iam, project, platform, document, material, inspection, deficiency, turnover, subcontractor
  REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA party, iam, project, platform, document, material, inspection, deficiency, turnover, subcontractor
  REVOKE ALL ON SEQUENCES FROM PUBLIC;

GRANT USAGE ON SCHEMA platform TO eiep_runtime;
GRANT SELECT ON public.eiep_schema_migration TO eiep_runtime;
GRANT SELECT, UPDATE ON platform.application_state TO eiep_runtime;

GRANT USAGE ON SCHEMA platform TO eiep_job_worker;
GRANT SELECT, UPDATE ON
  platform.outbox_message,
  platform.export_job,
  platform.integration_message,
  platform.notification
TO eiep_job_worker;

GRANT USAGE ON SCHEMA platform TO eiep_audit_reader;
GRANT SELECT ON platform.audit_event, platform.audit_change TO eiep_audit_reader;
