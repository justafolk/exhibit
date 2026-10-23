package httpapi

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/justafolk/exhibit/services/api/internal/store"
)

func TestRoutes(t *testing.T) {
	h := Server{Store: store.Demo{}, CommitSHA: "test"}.Handler()
	for _, tt := range []struct {
		method, path, body string
		status             int
		contains           string
	}{
		{"GET", "/api/healthz", "", 200, "ok"},
		{"GET", "/api/readyz", "", 200, "demo"},
		{"GET", "/api/version", "", 200, "test"},
		{"GET", "/api/v1/runs", "", 200, `"sample":true`},
		{"GET", "/api/v1/runs/exh-1042", "", 200, "exh-1042"},
		{"GET", "/api/v1/runs/unknown", "", 404, "run not found"},
		{"GET", "/api/missing", "", 404, "endpoint not found"},
		{"POST", "/api/v1/contracts/evaluate", `{}`, 200, "needs_info"},
		{"POST", "/api/v1/contracts/evaluate", `null`, 400, "invalid"},
		{"POST", "/api/v1/contracts/evaluate", `{"environment":"production"}`, 200, "not_testable"},
		{"POST", "/api/v1/contracts/evaluate", `{"secret":"no"}`, 400, "invalid"},
		{"POST", "/api/v1/contracts/evaluate", `{} {}`, 400, "one JSON"},
		{"POST", "/api/v1/contracts/evaluate", `{"testTenant":"` + strings.Repeat("a", 65536) + `"}`, 400, "invalid"},
	} {
		t.Run(tt.path+tt.body[:min(len(tt.body), 20)], func(t *testing.T) {
			req := httptest.NewRequest(tt.method, tt.path, strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code != tt.status || !strings.Contains(rec.Body.String(), tt.contains) {
				t.Fatalf("%d %s", rec.Code, rec.Body.String())
			}
			if rec.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("API must not be cached")
			}
		})
	}
}

type failingStore struct{ store.Demo }

func (failingStore) Ping(context.Context) error { return errors.New("password=never-leak") }
func (failingStore) List(context.Context) ([]store.Run, error) {
	return nil, errors.New("internal failure")
}
func TestUnavailableStore(t *testing.T) {
	h := Server{Store: failingStore{}}.Handler()
	for _, path := range []string{"/api/readyz", "/api/v1/runs"} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != 503 || strings.Contains(rec.Body.String(), "password") {
			t.Fatalf("unsafe failure: %d %s", rec.Code, rec.Body)
		}
	}
}

func TestStaticAndAPIRoutesCoexist(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<html>Exhibit</html>"), 0600); err != nil {
		t.Fatal(err)
	}
	h := Server{Store: store.Demo{}, StaticDir: dir}.Handler()
	for _, tt := range []struct {
		method, path string
		status       int
	}{
		{"GET", "/", 200}, {"HEAD", "/", 200}, {"GET", "/missing.js", 404},
		{"POST", "/", 405}, {"GET", "/api/healthz", 200}, {"GET", "/api/unknown", 404},
	} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(tt.method, tt.path, nil))
		if rec.Code != tt.status {
			t.Fatalf("%s %s: got %d want %d", tt.method, tt.path, rec.Code, tt.status)
		}
	}
}
