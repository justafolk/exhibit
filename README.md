# exhibit

**Review the evidence. Ship with confidence.**

Exhibit is a PR evidence platform: run a reviewed flow against staging dependencies,
then attach deterministic assertions, provenance and recordings to the exact commit.
This repository is the runnable MVP foundation, with a light-mode dashboard and a
Go/PostgreSQL control plane.

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
agent subscription or database is needed. Use “Check a contract” to call the real Go evaluator.

```sh
make db-up
make migrate
make seed
# Set EXHIBIT_STORE=postgres in .env, then restart make dev.
```

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

- Responsive light-mode dashboard; search/filter runs; inspect assertions and coverage gaps.
- Real HTTP contract evaluation with `ready`, `needs_info`, and `not_testable` outcomes.
- Explicit sample mode or PostgreSQL run reads; readiness and build-provenance endpoints.
- Checked migrations, local sample seeding, shared OpenAPI and generated client types.
- Unit, race, database, browser, format, type and container checks in GitHub Actions.
- Agent context, flow/runbook examples, task handoffs and worktree automation.

**Not implemented yet:** GitHub App installation/webhooks, user/tenant authentication,
job execution, agent SDK integration, artifact upload/redaction, and posting evidence
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
