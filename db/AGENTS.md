# Database module

These migrations belong to Exhibit's control plane, not customer staging.
Use a new, monotonically numbered SQL file. Applied checksums are immutable.
Run `make test-integration` against a local database. The migration runner takes a
transactional advisory lock and applies pending migrations atomically.
Prefer additive changes with a staged rollout. Destructive changes need a documented
backup/recovery plan. Sample seeds are local-only and preserve `sample=true`.
