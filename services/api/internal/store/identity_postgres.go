package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

func (p Postgres) Account(ctx context.Context, email string) (Account, error) {
	var a Account
	// Initial private provisioning grants one workspace. When multiple memberships
	// exist, select deterministically; workspace switching is not an implemented API.
	err := p.Pool.QueryRow(ctx, `SELECT u.id,u.email,u.name,u.password_hash,w.id,w.name,m.role FROM users u JOIN workspace_memberships m ON m.user_id=u.id JOIN workspaces w ON w.id=m.workspace_id WHERE u.email=$1 ORDER BY w.created_at,w.id LIMIT 1`, email).Scan(&a.User.ID, &a.User.Email, &a.User.Name, &a.PasswordHash, &a.Workspace.ID, &a.Workspace.Name, &a.Workspace.Role)
	if errors.Is(err, pgx.ErrNoRows) {
		return a, ErrUnauthorized
	}
	return a, err
}
func (p Postgres) SaveSession(ctx context.Context, hash string, id Identity, expires time.Time) error {
	_, err := p.Pool.Exec(ctx, `INSERT INTO sessions(token_hash,user_id,workspace_id,expires_at) VALUES ($1,$2,$3,$4)`, hash, id.User.ID, id.Workspace.ID, expires)
	return err
}
func (p Postgres) Session(ctx context.Context, hash string) (Identity, error) {
	var id Identity
	err := p.Pool.QueryRow(ctx, `SELECT u.id,u.email,u.name,w.id,w.name,m.role FROM sessions s JOIN users u ON u.id=s.user_id JOIN workspace_memberships m ON m.user_id=s.user_id AND m.workspace_id=s.workspace_id JOIN workspaces w ON w.id=m.workspace_id WHERE s.token_hash=$1 AND s.expires_at>now()`, hash).Scan(&id.User.ID, &id.User.Email, &id.User.Name, &id.Workspace.ID, &id.Workspace.Name, &id.Workspace.Role)
	if errors.Is(err, pgx.ErrNoRows) {
		return id, ErrUnauthorized
	}
	return id, err
}
func (p Postgres) RevokeSession(ctx context.Context, hash string) error {
	_, err := p.Pool.Exec(ctx, `DELETE FROM sessions WHERE token_hash=$1`, hash)
	return err
}
func (p Postgres) Setup(ctx context.Context, id string) (Setup, error) {
	var setup Setup
	err := p.Pool.QueryRow(ctx, `SELECT repository,staging_url,test_tenant,runbook_ref FROM workspace_settings WHERE workspace_id=$1`, id).Scan(&setup.Repository, &setup.StagingURL, &setup.TestTenant, &setup.RunbookRef)
	if errors.Is(err, pgx.ErrNoRows) {
		return setup, nil
	}
	return setup, err
}
func (p Postgres) SaveSetup(ctx context.Context, id, actor string, s Setup) error {
	_, err := p.Pool.Exec(ctx, `INSERT INTO workspace_settings(workspace_id,repository,staging_url,test_tenant,runbook_ref,updated_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(workspace_id) DO UPDATE SET repository=EXCLUDED.repository,staging_url=EXCLUDED.staging_url,test_tenant=EXCLUDED.test_tenant,runbook_ref=EXCLUDED.runbook_ref,updated_at=now(),updated_by=EXCLUDED.updated_by`, id, s.Repository, s.StagingURL, s.TestTenant, s.RunbookRef, actor)
	return err
}
func (p Postgres) RenameWorkspace(ctx context.Context, id, name string) error {
	_, err := p.Pool.Exec(ctx, `UPDATE workspaces SET name=$2 WHERE id=$1`, id, name)
	return err
}

// Bootstrap creates a new owner and workspace atomically, never adopts legacy data
// or modifies an existing user's password/role. Call only through a trusted operator.
func (p Postgres) Bootstrap(ctx context.Context, a Account) error {
	tx, err := p.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `INSERT INTO workspaces(id,name) VALUES($1,$2)`, a.Workspace.ID, a.Workspace.Name); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)`, a.User.ID, a.User.Email, a.User.Name, a.PasswordHash); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')`, a.Workspace.ID, a.User.ID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
