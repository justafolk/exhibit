# Explicitly populate an existing workspace with samples

The owner requested filling their deployed workspace with sample data. This is an
explicit operator exception to the local-only development seed policy; the existing
`seed` command and its loopback guard remain unchanged.

The manual, default-branch-only `Populate workspace samples` workflow runs the new
`populate-workspace` operator CLI with an exact workspace ID, matching owner email,
and `--confirm-sample-data`. It uses the same selected Render service/database and
restores temporary external network access afterward. It does not change service
environment variables, accounts, passwords, schema or deployment.

The CLI locks and validates the target workspace's owner membership, then inserts
eight illustrative runs in one transaction. IDs include the workspace ID and a
stable sample slug. Existing rows and owner edits are preserved on repeats; no
other workspace is updated. Every inserted run has `sample=true`, a `Sample:`
title, synthetic PR number, and explicit limitations stating that no PR was
executed. Verified/partial/failed/queued/running/unavailable statuses are static
illustrations, not trusted verdicts or active jobs. These records use the sample
repository's main source commit for context and do not claim CI artifact provenance.

The workspace's flows, draft and recording metadata are populated through its
normal authenticated API. The three recording manifests identify the unchanged
public CI sample clips; metadata storage does not upload media or verify a run.
Original playable CI clips, browser traces and supplemental cURL evidence remain
available separately in the sample evidence explorer. No unrelated recording is
attached to an illustrative run.

Validation includes real PostgreSQL CLI integration: mismatched owner rejects all
writes, eight rows remain eight on repeated execution, all rows are sample-labeled,
other workspaces remain empty, and an owner-edited title survives another seed.
