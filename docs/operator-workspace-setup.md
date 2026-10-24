# Provision the selected Render pilot workspace

`Provision Exhibit workspace` is a manual, default-branch-only operator workflow.
It targets the existing Exhibit service and the explicitly created, empty
`exhibit-workspace` Render database in Avdhut's workspace. It does not create a
public registration endpoint or execute sample-project PR code.

Add `RENDER_API_KEY` in this private repository's Actions secrets, then dispatch
`.github/workflows/provision-workspace.yml` from `main` with owner email, display
name and workspace name. The script validates resource ownership, source and
region. It temporarily allows only the runner's IPv4 address alongside existing
rules, runs explicit migrations and owner provisioning, and restores the original
network rules even when an operator command fails. Migrations never run on app
startup. Existing owners are never reset or overwritten: check completed steps
before retrying a failed workflow.

The password is generated in the job and masked before any commands run. Only an
RSA-OAEP-SHA256 encrypted credential is uploaded, with one-day retention. The
corresponding operator private key remains outside version control in the task
checkout; it is not available to Actions. No plaintext password or database URL is
written to the job summary or artifact. The public key in
`infra/operator-bootstrap.pub` belongs only to this setup task; replace it and
retain the corresponding private key securely for future setups.

After provisioning, the workflow patches only `DATABASE_URL`, `EXHIBIT_STORE`,
`EXHIBIT_COOKIE_SECURE` and `EXHIBIT_PUBLIC_ORIGIN` on the existing service. Other
variables are preserved. The internal Render database URL stays in Render secret
configuration. A deploy is monitored to terminal live status, then password login,
repository setup, sample flow persistence and logout are checked against HTTPS.
The repository points to `justafolk/sample-project-exhibit`, its existing hosted
sample, and an immutable sample runbook. This saves preparation metadata only;
the sample runbook remains unapproved and no execution or ingestion is enabled.

This existing service is managed directly, not by a linked Blueprint. The root
`render.yaml` still describes a disposable demo preview. Do not sync that Blueprint
over the private pilot: its explicit demo store would override database mode.
Reconcile the Blueprint first if migrating infrastructure management later.
The free database expires on November 23, 2026; upgrade or export before then to
retain accounts and workspace configuration. No paid upgrade is performed here.

The workflow does not implement unattended rollback of partially completed setup.
If it fails after owner creation, preserve that run's encrypted credential and
inspect the database and deployment status before retrying. If a deployment fails,
Render normally retains the previous running app; saved environment changes still
need deliberate reconciliation. Tests cover target mismatch rejection, enforced
external TLS, network-rule restoration and preventing service changes after a
failed operator command. The live workflow remains the integration verification.
