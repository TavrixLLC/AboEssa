# REZONA Phase 9 — conditional cutover checklist

2026-11-25 · **HOLD / NOT EXECUTABLE / NO FINAL GO**. Read the [launch review](rezona-phase-9-production-launch.md). This checklist is preparation, not permission to execute its future mutations. No cutover command was run. Actual server paths, fencing controls, maintenance duration, storage choice and rollback digest remain unapproved; there is deliberately no runnable automatic deploy script.

## A. Close prerequisites in protected staging

- [ ] Measure live CPU cores/utilization, RAM/swap/pressure/peaks, disk/IO, Docker usage, DB/Redis/API-worker load, queues and backup/restore headroom through read-only SSH. Disk free alone is insufficient.
- [ ] Decide suitability from those measurements. If isolation/headroom cannot be established confidently, stop and propose a separate server, not a trial workload on live volumes.
- [ ] Define dedicated project/network/PG/Redis/buckets/volumes/secrets/queues and measured CPU/RAM/disk/log limits. Never mount production volumes. Block outgoing provider/push/payment calls.
- [ ] Approve exact DNS/firewall/live-nginx/TLS changes separately before applying them. Establish tested mobile-compatible MFA or approved equivalent without obstructing customer APIs.
- [ ] Restore protected/anonymized production data; revoke/replace staging copies of credentials/sessions and disable production outward actions before application use. Preserve aggregate reconciliation evidence. Do not restore real sessions into a reachable test application.
- [ ] Approve maintained S3 platform, licensing/maintenance owner, restricted API account and logical media copy/recovery. Keep root/operator credentials separate; test allowed operations plus admin/cross-bucket/anonymous denials.
- [ ] Formally dispose of the historical migration discrepancy without silently editing migration metadata; test the exact approved pinned-Prisma behavior on the clone.
- [ ] Rehearse migration/backfill, old customer binaries, signed Admin, commerce/inventory/media boundaries, queue recovery and compatible rollback over actual staging HTTPS.
- [ ] Measure locks/runtime/CPU/RSS/IO/queue behavior under realistic simultaneous work; use measurements to set the maintenance window and monitoring thresholds. Unknown values must not become guessed estimates.
- [ ] Validate off-machine recovery, original/variant/mask/candidate metadata, policies, legacy uploads, Redis/jobs/config and signing recovery. Deliver a test alert to a named receiver and record acknowledgment/recovery.
- [ ] Obtain separate device-owner permission before any install/update/uninstall/data transfer. Preserve drafts/journals, compare identity/cert/version and test camera/media/restart/Wi-Fi/hotspot behavior.
- [ ] Complete all15 [staging gates](rezona-protected-staging-acceptance.md). If application changes are necessary, build a new immutable RC and repeat acceptance; do not transfer v2 evidence to changed source.

## B. Exact migration order currently available

Source was freshly rehashed. Production applied state below is from **2026-11-24 17:12:20 UTC**, not a fresh query. Revalidate immediately before any final plan. Machine-readable all40 source hashes and the19 recorded hashes: [migration manifest](benchmarks/phase9-release-review/0f3e402b/migration-manifest.json). No migration was applied in this review.

| Order | Pending relative to last observed19 | Review focus |
| --- | --- | --- |
| 1 | `202611160001_image_optimization` | New variant/job tables, references, regular indexes |
| 2 | `202611160002_product_image_lookup` | CONCURRENTLY GIN product image lookup |
| 3 | `202611160003_auction_image_lookup` | CONCURRENTLY GIN auction image lookup |
| 4 | `202611170001_catalog_search` | pg_trgm extension and immutable Arabic-normalization function; privileges |
| 5 | `202611170002_product_search` | CONCURRENTLY expression search index |
| 6 | `202611170003_auction_search` | CONCURRENTLY expression search index |
| 7 | `202611170004_product_cursor` | CONCURRENTLY partial product cursor index |
| 8 | `202611170005_auction_cursor` | CONCURRENTLY partial auction cursor index |
| 9 | `202611170006_product_category_cursor` | CONCURRENTLY category/product cursor index |
| 10 | `202611170007_auction_category_cursor` | CONCURRENTLY category/auction cursor index |
| 11 | `202611190001_warehouse_inventory` | Product marker, new ledger/balance/allocation tables, deferred checks and append-only triggers |
| 12 | `202611190002_inventory_zero_and_allocation_checks` | Replace total-quantity constraint/function, retain arithmetic/per-location invariants |
| 13 | `202611190003_rapid_product_intake` | FileAsset relationship and private session/image/submission schema |
| 14 | `202611200001_product_recognition` | Recognition request/task/usage schema and invariants |
| 15 | `202611200002_recognition_request_sequence` | Existing-request sequence UPDATE, NOT NULL and uniqueness validation |
| 16 | `202611200003_recognition_model_revision` | Request/task model revision fields |
| 17 | `20261120000400_product_image_enhancement` | Usage-purpose changes and image jobs/candidates/decisions, foreign keys/checks |
| 18 | `20261121000100_local_product_segmentation` | Mask lineage/foreign key and mode constraint replacement |
| 19 | `20261122000100_gemini_brand_studio` | Mode constraint replacement; does not authorize calls |
| 20 | `20261123000100_premium_3d_styling` | Mode constraint replacement; does not authorize calls |
| 21 | `20261123000200_studio_media_roles` | Decision-revision UPDATE, existing premium role reclassification and constraints |

ALTER TABLE/constraint/FK validation can acquire disruptive locks. Regular indexes on new tables differ from the explicitly CONCURRENTLY legacy indexes, which still use IO and wait for transactions. Do not wrap this entire sequence in a transaction: CONCURRENTLY has transaction restrictions. Inspect actual table sizes/long transactions, extension privileges, invalid indexes, failed migration rows and trigger/function definitions on staging. Do not invent lock-timeout/session settings without rehearsing them with pinned Prisma6.19.3. Recovery from a partially failed concurrent index must be version-specific and reviewed, not blind resolve/drop.

Protected-staging migration duration: **NOT MEASURED**. Lock maxima: **NOT MEASURED**. Cutover downtime/RTO: **UNKNOWN**. The earlier local19→40 diagnostic success cannot establish an SLA.

## C. Inventory mapping and irreversible boundary

Before live backfill, obtain a current per-product report of `totalQuantity`, `availableQuantity`, `soldQuantity`, pending OrderItems/quantities/status, mapped marker and reconciliation. Compare to actual warehouse counts and reviewed ownership/location decisions. Preserve prices/categories/order/financial data. Review all exceptions, including the previously observed two legacy pending items; do not infer that zero errors on an old snapshot means zero today.

Existing authorized endpoint `POST /api/admin/inventory/backfill` requires Admin permission `INVENTORY_MIGRATE`; `dryRun` defaults true, limit<=50, cursor `afterId`, optional `productId`. Dry-run first. Archive every result and exception before separately authorized apply. Existing apply is idempotent per product; opening accounting uses source available+pending in the explicitly nonphysical `UNALLOCATED_LEGACY` location. No fake physical receipt/location/quantity is permitted. All physical allocations/transfers must use current authorized inventory services and owner-confirmed values. Never edit immutable movements directly.

Rehearse resume after partial batch, replay, restart and reconciliation; verify balance>=reserved>=0, available equals onHand-reserved, total=available+sold, RESERVED allocations match per-location reservation and ledger arithmetic/append-only protection. Compare wallet totals/entries, orders, auctions, media references and customer/session state independently.

**After any mapped inventory write, the historical November API/worker digest is not a safe rollback target.** Before reopening traffic, identify and test a current-schema-compatible rescue image, or use feature fencing/forward fix. Do not promise old-code rollback by turning off the management flag.

## D. Writer/job fencing design — must be rehearsed and separately approved

There is no verified whole-platform safe-pause API. API processes also host workers; stopping API affects checkout, bidding, automatic auction completion, uploads and scheduled processing. Nest shutdown hooks/worker.close exist, but a shutdown deadline does not prove every job/outbound request settled.

Proposed maintenance design to validate, not execute now:

1. Inventory every API instance, cron, worker, staff integration, direct DB writer, callback and socket writer. Record exact versions and queue/job identifiers without private payloads.
2. Approve an edge maintenance rule covering new HTTP mutations **and WebSocket/realtime writers**, while keeping explicit health/recovery access. Inspect existing socket sessions, not only new connections. Exact nginx/control changes must be presented first.
3. Keep external paid generation disabled. Stop job admission through supported existing application controls; no new fictitious pause endpoint. Record waiting/active/delayed/repeat/failed/stalled/UNKNOWN states. Reconcile active external outcomes; timeouts do not prove unbilled requests.
4. Use tested graceful shutdown of every API/in-process worker and verify no running writers. If work remains or the grace period is exceeded, stop the cutover decision and preserve evidence; do not casually SIGKILL/retry. Maintenance must fence auction jobs as well as stock/media writes.
5. Take the coordinated recovery point only after this writer boundary is proven. Redis snapshot/job handling must distinguish safe at-least-once local tasks from nonretryable paid UNKNOWNs. Never FLUSH Redis or delete queues as deployment cleanup.

Maintenance duration includes fencing/drain, backup verification, storage copy, migrations, reconciliation, cold start and smoke checks. It cannot be reduced to the local Prisma runtime. Owner must accept the measured customer/bidding interruption before GO.

## E. Final packet, then separate final GO

- [ ] Refresh actual image/release/Compose/config paths, migration/checksum inventory, supported storage version/IAM, table sizes, queue state, resource baseline and business/financial aggregates.
- [ ] Confirm candidate/source/APK/certificate hashes and exact API-worker version matrix. Never use v1 or mutable latest.
- [ ] Produce an exact privately reviewed config/diff list: image reference, env flag changes, secret paths, storage endpoint/IAM, DNS/firewall/nginx if any, volume bindings, backups, compatible rollback and named operator/device list. Public packet contains no secret values.
- [ ] Record tested maintenance duration, lock envelope, RPO/RTO and outage impact. Current values are UNKNOWN.
- [ ] Every mandatory production gate PASS; no waiving missing staging acceptance through green unit tests.
- [ ] Only then ask the owner for `FINAL PRODUCTION GO — REZONA ADMIN RELEASE 1.1.0 (3) / [exact accepted image identity and reviewed change-list hash]`. If a new RC is required, replace version/identity with its exact accepted values.

**This approval is not being requested now: prerequisites fail.** General “تم”, this Phase9 prompt or a prepared APK is not final GO.

## F. Future approved cutover sequence (NOT RUN)

1. Final read-only snapshot and abort if it differs from the approved packet.
2. Establish the rehearsed writer/job/edge fence; record interrupted-business implications.
3. Create new coordinated, restricted DB/media/legacy-upload/Redis-job/config recovery snapshot; verify off-machine recovery and restore capability. Never reuse an old online snapshot as if current.
4. Only if explicitly included in final GO, prepare the approved new storage target with fresh isolated data, scoped API identity and copied logical objects/metadata; verify hashes/types/versions/references/private denials. Retain old storage unchanged for recovery; no incompatible raw-volume remount.
5. Use approved immutable API image and pinned one-shot entrypoint `ABOESSA_MIGRATION_MODE=deploy-only`; then `status-only`, exact migration rows/checksums and independent custom SQL/invariant verification. No migrate dev/db push/reset/fixtures.
6. Apply only the separately reviewed inventory backfill plan via its existing authorized service with normal worker boot still fenced; reconcile immediately. Do not invent a worker-free maintenance entry point: its exact safe operator mechanism must be demonstrated in staging first.
7. Replace only the compatible API/in-process-worker service with reviewed StageA configuration. Data service restarts and nginx changes are not implicit. Startup status check must not auto-migrate on ordinary restarts.
8. Non-destructive smoke checks: health/ready, unauthorized Admin denial, protected media denial, QA-gallery404, published catalog/Arabic pagination/legacy images, DB/Redis/S3/queue status and no unintended paid dispatch. Do not place real production test orders or modify wallets as smoke tests.
9. Compare aggregate and per-object invariants against pre-cutover; no unexplained customer/session/product/order/auction/wallet/stock/media changes. Account for explicitly approved backfill-only changes.
10. Reopen writers gradually, then distribute exact signed APK only to named approved staff/devices after local-draft/signature transition acceptance. No automatic mass install or customer release.
11. Observe accepted alert/resource/customer/stock thresholds and named staff workflows before expansion. Retain exact timestamps, decisions and evidence.

## G. Stop and recovery

Immediate halt: privacy/auth failure, stock or financial invariant breach, broken checkout, wrong media ownership/publication, unexplained data differences, uncontrolled paid calls, unrecoverable jobs or resource pressure exceeding accepted bounds. Disable affected admission, fence unsafe writers and preserve original media/job/evidence. Prefer a forward-compatible hotfix/feature disablement or a proven compatible image+workers+config, not the old pre-ledger API.

Retain newer schema, movements, original photos and decision history. APK recovery requires same production certificate and a higher version code, not uninstall/downgrade. Full DB/media/Redis restore is a separate incident-owner/owner decision that must state possible loss of post-snapshot customer transactions and reconcile external payment/provider outcomes. It is not a routine rollback command. No blanket pg_restore --clean, volume deletion, queue flush, checksum repair or reservation release is authorized.
