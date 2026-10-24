# Handoff: recording studio resumption

- Branch and checkout: `agent/studio-handoff` in
  `/workspace/exhibit-worktrees/studio-handoff`, based on `ddbb0e3` from
  `agent/platform-integration`.
- Outcome: fixed both review findings from the platform checkpoint. Captures use
  the same playable-byte duration inspection as imports; no wall-clock estimate
  is persisted. A delayed recording list merges by ID with locally saved entries
  instead of hiding them. No contracts or migrations changed.
- Regression coverage: a synthetic screen capture with an inflated clock must
  retain its short media duration; a held pre-save list response cannot remove
  the new saved manifest. Capture input is synthetic, never customer evidence.
- Checks passed: full `make check` (including Go vet/race and 16 tooling tests),
  `make test-integration`, and all 18 Chromium E2E tests. Desktop populated studio
  and mobile empty-state screenshots reviewed; mobile overflow check was false.
  Container build and `scripts/smoke-image.py exhibit:studio-handoff` passed.
- Environment: installed pinned Go 1.27.3 under `/tmp/go`; Go/npm caches use `/tmp`.
  Host checks used Node 24/npm 11 rather than the repo's Node 22/npm 10;
  the successful image build used its declared Node 22 base. Container build used
  a temporary Dockerfile with session CA secret mounts for dependency downloads;
  repository Dockerfile was unchanged.
- Limits: actual OS screen chooser, cross-browser codecs, capture size/time limits,
  and overlapping import/hash races remain unverified. No real staging execution,
  trusted artifact collection, or GitHub reporting is claimed. Mobile populated
  layout was inspected during resize; fresh mobile review covered the empty state.
- Next concrete step: review this branch against `agent/platform-integration`.
  The platform checkpoint's unimplemented ingress/runner/reporting milestones
  remain separate work. Optional commit-linked self-test collection has not run.
