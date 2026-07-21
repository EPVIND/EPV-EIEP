REVOKE SELECT ON public.eiep_schema_migration FROM eiep_job_worker;
REVOKE USAGE, SELECT ON SEQUENCE platform.repository_revision_seq FROM eiep_job_worker;
REVOKE SELECT, INSERT, UPDATE, DELETE ON platform.integration_work_lease FROM eiep_job_worker;
REVOKE SELECT, INSERT, UPDATE ON platform.repository_entity FROM eiep_job_worker;

REVOKE USAGE, SELECT ON SEQUENCE platform.repository_revision_seq FROM eiep_runtime;
REVOKE SELECT, INSERT, UPDATE, DELETE ON platform.integration_work_lease FROM eiep_runtime;
REVOKE SELECT, INSERT, UPDATE ON platform.repository_entity FROM eiep_runtime;
GRANT SELECT, UPDATE ON platform.application_state TO eiep_runtime;

DROP TABLE platform.integration_work_lease;
DROP TABLE platform.repository_entity;
DROP SEQUENCE platform.repository_revision_seq;
