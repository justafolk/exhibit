CREATE TABLE flow_definitions (
 id text PRIMARY KEY,
 workspace_id text NOT NULL REFERENCES workspaces(id),
 name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
 description text NOT NULL DEFAULT '',
 preconditions jsonb NOT NULL CHECK (jsonb_typeof(preconditions)='array'),
 assertions jsonb NOT NULL CHECK (jsonb_typeof(assertions)='array'),
 cleanup text NOT NULL,
 runbook_ref text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text NOT NULL REFERENCES users(id)
);
CREATE INDEX flow_definitions_workspace_recent ON flow_definitions(workspace_id,updated_at DESC,id DESC);
CREATE TABLE contract_drafts (
 workspace_id text PRIMARY KEY REFERENCES workspaces(id),
 contract jsonb NOT NULL CHECK (jsonb_typeof(contract)='object'),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text NOT NULL REFERENCES users(id)
);
-- The journal records authorship, not run approval or verification. Avoid raw
-- configuration content in audit rows; actor/object/time are sufficient here.
CREATE TABLE configuration_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace_id text NOT NULL REFERENCES workspaces(id),
 actor_id text NOT NULL REFERENCES users(id),
 action text NOT NULL,
 object_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX configuration_events_workspace_recent ON configuration_events(workspace_id,created_at DESC,id DESC);
