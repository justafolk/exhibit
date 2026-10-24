package evidence

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func validCI() CISubmission {
	return CISubmission{Repository: "acme/app", PullRequest: 1, Title: "Checkout", HeadSHA: strings.Repeat("a", 40), WorkflowRunID: 1, Attempt: 1, StartedAt: time.Now(), Outcome: "success", Assertions: []CIAssertion{}, NotCovered: []string{}, Manifest: json.RawMessage(`null`), CodexReport: json.RawMessage(`null`), Workflow: json.RawMessage(`{}`), Files: []CIFile{{Path: "browser/video.webm", MediaType: "video/webm", Bytes: 42, SHA256: strings.Repeat("a", 64)}}}
}
func TestCILimits(t *testing.T) {
	if err := ValidateCI(validCI()); err != nil {
		t.Fatal(err)
	}
	for name, change := range map[string]func(*CISubmission){
		"traversal": func(c *CISubmission) { c.Files[0].Path = "../escape" },
		"absolute":  func(c *CISubmission) { c.Files[0].Path = "/escape" },
		"backslash": func(c *CISubmission) { c.Files[0].Path = `test\escape` },
		"oversize":  func(c *CISubmission) { c.Files[0].Bytes = MaxCIFileBytes + 1 },
		"duplicate": func(c *CISubmission) { c.Files = append(c.Files, c.Files[0]) },
		"oversize-run": func(c *CISubmission) {
			for i := range 5 {
				f := c.Files[0]
				f.Path = strings.Repeat("a", i+1)
				f.Bytes = MaxCIFileBytes
				c.Files = append(c.Files, f)
			}
		},
		"executable":     func(c *CISubmission) { c.Files[0].MediaType = "application/javascript" },
		"forged-upload":  func(c *CISubmission) { c.Files[0].Uploaded = true },
		"forged-verdict": func(c *CISubmission) { c.Outcome = "verified" },
		"future":         func(c *CISubmission) { c.StartedAt = time.Now().Add(time.Hour) },
	} {
		t.Run(name, func(t *testing.T) {
			c := validCI()
			change(&c)
			if ValidateCI(c) == nil {
				t.Fatal("invalid submission allowed")
			}
		})
	}
}
