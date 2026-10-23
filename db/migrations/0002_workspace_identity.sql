CREATE TABLE workspaces (
 id text PRIMARY KEY,
 name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE users (
 id text PRIMARY KEY,
 email text NOT NULL UNIQUE CHECK (email = lower(email)),
 name text NOT NULL,
 password_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE workspace_memberships (
 workspace_id text NOT NULL REFERENCES workspaces(id),
 user_id text NOT NULL REFERENCES users(id),
 role text NOT NULL CHECK (role IN ('owner','editor','viewer')),
 PRIMARY KEY (workspace_id,user_id)
);
CREATE TABLE sessions (
 token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
 workspace_id text NOT NULL,
 user_id text NOT NULL,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (workspace_id,user_id) REFERENCES workspace_memberships(workspace_id,user_id) ON DELETE CASCADE
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE workspace_settings (
 workspace_id text PRIMARY KEY REFERENCES workspaces(id),
 repository text NOT NULL DEFAULT '',
 staging_url text NOT NULL DEFAULT '',
 test_tenant text NOT NULL DEFAULT '',
 runbook_ref text NOT NULL DEFAULT '',
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text REFERENCES users(id)
);
-- Existing data is deliberately quarantined in an unclaimed workspace. Provisioning
-- a new account never grants access to these records implicitly.
INSERT INTO workspaces(id,name) VALUES ('sample-workspace','Legacy sample workspace');
ALTER TABLE evidence_runs ADD COLUMN workspace_id text REFERENCES workspaces(id);
UPDATE evidence_runs SET workspace_id='sample-workspace';
ALTER TABLE evidence_runs ALTER COLUMN workspace_id SET NOT NULL;
CREATE INDEX evidence_runs_workspace_recent ON evidence_runs(workspace_id,created_at DESC,id DESC);
