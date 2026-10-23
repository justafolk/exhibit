package httpapi

import (
	"errors"
	"net/http"

	"github.com/justafolk/exhibit/services/api/internal/evidence"
	"github.com/justafolk/exhibit/services/api/internal/store"
)

type flowPatch struct {
	Name          *string   `json:"name"`
	Description   *string   `json:"description"`
	Preconditions *[]string `json:"preconditions"`
	Assertions    *[]string `json:"assertions"`
	Cleanup       *string   `json:"cleanup"`
	RunbookRef    *string   `json:"runbookRef"`
}

func (p flowPatch) apply(input evidence.FlowInput) evidence.FlowInput {
	if p.Name != nil {
		input.Name = *p.Name
	}
	if p.Description != nil {
		input.Description = *p.Description
	}
	if p.Preconditions != nil {
		input.Preconditions = *p.Preconditions
	}
	if p.Assertions != nil {
		input.Assertions = *p.Assertions
	}
	if p.Cleanup != nil {
		input.Cleanup = *p.Cleanup
	}
	if p.RunbookRef != nil {
		input.RunbookRef = *p.RunbookRef
	}
	return input
}
func preparationFailure(w http.ResponseWriter, err error) {
	switch {
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
		var patch flowPatch
		if !decode(w, r, &patch) {
			return
		}
		session := sessionFrom(r)
		existing, err := data.GetFlow(r.Context(), session.Workspace.ID, r.PathValue("id"))
		if err != nil {
			preparationFailure(w, err)
			return
		}
		input := patch.apply(existing.FlowInput)
		if err = evidence.ValidateFlow(input); err != nil {
			failure(w, 400, err.Error())
			return
		}
		flow, err := data.UpdateFlow(r.Context(), session.Workspace.ID, session.User.ID, existing.ID, input)
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
