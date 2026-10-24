# exhibit

**Review the evidence. Ship with confidence.**

Exhibit is a PR evidence platform: run a reviewed flow against staging dependencies,
then attach deterministic assertions, provenance and recordings to the exact commit.
This repository is the runnable workspace application, with a light-mode React interface
and a Go/PostgreSQL control plane. Customer execution remains a separate integration.

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
- Agent request/manifest validation, checksum checks and optional sample browser recordings in CI.
- Agent context, flow/runbook examples, task handoffs and worktree automation.

**Not implemented yet:** live GitHub App installation/webhook ingress, public identity recovery,
isolated customer execution, agent SDK execution, trusted artifact upload/redaction, and posting evidence
to PRs. The UI does not fabricate working integrations. Start with the ordered
[backlog](agents/backlog.md); the foundation is not a public multi-tenant service.

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
