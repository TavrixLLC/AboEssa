# REZONA Phase 9 — production launch review

2026-11-25, Asia/Baghdad · review `0f3e402b` · **NO-GO — protected staging has not passed**.

This is a blocked release-preparation packet, not a deployment announcement or a final executable change authorization. The Phase 9 attachment authorizes preparation only. No production migration, service restart, storage replacement, credential rotation, APK distribution, GitHub push, paid request or publication was performed. Existing application/business source and historical evidence were preserved.

## 1. Mandatory first gate

`rezona-protected-staging-acceptance.md` did not exist when this review started. No evidence establishes that the previously requested same-server staging environment was provisioned or accepted. The new [staging assessment](rezona-protected-staging-acceptance.md) records **FAIL / NOT PROVISIONED**, not a retrospective acceptance.

Accordingly, Phase 9 stops before representing a live release as GO-ready. The remaining documents are a conditional preparation checklist and monitoring specification. They must be completed from a real staging rehearsal before an exact final cutover can be submitted for approval. Stage B production implementation/activation is deferred; no QA admission guard was weakened.

Evidence: [current immutable review](benchmarks/phase9-release-review/0f3e402b/manifest.json), [previous final validation](benchmarks/admin-production-hardening/130f0653/final-validation.json), [previous readiness](rezona-admin-production-release-readiness.md), [operator runbook](rezona-admin-production-runbook.md). The current addenda in the older reports supersede their explicitly historical sections.

## 2. What was actually reverified

| New check | Verified result | Boundary |
| --- | --- | --- |
| Existing evidence seal | All 86 referenced evidence/report hashes match | Hash inventory, not an independent digital signature |
| Release artifacts | Image archive, source archive and APK SHA-256 match | No upload, rebuild or installation |
| Backend source | All 344 archived release files match current files; no additional files in release scope | Current dirty working tree, not HEAD alone |
| Mobile source | No changed/missing/added files relative to latest hardening snapshot | Physical release behavior not tested |
| APK signature | apksigner verifies; production certificate and v2 signature match | Not an installed-device transition test |
| npm audit | Production: **0** advisories; full graph: **17 moderate**, no high/critical | Package-lock audit, not OS/container/Flutter scan |
| Focused offline regressions | **32/32**, four suites | Release fences, S3 adapter, dependency contracts, sanitized fal diagnostics; not staging acceptance |
| Existing production HTTPS GET | `/ready` 200, authenticated TLS1.3, HSTS; certificate expires 2027-01-30 11:24 UTC | Existing production only; not new API/storage/queue/staging acceptance |

Machine results: [artifact/source verification](benchmarks/phase9-release-review/0f3e402b/artifact-reverification.json), [signature](benchmarks/phase9-release-review/0f3e402b/apk-signature-reverification.json), [production audit](benchmarks/phase9-release-review/0f3e402b/audit-production-summary.json), [full audit](benchmarks/phase9-release-review/0f3e402b/audit-all-summary.json), [32 tests](benchmarks/phase9-release-review/0f3e402b/targeted-offline-tests.json), [TLS probe](benchmarks/phase9-release-review/0f3e402b/current-production-tls-probe.json).

Earlier local results remain earlier results: 445 backend unit, 203 Admin, 166 Customer source tests, 27 E2E, 11 intake and 16 commerce/inventory integration groups, all20 templates/39 supported mode pairs with mocked transport. They were not rerun as public HTTPS staging or historical installed-client tests. The native tabletop timing failure retained in earlier evidence remains a load-acceptance risk.

Two preliminary review namespaces are retained: `3cfd3920` failed before snapshot because the helper incompletely removed injected Git configuration; `6cdda8e4` passed its checks but contained an incorrect image-identity explanatory note. The final `0f3e402b` run corrects the note and rechecks signatures. No old evidence was overwritten to hide either correction.

## 3. Exact target and artifacts

Target: existing production `https://shanasheel.tavrixllc.com`, owner-supplied server `217.76.54.57`. Last SSH observation **2026-11-24 17:12:20 UTC**, not freshly queried this review:

- Release `/opt/aboessa/releases/20261102-guest-account`, via `/opt/aboessa/current`.
- API image `sha256:aaef434fb83436522ec03b488a67e367928d806205a3793f006f5adfb8064c03`; API also hosts BullMQ workers.
- PostgreSQL16, Redis7, nginx1.27, MinIO `RELEASE.2025-04-22T22-12-26Z`.
- 19 migrations; six products, 23 auctions, three orders, 19 customers, ten FileAssets, one wallet, 11 wallet entries. Inventory schema absent then. These are timestamped aggregates, not current financial reconciliation.

Only candidate: **`rezona-admin-rc:130f0653-v2`**. Docker-reported image identity and local RepoDigest:

`sha256:37dcaa839917c81b33fbd7e51915ecea8b056dde68949a8db6189469e5ac4e48`

Archive Config blob digest is separately `sha256:d53111748836b5692a6b4142f64622ef9d7d86cb10463269e40b3d5f2363cfd7`. Do not conflate it with the reported image identity or assume this local reference is pullable from a remote registry. No registry publication/remote pull was validated. Use the verified image archive, then re-inspect identity after an eventual separately approved transfer/load. Superseded v1 must never be selected.

| Artifact, retained privately | Bytes | SHA-256 |
| --- | --- | --- |
| `D:/rezona-admin-hardening/run-130f0653/rezona-admin-api-1.1.0-3-130f0653-v2-image.tar` | 307438592 | `9627212a7f6c1b0637f44c1a145a17df8e8a99c9938b75a446a8dd7a31754480` |
| `D:/rezona-admin-hardening/run-130f0653/backend-source-v2.tar` | 2091520 | `ce79b2c4a4aa3ad813e98223cc414a281c3dd7b512f5dc123519e7bbec9e8838` |
| `D:/rezona-admin-hardening/run-130f0653/rezona-admin-v1.1.0-3-production.apk` | 72419106 | `d866a50ebd55cfb854eb6dcc978cab79fcb680bfcc75aade5f180b3decdd528a` |

Admin package `com.singlestore.admin_app`, **1.1.0 (3)**, entry `lib/main.dart`, production HTTPS API/socket. Certificate SHA-256 `2b768b09c968ba8ebcb3652d959f3e7936ffa143f601a27504dd7d274808850a`. Linux candidate is amd64/non-root `node`; previous actual production-mode boot passed only on an internal synthetic network. No new immutable candidate was needed: release source matches. A staging-driven application/configuration change would require a new candidate and fresh acceptance.

Signing material remains outside Git, owner-ACL protected and Windows-DPAPI dependent. Historical Admin was debug-signed; it cannot be updated in place by this certificate. Fleet installed IDs/certificates/version ordering, draft/journal export/recovery, camera/media permissions and physical signed-release testing remain **NOT VERIFIED**. No uninstall, clear-data or installation authority is inferred. Owner-approved off-machine signing/recovery backup is absent.

## 4. Security and storage disposition

The current zero-production npm result does not clear infrastructure security. The 17 moderate development entries affect Jest/Nest CLI/TypeScript ESLint/glob/minimatch tooling; exact dependency paths, ranges and fixes remain in [full audit](benchmarks/phase9-release-review/0f3e402b/audit-all.json). They are not in `--omit=dev`; residual build/CI supply-chain and hostile-input risk remains. No forced upgrade or application change was applied.

The last observed live MinIO release remains within the affected range of the upstream high-severity [unsigned-trailer advisory](https://github.com/minio/minio/security/advisories/GHSA-hv4r-mvr4-25vw), rechecked in this review. Actual exploit reachability and compensating network controls are not independently established. The AWS S3 adapter fixes the application dependency chain, not the live storage server. OS/image CVE assessment/SBOM and a supported remediation plan remain missing; Docker Scout's previous login requirement was not bypassed or permission-expanded.

Silo Server20261112 was locally evaluated only. Its [maintainer advisory index](https://silo.pgsty.com/about/security-advisories/) reports a maintained release boundary; that is not independent certification of this installation. Tested image pin `docker.io/pgsty/silo@sha256:c20d112390b9a9ce8c11b8af95ad35bcaa62f4759663c09c936cd8d2b511f329`. Local logical restore preserved ten objects/hashes/MIME/references and denied ten anonymous reads. Production adoption, AGPL obligations, maintenance/support owner, dedicated scoped principal and recovery tests still require approval. Do not mount live old MinIO volumes into it or copy root API credentials forward.

Existing scoped policy proposal `docker/minio/rezona-api-policy.json` permits bucket location/list and object get/put/delete, no policy/ACL/admin/create-bucket powers. It has not been provisioned/tested with a restricted production principal. Precreate the approved bucket using a separate operator identity; validate denied administrative and cross-bucket actions in staging.

Argon2id/JWT rotation/revocation/RBAC/ownership and five-per-minute login guard have source/local test evidence. The guard is process-local, not distributed MFA. No MFA or approved equivalent Admin access protection exists in accepted staging. Require a chosen compatible native/mobile protection design; a generic browser-only gateway is not assumed to work with Flutter token refresh/private media/sockets. Preserve public customer APIs.

## 5. Database and inventory release gate

[Migration manifest](benchmarks/phase9-release-review/0f3e402b/migration-manifest.json) freshly hashes all40 local migrations and compares them with the last SSH observation. **21 pending relative to that observation**, not a fresh live status query. Their exact order and locking review are in the [cutover checklist](rezona-phase-9-cutover-checklist.md).

The historical discrepancy is **UNRESOLVED** for `202609190001_auction_optional_featured_rarity`:

- DB-recorded hash `fff0ea321e491ef40ce5ba3fd46d70950d8f3e6523bacb8fe246695449fdbb03`.
- Local/deployed/three retained archives hash `4388744932e623810a54f5f5262a201ef0bb3b183fd38bebf3e3286d655556b5`.
- Independent19-migration reconstruction equals unmodified restored schema, including normalized full PostgreSQL schema hash `78815d5037d81d8a291de4d835eff3d6a8e9f93451214758bcbd6cc1c8259bd1`.

No original-applied-SQL explanation is proven. No `_prisma_migrations` rewrite/reset/resolve was made. A formal history-disposition record must identify the DBA/security/owner reviewers, exact preserved evidence, structural/custom-SQL assessment, accepted residual risk, chosen non-destructive handling and staged pinned-Prisma behavior. This document is not that approval.

Earlier separate local diagnostic clone migrated19→40 with listed business counts unchanged. Original clone stayed19. No accepted staging duration, lock envelope or downtime estimate exists; **migration duration and maintenance window are UNKNOWN**.

Earlier authorized-service dry-run found six unmapped products, zero review-required then, two legacy pending items; no backfill was applied. This does not supply current per-product quantities, physical stock counts or warehouse decisions. Existing backfill opens source-derived available+pending accounting into `SYS_LEGACY / UNALLOCATED_LEGACY`, explicitly not a physical shelf; pending single-unit allocations are reserved. It rejects inconsistent totals or unsupported historical multi-unit pending items. Physical locations must be owner-verified, not invented. Rehearse current dry-run/apply/replay/restart/reconciliation via the existing service on a protected clone, with a reviewed exception list, before any live apply.

Once any mapped stock exists, the old November API/writers are **not an approved rollback**. Feature flags hiding inventory management do not turn off mapped-commerce invariants. A compatible rollback/hotfix must preserve movements, allocations, private media decisions and promotional roles.

## 6. Backup, compatibility and operating gaps

Previous streamed read-only DB/media backups were restored locally and are DPAPI encrypted under an owner-only private directory. DB decrypted hash `df0d0a769d3a8d7eebf840857827124f8239f132d032631db4ed8ca077985264`; compressed media export hash `b126e47abe24e0ad2f8d6bd68aaccfdff063ad45c7fa5929461729847e342c50`. They are online/non-quiesced, dependent on this Windows profile, not a coordinated cutover recovery point or owner-approved off-machine recoverable copy. Redis/in-flight jobs, legacy upload files and complete release configuration need coordinated recovery coverage.

No fresh SSH/capacity/load/queue inspection occurred: matching owner credentials were not available via the approved local channel. Do not infer same-server suitability from the earlier approximately9%-used disk alone. RAM/core/peak/IO limits, production impact stop thresholds, staging isolation and restore headroom remain unknown. No remote staging service was started.

Existing Customer source regressions pass historically, but old shipped APKs have not been run against accepted migrated HTTPS staging. Required: existing login/guest/session behavior, Arabic search/pagination/legacy and optimized images, COD/direct purchases, wallet payments, auction finish/winner behavior, orders/shipping/cancellation/refunds and live socket refresh. These are staging synthetic-customer operations, not test financial writes on production. No customer update may be required to preserve these behaviors.

Monitoring/dashboard/alert routing is a [specification](rezona-phase-9-post-launch-monitoring.md), not deployed or delivery-tested. `/ready` covers DB/Redis, not full S3/worker/backup health. A tested rollback after new inventory/media writes and measured recovery time remain absent.

## 7. Stage A configuration change inventory — proposal, not applied

Preserve production hostname, project/network/volume identities, public API routes, JWT secrets/session state, TLS/legal/uploads mounts and existing financial behavior. Actual Compose/env file paths must be privately confirmed; copying repository Compose over the server is forbidden. Same image must run API and its in-process workers; no independent mixed-version worker rollout.

| Proposed setting/change | Stage A requirement | Approval/evidence missing |
| --- | --- | --- |
| API image/worker | Verified v2 archive/identity above; status-gated normal startup | Staging/scan/compatibility and final GO |
| Schema | Pinned Prisma6.19.3, exact21 pending set only if freshly confirmed | History disposition and timed staging rehearsal |
| `INVENTORY_MANAGEMENT_ENABLED`, `RAPID_PRODUCT_INTAKE_ENABLED`, `IMAGE_OPTIMIZATION_ENABLED` | `true` only after their data/compatibility gates | Backfill/physical decisions and staging |
| `IMAGE_ENHANCEMENT_ENABLED`, `IMAGE_ENHANCEMENT_LOCAL_ENABLED` | `true` only for supported bounded local processing | Linux resources/device acceptance |
| `IMAGE_NEURAL_SEGMENTATION_ENABLED` | `false` initially; safe original/manual fallback | Separate runtime/license/memory acceptance |
| `PRODUCT_STUDIO_PROVIDER` | `fal`, browser only; all20 code-backed cards | No key needed for browsing |
| `PRODUCT_STUDIO_DISPATCH_ENABLED`, `PRODUCT_STUDIO_ENABLED`, `PRODUCT_STUDIO_LIVE_APPROVED`, `PRODUCT_STUDIO_MOCK_APPROVED` | All `false` | Stage B separate pathway/approval |
| `AI_RECOGNITION_ENABLED`, `AI_LIVE_CALLS_APPROVED`, `IMAGE_AI_ENABLED`, `IMAGE_AI_LIVE_APPROVED`, `FAL_BRAND_STUDIO_ENABLED`, `FAL_BRAND_STUDIO_LIVE_APPROVED`, `GEMINI_BRAND_STUDIO_ENABLED`, `GEMINI_BRAND_STUDIO_LIVE_APPROVED`, `FAL_TABLETOP_STYLES_ENABLED`, `FAL_PREMIUM_3D_ENABLED` | All `false`; manual factual review | No unverified provider calls |
| `REAL_PRODUCT_STUDIO_REVIEW_ENABLED`, `PRODUCT_STUDIO_PREPAID_EXPERIMENT` | Both `false`; no gallery/index paths/fixtures | QA must stay unreachable |
| `NODE_ENV`, `SWAGGER_ENABLED`, HTTPS/proxy | `production`, `false`, verified production TLS/proxy trust | No test-mode allowlist bypass |
| Storage endpoint/principal | Approved maintained target and dedicated least-privilege credentials, external secret storage | Storage choice/IAM/migration/rollback approvals |
| Edge/MFA/monitoring | Exact reviewed mobile-compatible protection/alert design | No DNS/firewall/live nginx/credential change approved here |

No exact remote mutation file or final maintenance window can be truthfully issued while these inputs are missing. Proposed architecture/config changes require their own reviewed list and staging evidence before final GO.

## 8. Stage B and financial safety

Paid production admission is **NOT IMPLEMENTED/ACCEPTED**. It must be independently production-scoped; never set NODE_ENV=test or extend a QA database/source allowlist. After healthy Stage A and separate approval, require backend-only key, current price/schema/terms review, image-transfer consent, named employee/mode/template/source scope, durable attempt identity, private candidates and manual review/rejection, kill switch and actual alert/billing reconciliation. Concurrency1; no automatic retry, regenerate, alternative model, batch/top-up or UNKNOWN redispatch. Monthly cap no greater than the approved $10 arrangement, with newly approved lower daily/request limits.

No new account/billing/inference request was made. Latest complete live report remains `ff4e41c6`: six billed requests **$0.254955**, two rejected and four owner-pending. Then-observed balance $9.58 is stale/cents-rounded; **current balance UNKNOWN**. Historical soap correlation remains provisional and total attempt-attributed actual spend **UNKNOWN**; historical $1.044480 commitments remain retained separately. The later continuation `8899520f/failure.json` records a failed read-only account check and zero inference requests, not additional generated outputs. Nothing was released/retried/reconciled by assumption.

Default recommendation remains local neutral composition and preserved factual photograph/approved real foreground. Paid styling is optional only for a deliberately different approved scene. AI_PROMOTIONAL remains private secondary material; employee acceptance must not replace factual primary or publish it. Unsafe segmentation is not fixed by a pretty generated image.

## 9. Final decision table

PASS means the entire production gate has current evidence; partial local successes do not earn PASS. FAIL includes missing mandatory verification, not necessarily a newly discovered defect.

| Gate | Result | Remaining requirement |
| --- | --- | --- |
| Production security | FAIL | Server/OS scans, supported remediation, strong Admin protection |
| Object storage | FAIL | Approved maintained platform, restricted principal, migration/recovery acceptance |
| Database migration | FAIL | Fresh live inventory, formal history disposition, timed protected rehearsal |
| Backups and restore | FAIL | Consistent recovery point, off-machine recoverability, jobs/config coverage |
| HTTPS and Admin protection | FAIL | Protected staging HTTPS and mobile-compatible MFA/equivalent; existing production TLS is a passing subcheck only |
| Signed APK/device compatibility | FAIL | Signed file passes; fleet transition/local draft preservation/physical release acceptance unrun |
| Customer compatibility | FAIL | Shipped old-client acceptance on migrated HTTPS staging |
| Inventory/financial invariants | FAIL | Current per-product dry-run, physical mapping, exceptions, restart/reconciliation acceptance |
| Monitoring | FAIL | Baselines, dashboard wiring, named recipient and tested alert delivery |
| Rollback readiness | FAIL | Tested current-schema-compatible recovery; RTO/RPO unmeasured |
| Overall production readiness | **NO-GO** | Protected staging first; no final cutover approval requested |

Next action is the already-authorized read-only capacity preflight, then protected staging if safely supportable. Obtain current SSH access through an owner-controlled local channel without putting credentials in chat; choose the Admin protection/alert recipient and storage operations/license owners. Present exact DNS/firewall/live-nginx changes separately if needed. Do not ask for FINAL PRODUCTION GO until every gate passes and the conditional checklist becomes an exact rehearsed mutation plan.
