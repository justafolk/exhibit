# Ordered backlog

## 1. Trusted GitHub ingress and identities

Implement installation/account records, user/tenant authentication and authorization,
HMAC webhook validation, replay/idempotency handling and authoritative head-SHA resolution.
Handle only explicit eligible triggers. Reject forks/untrusted actors by policy.
Acceptance: invalid signatures cannot enqueue; duplicate deliveries create one event;
installation boundaries cannot leak records; stale SHAs are rejected or visibly superseded.

## 2. Durable runs and one isolated runner

Add run/attempt lifecycle, PostgreSQL job claims, lease renewal, timeout reconciliation,
per-repository concurrency and budgets. Integrate one disposable isolation provider behind
a small adapter. Use a reviewed runbook and test-tenant identity for one frontend flow.
Acceptance: a crashed worker is reconciled; no secrets reach forks or unapproved targets;
no PR code runs on the control-plane host; cleanup is idempotent and failures are recorded.

## 3. Deterministic evidence and PR reporting

Use Playwright assertions, recording/trace capture and an independent trusted collector.
Upload redacted artifacts to private expiring object storage, verify hashes/provenance,
show all attempts and gaps, and post/update one concise GitHub check/report per run.
Acceptance: an assertion failure cannot produce `verified`; stale SHA and tampered artifacts
fail verification; secret fixtures never appear in downloadable output; final status exists
even after a runner crash. Validate one actual staging flow end to end.

## 4. Pilot hardening and cost control

Implement retention janitor, tenant-scoped read models, audit history, deployment backups,
restore drill, rate limits and cost dashboards. Exercise injected runner failures and queue
collisions. Measure reviewer time saved and cost per useful report before adding integrations.

## Deferred

Slack/ClickUp ingestion, automatic flow discovery, multiple linked repositories, payments,
broad provider selection and a vector knowledge base. Add these only after pilot evidence.
