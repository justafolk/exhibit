package httpapi

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"path"
	"strings"

	"github.com/justafolk/exhibit/services/api/internal/evidence"
	"github.com/justafolk/exhibit/services/api/internal/store"
)

func ciFailure(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		failure(w, 404, "CI evidence not found")
	case errors.Is(err, store.ErrConflict), errors.Is(err, store.ErrIncomplete):
		failure(w, 409, err.Error())
	default:
		failure(w, 503, "CI evidence store unavailable")
	}
}
func (s Server) registerCI(mux *http.ServeMux) {
	data, ok := s.Store.(store.Postgres)
	available := func(w http.ResponseWriter) bool {
		if !ok || s.ArtifactDir == "" {
			failure(w, 503, "persistent CI evidence storage is not configured")
			return false
		}
		return true
	}
	mux.HandleFunc("GET /api/v1/ingestion-tokens", func(w http.ResponseWriter, r *http.Request) {
		if !owner(w, r) || !available(w) {
			return
		}
		tokens, err := data.IngestionTokens(r.Context())
		if err != nil {
			ciFailure(w, err)
			return
		}
		respond(w, 200, map[string]any{"tokens": tokens})
	})
	mux.HandleFunc("POST /api/v1/ingestion-tokens", func(w http.ResponseWriter, r *http.Request) {
		if !owner(w, r) || !available(w) {
			return
		}
		var input struct {
			Repository string `json:"repository"`
		}
		if !decode(w, r, &input) {
			return
		}
		if !evidence.RepositoryPattern.MatchString(input.Repository) || len(input.Repository) > 200 {
			failure(w, 400, "repository must be owner/name")
			return
		}
		token, secret, err := data.CreateIngestionToken(r.Context(), strings.ToLower(input.Repository))
		if err != nil {
			ciFailure(w, err)
			return
		}
		respond(w, 201, map[string]any{"token": token, "secret": secret})
	})
	mux.HandleFunc("DELETE /api/v1/ingestion-tokens/{id}", func(w http.ResponseWriter, r *http.Request) {
		if !owner(w, r) || !available(w) {
			return
		}
		if err := data.RevokeIngestionToken(r.Context(), r.PathValue("id")); err != nil {
			ciFailure(w, err)
			return
		}
		respond(w, 200, map[string]bool{"revoked": true})
	})
	// This route tree uses scoped bearer credentials, independent of browser sessions.
	ingest := http.NewServeMux()
	ingest.HandleFunc("POST /api/ingest/v1/runs", func(w http.ResponseWriter, r *http.Request) {
		media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if err != nil || media != "application/json" {
			failure(w, 400, "Content-Type must be application/json")
			return
		}
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<20))
		decoder.DisallowUnknownFields()
		var input evidence.CISubmission
		if err = decoder.Decode(&input); err != nil {
			failure(w, 400, "invalid CI submission JSON")
			return
		}
		if decoder.Decode(&struct{}{}) != io.EOF {
			failure(w, 400, "expected one JSON object")
			return
		}
		if err = evidence.ValidateCI(input); err != nil {
			failure(w, 400, err.Error())
			return
		}
		scope := r.Header.Get("X-Exhibit-Scoped-Repository")
		if strings.ToLower(input.Repository) != scope {
			failure(w, 403, "token does not permit this repository")
			return
		}
		input.Repository = scope
		raw, _ := json.Marshal(input)
		var canonical any
		if err = json.Unmarshal(raw, &canonical); err != nil {
			failure(w, 400, "invalid report metadata")
			return
		}
		raw, _ = json.Marshal(canonical)
		digest := sha256.Sum256(raw)
		result, err := data.BeginCI(r.Context(), input, hex.EncodeToString(digest[:]))
		if err != nil {
			ciFailure(w, err)
			return
		}
		respond(w, 200, result)
	})
	permitted := func(w http.ResponseWriter, r *http.Request) bool {
		record, err := data.CI(r.Context(), r.PathValue("id"))
		if err != nil {
			ciFailure(w, err)
			return false
		}
		if record.Submission.Repository != r.Header.Get("X-Exhibit-Scoped-Repository") {
			failure(w, 404, "CI evidence not found")
			return false
		}
		return true
	}
	ingest.HandleFunc("PUT /api/ingest/v1/runs/{id}/files/{file}", func(w http.ResponseWriter, r *http.Request) {
		if !permitted(w, r) {
			return
		}
		f, err := data.CIFile(r.Context(), r.PathValue("id"), r.PathValue("file"))
		if err != nil {
			ciFailure(w, err)
			return
		}
		if r.ContentLength >= 0 && r.ContentLength != f.Bytes {
			failure(w, 400, "file length mismatch")
			return
		}
		if err = (store.DiskBlobs{Root: s.ArtifactDir}).Put(f.ObjectKey, http.MaxBytesReader(w, r.Body, f.Bytes+1), f.Bytes, f.SHA256); err != nil {
			if errors.Is(err, store.ErrFileIntegrity) {
				failure(w, 400, err.Error())
			} else {
				failure(w, 503, "private artifact storage write failed")
			}
			return
		}
		if err = data.MarkCIFile(r.Context(), f.RunID, f.ID); err != nil {
			ciFailure(w, err)
			return
		}
		respond(w, 200, map[string]bool{"uploaded": true})
	})
	ingest.HandleFunc("POST /api/ingest/v1/runs/{id}/complete", func(w http.ResponseWriter, r *http.Request) {
		if !permitted(w, r) {
			return
		}
		result, err := data.CompleteCI(r.Context(), r.PathValue("id"))
		if err != nil {
			ciFailure(w, err)
			return
		}
		respond(w, 200, result)
	})
	mux.Handle("/api/ingest/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !available(w) {
			return
		}
		bearer := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if len(bearer) != 64 || !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") {
			failure(w, 401, "valid ingestion bearer token required")
			return
		}
		scope, err := data.IngestionScope(r.Context(), bearer)
		if errors.Is(err, store.ErrForbidden) {
			failure(w, 401, "ingestion token is invalid, expired or revoked")
			return
		}
		if err != nil {
			ciFailure(w, err)
			return
		}
		r.Header.Set("X-Exhibit-Scoped-Repository", scope.Repository)
		ingest.ServeHTTP(w, r.WithContext(store.WithWorkspace(r.Context(), scope.WorkspaceID)))
	}))
	mux.HandleFunc("GET /api/v1/runs/{id}/ci", func(w http.ResponseWriter, r *http.Request) {
		if !available(w) {
			return
		}
		result, err := data.CI(r.Context(), r.PathValue("id"))
		if err != nil {
			ciFailure(w, err)
			return
		}
		respond(w, 200, result)
	})
	mux.HandleFunc("GET /api/v1/captures", func(w http.ResponseWriter, r *http.Request) {
		if !available(w) {
			return
		}
		files, err := data.CIFiles(r.Context(), "", true)
		if err != nil {
			ciFailure(w, err)
			return
		}
		respond(w, 200, map[string]any{"files": files})
	})
	mux.HandleFunc("GET /api/v1/runs/{id}/files/{file}", func(w http.ResponseWriter, r *http.Request) {
		if !available(w) {
			return
		}
		f, err := data.CIFile(r.Context(), r.PathValue("id"), r.PathValue("file"))
		if err != nil {
			ciFailure(w, err)
			return
		}
		if !f.Uploaded {
			failure(w, 409, "file upload is incomplete")
			return
		}
		file, err := (store.DiskBlobs{Root: s.ArtifactDir}).Open(f.ObjectKey)
		if err != nil {
			failure(w, 503, "artifact unavailable in private storage")
			return
		}
		defer file.Close()
		info, err := file.Stat()
		if err != nil || info.Size() != f.Bytes {
			failure(w, 503, "artifact storage integrity error")
			return
		}
		w.Header().Set("Content-Type", f.MediaType)
		w.Header().Set("ETag", `"`+f.SHA256+`"`)
		disposition := "attachment"
		if strings.HasPrefix(f.MediaType, "video/") || strings.HasPrefix(f.MediaType, "image/") {
			disposition = "inline"
		}
		w.Header().Set("Content-Disposition", mime.FormatMediaType(disposition, map[string]string{"filename": path.Base(f.Path)}))
		// HTML and other active documents can only download, never run on this origin.
		w.Header().Set("Content-Security-Policy", "sandbox; default-src 'none'")
		http.ServeContent(w, r, path.Base(f.Path), info.ModTime(), file)
	})
}
