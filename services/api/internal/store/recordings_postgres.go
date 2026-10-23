package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/justafolk/exhibit/services/api/internal/auth"
	"github.com/justafolk/exhibit/services/api/internal/evidence"
)

const recordingColumns = `id,name,file_name,sha256,byte_size,media_type,duration_seconds,coalesce(run_id,''),chapters,presentation,created_at,created_by`

func scanRecording(row pgx.Row) (Recording, error) {
	var record Recording
	err := row.Scan(&record.ID, &record.Name, &record.FileName, &record.SHA256, &record.Bytes, &record.MediaType, &record.DurationSeconds, &record.RunID, &record.Chapters, &record.Presentation, &record.CreatedAt, &record.CreatedBy)
	record.Origin = "manual"
	record.Verification = "unverified"
	record.MediaStored = false
	if errors.Is(err, pgx.ErrNoRows) {
		return record, ErrNotFound
	}
	return record, err
}
func (p Postgres) Recordings(ctx context.Context, workspace string) ([]Recording, error) {
	if workspace == "" {
		return nil, ErrForbidden
	}
	rows, err := p.Pool.Query(ctx, `SELECT `+recordingColumns+` FROM manual_recordings WHERE workspace_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100`, workspace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := []Recording{}
	for rows.Next() {
		record, err := scanRecording(rows)
		if err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	return records, rows.Err()
}
func (p Postgres) Recording(ctx context.Context, workspace, id string) (Recording, error) {
	if workspace == "" {
		return Recording{}, ErrForbidden
	}
	return scanRecording(p.Pool.QueryRow(ctx, `SELECT `+recordingColumns+` FROM manual_recordings WHERE workspace_id=$1 AND id=$2`, workspace, id))
}
func (p Postgres) CreateRecording(ctx context.Context, workspace, actor string, input evidence.RecordingInput) (Recording, error) {
	if workspace == "" {
		return Recording{}, ErrForbidden
	}
	tx, err := p.Pool.Begin(ctx)
	if err != nil {
		return Recording{}, err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `SELECT id FROM workspaces WHERE id=$1 FOR UPDATE`, workspace); err != nil {
		return Recording{}, err
	}
	var count int
	if err = tx.QueryRow(ctx, `SELECT count(*) FROM manual_recordings WHERE workspace_id=$1`, workspace).Scan(&count); err != nil {
		return Recording{}, err
	}
	if count >= 100 {
		return Recording{}, ErrRecordingCapacity
	}
	if input.RunID != "" {
		var id string
		err = tx.QueryRow(ctx, `SELECT id FROM evidence_runs WHERE workspace_id=$1 AND id=$2 FOR KEY SHARE`, workspace, input.RunID).Scan(&id)
		if errors.Is(err, pgx.ErrNoRows) {
			return Recording{}, ErrRelatedRun
		}
		if err != nil {
			return Recording{}, err
		}
	}
	record, err := scanRecording(tx.QueryRow(ctx, `INSERT INTO manual_recordings(id,workspace_id,name,file_name,sha256,byte_size,media_type,duration_seconds,run_id,chapters,presentation,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,NULLIF($9,''),$10,$11,$12) RETURNING `+recordingColumns, "recording-"+auth.Token(), workspace, input.Name, input.FileName, input.SHA256, input.Bytes, input.MediaType, input.DurationSeconds, input.RunID, input.Chapters, input.Presentation, actor))
	if err != nil {
		return Recording{}, err
	}
	if err = configurationEvent(ctx, tx, workspace, actor, "recording.created", record.ID); err != nil {
		return Recording{}, err
	}
	return record, tx.Commit(ctx)
}
func (p Postgres) Activity(ctx context.Context, workspace string) ([]Activity, error) {
	if workspace == "" {
		return nil, ErrForbidden
	}
	rows, err := p.Pool.Query(ctx, `SELECT id::text,action,object_id,actor_id,created_at FROM configuration_events WHERE workspace_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50`, workspace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	events := []Activity{}
	for rows.Next() {
		var event Activity
		if err := rows.Scan(&event.ID, &event.Action, &event.ObjectID, &event.ActorID, &event.CreatedAt); err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	return events, rows.Err()
}
