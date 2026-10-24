# exhibit

**Review the evidence. Ship with confidence.**

**Commit-linked video and API evidence for AI-authored pull requests.**

AI tools help teams produce code quickly. Maintainers still need to inspect what the
change actually does. Exhibit brings frontend recordings, backend test results and
Codex-assisted review into the pull request, with the tested commit and coverage gaps
kept visible.

Built for the **Developer Tools** theme at the **DevDay Exchange Community Metro
Hackathon Pune, 24 October 2026**. The prototype includes a React/TypeScript review
workspace, a Go/PostgreSQL control plane and a working sample GitHub Actions integration.
General customer staging execution and hosted artifact ingestion remain future work.

**Review the project:** [three-minute demo, criteria map and evidence](docs/hackathon.md).
The guide links implemented features to source, tests and a completed CI run.

## Start locally

Prerequisites: Node 22.12+ (Node 22 pinned in `.node-version`), npm 10, Go with automatic
toolchain download enabled, Python 3, Git and Make. Docker is optional for sample mode.
Linux/macOS are supported; on Windows use WSL2.

```sh
make bootstrap
make dev
```

Open the local URL printed by Vite. Ports are allocated per checkout in `.env`.
The default experience is **sample evidence**: no GitHub installation, staging secrets,
agent subscription or database is needed. Choose **Explore sample workspace** on the
sign-in screen. **Prepare evidence** calls the real Go completeness evaluator.

```sh
make db-up
make migrate
# Provision a private owner using docs/workspace-guide.md.
# Use EXHIBIT_STORE=postgres EXHIBIT_COOKIE_SECURE=false make dev for local HTTP.
```

The [workspace guide](docs/workspace-guide.md) covers private owner provisioning,
setup, flows and evidence preparation. `make seed` is optional; seeded records are
quarantined in an unclaimed sample workspace, never assigned to a new owner implicitly.

## Parallel AI development

Read [AGENTS.md](AGENTS.md) for the full operating guide.

```sh
make worktree NAME=github-webhooks
cd ../exhibit-worktrees/github-webhooks
make bootstrap
make dev
```

Each checkout gets separate ports, local configuration, dependencies and PostgreSQL
volumes. The helper never copies secrets. `CLAUDE.md` and Copilot instructions point
to the same canonical guidance.

## What works today

- Private password sign-in, revocable cookie sessions, workspace roles and tenant isolation.
- Responsive light-mode workspace with URL-preserved search and commit-linked reports.
- Persistent setup, authored flow definitions, editable contract drafts and workspace settings.
- Qualified Markdown report copy/download, including assertions and coverage gaps.
- Local screen capture/video import, chapter playback, framing and original-file checksum manifests.
- Tenant-scoped manual recording metadata and recent preparation activity; media stays local.
- Real HTTP contract evaluation with `ready`, `needs_info`, and `not_testable` outcomes.
- Explicit sample mode or PostgreSQL run reads; readiness and build-provenance endpoints.
- Checked migrations, local sample seeding, shared OpenAPI and generated client types.
- Unit, race, database, browser, format, type and container checks in GitHub Actions.
- Playable curated frontend recordings and a separate API/cURL evidence explorer, with original downloads and source hashes.
- Opt-in `agent-test` sample PR workflow: real backend API results, frontend videos/traces, clean-commit provenance and checksums.
- Isolated Codex CLI review of evidence metadata, with advisory HTML/Markdown/JSON reports.
- Account-verified start/report PR comments, animated recording previews and full-resolution artifact links.
- Agent request/manifest validation and local automatic sample recording.
- Agent context, flow/runbook examples, task handoffs and worktree automation.

**Prototype boundary:** the working Actions integration is scoped to the sample repository;
the dashboard's bundled gallery is a curated snapshot, not live CI ingestion. General GitHub
App installation/webhook ingress, public identity recovery, isolated customer staging
execution, private artifact ingestion/redaction and independently trusted verdicts are
not implemented. Passing tests and Codex advice do not certify a customer change.
See the [criteria and evidence guide](docs/hackathon.md#current-boundaries) and
[backlog](agents/backlog.md) for the current scope.

## Repository layout

```text
apps/web/             React + TypeScript + Vite
services/api/         Go control-plane API and CLI commands
db/                   PostgreSQL migrations
packages/contracts/   OpenAPI and generated TypeScript types
agents/               Flow catalog, runbooks, policy and task handoffs
infra/                Docker and local/single-host Compose
scripts/              Developer and worktree tooling
tests/e2e/            Playwright behavior checks
.github/              CI, dependency updates, contribution templates
docs/                 Product, architecture, development and deployment
```

## Automatic recording for agents

After committing a change, run `npm run evidence:record` from this repository. It
records the sample browser suite and returns a local bundle with videos, traces,
checksums and an unverified report. No screen-sharing steps or dashboard forms are
required. Dependencies and Chromium must be installed. This command is a local repository
self-test. The separate sample GitHub Actions workflow captures frontend/API evidence,
runs advisory Codex review and publishes PR comments; it is not a general customer
execution or hosted-ingestion service. See [the demonstrated flow](docs/hackathon.md#recorded-end-to-end-evidence).

See [agent experience and feature research](docs/agent-experience.md).

## Verify

```sh
make check
make db-up && make test-integration
npx playwright install chromium
make e2e
```

See [development](docs/development.md), [architecture](docs/architecture.md),
[product scope](docs/product.md), [deployment](docs/deployment.md), and
[security boundaries](docs/security.md). The original [requirements](requirements.md)
remain as the problem statement. Business and technical choices are recorded in
[ADRs](docs/decisions/0001-mvp-foundation.md).

This repository is private. No open-source license is granted.
