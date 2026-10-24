# Workspace presentation labels

- Branch: `agent/workspace-labels`.
- Recording gallery replaces Sample gallery; preview wording replaces repeated
  sample labels in navigation, headers, notices and actions. Row badges removed.
- Presentation-only title cleanup removes existing `Sample:` / `Sample metadata:`
  prefixes in review, flow, recording and report views. Source metadata remains
  unchanged. Brief illustrative-review context remains in table captions and
  report details; unverified capture provenance remains explicit.
- Repository identity, original artifact bytes, API response bodies, internal
  sample flags, immutable manifests and GitHub Action code are preserved.
- `make check` passed, including 55 Python tooling tests and Go race/vet; final
  frontend check passed after caption copy changed. All 28 browser checks passed, including label cleanup and evidence qualification.
- Published as PR #18. The deployment branch was fast-forwarded to `1384431`.
  Render deploy `dep-dbe94rjncjis73dfc8hg` reached live. Docker build/smoke passed.
  Public frontend labels and owner login were verified; the workspace name, eight
  reviews, six flows and three manifests remain intact. PostgreSQL environment
  and original source flags are preserved. No migration or re-seed was needed.
- Next step: review PR #18. Deployment is complete.
