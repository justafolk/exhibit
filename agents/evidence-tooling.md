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

### One-command recording for a coding agent

From a clean, committed, trusted checkout with dependencies and Chromium installed:

```sh
npm run evidence:record
# Optional test-title filter within this repository's sample suite:
npm run evidence:record -- --grep 'sample reports'
```

This automatically records videos and traces, invokes the existing collector, and
prints JSON with the commit, browser/collection exit codes and local bundle paths.
Each run writes a new `.local/agent-captures/<run-id>/` directory. No artifact is
uploaded. Browser failures still trigger collection and still fail the command.
Collector failure cannot produce a successful command or claim a valid manifest.
A dirty checkout is rejected before starting a browser. `npm run` itself prints a
banner; callers needing only JSON can use `npm run --silent evidence:record`.

This is a repository self-test offering, not a general customer runner, hosted
recording API, published npm package, or trust attestation. The dashboard's agent
setup page provides copyable/downloadable instructions. Keep staging credentials
out of this workflow. See `docs/agent-experience.md` for the integration roadmap.

## Opt-in sample PR evidence (`agent-test`)

The composite action `.github/actions/sample-pr-evidence` adds a bounded customer-side CI integration for `justafolk/sample-project-exhibit`. It has two modes: `gate` emits eligibility and the immutable PR head SHA; `collect` reads real Playwright JSON, checks startup/checkout provenance and hashes actual browser artifacts, then writes a manifest and Markdown report to the job summary. This is a sample CI integration, not a webhook receiver, durable scheduler, customer staging runner, or trusted verifier.

The sample caller listens for `opened`, `reopened`, `synchronize`, `labeled` and `ready_for_review`. Eligible PRs must be open, non-draft, same-repository, and carry the exact `agent-test` label. Adding another label does not rerun it. Removing `agent-test` disables later runs; converting to ready-for-review runs a labelled draft. Forks and `pull_request_target` are rejected. The gate is evaluated before checkout or npm installation. Each attempt uses a fresh GitHub-hosted runner with read-only repository permissions and no inherited secrets; it checks out the event's head SHA rather than GitHub's synthetic merge commit. Old attempts retain their original head SHA instead of claiming to test newer commits.

The sample workflow pins this action to a full Exhibit commit. Merge the Exhibit support PR before the sample integration PR, then update the pin through review when tooling changes. For a private Exhibit repository, GitHub must allow this repository's actions to be shared with the sample repository under **Settings → Actions → General → Access** (the appropriate same-owner sharing option). GitHub handles fetching shared private actions; a broad personal token or `secrets: inherit` is not needed. Repository/organization policy must also allow the pinned GitHub actions. The action is intentionally restricted to this named sample repository, not arbitrary customer code.

The sample runs both API tests and browser tests. API and browser step outcomes are recorded separately in the summary; either failure fails the job. Browser assertions, videos, traces and screenshots appear in a seven-day artifact bundle with the PR number, actual SHA, workflow run ID and attempt. Collection runs after browser failures when a report exists, and missing/invalid capture data fails collection. Startup or install failures still get an explicit stage summary without fabricated assertions or manifests. A passing suite remains **Unverified**; expected-failure tests are skipped coverage, not successful evidence. No deployment, production payment, customer secret, PR comment, trusted verdict or Exhibit database run is created.

Local checks:

```sh
python3 -m unittest discover -s scripts -p 'test_*.py'
# From a clean, committed sample checkout after a capture-enabled browser run:
GITHUB_EVENT_NAME=pull_request GITHUB_EVENT_PATH=/path/to/sample-event.json \
GITHUB_RUN_ID=123 GITHUB_RUN_ATTEMPT=1 \
PLAYWRIGHT_JSON=.local/evidence/playwright.json ARTIFACT_ROOT=test-results \
MANIFEST_PATH=.local/evidence/manifest.json GITHUB_STEP_SUMMARY=.local/evidence/summary.md \
python3 /path/to/exhibit/scripts/pr_evidence.py collect
```

The event must describe this sample repository, label and actual checked-out SHA. The collector never executes commands from the event, runbook, PR title or report. This self-reported capture is not a security boundary against PR code changing files on its runner.

### Video recordings and optional Codex CLI review

The sample records every browser test at 1280×720 and retains screenshots and traces, including failures. The action writes `recordings.json` beside the manifest, with the PR, commit, run/attempt and each original video's path, byte count and SHA-256. Paths are relative to `test-results/` inside the downloaded artifact. `require-video` defaults to `true`; missing video fails collection while preserving the honest manifest/report with its coverage gap. Setting it to `false` supports deliberately non-recording checks without pretending video exists.

The separate `.github/actions/codex-evidence-review` action uses **Codex CLI**, pinned to `@openai/codex@0.164.0`, for advisory analysis of recorded evidence metadata and coverage gaps. It can authenticate using a Codex **ChatGPT login**, so an OpenAI API key is not required. An unattended run still needs authentication: on a trusted local machine, run `codex login`, then store that CLI's `auth.json` contents securely as the sample repository's **`CODEX_AUTH_JSON` GitHub Actions secret**. Never put it in source, an artifact, a PR, or chat. This is a credential for the ChatGPT account; revoke/rotate it when needed and observe that account's usage limits. The CLI needs a supported account/plan, valid refresh credentials and access to Codex's service. GitHub runners do not inherit a developer's or this onboarding session's login.

The sample invokes the agent in a separate fresh job with read-only GitHub permissions and no PR checkout. It downloads only the named same-run/attempt evidence bundle. Exhibit checks the PR number, exact SHA, run, attempt and original artifact hashes, then passes a bounded, allowlisted JSON summary to Codex. No artifact scripts, ZIP contents, PR instructions or Markdown are executed. Codex runs as a dedicated user without sudo, with no approval escalation, no model-command network access and read-only permissions; the sandbox denies reads of its authentication directory and `/proc`. Native CLI authentication stays outside the evidence workspace, is file-permission protected, and is deleted after the attempt. Raw provider logs and authentication never enter artifacts. A 300-second process timeout and ten-minute job limit bound the attempt; account usage/billing limits remain account settings.

A missing `CODEX_AUTH_JSON` explicitly produces **not configured**, with no model call or fabricated review. Configured authentication, collection, sandbox or agent failures fail the review job. Completed advice is saved as `codex-review/review.md`, added to the job summary and uploaded separately for seven days. Advice cannot alter the deterministic manifest, assertions or verdict. Codex reviews assertions and recording metadata; this integration does **not** claim that the agent watched video contents or drove a browser. Agent execution with credentials requires separate live validation once the secret is configured.

### Codex CI output reports

Every started Codex review action now publishes `report.html`, `report.md` and `report.json` beside the optional original `review.md`. The standalone HTML is safe to open locally, without scripts or external assets; Markdown appears in the job summary and JSON supports automated consumers. Action outputs `report-html`, `report-markdown`, `report-json` and `status` expose their paths/outcome.

Reports show completed, failed or not-configured status, PR/head SHA, workflow run/attempt, observed timing, whether the source bundle was validated, deterministic browser assertion counts, original recording/artifact counts, model advice and coverage limits. API test outcomes remain in the separate evidence job. Counts are absent when evidence was not validated; a completed agent review never changes a failed test or Unverified evidence into a pass.

The action finalizer runs even after setup/CLI failures and writes a failure report without inventing a review. The caller uploads the entire report directory with `always()`, so failed/not-configured actions also have downloadable output. A job that never starts or is terminated before reporting cannot promise a report. Only fixed failure categories, allowlisted provenance and redacted final advice are included; credentials and raw provider logs are excluded. HTML escapes all model text and Markdown fences cannot be escaped by a generated response.

### Combined frontend recording and backend API evidence

Callers can set `require-api: 'true'` and supply `api-junit` / `api-capture` (defaults `.local/evidence/api-tests.xml` and `.local/evidence/api-capture.json`). The sample's `npm run test:api:evidence` runs actual Node HTTP tests with its built-in JUnit reporter, records the clean startup SHA/timing and underlying exit code, and returns that exit code unchanged. It does not turn failures into successful evidence.

Exhibit bounds and parses the JUnit, rejects entity/DTD declarations and missing/zero/all-skipped suites, validates the same clean head SHA and normal runner completion, and preserves individual passed/failed/skipped cases. Nonzero runner exits cannot produce a passing result. Backend assertions use `api-` IDs in the existing manifest; the original JUnit and provenance are hashed under `test-results/api/` alongside the original browser captures. Combined timing spans both stages. API failures set the manifest termination to failed and remain failed workflow stages.

The Codex CI HTML/Markdown/JSON report now includes separately counted frontend browser assertions and backend API assertions, with individual test names/outcomes. Older captures without API results say not captured rather than claiming zero passed. Agent advice is separate and cannot override a failed API test. This remains secret-free sample CI, not production or deployed staging verification.
