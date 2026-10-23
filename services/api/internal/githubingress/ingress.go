// Package githubingress validates signed GitHub delivery candidates. It does not
// schedule work or grant execution authority. A receiver still needs durable
// delivery deduplication and independently resolved GitHub API facts.
package githubingress

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
)

var (
	ErrSignature  = errors.New("invalid webhook signature")
	ErrDelivery   = errors.New("invalid webhook delivery")
	ErrIneligible = errors.New("webhook is not an eligible evidence request")
	ErrPolicy     = errors.New("evidence request requires trusted policy review")
)

const MaxPayloadBytes = 1 << 20

var uuid = regexp.MustCompile(`^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$`)
var sha = regexp.MustCompile(`^[a-f0-9]{40}$`)

// VerifySignature checks X-Hub-Signature-256 against the original, unmodified
// request bytes. The HTTP receiver must reject duplicate signature headers and
// bound reads before calling this function. Empty secrets fail closed.
func VerifySignature(secret, payload []byte, signature string) error {
	if len(secret) == 0 || len(signature) != 71 || !strings.HasPrefix(signature, "sha256=") {
		return ErrSignature
	}
	provided, err := hex.DecodeString(signature[7:])
	if err != nil {
		return ErrSignature
	}
	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write(payload)
	if !hmac.Equal(provided, mac.Sum(nil)) {
		return ErrSignature
	}
	return nil
}

type repository struct {
	ID       int64  `json:"id"`
	FullName string `json:"full_name"`
	Fork     bool   `json:"fork"`
}

type webhook struct {
	Action       string `json:"action"`
	Installation struct {
		ID int64 `json:"id"`
	} `json:"installation"`
	Repository repository `json:"repository"`
	Sender     struct {
		ID int64 `json:"id"`
	} `json:"sender"`
	PullRequest struct {
		Number int    `json:"number"`
		Draft  bool   `json:"draft"`
		State  string `json:"state"`
		Head   struct {
			SHA  string     `json:"sha"`
			Repo repository `json:"repo"`
		} `json:"head"`
		Base struct {
			Repo repository `json:"repo"`
		} `json:"base"`
	} `json:"pull_request"`
	Issue struct {
		Number      int             `json:"number"`
		PullRequest json.RawMessage `json:"pull_request"`
	} `json:"issue"`
	Comment struct {
		Body string `json:"body"`
	} `json:"comment"`
}

// Candidate is authenticated delivery metadata, not an execution grant. Persist
// DeliveryID with PayloadSHA256 atomically before downstream scheduling. Reusing
// an ID with a different payload must fail, and retries must return the same event.
type Candidate struct {
	DeliveryID     string
	PayloadSHA256  string
	Trigger        string
	InstallationID int64
	RepositoryID   int64
	Repository     string
	ActorID        int64
	PullRequest    int
	HeadSHA        string
}

// ValidateDelivery verifies the HMAC before parsing. Unknown GitHub fields are
// allowed because GitHub payloads evolve, but only these two explicit triggers
// are recognized. /evidence must be the complete newly-created comment body.
func ValidateDelivery(secret []byte, deliveryID, event, signature string, payload []byte) (Candidate, error) {
	var candidate Candidate
	if len(payload) == 0 || len(payload) > MaxPayloadBytes || !uuid.MatchString(deliveryID) {
		return candidate, ErrDelivery
	}
	if err := VerifySignature(secret, payload, signature); err != nil {
		return candidate, err
	}
	var body *webhook
	if err := json.Unmarshal(payload, &body); err != nil || body == nil {
		return candidate, ErrDelivery
	}
	if body.Installation.ID <= 0 || body.Repository.ID <= 0 || body.Repository.FullName == "" || body.Sender.ID <= 0 || body.Repository.Fork {
		return candidate, ErrIneligible
	}
	switch {
	case event == "pull_request" && body.Action == "ready_for_review":
		pr := body.PullRequest
		if pr.Draft || pr.State != "open" || pr.Number <= 0 || !sha.MatchString(pr.Head.SHA) || pr.Head.Repo.Fork || pr.Head.Repo.ID != body.Repository.ID || pr.Base.Repo.ID != body.Repository.ID {
			return candidate, ErrIneligible
		}
		candidate.PullRequest, candidate.HeadSHA = pr.Number, pr.Head.SHA
	case event == "issue_comment" && body.Action == "created":
		if body.Comment.Body != "/evidence" || body.Issue.Number <= 0 || len(body.Issue.PullRequest) == 0 || !strings.HasPrefix(string(body.Issue.PullRequest), "{") {
			return candidate, ErrIneligible
		}
		candidate.PullRequest = body.Issue.Number
	default:
		return candidate, ErrIneligible
	}
	digest := sha256.Sum256(payload)
	candidate.DeliveryID = strings.ToLower(deliveryID)
	candidate.PayloadSHA256 = hex.EncodeToString(digest[:])
	candidate.Trigger = event
	candidate.InstallationID = body.Installation.ID
	candidate.RepositoryID = body.Repository.ID
	candidate.Repository = body.Repository.FullName
	candidate.ActorID = body.Sender.ID
	return candidate, nil
}

// Policy must come from operator-controlled configuration, never PR text or the
// submitted runbook. IDs are used for authorization because names can change.
type Policy struct {
	InstallationID  int64
	RepositoryID    int64
	AllowedActorIDs []int64
}

// ResolvedPullRequest must come from a fresh authenticated GitHub API lookup,
// including installation access and actor permission. A caller must not construct
// it from the webhook alone. Comment events do not carry authoritative head facts.
type ResolvedPullRequest struct {
	InstallationID   int64
	RepositoryID     int64
	HeadRepositoryID int64
	Number           int
	HeadSHA          string
	Open             bool
	Draft            bool
	Fork             bool
	ActorID          int64
	ActorCanWrite    bool
}

// ReviewCandidate checks trusted facts and returns the current head SHA. It is
// deliberately NOT run authorization: reviewed runbooks, staging identity,
// budgets, isolation, replay protection and cleanup requirements remain separate.
func ReviewCandidate(candidate Candidate, policy Policy, resolved ResolvedPullRequest) (string, error) {
	if candidate.Trigger != "pull_request" && candidate.Trigger != "issue_comment" {
		return "", ErrPolicy
	}
	if policy.InstallationID <= 0 || policy.RepositoryID <= 0 || candidate.ActorID <= 0 || candidate.PullRequest <= 0 || candidate.InstallationID != policy.InstallationID || candidate.RepositoryID != policy.RepositoryID {
		return "", ErrPolicy
	}
	allowed := false
	for _, actorID := range policy.AllowedActorIDs {
		if actorID == candidate.ActorID {
			allowed = true
		}
	}
	if !allowed || !resolved.ActorCanWrite || resolved.ActorID != candidate.ActorID || resolved.InstallationID != policy.InstallationID || resolved.RepositoryID != policy.RepositoryID || resolved.HeadRepositoryID != policy.RepositoryID || resolved.Number != candidate.PullRequest || !resolved.Open || resolved.Draft || resolved.Fork || !sha.MatchString(resolved.HeadSHA) {
		return "", ErrPolicy
	}
	if candidate.Trigger == "pull_request" && candidate.HeadSHA != resolved.HeadSHA {
		return "", ErrPolicy
	}
	return resolved.HeadSHA, nil
}
