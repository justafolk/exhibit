# Workspace platform implementation plan

This plan implements the requested Cloudflare-inspired Exhibit workspace in the
existing React, Go and PostgreSQL application. Light surfaces, fine neutral borders,
compact system typography (SF Pro, Helvetica Neue, Arial), a restrained blue accent,
and semantic status colors support evidence review without decorative clutter.

## Delivery order and ownership

1. Product planning: define journeys, permission boundaries, contracts and acceptance.
2. Parallel implementation, authentication first:
   - Frontend: sign-in and role-aware shell, then overview, runs, setup, flows and settings.
     Use an isolated preview adapter before API integration.
   - Backend: server-issued sessions, workspace membership and tenant predicates,
     followed by persistent setup and evidence APIs. Backend owns OpenAPI and migrations.
3. Integrate frontend with generated contracts and the Go API; exercise actual browser flows.
4. Perform three further plan/build/integrate cycles:
   - Reviewer workflow: deep links, search/filtering, gaps, portable evidence reports.
   - Setup workflow: reusable flow definitions and explicit contract completeness checks.
   - Recording studio: local capture/import, chapter navigation and presentation controls,
     with original media preserved and recording provenance clearly qualified.
5. In parallel, implement bounded agent/GitHub tooling with deterministic tests,
   explicit trigger policy, replay controls and commit-linked reporting conventions.

Each task has an isolated worktree. The integration checkout owns end-to-end tests,
cross-module integration and this plan. No branch may overwrite another task's work.

## User journeys

- An operator provisions the first account through a trusted local bootstrap path.
  A visitor signs in; an explicitly labelled sample preview remains available locally.
- A new workspace records its repository, staging origin, dedicated test-tenant
  reference and immutable runbook reference. Saving metadata does not connect GitHub,
  validate credentials, approve a runbook or start execution.
- A reviewer opens the overview, finds an evidence run, checks the exact SHA,
  assertion outcomes and coverage gaps, and exports a clearly attributed report.
- An editor defines a bounded flow and evaluates an evidence contract. Completeness
  and execution permission are separate states throughout the interface.
- A reviewer creates a local demonstration recording. Media and chapters are useful
  context, never a substitute for independently collected assertions.

## Low-level requirements

- Hash passwords with a standard password KDF and unique salts; use opaque random
  sessions stored as hashes, HttpOnly cookies, expiry and logout revocation.
- Enforce server-side workspace roles (owner, editor, viewer). Clients cannot grant
  themselves membership or authority. All real run reads include a workspace predicate.
- Protect authenticated mutations from cross-origin requests. Reject invalid and
  oversized JSON; do not log passwords, session tokens or raw webhook bodies.
- Keep health/version endpoints public and metadata responses uncached. Authentication
  failures cannot fall back to sample or globally visible PostgreSQL records.
- Store workspace/account/session/setup/flow metadata through additive migrations.
  Never rewrite migration 0001 or apply customer staging migrations.
- Generate TypeScript contracts from OpenAPI. Provide loading, empty, denied and
  retry states; retain drafts on save errors; avoid successful UI claims before persistence.
- Make routes directly navigable, interactive controls keyboard accessible, and layouts
  usable at desktop and mobile widths. Use local assets and system fonts.
- Do not issue a successful verdict from a recording, user text or model narrative.
  Preserve sample labels and distinguish configured, authorized and executed states.

## Acceptance and limits

Verify login/logout and protected routes, role enforcement, tenant isolation, durable
configuration, contract evaluation and report provenance. Browser checks must cover
navigation, setup, filtering, errors and responsive layouts against the Go service.
Capture the finished interface for visual review. Run relevant Go race tests, database
integration tests, generated-contract checks, frontend build and existing tooling checks.

External GitHub App installation, production identity/recovery, credentials, hardened
runner provisioning, trusted artifact collection/redaction and private object storage
require real external configuration. Until those are connected, the app must state
that it cannot execute customer PRs or certify recordings as verified evidence.
