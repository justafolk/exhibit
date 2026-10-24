# Handoff: dashboard and API evidence

- Branch and checkout: `agent/dashboard-evidence`, dashboard-evidence worktree.
- Outcome: richer sample dashboard, three original CI videos, artifact/provenance
  explorer, 11 real supplemental cURL captures and a nested actionable sidebar.
  See `docs/dashboard-evidence.md` for sources, ownership and limits.
- Decisions: samples are public synthetic data, separate from tenant records;
  provenance remains unverified. API capture is local against the same source SHA,
  not falsely attributed to the workflow-only source PR or its original CI bundle.
- Checks actually run: `make check` passed (including 33 Python tooling tests and
  Go race/vet); all 27 Playwright browser tests passed; Docker image built and
  readiness returned 200 in demo mode. Desktop/mobile API screenshots inspected;
  browser tests verify original browser/API asset hashes and media/downloads.
- Remaining limits: no workspace ingestion, hosted execution or automatic edited
  endpoint discovery. Coordinate those with Action work; Action scripts preserved.
  Protected credentials, real payment gateways and performance are not tested.
- Next step: publish branch and review PR, fast-forward existing deployment branch,
  deploy via Render and verify terminal live status and public behavior.
- Contracts/migrations: unchanged. Main through `0a0f297` merged unchanged.
