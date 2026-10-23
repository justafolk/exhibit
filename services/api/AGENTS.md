# Go API module

The Go module is at the repository root; run `go test ./...` there.
Use `net/http`, structured logs, request contexts and bounded input. Never log credentials
or raw request bodies. Domain checks cannot grant execution authority.
Database migrations are embedded from `db`; PostgreSQL tests use disposable schemas.
New endpoints need matching OpenAPI and meaningful HTTP/domain tests. Keep the process
loopback-bound in development and graceful on SIGTERM. Do not start jobs in HTTP handlers.
