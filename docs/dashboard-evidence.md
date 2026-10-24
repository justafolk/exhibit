# Recorded sample dashboard

The dashboard now includes a curated, playable evidence snapshot from
`justafolk/sample-project-exhibit`. It is separate from tenant records and from
ongoing work on the Exhibit GitHub Action. This change does not add a receiver,
change the Action, connect a tenant, or issue a trusted verdict.

## What users can inspect

- Featured recorded evidence on the sample home dashboard.
- Three original CI recordings: saved-address checkout, payment declined, out of stock.
- Slow playback and 0.1-second stepping without modifying source video bytes.
- Per-scenario video and trace downloads; an artifact list with type filters, sizes
  and checksums; the original manifest and Markdown report.
- The complete source commit, PR and workflow links, capture timing, and limitations.
- Both workflow attempts: the first failed; the second succeeded with three browser
  tests passing. First-attempt test results are not included or inferred.
- A working Needs attention view across failed, partial, and unable-to-run results,
  preserving search/filter state in the URL.

The sidebar exposes inner actions in collapsible groups. Reviews contains the
Dashboard, All changes and Needs attention. Agent recordings contains Sample
gallery, Evidence explorer and optional Manual tools. Agent setup contains quick
start, repository/staging, flow definitions and contract inspection. Settings
contains workspace details and access/session information. Parent groups remain
four distinct destinations. The scrollable hierarchy works in the mobile drawer.

## Source and byte integrity

Source run: https://github.com/justafolk/sample-project-exhibit/actions/runs/40073771722/attempts/2

- PR: 1, `agent-test`.
- Source SHA: `c6865b266b8799b96bdbcb39b586982e51f9bf6a`.
- Artifact ID: `12552751003`, `exhibit-pr-1-40073771722-2`.
- Archive SHA-256: `ddb25f5e1a752523ae5437728ab6ada5ed892f01c123de7b6bcf4c49906bf5ab`.

The downloaded archive matched GitHub's reported digest. All seven original
artifact paths, sizes and hashes matched the manifest. Originals, manifest and
report are copied unchanged into `apps/web/public/samples/field-store/`. They are
excluded from formatting to preserve their bytes. The checkout preview uses the
original confirmation screenshot; the other preview PNGs are derived video frames.
Preview files are not presented as original manifest artifacts.

The sample app uses synthetic cart/address/payment data and no credentials.
Captures were reviewed before publishing; trace network requests are to the local
sample fixture only. The user requested using this repo for dashboard samples.
These files are intentionally served as public example assets. This must not
become the storage path for real customer recordings or private trace bundles.

`apps/web/src/sample/fieldStore.ts` is a typed UI projection of the original manifest,
Playwright JSON and GitHub attempt metadata. The original manifest remains the
canonical downloadable artifact. Browser tests check every original file's actual
bytes, video playback/downloads, direct links, artifact filtering, source identity,
sidebar hierarchy, mobile overflow, attention filters and media-load errors.

## Handoff to Action / ingestion work

The sample importer consumes the existing v1 manifest fields (`repository`,
`pullRequest`, `headSha`, `attempt`, `assertions`, `artifacts`, `notCovered`, `cleanup`).
Each artifact carries a relative path, bytes, media type and SHA-256. No change to
that format is required by this UI. The source Action changes already merged on
`main` were carried forward unchanged; only the documentation append conflict was
resolved by retaining both sets of instructions.

Future live ingestion should replace the curated UI adapter with authenticated,
workspace-scoped records and private expiring media access. Keep PR/head identity,
all attempts, original bytes and explicit verification state. Do not fetch private
GitHub artifacts from browser code, expose tokens, or accept a client-supplied
verified verdict. A failed prior attempt stays visible after a successful retry.

## Supplemental cURL evidence

The API tab and sidebar link show 11 actual cURL requests against a clean checkout
of the same source SHA, served locally on port 4175. This is a separate capture,
not an addition to the original CI manifest or a claim that PR #1 edited APIs.
It covers setup, successful checkout, persisted order, malformed JSON, declined
payment and unavailable stock with no order created, and scoped cleanup.
Expected 400/402/409 responses are successful negative checks. Each request stores
the command, exact response bytes and headers, HTTP and cURL exit statuses,
measured duration, capture timestamp, body assertions and file SHA-256 hashes.
The UI offers command copying and byte-preserving downloads; it does not execute
commands from the browser. Requests use synthetic data without authentication.

For the separate Action work: collect API evidence when a PR edits endpoints and
map requests to actual changed routes/files. Preserve source SHA, environment,
expected versus observed status, assertions, original redacted request/response
files and hashes. Capture before redaction only in protected ephemeral storage;
publish sanitized artifacts with no credentials, session cookies or customer
payloads. Never infer successful execution from a command string. Live collection
and automatic changed-endpoint discovery are not implemented by this dashboard.
