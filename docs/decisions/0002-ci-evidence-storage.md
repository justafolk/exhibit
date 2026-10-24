# CI evidence storage

Status: accepted for the single-host workspace deployment.

A completed GitHub Actions evidence workflow submits its attempt to the workspace.
PostgreSQL stores provenance, raw JSON reports, job/step outcomes, checksums and
upload state. Original video, trace, report, screenshot and masked log bytes live
in a private filesystem object directory on a **durable mounted volume**. This
uses the existing single-host runtime; it does not put video bytes in Postgres or
introduce a new service.

An owner creates a 90-day repository-scoped ingestion token. Only its SHA-256
hash is persisted. Browser reads still require a workspace session; ingestion
credentials cannot read/download dashboard data or write another repository.
Atomic writes verify declared size and SHA-256 before becoming available. An
attempt is uniquely identified by workspace, repository, workflow run and attempt.
Exact retries resume; changed payloads conflict. No CI submission grants a
verified verdict. Successful assertions remain unverified, skipped assertions
produce partial coverage, and failed assertions stay failed.

A separate default-branch `workflow_run: completed` workflow reads producer
artifacts and completed masked job logs. It never checks out PR source, runs a
model or decodes media. Only the existing evidence/report/output artifact names
are accepted. This limits the upload secret to trusted exporter code. All uploads
are private, and uploaded HTML downloads with a sandbox policy instead of running
on the dashboard origin.

The first adapter targets one service instance with a persistent disk (Render or
Compose). Ephemeral disks and a demo-mode service do not meet durability needs.
Back up the database and disk together; there is no automatic expiry or deletion
in this release. Operators must monitor volume capacity and apply their approved
retention policy. Multiple API instances require shared private storage or a future
object-store adapter before scaling. Uploads are bounded to 500 files, 128 MiB per
file and 512 MiB per attempt; larger bundles fail explicitly.
