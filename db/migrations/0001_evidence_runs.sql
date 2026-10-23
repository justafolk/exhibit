CREATE TABLE evidence_runs (
    id text PRIMARY KEY,
    repository text NOT NULL,
    pull_request integer NOT NULL CHECK (pull_request > 0),
    title text NOT NULL,
    head_sha text NOT NULL CHECK (head_sha ~ '^[0-9a-f]{40}$'),
    status text NOT NULL CHECK (status IN ('queued', 'running', 'verified', 'partial', 'failed', 'couldnt_run')),
    sample boolean NOT NULL DEFAULT false,
    environment text NOT NULL CHECK (environment = 'staging'),
    created_at timestamptz NOT NULL DEFAULT now(),
    duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
    flows jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(flows) = 'array'),
    assertions jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(assertions) = 'array'),
    not_covered jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(not_covered) = 'array')
);
CREATE INDEX evidence_runs_recent ON evidence_runs (created_at DESC, id DESC);
CREATE INDEX evidence_runs_pr ON evidence_runs (repository, pull_request, head_sha);

-- Metadata only. Private object storage holds blobs; never put video bytes in Postgres.
CREATE TABLE evidence_artifacts (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_id text NOT NULL REFERENCES evidence_runs(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('video', 'trace', 'screenshot', 'api', 'database', 'log')),
    object_key text NOT NULL UNIQUE,
    sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    redaction_status text NOT NULL CHECK (redaction_status IN ('pending', 'approved', 'rejected')),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX evidence_artifacts_expiry ON evidence_artifacts (expires_at);
