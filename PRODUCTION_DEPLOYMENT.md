# AboEssa Production Deployment

This runbook is prepared but is not evidence of a deployment. A real owner-provided hostname, an authorized server, DNS control, legitimate TLS material, and production secrets are still required. Never substitute a fabricated hostname or self-signed certificate.

## Production architecture

`docker-compose.prod.yml` publishes only nginx on ports 80 and 443. The API listens only on the private Compose network, PostgreSQL and Redis publish no host ports, and MinIO is intentionally absent because the current API stores uploaded files in the private `uploads` volume rather than using MinIO.

nginx rejects unknown hosts, redirects the configured hostname from HTTP to HTTPS, accepts TLS 1.2/1.3, forwards the real client address through one trusted proxy hop, supports Socket.IO upgrades, applies a 10 MiB request limit, and uses longer timeouts only for `/socket.io/`. The API disables Swagger by default in production.

## External prerequisites

- `PRODUCTION_DOMAIN_REQUIRED`: owner-controlled hostname only, without a scheme.
- `PRODUCTION SERVER REQUIRED`: owner-authorized host with ports 80/443 and Docker Compose.
- DNS A/AAAA records pointing only to that server.
- A legitimate certificate full chain and private key for the hostname, obtained through the owner's ACME/hosting workflow.
- External files containing strong PostgreSQL and Redis passwords.
- External production environment file based on `production.env.example`.
- Existing Firebase Admin JSON outside the repository, mounted read-only.
- A tested off-server backup destination and owner-approved retention/RPO/RTO.
- Customer authentication uses phone and password; no OTP delivery provider is required.

## Production environment

Copy `production.env.example` to an access-restricted path outside the repository. Fill every required blank from the deployment secret manager. `PUBLIC_BASE_URL` must be the real HTTPS API origin. Leave `CORS_ORIGINS` empty when only native Android clients are supported; this denies browser-origin CORS. If a browser client is approved later, use a comma-separated list of exact HTTPS origins with no paths or wildcards.

Startup validation rejects HTTP/private development URLs, wildcard/non-HTTPS production CORS, unauthenticated production Redis, missing database passwords, missing Firebase project ID when Firebase is enabled, and known placeholder secrets. `TRUST_PROXY_HOPS=1` is correct only while nginx is the sole proxy in front of NestJS.

Do not put database, Redis, JWT, Firebase, TLS, storage, provider, password, access, refresh, or Authorization secrets in Git, mobile builds, reports, or shell output.

## TLS and DNS sequence

1. Owner supplies the production hostname and authorized server.
2. Create DNS A/AAAA records and wait for authoritative/public resolution to match that server.
3. Allow inbound TCP 80 and 443 only; do not publish API, PostgreSQL, Redis, or a MinIO console.
4. Obtain a legitimate certificate for the exact hostname using the server's approved ACME client (for example Certbot standalone before nginx starts).
5. Point `TLS_FULLCHAIN_FILE` and `TLS_PRIVATE_KEY_FILE` to the resulting external files.
6. Configure renewal and recreate/reload nginx after a successful renewal. Verify the new certificate externally before expiry.

Do not enable HSTS on an unrelated hostname. The supplied nginx configuration sends HSTS only from the valid HTTPS virtual host after successful TLS startup.

## Deployment variables

Set these in the operator session or deployment secret manager. Values shown in angle brackets are descriptions, not literal values:

```powershell
$env:PRODUCTION_DOMAIN = '<owner-provided-hostname>'
$env:ABOESSA_PRODUCTION_ENV_FILE = '<absolute-external-production-env-file>'
$env:POSTGRES_PASSWORD_FILE = '<absolute-external-postgres-password-file>'
$env:REDIS_PASSWORD_FILE = '<absolute-external-redis-password-file>'
$env:FIREBASE_SERVICE_ACCOUNT_HOST_FILE = '<absolute-external-firebase-admin-json>'
$env:TLS_FULLCHAIN_FILE = '<absolute-legitimate-fullchain-file>'
$env:TLS_PRIVATE_KEY_FILE = '<absolute-legitimate-private-key-file>'
```

Create password files interactively with restricted filesystem permissions. Do not place the password in command-line arguments or a committed `.env` file. The API entrypoint URL-encodes the external passwords without printing them.

## Preflight and rollout

From the Backend directory on the authorized server:

```powershell
docker compose -f .\docker-compose.prod.yml config --quiet
docker compose -f .\docker-compose.prod.yml build api
powershell -ExecutionPolicy Bypass -File .\scripts\backup-postgres.ps1 -OutputDirectory '<approved-backup-path>'
docker compose -f .\docker-compose.prod.yml up -d
docker compose -f .\docker-compose.prod.yml ps
```

The API runs `prisma migrate deploy` before startup. Never run `prisma migrate reset`, delete volumes, or restore over the primary database. Schedule a maintenance window when a migration is not backward compatible.

## Production verification gate

Run these only against the real hostname:

```powershell
Invoke-WebRequest -UseBasicParsing "https://$env:PRODUCTION_DOMAIN/health"
Invoke-WebRequest -UseBasicParsing "https://$env:PRODUCTION_DOMAIN/ready"
```

Then verify:

- HTTP redirects to the same hostname over HTTPS.
- The certificate hostname, chain, issuer, and expiry are valid without bypass flags.
- Unknown Host requests are rejected.
- `/api/docs` is unavailable unless explicitly enabled for a controlled operational need.
- Socket.IO connects over the same secure endpoint and rejects unapproved browser Origins.
- PostgreSQL and Redis remain unreachable from the public network.
- One representative production FCM push reaches a signed Customer build, opens the intended destination, and persists in Notifications.
- Logs contain request IDs and high-level errors but no credentials, passwords, tokens, Authorization headers, or Firebase registration tokens.

`/health` is liveness. `/ready` checks PostgreSQL and Redis and must gate traffic. A local/development PASS is not a production HTTPS PASS.

## Backup and restore

Run `scripts/backup-postgres.ps1` before rollout and on the approved schedule. Prove each backup generation with `scripts/restore-drill.ps1` against its isolated temporary database. A same-server backup is not sufficient: encrypt and copy it to an owner-approved second failure domain. Uploaded files in the `uploads` volume require an independent snapshot/mirror and restore test; PostgreSQL dumps do not contain them. See `BACKUP_RESTORE.md`.

## Rollback

Stop new writes, preserve logs and the failed image, and assess schema compatibility before rolling the application image back. Never roll the database backward destructively. Restore only into a new database, validate it, then deliberately switch connection settings. Keep the prior signed mobile artifact and server image digest in the release manifest.

## Waflo boundary

Every command in this runbook targets only the AboEssa directory/Compose project. Do not inspect, stop, restart, network, mount, or modify Waflo.
