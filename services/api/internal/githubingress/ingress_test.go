package githubingress

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
	"testing"
)

func sign(payload []byte) string {
	mac := hmac.New(sha256.New, []byte("test-only-webhook-secret"))
	_, _ = mac.Write(payload)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}

func TestGitHubSignatureVector(t *testing.T) {
	// Published by GitHub's validating-webhook-deliveries documentation.
	sig := "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17"
	if err := VerifySignature([]byte("It's a Secret to Everybody"), []byte("Hello, World!"), sig); err != nil {
		t.Fatal(err)
	}
	for name, test := range map[string]struct{ secret, body, signature string }{
		"empty secret": {"", "Hello, World!", sig},
		"changed body": {"It's a Secret to Everybody", "Hello, World!\n", sig},
		"wrong secret": {"wrong", "Hello, World!", sig},
		"missing":      {"secret", "body", ""},
		"legacy":       {"secret", "body", "sha1=" + strings.Repeat("a", 40)},
		"non hex":      {"secret", "body", "sha256=" + strings.Repeat("z", 64)},
		"extra header": {"secret", "body", sig + "," + sig},
	} {
		t.Run(name, func(t *testing.T) {
			if !errors.Is(VerifySignature([]byte(test.secret), []byte(test.body), test.signature), ErrSignature) {
				t.Fatal("accepted invalid signature")
			}
		})
	}
}

const deliveryID = "39b3fabc-24a7-42a4-a9c7-0c9cd6aa0001"
const head = "0123456789abcdef0123456789abcdef01234567"
const prPayload = `{"action":"ready_for_review","installation":{"id":10},"repository":{"id":20,"full_name":"acme/storefront","fork":false},"sender":{"id":30},"pull_request":{"number":42,"draft":false,"state":"open","head":{"sha":"` + head + `","repo":{"id":20,"fork":false}},"base":{"repo":{"id":20}}}}`
const commentPayload = `{"action":"created","installation":{"id":10},"repository":{"id":20,"full_name":"acme/storefront"},"sender":{"id":30},"issue":{"number":42,"pull_request":{"url":"https://api.github.com/repos/acme/storefront/pulls/42"}},"comment":{"body":"/evidence"}}`

func validate(event, payload string) (Candidate, error) {
	body := []byte(payload)
	return ValidateDelivery([]byte("test-only-webhook-secret"), deliveryID, event, sign(body), body)
}

func TestExplicitTriggers(t *testing.T) {
	for _, test := range []struct{ event, body string }{{"pull_request", prPayload}, {"issue_comment", commentPayload}} {
		candidate, err := validate(test.event, test.body)
		if err != nil {
			t.Fatal(err)
		}
		if candidate.PullRequest != 42 || candidate.ActorID != 30 || candidate.DeliveryID != deliveryID || len(candidate.PayloadSHA256) != 64 {
			t.Fatalf("wrong candidate: %+v", candidate)
		}
	}
	for name, test := range map[string]struct{ event, body string }{
		"every push":                {"push", prPayload},
		"synchronize":               {"pull_request", strings.Replace(prPayload, "ready_for_review", "synchronize", 1)},
		"fork":                      {"pull_request", strings.ReplaceAll(prPayload, `"fork":false`, `"fork":true`)},
		"different head repository": {"pull_request", strings.Replace(prPayload, `"repo":{"id":20,"fork":false}`, `"repo":{"id":21,"fork":false}`, 1)},
		"draft":                     {"pull_request", strings.Replace(prPayload, `"draft":false`, `"draft":true`, 1)},
		"edited comment":            {"issue_comment", strings.Replace(commentPayload, "created", "edited", 1)},
		"comment arguments":         {"issue_comment", strings.Replace(commentPayload, `"/evidence"`, `"/evidence run shell"`, 1)},
		"ordinary issue":            {"issue_comment", strings.Replace(commentPayload, `"pull_request":{"url":"https://api.github.com/repos/acme/storefront/pulls/42"}`, `"pull_request":null`, 1)},
		"missing installation":      {"pull_request", strings.Replace(prPayload, `"id":10`, `"id":0`, 1)},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := validate(test.event, test.body); !errors.Is(err, ErrIneligible) {
				t.Fatalf("expected rejection, got %v", err)
			}
		})
	}
}

func TestBodyValidation(t *testing.T) {
	for _, body := range []string{"null", "[]", "{}{}", strings.Repeat("x", MaxPayloadBytes+1)} {
		if _, err := validate("pull_request", body); !errors.Is(err, ErrDelivery) {
			t.Fatalf("expected invalid delivery, got %v", err)
		}
	}
	body := []byte(prPayload)
	if _, err := ValidateDelivery([]byte("test-only-webhook-secret"), "", "pull_request", sign(body), body); !errors.Is(err, ErrDelivery) {
		t.Fatal("missing delivery ID accepted")
	}
	if _, err := ValidateDelivery([]byte("test-only-webhook-secret"), deliveryID, "pull_request", "bad", []byte("bad JSON")); !errors.Is(err, ErrSignature) {
		t.Fatal("signature must be checked before parsing")
	}
}

func TestTrustedPolicyAndStaleSHA(t *testing.T) {
	candidate, err := validate("pull_request", prPayload)
	if err != nil {
		t.Fatal(err)
	}
	policy := Policy{InstallationID: 10, RepositoryID: 20, AllowedActorIDs: []int64{30}}
	facts := ResolvedPullRequest{InstallationID: 10, RepositoryID: 20, HeadRepositoryID: 20, Number: 42, HeadSHA: head, Open: true, ActorID: 30, ActorCanWrite: true}
	if actual, err := ReviewCandidate(candidate, policy, facts); err != nil || actual != head {
		t.Fatalf("review failed: %s %v", actual, err)
	}
	for name, mutate := range map[string]func(*ResolvedPullRequest){
		"wrong installation":        func(p *ResolvedPullRequest) { p.InstallationID = 99 },
		"wrong repository":          func(p *ResolvedPullRequest) { p.RepositoryID = 99 },
		"fork":                      func(p *ResolvedPullRequest) { p.Fork = true },
		"different head repository": func(p *ResolvedPullRequest) { p.HeadRepositoryID = 99 },
		"stale head":                func(p *ResolvedPullRequest) { p.HeadSHA = strings.Repeat("a", 40) },
		"closed":                    func(p *ResolvedPullRequest) { p.Open = false },
		"draft":                     func(p *ResolvedPullRequest) { p.Draft = true },
		"no write permission":       func(p *ResolvedPullRequest) { p.ActorCanWrite = false },
		"different actor":           func(p *ResolvedPullRequest) { p.ActorID = 99 },
		"different PR":              func(p *ResolvedPullRequest) { p.Number = 99 },
	} {
		t.Run(name, func(t *testing.T) {
			changed := facts
			mutate(&changed)
			if _, err := ReviewCandidate(candidate, policy, changed); !errors.Is(err, ErrPolicy) {
				t.Fatal("policy bypass")
			}
		})
	}
	policy.AllowedActorIDs = nil
	if _, err := ReviewCandidate(candidate, policy, facts); !errors.Is(err, ErrPolicy) {
		t.Fatal("empty allowlist accepted")
	}
}
