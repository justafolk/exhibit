# Agent-first Exhibit: experience and feature research

Research checked 24 October 2026. These are product recommendations; the proposed
features below are not implemented unless explicitly marked available.

## Product decision

The agent is the producer. The human is the reviewer. Recording should happen
while the agent executes browser checks; a person should not need to share their
screen, create a recording record, author chapters, or fill out a contract first.

Target loop: agent changes code → executes approved checks with automatic capture
→ returns evidence on the exact commit → reviewer watches and inspects failures.
Approve repository/environment policy once; require another approval when the trust
boundary changes. Never interpret PR text or an agent-authored runbook as approval.

## Shipped experience in this change

- Four primary destinations: Reviews, Agent recordings, Agent setup, Settings.
- The home page leads with a review queue and existing run search/filter/report tools.
- One copy/download handoff gives a coding agent the actual local command.
- `npm run evidence:record` automatically enables videos/traces, runs Exhibit's
  sample Playwright suite, invokes the existing hash/manifest collector, and returns
  local bundle paths as JSON. Optional `--grep` selects tests. A failed browser or
  collector stage fails the command; collection is attempted even after test failure.
- Capture requires a clean committed checkout and records startup/head provenance.
  Output goes into a unique ignored directory so earlier artifacts cannot be reused.
- Repository/staging, flow definitions and contract forms remain available under
  advanced setup. They are not presented as prerequisites for the local command.
- The manual recorder remains optional and is clearly described as supplemental.

Available capture is **this repository's secret-free self-test**, not a general
customer runner or published SDK. It does not upload artifacts, populate hosted
playback, post PR checks, redact secrets, or certify verification. Sample edits are
session-local. Hosted automation must not be represented as working before it exists.

## What the research suggests

| Primary source                                                                           | Observed capability                                                                                        | Implication for Exhibit                                                                                                                              |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Playwright videos](https://playwright.dev/docs/videos)                                  | Per-test recording is configurable and videos are finalized on browser-context closure.                    | Make capture part of execution, retain failed attempts, and only advertise a recording after it has finalized.                                       |
| [Playwright Trace Viewer](https://playwright.dev/docs/trace-viewer)                      | Traces let a reviewer inspect actions, DOM snapshots, network requests and console output.                 | Pair a concise video with actionable diagnostic context; a video alone is not a verification result.                                                 |
| [Browserbase session recording](https://docs.browserbase.com/features/session-recording) | Browser sessions support programmatic replay retrieval and embedding through a backend proxy.              | Integrate an isolated browser provider behind an adapter. Keep credentials and private replay URLs on the server.                                    |
| [Currents GitHub run comments](https://currents.dev/changelog/github-run-comment)        | A PR comment updates in place and includes failed-test context, history, recordings and agent fix prompts. | Bring evidence to the PR and send machine-readable failure context back to the agent; avoid repeated dashboard visits.                               |
| [Playwright Test Agents](https://playwright.dev/docs/test-agents)                        | Planner, generator and healer workflows use existing test plans and runnable tests.                        | Reuse repository tests and agent-readable instructions before inventing another flow-authoring system. Preserve test intent when suggesting repairs. |

These products are references for specific capabilities, not claims of equivalent
security, implementation maturity, or customer validation. Exhibit should focus on
commit-linked evidence for agent-authored changes, rather than duplicate a generic
test dashboard or a screen-recorder editor.

## Recommended sequence

| Priority | Feature                                       | User benefit / friction removed                                                                                 | Required foundation and acceptance                                                                                                                                                                   |
| -------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | Agent evidence ingestion and private replay   | Agent returns one bundle; reviewer gets playable evidence without importing files.                              | Scoped agent identity, immutable commit/attempt binding, redaction, private expiring storage, idempotent uploads. Reject stale/tampered bundles and never accept an agent-supplied verified verdict. |
| 1        | One PR evidence card                          | Reviewer stays in GitHub and sees outcome, recording, coverage gaps and commit.                                 | Real GitHub App installation and authoritative SHA resolution. Update one check/card per run; supersede evidence after a push.                                                                       |
| 1        | Repository-derived setup                      | Agent discovers existing Playwright config, test commands and preview URL; operator confirms a short plan once. | Read-only discovery, trusted policy registry and explicit environment approval. No execution merely because a repo contains commands.                                                                |
| 2        | Failure context for the agent                 | Failed assertion, relevant console/network events, frame and source commit become one actionable response.      | Structured failure schema, access-controlled resources, secret filtering. A consumer must not need a human to copy/paste several artifacts.                                                          |
| 2        | Chapters derived from test steps              | Reviewer jumps to the failed action or changed behavior without watching a long recording.                      | Timestamped Playwright steps and finalized video timing. Chapters must map to actual observed events; narratives cannot invent steps.                                                                |
| 2        | Failure-only review queue and attempt history | Reviewer sees what needs attention, while agents can compare retries.                                           | Durable attempts and deterministic outcomes. Never hide a failed first attempt because a retry passed; separate flakes from regressions.                                                             |
| 3        | Before/after behavior and visual diffs        | Reviewer sees what the PR changed instead of opening two environments.                                          | Approved base/head runs under comparable fixtures, deterministic screenshots, explicit masks and thresholds. Report environment differences and missing baselines.                                   |
| 3        | Change-impact suggestions                     | Agent proposes the smallest relevant test set and notes untested changed behavior.                              | Reliable source-to-test mapping with human-inspectable reasoning. Suggestions are not proof of complete coverage.                                                                                    |

Do not prioritize more catalog CRUD, manual video editing, integrations unrelated
to evidence, or automatic test healing that relaxes assertions. Finish one approved
agent-to-PR evidence loop before adding provider breadth or charging for executions.

## Pilot measures

Measure time to first useful evidence, required human setup actions, reviewer time
to understand a failure, agent runs with complete immutable evidence, false-positive
verdicts, and cost per useful report. Compare this simplified onboarding with the
previous setup/flow/contract sequence; these improvements remain hypotheses until
measured with users.
