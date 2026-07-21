ALTER TABLE platform.file_object
  RENAME COLUMN validation_version TO validator_version;

ALTER TABLE platform.file_object
  ALTER COLUMN project_id SET NOT NULL,
  ADD COLUMN detected_sha256 text CHECK (detected_sha256 IS NULL OR detected_sha256 ~ '^[0-9a-f]{64}$'),
  ADD COLUMN malware_state text NOT NULL DEFAULT 'pending' CHECK (malware_state IN ('pending', 'clean', 'malicious', 'error')),
  ADD COLUMN active_content_detected boolean,
  ADD COLUMN encrypted_archive_detected boolean,
  ADD COLUMN validated_at timestamptz,
  ADD COLUMN validated_by uuid,
  ADD COLUMN released_at timestamptz,
  ADD COLUMN released_by uuid,
  ADD COLUMN version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  ADD CONSTRAINT platform_file_size_policy CHECK (size_bytes <= 262144000),
  ADD CONSTRAINT platform_file_validation_consistent CHECK (
    (validation_state = 'staged'
      AND malware_state = 'pending'
      AND validated_at IS NULL
      AND validated_by IS NULL
      AND released_at IS NULL
      AND released_by IS NULL)
    OR (validation_state IN ('validated', 'quarantined', 'rejected')
      AND malware_state <> 'pending'
      AND detected_sha256 IS NOT NULL
      AND detected_media_type IS NOT NULL
      AND validator_version IS NOT NULL
      AND validated_at IS NOT NULL
      AND validated_by IS NOT NULL
      AND released_at IS NULL
      AND released_by IS NULL)
    OR (validation_state = 'released'
      AND malware_state = 'clean'
      AND detected_sha256 = sha256
      AND detected_media_type = declared_media_type
      AND active_content_detected = false
      AND encrypted_archive_detected = false
      AND validated_at IS NOT NULL
      AND validated_by IS NOT NULL
      AND released_at IS NOT NULL
      AND released_by IS NOT NULL
      AND released_by <> uploaded_by
      AND released_by <> validated_by)
  );

CREATE TABLE platform.import_job (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  schema_name text NOT NULL CHECK (schema_name IN ('material_receipt', 'punch')),
  schema_version integer NOT NULL CHECK (schema_version > 0),
  source_system text NOT NULL,
  state text NOT NULL CHECK (state IN ('staged', 'validated', 'invalid', 'committed')),
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  validated_at timestamptz,
  committed_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT import_job_state_consistent CHECK (
    (state = 'staged' AND validated_at IS NULL AND committed_at IS NULL)
    OR (state IN ('validated', 'invalid') AND validated_at IS NOT NULL AND committed_at IS NULL)
    OR (state = 'committed' AND validated_at IS NOT NULL AND committed_at IS NOT NULL)
  )
);

CREATE TABLE platform.import_row (
  import_job_id uuid NOT NULL REFERENCES platform.import_job(id),
  row_number integer NOT NULL CHECK (row_number > 0 AND row_number <= 10000),
  external_id text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  errors jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(errors) = 'array'),
  CONSTRAINT import_row_number_unique PRIMARY KEY (import_job_id, row_number)
);

CREATE INDEX import_row_external_id_lookup
  ON platform.import_row (import_job_id, external_id);

CREATE TABLE platform.external_identifier (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  source_system text NOT NULL,
  external_id text NOT NULL,
  record_type text NOT NULL,
  record_id uuid NOT NULL,
  import_job_id uuid NOT NULL REFERENCES platform.import_job(id),
  created_at timestamptz NOT NULL,
  CONSTRAINT external_identifier_unique UNIQUE (source_system, external_id)
);

CREATE INDEX external_identifier_project_record
  ON platform.external_identifier (project_id, record_type, record_id);

CREATE TABLE platform.imported_record (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  record_type text NOT NULL CHECK (record_type IN ('material_receipt', 'punch')),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  import_job_id uuid NOT NULL REFERENCES platform.import_job(id),
  external_identifier_id uuid NOT NULL UNIQUE REFERENCES platform.external_identifier(id),
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL
);

CREATE TABLE platform.export_job (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  record_class text NOT NULL CHECK (record_class IN ('document', 'material', 'ncr', 'punch', 'imported')),
  record_ids uuid[] NOT NULL CHECK (cardinality(record_ids) > 0),
  format text NOT NULL CHECK (format IN ('csv', 'jsonl')),
  recipient_organization_id uuid NOT NULL REFERENCES party.organization(id),
  state text NOT NULL CHECK (state IN ('queued', 'processing', 'completed', 'failed', 'expired')),
  requested_at timestamptz NOT NULL,
  requested_by uuid NOT NULL,
  correlation_id uuid NOT NULL,
  format_schema_version integer NOT NULL DEFAULT 1 CHECK (format_schema_version = 1),
  result_sha256 text CHECK (result_sha256 IS NULL OR result_sha256 ~ '^[0-9a-f]{64}$'),
  result_manifest jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(result_manifest) = 'array'),
  result_media_type text,
  result_storage_key text UNIQUE,
  result_size_bytes bigint CHECK (result_size_bytes IS NULL OR result_size_bytes >= 0),
  completed_at timestamptz,
  expires_at timestamptz,
  failure_reason text,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT export_job_result_consistent CHECK (
    (state IN ('queued', 'processing')
      AND result_sha256 IS NULL AND result_media_type IS NULL AND result_storage_key IS NULL
      AND result_size_bytes IS NULL AND completed_at IS NULL AND expires_at IS NULL AND failure_reason IS NULL)
    OR (state = 'completed'
      AND result_sha256 IS NOT NULL AND result_media_type IS NOT NULL AND result_storage_key IS NOT NULL
      AND result_size_bytes IS NOT NULL AND completed_at IS NOT NULL AND expires_at > completed_at AND failure_reason IS NULL)
    OR (state = 'failed' AND failure_reason IS NOT NULL)
    OR state = 'expired'
  )
);

CREATE TABLE platform.integration_message (
  id uuid PRIMARY KEY,
  direction text NOT NULL CHECK (direction IN ('inbox', 'outbox')),
  project_id uuid NOT NULL REFERENCES project.project(id),
  interface_code text NOT NULL,
  idempotency_key text NOT NULL,
  external_id text NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version > 0),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  correlation_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('received', 'pending', 'processed', 'retry', 'dead_letter', 'reconciled')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0 AND attempt_count <= 3),
  last_error text,
  created_at timestamptz NOT NULL,
  processed_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT integration_message_idempotency_unique UNIQUE (interface_code, idempotency_key),
  CONSTRAINT integration_message_state_consistent CHECK (
    (state IN ('received', 'pending') AND attempt_count = 0 AND last_error IS NULL AND processed_at IS NULL)
    OR (state = 'retry' AND attempt_count < 3 AND processed_at IS NULL)
    OR (state = 'dead_letter' AND attempt_count = 3 AND last_error IS NOT NULL AND processed_at IS NULL)
    OR (state = 'processed' AND attempt_count > 0 AND last_error IS NULL AND processed_at IS NOT NULL)
    OR state = 'reconciled'
  )
);

CREATE INDEX integration_message_work_queue
  ON platform.integration_message (state, created_at)
  WHERE state IN ('received', 'pending', 'retry');

CREATE TABLE platform.workflow_connectivity_policy (
  operation text PRIMARY KEY,
  classification text NOT NULL CHECK (classification IN ('online_required', 'read_only_cache', 'queued_draft')),
  authoritative_claim_allowed_offline boolean NOT NULL DEFAULT false,
  rationale text NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL,
  CONSTRAINT workflow_connectivity_authority_safe CHECK (
    classification <> 'online_required' OR authoritative_claim_allowed_offline = false
  )
);

INSERT INTO platform.workflow_connectivity_policy (
  operation, classification, authoritative_claim_allowed_offline, rationale, updated_at, updated_by
) VALUES
  ('document.read_assigned', 'read_only_cache', false, 'Only exact assigned revisions may be cached with expiry and an offline warning.', CURRENT_TIMESTAMP, '00000000-0000-0000-0000-000000000000'),
  ('punch.draft.capture', 'queued_draft', false, 'Draft observations require online synchronization before verification or acceptance.', CURRENT_TIMESTAMP, '00000000-0000-0000-0000-000000000000'),
  ('project.activate', 'online_required', false, 'Authoritative state and authorization must be revalidated online.', CURRENT_TIMESTAMP, '00000000-0000-0000-0000-000000000000'),
  ('access.assignment.manage', 'online_required', false, 'Authoritative state and authorization must be revalidated online.', CURRENT_TIMESTAMP, '00000000-0000-0000-0000-000000000000'),
  ('document.current_for_work', 'online_required', false, 'Authoritative state and authorization must be revalidated online.', CURRENT_TIMESTAMP, '00000000-0000-0000-0000-000000000000'),
  ('document.release', 'online_required', false, 'Authoritative state and authorization must be revalidated online.', CURRENT_TIMESTAMP, '00000000-0000-0000-0000-000000000000'),
  ('document.approve', 'online_required', false, 'Authoritative state and authorization must be revalidated online.', CURRENT_TIMESTAMP, '00000000-0000-0000-0000-000000000000'),
  ('inspection.accept', 'online_required', false, 'Authoritative state and authorization must be revalidated online.', CURRENT_TIMESTAMP, '00000000-0000-0000-0000-000000000000'),
  ('material.release', 'online_required', false, 'Authoritative state and authorization must be revalidated online.', CURRENT_TIMESTAMP, '00000000-0000-0000-0000-000000000000'),
  ('material.issue', 'online_required', false, 'Authoritative state and authorization must be revalidated online.', CURRENT_TIMESTAMP, '00000000-0000-0000-0000-000000000000'),
  ('ncr.disposition.approve', 'online_required', false, 'Authoritative state and authorization must be revalidated online.', CURRENT_TIMESTAMP, '00000000-0000-0000-0000-000000000000'),
  ('ncr.close', 'online_required', false, 'Authoritative state and authorization must be revalidated online.', CURRENT_TIMESTAMP, '00000000-0000-0000-0000-000000000000'),
  ('turnover.generate', 'online_required', false, 'Authoritative state and authorization must be revalidated online.', CURRENT_TIMESTAMP, '00000000-0000-0000-0000-000000000000');

CREATE TABLE platform.offline_draft (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  operation text NOT NULL REFERENCES platform.workflow_connectivity_policy(operation),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_key text NOT NULL,
  original_at timestamptz NOT NULL,
  original_by uuid NOT NULL,
  acting_organization_id uuid NOT NULL REFERENCES party.organization(id),
  device_id text NOT NULL,
  synchronized_at timestamptz,
  state text NOT NULL CHECK (state IN ('queued', 'synchronized', 'conflict', 'rejected')),
  conflict_reason text,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT offline_draft_idempotency_unique UNIQUE (project_id, idempotency_key),
  CONSTRAINT offline_draft_state_consistent CHECK (
    (state = 'queued' AND synchronized_at IS NULL AND conflict_reason IS NULL)
    OR (state = 'synchronized' AND synchronized_at IS NOT NULL AND conflict_reason IS NULL)
    OR (state IN ('conflict', 'rejected') AND synchronized_at IS NOT NULL AND conflict_reason IS NOT NULL)
  )
);

CREATE TABLE platform.notification_subscription (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  user_id uuid NOT NULL REFERENCES iam.user_account(id),
  acting_organization_id uuid NOT NULL REFERENCES party.organization(id),
  event_types text[] NOT NULL CHECK (cardinality(event_types) > 0),
  channel text NOT NULL CHECK (channel IN ('in_app', 'email')),
  state text NOT NULL CHECK (state IN ('active', 'revoked')),
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  revoked_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT notification_subscription_unique UNIQUE (project_id, user_id, channel),
  CONSTRAINT notification_subscription_state_consistent CHECK (
    (state = 'active' AND revoked_at IS NULL) OR (state = 'revoked' AND revoked_at IS NOT NULL)
  )
);

CREATE TABLE platform.notification (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(id),
  recipient_user_id uuid NOT NULL REFERENCES iam.user_account(id),
  recipient_organization_id uuid NOT NULL REFERENCES party.organization(id),
  event_type text NOT NULL,
  record_class text NOT NULL CHECK (record_class IN ('document', 'material', 'ncr', 'punch', 'imported')),
  record_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('in_app', 'email')),
  template_code text NOT NULL,
  idempotency_key text NOT NULL,
  correlation_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('queued', 'delivered', 'retry', 'failed', 'suppressed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0 AND attempt_count <= 3),
  last_error text,
  created_at timestamptz NOT NULL,
  delivered_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT notification_idempotency_unique UNIQUE (idempotency_key),
  CONSTRAINT notification_state_consistent CHECK (
    (state = 'queued' AND attempt_count = 0 AND last_error IS NULL AND delivered_at IS NULL)
    OR (state = 'delivered' AND attempt_count > 0 AND last_error IS NULL AND delivered_at IS NOT NULL)
    OR (state = 'retry' AND attempt_count > 0 AND attempt_count < 3 AND last_error IS NOT NULL AND delivered_at IS NULL)
    OR (state = 'failed' AND attempt_count = 3 AND last_error IS NOT NULL AND delivered_at IS NULL)
    OR (state = 'suppressed' AND last_error IS NOT NULL AND delivered_at IS NULL)
  )
);

CREATE INDEX notification_recipient_inbox
  ON platform.notification (project_id, recipient_user_id, created_at DESC)
  WHERE state <> 'suppressed';

INSERT INTO iam.permission (code, description) VALUES
  ('file.validate', 'Validate staged file content, type, integrity, and malware status.'),
  ('file.release', 'Independently release a clean validated file.'),
  ('import.create', 'Stage a project-scoped controlled import.'),
  ('import.validate', 'Validate a staged project import.'),
  ('import.commit', 'Commit an independently validated project import.'),
  ('material.read', 'Read a project-scoped material record.'),
  ('punch.read', 'Read a project-scoped punch record.'),
  ('export.process', 'Process an authorized queued export as a qualified service worker.'),
  ('integration.receive', 'Receive a versioned integration message as a qualified service identity.'),
  ('integration.process', 'Process a queued integration message as a qualified worker.'),
  ('integration.manage', 'Reconcile a dead-lettered integration message.'),
  ('offline.draft.create', 'Queue an approved offline-capable draft operation.'),
  ('offline.draft.sync', 'Synchronize and reconcile an offline draft against authoritative state.'),
  ('notification.subscription.manage', 'Manage the current user notification subscription for an assigned project.'),
  ('notification.dispatch', 'Create scope-filtered notification jobs as a qualified notification worker.'),
  ('notification.deliver', 'Deliver or retry a queued notification after recipient reauthorization.');
