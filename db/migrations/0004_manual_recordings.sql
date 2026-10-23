-- Metadata only: no upload path, object key, media bytes, trusted-origin claim or verdict.
ALTER TABLE evidence_runs ADD CONSTRAINT evidence_runs_workspace_id_unique UNIQUE(workspace_id,id);
CREATE TABLE manual_recordings (
 id text PRIMARY KEY,
 workspace_id text NOT NULL REFERENCES workspaces(id),
 name text NOT NULL,
 file_name text NOT NULL,
 sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
 byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 134217728),
 media_type text NOT NULL CHECK (media_type IN ('video/webm','video/mp4')),
 duration_seconds double precision NOT NULL CHECK (duration_seconds>0 AND duration_seconds<=3600),
 run_id text,
 chapters jsonb NOT NULL CHECK (jsonb_typeof(chapters)='array'),
 presentation jsonb NOT NULL CHECK (jsonb_typeof(presentation)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by text NOT NULL REFERENCES users(id),
 FOREIGN KEY (workspace_id,run_id) REFERENCES evidence_runs(workspace_id,id)
);
CREATE INDEX manual_recordings_workspace_recent ON manual_recordings(workspace_id,created_at DESC,id DESC);
