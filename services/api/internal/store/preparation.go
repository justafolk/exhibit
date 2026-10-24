package store

import (
	"context"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/justafolk/exhibit/services/api/internal/auth"
	"github.com/justafolk/exhibit/services/api/internal/evidence"
)

type Flow struct {
	ID string `json:"id"`
	evidence.FlowInput
	UpdatedAt time.Time `json:"updatedAt"`
	UpdatedBy string    `json:"updatedBy"`
}
type PreparationStore interface {
	ListFlows(context.Context, string) ([]Flow, error)
	GetFlow(context.Context, string, string) (Flow, error)
	CreateFlow(context.Context, string, string, evidence.FlowInput) (Flow, error)
	PatchFlow(context.Context, string, string, string, evidence.FlowPatch) (Flow, error)
	Draft(context.Context, string) (evidence.Contract, error)
	SaveDraft(context.Context, string, string, evidence.Contract) error
}

func cloneFlow(flow Flow) Flow {
	flow.Preconditions = slices.Clone(flow.Preconditions)
	flow.Assertions = slices.Clone(flow.Assertions)
	return flow
}
func (m *MemoryIdentity) ListFlows(_ context.Context, workspace string) ([]Flow, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	flows := []Flow{}
	for _, flow := range m.flows[workspace] {
		flows = append(flows, cloneFlow(flow))
	}
	slices.SortFunc(flows, func(a, b Flow) int {
		if order := b.UpdatedAt.Compare(a.UpdatedAt); order != 0 {
			return order
		}
		return strings.Compare(b.ID, a.ID)
	})
	return flows[:min(len(flows), 100)], nil
}
func (m *MemoryIdentity) GetFlow(_ context.Context, workspace, id string) (Flow, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	flow, ok := m.flows[workspace][id]
	if !ok {
		return Flow{}, ErrNotFound
	}
	return cloneFlow(flow), nil
}
func (m *MemoryIdentity) CreateFlow(_ context.Context, workspace, actor string, input evidence.FlowInput) (Flow, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.flows[workspace] == nil {
		m.flows[workspace] = map[string]Flow{}
	}
	if len(m.flows[workspace]) >= 100 {
		return Flow{}, ErrCapacity
	}
	flow := Flow{ID: "flow-" + auth.Token(), FlowInput: input, UpdatedAt: time.Now().UTC(), UpdatedBy: actor}
	m.flows[workspace][flow.ID] = cloneFlow(flow)
	m.recordActivityLocked(workspace, actor, "flow.created", flow.ID)
	return flow, nil
}
func (m *MemoryIdentity) PatchFlow(_ context.Context, workspace, actor, id string, patch evidence.FlowPatch) (Flow, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	existing, ok := m.flows[workspace][id]
	if !ok {
		return Flow{}, ErrNotFound
	}
	input := patch.Apply(existing.FlowInput)
	if err := evidence.ValidateFlow(input); err != nil {
		return Flow{}, fmt.Errorf("%w: %s", evidence.ErrInvalidFlow, err)
	}
	flow := Flow{ID: id, FlowInput: input, UpdatedAt: time.Now().UTC(), UpdatedBy: actor}
	m.flows[workspace][id] = cloneFlow(flow)
	m.recordActivityLocked(workspace, actor, "flow.updated", id)
	return flow, nil
}
func (m *MemoryIdentity) Draft(_ context.Context, workspace string) (evidence.Contract, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	draft := m.drafts[workspace]
	draft.FlowIDs = append([]string{}, draft.FlowIDs...)
	return draft, nil
}
func (m *MemoryIdentity) SaveDraft(_ context.Context, workspace, actor string, draft evidence.Contract) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	draft.FlowIDs = append([]string{}, draft.FlowIDs...)
	m.drafts[workspace] = draft
	m.recordActivityLocked(workspace, actor, "contract.saved", workspace)
	return nil
}
