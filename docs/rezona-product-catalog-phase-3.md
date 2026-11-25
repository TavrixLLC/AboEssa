# REZONA — Product catalog performance, Phase 3

Date: **2026-11-17**. Local implementation only. **Nothing deployed, uploaded to GitHub, or submitted to an app store. Phase 4 not started.**

Subsequent validation/security status: [Phase 3 pre-production readiness review](rezona-phase-3-production-readiness.md). The newer report supersedes the dependency-audit counts below and keeps the physical-device/network gates open.

## Status and scope

Implemented: additive card APIs, keyset pagination, mixed feed without discarding records, Arabic-aware indexed search, optional batched media metadata, Flutter product/auction image integration, bounded persistent public-image caching, bounded decoded-image memory, memory-only scoped product-data caching with deduplication/revalidation, lazy customer grids, pagination guards, search debounce/race protection, and cache invalidation.

Verified separately: Phase 2 real PostgreSQL/Redis/MinIO integration, unchanged original hashes and legacy URLs, private variant denial, job retry/backfill idempotency, Linux Docker build and native Sharp WebP encoding, service/query benchmarks at 100/1,000/10,000 products, and Flutter disk/codec/grid tests.

**Not a production-readiness claim:** cold/warm application launch, first visible card timing, actual mobile-network bytes, physical-device frame timing/jank/RSS, and CDN HIT rate were not measured. Existing dependency security findings also require review before release. Test-engine decode measurements are not Android profile measurements.

The working trees contained uncommitted changes from display retirement, legal branding, and Phase 2. They were preserved. No purchase, checkout, wallet, bid, quantity, cancellation, ownership, or authentication business logic was rewritten. Historical order snapshots remain unchanged; only their image renderer now bounds decoding.

## Backend architecture and API

New module: [src/catalog](../src/catalog/catalog.module.ts).

| Endpoint | Contract |
|---|---|
| `GET /api/catalog/products` | Public, currently active/in-stock product cards. No buyer/order joins or descriptions. Only the primary original URL; optional optimized media metadata. |
| `GET /api/catalog/auctions` | Public active/non-expired auction cards. Current price, minimum increment/next bid, timing, rarity and bid count. No personal bid history; the existing authenticated detail API remains authoritative. |
| `GET /api/catalog/marketplace` | Interleaved product/auction cards. Cursor stores independent source boundaries and whose turn comes next. Unconsumed fetched records are not skipped. |
| `GET /api/catalog/media?keys=...` | Bounded lookup for saved favorites/legacy references lacking embedded metadata: max 40 validated local keys and 6,000 input characters. Only assets referenced by currently public products/auctions; excludes customer-owned assets. Two batched SQL reads, not a mobile request per image. |

Card-list filters: `categoryId`, `search` (100 characters max), `discountedOnly=true|false`, `rarity=FEATURED|RARE|LEGENDARY` where relevant; `limit` defaults to 20, maximum 40. Returned `meta` contains `page, limit, hasMore, nextCursor`, not an exact total count. Search is server-side. Product amounts retain decimal money formatting and existing discount behavior.

Example:

```json
{
  "success": true,
  "data": {
    "items": [{"id":"...","title":"...","imageUrls":["/api/media/products/original.png"]}],
    "serverTime": "...",
    "meta": {"page":1,"limit":20,"hasMore":true,"nextCursor":"..."}
  }
}
```

The complete runtime response contains all required card fields; the snippet deliberately omits them for brevity. Next cursor is opaque, versioned, validated and bound to endpoint/filter/search/page size. Values used in SQL remain parameters, not concatenated SQL. Ordering uses immutable `createdAt DESC, id DESC`: title/price updates or auction extensions cannot move an item across a page boundary. **The new auction catalog is newest-created-first**, unlike the old default ending-first API. The old endpoint and its sorting contract are unchanged. Changing sort order in the new API requires a new explicit contract/cursor signature.

Original `/products`, `/auctions`, `/marketplace`, admin lists, details and all mutations remain available. Updated clients opt in with `X-Catalog-Media: 1`; only opted-in published items get `imageMedia`. Existing clients do not receive this extra metadata overhead. List metadata includes thumbnail/catalog variants; details and the cold-reference batch endpoint can include all variants. Missing variants keep the original URL. No metadata is injected into order snapshots or authentication responses.

Card data and media manifests use `Cache-Control: no-store` at HTTP level. Only Phase 2 immutable, content-hashed public image bytes get long-lived public caching. No DNS/CDN rules were changed. A production header probe timed out before HTTP, so no CDN claim is made.

### Queries and migrations

Seven additive migrations under `prisma/migrations/20261117*`:

1. `catalog_search(text)` + existing PostgreSQL `pg_trgm` extension support.
2. Multi-expression GIN on normalized product title and description.
3. Equivalent auction search index.
4–5. Partial active-product and active-auction creation/ID indexes.
6–7. Partial category/creation/ID indexes after query plans showed date-index scans filtering many unrelated category rows.

The normalization preserves model digits/Latin text and folds Arabic alef variants, ya/hamza variants and diacritics/tatweel. It does not translate language or invent names. The PL/pgSQL function has an explicit planner cost because measured SQL-function inlining underestimated repeated long-description normalization and chose a much slower plan. Search materializes matching IDs only before fetching bounded card rows; no full catalog is loaded into Node or Flutter.

All concurrent index statements are isolated in their own migration. PostgreSQL must permit installing `pg_trgm`. Expression/partial indexes are deliberately SQL-managed; do not use `db push` to reconcile them. No existing rows/columns/images/IDs were removed. Final migration definitions were applied successfully from zero in a second dedicated QA database. Earlier experiments were confined to disposable QA resources, not ordinary local or production application data.

## Flutter architecture

### Image integration

[AppCatalogImage](../../AboEssaMobile/packages/shared_ui/lib/src/components/app_catalog_image.dart) wraps Phase 2 [AppOptimizedImage](../../AboEssaMobile/packages/shared_ui/lib/src/components/app_optimized_image.dart). The API client feeds a bounded public-manifest registry after resolving relative paths against the configured API origin.

Used by:

- Shared `AppCommerceCard`, covering mixed home, store, discounts, favorites and product/auction cards.
- Customer auction grid and both product/auction detail galleries.
- Admin console thumbnails, legacy product/auction galleries and upload previews.
- Historical order thumbnails, without changing their saved source URLs.

Account avatars and standalone advertising images remain outside the catalog pipeline. They have no Phase 2 catalog variants. Admin drafts/private or unknown references fall back to the original without persistent disk caching.

The widget chooses thumbnail/catalog/detail according to actual layout and device pixel ratio, preserves aspect ratio, supplies bounded decode dimensions, never requests upscaling, and falls back WebP → JPEG → original → lightweight error placeholder. Details allow 1024px. A failed cached decode evicts that public URL so a later request can recover. Metadata for the same original merges sizes within the same content/recipe version; a new version discards all obsolete sizes, so a card update cannot leave the old detail image behind. A registry change stream also refreshes a visible image when metadata changes but its product's Equatable fields do not.

For cold saved references, visible widgets batch metadata requests after 16ms, at most 40 keys per request, one active batch, a bounded pending queue, and a 2-second timeout with client closure. Failed/unsupported lookups fall back to originals; the widget never fabricates a variant URL. Negative metadata results are memory-cached for two minutes.

### Cache layers and limits

| Layer | Implementation and boundary |
|---|---|
| HTTP/edge | Phase 2 immutable content/version URLs. New content means a new key. Never apply public cache directives to personalized API data or private media. |
| Persistent public image files | Established `cached_network_image 3.4.1` + `flutter_cache_manager 3.4.1`, cache namespace `rezona-public-catalog-v1`, default 160 objects and 30-day unused-entry retention. Only validated optimized-public URL shapes are eligible; originals/customer/draft URLs use network-only providers. |
| Decoded images | Flutter ImageCache limited by default to 64 MiB and 160 objects; image decode is also constrained per widget. Live images can temporarily remain outside the evictable cache; this is not a process RSS ceiling. |
| Product metadata | `CatalogReadCache`: memory only, max 60 entries per API client. Keys include API origin, hashed account-token scope, locale header, canonical query/filter and cursor. 10-second fresh interval for product/auction reads; stale-while-revalidate up to 2 minutes. Categories: 5-minute fresh interval and 10-minute maximum cached age. No private responses or prices written to disk. |

Disk eviction is **object-count-based**, not a hard byte quota. At the Phase 2 sample's catalog-image average, 160 catalog files are roughly 2.4 MB; detail files and other image distributions change that. Do not advertise a guaranteed disk-byte ceiling. Public manifest registry is memory-only (1,000 originals), so after process restart a fresh catalog response or batched lookup is needed to rediscover hashed URLs before reusing image files. Offline cold saved references may therefore fall back to originals even if a variant file remains on disk.

Read requests deduplicate while in flight. Generation fencing prevents a late invalidated request from repopulating the cache; account switches clear that client's previous scope. Successful relevant mutations invalidate list families. Pull-to-refresh bypasses metadata cache. Background refresh updates the visible screen; foregrounding/returning from a detail route revalidates. Server stock/payment/bid checks still decide every transaction.

Favorites retain the existing saved title/price snapshots; this phase reconciles their image manifest, not their saved commercial fields. Product detail and the server remain authoritative before purchasing.

### Pagination, search, rebuilding and invalidation

- `CatalogCursorClient` adapts existing page-based repositories to new endpoints. It stores bounded filter-to-cursor histories. On an old server's 404, it uses existing endpoints and backs off feature detection for two minutes/five minutes respectively (media/card API). Legacy home requests 10 from each source and interleaves without discarding extras.
- Home, store, discounts and auction lists now use one `CustomScrollView` with lazy slivers, stable item keys and query-specific page-storage keys. Removed nested shrink-wrapped grids from these paths. Near-end loading is guarded against concurrent calls and deduplicates repeated item IDs; `hasMore=false` stops loading.
- Nearby-image preparation is bounded by a 160px sliver cache extent, generally the next row rather than the entire next page. Flutter's Image widget uses ScrollAwareImageProvider to defer loading during fast scrolling. No unbounded explicit precache loop. Already-started network transfers are not guaranteed to be cancelled merely because a card scrolls off-screen.
- Home/auction text searches debounce 350ms; auction search no longer filters only the first downloaded page locally. Category/rarity filters remain server-side. Request-generation checks suppress old search/filter responses. The existing store browsing UI remains category-based; product search is available through the mixed home/search API.
- New `catalog_changed` Socket.IO event after successful admin product/auction/category writes sends family and ID only. Product/auction list families and the affected detail can be invalidated without clearing unrelated category data. Category changes invalidate category/product/auction listings. Existing sold/updated/closed events remain. Guest/offline clients without authenticated sockets rely on TTL/refresh-on-focus.
- Product-detail refresh was separated from its existing “sold event” handler, so background cache/lifecycle refresh cannot incorrectly mark a product as sold.

### Build controls

Flutter `--dart-define` settings:

| Key | Default | Notes |
|---|---:|---|
| `CATALOG_OPTIMIZATION_ENABLED` | true | Opt into lightweight endpoints, metadata headers and read cache. false uses legacy reads. |
| `CATALOG_DISK_CACHE_ENABLED` | true | Disable persistent image files without disabling optimized image selection. |
| `CATALOG_IMAGE_CACHE_OBJECTS` | 160 | Clamped 20–400. |
| `CATALOG_IMAGE_MEMORY_MB` | 64 | Clamped 16–128 MiB. Not whole-app RSS. |

Existing `APP_ENV`, `API_BASE_URL`, `SOCKET_URL` remain necessary. Server image-processing settings are documented in [Phase 2](rezona-image-optimization-phase-2.md). No AI or paid service added.

## Measurements

### Catalog service/DB comparison

Full results and EXPLAIN plans: [catalog-phase3-services.json](benchmarks/catalog-phase3-services.json).

Method: 25 sequential reads per path, same isolated PostgreSQL 16 on Docker, Windows Node 24 client, warmed database, no traffic/network shaping. Synthetic products contain long repeated descriptions and three original image references. Each size has seven additional auctions. These are **service-call timings, not full HTTP, device-launch or CDN timings**.

| Products | Legacy list P50/P95 ms | Cursor cards P50/P95 ms | Normalized search P50/P95 ms | Cursor payload bytes |
|---:|---:|---:|---:|---:|
| 100 | 7.48 / 12.22 | 1.91 / 2.86 | 3.09 / 4.84 | 12,659 |
| 1,000 | 7.87 / 9.36 | 1.10 / 1.86 | 3.88 / 4.21 | 12,701 |
| 10,000 | 16.23 / 18.65 | 1.14 / 1.53 | 4.78 / 5.36 | 12,742 |

Legacy plain JSON was 113,237–113,281 bytes for 20 records; cursor JSON about 12.7 KB before optional image metadata. With this unusually repetitive fixture gzip compresses legacy data to ~1,113–1,116 bytes versus ~874–878 bytes for cursor cards: **do not equate the 89% plain-JSON reduction with real mobile bandwidth savings**. Media metadata/HTTP envelopes add bytes and are not included in those service payload numbers. Price/stock values were fetched, not cached, during the comparison. Prisma's logged SQL duration is millisecond-resolution: P50 legacy 2/2/11ms versus cursor 1/0/0ms; zero means sub-millisecond rounding, not no query work.

Search measurement uses “الكتروني موديل 95” against Arabic diacritized titles and long descriptions. Initial plans took up to seconds; the final measured plan uses the normalized search index. This is not a guarantee for all unselective/short queries. Full mixed-feed traversal verified **107, 1,007 and 10,007 distinct records** across 6, 51 and 501 pages, with no duplicate IDs or discarded source records.

### Image rendering and caching evidence

- Phase 2 file-size result remains **1.83 MB → 15.1 KB** mean PNG-original versus 480px WebP across ten fixtures. It is not a new launch-time measurement.
- An isolated Flutter host-engine decode run measured mean **23.12ms for original PNG versus 2.57ms for the 480px WebP** ([raw samples](benchmarks/catalog-phase3-decode.json)). Decoded RGBA pixel storage was **6,290,064 versus 921,600 bytes/image**. This is native test-engine decode work, not a phone's frame time, total heap, or a comparison with an already downsampled original.
- Widget test with 10,000 metadata records built fewer than 30 children initially and fewer than 100 after a 1,000px fling; it did not build all 10,000.
- Disk test used a real loopback HTTP server and persistent files/repository: first request downloaded once, repeated request and a new cache-manager instance reused the file without another request; changing URL version missed once; removal permitted recovery download. This is a controlled cache-hit test, not an observed production hit-rate.
- CDN latency/HIT rate, bytes per real mobile page, actual cold/warm app launch, first card/image timing, frame P50/P95/jank and device RSS remain **unmeasured**. No Android/iOS profile trace was captured. Do not mark these acceptance gates complete.

## Tests, failures and known constraints

Automated coverage includes existing backend/customer/admin suites, new normalization/cursor validation tests, real HTTP/media compatibility checks, cache keys/account scoping/request dedup/revalidation tests, cursor-to-legacy fallback, image selection/fallback/version behavior, persistent disk reuse, viewport laziness, category/product/auction navigation and old-result suppression.

Final executed results:

| Check | Result |
|---|---|
| Backend Jest | 152 tests across 20 suites passed |
| Customer Flutter | 159 passed |
| Admin Flutter | 139 passed |
| API client Flutter | 20 passed, including category-write invalidation |
| Shared UI Flutter | 17 passed, including actual host-engine decode fixtures (not skipped) |
| Core / app_models / secure_storage / realtime_socket / printer_bridge | 7 / 1 / 2 / 1 / 1 passed |
| Backend TypeScript build | Passed |
| Flutter workspace analysis | No issues found |
| Android customer debug APK | Built with explicit production API/socket defines; not installed or uploaded |
| Linux runner build | Passed, `rezona-phase3-verify:local`, linux/amd64 |
| Native Sharp in Linux runner | Encoded a WebP successfully (44-byte test output) |
| Real Phase 2 HTTP/storage/queue checks | Passed again with Phase 3 metadata compatibility and batch authorization assertions |
| Fresh migrations | All 29 applied from zero in a separate disposable QA database |

**Total: 499 automated tests passed** across the backend and every remaining Flutter workspace app/package with a test directory. The final Linux image ID was `sha256:39ef8f3360bf8f67e71ba8eafbd702b440d8884cc1c01310b86a47a40ce4019c`. Benchmark traversal also passed after hiding a previously viewed QA product, verifying that later pages do not shift as offset pagination would. This repeat succeeded too; the checked-in service JSON/table retain the earlier successful representative run rather than mixing numbers from different runs.

During development, Flutter first failed on a missing `ScrollCacheExtent` rendering import and an order renderer's frameBuilder parameter; both were fixed. Existing tests expecting two home requests or a nested GridView were updated to assert the new single-page/sliver contract without weakening navigation/layout assertions. An AspectRatio finder was updated to select the outer card after adding the image component. No known failing assertion was silently removed.

A parallel final Flutter run also failed because drive C ran out of temporary-file space (`OS Error 112`); the compiler's following null-check exception was secondary to that failure. Those runs were stopped and repeated sequentially with task-specific TEMP/TMP on drive D, where customer/admin suites passed. No user project files were deleted to recover space. Android builds warn about future Flutter/Kotlin Gradle Plugin compatibility for the existing app/plugins; this did not fail the current build.

Cleanup: only the three task-created, loopback-bound `rezona-phase2-qa-*` containers were stopped/auto-removed after testing, including their disposable seeded data. The ordinary `aboessa-*` application services and unrelated containers were left running. The QA scripts can recreate their fixtures; no customer data was deleted.

Security prerequisite: `npm audit --omit=dev` reported **28 findings: 1 low, 12 moderate, 14 high, 1 critical** in the existing dependency tree. Full-install Docker audit also reported dev findings. This phase did not automatically apply breaking dependency upgrades. Review advisories/exploitability and remediate under a separate tested change before production approval.

Dependency resolution and validation used Flutter 3.44 / Dart 3.12. The committed baseline's SDK-coupled lock versions differ from this SDK: pub resolved intl 0.20.2, matcher 0.12.19, meta 1.18.0, test_api 0.7.11 and vector_math 2.2.0. The generated lock keeps those actually tested versions. Newly resolved sqflite 2.4.6 and synchronized 3.6.1+1 require Dart 3.12 (sqflite also Flutter 3.44), so the lock's aggregate SDK floor increases accordingly. Do not assume the former toolchain works with this lock: use Flutter 3.44 in CI, or explicitly resolve/test compatible older transitive cache dependencies under the intended older SDK before shipping. No unrelated pubspec SDK declaration was silently changed. Desktop/web persistent-cache capabilities differ by platform; iOS was not built on Windows.

## Changed file groups

- Backend: `src/catalog/*`, `src/app.module.ts`, event union in `src/sockets/sockets.service.ts`; seven Phase 3 SQL migrations. No existing transaction implementation changed.
- Test/tooling: `tests/unit/catalog.spec.ts`, `scripts/phase3-catalog-benchmark.cjs`, extended `scripts/phase2-image-integration.cjs`; Phase 2 benchmark can now emit raw catalog fixtures for the decode test.
- Shared Flutter: new `app_catalog_image.dart`, `app_catalog_grid.dart`; extended `app_optimized_image.dart`; commerce card, exports and shared_ui dependencies.
- API client: `catalog_read_cache.dart`, `catalog_cursor_client.dart`; Dio client observer/opt-in configuration, media URL resolver, exports, direct crypto dependency and tests.
- App models: optional cursor/hasMore in `PaginationMeta`, preserving old pagination fields.
- Customer: DI, marketplace/product/auction Cubits and browsing pages; auction repository/use-case/data-source search parameter; realtime subscriptions/refresh listener; order thumbnail renderer and targeted tests.
- Admin: DI metadata observer, console thumbnails, product/auction galleries, upload preview. No admin business workflow changes.
- Dependency lock/native plugin registrants updated for cache dependencies and the SDK resolution described above; previously uncommitted display/legal work retained.

### Exact Phase 3 source/test inventory

Paths below are repository-relative. A path that already had Phase 2/display changes contains additive Phase 3 edits, not replacement of that earlier work. Generated build and `.dart_tool` artifacts are excluded.

```text
AboEssa/
  src/app.module.ts
  src/sockets/sockets.service.ts
  src/catalog/catalog.module.ts
  src/catalog/catalog-query.dto.ts
  src/catalog/catalog.service.ts
  src/catalog/catalog-media.interceptor.ts
  src/catalog/catalog-media.service.ts
  prisma/migrations/202611170001_catalog_search/migration.sql
  prisma/migrations/202611170002_product_search/migration.sql
  prisma/migrations/202611170003_auction_search/migration.sql
  prisma/migrations/202611170004_product_cursor/migration.sql
  prisma/migrations/202611170005_auction_cursor/migration.sql
  prisma/migrations/202611170006_product_category_cursor/migration.sql
  prisma/migrations/202611170007_auction_category_cursor/migration.sql
  scripts/benchmark-image-variants.cjs
  scripts/phase2-image-integration.cjs
  scripts/phase3-catalog-benchmark.cjs
  tests/unit/catalog.spec.ts
  docs/rezona-product-catalog-phase-3.md
  docs/benchmarks/catalog-phase3-services.json
  docs/benchmarks/catalog-phase3-decode.json
AboEssaMobile/
  packages/api_client/lib/api_client.dart
  packages/api_client/lib/src/catalog_cursor_client.dart
  packages/api_client/lib/src/catalog_read_cache.dart
  packages/api_client/lib/src/dio_api_client.dart
  packages/api_client/lib/src/media_url_resolver.dart
  packages/api_client/pubspec.yaml
  packages/api_client/test/api_client_test.dart
  packages/api_client/test/catalog_read_cache_test.dart
  packages/app_models/lib/src/pagination_meta.dart
  packages/shared_ui/lib/shared_ui.dart
  packages/shared_ui/lib/src/components/app_catalog_grid.dart
  packages/shared_ui/lib/src/components/app_catalog_image.dart
  packages/shared_ui/lib/src/components/app_optimized_image.dart
  packages/shared_ui/lib/src/components/app_commerce_card.dart
  packages/shared_ui/pubspec.yaml
  packages/shared_ui/test/app_optimized_image_test.dart
  packages/shared_ui/test/catalog_disk_cache_test.dart
  packages/shared_ui/test/catalog_grid_performance_test.dart
  apps/customer_app/lib/app/customer_di.dart
  apps/customer_app/lib/features/auctions/data/datasources/customer_auctions_remote_data_source.dart
  apps/customer_app/lib/features/auctions/data/repositories/customer_auctions_repository_impl.dart
  apps/customer_app/lib/features/auctions/domain/repositories/customer_auctions_repository.dart
  apps/customer_app/lib/features/auctions/domain/usecases/customer_auctions_usecases.dart
  apps/customer_app/lib/features/auctions/presentation/bloc/customer_auctions_cubit.dart
  apps/customer_app/lib/features/auctions/presentation/pages/customer_auction_pages.dart
  apps/customer_app/lib/features/marketplace/data/datasources/customer_marketplace_remote_data_source.dart
  apps/customer_app/lib/features/marketplace/presentation/bloc/customer_marketplace_cubit.dart
  apps/customer_app/lib/features/marketplace/presentation/pages/customer_marketplace_page.dart
  apps/customer_app/lib/features/products/data/datasources/customer_products_remote_data_source.dart
  apps/customer_app/lib/features/products/presentation/bloc/customer_products_cubit.dart
  apps/customer_app/lib/features/products/presentation/pages/customer_product_pages.dart
  apps/customer_app/lib/features/orders_core/presentation/pages/customer_orders_pages.dart
  apps/customer_app/lib/features/realtime_status/data/repositories/customer_realtime_status_repository_impl.dart
  apps/customer_app/lib/features/realtime_status/presentation/widgets/customer_realtime_refresh_listener.dart
  apps/customer_app/macos/Flutter/GeneratedPluginRegistrant.swift
  apps/customer_app/test/customer_compact_product_card_test.dart
  apps/customer_app/test/phase_c_customer_marketplace_test.dart
  apps/admin_app/lib/app/admin_di.dart
  apps/admin_app/lib/features/admin_console/presentation/console_widgets.dart
  apps/admin_app/lib/features/auctions/presentation/pages/admin_auction_pages.dart
  apps/admin_app/lib/features/products/presentation/pages/admin_product_pages.dart
  apps/admin_app/lib/features/uploads/presentation/widgets/admin_cropped_image_picker.dart
  apps/admin_app/macos/Flutter/GeneratedPluginRegistrant.swift
  pubspec.lock
```

## Reproduction and rollout

1. Use the isolated QA resources/ports in the Phase 2 guide; never point these scripts at real customer data. Apply `npm run prisma:deploy` to that explicit QA URL. From `AboEssa`: `npm run build`, `npm test -- --runInBand`; in PowerShell set `$env:REZONA_IMAGE_QA='1'`, then run `node scripts/phase2-image-integration.cjs` and `node scripts/phase3-catalog-benchmark.cjs`. The benchmark seeds clearly tagged QA data and performs read/update assertions on that data only.
2. From Flutter app/package directories: `flutter test --no-pub`; from workspace: `flutter analyze --no-pub`. For decode measurement, run the Phase 2 benchmark with `--review`, set `REZONA_IMAGE_REVIEW` to its temporary output directory, and run shared_ui's `catalog_grid_performance_test.dart`. Without the variable the decode benchmark is explicitly skipped, not counted as verified.
3. Build Linux Docker with `docker build --pull=false -t rezona-phase3-verify:local .`. Test native Sharp in the runner image, not just TypeScript compilation. The Linux build and WebP smoke succeeded locally.
4. Before release, resolve the security gate, verify the selected Flutter SDK/lock, measure on a mid-range Android device in profile mode with realistic network shaping and production-like images, and capture cold/warm navigation, request bytes/cache sources, frame timings and memory. Verify an old app and a new app against staging.
5. Only with explicit deployment approval: backup database + MinIO, apply Phase 2 and Phase 3 additive migrations, deploy the backward-compatible API first, keep image generation disabled until readiness checks, backfill in controlled batches, then enable image jobs and distribute the new client. Monitor search plans, Redis/MinIO workload and catalog latency. No migration auto-runs against production from these test commands.
6. Rollback: disable client catalog/disk feature controls when rebuilding, retain old read APIs and original images, and revert the new backend module if necessary. Do not drop tables/indexes or delete media as part of ordinary rollback. No Phase 4 stock-location work is included.
