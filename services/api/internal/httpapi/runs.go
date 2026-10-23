package httpapi

import (
	"net/http"
	"net/url"
	"strings"
	"unicode/utf8"

	"github.com/justafolk/exhibit/services/api/internal/store"
)

func runFilter(w http.ResponseWriter, r *http.Request) (store.RunFilter, bool) {
	query, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		failure(w, 400, "invalid run query encoding")
		return store.RunFilter{}, false
	}
	for key, values := range query {
		if (key != "q" && key != "status") || len(values) != 1 {
			failure(w, 400, "only one q and one status query parameter are allowed")
			return store.RunFilter{}, false
		}
	}
	filter := store.RunFilter{Query: strings.TrimSpace(query.Get("q")), Status: query.Get("status")}
	if len(query.Get("q")) > 200 || !utf8.ValidString(filter.Query) {
		failure(w, 400, "search must be valid UTF-8 and at most 200 bytes")
		return store.RunFilter{}, false
	}
	switch filter.Status {
	case "", "queued", "running", "verified", "partial", "failed", "couldnt_run":
	default:
		failure(w, 400, "unknown run status")
		return store.RunFilter{}, false
	}
	return filter, true
}
