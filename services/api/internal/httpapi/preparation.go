package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/justafolk/exhibit/services/api/internal/evidence"
	"github.com/justafolk/exhibit/services/api/internal/store"
)

func decodeFlowPatch(w http.ResponseWriter, r *http.Request) (evidence.FlowPatch, bool) {
	var fields map[string]json.RawMessage
	if !decode(w, r, &fields) {
		return evidence.FlowPatch{}, false
	}
	for key, value := range fields {
		switch key {
		case "name", "description", "preconditions", "assertions", "cleanup", "runbookRef":
		default:
			failure(w, 400, "unknown flow field")
			return evidence.FlowPatch{}, false
		}
		if bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
			failure(w, 400, "flow fields cannot be null")
			return evidence.FlowPatch{}, false
		}
	}
	raw, _ := json.Marshal(fields)
	var patch evidence.FlowPatch
	if err := json.Unmarshal(raw, &patch); err != nil {
		failure(w, 400, "invalid flow patch")
		return evidence.FlowPatch{}, false
	}
	return patch, true
}
func preparationFailure(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, evidence.ErrInvalidFlow):
		failure(w, 400, err.Error())
	case errors.Is(err, store.ErrNotFound):
		failure(w, 404, "flow not found")
	case errors.Is(err, store.ErrCapacity):
		failure(w, 409, "workspace supports at most 100 flow definitions")
	default:
		failure(w, 503, "preparation store unavailable")
	}
}
func (s Server) registerPreparation(mux *http.ServeMux) {
	data, ok := s.Identity.(store.PreparationStore)
	available := func(w http.ResponseWriter) bool {
		if !ok {
			failure(w, 503, "preparation store unavailable")
		}
		return ok
	}
	mux.HandleFunc("GET /api/v1/flows", func(w http.ResponseWriter, r *http.Request) {
		if !available(w) {
			return
		}
		flows, err := data.ListFlows(r.Context(), sessionFrom(r).Workspace.ID)
		if err != nil {
			preparationFailure(w, err)
			return
		}
		respond(w, 200, struct {
			Flows []store.Flow `json:"flows"`
		}{flows})
	})
	mux.HandleFunc("POST /api/v1/flows", func(w http.ResponseWriter, r *http.Request) {
		if !editor(w, r) || !available(w) {
			return
		}
		var input evidence.FlowInput
		if !decode(w, r, &input) {
			return
		}
		if err := evidence.ValidateFlow(input); err != nil {
			failure(w, 400, err.Error())
			return
		}
		session := sessionFrom(r)
		flow, err := data.CreateFlow(r.Context(), session.Workspace.ID, session.User.ID, input)
		if err != nil {
			preparationFailure(w, err)
			return
		}
		respond(w, 201, flow)
	})
	mux.HandleFunc("GET /api/v1/flows/{id}", func(w http.ResponseWriter, r *http.Request) {
		if !available(w) {
			return
		}
		flow, err := data.GetFlow(r.Context(), sessionFrom(r).Workspace.ID, r.PathValue("id"))
		if err != nil {
			preparationFailure(w, err)
			return
		}
		respond(w, 200, flow)
	})
	mux.HandleFunc("PATCH /api/v1/flows/{id}", func(w http.ResponseWriter, r *http.Request) {
		if !editor(w, r) || !available(w) {
			return
		}
		patch, valid := decodeFlowPatch(w, r)
		if !valid {
			return
		}
		session := sessionFrom(r)
		flow, err := data.PatchFlow(r.Context(), session.Workspace.ID, session.User.ID, r.PathValue("id"), patch)
		if err != nil {
			preparationFailure(w, err)
			return
		}
		respond(w, 200, flow)
	})
	mux.HandleFunc("GET /api/v1/contract-draft", func(w http.ResponseWriter, r *http.Request) {
		if !available(w) {
			return
		}
		draft, err := data.Draft(r.Context(), sessionFrom(r).Workspace.ID)
		if err != nil {
			preparationFailure(w, err)
			return
		}
		respond(w, 200, draft)
	})
	mux.HandleFunc("PUT /api/v1/contract-draft", func(w http.ResponseWriter, r *http.Request) {
		if !editor(w, r) || !available(w) {
			return
		}
		var input evidence.Contract
		if !decode(w, r, &input) {
			return
		}
		if err := evidence.ValidateDraft(input); err != nil {
			failure(w, 400, err.Error())
			return
		}
		if input.FlowIDs == nil {
			input.FlowIDs = []string{}
		}
		session := sessionFrom(r)
		if err := data.SaveDraft(r.Context(), session.Workspace.ID, session.User.ID, input); err != nil {
			preparationFailure(w, err)
			return
		}
		respond(w, 200, input)
	})
}
