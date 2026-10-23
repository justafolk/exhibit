# ADR 0001: a small control plane and a separate execution boundary

- Status: accepted for the foundation
- Date: 2026-10-23

## Decision

Use React + TypeScript + Vite for a light-mode client, standard-library Go + pgx for the
API, PostgreSQL 17 for metadata, npm workspaces for JavaScript and a single root Go module.
Use Make as the common task interface. Serve the built frontend from Go in one image.
Use versioned OpenAPI with generated TypeScript types. Keep reviewed agent knowledge in Git.

Use PostgreSQL rather than MongoDB because runs, PRs, attempts, approvals and artifact
references are naturally relational. JSONB covers evolving evidence payloads. PostgreSQL
can later claim jobs transactionally, eliminating a separate queue service at MVP scale.

Start with a single inexpensive VM and same-host PostgreSQL, with off-host backups.
Leave managed Postgres possible via the connection URL. Do not add Kubernetes, Redis,
vector search, an ORM, a monorepo scheduler or an agent SDK before a concrete pilot needs it.
Model and runner providers remain undecided; deterministic evidence is the durable contract.

## Scope tradeoff

Deliver developer infrastructure and a runnable product surface now. GitHub auth/webhooks,
execution, secrets, redaction and reporting require independent implementation and review.
The foundation uses clearly labelled samples instead of pretending these systems exist.
The runtime stays private until identity and tenant isolation are complete.

## Worktrees

Use sibling worktrees and deterministic path-derived identities with collision checks.
Generate separate environment files, port groups, Compose projects and database volumes.
Do not share secrets or dependency directories. Avoid hidden agent-specific IDE configuration;
canonical `AGENTS.md` plus thin provider instruction files work across tools.

## Consequences

There are two compiler ecosystems, but both are widely supported and independently testable.
A single VM is inexpensive but has one failure domain and requires backups/patching. The
control plane must not host hostile PR execution. Upgrade to managed database/runner services
when operational evidence justifies their cost, rather than designing for imaginary scale.
