# Required policy before implementing a runner

These are implementation requirements, not controls already enforced by a running service.
The current scaffold never executes customer code.

1. Verify GitHub signatures and authoritative actor/installation/commit facts. PR prose
   and repo files cannot grant authority. Reject forks by default.
2. Resolve a reviewed runbook and seed plan by immutable version from a trusted source.
   Treat changed runbooks as unapproved. Restrict execution to the approved staging tenant.
3. Use disposable isolation, scoped short-lived credentials and allowlisted egress. Keep
   production entirely out. The control-plane host and Docker socket are never available.
4. Never alter shared staging schemas. Use a separately approved isolated clone for migrations.
   Prefix queues/consumer groups by run ID or disable consumers.
5. Enforce runtime, token, network/request and spend limits independently of the agent.
   Record all attempts, retries, cancellations and terminal states.
6. Record head SHA, clean tree and version endpoint before assertions. Deterministic checks
   decide outcomes; a trusted collector/verifier owns evidence integrity.
7. Redact secrets/PII before making artifacts downloadable. Keep objects private with short
   retention and integrity hashes. An agent must not modify stored assertion results.
8. Clean only the approved tenant's run-tagged records. Lease expiry and janitors recover
   abandoned jobs. Cleanup failure is an explicit report outcome, never silently ignored.
9. Post a concise report for every final outcome, including what was not covered. No fabricated
   recordings, successful assertions or observed facts.
