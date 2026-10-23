# Agent workspace

This directory is product knowledge and collaboration context, not an autonomous executor.
Start with the root `AGENTS.md` and `docs/product.md`.

- `backlog.md`: ordered, bounded implementation milestones.
- `flows/`: human-readable, versioned business-flow examples.
- `runbooks/`: install/start/environment recipes; secrets by reference only.
- `policies/`: required trust and execution boundaries for future workers.
- `templates/`: task and handoff structure for parallel agents.

The example flow and runbook are illustrative and not approved for execution. Approval must
reference the exact content/version in a trusted registry once that feature is implemented.
No runner currently reads these files or executes their commands.
