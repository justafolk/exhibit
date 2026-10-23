package evidence

import (
	"regexp"
	"strings"
)

type Contract struct {
	Repository  string   `json:"repository"`
	PullRequest int      `json:"pullRequest"`
	HeadSHA     string   `json:"headSha"`
	ChangeKind  string   `json:"changeKind"`
	Environment string   `json:"environment"`
	FlowIDs     []string `json:"flowIds"`
	RunbookRef  string   `json:"runbookRef"`
	TestTenant  string   `json:"testTenant"`
}

type Evaluation struct {
	State   string   `json:"state"`
	Missing []string `json:"missing"`
	Reason  string   `json:"reason"`
}

var shaPattern = regexp.MustCompile(`^[a-f0-9]{40}$`)
var repoPattern = regexp.MustCompile(`^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`)

// Evaluate checks supplied metadata, not identity, permission or evidence truth.
// A future trusted orchestrator must independently resolve GitHub identity/head SHA,
// approval, runbook version, catalog IDs, tenant credentials and execution policy.
func Evaluate(c Contract) Evaluation {
	result := Evaluation{State: "needs_info", Missing: []string{}}
	if c.Environment != "" && c.Environment != "staging" {
		result.State = "not_testable"
		result.Reason = "Only staging is eligible; production data is never allowed."
		return result
	}
	if c.ChangeKind == "docs" || c.ChangeKind == "migration" {
		result.State = "not_testable"
		result.Reason = "Docs need no runtime evidence; migrations require a separately approved isolated database."
		return result
	}
	required := []struct {
		name  string
		valid bool
	}{
		{"repository", repoPattern.MatchString(c.Repository)},
		{"pullRequest", c.PullRequest > 0},
		{"headSha", shaPattern.MatchString(c.HeadSHA)},
		{"changeKind", c.ChangeKind == "frontend" || c.ChangeKind == "backend" || c.ChangeKind == "fullstack"},
		{"environment", c.Environment == "staging"},
		{"runbookRef", strings.TrimSpace(c.RunbookRef) != ""},
		{"testTenant", strings.TrimSpace(c.TestTenant) != ""},
	}
	for _, field := range required {
		if !field.valid {
			result.Missing = append(result.Missing, field.name)
		}
	}
	validFlows := len(c.FlowIDs) > 0
	for _, id := range c.FlowIDs {
		if strings.TrimSpace(id) == "" {
			validFlows = false
		}
	}
	if !validFlows {
		result.Missing = append(result.Missing, "flowIds")
	}
	if len(result.Missing) == 0 {
		result.State = "ready"
		result.Reason = "Contract is complete. Execution still requires trusted identity, catalog resolution, approved runbook and budget checks."
	} else {
		result.Reason = "Supply valid values for the listed fields."
	}
	return result
}
