REVOKE SELECT ON platform.audit_event, platform.audit_change FROM eiep_audit_reader;
REVOKE SELECT, UPDATE ON
  platform.outbox_message,
  platform.export_job,
  platform.integration_message,
  platform.notification
FROM eiep_job_worker;
REVOKE SELECT ON public.eiep_schema_migration FROM eiep_runtime;
REVOKE SELECT, UPDATE ON platform.application_state FROM eiep_runtime;
REVOKE USAGE ON SCHEMA platform FROM eiep_runtime, eiep_job_worker, eiep_audit_reader;
DROP ROLE eiep_audit_reader;
DROP ROLE eiep_job_worker;
DROP ROLE eiep_runtime;
