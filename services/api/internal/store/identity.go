package store

import (
	"context"
	"errors"
	"github.com/justafolk/exhibit/services/api/internal/evidence"
	"sync"
	"time"
)

var ErrUnauthorized = errors.New("authentication required")
var ErrCapacity = errors.New("workspace supports at most 100 flow definitions")
var ErrForbidden = errors.New("workspace access required")

type scopeKey struct{}

func WithWorkspace(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, scopeKey{}, id)
}
func WorkspaceID(ctx context.Context) string { id, _ := ctx.Value(scopeKey{}).(string); return id }

type User struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}
type Workspace struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Role string `json:"role"`
}
type Identity struct {
	User      User
	Workspace Workspace
}
type Account struct {
	Identity
	PasswordHash string
}
type Setup struct {
	Repository string `json:"repository"`
	StagingURL string `json:"stagingUrl"`
	TestTenant string `json:"testTenant"`
	RunbookRef string `json:"runbookRef"`
}
type IdentityStore interface {
	Account(context.Context, string) (Account, error)
	SaveSession(context.Context, string, Identity, time.Time) error
	Session(context.Context, string) (Identity, error)
	RevokeSession(context.Context, string) error
	Setup(context.Context, string) (Setup, error)
	SaveSetup(context.Context, string, string, Setup) error
	RenameWorkspace(context.Context, string, string) error
}

type memorySession struct {
	Identity Identity
	Expires  time.Time
}

// MemoryIdentity is only for explicitly labelled demo sessions. Each session has
// its own workspace; nothing is persisted or connected to a real account.
type MemoryIdentity struct {
	mu       sync.Mutex
	sessions map[string]memorySession
	settings map[string]Setup
	flows    map[string]map[string]Flow
	drafts   map[string]evidence.Contract
}

func NewMemoryIdentity() *MemoryIdentity {
	return &MemoryIdentity{sessions: map[string]memorySession{}, settings: map[string]Setup{}, flows: map[string]map[string]Flow{}, drafts: map[string]evidence.Contract{}}
}
func (m *MemoryIdentity) Account(context.Context, string) (Account, error) {
	return Account{}, ErrUnauthorized
}
func (m *MemoryIdentity) SaveSession(_ context.Context, hash string, identity Identity, expiry time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for key, value := range m.sessions {
		if !value.Expires.After(time.Now()) {
			delete(m.sessions, key)
			delete(m.settings, value.Identity.Workspace.ID)
			delete(m.flows, value.Identity.Workspace.ID)
			delete(m.drafts, value.Identity.Workspace.ID)
		}
	}
	if len(m.sessions) >= 1000 {
		return errors.New("demo session capacity reached")
	}
	m.sessions[hash] = memorySession{identity, expiry}
	return nil
}
func (m *MemoryIdentity) Session(_ context.Context, hash string) (Identity, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	value, ok := m.sessions[hash]
	if !ok || !value.Expires.After(time.Now()) {
		return Identity{}, ErrUnauthorized
	}
	return value.Identity, nil
}
func (m *MemoryIdentity) RevokeSession(_ context.Context, hash string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if value, ok := m.sessions[hash]; ok {
		delete(m.settings, value.Identity.Workspace.ID)
		delete(m.flows, value.Identity.Workspace.ID)
		delete(m.drafts, value.Identity.Workspace.ID)
	}
	delete(m.sessions, hash)
	return nil
}
func (m *MemoryIdentity) Setup(_ context.Context, id string) (Setup, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.settings[id], nil
}
func (m *MemoryIdentity) SaveSetup(_ context.Context, id, actor string, setup Setup) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.settings[id] = setup
	return nil
}
func (m *MemoryIdentity) RenameWorkspace(_ context.Context, id, name string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for hash, session := range m.sessions {
		if session.Identity.Workspace.ID == id {
			session.Identity.Workspace.Name = name
			m.sessions[hash] = session
		}
	}
	return nil
}
