// populate-workspace is an explicit operator-only exception to the local sample seeder.
// It adds illustrative records to one confirmed owner's workspace without replacing data.
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/justafolk/exhibit/services/api/internal/store"
)

func sampleRuns(workspace string) []store.Run {
	definitions := []struct {
		slug, title, status, flow string
		passed                    bool
	}{
		{"checkout", "Saved-address checkout", "verified", "Field Store saved-address checkout", true},
		{"declined", "Declined payment leaves no order", "verified", "Payment declined", true},
		{"stock", "Unavailable stock leaves no order", "verified", "Unavailable stock", true},
		{"validation", "Malformed checkout request", "failed", "Checkout API validation", false},
		{"cleanup", "Cleanup coverage needs follow-up", "partial", "Scoped cleanup", false},
		{"unavailable", "Staging readiness unavailable", "couldnt_run", "Staging readiness", false},
		{"queued", "Next checkout review awaiting a runner", "queued", "Order persistence", false},
		{"running", "Checkout review in progress", "running", "Field Store saved-address checkout", false},
	}
	runs := make([]store.Run, 0, len(definitions))
	for i, d := range definitions {
		assertions := []store.Assertion{}
		if d.status != "queued" && d.status != "running" && d.status != "couldnt_run" {
			assertions = append(assertions, store.Assertion{Label: "Illustrative outcome: " + d.flow, Passed: d.passed})
		}
		duration := 30 + i*13
		if d.status == "queued" {
			duration = 0
		}
		runs = append(runs, store.Run{ID: "sample-" + workspace + "-" + d.slug, Repository: "justafolk/sample-project-exhibit", PullRequest: 101 + i, Title: "Sample: " + d.title, HeadSHA: "3efafe232f3eaad3959d94e625b9edbab9f86ed4", Status: d.status, Sample: true, Environment: "staging", CreatedAt: time.Now().UTC().Add(-time.Duration(i) * time.Hour), DurationSeconds: duration, Flows: []string{d.flow}, Assertions: assertions, NotCovered: []string{"Illustrative fixture only: PR numbers, statuses, timings and assertions are sample data. No PR was executed by this workspace.", "Queued/running examples are static demonstrations, not active jobs.", "Production payments, real customer data and trusted execution are not covered. Real CI recordings and supplemental API captures are available separately in the sample evidence explorer."}})
	}
	return runs
}

func run() error {
	workspace := flag.String("workspace-id", "", "explicit target workspace ID")
	owner := flag.String("owner-email", "", "existing owner email")
	confirm := flag.Bool("confirm-sample-data", false, "explicitly authorize illustrative samples in this workspace")
	flag.Parse()
	if *workspace == "" || *owner == "" || !*confirm || os.Getenv("DATABASE_URL") == "" {
		return fmt.Errorf("workspace, owner, confirmation and DATABASE_URL are required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		return fmt.Errorf("invalid database configuration")
	}
	defer pool.Close()
	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("database unavailable")
	}
	defer tx.Rollback(ctx)
	var id string
	err = tx.QueryRow(ctx, `SELECT w.id FROM workspaces w JOIN workspace_memberships m ON m.workspace_id=w.id JOIN users u ON u.id=m.user_id WHERE w.id=$1 AND u.email=$2 AND m.role='owner' FOR UPDATE OF w`, *workspace, strings.ToLower(strings.TrimSpace(*owner))).Scan(&id)
	if err != nil {
		return fmt.Errorf("target workspace owner did not match; nothing changed")
	}
	inserted := int64(0)
	for _, r := range sampleRuns(id) {
		tag, err := tx.Exec(ctx, `INSERT INTO evidence_runs(id,workspace_id,repository,pull_request,title,head_sha,status,sample,environment,created_at,duration_seconds,flows,assertions,not_covered) VALUES($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10,$11,$12,$13) ON CONFLICT(id) DO NOTHING`, r.ID, id, r.Repository, r.PullRequest, r.Title, r.HeadSHA, r.Status, r.Environment, r.CreatedAt, r.DurationSeconds, r.Flows, r.Assertions, r.NotCovered)
		if err != nil {
			return fmt.Errorf("sample insertion failed; transaction rolled back")
		}
		inserted += tag.RowsAffected()
	}
	if err = tx.Commit(ctx); err != nil {
		return fmt.Errorf("sample transaction could not commit")
	}
	fmt.Printf("Added %d illustrative sample runs. Existing rows preserved.\n", inserted)
	return nil
}
func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
