package store

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("run not found")

type Assertion struct {
	Label  string `json:"label"`
	Passed bool   `json:"passed"`
}
type Run struct {
	ID              string      `json:"id"`
	Repository      string      `json:"repository"`
	PullRequest     int         `json:"pullRequest"`
	Title           string      `json:"title"`
	HeadSHA         string      `json:"headSha"`
	Status          string      `json:"status"`
	Sample          bool        `json:"sample"`
	Environment     string      `json:"environment"`
	CreatedAt       time.Time   `json:"createdAt"`
	DurationSeconds int         `json:"durationSeconds"`
	Flows           []string    `json:"flows"`
	Assertions      []Assertion `json:"assertions"`
	NotCovered      []string    `json:"notCovered"`
}
type RunFilter struct {
	Query  string
	Status string
}

type Store interface {
	List(context.Context, RunFilter) ([]Run, error)
	Get(context.Context, string) (Run, error)
	Ping(context.Context) error
	Mode() string
}

//go:embed demo.json
var demoJSON []byte

func Samples() []Run {
	var runs []Run
	if err := json.Unmarshal(demoJSON, &runs); err != nil {
		panic(err)
	}
	return runs
}

type Demo struct{}

func (Demo) Mode() string               { return "demo" }
func (Demo) Ping(context.Context) error { return nil }
func (Demo) List(_ context.Context, filter RunFilter) ([]Run, error) {
	runs := []Run{}
	for _, run := range Samples() {
		haystack := strings.ToLower(strings.Join([]string{run.Title, run.Repository, strconv.Itoa(run.PullRequest), run.ID, run.HeadSHA}, " "))
		if (filter.Status == "" || filter.Status == run.Status) && strings.Contains(haystack, strings.ToLower(filter.Query)) {
			runs = append(runs, run)
		}
	}
	slices.SortFunc(runs, func(a, b Run) int {
		if order := b.CreatedAt.Compare(a.CreatedAt); order != 0 {
			return order
		}
		return strings.Compare(b.ID, a.ID)
	})
	return runs[:min(100, len(runs))], nil
}
func (Demo) Get(_ context.Context, id string) (Run, error) {
	for _, r := range Samples() {
		if r.ID == id {
			return r, nil
		}
	}
	return Run{}, ErrNotFound
}

type Postgres struct{ Pool *pgxpool.Pool }

func (Postgres) Mode() string { return "postgres" }
func (p Postgres) Ping(ctx context.Context) error {
	if err := p.Pool.Ping(ctx); err != nil {
		return err
	}
	// Ready means migrations exist too, not merely an open TCP socket.
	_, err := p.Pool.Exec(ctx, "SELECT r.workspace_id, s.token_hash FROM evidence_runs r CROSS JOIN sessions s LIMIT 0")
	return err
}

const columns = `id, repository, pull_request, title, head_sha, status, sample, environment, created_at, duration_seconds, flows, assertions, not_covered`

func scan(row pgx.Row) (Run, error) {
	var r Run
	err := row.Scan(&r.ID, &r.Repository, &r.PullRequest, &r.Title, &r.HeadSHA, &r.Status, &r.Sample, &r.Environment, &r.CreatedAt, &r.DurationSeconds, &r.Flows, &r.Assertions, &r.NotCovered)
	if errors.Is(err, pgx.ErrNoRows) {
		return r, ErrNotFound
	}
	return r, err
}
func (p Postgres) List(ctx context.Context, filter RunFilter) ([]Run, error) {
	if WorkspaceID(ctx) == "" {
		return nil, ErrForbidden
	}
	rows, err := p.Pool.Query(ctx, "SELECT "+columns+` FROM evidence_runs WHERE workspace_id=$1 AND ($2='' OR status=$2) AND ($3='' OR strpos(lower(title || ' ' || repository || ' ' || pull_request::text || ' ' || id || ' ' || head_sha),lower($3))>0) ORDER BY created_at DESC, id DESC LIMIT 100`, WorkspaceID(ctx), filter.Status, filter.Query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	runs := []Run{}
	for rows.Next() {
		r, err := scan(rows)
		if err != nil {
			return nil, err
		}
		runs = append(runs, r)
	}
	return runs, rows.Err()
}
func (p Postgres) Get(ctx context.Context, id string) (Run, error) {
	if WorkspaceID(ctx) == "" {
		return Run{}, ErrForbidden
	}
	return scan(p.Pool.QueryRow(ctx, "SELECT "+columns+" FROM evidence_runs WHERE id=$1 AND workspace_id=$2", id, WorkspaceID(ctx)))
}

// SeedSamples only inserts explicit demo records. Callers enforce a local DB guard.
func SeedSamples(ctx context.Context, pool *pgxpool.Pool) error {
	for _, r := range Samples() {
		_, err := pool.Exec(ctx, `INSERT INTO evidence_runs (`+columns+`, workspace_id) VALUES ($1,$2,$3,$4,$5,$6,true,$7,$8,$9,$10,$11,$12,'sample-workspace') ON CONFLICT (id) DO NOTHING`, r.ID, r.Repository, r.PullRequest, r.Title, r.HeadSHA, r.Status, r.Environment, r.CreatedAt, r.DurationSeconds, r.Flows, r.Assertions, r.NotCovered)
		if err != nil {
			return err
		}
	}
	return nil
}
