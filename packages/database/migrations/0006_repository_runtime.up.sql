CREATE TABLE platform.application_state (
  state_key text PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT application_state_singleton CHECK (state_key = 'foundation'),
  CONSTRAINT application_state_wire_payload CHECK (
    payload->>'type' = 'object' AND jsonb_typeof(payload->'value') = 'object'
  )
);

INSERT INTO platform.application_state (state_key, payload)
VALUES ('foundation', '{"type":"object","value":{}}'::jsonb);

REVOKE UPDATE, DELETE ON platform.application_state FROM PUBLIC;
