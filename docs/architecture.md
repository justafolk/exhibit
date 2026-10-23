# Architecture

The foundation is a modular monorepo with two language ecosystems. npm workspaces own
JavaScript tooling and shared contracts; a single root Go module owns the API and database
commands. Make is the common interface. No monorepo task runner is needed at this size.

## Current runtime

The browser calls same-origin `/api/*`. Vite proxies to Go in development. In the image,
Go serves the built static client and API from one process. `EXHIBIT_STORE=demo` reads
embedded fixtures; `postgres` reads actual metadata. There is no fallback from a failed
real database to demo data. Readiness checks schema availability as well as connectivity.

The API exposes health, readiness, build version, authenticated run reads, workspace
setup and contract completeness evaluation. Opaque cookie sessions identify a user,
workspace and server-enforced role. PostgreSQL stores password hashes, session hashes,
memberships and configuration; demo sessions use isolated in-memory configuration.
An operator CLI creates the first owner. There is no public registration or account recovery.
Mutations require an exact allowed origin and a session-bound CSRF token. Every real
run query requires workspace scope; legacy records remain in an unclaimed sample workspace.
Run filters apply before the latest-100 limit. Authored flow definitions and contract
drafts have tenant ownership, bounded domain validation and actor/time metadata.
There is no mutation endpoint that schedules customer execution.
OpenAPI is the shared boundary; TypeScript types are generated and CI detects drift.

PostgreSQL holds relational metadata and JSONB assertions. Artifacts will live in private
object storage with checksums, redaction gates and retention, not in database byte columns.
Migrations are explicit, checksum-verified and transactionally serialized. They are never
applied automatically on API startup. Sample seeding is loopback-only and idempotent.

## Target execution boundary (not implemented)

A GitHub App verifies webhook HMACs, delivery IDs, installation identity and authoritative
head SHA. It evaluates trusted policy before enqueueing. The control plane stores jobs
in PostgreSQL. A worker will claim them with `FOR UPDATE SKIP LOCKED`, renewable leases,
attempt records and timeouts; no Redis is necessary at MVP scale.

The control plane must never execute unreviewed customer code. A separately provisioned,
disposable runner gets scoped staging credentials and an allowlisted network. It records
provenance, uses reviewed preconditions and deterministic assertions, uploads artifacts
through a trusted collector, cleans up run-tagged data and reports every final outcome.
Containers alone are not the security boundary for arbitrary hostile code; choose a
managed isolation provider or equivalent hardened VM boundary for a customer pilot.
Provider adapters remain unimplemented until one pilot flow defines their requirements.

## Boundaries that matter

- Platform database versus customer staging: separate credentials and migrations.
- Contract completeness versus execution authorization: only trusted policy authorizes work.
- Run output versus verification: a trusted verifier derives the verdict from assertions.
- Metadata versus evidence blobs: small relational rows versus expiring private objects.
- Current workspace versus future product: operational identity recovery, GitHub ingress,
  isolated execution and trusted artifact delivery remain separate integration work.

Nested `AGENTS.md` files describe module conventions. Keep dependencies pointed inward:
HTTP depends on evidence/store; domain rules do not depend on HTTP. External integrations
belong behind small interfaces when there is an actual implementation to integrate.
