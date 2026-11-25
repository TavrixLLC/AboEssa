# REZONA Admin production operator runbook

## Current addendum — 130f0653-v2, 2026-11-24

**NO live GO.** The older instructions below are retained as context; apply these corrections first. Current evidence is in `docs/benchmarks/admin-production-hardening/130f0653` and the current readiness-report addendum. All executed remote commands were read-only inspection/streaming backup. No source, credentials or images were pushed to GitHub.

1. Live baseline is now verified at `/opt/aboessa/releases/20261102-guest-account`, API image `sha256:aaef434fb83436522ec03b488a67e367928d806205a3793f006f5adfb8064c03`,19 migrations. Current MinIO uses the root identity; do not carry that into a production approval by accident. Never print Docker environment or private backup payloads into a shared terminal/report.
2. There is one historical checksum discrepancy (`202609190001_auction_optional_featured_rarity`). Local/deployed/three September source archives agree with each other; the recorded migration hash differs. Independently reconstructed19-migration schema and the fresh restore are exactly equal, including full PostgreSQL schema comparison. Preserve this evidence. **Do not edit `_prisma_migrations`, use reset/dev/db push or blanket resolve to hide it.** Obtain a formal history disposition before live migration. The21 pending migrations passed only on a separate diagnostic copy; the unmodified19 baseline remains available.
3. Fresh DB/media backups are encrypted with Windows DPAPI CurrentUser under the restricted private run directory. Temporary plaintext was removed after decrypt/hash verification. They depend on recovery access to this Windows profile; arrange an owner-approved portable/off-machine recovery copy before GO. No private backup/photo belongs in the source release or public report. These are online snapshots, not a substitute for a consistent writer-drained cutover recovery point.
4. Only deployable backend candidate is **v2**, digest `sha256:37dcaa839917c81b33fbd7e51915ecea8b056dde68949a8db6189469e5ac4e48`. Use the final v2 archive/hash manifest. **Never deploy the initial130f0653 image/export:** it built but did not contain the expected main path. The source build now fixes rootDir explicitly; v2 actual production-entrypoint/API/worker boot was tested, not just TypeScript compilation.
5. Canonical protected overview route is `/api/admin/console/overview`, not `/api/admin/overview`. The latter404 is not evidence of authentication failure/bypass. Stage A production-valued startup must keep the QA gallery404 and all paid dispatch disabled while20 templates remain browsable.
6. The owner approved a **new Admin production signing identity** after historical debug signing was established. Do not use the Customer key, old debug key or silently uninstall the old app. Signing material is under `C:/Users/3ma/Documents/aboessa-secrets/rezona-admin-release`, outside Git; the password is DPAPI protected. Use `scripts/admin-hardening-signing.ps1 -Mode build` only in the established owner Windows account after reviewing its current manifest target. Preserve exact APK and certificate hashes and plan any existing-debug-app transition/data export with explicit device-owner permission. Back up key AND recovery material off-machine; do not paste the password into chat.
7. For Flutter3.44, first run frozen offline dependency resolution; then **omit `--no-pub` from the release-build command below** so the release plugin registrant is regenerated without integration_test. The build script verifies `pubspec.lock` unchanged. Do not patch generated Java or Flutter SDK to force a build. Re-run apksigner/aapt on the exact delivered APK. New artifact is `1.1.0+3`; certificate compatibility with historic debug clients is intentionally false, not a passed in-place-update test.
8. Silo Server20261112, pinned published digest `c20d1123...1f329`, passed isolated logical restore of all10 objects, byte/MIME/reference checks and anonymous-read denial. This is local evaluation only. Do not replace the live MinIO image or reuse its raw data volume until the owner separately approves the maintained storage path, license/operations ownership, IAM migration and rollback. The old server has independent advisories not fixed by npm. Review upstream/downstream release/security/compatibility notes linked in the readiness report. No commercial license or automatic update was enabled.
9. Proposed scoped policy `docker/minio/rezona-api-policy.json` allows bucket location/list and object get/put/delete only, no administrative/policy/ACL powers. Validate it with a dedicated principal on the approved staging target; its presence in source is NOT proof it has been provisioned. Do not create a production account/change a root password under this runbook without explicit GO for that operation.
10. Actual public staging HTTPS, physical signed-app/network acceptance, approved MFA/equivalent Admin protection, server/OS vulnerability scanning, alert routing/resource baselines and compatible rollback still need closure. Docker Scout requested login; no account was created or permission expanded. Do not label internal-only HTTP tests as HTTPS acceptance or a clean container scan. Neural runtime stays disabled pending its own rights/memory acceptance. Paid generation, model substitution, batch processing, auto-recharge/publication remain disabled.

Current local evaluation containers/networks are task-labelled/named130f0653 only. Preserve their baseline/diagnostic data and encrypted backup evidence; stop only these owned test processes when finished. Do not stop the older QA gallery, running production, remove volumes or delete originals as cleanup.

---

## Earlier operator procedure (subject to the current addendum)

2026-11-24, Asia/Baghdad. Candidate `admin-1.1.0+3-rc.c779e61a`. **Current status: NO-GO.** This runbook was source-reviewed; production commands below have not been executed. Read the [readiness report](rezona-admin-production-release-readiness.md) and clear every hard gate first.

## 1. Authority and prerequisites

Known documented hostname: `shanasheel.tavrixllc.com`. Established layout: `/opt/aboessa/current` → immutable release under `/opt/aboessa/releases`. Actual live symlink/Compose project/env/secret paths must be confirmed, not assumed from November records. No SSH account, IP, staging hostname, account ID or secret is invented here.

The following names are operator-supplied **placeholders**, not literal paths to execute: `RELEASE_DIR`, `BACKUP_DIR`, `APPROVED_COMPOSE_ENV`, `APPROVED_COMPOSE_FILE`, `APPROVED_IMAGE_DIGEST`, `APPROVED_ADMIN_APK`, `APPROVED_DEVICE`. They must resolve to explicit reviewed absolute paths/digests. Do not echo env/secrets or run `docker compose config` into a shared log: expanded configuration can reveal credentials. Set shell `umask 077`, use a restricted session, and disable shell tracing.

Do not run any QA script, fixture seed, migrate dev, db push/reset, Docker volume deletion, automatic model download, auto-recharge or arbitrary migration-resolve command on production.

## 2. Read-only live baseline (after owner supplies the established connection)

Run on the verified Linux server, not Windows. Review paths first:

```sh
readlink -f /opt/aboessa/current
docker compose version
docker ps --format '{{.Names}} {{.Image}} {{.Status}}'
curl --fail --silent --show-error --max-time 15 https://shanasheel.tavrixllc.com/health
curl --fail --silent --show-error --max-time 15 https://shanasheel.tavrixllc.com/ready
```

Use the **actual** Compose env file and Compose file identified above. The `dc` shell function is only a shorthand; variables must already be owner-approved. Never copy placeholder strings as live settings.

```sh
dc() { docker compose --env-file "$APPROVED_COMPOSE_ENV" -f "$APPROVED_COMPOSE_FILE" "$@"; }
dc ps
dc images
dc exec -T api node --version
dc exec -T api npm ls @nestjs/core @prisma/client prisma bullmq minio --depth=0
dc exec -T postgres psql -U postgres -d live_commerce -c 'SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at;'
dc exec -T postgres psql -U postgres -d live_commerce -c 'SELECT version();'
dc exec -T redis sh -ec 'REDISCLI_AUTH=$(cat /run/secrets/redis_password) redis-cli INFO server | sed -n "/^redis_version:/p"'
dc exec -T minio minio --version
dc exec -T nginx nginx -t
```

These SQL/service names match the repository convention; stop and adapt only after confirming actual deployment if they differ. Query only aggregate product/image/order/stock/wallet counts and reconciliation summaries, not customer records. Privately inspect running image digests, bucket policy/versioning/IAM, firewall/ports, secret-file permissions, TLS expiry, exact CORS origins, access/session TTLs, MFA/equivalent controls and queue state. Do not paste `docker inspect` environment or raw logs containing private data into reports.

With the **candidate image** selected in a reviewed isolated Compose override, its entrypoint provides worker-free checks:

```sh
dc run --rm --no-deps -e ABOESSA_MIGRATION_MODE=status-only api
dc run --rm --no-deps -e ABOESSA_MIGRATION_MODE=diff-only api
```

`status-only` reports pending/failed migrations (nonzero is expected if pending); `diff-only` is a read-only live schema-to-candidate datamodel comparison (0 empty, 2 differences, 1 error). It uses the secret-derived datasource without putting a password in CLI arguments. Pending changes are not automatically drift. Compare the database with the **running version's expected baseline** and match SQL checksums/custom triggers before approving candidate changes. No shadow database is pointed at production. Neither check starts an API/worker. These modes do not exist in historical images: do not run them against an unverified old entrypoint, which could have different behavior.

Record preflight evidence and stop on drift, failed migration, unknown writer version, exposed private bucket, missing MFA protection or missing recovery access.

## 3. Immutable artifact preparation (build host/staging only)

Private source archive and exact hash: `source-candidate-final.json` under `docs/benchmarks/admin-production-release/c779e61a`. Initial archive is superseded. Verify SHA256 against the manifest before extracting into a **new empty** release directory. No overwrite of `/opt/aboessa/current`. The archive excludes QA fixtures, Windows dependencies and secrets; it is not itself an image.

Build/test a unique image from that source using the repository Dockerfile; pin/record the resulting image ID and all base digests, generate SBOM and scan. Do not build a mutable `latest` over the running image. The repository Dockerfile is reviewed but Linux build acceptance is still missing. Keep compatible API and in-process BullMQ workers at the **same digest**. Do not bundle unreviewed neural weights/runtime into the image. Prepare a locked Linux runtime/model sidecar or mount only after rights, hashes/notices and process hard limits have been accepted; otherwise leave neural execution OFF and retain local/manual/original fallback.

Admin build on the existing Windows project, **only after** the owner locally configures the original release keystore. No password in the command/history:

```powershell
Set-Location 'C:\Users\3ma\Documents\aboessa\AboEssaMobile\apps\admin_app'
C:\Users\3ma\develop\flutter\bin\flutter.bat build apk --release --target lib/main.dart --build-name=1.1.0 --build-number=3 --dart-define=APP_ENV=production --dart-define=API_BASE_URL=https://shanasheel.tavrixllc.com --dart-define=SOCKET_URL=https://shanasheel.tavrixllc.com
```

Only use code 3 after installed-version comparison; if it is not higher, propose a new code and record it before building. Use a staging HTTPS API/socket for the separate acceptance APK with the same real entry point, never claim the staging APK is the production artifact. Run SDK `apksigner verify --verbose --print-certs` and `aapt dump badging`/manifest inspection on the exact artifact; verify package/certificate/version, CAMERA/INTERNET only as required, no audio/unintended permissions, backup disabled, cleartext disabled, no QA entry/defines/provider keys. Record APK SHA256. No Android SDK tool path or certificate is assumed. With explicit device permission, compare installed package/version/certificate and use install-in-place only. **Never uninstall, clear data or switch signing identity to make an update succeed.**

## 4. Backup and protected staging rehearsal — mandatory before cutover

Choose a new restricted `BACKUP_DIR` under the established backup area, verify its resolved path, free space, encryption/key recovery and off-server destination. Do not reuse an old backup label. After draining/fencing all writers for a consistent DB/media recovery point:

```sh
dc exec -T postgres pg_dump -U postgres -d live_commerce --format=custom --no-owner --no-acl > "$BACKUP_DIR/database.dump"
sha256sum "$BACKUP_DIR/database.dump"
pg_restore --list "$BACKUP_DIR/database.dump"
```

The directory must exist with restrictive permissions before redirection; this is a documented future operation, not one performed by this task. Listing a dump is not a restore test. Keep restricted schema-only dump, applied migration/checksum inventory and compatible app/worker/image/env metadata. Snapshot all relevant MinIO objects **including originals, variants, masks, candidates and metadata** plus policies/versioning state, and legacy uploads. Use the verified storage platform's consistent volume/object backup procedure; do not invent a volume name or mirror-delete objects. Raw copying a changing MinIO data directory without a validated consistency procedure is not approved.

Restore DB into a **new isolated staging cluster/database**, media into isolated private buckets, and protect/anonymize source data. Do not restore over a live database. Disable outbound push/AI/payment webhooks and remove production provider keys; enforce network egress isolation. Reconcile counts/hash samples/stock/financial invariants and media lineage/policies before migrations. Establish recovery credentials separately from normal Admin access.

The staging topology must match actual production Node/Postgres/Redis/MinIO/nginx/native runtime/resource limits while using separate networks, volumes, queues, secrets and HTTPS hostname. Current loopback QA does not meet this criterion. Replay only the actual pending pinned-Prisma sequence with `migrate deploy`, time locks/indexes/backfills, run inventory dry-run/reconciliation, and test old/new binaries against the migrated clone. Trigger/functions may not be represented by Prisma diff; validate them explicitly. No seed/reset and no blanket migration resolve.

Acceptance: login/logout/rotation/revocation/rate-limit/RBAC; categories/Arabic search/pagination; private upload/8 variants; duplicate review; approved NEW DRAFT and STOCK_IN exactly once; segmentation fail/manual fallback; all20 cards and39 mode pairs; manual compare/accept/reject/original; no promotional leakage/publication; customer legacy images; COD/wallet/auction/order/refund/shipment races; worker crash/recovery; historical APKs; signed Admin over staging HTTPS Wi-Fi/cellular; CPU/RSS/queue/disk under simultaneous load; actual backup restore and alert delivery. Do not create real customer transactions to smoke-test production.

## 5. Final GO request packet

Present the exact target/current symlink, before/after image digests, APK hash/certificate/version, applied/pending migration IDs, backup hashes/off-server recovery and restore results, staging/old-client acceptance, security risk disposition, invariant baseline, monitoring/on-call and compatible rollback digest. Identify which mounts and services must change. Obtain a **new explicit owner GO for these exact production mutations**. Current report is NO-GO, so stop here until gates pass.

## 6. Stage A cutover — ONLY after final GO

1. Fence new media dispatch and all stock writers/submitters; pause queue intake and allow bounded active work to settle. API hosts workers too: stopping it affects commerce. Use the separately approved maintenance window/edge controls and confirm all instances/old writers are fenced. Do not guess a nonexistent pause endpoint.
2. Retain exact old image/config/release/compatible APK and media snapshots; take fresh consistent backup if the rehearsal snapshot is stale. Keep unknown paid reservations intact.
3. Select the approved immutable candidate image in the reviewed Compose override. Preserve project/volume identities, external env, secrets, database, Redis, MinIO, TLS and legal mounts. Do not run an unreviewed full `compose up --build`.
4. Explicit schema operation, **one time after backup/GO**:

```sh
dc run --rm --no-deps -e ABOESSA_MIGRATION_MODE=deploy-only api
dc run --rm --no-deps -e ABOESSA_MIGRATION_MODE=status-only api
```

5. Run the reviewed version-specific mapped-stock backfill dry-run and then separately authorized apply only after clean findings. Use existing authorized service/API and idempotency; no guessed quantities, direct ledger edits, repeated unsafe seed or pre-Phase4 writers. Reconcile before releasing writers.
6. With Stage A flags and keys reviewed, recreate only the compatible API/worker service:

```sh
dc up -d --no-deps api
dc exec -T nginx nginx -t
```

If immutable legal/config bind mounts changed, recreate/rebind **nginx only when specifically included in GO**; otherwise a validated graceful reload may suffice. Do not recreate data services to refresh an app. Validate `/health`, `/ready`, protected Admin/QA paths, public legacy customer endpoints/media, queue/storage health and zero invariant changes. Reopen writers only after the gates pass. Distribute only the verified signed Admin APK with owner/device approval; no customer release.

Stage A config: production mode/HTTPS, Swagger and QA review false, `PRODUCT_STUDIO_PROVIDER=fal` but all dispatch/paid/live/mock approvals false, no fal key required, manual publication. This avoids labelling the production browser as a QA mock. Turn on existing intake/inventory/optimization flags only after their data gates. Paid Studio flags must not be tied to ordinary intake availability.

## 7. Stage B paid Studio — separate approval, currently blocked

Do not change `NODE_ENV` to test or loosen QA database/source allowlists in production. Implement/review a production-scoped admission path first. Verify exact model/schema/pricing/retention, private transfer consent, backend-only key, account/key permissions, fresh read-only balance and all UNKNOWN/historical reservations. Never broaden billing-key permissions silently. Authorize named roles, template versions/modes/source hashes and per-request consent. Enforce concurrency1, no automatic retry/regeneration/model substitution/batch/top-up, <=$10 monthly and lower separately approved daily/request limits. Use one explicitly approved pilot only, record request IDs/sanitized diagnostics/actual billing, and stop for employee review. No generated image becomes public or factual primary by acceptance alone.

Kill switch: set `PRODUCT_STUDIO_DISPATCH_ENABLED=false` in the owner-managed backend environment and roll/restart the verified service after fencing dispatch. This stops new library admission, **not an already submitted external inference**. Drain and reconcile in-flight/UNKNOWN jobs before declaring spend stopped; never free an UNKNOWN reservation on timeout alone. Preserve old flags/source records and keep ordinary local/manual intake available.

## 8. Monitoring and incident/rollback

Before opening traffic, validate private alerts for API readiness/error/latency, DB locks/connections, Redis, MinIO, stalled/old/failed queues, uploads/variants, approval/publication/auth failures, CPU/RSS/disk, backup age and restore status. Calibrate thresholds from observed baseline and accepted worst-case job/resource envelope; no measured production thresholds exist yet. Immediate stop signals: privacy leak, inventory/financial invariant violation, unexpected paid dispatch or uncorrelated UNKNOWN charge. Log only safe codes/IDs/durations/counters, no keys/private image data/customer payloads/unrestricted URLs.

Incident order: disable paid dispatch; preserve diagnostics/jobs/media; fence affected writers; identify compatible hotfix or rollback. Prefer forward fix/feature disablement. An API rollback is permitted only to a digest proven to honor the **current** mapped stock, selected intake media, modes/usage purposes and promotional decision revisions. Restore its matching in-process workers and compatible config, not an arbitrary November/pre-Phase4 binary. Do not drop additive schema or remove photos as rollback.

Android: do not downgrade version codes/uninstall. If a regression needs rollback, distribute the reviewed older behavior rebuilt with the **same certificate and a higher version code**, after explicit approval. Server compatibility still applies.

Emergency DB/media restoration is a separate owner-approved recovery: stop all writers/jobs, preserve current forensic snapshot and external charge state, restore into a verified target with matching media/version snapshot, reconcile paid UNKNOWN/wallet/order/inventory outcomes and loss since backup, then reopen only after full invariants. A blind production `pg_restore --clean`, Redis flush or image rollback is not an approved recovery command. Record incident owner, RPO/RTO measurements and follow-up before service restoration sign-off.
