CREATE SEQUENCE platform.repository_revision_seq AS bigint MINVALUE 1 START WITH 1 INCREMENT BY 1;

CREATE TABLE platform.repository_entity (
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  entity_kind text NOT NULL,
  ordinal bigint,
  project_id text,
  domain_version bigint,
  state text,
  interface_code text,
  occurred_at timestamptz,
  row_revision bigint NOT NULL DEFAULT 1,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (entity_type, entity_id),
  CONSTRAINT repository_entity_payload_wire CHECK (
    payload->>'type' = 'object' AND jsonb_typeof(payload->'value') = 'object'
  ),
  CONSTRAINT repository_entity_kind_consistent CHECK (
    (entity_kind = 'map' AND ordinal IS NULL)
    OR (entity_kind = 'array' AND ordinal IS NOT NULL AND ordinal >= 0)
  ),
  CONSTRAINT repository_entity_domain_version_positive CHECK (
    domain_version IS NULL OR domain_version > 0
  ),
  CONSTRAINT repository_entity_work_metadata CHECK (
    entity_type = 'integrationMessages' OR interface_code IS NULL
  )
);

CREATE INDEX repository_entity_project_lookup
  ON platform.repository_entity (project_id, entity_type, entity_id)
  WHERE project_id IS NOT NULL;

CREATE INDEX repository_entity_state_lookup
  ON platform.repository_entity (entity_type, state, occurred_at, entity_id)
  WHERE state IS NOT NULL;

CREATE INDEX repository_entity_integration_work
  ON platform.repository_entity (state, occurred_at, entity_id)
  INCLUDE (interface_code, domain_version)
  WHERE entity_type = 'integrationMessages' AND state IN ('received', 'pending', 'retry');

CREATE TABLE platform.integration_work_lease (
  message_id text PRIMARY KEY,
  entity_type text NOT NULL DEFAULT 'integrationMessages',
  owner_id text NOT NULL,
  lease_token text NOT NULL UNIQUE,
  claimed_at timestamptz NOT NULL,
  leased_until timestamptz NOT NULL,
  FOREIGN KEY (entity_type, message_id)
    REFERENCES platform.repository_entity(entity_type, entity_id) ON DELETE RESTRICT,
  CONSTRAINT integration_work_lease_entity_type CHECK (entity_type = 'integrationMessages'),
  CONSTRAINT integration_work_lease_duration_valid CHECK (leased_until > claimed_at),
  CONSTRAINT integration_work_lease_identity_present CHECK (
    btrim(owner_id) <> '' AND btrim(lease_token) <> ''
  )
);

CREATE INDEX integration_work_lease_expiry
  ON platform.integration_work_lease (leased_until, message_id);

REVOKE ALL ON platform.repository_entity, platform.integration_work_lease FROM PUBLIC;
REVOKE ALL ON SEQUENCE platform.repository_revision_seq FROM PUBLIC;
REVOKE SELECT, UPDATE ON platform.application_state FROM eiep_runtime;

GRANT SELECT, INSERT, UPDATE ON platform.repository_entity TO eiep_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON platform.integration_work_lease TO eiep_runtime;
GRANT USAGE, SELECT ON SEQUENCE platform.repository_revision_seq TO eiep_runtime;

GRANT SELECT, INSERT, UPDATE ON platform.repository_entity TO eiep_job_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON platform.integration_work_lease TO eiep_job_worker;
GRANT USAGE, SELECT ON SEQUENCE platform.repository_revision_seq TO eiep_job_worker;
GRANT SELECT ON public.eiep_schema_migration TO eiep_job_worker;
