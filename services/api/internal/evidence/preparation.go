package evidence

import (
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"
)

// FlowInput describes authored preparation metadata. It is not reviewed policy
// and cannot approve a run or claim that any assertion has executed.
type FlowInput struct {
	Name          string   `json:"name"`
	Description   string   `json:"description"`
	Preconditions []string `json:"preconditions"`
	Assertions    []string `json:"assertions"`
	Cleanup       string   `json:"cleanup"`
	RunbookRef    string   `json:"runbookRef"`
}

func validPreparationText(value string) bool {
	return utf8.ValidString(value) && !strings.ContainsRune(value, 0)
}

var immutableRunbook = regexp.MustCompile(`^[^\s@]+@[0-9a-f]{40}$`)

func ValidateFlow(input FlowInput) error {
	for _, field := range []struct {
		name, value string
		min, max    int
	}{
		{"name", input.Name, 1, 120}, {"description", input.Description, 0, 2000}, {"cleanup", input.Cleanup, 1, 2000}, {"runbookRef", input.RunbookRef, 1, 512},
	} {
		if !validPreparationText(field.value) || len(strings.TrimSpace(field.value)) < field.min || len(field.value) > field.max {
			return fmt.Errorf("%s must contain %d–%d UTF-8 bytes", field.name, field.min, field.max)
		}
	}
	if !immutableRunbook.MatchString(input.RunbookRef) {
		return fmt.Errorf("runbook reference must use path@ followed by a full 40-character commit SHA")
	}
	for _, field := range []struct {
		name   string
		values []string
	}{{"preconditions", input.Preconditions}, {"assertions", input.Assertions}} {
		if len(field.values) < 1 || len(field.values) > 20 {
			return fmt.Errorf("%s must contain 1–20 entries", field.name)
		}
		for _, line := range field.values {
			if !validPreparationText(line) || strings.TrimSpace(line) == "" || len(line) > 500 {
				return fmt.Errorf("each %s entry must contain 1–500 UTF-8 bytes", field.name)
			}
		}
	}
	return nil
}

// ValidateDraft applies storage limits only. Incomplete or semantically invalid
// values remain editable; Evaluate reports their completeness, never authority.
func ValidateDraft(input Contract) error {
	for _, field := range []struct {
		name, value string
		max         int
	}{
		{"repository", input.Repository, 201}, {"headSha", input.HeadSHA, 100}, {"changeKind", input.ChangeKind, 32}, {"environment", input.Environment, 32}, {"runbookRef", input.RunbookRef, 512}, {"testTenant", input.TestTenant, 100},
	} {
		if !validPreparationText(field.value) || len(field.value) > field.max {
			return fmt.Errorf("%s must be valid UTF-8 and at most %d bytes", field.name, field.max)
		}
	}
	if input.PullRequest < 0 || input.PullRequest > 2147483647 {
		return fmt.Errorf("pull request must be between 0 and 2147483647; use 0 for an incomplete draft")
	}
	if len(input.FlowIDs) > 20 {
		return fmt.Errorf("flowIds must contain at most 20 entries")
	}
	for _, id := range input.FlowIDs {
		if !validPreparationText(id) || len(id) > 128 {
			return fmt.Errorf("each flow ID must be valid UTF-8 and at most 128 bytes")
		}
	}
	return nil
}
