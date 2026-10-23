## Change

What problem does this solve, and what behavior changes?

## Validation

Commands actually run, results, and coverage gaps. Include UI evidence when useful.

## Evidence contract

For changes eligible for staging evidence, provide the following (no secrets):

```yaml
repository: owner/repo
pullRequest: 0 # replace with the PR number
headSha: replace-with-full-head-sha
changeKind: frontend # frontend | backend | fullstack | docs | migration
environment: staging
flowIds: []
runbookRef: reviewed-immutable-version
testTenant: approved-test-tenant-reference
```

Or state **Not applicable** with a reason. The contract evaluator checks completeness
only; the future orchestrator must verify permissions, refs, budgets and tenant scope.

## Risks and rollout

Schema/API changes, deployment steps, remaining work, or “none”.
