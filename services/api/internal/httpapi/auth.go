package httpapi

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/justafolk/exhibit/services/api/internal/auth"
	"github.com/justafolk/exhibit/services/api/internal/store"
)

const sessionCookie = "exhibit_session"
const sessionLifetime = 12 * time.Hour

type sessionKey struct{}
type Session struct {
	User      store.User      `json:"user"`
	Workspace store.Workspace `json:"workspace"`
	Mode      string          `json:"mode"`
	CSRFToken string          `json:"csrfToken"`
}

func sessionFrom(r *http.Request) Session {
	value, _ := r.Context().Value(sessionKey{}).(Session)
	return value
}
func owner(w http.ResponseWriter, r *http.Request) bool {
	if sessionFrom(r).Workspace.Role != "owner" {
		failure(w, 403, "workspace owner permission required")
		return false
	}
	return true
}
func editor(w http.ResponseWriter, r *http.Request) bool {
	role := sessionFrom(r).Workspace.Role
	if role != "owner" && role != "editor" {
		failure(w, 403, "workspace editor permission required")
		return false
	}
	return true
}
func decode(w http.ResponseWriter, r *http.Request, dst any) bool {
	media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || media != "application/json" {
		failure(w, 400, "Content-Type must be application/json")
		return false
	}
	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	// Decode via a raw value first so JSON null never silently becomes an empty struct.
	var raw json.RawMessage
	if err = dec.Decode(&raw); err != nil || string(raw) == "null" {
		failure(w, 400, "invalid JSON object")
		return false
	}
	inner := json.NewDecoder(strings.NewReader(string(raw)))
	inner.DisallowUnknownFields()
	if err = inner.Decode(dst); err != nil {
		failure(w, 400, "invalid JSON object")
		return false
	}
	if err = dec.Decode(&struct{}{}); err != io.EOF {
		failure(w, 400, "expected one JSON object")
		return false
	}
	return true
}
func (s Server) sameOrigin(r *http.Request) bool {
	if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
		return false
	}
	origin := r.Header.Get("Origin")
	if origin == "" {
		return false
	}
	expected := s.PublicOrigin
	if expected == "" {
		scheme := "http"
		if r.TLS != nil || s.SecureCookies {
			scheme = "https"
		}
		expected = scheme + "://" + r.Host
	}
	return origin == expected
}
func (s Server) cookie(token string, maxAge int) *http.Cookie {
	return &http.Cookie{Name: sessionCookie, Value: token, Path: "/api/", MaxAge: maxAge, HttpOnly: true, Secure: s.SecureCookies, SameSite: http.SameSiteStrictMode}
}
func (s Server) authenticated(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/v1/") || r.URL.Path == "/api/v1/auth/login" || r.URL.Path == "/api/v1/auth/demo" {
			next.ServeHTTP(w, r)
			return
		}
		if s.Identity == nil {
			failure(w, 503, "identity store unavailable")
			return
		}
		cookie, err := r.Cookie(sessionCookie)
		if err != nil || len(cookie.Value) != 64 {
			failure(w, 401, "sign in to continue")
			return
		}
		identity, err := s.Identity.Session(r.Context(), auth.Digest(cookie.Value))
		if errors.Is(err, store.ErrUnauthorized) {
			failure(w, 401, "session expired; sign in to continue")
			return
		}
		if err != nil {
			failure(w, 503, "identity store unavailable")
			return
		}
		session := Session{identity.User, identity.Workspace, s.Store.Mode(), auth.CSRF(cookie.Value)}
		if r.Method != "GET" && r.Method != "HEAD" && r.Method != "OPTIONS" {
			if !s.sameOrigin(r) || subtle.ConstantTimeCompare([]byte(r.Header.Get("X-CSRF-Token")), []byte(session.CSRFToken)) != 1 {
				failure(w, 403, "request origin or CSRF token is invalid")
				return
			}
		}
		ctx := context.WithValue(r.Context(), sessionKey{}, session)
		next.ServeHTTP(w, r.WithContext(store.WithWorkspace(ctx, identity.Workspace.ID)))
	})
}

type rateWindow struct {
	count int
	until time.Time
}
type authLimiter struct {
	mu      sync.Mutex
	windows map[string]rateWindow
}

func (l *authLimiter) allow(key string, limit int) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	for k, v := range l.windows {
		if !v.until.After(now) {
			delete(l.windows, k)
		}
	}
	value, exists := l.windows[key]
	if !exists {
		if len(l.windows) >= 2048 {
			return false
		}
		value.until = now.Add(time.Minute)
	}
	if value.count >= limit {
		return false
	}
	value.count++
	l.windows[key] = value
	return true
}
func (s Server) registerIdentity(mux *http.ServeMux) {
	limiter := authLimiter{windows: map[string]rateWindow{}}
	hashing := make(chan struct{}, 4)
	start := func(w http.ResponseWriter, r *http.Request, kind string, limit int) bool {
		if s.Identity == nil {
			failure(w, 503, "identity store unavailable")
			return false
		}
		if !s.sameOrigin(r) {
			failure(w, 403, "request origin is invalid")
			return false
		}
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			host = r.RemoteAddr
		}
		if !limiter.allow(kind+":"+host, limit) {
			w.Header().Set("Retry-After", "60")
			failure(w, 429, "too many sign-in attempts; try again in a minute")
			return false
		}
		return true
	}
	issue := func(w http.ResponseWriter, r *http.Request, identity store.Identity) {
		token := auth.Token()
		if err := s.Identity.SaveSession(r.Context(), auth.Digest(token), identity, time.Now().Add(sessionLifetime)); err != nil {
			failure(w, 503, "could not create session")
			return
		}
		// Reauthentication rotates and revokes this browser's previous session.
		if old, err := r.Cookie(sessionCookie); err == nil {
			if err = s.Identity.RevokeSession(r.Context(), auth.Digest(old.Value)); err != nil {
				_ = s.Identity.RevokeSession(r.Context(), auth.Digest(token))
				failure(w, 503, "could not rotate session")
				return
			}
		}
		http.SetCookie(w, s.cookie(token, int(sessionLifetime.Seconds())))
		respond(w, 200, Session{identity.User, identity.Workspace, s.Store.Mode(), auth.CSRF(token)})
	}
	mux.HandleFunc("POST /api/v1/auth/login", func(w http.ResponseWriter, r *http.Request) {
		if !start(w, r, "login", 10) {
			return
		}
		var input struct {
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		if !decode(w, r, &input) {
			return
		}
		if s.Store.Mode() == "demo" {
			failure(w, 400, "password sign-in requires a configured PostgreSQL workspace; use sample preview")
			return
		}
		if len(input.Email) > 254 || len(input.Password) > 256 {
			failure(w, 400, "invalid credential length")
			return
		}
		select {
		case hashing <- struct{}{}:
			defer func() { <-hashing }()
		default:
			failure(w, 429, "sign-in is busy; try again shortly")
			return
		}
		account, err := s.Identity.Account(r.Context(), strings.ToLower(strings.TrimSpace(input.Email)))
		valid := auth.VerifyPassword(input.Password, account.PasswordHash)
		if err != nil && !errors.Is(err, store.ErrUnauthorized) {
			failure(w, 503, "identity store unavailable")
			return
		}
		if err != nil || !valid {
			failure(w, 401, "email or password is incorrect")
			return
		}
		issue(w, r, account.Identity)
	})
	mux.HandleFunc("POST /api/v1/auth/demo", func(w http.ResponseWriter, r *http.Request) {
		if s.Store.Mode() != "demo" {
			failure(w, 404, "sample preview is unavailable")
			return
		}
		if !start(w, r, "demo", 120) {
			return
		}
		if !decode(w, r, &struct{}{}) {
			return
		}
		id := auth.Token()
		issue(w, r, store.Identity{User: store.User{ID: "sample-" + id, Email: "preview@example.invalid", Name: "Sample reviewer"}, Workspace: store.Workspace{ID: "sample-" + id, Name: "Sample workspace", Role: "owner"}})
	})
	mux.HandleFunc("GET /api/v1/auth/session", func(w http.ResponseWriter, r *http.Request) { respond(w, 200, sessionFrom(r)) })
	mux.HandleFunc("POST /api/v1/auth/logout", func(w http.ResponseWriter, r *http.Request) {
		if !decode(w, r, &struct{}{}) {
			return
		}
		cookie, _ := r.Cookie(sessionCookie)
		if err := s.Identity.RevokeSession(r.Context(), auth.Digest(cookie.Value)); err != nil {
			failure(w, 503, "could not revoke session")
			return
		}
		http.SetCookie(w, s.cookie("", -1))
		respond(w, 200, map[string]bool{"signedOut": true})
	})
	mux.HandleFunc("GET /api/v1/workspace", func(w http.ResponseWriter, r *http.Request) { respond(w, 200, sessionFrom(r).Workspace) })
	mux.HandleFunc("PATCH /api/v1/workspace", func(w http.ResponseWriter, r *http.Request) {
		if !owner(w, r) {
			return
		}
		var input struct {
			Name string `json:"name"`
		}
		if !decode(w, r, &input) {
			return
		}
		input.Name = strings.TrimSpace(input.Name)
		if len(input.Name) < 1 || len(input.Name) > 100 {
			failure(w, 400, "workspace name must contain 1–100 bytes")
			return
		}
		workspace := sessionFrom(r).Workspace
		if err := s.Identity.RenameWorkspace(r.Context(), workspace.ID, input.Name); err != nil {
			failure(w, 503, "could not save workspace")
			return
		}
		workspace.Name = input.Name
		respond(w, 200, workspace)
	})
	mux.HandleFunc("GET /api/v1/setup", func(w http.ResponseWriter, r *http.Request) {
		setup, err := s.Identity.Setup(r.Context(), sessionFrom(r).Workspace.ID)
		if err != nil {
			failure(w, 503, "could not load setup")
			return
		}
		respond(w, 200, setup)
	})
	mux.HandleFunc("PUT /api/v1/setup", func(w http.ResponseWriter, r *http.Request) {
		if !owner(w, r) {
			return
		}
		var setup store.Setup
		if !decode(w, r, &setup) {
			return
		}
		setup.Repository = strings.TrimSpace(setup.Repository)
		setup.StagingURL = strings.TrimSpace(setup.StagingURL)
		setup.TestTenant = strings.TrimSpace(setup.TestTenant)
		setup.RunbookRef = strings.TrimSpace(setup.RunbookRef)
		if message := validateSetup(setup); message != "" {
			failure(w, 400, message)
			return
		}
		session := sessionFrom(r)
		if err := s.Identity.SaveSetup(r.Context(), session.Workspace.ID, session.User.ID, setup); err != nil {
			failure(w, 503, "could not save setup")
			return
		}
		respond(w, 200, setup)
	})
}

var repositoryPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$`)
var runbookPattern = regexp.MustCompile(`^[^\s@]+@[0-9a-f]{40}$`)

func validateSetup(s store.Setup) string {
	if s.Repository != "" && !repositoryPattern.MatchString(s.Repository) {
		return "repository must use owner/repository format"
	}
	if len(s.TestTenant) > 100 {
		return "test tenant must be at most 100 bytes"
	}
	if len(s.RunbookRef) > 512 || (s.RunbookRef != "" && !runbookPattern.MatchString(s.RunbookRef)) {
		return "runbook reference must use path@ followed by a full 40-character commit SHA"
	}
	if s.StagingURL != "" {
		u, err := url.Parse(s.StagingURL)
		if err != nil || len(s.StagingURL) > 2048 || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
			return "staging URL must be an absolute URL without credentials, query or fragment"
		}
		local := u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1" || u.Hostname() == "::1"
		if u.Scheme != "https" && !(u.Scheme == "http" && local) {
			return "staging URL must use HTTPS (HTTP is allowed only for loopback)"
		}
	}
	return ""
}
