# Trust boundaries

The current foundation is for local development or private access behind a trusted proxy.
It does not implement login, organization isolation, GitHub webhook ingress, secret storage,
job execution or a public artifact service. Treat these as pilot prerequisites.

The contract evaluator consumes untrusted metadata and performs no execution. `ready`
is a completeness result only. Future authorization must derive installation, actor,
repository, head SHA and approval from verified GitHub APIs/events, not request fields.
Never pass arbitrary runbook commands from a PR to a host shell with staging credentials.

Default future execution policy: reject forks and untrusted authors without trusted
approval; never use production; use dedicated staging tenants and short-lived credentials;
isolate network egress; bound elapsed time and spend; require explicit reviewed write
allowlists; prohibit shared schema migrations; namespace queues and cleanup by run ID.
Runbook/catalog approvals must be versioned outside the untrusted PR tree.

Artifacts can contain tokens, cookies, account information and PII. Redaction must occur
before publication, with private expiring downloads and integrity hashes. Trusted collection
and deterministic results must remain out of reach of the code being tested. An agent cannot
authorize its own run, edit the verifier's result or suppress failed attempts.

CI uses read-only repository permissions and immutable action commits, installs locked
dependencies and runs no privileged `pull_request_target` workflow. Local `.env`, outputs,
worktrees, browser traces and dependencies are ignored. Sample secrets are local-only.
Do not place real secrets in fixtures, PR text, docs, screenshots or generated reports.

Report a vulnerability privately to the repository owner. Do not open an issue containing
credentials or sensitive evidence. Before a customer pilot, implement the execution policy
in `agents/policies/execution.md` and add tests proving those boundaries.
