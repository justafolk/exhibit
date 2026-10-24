# Low-cost MVP hosting

The cheapest useful starting topology is **one small Linux VM, one Exhibit app container,
and PostgreSQL on the same VM**. Go serves the static frontend, so there is no second
web server or paid frontend runtime. The API has private workspace authentication;
keep it private while identity recovery and execution controls mature. Expose a pilot
through a TLS, identity-aware reverse proxy; binding the
Compose port to loopback is intentional.

A practical planning budget is roughly **€6–12/month for the control plane**, plus tax,
IPv4 if selected, off-host backup storage and usage. This is a budget estimate, not a
provider quote. Hetzner's published June 2026 table lists an EU CX23 at €5.49/month
before applicable extras: [official pricing change](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/).
Availability and regional pricing vary; verify at purchase. No server has been provisioned.

If managed database operations matter more than a fixed bill, Neon is an alternative:
its October 2026 announcement describes 1 GB storage per free project. Free limits,
suspension and backup guarantees need checking before relying on it for customers:
[official free-plan update](https://neon.com/blog/neon-free-plan-1-gb-per-project).
The standard `DATABASE_URL` connection makes switching possible; require TLS for remote DBs.

Execution is a separate variable cost. A disposable runner, browser artifacts, object
storage and agent tokens are not included in the control-plane estimate. Start with one
concurrent run, a ten-minute deadline, an explicit per-run token/spend cap and short artifact
retention. These limits are proposed policy, not implemented enforcement yet.

## Build and operate the private foundation

```sh
docker build -f infra/Dockerfile --build-arg COMMIT_SHA="$(git rev-parse HEAD)" -t exhibit:local .
```

Smoke-test the built image with `python3 scripts/smoke-image.py exhibit:local`. The
script starts a temporary, loopback-bound demo container and always stops it.

Create an environment file **outside this repository**, using
`infra/.env.production.example` as the key reference. Use a strong URL-safe database
password and the actual commit SHA. The example password is not safe to deploy.
Set `EXHIBIT_PUBLIC_ORIGIN` to the exact HTTPS origin users will open. The deployment
keeps Secure session cookies enabled and rejects mutations from other origins.

```sh
docker compose --env-file /secure/exhibit.env -f infra/compose.mvp.yaml up -d --wait postgres
docker compose --env-file /secure/exhibit.env -f infra/compose.mvp.yaml run --rm --no-deps --entrypoint /app/migrate app
docker compose --env-file /secure/exhibit.env -f infra/compose.mvp.yaml up -d app
curl --fail http://127.0.0.1:8080/api/readyz
```

Before the first sign-in, provision an owner through the trusted operator connection.
The image includes `/app/bootstrap-user`; pipe a password from a secure prompt to
`docker compose ... run --rm -T --no-deps --entrypoint /app/bootstrap-user app
--email owner@example.com --name 'Owner' --workspace 'My workspace' --password-stdin`.
Do not put passwords in command arguments. The [workspace guide](workspace-guide.md)
shows the equivalent local command. No default credentials or public sign-up exist.

The app uses an unprivileged user, read-only root filesystem, dropped capabilities and
no Docker socket. The database has no host port in this topology. Expose only the proxy,
not PostgreSQL. Restrict database access using a runtime role before a real pilot; the
initial Compose role is an owner for convenience and should not be reused as a staging identity.

## Release and recovery checklist

1. Pass CI. Build/tag an image for the immutable commit; retain the previous image.
2. Take an encrypted off-host PostgreSQL backup and verify a restore regularly.
3. Apply additive migrations explicitly before switching traffic; startup never migrates.
4. Start the new app and verify readiness/version. Roll back the app image if unhealthy.
5. A destructive schema change cannot be undone by rolling back an image; use forward fixes
   or a rehearsed restore. There is deliberately no automatic down-migration command.
6. Monitor database disk/backup age, API errors and latency. Once execution exists, also
   monitor lease expiry, cleanup failures, artifact retention and run cost.

The repository supplies topology, build files and private workspace authentication,
not a provisioned service, automated backups or an isolated runner. Do not run
unreviewed PR code on the control-plane VM.

## Render sample preview

The root `render.yaml` deploys the tested `agent/studio-handoff` branch as a Docker
web service on the free plan, serving both the React app and Go API. It explicitly
uses `EXHIBIT_STORE=demo`; no database, private accounts, staging credentials, or
customer execution are provisioned. Sample edits are session-local and are lost
when the service restarts. Render may suspend idle free services.

Create a Blueprint from this repository and select `agent/studio-handoff`. Grant
Render's GitHub App access to this private repository if required. The Blueprint
uses `/api/readyz` as its health check and disables automatic deployments.
After Render reports the service live, open its HTTPS URL and choose
**Explore sample workspace**. Confirm `/api/version` and exercise a saved flow,
contract evaluation, and metadata save before considering the preview ready.

Secure cookies are enabled. The server validates browser mutation origins against
its HTTPS request host when `EXHIBIT_PUBLIC_ORIGIN` is unset. If using a custom
proxy that changes the host, set `EXHIBIT_PUBLIC_ORIGIN` to the exact browser-facing
HTTPS origin. Never turn off cookie security to work around a proxy mismatch.

This configuration is a sample preview. A durable private deployment requires
PostgreSQL, explicit migrations, owner provisioning, and restricted access as
described above. This Blueprint has not itself been deployed or remotely verified.
