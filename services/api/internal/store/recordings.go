package store

import (
	"context"
	"errors"
	"slices"
	"strings"
	"time"

	"github.com/justafolk/exhibit/services/api/internal/auth"
	"github.com/justafolk/exhibit/services/api/internal/evidence"
)

var ErrRelatedRun = errors.New("related run not found")
var ErrRecordingCapacity = errors.New("workspace supports at most 100 recording metadata records")

type Recording struct {
	ID string `json:"id"`
	evidence.RecordingInput
	Origin       string    `json:"origin"`
	Verification string    `json:"verification"`
	MediaStored  bool      `json:"mediaStored"`
	CreatedAt    time.Time `json:"createdAt"`
	CreatedBy    string    `json:"createdBy"`
}
type Activity struct {
	ID        string    `json:"id"`
	Action    string    `json:"action"`
	ObjectID  string    `json:"objectId"`
	ActorID   string    `json:"actorId"`
	CreatedAt time.Time `json:"createdAt"`
}
type RecordingStore interface {
	Recordings(context.Context, string) ([]Recording, error)
	Recording(context.Context, string, string) (Recording, error)
	CreateRecording(context.Context, string, string, evidence.RecordingInput) (Recording, error)
	Activity(context.Context, string) ([]Activity, error)
}

func manualRecording(id, actor string, input evidence.RecordingInput, created time.Time) Recording {
	return Recording{ID: id, RecordingInput: input, Origin: "manual", Verification: "unverified", MediaStored: false, CreatedAt: created, CreatedBy: actor}
}
func cloneRecording(recording Recording) Recording {
	recording.Chapters = append([]evidence.Chapter{}, recording.Chapters...)
	return recording
}
func (m *MemoryIdentity) Recordings(_ context.Context, workspace string) ([]Recording, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	records := []Recording{}
	for _, record := range m.recordings[workspace] {
		records = append(records, cloneRecording(record))
	}
	slices.SortFunc(records, func(a, b Recording) int {
		if order := b.CreatedAt.Compare(a.CreatedAt); order != 0 {
			return order
		}
		return strings.Compare(b.ID, a.ID)
	})
	return records[:min(100, len(records))], nil
}
func (m *MemoryIdentity) Recording(_ context.Context, workspace, id string) (Recording, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	record, ok := m.recordings[workspace][id]
	if !ok {
		return Recording{}, ErrNotFound
	}
	return cloneRecording(record), nil
}
func (m *MemoryIdentity) CreateRecording(ctx context.Context, workspace, actor string, input evidence.RecordingInput) (Recording, error) {
	if input.RunID != "" {
		if _, err := (Demo{}).Get(ctx, input.RunID); err != nil {
			return Recording{}, ErrRelatedRun
		}
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.recordings[workspace] == nil {
		m.recordings[workspace] = map[string]Recording{}
	}
	if len(m.recordings[workspace]) >= 100 {
		return Recording{}, ErrRecordingCapacity
	}
	record := manualRecording("recording-"+auth.Token(), actor, input, time.Now().UTC())
	m.recordings[workspace][record.ID] = cloneRecording(record)
	m.recordActivityLocked(workspace, actor, "recording.created", record.ID)
	return record, nil
}
func (m *MemoryIdentity) recordActivityLocked(workspace, actor, action, object string) {
	event := Activity{ID: auth.Token(), Action: action, ObjectID: object, ActorID: actor, CreatedAt: time.Now().UTC()}
	m.activity[workspace] = append([]Activity{event}, m.activity[workspace]...)
	if len(m.activity[workspace]) > 50 {
		m.activity[workspace] = m.activity[workspace][:50]
	}
}
func (m *MemoryIdentity) Activity(_ context.Context, workspace string) ([]Activity, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]Activity{}, m.activity[workspace]...), nil
}
