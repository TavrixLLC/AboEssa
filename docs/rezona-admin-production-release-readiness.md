# REZONA Admin production release readiness

## Current follow-up — 2026-11-24, candidate 130f0653-v2

**Live cutover remains NO-GO.** The preparation has materially advanced: a real signed Admin APK and a production-boot-tested Linux image now exist. No production deployment, migration, restart, customer-app release, GitHub push, paid AI request or automatic publication occurred. Production inspection and streaming backups were read-only. New local tests used isolated containers/databases, not customer-facing environments.

Current evidence: [130f0653](benchmarks/admin-production-hardening/130f0653). The earlier review below is a historical checkpoint, not the current audit result. Its original reports were preserved privately under `D:/rezona-admin-hardening/run-130f0653/prior-*`; its existing benchmark files were not overwritten.

### Resolved in the release candidate

- Removed `minio 8.0.7`, query-string, decode-uri-component and stream-json from the application graph. The existing MinIO **server**, injection identity, bucket/object keys, stored bytes and `/api/media/...` contract remain unchanged. Transport now uses pinned `@aws-sdk/client-s3 3.1176.0`, explicit endpoint/credentials/path-style addressing and a single SDK attempt; workflow retry/idempotency remains in its owning service. SDK shutdown closes connections. Missing-key semantics remain 404; access/network failures are not treated as missing buckets. Implicit `minioadmin` credentials are refused in production. This is a client-library fix, not a claim that the old storage server is patched.
- All eight remaining production UUID-chain entries were cleared through a scoped Firebase descendant override to `uuid 11.1.1`, without upgrading Firebase's major version. Reviewed consumers gaxios/teeny-request/google-gax call the preserved CommonJS `v4()` API; three offline compatibility checks and patched v5 bounds checks pass. See [upstream UUID advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq). The earlier Effect fix remains pinned.
- Latest npm audit: **production 0 advisories of any severity**; full graph **17 moderate development-only entries, 0 high, 0 critical**. These are package-entry counts, not independent CVEs. This does not scan the operating system, global npm, MinIO/Silo server or Flutter dependencies. Docker Scout could not run without a Docker login; no account or expanded permission was created, and no clean OS-CVE result is claimed.
- Fixed a genuine Linux packaging issue: excluding seed/test sources made TypeScript infer a different common root, producing `dist/main.js` while startup expected `dist/src/main.js`. `tsconfig.build.json` now explicitly uses rootDir `.` and includes `src/**/*.ts`. The first image/source archive is **superseded and must not be deployed**. V2 was rebuilt and its actual production entrypoint, migration-status gate and API were exercised on Linux.
- The two historical tools importing the removed MinIO SDK were migrated at the transport layer only; neither seeding tool was executed. No purchase, wallet, order, auction or inventory business implementation changed.

### Actual server baseline now verified

The owner supplied connection authority. SSH host key was matched to the pre-existing local ED25519 trust record; credentials were passed locally without being printed or committed. Initial PuTTY connection attempts failed; the successful read-only SSH client used the same trusted host key. Temporary plaintext authentication files were removed. A password pasted into chat should be rotated by the owner; no password or SSH security setting was changed automatically.

Verified target: `shanasheel.tavrixllc.com` / owner-provided `217.76.54.57`; current release `/opt/aboessa/releases/20261102-guest-account`. Current API image `sha256:aaef434fb83436522ec03b488a67e367928d806205a3793f006f5adfb8064c03`; Node 24.20.0, Nest 11.1.28, Prisma 6.19.3, MinIO SDK 8.0.7, BullMQ 5.80.2. API hosts its workers. PostgreSQL16, Redis7, nginx1.27 and MinIO `RELEASE.2025-04-22T22-12-26Z` are running; nginx config passes and `/ready` returns 200 with TLS verification success. The earlier connection timeouts were not proof of a permanent outage.

Aggregate baseline: 19 migrations, 6 products, 23 auctions, 3 orders, 19 customers, 10 file assets, 1 wallet and 11 wallet entries. Inventory schema is not deployed. Storage has 10 objects / 18,271,854 bytes; no bucket policy is configured. The API currently uses a non-default **MinIO root identity**, not a dedicated scoped account. No fal key is present on this running backend. These findings require least-privilege credential provisioning in a future approved cutover, not silently copying root credentials into the candidate.

### Fresh backup, restore and history investigation

Fresh live PostgreSQL custom dump and logical MinIO object/metadata/versioning/policy export were streamed read-only to a restricted local directory. Both were encrypted with Windows DPAPI CurrentUser, decrypt/hash-verified and their temporary plaintext removed. See `encrypted-backup-*.json`. The dump is 168,983 bytes, SHA256 `df0d0a769d3a8d7eebf840857827124f8239f132d032631db4ed8ca077985264`; media compressed export is 18,225,963 bytes. Do not place backup contents or private photographs in reports/Git. This is an online, non-quiesced snapshot; take a new consistent recovery point before any eventual cutover.

Restored the fresh dump into a private local PostgreSQL16 namespace. **18 of 19 migration hashes match**. For `202609190001_auction_optional_featured_rarity`, the DB records `fff0ea...fdbb03`, whereas local SQL, running deployed SQL and three retained September release archives are identically `438874...5556b5`. Newline/BOM-only variants do not explain it. No migration row/checksum was rewritten, no reset/resolve was used, and production migrations were stopped at this gate.

Independent investigation rebuilt an expected **19-migration database from source**. Both Prisma schema diff and normalized full PostgreSQL schema dump match the unmodified restored production database exactly (`78815d50...59bd1`). There is **no observed structural schema drift**; the historical metadata discrepancy still needs a formal documented disposition, not an invented root cause or automatic checksum rewrite. See `historical-schema-equivalence.json` and `historical-migration-checksum-review.json`.

The original restore remains at19. A separate **diagnostic copy only** successfully applied all21 pending migrations to40; business aggregate counts remained unchanged. This proves mechanical compatibility on the snapshot, not approval to migrate live. An existing-service stock backfill dry-run on that copy found six unmapped products, no review-required products and two legacy pending items; it did not create warehouses, balances, movements or allocations, and wallet/order counts stayed unchanged. No physical warehouse assignment was guessed and no stock backfill was applied.

### Silo evaluation — approved locally, not adopted in production

The old **server** has separate upstream advisories, including [unsigned-trailer authentication bypass](https://github.com/minio/minio/security/advisories/GHSA-hv4r-mvr4-25vw) and [session-policy privilege escalation](https://github.com/minio/minio/security/advisories/GHSA-jjjj-jwhf-8rgr). Its upstream community repository is archived. Fixing npm does not remediate these server issues. Do not blindly substitute an old community tag or enable an unlicensed commercial edition.

The owner approved local evaluation only. Tested independent downstream [Silo Server 20261112](https://silo.pgsty.com/blog/release/silo-20261112/), source `44e848fedf8c`, published image pinned to `sha256:c20d112390b9a9ce8c11b8af95ad35bcaa62f4759663c09c936cd8d2b511f329`. It retains AGPL-3.0 obligations; production use/distribution and maintenance ownership require review. It is not MinIO-endorsed. Follow its [migration/compatibility requirements](https://silo.pgsty.com/compatibility/migration/), not a claim of unconditional drop-in equivalence.

The isolated fresh-object restore passed: all10 object hashes, sizes and MIME types match; all10 FileAsset references resolve; all10 anonymous object reads are denied. No object was published. This evaluates logical object restore and the actual S3 operations, **not** an in-place upgrade of production data disks, complete IAM/STS/replication/Object Lock compatibility, all-version backups or independent certification of every upstream CVE fix. The exported bucket had no versioning/policy requiring a richer restore. Local egress was blocked; no production credential or photograph was sent to Silo/another remote service.

Production selection is still open: explicitly approve a maintained storage path, its license/operations owner, dedicated API identity and migration/rollback procedure. `docker/minio/rezona-api-policy.json` is a proposed least-privilege bucket policy; it has not been applied anywhere live. Prefer a new protected target restored from verified logical objects over assuming older raw on-disk state can safely be reused or downgraded.

### Real release artifacts and acceptance boundary

- Admin: `D:/rezona-admin-hardening/run-130f0653/rezona-admin-v1.1.0-3-production.apk`, 72,419,106 bytes, SHA256 `d866a50ebd55cfb854eb6dcc978cab79fcb680bfcc75aade5f180b3decdd528a`. Package `com.singlestore.admin_app`; actual entry `lib/main.dart`; HTTPS production API/socket defines; signature verifies; no debuggable/test-only/integration_test/audio, cleartext or backup enabled. Existing dependency-merged READ_EXTERNAL_STORAGE and WRITE_EXTERNAL_STORAGE(maxSdk28) are documented for legacy-picker review, not falsely reported absent.
- The historical Admin artifact was **debug-signed**, not signed with the Customer upload key. With explicit owner approval, created a NEW RSA4096 Admin production key outside Git; certificate SHA256 `2b768b09c968ba8ebcb3652d959f3e7936ffa143f601a27504dd7d274808850a`. Keystore/password metadata are in the owner-only `C:/Users/3ma/Documents/aboessa-secrets/rezona-admin-release`; password is DPAPI-protected, not in Flutter/source/logs. No replacement of the old key or installed app occurred. A debug install cannot be updated in place with this new certificate. Fleet transition/data preservation, off-machine key/recovery backup and device permission remain required.
- Fixed release build procedure: Flutter3.44 `--no-pub` skips release plugin-registry regeneration and retained native integration_test registration. A frozen offline `pub get --enforce-lockfile`, followed by normal release build **without --no-pub**, regenerated correctly. No SDK/Java hand-edit or dependency upgrade was used; the workspace lockfile stayed unchanged.
- API: final image **`rezona-admin-rc:130f0653-v2`**, immutable digest `sha256:37dcaa839917c81b33fbd7e51915ecea8b056dde68949a8db6189469e5ac4e48`. Base manifest `sha256:873f586f3794f52281bd039bf02c048a0be08fde619338f9941bad1eb6b34530`, Node24.22.3, sharp0.35.5. Linux non-root UID1000 and native WebP encoding pass. Deliver only the v2 image/archive recorded in final artifact evidence; v1 lacks the correct main path and is rejected, despite having built successfully.
- V2 actual **production-mode entrypoint boot** passed in an internal Docker network with synthetic staff and a fresh empty application DB: health/DB+Redis readiness200, anonymous canonical `/api/admin/console/overview`401, authenticated login succeeds, QA gallery404, all20 templates browse with generation disabled and no fal key, one private intake draft, zero products/orders created. BullMQ/API booted together. Initial probe used a nonexistent overview path (404); corrected to the real controller route and retained both attempts. These checks do not claim public HTTPS staging or physical-device acceptance. The restored customer databases were not used by this app process.

Current test details are in `final-validation.json`: backend full suite, typecheck/scoped lint; Admin analyze/203 tests; Customer166 source regressions (no customer build); E2E27; real intake/storage11 and commerce/inventory16 groups; all20/39 Studio mode pairs with mock transport; Stage A fences; fresh restore/schema/migration and Silo checks. An early full run hit the known30s native tabletop deadline; a later full run and isolated17 native tests passed. Keep that variability in resource/concurrent-load acceptance; do not erase the failed run or claim its deadline was fixed by this work.

### What still blocks live GO

1. Formal history disposition for the one checksum inconsistency, then fresh pre-cutover recovery point and version-specific migration/backfill sign-off. Structural equivalence and a diagnostic migration pass do not authorize rewriting history.
2. Explicit adoption/maintenance/license approval for a patched storage server, dedicated non-root API credentials, applicable server/OS vulnerability assessment and tested operational rollback. Local Silo evaluation is not production approval; the live old MinIO remains unchanged/vulnerable.
3. Approved MFA/equivalent protected Admin access, actual alert delivery/queue/storage/backup monitoring and baseline-derived resource thresholds. No MFA or operational alerting was invented/enabled. Root password disclosed in chat needs owner-controlled rotation.
4. Real protected staging HTTPS plus signed-release physical/network/old-client compatibility and key-transition tests. Internal Linux HTTP acceptance is not that gate. No device was installed/uninstalled and no app data was cleared. Neural runtime/rights/memory acceptance remains pending; it stays OFF with local/manual/original fallback, and all paid providers remain OFF.
5. Owner-controlled off-machine signing/recovery backup and a **new explicit final cutover GO** covering the exact image, storage path, migration operations, credential changes and APK distribution. No source push or cutover authority is inferred.

The prepared APK is not yet an instruction to install it against the old backend. The release candidate is now real and testable; the overall production decision remains NO-GO until these gates are closed. The updated runbook is authoritative for operator preparation.

---

## Historical checkpoint c779e61a (superseded by the follow-up above)

Date: 2026-11-24, Asia/Baghdad. Candidate `admin-1.1.0+3-rc.c779e61a`.

## Decision: NO-GO for live cutover

This is a release-preparation review, **not a completed production deployment**. No production SQL, container replacement, device installation, customer release, GitHub push or paid inference was performed. The candidate is a hashed source snapshot plus a successful local backend compile; it is **not yet a verified Linux image or signed Admin APK**. Final live GO has not been requested or granted.

Blocking evidence gaps: current production access/baseline, three unresolved high-severity dependency entries, approved strong Admin access protection, fresh production backup/media restore and migration rehearsal, old-binary compatibility, established Android signing/version, staging HTTPS/device acceptance, Linux segmentation packaging/resource acceptance, and operational monitoring. Green QA counts do not clear these gates.

Evidence directory: [c779e61a](benchmarks/admin-production-release/c779e61a). It retains failed/interrupted attempts as well as corrected reruns. Private build/dump/adapter files: `D:/rezona-admin-release/run-c779e61a`; no credentials or private photos belong in the report.

## 1. Scope and exact source

- Actual Admin is Flutter Android, production identity `com.singlestore.admin_app`, entry point `apps/admin_app/lib/main.dart`. The Flutter web scaffold is not evidence of an established web dashboard release. No new web hosting was created.
- Source Admin version is `1.0.0+2`. Proposed release `1.1.0+3` is provisional until code 3 is confirmed greater than the installed version. It has not been substituted into a fake signed build.
- Backend baseline HEAD `4f83036738dc4cec852d8743ec7baf70d3277f0b`; mobile HEAD `a78698642bf5caaaefd8daa230f3234210eb0591`; both `main`, both already dirty. `source-before.json`, final source snapshot and preservation check record the exact local contents rather than claiming HEAD alone describes the release.
- Included: existing Admin, catalog/inventory/intake, image variants/local preparation/review, recognition only where separately validated, and the existing 20-template registry (5 Fashion, 5 Electronics, 5 Home, 5 General). Authoritative IDs, versions and prompts were not rewritten.
- Excluded: customer app release, automatic publication, fixture/gallery import, production fal enablement, new stock/payment/auction rules, production data seeding, and QA review datasets.

Release hardening changes: real Admin auth rate-limit guard; separate Studio dispatch fence and production QA-flag rejection; Effect override; explicit migration execution instead of schema writes on ordinary restarts; safer Docker context; Android production release-definition checks. No commerce or inventory business implementation was changed.

## 2. Topology: verified source versus unverified live state

| Component | Repository/documented convention | Live status today |
| --- | --- | --- |
| Host | `shanasheel.tavrixllc.com`, HTTPS; `/opt/aboessa/current` and immutable `/opt/aboessa/releases/...` | Known target from prior deployment records; all seven unauthenticated GET probes timed out from this machine. This does not prove an outage. SSH profile requested, not available to this review. |
| Last documented release | `20261102-guest-account`, 19 completed migrations on November 2 | Historical only, not asserted current. Historical customer/order counts are not today's baseline. |
| API/workers | NestJS 11; resolved versions in lockfile/evidence; Node 24 bookworm-slim Dockerfile. BullMQ workers run inside API process, not a separately deployed worker service | Running binary, digest, Node version and worker age unknown |
| Database | PostgreSQL `16-alpine`, Compose DB `live_commerce`; source has 40 migrations | Applied list, checksums, failed migrations, schema drift, current counts and lock/load profile unknown |
| Queue | Redis `7-alpine`, authenticated secret file, persistent AOF; BullMQ | Redis version, queue backlog, active/UNKNOWN jobs and recovery metrics unknown |
| Storage | MinIO source pin `RELEASE.2025-04-22T22-12-26Z`, internal ports, persistent data | Version, bucket IAM, anonymous policy, versioning and recoverability unknown. QA used a different existing MinIO instance; not topology parity. |
| Edge | nginx `1.27-alpine`, port 80 redirect, TLS 1.2/1.3, HSTS, no MinIO public port in Compose | Certificate/headers/firewall/DNS and actual mounts unverified |
| Secrets | External env and Docker secret files; API runs as node/non-root; no-new-privileges | Production permissions, dedicated storage credentials, rotation and access audit unverified |

Do not copy the repository Compose file over the running server blindly: previous releases deliberately preserved the actual live Compose, secrets, volumes and TLS mounts. Capture and review the real configuration first. Mutable image tags are declarations, not immutable release digests or an OS/container vulnerability scan.

## 3. Dependency/security gate

Fresh npm audit, before → after the scoped fix:

| Tree | Before | After |
| --- | --- | --- |
| Full installed graph | 32 entries: 6 high, 26 moderate, 0 critical | 29: 3 high, 26 moderate, 0 critical |
| `--omit=dev` graph | 15: 6 high, 9 moderate, 0 critical | 12: 3 high, 9 moderate, 0 critical |

These are vulnerable package entries including inherited chains, **not independent CVE counts**. They supersede historical audit totals. [dependency-disposition.json](benchmarks/admin-production-release/c779e61a/dependency-disposition.json) lists all 29 remaining package entries, exact installed versions/paths, runtime/development classification, affected ranges, advisory URLs and npm's proposed fixes. Raw before/after audits remain alongside it.

### High-severity disposition

1. **Remediated:** Prisma/config 6.19.3 included Effect 3.21.0. Precisely override Effect to 3.22.1 without a Prisma major upgrade. Actual resolution from `@prisma/config`, Prisma validate, config smoke and TypeScript checks were tested. The [Effect advisory](https://github.com/advisories/GHSA-7589-6fvf-x4pw) fixes affected versions through 3.22.0 in 3.22.1. The dependency is installed in production (Prisma CLI/config), though no HTTP handler accepting arbitrary Effect schema input was identified. A bounded smoke is not proof against every adversarial schema; the overly large initial smoke was interrupted and preserved rather than reported as passing.
2. **Unresolved / release blocker:** `minio 8.0.7 → query-string 7.1.3 → decode-uri-component 0.2.2`. Three high entries describe this chain. The [quadratic-decoding advisory](https://github.com/advisories/GHSA-qr28-fpjm-wq7f) requires decoder 0.5.1; an additional decoder advisory and stream-json moderates are recorded in the audit.

Storage provider uses bucketExists/makeBucket/put/get/stat/remove. Inspected MinIO query-string use serializes SDK parameters; no application route was found calling its parse/decoder on arbitrary customer input. Notification streaming is not enabled in this provider. This lowers identified reachability but is **not an independent finding of non-exploitability**. Malformed input reaching decoder/stream parsers could exhaust CPU/memory; server IAM and exposed S3 surface remain unverified.

Registry review found MinIO 8.0.7 still current for that SDK line. npm proposes a major downgrade to 7.1.3, not a proven safe patch. Decoder 0.5.1 / newer query-string changes module/API contracts; previous direct override failed compatibility. No forced downgrade/ESM override was applied. Choose a maintained compatible storage client or a narrowly reviewed CJS-compatible remediation, rerun media tests and obtain independent security review; alternatively require an explicit scoped, expiring owner-approved risk disposition with compensating controls. No such disposition exists here.

### Moderate and development findings

- Nine production moderate entries: Firestore 7.11.6, Cloud Storage 7.22.0, firebase-admin 13.10.0, gaxios 6.7.1, google-gax 4.6.1, retry-request 7.0.2, teeny-request 9.0.0, uuid 9.0.1 and stream-json 1.9.1. Several are inherited from the same root. Admin uses Firebase for optional push; Firestore/Cloud Storage are not the selected product storage implementation. This does not remove installed code or prove harmlessness.
- Audit proposes firebase-admin 14.5.1 and MinIO 7.1.3 for those chains; major compatibility/Firebase notification and storage tests are required first. Individual safe updates should be isolated and retested, not applied through `npm audit fix --force`.
- Seventeen development-only moderate entries cover Jest/core/reporters/circus/CLI/config/runner/runtime, Nest CLI, glob/minimatch and TypeScript ESLint/parser/type-utils/typescript-estree/utils. They are not in the runtime `--omit=dev` tree, but CI/build inputs remain a supply-chain/DoS surface. Exact proposed fixes/ranges are in the machine report. Restrict untrusted build/test inputs and schedule a bounded toolchain upgrade; no blanket clearance is claimed.

### Application controls

- Existing Argon2id password hashing, separate Admin/customer JWT secrets, default 15-minute access tokens and 30-day refresh lifetime, refresh rotation/reuse revocation, DB-backed staff/session revocation, permissions and resource ownership were inspected. Actual production lifetimes/roles are not verified.
- Found the Admin login `@Throttle` decorator lacked an executing guard. Bound `ThrottlerGuard` to Admin auth only. Real HTTP test proves five requests pass and the sixth returns 429. This is per-process/IP memory state, not distributed brute-force protection or MFA; refresh/auth defaults remain bounded. [Nest docs](https://docs.nestjs.com/security/rate-limiting) explain guard enforcement.
- No native MFA/TOTP implementation or approved equivalent protected Admin gateway was found. Require role-appropriate MFA or separately reviewed equivalent access protection before GO. Do not gate public customer APIs behind an Admin-only control.
- Private source/variant ownership, wrong employee/customer denial, draft concealment, publication and revocation were exercised against actual local MinIO and authenticated HTTP. The live bucket's anonymous policy and legacy uploads still need inspection. Existing `/uploads` is a separate legacy surface, not evidence that arbitrary local files are safe to expose.
- Production validates exact HTTPS CORS/public URL and JWT/DB/Redis secret quality, disables Swagger by default, and now rejects real-product QA review/prepaid experiment flags. Review actual env without displaying secrets. Storage credentials can still fall back through root/default configuration; dedicated least-privilege non-default keys must be verified. Nginx security headers and `TRUST_PROXY_HOPS=1` are source-reviewed, not live-tested.
- Input byte/pixel/MIME/decode bounds, shell-free neural invocation and sanitized provider errors exist and have regression coverage. No broad sensitive-payload logger or provider key was added. Image-bomb/fuzz testing and Linux container/OS scan remain separate work.

## 4. Database/media strategy

All 40 migrations applied to **new synthetic QA**. Source migration checksums and SQL hazard markers are in `migration-source-review.json`. If the historical 19-migration baseline were still exact, 21 would be pending; **this is a conditional count, not a production finding**.

The sequence includes optimization/lookup/search/cursor indexes; mapped warehouse/balance/allocation/movement triggers; rapid intake/idempotent submission; recognition usage/revisions; image decisions/segmentation; premium modes and factual/promotional separation. It is not "all harmless additive SQL": existing rows are updated, constraints replaced, triggers/functions installed, and indexes may lock/scan large tables. No stock ledger or historical media table is dropped by the reviewed later sequence. Fresh-empty success does not validate dirty/historical data or lock duration.

Before production: inventory actual migration IDs/checksums and failed rows; compare running schema to its expected migration baseline, separating expected pending changes from unexplained drift; record table/index sizes and invariants. Freeze/drain **all** stock writers and media submitters (including old clients/jobs); preserve UNKNOWN paid reservations. Create a fresh restricted PostgreSQL custom-format dump plus media/metadata/policy snapshot and Redis job recovery record. Restore a protected clone, anonymize or restrict data, exercise the actual pending sequence and backfill dry-run, then reconcile mapped balances/allocations/movements. Never invoke migrate dev, db push, reset or fixture seed in production.

Local rehearsal: restored a 407,350-byte synthetic dump to a second new database; 40 migrations and selected row counts/aggregate quantities match (13 products, 10 orders, 69 movements, 62 candidates, 104 decisions). See `local-restore-rehearsal.json` and `local-restored-counts.json`. **No production DB/media backup, MinIO restore or restored-production migration rehearsal was possible.** November backups are historical, not fresh acceptance evidence.

Normal candidate container restart now runs Prisma migration **status**, not deploy. Pending/failed migrations fail startup. Explicit one-shot `ABOESSA_MIGRATION_MODE=deploy-only` is a separate final-GO operation; `status-only` and `diff-only` exit without starting workers. Runtime schema-diff does not cover every trigger/function invariant: retain custom SQL/checksum review.

## 5. Configuration and artifact matrix

| Setting/artifact | Stage A | Stage B |
| --- | --- | --- |
| Admin | Actual package/main; signed `1.1.0+3` only if version/certificate accepted; `APP_ENV=production`; HTTPS production API and HTTPS/WSS socket | Same app; no provider key defines |
| Studio browser | All 20 cards, four RTL groups, previews, image selection, mode descriptions, comparisons and review UI retained | Same versioned registry |
| External generation | `PRODUCT_STUDIO_PROVIDER=fal`, `PRODUCT_STUDIO_DISPATCH_ENABLED=false`, `PRODUCT_STUDIO_ENABLED=false`, `PRODUCT_STUDIO_LIVE_APPROVED=false`, `PRODUCT_STUDIO_MOCK_APPROVED=false`; no provider key required, no QA-mock presentation | **Not enabled by this task; current live admission remains QA/test scoped and rejects production** |
| QA | `REAL_PRODUCT_STUDIO_REVIEW_ENABLED=false`, `PRODUCT_STUDIO_PREPAID_EXPERIMENT=false`; no review-index/sample paths or QA APK suffix | Remain false |
| Recognition/editing | Live approval flags false; manual factual metadata review. Enable local preparation only where runtime/rights/resource gates pass | Provider-specific review/consent needed separately |
| Inventory/intake/variants | Enable their existing flags only after migrations, backfill and compatibility pass | Never controlled by AI output |
| Local segmentation | Explicit pinned Linux runtime/model with approved licenses/notices and hard process memory/CPU/time limits, else OFF with original/manual fallback | Still required for faithful foreground composition |
| Publication | Existing authorized manual action; draft/private by default | Promotional accept does not publish or silently replace factual primary |

Android hardening rejects release with missing signing, QA package flags, non-production APP_ENV, credential-bearing/insecure endpoints, QA entry point or fal/Gemini key defines. Manifest source has INTERNET/CAMERA, RECORD_AUDIO removed, backup disabled and cleartext false for actual package. Offline Gradle configuration passed; **merged release manifest, APK certificate/permissions and compiled define/bundle inspection are not verified without a release build**. Existing Kotlin/Gradle future migration warnings remain.

`android/key.properties` and complete established signing environment were absent. No replacement/debug certificate was used, no app uninstalled and no data cleared. Required: owner-local original signing configuration, installed certificate/version extraction with device permission, release APK build, apksigner/aapt checks and in-place compatibility test. Build instructions are in the runbook.

Backend source archive explicitly excludes secrets, node_modules, backups, private photos, models and QA fixtures. `source-candidate-final.json` gives its exact file set/hash; the initial archive is retained but superseded. Docker context excludes env variants/backups/evidence/tools/keys; Dockerfile no longer expects a tests directory omitted by the release source set. Linux image build, digest/SBOM/container scan and native sharp/runtime acceptance remain unverified. Do not distribute a Windows dependency tree as a Linux release.

## 6. Validation ledger — not a staging sign-off

| Check | Result and boundary |
| --- | --- |
| Backend build/Prisma | Local TypeScript build and Prisma validate pass; final compile recorded separately. No Linux image acceptance |
| Backend unit/type/lint | Final full run: **432/432 pass, all38 suites**; typecheck and scoped lint pass. Earlier fixture-flag failures/interrupted adversarial smoke/type annotation issues are retained, not counted as passes. Historical native-render timing variability remains a load/device acceptance risk despite the green final run |
| Admin | Analyze: no issues. Full tests: **203 pass** |
| Customer compatibility | **166 source regression tests pass**; no customer build/release and no installed historical APK acceptance |
| E2E | First run: 13 pass/14 skipped; after explicit guarded opt-in to this new synthetic database, **27/27 pass, all7 suites**. Includes actual Postgres Admin purchase/auction/account-deletion transactions, DB contracts and mocked route smoke; not all27 are real HTTP commerce checks |
| Commerce/inventory | **16 integration groups pass**: COD/wallet orders, reserve/replay/refund/cancel/shipment, concurrent last-unit races, transfer/adjustment/backfill/reconciliation, nonnegative and append-only invariants |
| Intake/storage | **11 integration groups pass**: NEW DRAFT/one opening, STOCK_IN/replay/no duplicate, atomic rollback, source retention, 8 optimized variants, private/public access and cancellation revocation |
| Studio | **20 templates / 39 supported mode pairs**, 6 integration groups pass; actual HTTP/RBAC/BullMQ/private MinIO/local mask with **mock transport only**, zero paid calls. Independent factual/promotional decisions, original fallback, stale retake protection and UNKNOWN no-redispatch/reservation retention pass |
| Stage A fence | Two extra integration checks pass with production-valued service configuration: all20/four groups/details browsable without key/pricing, no actionable modes, generation denied, QA gallery404 and zero provider invocations. This is not a full production bootstrap or staging HTTPS test |
| Restore | Synthetic PostgreSQL restore/count comparison pass; production/media restore unrun |
| Actual staging | **NOT CREATED/ACCEPTED**: no confirmed staging hostname/TLS/configured restored clone. Loopback synthetic QA must not be labelled production staging |
| Device/network/load | No install or physical test this task; no signed release over staging Wi-Fi/cellular or simultaneous production-scale commerce/media load |

Earlier customer Redmi Pad SE launch/render/jank issues remain in Phase 3/3.1 evidence. They are not resolved by Admin widget tests, nor do customer scrolling metrics alone prove Admin failure. Reproduce relevant Admin startup, camera/gallery, Studio preview, memory and resume behavior with the real signed build. Local U²-Net evidence previously showed narrow memory headroom at a 1GiB container limit; model/runtime binaries and commercial-use review are not included in this candidate.

## 7. fal status and rollout restrictions

No inference, balance request, recharge or permission expansion in this review. Latest retained paid evaluation `ff4e41c6`: 6 requests, dashboard-billed **$0.254955** for that batch; observed then-balance **$9.58**, cents-rounded/possibly delayed, **not current available balance**. Two QA rejections, four owner-pending, zero accepted. Prior **$1.044480** historical commitment remains retained; historical SOAP attribution is provisional. Batch billing must not erase unrelated UNKNOWN reservations or be presented as total lifetime spend. Subsequent continuation was requested but no new paid result is evidenced here.

Stage A separates browsing from dispatch. Existing faithful composition preserves real opaque foreground pixels; generative hero explicitly does not guarantee product-pixel/label accuracy and stays promotional/private. Approval is manual, original fallback remains available, and AI cannot change price/category/quantity/location/NEW/STOCK_IN/wallet/order/auction rules.

Stage B requires a separate reviewed implementation of **production-capable** admission; merely setting the new switch true cannot bypass the existing NODE_ENV/test/database/source/budget gates. Do not weaken QA allowlists to make production appear supported. Required before enablement: independently verified account/key scope and backend-only secret storage, exact Nano Banana Lite Edit schema/revision/pricing, terms/retention and private-photo transfer consent, fresh read-only prepaid balance, all historical UNKNOWN/reconciliation, approved roles/template/mode/source scope, one worker, zero automatic retry/regeneration/substitution/batch/top-up, hard monthly cap <= $10 with smaller operator-approved daily/request caps, idempotent request correlation and sanitized errors, employee approval and tested kill switch. No broader key permissions or new card charge are authorized.

Default recommendation: local neutral studio composition. Paid styling only for a clearly different employee-requested approved style, never upload-triggered. Do not batch problematic segmentations or accept duplicated/altered products or invented labels.

## 8. Monitoring, rollback and final gates

Existing `/health` is process liveness; `/ready` checks DB and Redis only, **not MinIO, BullMQ queue age, neural worker health, disk or backup freshness**. Compose healthchecks are not a complete alerting service. Production baseline measurements/retention/on-call delivery are absent, so no invented measured SLOs or "operational monitoring" sign-off.

Before GO, establish private structured telemetry without keys, customer payloads/image bytes or signed URLs: API errors/latency; auth failure/429/revocation; PostgreSQL connections/locks; Redis health; MinIO probes; active/waiting/failed/stalled queue counts and oldest age; uploads/variants; approvals/publication failures; inventory reconciliation; process CPU/RSS/disk; backup age/restore status. Set latency/queue/RSS/disk thresholds from observed staging and live baselines plus measured processing envelopes. Treat a negative stock/financial invariant, lost private-media boundary, unexpected paid call or UNKNOWN paid outcome as an immediate stop/paid-disable alert; this is an incident rule, not a measured baseline threshold. Verify alert routing and kill-switch behavior before launch.

Rollback is feature disablement/forward-compatible hotfix first. Retain exact API/worker image, signed APK/certificate and media/config checksums. No pre-Phase4 writer after mapped stock activity; no pre-media-lineage submitter/worker after selected/promotional decision records. Drain/reconcile paid jobs without freeing UNKNOWN reservations. No routine table drop, ledger rewrite or original-photo removal. Emergency full DB/media restore is a separately approved coordinated recovery that may lose post-snapshot commerce; freeze writers, reconcile queue/external payment/provider outcomes and verify invariants before reopening. See [runbook](rezona-admin-production-runbook.md).

| Hard gate | Decision |
| --- | --- |
| Confirm current target access, live schema/config/versions/counts | BLOCKED / unverified |
| Applicable high-security resolution or formal owner risk approval | BLOCKED / MinIO chain unresolved |
| MFA/equivalent approved Admin protection, secrets and IAM | BLOCKED / unverified |
| Fresh production DB + media backup, restore/migration rehearsal | BLOCKED / synthetic-only evidence |
| Historical customer/Admin/worker compatibility | BLOCKED / source tests only |
| Signed release APK, Linux image and HTTPS staging/device acceptance | BLOCKED / signing and environment unavailable |
| Resource/concurrent-load, alerts and operational rollback | BLOCKED / unverified |
| Manual/private/factual media and stock safeguards | PASS in synthetic integration; live acceptance still required |
| Final owner cutover GO | NOT REQUESTED; prerequisites not met |

Next owner inputs: established SSH profile/local configuration path (no secret pasted), original Admin signing configuration path, a confirmed protected staging environment, and security/operations owners for the remaining gates. Only then prepare an exact final mutation plan (one-shot migration, compatible API/workers, nginx mount/reload if needed, signed Admin distribution) and seek a new explicit GO. Nothing in this report is authorization to execute that plan now.
