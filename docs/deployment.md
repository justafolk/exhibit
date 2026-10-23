# Low-cost MVP hosting

The cheapest useful starting topology is **one small Linux VM, one Exhibit app container,
and PostgreSQL on the same VM**. Go serves the static frontend, so there is no second
web server or paid frontend runtime. Keep the API private until user/tenant authentication
is implemented. Expose a pilot through a TLS, identity-aware reverse proxy; binding the
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

```sh
docker compose --env-file /secure/exhibit.env -f infra/compose.mvp.yaml up -d --wait postgres
docker compose --env-file /secure/exhibit.env -f infra/compose.mvp.yaml run --rm --no-deps --entrypoint /app/migrate app
docker compose --env-file /secure/exhibit.env -f infra/compose.mvp.yaml up -d app
curl --fail http://127.0.0.1:8080/api/readyz
```

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

The scaffold supplies topology and build files, not a provisioned service, authentication,
automated backups or a runner. Do not run unreviewed PR code on the control-plane VM.
