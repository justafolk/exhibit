package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/justafolk/exhibit/services/api/internal/auth"
	"github.com/justafolk/exhibit/services/api/internal/store"
)

const flowJSON = `{"name":"Checkout","description":"One bounded flow","preconditions":["Dedicated tenant"],"assertions":["Confirmation appears"],"cleanup":"Delete run-tagged carts","runbookRef":"agents/checkout.yaml@0000000000000000000000000000000000000001"}`

func TestPreparationPersistsWithinDemoSession(t *testing.T) {
	h := Server{Store: store.Demo{}}.Handler()
	cookie, session := demoLogin(t, h)
	if rec := call(h, "GET", "/api/v1/flows", "", cookie, ""); rec.Code != 200 || !strings.Contains(rec.Body.String(), `"flows":[]`) {
		t.Fatal("bad empty catalog")
	}
	rec := call(h, "POST", "/api/v1/flows", flowJSON, cookie, session.CSRFToken)
	if rec.Code != 201 {
		t.Fatalf("create: %d %s", rec.Code, rec.Body)
	}
	var flow store.Flow
	if err := json.Unmarshal(rec.Body.Bytes(), &flow); err != nil {
		t.Fatal(err)
	}
	if flow.ID == "" || flow.UpdatedBy != session.User.ID || flow.UpdatedAt.IsZero() {
		t.Fatal("missing authorship")
	}
	if rec := call(h, "PATCH", "/api/v1/flows/"+flow.ID, `{"name":"Updated"}`, cookie, session.CSRFToken); rec.Code != 200 || !strings.Contains(rec.Body.String(), "Updated") {
		t.Fatal("patch failed")
	}
	if rec := call(h, "GET", "/api/v1/flows/"+flow.ID, "", cookie, ""); rec.Code != 200 || !strings.Contains(rec.Body.String(), "Confirmation appears") {
		t.Fatal("patch discarded other fields")
	}
	other, otherSession := demoLogin(t, h)
	if rec := call(h, "GET", "/api/v1/flows/"+flow.ID, "", other, ""); rec.Code != 404 {
		t.Fatal("flow leaked")
	}
	if rec := call(h, "PATCH", "/api/v1/flows/"+flow.ID, `{"name":"Intrusion"}`, other, otherSession.CSRFToken); rec.Code != 404 {
		t.Fatal("foreign flow mutable")
	}
	if rec := call(h, "PUT", "/api/v1/contract-draft", `{"repository":"acme/repo","headSha":"partial"}`, cookie, session.CSRFToken); rec.Code != 200 {
		t.Fatal("incomplete draft rejected")
	}
	if rec := call(h, "GET", "/api/v1/contract-draft", "", cookie, ""); !strings.Contains(rec.Body.String(), "partial") {
		t.Fatal("draft missing")
	}
	if rec := call(h, "GET", "/api/v1/contract-draft", "", other, ""); strings.Contains(rec.Body.String(), "partial") {
		t.Fatal("draft leaked")
	}
	if rec := call(h, "POST", "/api/v1/contracts/evaluate", `{"headSha":"partial"}`, cookie, session.CSRFToken); rec.Code != 200 || !strings.Contains(rec.Body.String(), "needs_info") {
		t.Fatal("draft falsely ready")
	}
	for _, body := range []string{`null`, `{"approval":true}`, `{"name":"Incomplete"}`} {
		if rec := call(h, "POST", "/api/v1/flows", body, cookie, session.CSRFToken); rec.Code != 400 {
			t.Fatal("invalid flow accepted")
		}
	}
}
func TestPreparationRoles(t *testing.T) {
	identity := store.NewMemoryIdentity()
	h := Server{Store: store.Demo{}, Identity: identity}.Handler()
	for _, role := range []string{"viewer", "editor", "owner"} {
		token := auth.Token()
		_ = identity.SaveSession(context.Background(), auth.Digest(token), store.Identity{User: store.User{ID: role}, Workspace: store.Workspace{ID: role, Role: role}}, time.Now().Add(time.Hour))
		cookie := &http.Cookie{Name: sessionCookie, Value: token}
		for _, path := range []string{"/api/v1/flows", "/api/v1/contract-draft"} {
			if call(h, "GET", path, "", cookie, "").Code != 200 {
				t.Fatal("member cannot read preparation")
			}
		}
		expected := 201
		if role == "viewer" {
			expected = 403
		}
		if rec := call(h, "POST", "/api/v1/flows", flowJSON, cookie, auth.CSRF(token)); rec.Code != expected {
			t.Fatalf("%s create=%d", role, rec.Code)
		}
		expected = 200
		if role == "viewer" {
			expected = 403
		}
		if rec := call(h, "PUT", "/api/v1/contract-draft", "{}", cookie, auth.CSRF(token)); rec.Code != expected {
			t.Fatalf("%s draft=%d", role, rec.Code)
		}
	}
}
