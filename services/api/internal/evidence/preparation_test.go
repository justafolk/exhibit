package evidence

import (
	"strings"
	"testing"
)

func TestFlowValidation(t *testing.T) {
	valid := FlowInput{Name: "Checkout", Description: "One bounded flow", Preconditions: []string{"Dedicated test tenant"}, Assertions: []string{"Order confirmation is visible"}, Cleanup: "Delete run-tagged carts", RunbookRef: "agents/checkout.yaml@" + strings.Repeat("a", 40)}
	if err := ValidateFlow(valid); err != nil {
		t.Fatal(err)
	}
	for _, change := range []func(*FlowInput){func(f *FlowInput) { f.Name = " " }, func(f *FlowInput) { f.Assertions = nil }, func(f *FlowInput) { f.Preconditions = []string{""} }, func(f *FlowInput) { f.Cleanup = "" }, func(f *FlowInput) { f.RunbookRef = "main" }, func(f *FlowInput) { f.Description = strings.Repeat("x", 2001) }} {
		input := valid
		change(&input)
		if ValidateFlow(input) == nil {
			t.Fatalf("invalid flow accepted: %#v", input)
		}
	}
}
func TestDraftPreservesIncompleteValues(t *testing.T) {
	for _, input := range []Contract{{}, {Repository: "invalid", HeadSHA: "incomplete", Environment: "production", FlowIDs: []string{""}}} {
		if err := ValidateDraft(input); err != nil {
			t.Fatal(err)
		}
	}
	if Evaluate(Contract{}).State != "needs_info" {
		t.Fatal("empty draft claims readiness")
	}
	for _, input := range []Contract{{PullRequest: -1}, {HeadSHA: strings.Repeat("a", 101)}, {FlowIDs: make([]string, 21)}, {TestTenant: strings.Repeat("x", 101)}} {
		if ValidateDraft(input) == nil {
			t.Fatal("unbounded draft accepted")
		}
	}
}
