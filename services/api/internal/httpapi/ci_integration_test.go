//go:build integration

package httpapi

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/justafolk/exhibit/services/api/internal/evidence"
	"github.com/justafolk/exhibit/services/api/internal/store"
)

func testCIArchive(t *testing.T, data store.Postgres, alpha, bravo *http.Cookie, session Session) {
	t.Helper()
	root := t.TempDir()
	h := Server{Store: data, Identity: data, ArtifactDir: root}.Handler()
	create := call(h, "POST", "/api/v1/ingestion-tokens", `{"repository":"acme/checkout"}`, alpha, session.CSRFToken)
	if create.Code != 201 {
		t.Fatalf("create token: %d %s", create.Code, create.Body)
	}
	var credentials struct {
		Token  store.IngestionToken `json:"token"`
		Secret string               `json:"secret"`
	}
	if err := json.Unmarshal(create.Body.Bytes(), &credentials); err != nil {
		t.Fatal(err)
	}
	list := call(h, "GET", "/api/v1/ingestion-tokens", "", alpha, "")
	if list.Code != 200 || strings.Contains(list.Body.String(), credentials.Secret) {
		t.Fatal("token list exposes secret")
	}
	var stored string
	if err := data.Pool.QueryRow(t.Context(), `SELECT token_hash FROM ingestion_tokens WHERE id=$1`, credentials.Token.ID).Scan(&stored); err != nil || stored == credentials.Secret {
		t.Fatal("raw token persisted")
	}
	ingest := func(method, url, body, token string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, url, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	rootDir, err := filepath.Abs("../../../..")
	if err != nil {
		t.Fatal(err)
	}
	videoBytes, err := os.ReadFile(filepath.Join(rootDir, "apps/web/public/samples/field-store/checkout-payment-declined-does-not-create-an-order/video.webm"))
	if err != nil {
		t.Fatal(err)
	}
	bytes := string(videoBytes)
	hash := sha256.Sum256([]byte(bytes))
	payload := evidence.CISubmission{Repository: "acme/checkout", PullRequest: 71, Title: "Recorded checkout", HeadSHA: strings.Repeat("a", 40), WorkflowRunID: 12345, Attempt: 1, StartedAt: time.Now().UTC().Truncate(time.Second), DurationSeconds: 12, Outcome: "success", Assertions: []evidence.CIAssertion{{Label: "API order", Status: "passed"}, {Label: "Mobile", Status: "skipped"}}, NotCovered: []string{"No production testing"}, Manifest: json.RawMessage(`{"assertions":[{"label":"API order","status":"passed"}]}`), CodexReport: json.RawMessage(`{"status":"completed","review":"Check keyboard navigation"}`), Workflow: json.RawMessage(`{"jobs":[{"name":"API","conclusion":"success"}]}`), Files: []evidence.CIFile{{Path: "browser/video.webm", MediaType: "video/webm", Bytes: int64(len(bytes)), SHA256: hex.EncodeToString(hash[:])}}}
	html := "<script>alert('untrusted')</script>"
	htmlHash := sha256.Sum256([]byte(html))
	payload.Files = append(payload.Files, evidence.CIFile{Path: "report.html", MediaType: "text/html", Bytes: int64(len(html)), SHA256: hex.EncodeToString(htmlHash[:])})
	raw, _ := json.Marshal(payload)
	if ingest("POST", "/api/ingest/v1/runs", string(raw), "").Code != 401 {
		t.Fatal("unauthenticated ingestion")
	}
	foreign := payload
	foreign.Repository = "acme/other"
	foreignRaw, _ := json.Marshal(foreign)
	if ingest("POST", "/api/ingest/v1/runs", string(foreignRaw), credentials.Secret).Code != 403 {
		t.Fatal("repository scope bypass")
	}
	start := ingest("POST", "/api/ingest/v1/runs", string(raw), credentials.Secret)
	if start.Code != 200 {
		t.Fatalf("begin: %d %s", start.Code, start.Body)
	}
	var record store.CIRecord
	if err := json.Unmarshal(start.Body.Bytes(), &record); err != nil {
		t.Fatal(err)
	}
	runID := record.RunID
	fileID := record.Submission.Files[0].ID
	base := "/api/ingest/v1/runs/" + runID
	if ingest("POST", base+"/complete", "", credentials.Secret).Code != 409 {
		t.Fatal("incomplete archive marked complete")
	}
	if ingest("PUT", base+"/files/"+fileID, strings.Repeat("x", len(bytes)), credentials.Secret).Code != 400 {
		t.Fatal("corrupt bytes accepted")
	}
	if call(h, "GET", "/api/v1/runs/"+runID+"/files/"+fileID, "", alpha, "").Code != 409 {
		t.Fatal("missing file downloadable")
	}
	if ingest("PUT", base+"/files/"+fileID, bytes, credentials.Secret).Code != 200 {
		t.Fatal("original bytes rejected")
	}
	if ingest("PUT", base+"/files/"+record.Submission.Files[1].ID, html, credentials.Secret).Code != 200 {
		t.Fatal("HTML report upload failed")
	}
	if ingest("POST", base+"/complete", "", credentials.Secret).Code != 200 {
		t.Fatal("completion failed")
	}
	replay := ingest("POST", "/api/ingest/v1/runs", string(raw), credentials.Secret)
	var same store.CIRecord
	_ = json.Unmarshal(replay.Body.Bytes(), &same)
	if replay.Code != 200 || same.RunID != runID || !same.Complete || !same.Submission.Files[0].Uploaded {
		t.Fatal("retry created duplicate or lost completed state")
	}
	changed := payload
	changed.Title = "Changed"
	changedRaw, _ := json.Marshal(changed)
	if ingest("POST", "/api/ingest/v1/runs", string(changedRaw), credentials.Secret).Code != 409 {
		t.Fatal("same attempt replaced immutable metadata")
	}
	payload.Attempt = 2
	retryRaw, _ := json.Marshal(payload)
	next := ingest("POST", "/api/ingest/v1/runs", string(retryRaw), credentials.Secret)
	if next.Code != 200 || strings.Contains(next.Body.String(), runID) {
		t.Fatal("rerun attempt not independent")
	}
	// Rebuild all process-local state. Reports, files, tokens and sessions survive.
	h = Server{Store: store.Postgres{Pool: data.Pool}, Identity: store.Postgres{Pool: data.Pool}, ArtifactDir: root}.Handler()
	saved := call(h, "GET", "/api/v1/runs/"+runID, "", alpha, "")
	if saved.Code != 200 || !strings.Contains(saved.Body.String(), `"status":"partial"`) || !strings.Contains(saved.Body.String(), `"complete":true`) {
		t.Fatalf("saved run missing or false verdict: %s", saved.Body)
	}
	report := call(h, "GET", "/api/v1/runs/"+runID+"/ci", "", alpha, "")
	if report.Code != 200 || !strings.Contains(report.Body.String(), "Check keyboard navigation") || !strings.Contains(report.Body.String(), "jobs") {
		t.Fatal("report outputs not durable")
	}
	for _, route := range []string{"/api/v1/runs/" + runID, "/api/v1/runs/" + runID + "/ci", "/api/v1/runs/" + runID + "/files/" + fileID} {
		if call(h, "GET", route, "", bravo, "").Code != 404 || call(h, "GET", route, "", nil, "").Code != 401 {
			t.Fatal("cross-workspace or anonymous evidence access")
		}
	}
	captured := call(h, "GET", "/api/v1/captures", "", alpha, "")
	if captured.Code != 200 || !strings.Contains(captured.Body.String(), fileID) {
		t.Fatal("dynamic recordings missing")
	}
	if response := call(h, "GET", "/api/v1/captures", "", bravo, ""); strings.Contains(response.Body.String(), fileID) {
		t.Fatal("recordings leaked")
	}
	req := httptest.NewRequest("GET", "/api/v1/runs/"+runID+"/files/"+fileID, nil)
	req.AddCookie(alpha)
	req.Header.Set("Range", "bytes=0-7")
	response := httptest.NewRecorder()
	h.ServeHTTP(response, req)
	if response.Code != 206 || response.Body.String() != bytes[:8] || response.Header().Get("Content-Type") != "video/webm" {
		t.Fatalf("video seeking failed: %d %s", response.Code, response.Body)
	}
	if call(h, "HEAD", "/api/v1/runs/"+runID+"/files/"+fileID, "", alpha, "").Code != 200 {
		t.Fatal("HEAD failed")
	}
	htmlResponse := call(h, "GET", "/api/v1/runs/"+runID+"/files/"+record.Submission.Files[1].ID, "", alpha, "")
	if htmlResponse.Code != 200 || !strings.HasPrefix(htmlResponse.Header().Get("Content-Disposition"), "attachment") || !strings.Contains(htmlResponse.Header().Get("Content-Security-Policy"), "sandbox") {
		t.Fatal("active report served unsafely")
	}
	if os.Getenv("EXHIBIT_CI_BROWSER_TEST") == "1" {
		server := httptest.NewServer(Server{Store: data, Identity: data, ArtifactDir: root, StaticDir: filepath.Join(rootDir, "apps/web/dist")}.Handler())
		defer server.Close()
		browser := exec.Command("node", filepath.Join(rootDir, "scripts/check_ci_dashboard.mjs"))
		browser.Dir = rootDir
		browser.Env = append(os.Environ(), "EXHIBIT_TEST_URL="+server.URL, "EXHIBIT_TEST_RUN="+runID, "EXHIBIT_TEST_SESSION="+alpha.Value)
		if output, err := browser.CombinedOutput(); err != nil {
			t.Fatalf("browser: %v\n%s", err, output)
		} else {
			t.Log(string(output))
		}
	}
	// Another token in the same workspace cannot modify a different repository.
	other := call(h, "POST", "/api/v1/ingestion-tokens", `{"repository":"acme/other"}`, alpha, session.CSRFToken)
	var otherToken struct {
		Secret string `json:"secret"`
	}
	_ = json.Unmarshal(other.Body.Bytes(), &otherToken)
	if ingest("POST", base+"/complete", "", otherToken.Secret).Code != 404 {
		t.Fatal("same-tenant repository scope bypass")
	}
	if call(h, "DELETE", "/api/v1/ingestion-tokens/"+credentials.Token.ID, "", bravo, "").Code == 200 {
		t.Fatal("foreign token revocation")
	}
	if call(h, "DELETE", "/api/v1/ingestion-tokens/"+credentials.Token.ID, "", alpha, session.CSRFToken).Code != 200 {
		t.Fatal("token revocation failed")
	}
	if ingest("POST", base+"/complete", "", credentials.Secret).Code != 401 {
		t.Fatal("revoked token accepted")
	}
}
