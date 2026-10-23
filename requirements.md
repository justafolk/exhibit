# PR Evidence Platform: Problem, Solution and Design

*Working design document. Draft v1, October 2026.*

## 1. Summary

AI coding agents now raise frontend and backend PRs quickly, but every PR still needs a human to pull the branch, seed data and click through the flow, because nothing in the PR shows the change working against real data. This document proposes a platform that closes that gap. When a PR is ready, an agent clones the PR branch into a sandbox, runs the changed code locally, points it at the **dependent services, database and data in the staging environment**, exercises the relevant business flows, and posts **evidence** back to the PR: a screen recording for UI changes, and actual API responses and DB changes for backend changes. The result is a PR that arrives with proof, not just a diff.

## 2. The problem

Code generation has become cheap. Verification has not.

- **Unit tests are mostly mocks.** A green CI run says the code is internally consistent, not that the flow works with real records, real auth and real downstream services.
- **The reviewer becomes the integration test.** Reviewers check out the branch, set up data and walk through the flow by hand.
- **Agent-authored code has a trust deficit.** "It looks right" is a weaker signal when no colleague ever ran it.
- **Bugs surface late.** Integration problems show up in QA or production instead of at PR time.
- **Preconditions are the real blocker.** Most flows fail not because the code is wrong, but because required state is missing. For example, a module that needs assets with specific attributes cannot be exercised unless those assets already exist in the environment.

### Goal

For every PR where it is meaningful, produce **verifiable evidence that the change works against real (staging) data**, attached to the PR, without a human having to run anything.

### Non-goals

- Replacing unit tests, code review or a full QA process.
- Testing against production data. Production data and PII stay out entirely.
- Building a general-purpose AI testing tool. The focus is the PR-linked evidence contract.

## 3. Core idea

The platform has two halves.

1. **Knowledge**: a one-time (and continuously improving) understanding of the codebase, services, business flows and data requirements, so the system knows which flows a PR affects and what state those flows need.
2. **Execution**: on each eligible PR, a CI gate checks that everything needed to test is known, then an agent sets up the repo locally, runs it against staging dependencies, tests the relevant flows, and reports back with evidence.

## 4. Key design decision: run the PR locally, use staging for dependencies

The agent does not need an ephemeral environment per PR. Instead it does the following inside its own sandbox:

- Clones the repository at the PR head SHA.
- Installs dependencies and starts the changed service(s) or frontend **locally**.
- Configures that local process so that every dependency (other microservices, database, cache, queues, auth provider, third-party sandboxes) points at the **staging environment**.
- Runs the test flows against the local process, recording everything.

### Why this is attractive

- **No per-PR infrastructure.** No ephemeral clusters, namespaces or deploy pipelines to build and pay for.
- **Provenance for free.** The code under test is the PR head SHA by construction, because the agent built and started it. The run records the SHA, a clean working tree and the health-check response as proof.
- **Works for any repo.** It only needs a way to install and run the service, not a deployment pipeline.
- **Cheap to start.** The first version needs a runbook and credentials, not a platform team.

### What changes compared with a fully isolated environment

The local process shares staging's database, queues and downstream services with everyone else. That is the trade-off, and it creates risks the design has to handle explicitly:

| Concern | Why it matters | Mitigation |
| --- | --- | --- |
| **Writes to shared staging data** | The PR under test may have bugs that corrupt or delete real staging records | Dedicated test tenant/namespace and test accounts; tag every record with a run ID; scoped credentials that cannot touch non-test data where the system allows it; cleanup step |
| **Database migrations** | A PR with a migration, run locally against staging, would alter the shared schema and break staging for everyone | Never auto-run migrations on shared staging. Mark such PRs `Not testable` by default, or run against a cloned or schema-scoped database. Decide per repo |
| **Queues and consumers** | A local service consuming from staging queues competes with the real staging consumers, or publishes messages the real staging services act on | Use a unique consumer group/queue prefix for the run, or disable consumers and only drive the producing side. Define this in the repo's runbook |
| **Inbound traffic** | Webhooks, callbacks and OAuth redirects from staging services cannot reach a sandbox | Use a tunnel with an allowlisted public URL, or a test-only callback receiver. Flag flows that need this in the catalog |
| **Network access** | Staging may be behind a VPN or IP allowlist | Stable egress IPs or a private-network connector from the sandbox; allowlist only what the run needs |
| **Auth and cookies** | Browser auth tied to staging domains or CORS rules may reject a localhost origin | Dedicated test accounts, token injection for test personas, and an approved local origin in staging CORS/auth settings |
| **Shared-state collisions** | Two runs, or a run and a human, using the same records | Per-run data namespace and a lock around any shared fixtures |
| **Staging drift** | Other services in staging may be on different versions from production | State the staging versions in the report, and be honest that this is staging evidence |

### What runs locally vs from staging, by PR type

| PR type | Runs locally (from PR branch) | Comes from staging | Notes |
| --- | --- | --- | --- |
| **Frontend only** | The frontend dev server | Backend APIs, auth, data | Simplest case. Needs CORS/auth to accept the local origin |
| **Backend service** | The changed service | All other services, DB, queues | UI evidence needs a frontend: run the frontend from `main` locally, pointed at the local service. Otherwise use API and DB evidence |
| **Full-stack, split across repos** | Both changed repos | Everything else | Link the PRs by ticket and compose them in one run |
| **Infra, refactor, docs** | None | None | `Not testable`, with a stated reason |

### The environment recipe

Each repo needs a **runbook** the agent can follow: install commands, run commands, required environment variables with their staging values (referenced from a secrets store, never written in the repo), health-check endpoint, version endpoint and known quirks. The agent can **draft the first version by reading the repo and trying it**, but a human approves it once. After that it is versioned in the knowledge base and reused. Failures to boot are reported as `Couldn't run`, and the agent's fix proposals go back into the runbook through review.

## 5. Architecture

### 5.1 Knowledge layer (onboarding)

Build a **flow catalog**, not just a code index. Each flow records:

- Entry points: routes, screens, endpoints.
- Services and tables touched.
- Data preconditions (for example: "needs at least two assets with attribute X").
- Test personas and accounts.
- How success is verified (UI assertions, API responses, SQL checks).
- Path-to-flow mapping, so a diff can be translated into relevant flows.

Sources: the codebase, existing e2e tests, ClickUp tickets and Slack threads. The catalog should be **human-reviewable and versioned**, because an opaque knowledge base will rot silently.

Integrations needed at onboarding: GitHub, Slack, ClickUp, a secrets store, and an authorization flow through which customers grant the platform access to their staging environment.

### 5.2 GitHub app and the PR contract (CI gate)

When a PR is opened or marked ready, a CI check verifies that everything needed for the evidence run is available. The check is **two-way**:

- The system infers what it can from the diff, the linked ticket and the catalog.
- It asks the author only for what is missing: feature flags, test account, specific record IDs, which flow to focus on.
- The contract format is documented in `AGENTS.md` / `CLAUDE.md` so coding agents fill it in automatically when they open PRs. Otherwise this just becomes paperwork.

Check states:

- `Ready`: all inputs are present, the run can start.
- `Needs info`: lists exactly what is missing and from whom.
- `Not testable`: with a reason (refactor, docs, migration-only, and so on).

Trigger on `ready for review` or an `/evidence` comment, not on every push, to control cost and noise.

### 5.3 Orchestrator

Receives the trigger, resolves linked PRs, allocates a run ID, checks locks on shared fixtures and budgets, starts the sandbox, and tracks the run to completion. It also owns retries and timeouts, and always posts a final status even when the run crashes.

### 5.4 Sandbox runner (the agentic call)

The agent runs in an isolated sandbox with the repo, a browser (Playwright with video, trace and HAR capture), an API client and restricted DB access. The run has distinct phases:

1. **Setup**: clone at the head SHA, follow the runbook, start the service, confirm the health check, and record the SHA and version as provenance.
2. **Plan**: from the diff, the contract and the catalog, produce a test plan listing flows, data needs and assertions. Post it to the PR, so reviewers can see what will and will not be covered.
3. **Seed**: ensure preconditions exist in staging, tagged with the run ID, using approved idempotent seed scripts.
4. **Execute**: drive the flows, with deterministic assertions.
5. **Verify**: an independent pass checks the recording, trace and assertions against the claimed outcome.
6. **Report and clean up**: post the evidence, remove run-tagged data, and tear down the sandbox.

**Platform note:** the idea is to use Claude Code on the web for this. For CI, you may want headless Claude Code or the Agent SDK on your own runners instead, mainly for control over secrets, network egress to staging, and triggering. Check the current documentation for what each option supports before deciding, especially network restrictions and how a staging allowlist would work.

### 5.5 Data layer

- **Preconditions as code**: idempotent seed scripts per flow, run inside a dedicated test tenant or namespace.
- **Run tagging and cleanup**: everything the run creates carries the run ID and is removed afterward, with a janitor job for runs that crash.
- **Realistic, not production**: staging data only. No production data or PII.
- **Agent-drafted, human-approved**: the agent can propose seed scripts and the fixes for missing data, but a person approves them the first time.
- **Missing data is a finding**: if a required asset does not exist and cannot be seeded, the report says so rather than guessing.

### 5.6 Evidence types

| Change type | Evidence |
| --- | --- |
| Frontend | Screen recording, step screenshots, Playwright trace |
| Backend API | Request/response pairs with secrets redacted |
| Data changes | Before/after rows from specific queries |
| Cross-service | Logs or traces correlated by trace ID |
| Regression | Adjacent flows still pass |

### 5.7 The report

A short PR comment:

- **Verdict**: `Verified`, `Partial`, `Failed` or `Couldn't run`.
- **Provenance**: PR head SHA, staging versions of dependencies, run ID.
- **Flows tested**, with the video and timestamps of the key assertions.
- **Data/API evidence**: redacted responses and DB diffs.
- **Concerns**: console errors, slow calls, odd behavior the agent noticed but did not assert on.
- **Not covered**: what was skipped and why. This matters as much as what was tested.

## 6. End-to-end lifecycle

1. Author (human or coding agent) opens a PR containing the evidence contract.
2. The CI check evaluates the contract and returns `Ready`, `Needs info` or `Not testable`.
3. On `ready for review` or `/evidence`, the orchestrator starts a run.
4. The sandbox clones the branch, boots the service locally against staging dependencies, and verifies the health and version endpoints.
5. The agent posts a test plan, seeds data, executes the flows and records evidence.
6. A verifier pass checks the evidence against the claimed result.
7. The report is posted to the PR, run-tagged data is cleaned up, and any new knowledge (answers from humans, fixed runbook steps) is saved for next time.

## 7. Evidence integrity

This is where a product like this succeeds or fails. An LLM saying "I tested it and it works" is worthless on its own.

- **Deterministic assertions decide pass/fail**: Playwright expectations and SQL/API checks, not the model's narrative.
- **Observed vs inferred**: the report separates what was recorded from what the agent concluded.
- **Independent verifier**: a separate pass reviews the video and trace against the claim.
- **No hidden retries**: show failures and retries. A run that quietly retried five times is not `Verified`.
- **Provenance**: SHA, clean tree and a version endpoint response prove the tested code is the PR.
- **Tamper resistance**: the agent under test should not be able to edit the recording or the assertion results.

## 8. Security and guardrails

This design raises the stakes, because **unreviewed PR code runs in a sandbox that holds staging credentials**.

- **No fork PRs** by default, and no runs for untrusted authors without approval.
- **Scoped credentials**: a dedicated staging identity limited to the test tenant, short-lived where possible, and no access to production.
- **Network allowlist**: the sandbox can reach staging and required package registries, and nothing else. This also limits exfiltration.
- **Destructive-operation limits**: read-only DB access by default, explicit allowlist for writes, no operations outside the run's namespace.
- **Prompt injection**: treat PR descriptions, commit messages, Slack and ClickUp text as untrusted input. They can inform the plan, not grant permissions.
- **Budgets**: time, cost and request-count limits per run, with a kill switch.
- **Secrets hygiene**: redact secrets and PII from videos, HARs, logs and reports before posting.
- **Audit log** of everything the agent did against staging.

## 9. Risks and rough edges

- **Shared staging contention**: runs and humans interfering with each other. Namespaces and locks reduce this but do not remove it.
- **Migrations and queues** (Section 4) are the highest-risk areas and need an explicit policy per repo.
- **Staging drift**: staging rarely matches production, so some "verified" results will mislead. State the dependency versions in every report.
- **Auth**: SSO, MFA and OTP need test accounts or staging bypasses.
- **Third parties**: payments, email and SMS need sandboxes or catchers.
- **Flakiness**: a few false failures will train people to ignore the check. Track the false-failure rate from day one.
- **Boot failures**: repos that are hard to run locally will produce a lot of `Couldn't run`. The runbook quality is a major adoption factor.
- **Split PRs**: frontend and backend PRs for one feature need to be linked by ticket and run together.
- **Cost and latency**: each run is an agent session plus a browser. Trigger deliberately.
- **Onboarding burden**: a complete knowledge base upfront is the likeliest adoption blocker.

## 10. The flywheel

- **Compile runs into scripts**: each successful agent run can be turned into a deterministic Playwright script and saved in the flow catalog. Next time the cheap script runs first, and the agent steps in only when it breaks or the PR touches something new. Over time this builds the e2e suite automatically.
- **Learn from questions**: whenever the agent has to ask a human something, store the answer in the catalog or runbook.
- **Learn from failures**: boot failures and missing-data findings become runbook and seed-script improvements, via review.

## 11. Suggested phasing

1. **Prove the value**: one repo, one frontend flow, triggered by `/evidence`. The agent clones the branch, runs it locally against staging, and posts a recording and a short report. The runbook and seed script are hand-reviewed.
2. **Contract and data layer**: add the CI check, per-flow preconditions, run tagging and cleanup.
3. **Backend evidence**: API responses and DB diffs, a policy for migrations and queues, and multi-repo runs for split PRs.
4. **Knowledge automation**: Slack and ClickUp ingestion, an auto-built flow catalog, and compiling runs into regression scripts.

Do not build the full knowledge base first. Deliver value on one flow and let the catalog grow from real runs.

## 12. Competitive landscape

Adjacent players include AI e2e testing tools (QA Wolf, Momentic, Meticulous), request-level sandbox tools (Signadot), and coding agents that now record their own demo videos. The differentiators here would be the PR-linked evidence contract, awareness of business flows and data preconditions, and verified provenance. A fresh competitive scan has not been done, and this space moves fast, so verify before committing.

## 13. Open questions

1. Can staging accept connections from a sandbox (IP allowlist, VPN), and can it accept a localhost or tunneled origin for auth and CORS?
2. Is there a dedicated test tenant or namespace in staging, or does one need to be created?
3. How do migrations work today, and can a cloned or schema-scoped database be provided for PRs that include them?
4. Do services consume from shared queues, and can consumer groups be prefixed per run?
5. Which flow and which repo are the best first candidate?
6. Which sandbox option fits best: Claude Code on the web, or headless Claude Code or the Agent SDK on your own runners?
