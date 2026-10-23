//go:build integration

package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	database "github.com/justafolk/exhibit/db"
	"github.com/justafolk/exhibit/services/api/internal/auth"
	"github.com/justafolk/exhibit/services/api/internal/store"
)

func TestPostgresLifecycle(t *testing.T) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Fatal("DATABASE_URL required for integration tests")
	}
	ctx := context.Background()
	admin, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	schema := fmt.Sprintf("exhibit_test_%d", time.Now().UnixNano())
	quoted := pgx.Identifier{schema}.Sanitize()
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+quoted); err != nil {
		t.Fatal(err)
	}
	defer admin.Exec(ctx, "DROP SCHEMA "+quoted+" CASCADE")
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	cfg.ConnConfig.RuntimeParams["application_name"] = schema
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	data := store.Postgres{Pool: pool}
	if err := data.Ping(ctx); err == nil {
		t.Fatal("unmigrated database must not be ready")
	}
	for range 2 {
		if err := database.Migrate(ctx, pool); err != nil {
			t.Fatal(err)
		}
	}
	for range 2 {
		if err := store.SeedSamples(ctx, pool); err != nil {
			t.Fatal(err)
		}
	}

	h := Server{Store: data, Identity: data}.Handler()
	if rec := call(h, "GET", "/api/v1/runs", "", nil, ""); rec.Code != 401 {
		t.Fatal("unauthenticated database read")
	}
	if rec := call(h, "POST", "/api/v1/auth/demo", "{}", nil, ""); rec.Code != 404 {
		t.Fatal("database exposes sample login")
	}
	password := "test-only-private-password"
	hash, err := auth.HashPassword(password)
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"alpha", "bravo"} {
		account := store.Account{Identity: store.Identity{User: store.User{ID: id, Email: id + "@example.com", Name: id}, Workspace: store.Workspace{ID: id, Name: id, Role: "owner"}}, PasswordHash: hash}
		if err := data.Bootstrap(ctx, account); err != nil {
			t.Fatal(err)
		}
	}
	login := func(email, password string) (*http.Cookie, Session) {
		t.Helper()
		body, _ := json.Marshal(map[string]string{"email": email, "password": password})
		rec := call(h, "POST", "/api/v1/auth/login", string(body), nil, "")
		if rec.Code != 200 {
			t.Fatalf("login %d %s", rec.Code, rec.Body)
		}
		var session Session
		if err := json.Unmarshal(rec.Body.Bytes(), &session); err != nil {
			t.Fatal(err)
		}
		return rec.Result().Cookies()[0], session
	}
	alpha, session := login("alpha@example.com", password)
	bravo, _ := login("bravo@example.com", password)
	// Password reauthentication issues a different cookie and revokes the old token.
	previousAlpha := alpha
	rotation := call(h, "POST", "/api/v1/auth/login", `{"email":"alpha@example.com","password":"test-only-private-password"}`, alpha, "")
	if rotation.Code != 200 {
		t.Fatalf("password rotation failed: %d", rotation.Code)
	}
	alpha = rotation.Result().Cookies()[0]
	if err := json.Unmarshal(rotation.Body.Bytes(), &session); err != nil {
		t.Fatal(err)
	}
	if alpha.Value == previousAlpha.Value || call(h, "GET", "/api/v1/auth/session", "", previousAlpha, "").Code != 401 {
		t.Fatal("password reauthentication retained prior session")
	}

	// New owners do not inherit records assigned to the quarantined legacy workspace.
	if rec := call(h, "GET", "/api/v1/runs", "", alpha, ""); rec.Code != 200 || !strings.Contains(rec.Body.String(), `"runs":[]`) {
		t.Fatalf("legacy records exposed: %s", rec.Body)
	}
	if _, err := pool.Exec(ctx, `UPDATE evidence_runs SET workspace_id='alpha' WHERE id='exh-1042'`); err != nil {
		t.Fatal(err)
	}
	rec := call(h, "GET", "/api/v1/runs", "", alpha, "")
	var list struct {
		Mode string      `json:"mode"`
		Runs []store.Run `json:"runs"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	if rec.Code != 200 || list.Mode != "postgres" || len(list.Runs) != 1 || !list.Runs[0].Sample {
		t.Fatalf("unexpected API response %d %s", rec.Code, rec.Body)
	}
	if rec := call(h, "GET", "/api/v1/runs/exh-1042", "", bravo, ""); rec.Code != 404 {
		t.Fatal("another workspace read a run")
	}
	if _, err := data.List(ctx, store.RunFilter{}); err != store.ErrForbidden {
		t.Fatal("unscoped query accepted")
	}
	if _, err := data.Get(store.WithWorkspace(ctx, "alpha"), "exh-1042"); err != nil {
		t.Fatal(err)
	}
	if _, err := data.Get(store.WithWorkspace(ctx, "bravo"), "exh-1042"); err != store.ErrNotFound {
		t.Fatal("store tenant predicate absent")
	}

	// More than 100 new rows must not hide an older matching result. Identical
	// timestamps deliberately exercise the stable descending-ID tie breaker.
	if _, err := pool.Exec(ctx, `INSERT INTO evidence_runs(id,repository,pull_request,title,head_sha,status,sample,environment,created_at,workspace_id)
 SELECT 'bulk-'||lpad(n::text,3,'0'),'acme/filter',n,'Bulk matching row','0000000000000000000000000000000000000001','queued',true,'staging','2026-10-01T12:00:00Z','alpha' FROM generate_series(1,105) n`); err != nil {
		t.Fatal(err)
	}
	filtered, err := data.List(store.WithWorkspace(ctx, "alpha"), store.RunFilter{Query: "BULK", Status: "queued"})
	if err != nil || len(filtered) != 100 || filtered[0].ID != "bulk-105" || filtered[99].ID != "bulk-006" {
		t.Fatalf("unstable filtered window: %d %v", len(filtered), err)
	}
	old, err := data.List(store.WithWorkspace(ctx, "alpha"), store.RunFilter{Query: "exh-1042"})
	if err != nil || len(old) != 1 || old[0].ID != "exh-1042" {
		t.Fatal("filters were applied after LIMIT")
	}
	empty, err := data.List(store.WithWorkspace(ctx, "bravo"), store.RunFilter{Query: "bulk", Status: "queued"})
	if err != nil || len(empty) != 0 {
		t.Fatal("filtered query crossed tenant boundary")
	}
	for _, query := range []string{"%", "_", "' OR true --"} {
		rows, err := data.List(store.WithWorkspace(ctx, "alpha"), store.RunFilter{Query: query})
		if err != nil || len(rows) != 0 {
			t.Fatalf("nonliteral search %q", query)
		}
	}
	setup := `{"repository":"acme/private","stagingUrl":"https://staging.example.com","testTenant":"alpha-test","runbookRef":"agents/runbook.yaml@0000000000000000000000000000000000000001"}`
	if rec := call(h, "PUT", "/api/v1/setup", setup, alpha, session.CSRFToken); rec.Code != 200 {
		t.Fatalf("save setup: %d %s", rec.Code, rec.Body)
	}

	created := call(h, "POST", "/api/v1/flows", flowJSON, alpha, session.CSRFToken)
	if created.Code != 201 {
		t.Fatalf("create durable flow: %d %s", created.Code, created.Body)
	}
	var flow store.Flow
	if err := json.Unmarshal(created.Body.Bytes(), &flow); err != nil {
		t.Fatal(err)
	}
	if flow.UpdatedBy != "alpha" || flow.UpdatedAt.IsZero() {
		t.Fatal("missing flow authorship")
	}
	if rec := call(h, "PATCH", "/api/v1/flows/"+flow.ID, `{"name":"Updated checkout"}`, alpha, session.CSRFToken); rec.Code != 200 {
		t.Fatal("durable flow update failed")
	}
	if rec := call(h, "GET", "/api/v1/flows/"+flow.ID, "", bravo, ""); rec.Code != 404 {
		t.Fatal("flow crossed workspace")
	}
	bravoSessionRec := call(h, "GET", "/api/v1/auth/session", "", bravo, "")
	var bravoSession Session
	_ = json.Unmarshal(bravoSessionRec.Body.Bytes(), &bravoSession)
	if rec := call(h, "PATCH", "/api/v1/flows/"+flow.ID, `{"name":"foreign"}`, bravo, bravoSession.CSRFToken); rec.Code != 404 {
		t.Fatal("foreign flow mutation allowed")
	}
	if rec := call(h, "PUT", "/api/v1/contract-draft", `{"repository":"acme/prepared","headSha":"incomplete","flowIds":[]}`, alpha, session.CSRFToken); rec.Code != 200 {
		t.Fatal("incomplete draft not stored")
	}
	// Reconstruct HTTP handler to prove the session/setup survive process-local state.
	h = Server{Store: data, Identity: data}.Handler()
	if rec := call(h, "GET", "/api/v1/setup", "", alpha, ""); rec.Code != 200 || !strings.Contains(rec.Body.String(), "acme/private") {
		t.Fatal("setup/session not durable")
	}
	if rec := call(h, "GET", "/api/v1/setup", "", bravo, ""); strings.Contains(rec.Body.String(), "acme/private") {
		t.Fatal("setup leaked")
	}

	if rec := call(h, "GET", "/api/v1/flows/"+flow.ID, "", alpha, ""); rec.Code != 200 || !strings.Contains(rec.Body.String(), "Updated checkout") {
		t.Fatal("flow not durable")
	}
	if rec := call(h, "GET", "/api/v1/contract-draft", "", alpha, ""); rec.Code != 200 || !strings.Contains(rec.Body.String(), "acme/prepared") {
		t.Fatal("draft not durable")
	}
	if rec := call(h, "GET", "/api/v1/contract-draft", "", bravo, ""); strings.Contains(rec.Body.String(), "acme/prepared") {
		t.Fatal("draft crossed workspace")
	}
	var events int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM configuration_events WHERE workspace_id='alpha' AND actor_id='alpha'`).Scan(&events); err != nil || events != 3 {
		t.Fatalf("missing authorship events: %d %v", events, err)
	}

	for _, body := range []string{`{"name":null}`, `{"assertions":null}`, `{"assertions":[]}`} {
		if rec := call(h, "PATCH", "/api/v1/flows/"+flow.ID, body, alpha, session.CSRFToken); rec.Code != 400 {
			t.Fatal("invalid patch accepted")
		}
	}
	var eventsAfter int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM configuration_events WHERE workspace_id='alpha'`).Scan(&eventsAfter); err != nil || eventsAfter != events {
		t.Fatal("invalid patches added audit events")
	}
	// Hold the row lock until BOTH requests reach PostgreSQL. With a read-then-write
	// handler, both requests would have read the old definition before waiting at
	// UPDATE, and the second update would discard the other's distinct-field edit.
	lock, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer lock.Rollback(ctx)
	if _, err = lock.Exec(ctx, `SELECT id FROM flow_definitions WHERE id=$1 FOR UPDATE`, flow.ID); err != nil {
		t.Fatal(err)
	}
	results := make(chan *httptest.ResponseRecorder, 2)
	for _, body := range []string{`{"name":"Concurrent name"}`, `{"cleanup":"Concurrent cleanup"}`} {
		go func(body string) {
			results <- call(h, "PATCH", "/api/v1/flows/"+flow.ID, body, alpha, session.CSRFToken)
		}(body)
	}
	deadline := time.Now().Add(5 * time.Second)
	for {
		var waiting int
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'`, schema).Scan(&waiting); err != nil {
			t.Fatal(err)
		}
		if waiting >= 2 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("concurrent patches did not reach row-lock barrier")
		}
		time.Sleep(10 * time.Millisecond)
	}
	if err = lock.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		rec := <-results
		if rec.Code != 200 {
			t.Fatalf("concurrent patch: %d %s", rec.Code, rec.Body)
		}
	}
	latest, err := data.GetFlow(ctx, "alpha", flow.ID)
	if err != nil || latest.Name != "Concurrent name" || latest.Cleanup != "Concurrent cleanup" {
		t.Fatal("concurrent patch overwrote an omitted field")
	}
	if _, err := pool.Exec(ctx, `UPDATE workspace_memberships SET role='viewer' WHERE user_id='alpha'`); err != nil {
		t.Fatal(err)
	}
	if rec := call(h, "PUT", "/api/v1/setup", setup, alpha, session.CSRFToken); rec.Code != 403 {
		t.Fatal("membership change not applied to existing session")
	}
	if rec := call(h, "POST", "/api/v1/contracts/evaluate", "{}", alpha, session.CSRFToken); rec.Code != 403 {
		t.Fatal("viewer evaluated contract")
	}

	if rec := call(h, "PATCH", "/api/v1/flows/"+flow.ID, `{"name":"viewer write"}`, alpha, session.CSRFToken); rec.Code != 403 {
		t.Fatal("viewer changed a flow")
	}
	if rec := call(h, "PUT", "/api/v1/contract-draft", "{}", alpha, session.CSRFToken); rec.Code != 403 {
		t.Fatal("viewer changed draft")
	}
	if rec := call(h, "POST", "/api/v1/auth/logout", "{}", alpha, session.CSRFToken); rec.Code != 200 {
		t.Fatal("logout failed")
	}
	if rec := call(h, "GET", "/api/v1/auth/session", "", alpha, ""); rec.Code != 401 {
		t.Fatal("revoked session accepted")
	}
	if _, err := pool.Exec(ctx, `UPDATE sessions SET expires_at=now()-interval '1 second'`); err != nil {
		t.Fatal(err)
	}
	if rec := call(h, "GET", "/api/v1/runs", "", bravo, ""); rec.Code != 401 {
		t.Fatal("expired database session accepted")
	}
	for _, email := range []string{"alpha@example.com", "unknown@example.com"} {
		body, _ := json.Marshal(map[string]string{"email": email, "password": "incorrect"})
		rec := call(h, "POST", "/api/v1/auth/login", string(body), nil, "")
		if rec.Code != 401 || !strings.Contains(rec.Body.String(), "email or password is incorrect") {
			t.Fatal("credential failure discloses account existence")
		}
	}
	var count int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM sessions WHERE token_hash=$1`, bravo.Value).Scan(&count); err != nil || count != 0 {
		t.Fatal("raw session token stored")
	}

	membershipCookie, _ := login("bravo@example.com", password)
	if _, err := pool.Exec(ctx, `DELETE FROM workspace_memberships WHERE workspace_id='bravo' AND user_id='bravo'`); err != nil {
		t.Fatal(err)
	}
	if call(h, "GET", "/api/v1/auth/session", "", membershipCookie, "").Code != 401 {
		t.Fatal("removed membership retains session")
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM sessions WHERE user_id='bravo'`).Scan(&count); err != nil || count != 0 {
		t.Fatal("membership removal did not revoke persisted sessions")
	}
	if _, err := pool.Exec(ctx, "UPDATE schema_migrations SET checksum='tampered'"); err != nil {
		t.Fatal(err)
	}
	if err := database.Migrate(ctx, pool); err == nil {
		t.Fatal("migration drift must fail")
	}
}
