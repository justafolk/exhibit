# Handoff: authenticated workspace and recording studio checkpoint

- Branch and checkout: `agent/platform-integration` in `/home/justafolk/exhibit`.
  This branch merges the frontend, backend and automation task branches. Work stopped
  at the user's explicit checkpoint request; this is not a fully validated release.
- Outcome and changed files:
  - `apps/web`: professional light workspace, private sign-in and sample entry,
    responsive navigation, overview, URL-preserved evidence search, direct reports,
    Markdown exports, setup, editable flows, saved contract preparation and settings.
    Recording studio code is now merged as a work-in-progress checkpoint: local
    capture/import, framed playback, chapters, original/manifest downloads and metadata saves.
  - `services/api`, `db`, `packages/contracts`: private owner CLI, password hashing,
    sessions/CSRF, server roles, tenant-scoped reads/writes, setup, filtered runs,
    flow definitions, contract drafts, manual recording metadata and activity APIs.
    Additive migrations `0002`–`0004`; OpenAPI types are generated.
  - `.github`, `agents`, `scripts`: signed-delivery/policy helpers, strict evidence
    request/manifest and artifact-hash validation, qualified report generation,
    optional self-test recording workflow with startup-commit provenance checks.
  - `tests/e2e`: integrated auth/review/preparation tests and four recording tests.
    Deployment image includes `bootstrap-user`; development proxy origin and
    secure-cookie configuration are documented.
- Decisions and assumptions:
  - Existing React/Go/PostgreSQL stack; local system fonts, no new UI framework.
  - Accounts are privately provisioned with passwords supplied on stdin. No default
    production account, public registration, recovery or self-service role selection.
  - Sample sessions are isolated and ephemeral. Legacy seeded rows remain in an
    unclaimed sample workspace; new owners do not inherit them.
  - Flow/contract completeness is preparation, never authorization. Manual recording
    metadata is always `origin=manual`, `verification=unverified`, `mediaStored=false`.
    Media stays local; presentation controls preserve original bytes.
  - Initial integration and refinement cycles 1 and 2 are complete. Cycle 3 code is
    checkpointed, but final integrated validation and visual review are outstanding.
- Checks actually run and results:
  - Initial integrated `make check` passed (before the three refinements).
  - Initial integrated browser suite: 8 passed. Cycle 1: 9 passed in the full run;
    a loading-race correction in the revocation test then passed its targeted rerun.
  - Cycle 2: 12 passed in the full run; one ambiguous navigation selector was corrected
    and the targeted preparation flow then passed. Root typecheck/build and PostgreSQL
    integration passed after cycle 2.
  - Backend agent: full Go race suite, vet, PostgreSQL integration and race-enabled
    PostgreSQL integration passed for recording metadata. The final chapter-presence
    fix passed HTTP race and PostgreSQL integration tests.
  - Frontend agent: all four exact recording tests passed against its live Go preview
    in 5.6 seconds, including real synthetic WebM bytes, byte hashes, metadata persistence,
    unchanged verdicts, failed-import/save preservation, denied sharing and track cleanup.
    Build passed before the final small range-control/error-state tweaks; no final build
    was run after those tweaks. Browser checks exercised those changes.
  - Automation agent: 13 evidence tooling tests, Go helper race/vet, actionlint 1.7.12,
    and capture metadata clean/dirty checks passed. Workflow was not executed remotely.
- Unverified behavior or remaining risks:
  1. `apps/web/src/studio/media.ts`: `captureDuration || discovered` prioritizes capture
     wall-clock timing over a finite actual media duration. Inspect and fix this so
     duration/late chapter markers cannot exceed playable bytes; label any estimate.
  2. `apps/web/src/pages/Studio.tsx`: a slow initial `listRecordings` response can overwrite
     the locally prepended result of `createRecording`. Invalidate/merge stale list results.
     Both findings are code-review observations, not browser-reproduced failures yet.
  3. No final full `make check`, whole browser suite, container build/smoke or studio visual
     review after all merges. The root recording spec has been checkpointed but not run
     from this final integration checkout.
  4. Actual OS screen chooser, cross-browser codecs, capture timeout/128 MiB limits and
     overlapping import/hash race were not directly exercised. Capture tests use a
     clearly labelled synthetic stream, not a real desktop share.
  5. Activity is API-only; the optional Settings activity panel was omitted.
  6. No mounted GitHub webhook ingress, durable replay ledger, live GitHub API resolver,
     isolated customer runner, agent SDK execution, trusted artifact redaction/storage,
     or PR check posting. Helpers and sample CI capture do not implement those services.
- Next concrete step: fix the two studio review findings with focused regressions,
  then run `make check`, `make test-integration`, `make e2e`, container build/smoke and
  desktop/mobile studio visual inspection. Commit changes before running
  `EXHIBIT_CAPTURE=1` self-test collection; the collector rejects dirty/stale output.
  See `agents/evidence-tooling.md` for capture commands and `docs/workspace-guide.md`
  for private account provisioning. Continue from the integration branch.
- Shared contracts/migrations requiring coordination: backend owns generated OpenAPI
  changes and migrations. Next migration number is `0005`; do not rewrite existing ones.
  Frontend branch is `agent/platform-frontend` at `d450804`; backend is
  `agent/platform-backend` at `c216f30`; automation is `agent/platform-automation`
  at `6a810cb`. All are retained for traceability.
- Local runtime: root preview and frontend-owned dev/test processes were stopped for
  handoff. Worktrees and local database volumes are retained; no secrets or generated
  media are included in the source checkpoint. Restart with `make dev` when resuming.
