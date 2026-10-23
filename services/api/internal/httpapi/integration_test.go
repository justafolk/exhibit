//go:build integration

package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	database "github.com/justafolk/exhibit/db"
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
	h := Server{Store: data}.Handler()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/api/v1/runs", nil))
	var list struct {
		Mode string      `json:"mode"`
		Runs []store.Run `json:"runs"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	if rec.Code != 200 || list.Mode != "postgres" || len(list.Runs) != len(store.Samples()) {
		t.Fatalf("unexpected API response %d %s", rec.Code, rec.Body)
	}
	for _, run := range list.Runs {
		if !run.Sample {
			t.Fatal("seed data must be labelled")
		}
	}
	if _, err := data.Get(ctx, "exh-1042"); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "UPDATE schema_migrations SET checksum='tampered'"); err != nil {
		t.Fatal(err)
	}
	if err := database.Migrate(ctx, pool); err == nil {
		t.Fatal("migration drift must fail")
	}
}
