# Using the Exhibit workspace

## Explore the sample workspace

Run `make dev` and open the printed web address. Choose **Explore sample workspace**
on the sign-in screen. Every evidence record in this mode is an illustrative fixture.
Sample setup is isolated to your session and is not durable configuration. Signing out
revokes the session. Sample access never grants access to a PostgreSQL workspace.

## Provision a private workspace

Start this checkout's database with `make db-up`, then apply platform migrations with
`make migrate`. Provision the first owner from a trusted terminal:

```sh
python3 -c 'import getpass; print(getpass.getpass("New password: "))' | \
  node scripts/with-env.mjs go run ./services/api/cmd/bootstrap-user \
  --email owner@example.com --name 'Workspace owner' --workspace 'My workspace' \
  --password-stdin
```

Use your own email, display name and workspace name. The password is read from stdin,
not a command argument. There is no default account, public registration or email reset.
The command provisions a new workspace; it does not adopt another workspace's records.
Passwords must contain 12–256 bytes. Do not send credentials in chat or commit them.

Start the local app with database-backed authentication:

```sh
EXHIBIT_STORE=postgres EXHIBIT_COOKIE_SECURE=false make dev
```

The explicit insecure-cookie setting is for local HTTP development only. PostgreSQL
mode otherwise defaults to secure cookies. For a private HTTPS deployment, configure
`EXHIBIT_PUBLIC_ORIGIN` to the exact public origin and retain secure cookies. See
[deployment](deployment.md) for the container topology.

## Prepare the first flow

Workspace setup records a repository, staging URL, dedicated test tenant and versioned
runbook reference. These are configuration details, not proof of a GitHub installation,
staging connectivity, reviewed approval or permission to execute a PR.

Owners manage workspace setup; editors prepare flow metadata and evidence contracts;
viewers read evidence. The API enforces these roles. A client-side role or hidden button
cannot grant access. Authentication and run reads are scoped to a workspace.

In **Flow catalog**, save a definition with preconditions, deterministic assertions,
cleanup instructions and a runbook reference ending in `@` plus the full commit SHA.
Definitions are authored preparation metadata, not approved execution policy.

In **Prepare evidence**, select a saved flow and supply the PR number, full head SHA,
repository and staging context. **Save draft** preserves incomplete work;
**Evaluate contract** explains missing or unsupported values without creating a run.
Flow and draft changes are persisted with actor and timestamp in PostgreSQL. In sample
mode, they remain session-local and disappear when you sign out or restart the API.

Owners can rename the workspace in **Settings**. Accounts and memberships remain
operator-provisioned; there is no public invitation or self-service role selector.

## Review evidence honestly

Review the complete head SHA, environment, assertion outcomes and uncovered behavior.
Sample records remain labelled in reports. Contract readiness only means required
metadata is supplied; it does not mean assertions ran or execution was authorized.

Search and status filters are part of the URL. Searches include the full SHA, PR number,
repository, title and run ID, and return up to 100 recent matching records within your
workspace. Copy or download a Markdown report to retain the source SHA and limitations.

Customer execution requires a separately provisioned isolation boundary and trusted
GitHub identity, runbook approval, credentials and artifact collection. Until those
services are connected, the workspace cannot execute customer PR code or issue new
verified evidence. Keep the app private while completing those pilot prerequisites.
