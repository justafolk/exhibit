package httpapi

import (
	"errors"
	"net/http"

	"github.com/justafolk/exhibit/services/api/internal/evidence"
	"github.com/justafolk/exhibit/services/api/internal/store"
)

func recordingFailure(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, store.ErrRelatedRun):
		failure(w, 404, "related run not found in this workspace")
	case errors.Is(err, store.ErrNotFound):
		failure(w, 404, "recording metadata not found")
	case errors.Is(err, store.ErrRecordingCapacity):
		failure(w, 409, err.Error())
	default:
		failure(w, 503, "recording metadata store unavailable")
	}
}
func (s Server) registerRecordings(mux *http.ServeMux) {
	data, ok := s.Identity.(store.RecordingStore)
	available := func(w http.ResponseWriter) bool {
		if !ok {
			failure(w, 503, "recording metadata store unavailable")
		}
		return ok
	}
	mux.HandleFunc("GET /api/v1/recordings", func(w http.ResponseWriter, r *http.Request) {
		if !available(w) {
			return
		}
		records, err := data.Recordings(r.Context(), sessionFrom(r).Workspace.ID)
		if err != nil {
			recordingFailure(w, err)
			return
		}
		respond(w, 200, struct {
			Recordings []store.Recording `json:"recordings"`
		}{records})
	})
	mux.HandleFunc("GET /api/v1/recordings/{id}", func(w http.ResponseWriter, r *http.Request) {
		if !available(w) {
			return
		}
		record, err := data.Recording(r.Context(), sessionFrom(r).Workspace.ID, r.PathValue("id"))
		if err != nil {
			recordingFailure(w, err)
			return
		}
		respond(w, 200, record)
	})
	mux.HandleFunc("POST /api/v1/recordings", func(w http.ResponseWriter, r *http.Request) {
		if !editor(w, r) || !available(w) {
			return
		}
		// A pointer distinguishes an explicit timestamp of zero from a missing
		// or null value. Keep this wire-format check in the HTTP boundary.
		var request struct {
			evidence.RecordingInput
			Chapters []struct {
				Label     string   `json:"label"`
				AtSeconds *float64 `json:"atSeconds"`
			} `json:"chapters"`
		}
		if !decode(w, r, &request) {
			return
		}
		input := request.RecordingInput
		if request.Chapters != nil {
			input.Chapters = make([]evidence.Chapter, 0, len(request.Chapters))
		}
		for _, chapter := range request.Chapters {
			if chapter.AtSeconds == nil {
				failure(w, 400, "each chapter requires an explicit numeric atSeconds timestamp")
				return
			}
			input.Chapters = append(input.Chapters, evidence.Chapter{Label: chapter.Label, AtSeconds: *chapter.AtSeconds})
		}
		if err := evidence.ValidateRecording(input); err != nil {
			failure(w, 400, err.Error())
			return
		}
		session := sessionFrom(r)
		record, err := data.CreateRecording(r.Context(), session.Workspace.ID, session.User.ID, input)
		if err != nil {
			recordingFailure(w, err)
			return
		}
		respond(w, 201, record)
	})
	mux.HandleFunc("GET /api/v1/activity", func(w http.ResponseWriter, r *http.Request) {
		if !available(w) {
			return
		}
		events, err := data.Activity(r.Context(), sessionFrom(r).Workspace.ID)
		if err != nil {
			recordingFailure(w, err)
			return
		}
		respond(w, 200, struct {
			Events []store.Activity `json:"events"`
		}{events})
	})
}
