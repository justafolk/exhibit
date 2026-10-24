# Persistent GitHub Actions evidence

After a producer workflow completes, the persistence action saves its original
frontend recordings, traces, screenshots, backend API/JUnit output, Playwright
JSON, Codex JSON/Markdown/HTML reports, exported step outputs and GitHub-masked
job logs. PostgreSQL indexes each repository/PR/head SHA/run/attempt and stores
structured report JSON. File metadata links to private durable storage. The
workspace review queue, run report and Agent recordings page read those records;
real workspaces do not substitute the bundled gallery for missing uploads.

## Deploy the service

1. Deploy this revision with `EXHIBIT_STORE=postgres` and the existing `DATABASE_URL`.
   Apply migration `0005_action_evidence.sql` with the operator migration command
   **before** starting the new revision. Applied older migrations remain unchanged.
2. Mount a persistent disk at `/var/lib/exhibit/artifacts`; set
   `EXHIBIT_ARTIFACT_DIR` to that directory. The service's unprivileged user needs
   read/write access. Keep the directory outside `STATIC_DIR`. The production
   Compose file includes a named artifact volume. The Render blueprint includes a
   10 GB persistent disk and a Starter service; applying it has a hosting cost.
   It connects the existing database through the `DATABASE_URL` secret rather
   than provisioning a duplicate database. A free service's ephemeral filesystem
   will lose recordings on redeploy.
3. Keep TLS, the private identity boundary and `EXHIBIT_PUBLIC_ORIGIN` configured.
   No public sign-up or public artifact bucket is introduced. Use one instance
   with this filesystem adapter. Back up both the database and volume, monitor
   capacity, and arrange retention; automatic expiry is not implemented.
4. Sign in as the workspace owner. In **Settings → GitHub Actions uploads**,
   create a token for `justafolk/sample-project-exhibit`. The secret is shown once;
   add it to that repository's Actions secrets as `EXHIBIT_INGEST_TOKEN`. Tokens
   expire after 90 days and can be revoked immediately in the same settings panel.
5. Set the repository Actions variable `EXHIBIT_INGEST_URL` to
   `https://exhibit-sample.onrender.com` (no `/#/overview` suffix).

For an existing Render workspace, run **Actions → Deploy Exhibit workspace** on
`main`. It uses the existing `RENDER_API_KEY` secret, applies migrations with a
temporary runner-only database access rule, attaches/reuses the artifact disk,
deploys the exact main SHA, and checks live version, readiness and ingestion
authentication. Existing accounts and the database connection remain unchanged.
If the service is currently Free, first select Starter in the Render dashboard:
Render's API refuses changes between free and paid plans. The workflow checks this
before making deployment changes. It creates the merged 10 GB disk when missing.

Do not rerun the account-provisioning workflow to deploy an existing account: it
intentionally refuses to overwrite owners. Use the existing operator path for
migrations and a normal service deploy. The blueprint changes describe the desired
configuration; committing them alone does not apply a Render disk or database migration.

## Connect the completed workflow

Pin `.github/actions/persist-action-evidence` to the reviewed Exhibit commit. The
sample repository's `persist-exhibit-evidence.yml` supplies the run ID and exact
attempt from `workflow_run`. **This workflow must be merged to the repository's
default branch** for completion triggers to fire. Its manual `workflow_dispatch`
accepts a completed run ID and attempt for backfilling/retrying existing evidence.
Keep this workflow and the pinned exporter under normal maintainer review.

The job needs only `contents: read` and `actions: read`. It has no checkout step.
Never pass `EXHIBIT_INGEST_TOKEN` to the evidence job, PR scripts or Codex. Never
use `pull_request_target` to execute PR source. Fork runs and ambiguous PR metadata
are rejected. The upload token can create reports only for its selected repository
in its owner's workspace, and cannot impersonate a verifier.

The collector recognizes these exact artifact names for a selected run/attempt:

- `exhibit-pr-PR-RUN-ATTEMPT`: original evidence bundle.
- `codex-ci-report-pr-PR-RUN-ATTEMPT`: Codex report and review files.
- `exhibit-job-output-evidence-PR-RUN-ATTEMPT`,
  `exhibit-job-output-codex-PR-RUN-ATTEMPT`, and
  `exhibit-job-output-publish-PR-RUN-ATTEMPT`: bounded `steps.json` exports.

GitHub's API does not expose arbitrary step/job output values after a workflow.
The producer must export those values as artifacts; the sample workflow does so.
Unrelated artifacts are excluded to avoid collecting credentials or unrelated
build output. Producer artifacts and logs must already be redacted: GitHub's log
masking is not a PII scrubber. Existing start/report PR comments are unchanged.

## Storage and failure behavior

`POST /api/ingest/v1/runs` accepts at most 4 MiB of JSON. Each file is streamed via
its returned opaque ID, with an exact SHA-256 and size check, then the uploader
calls `/complete`. Limits are 500 files, 128 MiB per file and 512 MiB total.
Metadata appears while an upload is incomplete; the recording gallery only lists
completed attempts. A retry resumes missing files without duplicating the run.
A different payload for the same attempt returns 409. Each rerun attempt has its
own record. HTML reports download as files; structured JSON is rendered as text.
Videos support authenticated `HEAD` and byte ranges for seeking.

Missing evidence/Codex reports from failed or skipped stages are stored as explicit
coverage gaps with the available job metadata/logs. Expired artifact bundles and
provenance/hash mismatches fail the upload instead of claiming a complete archive.
Unavailable job logs (404/410) are listed as gaps. Other API/storage failures fail
the upload job and can be retried. A successful CI run is **unverified**; failed
assertions and skipped coverage remain visible. Original artifacts do not change.

## Validate

```sh
make db-up
make test-integration
npm run build
EXHIBIT_CI_BROWSER_TEST=1 make test-integration
make check
```

The optional browser check uses a disposable PostgreSQL schema, real session and
private files. Install Playwright Chromium first (or set `SAMPLE_CHROMIUM_PATH`).
It verifies original video playback, reports, HTML downloads, the recordings gallery
and owner token creation. No deployed staging or production test is implied.
