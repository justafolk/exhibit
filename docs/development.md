# Development and worktrees

## Prerequisites and bootstrap

Use Node 22 (`nvm use`), npm 10, Python 3, Make and Git. The Go directive/toolchain in
`go.mod` pins a supported compiler; an older Go installation with `GOTOOLCHAIN=auto`
can fetch it. Docker Compose v2 is needed for database tests and container builds.

`make bootstrap` creates `.env` only if absent, installs from `package-lock.json`, and
downloads Go modules. `make doctor` reports missing tools without printing secrets.
`make dev` starts both servers and terminates their process groups when stopped.
Environment variables supplied by the caller override `.env`.

## Database

Run `make db-up`, `make migrate`, and optionally `make seed`. Use `EXHIBIT_STORE=postgres`
in `.env` and restart dev. Each checkout owns a Compose project and named volume;
the host binding is loopback-only. The seed CLI refuses non-loopback URLs. The migration
CLI only touches Exhibit's database; verify `DATABASE_URL` before invoking it elsewhere.

Database mode requires a privately provisioned account; follow the
[workspace guide](workspace-guide.md). Local HTTP needs `EXHIBIT_COOKIE_SECURE=false`.
New checkout environments include that setting; older `.env` files must add it or
supply it when starting dev. Seeded sample records belong to an unclaimed sample
workspace and are never automatically granted to a newly provisioned owner. Use
the explicit demo-mode sample session when exploring fixtures.

`make test-integration` creates a uniquely named schema, tests migration idempotence,
checksum drift, sample seeding and API reads, then drops only that test schema. Its
DB user needs schema creation permission. A crashed test may leave an `exhibit_test_*`
schema; inspect before cleaning it up. Never point these tests at customer staging.

## Worktree isolation

Commit the baseline before creating a worktree. `make worktree NAME=feature-name`
creates a new `agent/feature-name` branch from the caller's HEAD in the sibling
`exhibit-worktrees` directory. It does not fetch, switch other branches or copy secrets.
Run `make bootstrap` inside the printed path. An ordinary `git worktree add` also works;
bootstrap derives a fresh identity from that checkout's absolute path.

Ports use three separate ranges (web 20000–29999, API 30000–39999, DB 40000–49999).
The helper checks running listeners and existing worktree environments, then searches
for another slot on collision. Allocation is not an OS-level reservation: two simultaneous
bootstrap processes can still race. If a bind fails, stop that checkout, remove only its
local `.env` after preserving custom settings, and rerun `make bootstrap` serially.

Compose project names use a checkout-path hash. Moving a checkout does not rewrite an
existing `.env`; regenerate deliberately if you need a new identity. Do not manually
reuse another checkout's Compose name. Database passwords in generated environments
are deliberately local-only; never reuse them on a host exposed to the internet.

Browser tests use fixed default ports 15173/18080, refuse server reuse and start their own
sample API. For simultaneous suites set unique `E2E_WEB_PORT` and `E2E_API_PORT`.

Before removing a worktree, run `make db-down` there, commit or intentionally resolve
all edits, then use `git worktree remove PATH` from another checkout. Volumes persist;
only run `docker compose --env-file .env -f infra/compose.dev.yaml down --volumes`
when you intend to erase that checkout's local database, before removing the checkout.
The helper never deletes branches, directories or volumes.

## Change recipes

**API:** edit handlers/domain + OpenAPI, run `npm run contracts:generate`, add meaningful
HTTP/domain tests and update consumers. `make check` verifies generated files are committed.

**Schema:** add the next numbered SQL migration; never edit applied files. Run migration
integration tests. Coordinate numbering across branches. Follow additive changes first.

**UI:** preserve accessibility and sample labels. Run typecheck/build and relevant browser
flows. The current system font stack makes no third-party requests.

**Dependency:** use npm from the root so the single lockfile updates. Commit the lockfile.
For Go, run `go mod tidy`. Dependabot proposes weekly updates. Containers use explicit
release tags; update and rebuild them regularly rather than assuming tags are immutable.

## Common failures

- Port busy: check `.env` and stale dev processes; do not kill another worktree's server.
- API 503: check `make db-up` and `make migrate`; there is no silent sample fallback.
- Go download blocked: allow access to official Go module/toolchain endpoints or provision the pinned toolchain.
- Browser missing: `npx playwright install chromium`; Linux CI uses `--with-deps`.
- New Go files unexpectedly skipped: run commands at the repository root.
