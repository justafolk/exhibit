package evidence

import (
	"encoding/json"
	"errors"
	"path"
	"regexp"
	"strings"
	"time"
)

const MaxCIFileBytes int64 = 128 << 20
const MaxCIRunBytes int64 = 512 << 20

var RepositoryPattern = regexp.MustCompile(`^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`)
var hashPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)

type CIFile struct {
	ID        string `json:"id"`
	Path      string `json:"path"`
	MediaType string `json:"mediaType"`
	Bytes     int64  `json:"bytes"`
	SHA256    string `json:"sha256"`
	Uploaded  bool   `json:"uploaded"`
}
type CIAssertion struct {
	Label  string `json:"label"`
	Status string `json:"status"`
}
type CISubmission struct {
	Repository      string          `json:"repository"`
	PullRequest     int             `json:"pullRequest"`
	Title           string          `json:"title"`
	HeadSHA         string          `json:"headSha"`
	WorkflowRunID   int64           `json:"workflowRunId"`
	Attempt         int             `json:"attempt"`
	StartedAt       time.Time       `json:"startedAt"`
	DurationSeconds int             `json:"durationSeconds"`
	Outcome         string          `json:"outcome"`
	Assertions      []CIAssertion   `json:"assertions"`
	NotCovered      []string        `json:"notCovered"`
	Manifest        json.RawMessage `json:"manifest"`
	CodexReport     json.RawMessage `json:"codexReport"`
	Workflow        json.RawMessage `json:"workflow"`
	Files           []CIFile        `json:"files"`
}

func ValidateCI(c CISubmission) error {
	invalid := errors.New("invalid CI submission: expected bounded provenance, JSON reports and unique safe file paths")
	if !RepositoryPattern.MatchString(c.Repository) || len(c.Repository) > 200 || c.PullRequest <= 0 || !shaPattern.MatchString(c.HeadSHA) || c.WorkflowRunID <= 0 || c.Attempt < 1 || c.Attempt > 10000 || len(strings.TrimSpace(c.Title)) == 0 || len(c.Title) > 300 || c.StartedAt.IsZero() || c.StartedAt.After(time.Now().Add(5*time.Minute)) || c.DurationSeconds < 0 || c.DurationSeconds > 86400 {
		return invalid
	}
	switch c.Outcome {
	case "success", "failure", "cancelled", "skipped":
	default:
		return invalid
	}
	if len(c.Assertions) > 2000 || c.Assertions == nil || c.NotCovered == nil || len(c.NotCovered) > 200 || len(c.Files) > 500 || len(c.Files) == 0 {
		return invalid
	}
	for _, a := range c.Assertions {
		if len(a.Label) == 0 || len(a.Label) > 1000 || (a.Status != "passed" && a.Status != "failed" && a.Status != "skipped") {
			return invalid
		}
	}
	for _, gap := range c.NotCovered {
		if len(gap) > 2000 {
			return invalid
		}
	}
	for _, raw := range []json.RawMessage{c.Manifest, c.CodexReport, c.Workflow} {
		if len(raw) == 0 || !json.Valid(raw) {
			return invalid
		}
	}
	seen := map[string]bool{}
	var total int64
	for _, f := range c.Files {
		if f.ID != "" || f.Uploaded || f.Path == "" || len(f.Path) > 500 || strings.ContainsAny(f.Path, "\\\x00\r\n") || strings.HasPrefix(f.Path, "/") || path.Clean(f.Path) != f.Path || f.Path == "." || strings.Contains(f.Path, ":") || f.Path == ".." || strings.HasPrefix(f.Path, "../") || seen[f.Path] || !hashPattern.MatchString(f.SHA256) || f.Bytes <= 0 || f.Bytes > MaxCIFileBytes {
			return invalid
		}
		switch f.MediaType {
		case "video/webm", "video/mp4", "image/png", "image/gif", "image/jpeg", "application/zip", "application/json", "text/plain", "text/markdown", "text/html", "application/xml":
		default:
			return invalid
		}
		total += f.Bytes
		seen[f.Path] = true
	}
	if total > MaxCIRunBytes {
		return invalid
	}
	return nil
}
