package httpapi

import (
	"encoding/json"
	"net/url"
	"strconv"
	"strings"
	"testing"

	"github.com/justafolk/exhibit/services/api/internal/store"
)

func TestRunQueryValidation(t *testing.T) {
	h := Server{Store: store.Demo{}}.Handler()
	cookie, _ := demoLogin(t, h)
	for _, query := range []string{"q=a&q=b", "status=failed&status=running", "unknown=value", "status=all", "status=invalid", "q=%FF", "q=%00", "q=%ZZ", "q=" + strings.Repeat("x", 201)} {
		rec := call(h, "GET", "/api/v1/runs?"+query, "", cookie, "")
		if rec.Code != 400 {
			t.Fatalf("query %q: %d %s", query, rec.Code, rec.Body)
		}
	}
}
func TestRunFiltersSearchAllReviewFields(t *testing.T) {
	h := Server{Store: store.Demo{}}.Handler()
	cookie, _ := demoLogin(t, h)
	run := store.Samples()[0]
	for _, q := range []string{strings.ToUpper(run.Title), run.Repository, strconv.Itoa(run.PullRequest), run.ID, run.HeadSHA, "  " + run.ID + "  "} {
		rec := call(h, "GET", "/api/v1/runs?q="+url.QueryEscape(q)+"&status="+run.Status, "", cookie, "")
		var data struct {
			Runs []store.Run `json:"runs"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &data); err != nil {
			t.Fatal(err)
		}
		found := false
		for _, item := range data.Runs {
			if item.ID == run.ID {
				found = true
			}
			if item.Status != run.Status {
				t.Fatal("status filter ignored")
			}
		}
		if rec.Code != 200 || !found {
			t.Fatalf("no match for %q: %s", q, rec.Body)
		}
	}
	for _, status := range []string{"queued", "running", "verified", "partial", "failed", "couldnt_run"} {
		if rec := call(h, "GET", "/api/v1/runs?status="+status, "", cookie, ""); rec.Code != 200 {
			t.Fatalf("valid status rejected: %s", status)
		}
	}
	for _, q := range []string{"no-such-run", "%", "_"} {
		rec := call(h, "GET", "/api/v1/runs?q="+url.QueryEscape(q), "", cookie, "")
		if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"runs":[]`) {
			t.Fatalf("literal query %q: %s", q, rec.Body)
		}
	}
}
