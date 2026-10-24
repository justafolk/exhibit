# Product direction

Exhibit helps a reviewer answer: **what ran, against which commit and environment,
what was observed, and what remains unverified?** Its first customer is a small team
already shipping agent-authored PRs and maintaining a staging environment.

## MVP choices

Start with one GitHub repository, one frontend business flow and one customer-owned
staging test tenant. Ask a human to approve the runbook and seed script once. Trigger
execution deliberately on a ready-for-review event or `/evidence`; do not spend money
on every push. Use deterministic scripts first and a bounded agent fallback only when
scripts cannot handle an approved flow. Measure reviewer time saved, completion rate,
false positive rate, run duration and cost per useful report before adding integrations.

Use a GitHub App for the eventual product integration. Slack, ClickUp, automatic
knowledge ingestion, linked multi-repo PRs and general autonomous testing are deferred.
Avoid pricing commitments until real run-cost data exists. Set explicit per-run model,
wall-time and sandbox budgets before any paid execution is enabled.

## Current workspace

Agents produce evidence; humans review it. The primary experience is a review queue,
agent recordings, one agent handoff, and settings. Form-based staging setup, flow
definitions and contract inspection are advanced operator tools, not the default journey.
`npm run evidence:record` now automates capture and local evidence collection for this
repository’s sample browser suite. Hosted customer execution and ingestion remain pending.
See [the experience research and priorities](agent-experience.md).

The light-mode workspace provides private account sign-in, server-enforced workspace
roles, isolated sample exploration, overview and run reports, and persistent repository
and staging setup. Flow definitions and contract drafts make evidence preparation reusable;
URL-preserved search and qualified Markdown exports support review. Owners are provisioned through a trusted CLI; public registration,
email recovery and GitHub OAuth are not implemented. Setup records metadata without
claiming GitHub connectivity, runbook approval or permission to execute.

The recording studio captures or imports local video and adds chapters and presentation
controls without altering original bytes. Workspace manifests remain manual and unverified;
media is not uploaded. Neither recordings nor contract readiness can set a run verdict.

## Foundation acceptance

A new contributor can clone, bootstrap and run a clearly labelled sample dashboard.
The API can read tenant-scoped PostgreSQL rows and evaluate an evidence contract. Browser tests
exercise the Go API. New agent worktrees do not share a database or local ports.
All of those capabilities ship in this initial setup.

## Honest states

Contract readiness (`ready`, `needs_info`, `not_testable`) is separate from execution
and evidence truth. `ready` means supplied fields are complete, not that IDs, credentials,
flow references or permissions have been verified. The future orchestrator resolves
those facts from trusted sources.

Sample `verified` runs are educational fixtures, visibly labelled. A real verdict must
be derived from deterministic assertions and immutable artifacts, bound to the head SHA.
A model narrative cannot set a successful verdict. Failed boot, skipped coverage and
all attempts must be visible.

The sample Actions integration captures and hashes frontend/API artifacts, and the
review workspace serves a curated playable snapshot. Authenticated live ingestion and
private artifact delivery for arbitrary customer runs remain unimplemented.

## Demonstrated sample integration

The `agent-test` GitHub Actions flow in `justafolk/sample-project-exhibit` now records
frontend browser tests, collects backend JUnit results with clean-start provenance,
hashes artifacts and runs isolated Codex CLI advice. It posts account-verified start
and completion comments, with animated previews and links to the full videos and
HTML/Markdown/JSON report. It is limited to same-repository, non-draft sample PRs;
the code rejects stale head/attempt data and does not promote advice to a verified verdict.
This is separate from the future GitHub App/orchestrator and hosted workspace ingestion.

See [the hackathon review guide](hackathon.md) for source paths, an observed successful
run and the distinction between the bundled dashboard snapshot and newer CI evidence.

## Next deliverable

Complete the remaining work in the first three backlog milestones in order: trusted GitHub ingress, durable
run scheduling and isolated execution, then artifact integrity and reporting. Gate a
customer pilot on identity operations, secrets isolation and cleanup recovery. Ship one
flow end to end before automating catalog discovery.
