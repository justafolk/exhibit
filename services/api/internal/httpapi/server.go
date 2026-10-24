package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/justafolk/exhibit/services/api/internal/evidence"
	"github.com/justafolk/exhibit/services/api/internal/store"
)

type Server struct {
	Store         store.Store
	CommitSHA     string
	StaticDir     string
	Identity      store.IdentityStore
	SecureCookies bool
	PublicOrigin  string
	ArtifactDir   string
}

func respond(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
func failure(w http.ResponseWriter, status int, message string) {
	respond(w, status, map[string]string{"error": message})
}
func (s Server) Handler() http.Handler {
	if s.Identity == nil && s.Store.Mode() == "demo" {
		s.Identity = store.NewMemoryIdentity()
	}
	mux := http.NewServeMux()
	s.registerIdentity(mux)
	s.registerPreparation(mux)
	s.registerRecordings(mux)
	s.registerCI(mux)
	mux.HandleFunc("GET /api/healthz", func(w http.ResponseWriter, r *http.Request) { respond(w, 200, map[string]string{"status": "ok"}) })
	mux.HandleFunc("GET /api/readyz", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := s.Store.Ping(ctx); err != nil {
			failure(w, 503, "store unavailable or migrations pending")
			return
		}
		respond(w, 200, map[string]string{"status": "ready", "mode": s.Store.Mode()})
	})
	mux.HandleFunc("GET /api/version", func(w http.ResponseWriter, r *http.Request) {
		respond(w, 200, map[string]string{"application": "exhibit", "version": "0.1.0", "commitSha": s.CommitSHA})
	})
	mux.HandleFunc("GET /api/v1/runs", func(w http.ResponseWriter, r *http.Request) {
		filter, ok := runFilter(w, r)
		if !ok {
			return
		}
		runs, err := s.Store.List(r.Context(), filter)
		if err != nil {
			slog.Error("list runs failed", "error", err)
			failure(w, 503, "evidence store unavailable")
			return
		}
		respond(w, 200, struct {
			Mode string      `json:"mode"`
			Runs []store.Run `json:"runs"`
		}{s.Store.Mode(), runs})
	})
	mux.HandleFunc("GET /api/v1/runs/{id}", func(w http.ResponseWriter, r *http.Request) {
		run, err := s.Store.Get(r.Context(), r.PathValue("id"))
		if errors.Is(err, store.ErrNotFound) {
			failure(w, 404, "run not found")
			return
		}
		if err != nil {
			slog.Error("get run failed", "error", err)
			failure(w, 503, "evidence store unavailable")
			return
		}
		respond(w, 200, run)
	})
	mux.HandleFunc("POST /api/v1/contracts/evaluate", func(w http.ResponseWriter, r *http.Request) {
		if !editor(w, r) {
			return
		}
		mediaType, _, mediaErr := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if mediaErr != nil || mediaType != "application/json" {
			failure(w, 400, "Content-Type must be application/json")
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		var contract *evidence.Contract
		if err := decoder.Decode(&contract); err != nil || contract == nil {
			failure(w, 400, "invalid contract JSON")
			return
		}
		if err := decoder.Decode(&struct{}{}); err != io.EOF {
			failure(w, 400, "expected one JSON object")
			return
		}
		if err := evidence.ValidateDraft(*contract); err != nil {
			failure(w, 400, err.Error())
			return
		}
		respond(w, 200, evidence.Evaluate(*contract))
	})
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) { failure(w, 404, "endpoint not found") })
	if s.StaticDir != "" {
		files := http.FileServer(http.Dir(s.StaticDir))
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodGet && r.Method != http.MethodHead {
				w.Header().Set("Allow", "GET, HEAD")
				failure(w, http.StatusMethodNotAllowed, "method not allowed")
				return
			}
			if r.URL.Path != "/" {
				clean := filepath.Join(s.StaticDir, filepath.FromSlash(strings.TrimPrefix(r.URL.Path, "/")))
				if _, err := os.Stat(clean); err != nil {
					http.NotFound(w, r)
					return
				}
			}
			files.ServeHTTP(w, r)
		})
	}
	protected := s.authenticated(mux)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "same-origin")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
		if strings.HasPrefix(r.URL.Path, "/api/") {
			w.Header().Set("Cache-Control", "no-store")
		}
		timeout := 10 * time.Second
		if strings.HasPrefix(r.URL.Path, "/api/ingest/") || strings.Contains(r.URL.Path, "/files/") {
			timeout = 2 * time.Minute
		}
		ctx, cancel := context.WithTimeout(r.Context(), timeout)
		defer cancel()
		protected.ServeHTTP(w, r.WithContext(ctx))
	})
}
