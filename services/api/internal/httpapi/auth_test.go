package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/justafolk/exhibit/services/api/internal/auth"
	"github.com/justafolk/exhibit/services/api/internal/store"
)

func call(h http.Handler, method, path, body string, cookie *http.Cookie, csrf string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "http://example.com")
	req.Header.Set("X-CSRF-Token", csrf)
	if cookie != nil {
		req.AddCookie(cookie)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}
func TestSessionBoundary(t *testing.T) {
	h := Server{Store: store.Demo{}}.Handler()
	for _, path := range []string{"/api/v1/runs", "/api/v1/runs/exh-1042", "/api/v1/setup", "/api/v1/workspace", "/api/v1/auth/session"} {
		if got := call(h, "GET", path, "", nil, "").Code; got != 401 {
			t.Fatalf("%s unauth=%d", path, got)
		}
	}
	cookie, session := demoLogin(t, h)
	if !cookie.HttpOnly || cookie.SameSite != http.SameSiteStrictMode || cookie.MaxAge != 43200 || cookie.Path != "/api/" {
		t.Fatalf("unsafe cookie attributes: %#v", cookie)
	}
	if session.Mode != "demo" || session.Workspace.Role != "owner" || session.CSRFToken == cookie.Value || len(session.CSRFToken) != 64 {
		t.Fatal("bad session")
	}
	if rec := call(h, "PUT", "/api/v1/setup", `{"repository":"acme/repo"}`, cookie, ""); rec.Code != 403 {
		t.Fatal("missing CSRF accepted")
	}
	req := httptest.NewRequest("PUT", "/api/v1/setup", strings.NewReader(`{}`))
	req.AddCookie(cookie)
	req.Header.Set("Origin", "https://evil.example")
	req.Header.Set("X-CSRF-Token", session.CSRFToken)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 403 {
		t.Fatal("cross-origin accepted")
	}
	setup := `{"repository":"acme/repo","stagingUrl":"https://staging.example.com","testTenant":"test-tenant","runbookRef":"agents/runbook.yaml@0000000000000000000000000000000000000001"}`
	if rec := call(h, "PUT", "/api/v1/setup", setup, cookie, session.CSRFToken); rec.Code != 200 {
		t.Fatalf("save: %d %s", rec.Code, rec.Body)
	}
	if rec := call(h, "GET", "/api/v1/setup", "", cookie, ""); !strings.Contains(rec.Body.String(), "acme/repo") {
		t.Fatal("setup not saved")
	}
	other, _ := demoLogin(t, h)
	if rec := call(h, "GET", "/api/v1/setup", "", other, ""); strings.Contains(rec.Body.String(), "acme/repo") {
		t.Fatal("demo setup leaked")
	}
	if rec := call(h, "POST", "/api/v1/auth/logout", "{}", cookie, session.CSRFToken); rec.Code != 200 {
		t.Fatal("logout failed")
	}
	if rec := call(h, "GET", "/api/v1/runs", "", cookie, ""); rec.Code != 401 {
		t.Fatal("revoked session accepted")
	}
}
func TestRoleAndExpiryEnforcement(t *testing.T) {
	identity := store.NewMemoryIdentity()
	h := Server{Store: store.Demo{}, Identity: identity}.Handler()
	for _, role := range []string{"viewer", "editor", "owner"} {
		token := auth.Token()
		id := store.Identity{User: store.User{ID: role}, Workspace: store.Workspace{ID: role, Name: "Test", Role: role}}
		if err := identity.SaveSession(context.Background(), auth.Digest(token), id, time.Now().Add(time.Hour)); err != nil {
			t.Fatal(err)
		}
		cookie := &http.Cookie{Name: sessionCookie, Value: token}
		for _, path := range []string{"/api/v1/setup", "/api/v1/workspace"} {
			method, body := "PUT", "{}"
			if strings.HasSuffix(path, "workspace") {
				method, body = "PATCH", `{"name":"Updated"}`
			}
			got := call(h, method, path, body, cookie, auth.CSRF(token)).Code
			want := 403
			if role == "owner" {
				want = 200
			}
			if got != want {
				t.Fatalf("%s %s = %d", role, path, got)
			}
		}
		got := call(h, "POST", "/api/v1/contracts/evaluate", "{}", cookie, auth.CSRF(token)).Code
		if (role == "viewer" && got != 403) || (role != "viewer" && got != 200) {
			t.Fatalf("%s evaluation=%d", role, got)
		}
	}
	token := auth.Token()
	_ = identity.SaveSession(context.Background(), auth.Digest(token), store.Identity{}, time.Now().Add(-time.Second))
	if rec := call(h, "GET", "/api/v1/runs", "", &http.Cookie{Name: sessionCookie, Value: token}, ""); rec.Code != 401 {
		t.Fatal("expired session accepted")
	}
}

type realMode struct{ store.Demo }

func (realMode) Mode() string { return "postgres" }
func TestRealModeFailsClosed(t *testing.T) {
	h := Server{Store: realMode{}}.Handler()
	if rec := call(h, "GET", "/api/v1/runs", "", nil, ""); rec.Code != 503 {
		t.Fatal("missing real identity store must fail closed")
	}
	if rec := call(h, "POST", "/api/v1/auth/demo", "{}", nil, ""); rec.Code != 404 {
		t.Fatal("real mode exposed demo")
	}
}
func TestSetupAndLoginInput(t *testing.T) {
	h := Server{Store: store.Demo{}}.Handler()
	cookie, session := demoLogin(t, h)
	for _, body := range []string{`null`, `{} {}`, `{"unknown":true}`, `{"repository":"bad"}`, `{"stagingUrl":"https://user:secret@example.com"}`, `{"stagingUrl":"http://public.example"}`, `{"stagingUrl":"https://example.com?token=secret"}`, `{"runbookRef":"mutable/main"}`, `{"runbookRef":"path\u0000@0000000000000000000000000000000000000001"}`} {
		if rec := call(h, "PUT", "/api/v1/setup", body, cookie, session.CSRFToken); rec.Code != 400 {
			t.Fatalf("accepted %s: %d", body, rec.Code)
		}
	}
	req := httptest.NewRequest("POST", "/api/v1/auth/demo", strings.NewReader("{}"))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 403 {
		t.Fatal("originless login accepted")
	}
	secure := Server{Store: store.Demo{}, SecureCookies: true, PublicOrigin: "http://example.com"}.Handler()
	c, _ := demoLogin(t, secure)
	if !c.Secure {
		t.Fatal("secure cookie missing")
	}
}
func TestSessionRotation(t *testing.T) {
	h := Server{Store: store.Demo{}}.Handler()
	old, _ := demoLogin(t, h)
	rec := call(h, "POST", "/api/v1/auth/demo", "{}", old, "")
	if rec.Code != 200 {
		t.Fatalf("rotation %d", rec.Code)
	}
	if call(h, "GET", "/api/v1/auth/session", "", old, "").Code != 401 {
		t.Fatal("old session survives rotation")
	}
	var session Session
	if err := json.Unmarshal(rec.Body.Bytes(), &session); err != nil {
		t.Fatal(err)
	}
	if len(session.CSRFToken) != 64 {
		t.Fatal("no rotated csrf")
	}
}

func TestLoginAttemptsAreBounded(t *testing.T) {
	h := Server{Store: store.Demo{}}.Handler()
	for i := 0; i < 10; i++ {
		if rec := call(h, "POST", "/api/v1/auth/login", `{"email":"user@example.com","password":"wrong"}`, nil, ""); rec.Code != 400 {
			t.Fatalf("attempt %d = %d", i, rec.Code)
		}
	}
	rec := call(h, "POST", "/api/v1/auth/login", `{"email":"changed@example.com","password":"wrong"}`, nil, "")
	if rec.Code != 429 || rec.Header().Get("Retry-After") == "" {
		t.Fatal("changing account bypassed IP attempt limit")
	}
}

func TestConfiguredPublicOriginBehindProxy(t *testing.T) {
	h := Server{Store: store.Demo{}, SecureCookies: true, PublicOrigin: "https://exhibit.example.com"}.Handler()
	for _, origin := range []string{"https://exhibit.example.com", "https://attacker.example.com", "http://control-plane:8080"} {
		req := httptest.NewRequest("POST", "http://control-plane:8080/api/v1/auth/demo", strings.NewReader("{}"))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Origin", origin)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		expected := 403
		if origin == "https://exhibit.example.com" {
			expected = 200
		}
		if rec.Code != expected {
			t.Fatalf("origin %s returned %d", origin, rec.Code)
		}
		if expected == 200 && !rec.Result().Cookies()[0].Secure {
			t.Fatal("proxy session missing Secure cookie")
		}
	}
}
