-- CI submissions remain unverified: a repository token is not a trusted verifier.
ALTER TABLE evidence_runs DROP CONSTRAINT evidence_runs_status_check;
ALTER TABLE evidence_runs ADD CHECK (status IN ('queued','running','verified','partial','failed','couldnt_run','unverified'));
ALTER TABLE evidence_runs DROP CONSTRAINT evidence_runs_environment_check;
ALTER TABLE evidence_runs ADD CHECK (environment IN ('staging','ci'));
ALTER TABLE evidence_runs ADD COLUMN ci jsonb;
CREATE TABLE ingestion_tokens (
 id text PRIMARY KEY,
 workspace_id text NOT NULL REFERENCES workspaces(id),
 repository text NOT NULL,
 token_hash text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz
);
CREATE INDEX ingestion_tokens_workspace ON ingestion_tokens(workspace_id,created_at DESC);
CREATE TABLE ci_submissions (
 run_id text PRIMARY KEY REFERENCES evidence_runs(id) ON DELETE CASCADE,
 workspace_id text NOT NULL REFERENCES workspaces(id),
 repository text NOT NULL,
 workflow_run_id bigint NOT NULL CHECK(workflow_run_id > 0),
 attempt integer NOT NULL CHECK(attempt > 0),
 fingerprint text NOT NULL,
 payload jsonb NOT NULL,
 completed_at timestamptz,
 UNIQUE(workspace_id,repository,workflow_run_id,attempt),
 FOREIGN KEY(workspace_id,run_id) REFERENCES evidence_runs(workspace_id,id)
);
CREATE TABLE ci_files (
 id text PRIMARY KEY,
 run_id text NOT NULL REFERENCES ci_submissions(run_id) ON DELETE CASCADE,
 path text NOT NULL,
 media_type text NOT NULL,
 bytes bigint NOT NULL CHECK(bytes > 0 AND bytes <= 134217728),
 sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
 object_key text NOT NULL UNIQUE,
 uploaded_at timestamptz,
 UNIQUE(run_id,path)
);
CREATE INDEX ci_files_run ON ci_files(run_id);
