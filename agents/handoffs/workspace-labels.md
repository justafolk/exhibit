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
- Publish/review this branch, fast-forward the existing deployment branch without
  changing its PostgreSQL environment, deploy and verify the new frontend and
  existing account data. No migration or sample re-seed is needed.
