package store

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/justafolk/exhibit/services/api/internal/auth"
	"github.com/justafolk/exhibit/services/api/internal/evidence"
)

const flowColumns = `id,name,description,preconditions,assertions,cleanup,runbook_ref,updated_at,updated_by`

func scanFlow(row pgx.Row) (Flow, error) {
	var f Flow
	err := row.Scan(&f.ID, &f.Name, &f.Description, &f.Preconditions, &f.Assertions, &f.Cleanup, &f.RunbookRef, &f.UpdatedAt, &f.UpdatedBy)
	if errors.Is(err, pgx.ErrNoRows) {
		return f, ErrNotFound
	}
	return f, err
}
func (p Postgres) ListFlows(ctx context.Context, workspace string) ([]Flow, error) {
	if workspace == "" {
		return nil, ErrForbidden
	}
	rows, err := p.Pool.Query(ctx, `SELECT `+flowColumns+` FROM flow_definitions WHERE workspace_id=$1 ORDER BY updated_at DESC,id DESC LIMIT 100`, workspace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	flows := []Flow{}
	for rows.Next() {
		flow, err := scanFlow(rows)
		if err != nil {
			return nil, err
		}
		flows = append(flows, flow)
	}
	return flows, rows.Err()
}
func (p Postgres) GetFlow(ctx context.Context, workspace, id string) (Flow, error) {
	if workspace == "" {
		return Flow{}, ErrForbidden
	}
	return scanFlow(p.Pool.QueryRow(ctx, `SELECT `+flowColumns+` FROM flow_definitions WHERE workspace_id=$1 AND id=$2`, workspace, id))
}
func (p Postgres) CreateFlow(ctx context.Context, workspace, actor string, input evidence.FlowInput) (Flow, error) {
	if workspace == "" {
		return Flow{}, ErrForbidden
	}
	tx, err := p.Pool.Begin(ctx)
	if err != nil {
		return Flow{}, err
	}
	defer tx.Rollback(ctx)
	// Serialize per-workspace capacity checks; concurrent editors cannot exceed the bound.
	if _, err = tx.Exec(ctx, `SELECT id FROM workspaces WHERE id=$1 FOR UPDATE`, workspace); err != nil {
		return Flow{}, err
	}
	var count int
	if err = tx.QueryRow(ctx, `SELECT count(*) FROM flow_definitions WHERE workspace_id=$1`, workspace).Scan(&count); err != nil {
		return Flow{}, err
	}
	if count >= 100 {
		return Flow{}, ErrCapacity
	}
	flow, err := scanFlow(tx.QueryRow(ctx, `INSERT INTO flow_definitions(id,workspace_id,name,description,preconditions,assertions,cleanup,runbook_ref,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING `+flowColumns, "flow-"+auth.Token(), workspace, input.Name, input.Description, input.Preconditions, input.Assertions, input.Cleanup, input.RunbookRef, actor))
	if err != nil {
		return Flow{}, err
	}
	if err = configurationEvent(ctx, tx, workspace, actor, "flow.created", flow.ID); err != nil {
		return Flow{}, err
	}
	return flow, tx.Commit(ctx)
}
func (p Postgres) UpdateFlow(ctx context.Context, workspace, actor, id string, input evidence.FlowInput) (Flow, error) {
	if workspace == "" {
		return Flow{}, ErrForbidden
	}
	tx, err := p.Pool.Begin(ctx)
	if err != nil {
		return Flow{}, err
	}
	defer tx.Rollback(ctx)
	flow, err := scanFlow(tx.QueryRow(ctx, `UPDATE flow_definitions SET name=$3,description=$4,preconditions=$5,assertions=$6,cleanup=$7,runbook_ref=$8,updated_by=$9,updated_at=now() WHERE workspace_id=$1 AND id=$2 RETURNING `+flowColumns, workspace, id, input.Name, input.Description, input.Preconditions, input.Assertions, input.Cleanup, input.RunbookRef, actor))
	if err != nil {
		return Flow{}, err
	}
	if err = configurationEvent(ctx, tx, workspace, actor, "flow.updated", id); err != nil {
		return Flow{}, err
	}
	return flow, tx.Commit(ctx)
}
func (p Postgres) Draft(ctx context.Context, workspace string) (evidence.Contract, error) {
	draft := evidence.Contract{FlowIDs: []string{}}
	if workspace == "" {
		return draft, ErrForbidden
	}
	var raw []byte
	err := p.Pool.QueryRow(ctx, `SELECT contract FROM contract_drafts WHERE workspace_id=$1`, workspace).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return draft, nil
	}
	if err != nil {
		return draft, err
	}
	err = json.Unmarshal(raw, &draft)
	if draft.FlowIDs == nil {
		draft.FlowIDs = []string{}
	}
	return draft, err
}
func (p Postgres) SaveDraft(ctx context.Context, workspace, actor string, draft evidence.Contract) error {
	if workspace == "" {
		return ErrForbidden
	}
	tx, err := p.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	raw, err := json.Marshal(draft)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO contract_drafts(workspace_id,contract,updated_by) VALUES($1,$2,$3) ON CONFLICT(workspace_id) DO UPDATE SET contract=EXCLUDED.contract,updated_by=EXCLUDED.updated_by,updated_at=now()`, workspace, raw, actor)
	if err != nil {
		return err
	}
	if err = configurationEvent(ctx, tx, workspace, actor, "contract.saved", workspace); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
func configurationEvent(ctx context.Context, tx pgx.Tx, workspace, actor, action, object string) error {
	_, err := tx.Exec(ctx, `INSERT INTO configuration_events(workspace_id,actor_id,action,object_id) VALUES($1,$2,$3,$4)`, workspace, actor, action, object)
	return err
}
