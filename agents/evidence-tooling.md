# Evidence tooling and the GitHub boundary

These tools prepare requests, inspect local artifact bytes and generate honest
reports. They do not provision a runner, authorize staging access, schedule jobs,
post GitHub checks or certify evidence. The examples are deliberately labelled
samples. No tool executes commands found in request JSON, PR text or runbooks.

## Request preparation

```sh
python3 scripts/evidence_tool.py request agents/examples/request.json
```

Schema version 1 requires exactly these fields:

| Field                       | Requirement                                                        |
| --------------------------- | ------------------------------------------------------------------ |
| `schemaVersion`, `sample`   | Version `1`, explicit boolean sample provenance                    |
| `repository`, `pullRequest` | `owner/repository`, positive integer PR number                     |
| `headSha`                   | Full lowercase 40-character commit SHA                             |
| `flowId`, `flowRevision`    | Stable identifier and immutable full SHA                           |
| `runbookRef`                | Normalized repository-relative path followed by `@` and a full SHA |
| `testTenant`, `environment` | Dedicated tenant reference, exactly `staging`                      |
| `budgets.maxRuntimeSeconds` | Positive integer, at most 3,600 seconds                            |
| `budgets.maxArtifactBytes`  | Positive integer, at most 512 MiB                                  |

The CLI checks syntax and bounds only. It does not resolve any identifier, approve
a runbook, verify a tenant, or establish permissions. Secret **references** belong
in operator configuration; request files must not contain credentials. Unknown
fields, duplicate JSON keys, control characters and oversized JSON are rejected.

## Manifests and reports

```sh
python3 scripts/evidence_tool.py manifest agents/examples/manifest.json
python3 scripts/evidence_tool.py report agents/examples/manifest.json
```

For a sample integrity check against an actual harmless text fixture:

```sh
python3 scripts/evidence_tool.py manifest agents/examples/artifact-manifest.json \
  --artifact-root agents/examples/artifacts
```

A manifest records a run ID, attempt, repository/PR, exact head SHA, flow version,
UTC start/end timestamps, claimed origin, termination, assertion results, artifact
metadata, coverage gaps and cleanup outcome. `agents/examples/manifest.json` is the
complete version 1 shape. `pullRequest` may be `null` only for a self-test with no
associated PR. Empty assertions and missing artifacts are allowed so failed boots
and unavailable captures remain reportable; they never imply success.

Validate an expected commit and actual local bytes before presenting a report:

```sh
python3 scripts/evidence_tool.py report manifest.json \
  --expected-sha 0123456789abcdef0123456789abcdef01234567 \
  --artifact-root ./private-artifacts
```

The verifier checks relative paths, file sizes and SHA-256 digests. It rejects
symlinks, traversal, missing files, duplicate artifact paths and a stale expected
SHA. Files are read locally; the tool never follows artifact URLs or uploads data.
Use a private immutable directory while validating: these checks are not a
security boundary against a hostile process changing files concurrently.

Outcome is derived from termination, assertions and cleanup. Failed assertions
cannot produce a passing outcome. A completely passing self-reported document
still produces **Unverified**. There is deliberately no accepted `verdict` field,
and `origin: runner` cannot grant trust. Byte integrity does not establish
redaction, collector identity, isolation, approval or completeness. A future
trusted collector must independently establish those facts before a real
`verified` verdict can exist.

Markdown reports escape untrusted labels, retain the full SHA, show all recorded
assertions and gaps, distinguish declared hashes from checked local bytes, and
include cleanup outcomes. Do not publish a report or artifacts until the relevant
access and redaction requirements are satisfied.

## Signed delivery helpers

`services/api/internal/githubingress` is a tested library; **no webhook endpoint is
mounted by this change**. It provides:

1. SHA-256 HMAC verification of original request bytes using constant-time digest
   comparison. Empty secrets, legacy signatures and malformed signatures fail.
2. Bounded delivery parsing for `pull_request.ready_for_review` and newly created
   PR comments whose complete body is `/evidence`. Synchronize events, arbitrary
   comments, draft/closed PRs and fork heads are rejected where the event has those
   facts.
3. Review against operator-controlled installation/repository IDs, an actor ID
   allowlist, and independently resolved current PR facts. Actor write permission,
   same-repository head, open/non-draft status and exact current SHA are required.
   Comment triggers resolve their head from the current PR, not the comment body.

A future HTTP receiver must reject duplicate signature headers, read with a
strict body limit, and validate the signature before any processing. It must also
persist the normalized delivery ID and payload SHA-256 atomically; duplicate IDs
return the same event, while an ID with different bytes must fail. These helpers
**do not implement durable replay handling**. `ResolvedPullRequest` must come from
a fresh installation-authenticated GitHub API request, never the submitted JSON.
No API resolver is implemented here. Recheck the authoritative head before actual
execution and reporting so a later push cannot make stale results appear current.

GitHub documents the [signature protocol](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
and [workflow trigger semantics](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).
The test suite includes GitHub's published signature test vector.

## GitHub Actions

The `Evidence tooling` workflow performs validation on an explicit ready-for-review
event for a same-repository PR with a trusted association, or a manual dispatch on
the default branch. It checks out the immutable base commit for PR events and the
immutable dispatch commit for manual runs. It never checks out or runs the PR head.
The workflow only has `contents: read`, uses pinned action commits, retains bounded
timeouts and concurrency, and has no staging credentials. Author association is a
coarse workflow filter, not the execution policy used by the library.

For a local validation run:

```sh
python3 -m unittest discover -s scripts -p 'test_evidence_*.py'
go test -race ./services/api/internal/githubingress
```

The existing main CI also discovers the Python and Go tests. It continues to test
ordinary PR code with no staging credentials. The separate evidence workflow
validates trusted base tooling, so changes to this workflow become effective after
they land on the default branch.

### Optional sample browser recording

Manually dispatch `Evidence tooling` on the default branch and enable
`capture_self_test`. This runs Exhibit's **own sample-mode browser suite**, with
`EXHIBIT_CAPTURE=1` enabling video and traces. It uploads captures, a SHA-256
manifest and a Markdown report for seven days, on success or failure. Browser
failure remains a failed job even if collection succeeds. Missing test output
fails collection rather than inventing a recording.

The collector requires the requested SHA to match a clean checkout, reads
actual Playwright results and captures, and binds their hashes to that checkout.
The manifest remains `sample: true`, `origin: self_test`, with no associated PR.
These are regression-test recordings, not evidence that any customer's change ran.

To collect a completed local sample suite from a clean commit:

```sh
EXHIBIT_CAPTURE=1 PLAYWRIGHT_JSON_OUTPUT_FILE=.local/self-test/playwright.json \
  npm run test:e2e -- --reporter=json
python3 scripts/evidence_capture.py \
  --playwright-json .local/self-test/playwright.json \
  --artifact-root test-results \
  --output .local/self-test/manifest.json \
  --repository owner/exhibit \
  --sha FULL_CHECKED_OUT_COMMIT_SHA \
  --run-id self-test-local > .local/self-test/report.md
```

This workflow is only suitable for the secret-free sample test suite. Capturing
real tenant sessions requires independent redaction and private artifact delivery,
which are not implemented. The collector does not blur, redact, trim or alter
original captures. Report and manifest generation never marks a manual recording
or edited presentation as verified evidence.
