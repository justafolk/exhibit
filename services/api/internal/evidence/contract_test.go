package evidence

import "testing"

func validContract() Contract {
	return Contract{Repository: "acme/shop", PullRequest: 42, HeadSHA: "0123456789abcdef0123456789abcdef01234567", ChangeKind: "frontend", Environment: "staging", FlowIDs: []string{"checkout"}, RunbookRef: "runbooks/shop@v1", TestTenant: "test-exhibit"}
}
func TestEvaluate(t *testing.T) {
	tests := []struct {
		name    string
		mutate  func(*Contract)
		state   string
		missing string
	}{
		{"complete", func(c *Contract) {}, "ready", ""},
		{"production forbidden", func(c *Contract) { c.Environment = "production" }, "not_testable", ""},
		{"migration isolation", func(c *Contract) { c.ChangeKind = "migration" }, "not_testable", ""},
		{"docs", func(c *Contract) { c.ChangeKind = "docs" }, "not_testable", ""},
		{"short sha", func(c *Contract) { c.HeadSHA = "abc" }, "needs_info", "headSha"},
		{"missing tenant", func(c *Contract) { c.TestTenant = " " }, "needs_info", "testTenant"},
		{"invalid flow", func(c *Contract) { c.FlowIDs = []string{""} }, "needs_info", "flowIds"},
		{"missing staging", func(c *Contract) { c.Environment = "" }, "needs_info", "environment"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := validContract()
			tt.mutate(&c)
			got := Evaluate(c)
			if got.State != tt.state {
				t.Fatalf("got %s, want %s", got.State, tt.state)
			}
			if tt.missing != "" {
				found := false
				for _, field := range got.Missing {
					if field == tt.missing {
						found = true
					}
				}
				if !found {
					t.Fatalf("missing %s not in %v", tt.missing, got.Missing)
				}
			}
		})
	}
}
