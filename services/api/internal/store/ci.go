package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/justafolk/exhibit/services/api/internal/auth"
	"github.com/justafolk/exhibit/services/api/internal/evidence"
)

var ErrConflict = errors.New("this run attempt already has a different submission")
var ErrIncomplete = errors.New("files are still missing")

type IngestionToken struct {
	ID         string     `json:"id"`
	Repository string     `json:"repository"`
	CreatedAt  time.Time  `json:"createdAt"`
	ExpiresAt  time.Time  `json:"expiresAt"`
	RevokedAt  *time.Time `json:"revokedAt"`
}
type IngestionScope struct{ WorkspaceID, Repository string }
type CIInfo struct {
	WorkflowRunID int64  `json:"workflowRunId"`
	Attempt       int    `json:"attempt"`
	URL           string `json:"url"`
	Complete      bool   `json:"complete"`
}
type CIRecord struct {
	RunID      string                `json:"runId"`
	Complete   bool                  `json:"complete"`
	Submission evidence.CISubmission `json:"submission"`
}
type SavedCIFile struct {
	evidence.CIFile
	RunID       string    `json:"runId"`
	Repository  string    `json:"repository"`
	PullRequest int       `json:"pullRequest"`
	CreatedAt   time.Time `json:"createdAt"`
	ObjectKey   string    `json:"-"`
}

func (p Postgres) CreateIngestionToken(ctx context.Context, repository string) (IngestionToken, string, error) {
	token := auth.Token()
	t := IngestionToken{ID: auth.Token(), Repository: repository}
	err := p.Pool.QueryRow(ctx, `INSERT INTO ingestion_tokens(id,workspace_id,repository,token_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '90 days') RETURNING created_at,expires_at`, t.ID, WorkspaceID(ctx), repository, auth.Digest(token)).Scan(&t.CreatedAt, &t.ExpiresAt)
	return t, token, err
}
func (p Postgres) IngestionTokens(ctx context.Context) ([]IngestionToken, error) {
	rows, err := p.Pool.Query(ctx, `SELECT id,repository,created_at,expires_at,revoked_at FROM ingestion_tokens WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100`, WorkspaceID(ctx))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []IngestionToken{}
	for rows.Next() {
		var t IngestionToken
		if err := rows.Scan(&t.ID, &t.Repository, &t.CreatedAt, &t.ExpiresAt, &t.RevokedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}
func (p Postgres) RevokeIngestionToken(ctx context.Context, id string) error {
	result, err := p.Pool.Exec(ctx, `UPDATE ingestion_tokens SET revoked_at=coalesce(revoked_at,now()) WHERE workspace_id=$1 AND id=$2`, WorkspaceID(ctx), id)
	if err == nil && result.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}
func (p Postgres) IngestionScope(ctx context.Context, token string) (IngestionScope, error) {
	var scope IngestionScope
	err := p.Pool.QueryRow(ctx, `SELECT workspace_id,repository FROM ingestion_tokens WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()`, auth.Digest(token)).Scan(&scope.WorkspaceID, &scope.Repository)
	if errors.Is(err, pgx.ErrNoRows) {
		err = ErrForbidden
	}
	return scope, err
}
func (p Postgres) BeginCI(ctx context.Context, c evidence.CISubmission, fingerprint string) (CIRecord, error) {
	tx, err := p.Pool.Begin(ctx)
	if err != nil {
		return CIRecord{}, err
	}
	defer tx.Rollback(ctx)
	// Serialize attempt creation, including retries from different ingestion tokens.
	_, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, fmt.Sprintf("%s:%s:%d:%d", WorkspaceID(ctx), c.Repository, c.WorkflowRunID, c.Attempt))
	if err != nil {
		return CIRecord{}, err
	}
	var id, old string
	err = tx.QueryRow(ctx, `SELECT run_id,fingerprint FROM ci_submissions WHERE workspace_id=$1 AND repository=$2 AND workflow_run_id=$3 AND attempt=$4`, WorkspaceID(ctx), c.Repository, c.WorkflowRunID, c.Attempt).Scan(&id, &old)
	if err == nil {
		if old != fingerprint {
			return CIRecord{}, ErrConflict
		}
		if err = tx.Commit(ctx); err != nil {
			return CIRecord{}, err
		}
		return p.CI(ctx, id)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return CIRecord{}, err
	}
	id = "ci-" + auth.Token()
	ci := CIInfo{WorkflowRunID: c.WorkflowRunID, Attempt: c.Attempt, URL: fmt.Sprintf("https://github.com/%s/actions/runs/%d/attempts/%d", c.Repository, c.WorkflowRunID, c.Attempt)}
	assertions := []Assertion{}
	for _, a := range c.Assertions {
		assertions = append(assertions, Assertion{Label: a.Label, Passed: a.Status == "passed", Status: a.Status})
	}
	_, err = tx.Exec(ctx, `INSERT INTO evidence_runs(id,workspace_id,repository,pull_request,title,head_sha,status,sample,environment,created_at,duration_seconds,flows,assertions,not_covered,ci) VALUES($1,$2,$3,$4,$5,$6,'running',false,'ci',$7,$8,'["github-actions"]',$9,$10,$11)`, id, WorkspaceID(ctx), c.Repository, c.PullRequest, c.Title, c.HeadSHA, c.StartedAt, c.DurationSeconds, assertions, c.NotCovered, ci)
	if err != nil {
		return CIRecord{}, err
	}
	raw, _ := json.Marshal(c)
	_, err = tx.Exec(ctx, `INSERT INTO ci_submissions(run_id,workspace_id,repository,workflow_run_id,attempt,fingerprint,payload) VALUES($1,$2,$3,$4,$5,$6,$7)`, id, WorkspaceID(ctx), c.Repository, c.WorkflowRunID, c.Attempt, fingerprint, raw)
	if err != nil {
		return CIRecord{}, err
	}
	for _, f := range c.Files {
		fid := auth.Token()
		_, err = tx.Exec(ctx, `INSERT INTO ci_files(id,run_id,path,media_type,bytes,sha256,object_key) VALUES($1,$2,$3,$4,$5,$6,$7)`, fid, id, f.Path, f.MediaType, f.Bytes, f.SHA256, id+"/"+fid)
		if err != nil {
			return CIRecord{}, err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return CIRecord{}, err
	}
	return p.CI(ctx, id)
}
func (p Postgres) CI(ctx context.Context, id string) (CIRecord, error) {
	result := CIRecord{RunID: id}
	var raw []byte
	err := p.Pool.QueryRow(ctx, `SELECT payload,completed_at IS NOT NULL FROM ci_submissions WHERE run_id=$1 AND workspace_id=$2`, id, WorkspaceID(ctx)).Scan(&raw, &result.Complete)
	if errors.Is(err, pgx.ErrNoRows) {
		return result, ErrNotFound
	}
	if err != nil {
		return result, err
	}
	if err = json.Unmarshal(raw, &result.Submission); err != nil {
		return result, err
	}
	files, err := p.CIFiles(ctx, id, false)
	if err != nil {
		return result, err
	}
	result.Submission.Files = []evidence.CIFile{}
	for _, f := range files {
		result.Submission.Files = append(result.Submission.Files, f.CIFile)
	}
	return result, nil
}
func (p Postgres) CIFiles(ctx context.Context, runID string, videosOnly bool) ([]SavedCIFile, error) {
	rows, err := p.Pool.Query(ctx, `SELECT f.id,f.run_id,f.path,f.media_type,f.bytes,f.sha256,f.uploaded_at IS NOT NULL,f.object_key,r.repository,r.pull_request,r.created_at FROM ci_files f JOIN evidence_runs r ON r.id=f.run_id WHERE r.workspace_id=$1 AND ($2='' OR r.id=$2) AND (NOT $3 OR (f.media_type LIKE 'video/%' AND f.uploaded_at IS NOT NULL AND (r.ci->>'complete')::boolean)) ORDER BY r.created_at DESC,f.path LIMIT 500`, WorkspaceID(ctx), runID, videosOnly)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []SavedCIFile{}
	for rows.Next() {
		var f SavedCIFile
		if err := rows.Scan(&f.ID, &f.RunID, &f.Path, &f.MediaType, &f.Bytes, &f.SHA256, &f.Uploaded, &f.ObjectKey, &f.Repository, &f.PullRequest, &f.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}
func (p Postgres) CIFile(ctx context.Context, runID, id string) (SavedCIFile, error) {
	var f SavedCIFile
	err := p.Pool.QueryRow(ctx, `SELECT f.id,f.run_id,f.path,f.media_type,f.bytes,f.sha256,f.uploaded_at IS NOT NULL,f.object_key FROM ci_files f JOIN evidence_runs r ON r.id=f.run_id WHERE r.workspace_id=$1 AND r.id=$2 AND f.id=$3`, WorkspaceID(ctx), runID, id).Scan(&f.ID, &f.RunID, &f.Path, &f.MediaType, &f.Bytes, &f.SHA256, &f.Uploaded, &f.ObjectKey)
	if errors.Is(err, pgx.ErrNoRows) {
		err = ErrNotFound
	}
	return f, err
}
func (p Postgres) MarkCIFile(ctx context.Context, runID, id string) error {
	_, err := p.Pool.Exec(ctx, `UPDATE ci_files SET uploaded_at=now() WHERE id=$1 AND run_id=$2 AND EXISTS(SELECT 1 FROM ci_submissions WHERE run_id=$2 AND workspace_id=$3)`, id, runID, WorkspaceID(ctx))
	return err
}
func (p Postgres) CompleteCI(ctx context.Context, id string) (CIRecord, error) {
	tx, err := p.Pool.Begin(ctx)
	if err != nil {
		return CIRecord{}, err
	}
	defer tx.Rollback(ctx)
	var outcome string
	err = tx.QueryRow(ctx, `SELECT payload->>'outcome' FROM ci_submissions WHERE run_id=$1 AND workspace_id=$2 FOR UPDATE`, id, WorkspaceID(ctx)).Scan(&outcome)
	if errors.Is(err, pgx.ErrNoRows) {
		return CIRecord{}, ErrNotFound
	}
	if err != nil {
		return CIRecord{}, err
	}
	var missing bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM ci_files WHERE run_id=$1 AND uploaded_at IS NULL)`, id).Scan(&missing); err != nil {
		return CIRecord{}, err
	}
	if missing {
		return CIRecord{}, ErrIncomplete
	}
	status := "unverified"
	var failed, skipped bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM ci_submissions,jsonb_array_elements(payload->'assertions') a WHERE run_id=$1 AND a->>'status'='failed'),EXISTS(SELECT 1 FROM ci_submissions,jsonb_array_elements(payload->'assertions') a WHERE run_id=$1 AND a->>'status'='skipped')`, id).Scan(&failed, &skipped); err != nil {
		return CIRecord{}, err
	}
	if skipped {
		status = "partial"
	}
	if failed {
		status = "failed"
	}
	switch outcome {
	case "failure":
		status = "failed"
	case "cancelled", "skipped":
		status = "couldnt_run"
	}
	_, err = tx.Exec(ctx, `UPDATE ci_submissions SET completed_at=coalesce(completed_at,now()) WHERE run_id=$1;`, id)
	if err != nil {
		return CIRecord{}, err
	}
	_, err = tx.Exec(ctx, `UPDATE evidence_runs SET status=$2,ci=jsonb_set(ci,'{complete}','true') WHERE id=$1`, id, status)
	if err != nil {
		return CIRecord{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return CIRecord{}, err
	}
	return p.CI(ctx, id)
}
