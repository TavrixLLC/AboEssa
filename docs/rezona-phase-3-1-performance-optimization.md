# REZONA Phase 3.1 — physical-device performance validation

Status: **NO-GO for production.** Work performed locally on 19 November 2026. No production deployment, Git push, Phase 4 work, dependency upgrade, authentication bypass or original customer-app reset was performed.

## Scope and preserved boundaries

This extends [the Phase 3 readiness review](rezona-phase-3-production-readiness.md), not a replacement for its security/staging gates. The physical device is the Redmi Pad SE (23073RPBFG / SM6225), Android 15, 1200 × 1920 panel, tested in landscape (1920 × 1200), USB connected and AC powered. The tested package is **com.tavrix.aboessa_customer_app.phase3qa**, signed with the separate QA key. The ordinary customer package and its data were not targeted.

The same corrected HTTPS QA setup was reused: APP_ENV=production, API/SOCKET=https://127.0.0.1:58445, explicit temporary private QA CA, normal certificate chain/hostname verification, cleartext prohibited. Production bootstrap guards and normal application entrypoint remain intact. ADB reverse transports traffic to the local isolated server. **These are not Wi-Fi or cellular-network measurements.**

The pre-existing QA fixture server was stopped and its existing, explicitly guarded fixture procedure restarted. It created a fresh disposable fixture category, 1,000 products, 20 auctions with a new 24-hour lifetime and ten image assets. The previous expired auctions were not renewed by a raw database update. No protected database or production fixture workaround was used. Earlier disposable categories remain in this reused QA database; their media limitations are described below.

## Original observations (not a statistical baseline)

| Original USB Release smoke scenario | Build P95 ms | Raster P95 ms |
|---|---:|---:|
| Initial catalog | 9.726 | 26.484 |
| Continuous scrolling | 13.830 | 28.589 |
| Detail/back combined | 12.871 | 52.868 |
| Arabic search | 34.705 | 26.318 |

Source: `benchmarks/catalog-device-usb-release-20261119.json`. This was one session, not a five-run distribution. Its disk cache was not controlled cold. It had expired auction fixtures and combined detail/back timing. Therefore numerical differences from the new controlled cold, active-auction runs are **not** evidence of improvement.

Flutter's Display API reports 90Hz. Android display polling during the new app workloads records active mode 2, active render rate 60.000004Hz and presentation deadline 16,666,666ns. The panel can switch to 90Hz outside this workload. The relevant observed workload budget is approximately **16.67ms**, not automatically 11.11ms. Per-run display evidence is retained. Neither Dart's build/raster exceedance count nor a long totalSpan is a measured displayed-frame jank percentage.

## Repeatable methodology

1. Build the explicit QA probe target in Profile, then Release, with the same production-policy HTTPS defines and QA package/signing isolation. Flutter 3.44.0 / Dart 3.12.0; arm64 AOT. Renderer logs show Impeller selecting OpenGLES after Vulkan initialization. No renderer override was shipped.
2. Before every independent cold run, stop **only** the QA process. The probe empties only its own public catalog disk cache. This is process-cold + public-image-disk-cold; the OS filesystem/shader cache and device were not rebooted/reset.
3. Script the real customer bootstrap, guest home route, continuous scrolling (16 × 0.7 viewport / 300ms), fast scrolling (8 × 1.8 viewport / 120ms), product detail, return, category selection/reset, repeated image display, Arabic search and image invalidation. Fixed waits/debounce paths are identical across comparison runs. No new production feature flags or test data were introduced into normal startup.
4. Save raw FrameTiming values per stage: vsync timestamp, build duration, raster duration and total span. Flush batched timing delivery with a one-second wait. Save memory, HTTP body bytes and cache-source events separately. Script elapsed time includes waits; it is not user latency. First-card/image clocks start after TLS/control/cache preflight and are not Android native launch time.
5. Capture bounded 65-second Perfetto traces using sched/frequency/gfx/view/am/dalvik, targeted app ATrace, process stats and SurfaceFlinger FrameTimeline. Configuration is `benchmarks/phase3-1-perfetto.pbtxt`.
6. Profile-only VM service uses its normal authenticated loopback URL. Enable supported widget-build/layout/paint extensions during a 12-second QA-only pre-bootstrap wait. That wait is excluded from startup clocks. Widget tracing adds substantial overhead; Profile numbers are diagnostic, not Release acceptance numbers.
7. `--trace-systrace` routes Dart timeline events into Perfetto. As expected, `getVMTimeline` rejects a VM-buffer export with that recorder. Retain the actual Perfetto trace and the rejection artifact rather than labeling a nonexistent DevTools JSON export as captured. The first Profile result was recovered from the isolated server after this collector error; its display-polling series was not recoverable. Subsequent collectors save results before optional VM exports.
8. Analyze with the official Perfetto Python package 0.59.1 / pinned SHA-verified Windows trace processor. Tools were installed only in the existing QA tool location, not application dependencies.

Five cold Release runs were collected before changes, five candidate runs with a temporary navigation glow boundary (`after-*`), five post-boundary runs (`final-*`), and five retained-implementation runs including the category-revalidation correctness fix (`retained-*`). Only **before vs retained** is the final implementation comparison. The intermediate sets are preserved, not discarded or relabeled. This is a small, ordered, single-device sample, not randomized population evidence. Thermal/power observations, per-run P95 range/standard deviation, sample counts and raw frames are retained so variability is visible.

## Trace-supported findings and changes

### Confirmed redundant image work

The old stateless AppCatalogImage created a new filtered stream and a new completed `ensure()` Future on rebuild even when the list payload already contained the image manifest. The waiting/done transition rebuilt AppOptimizedImage again. Diagnostic trace before: 617 AppCatalogImage builds, 976 AppOptimizedImage builds. Candidate trace: 559 and 490 respectively. Workloads are not identical frame-for-frame, so these totals are descriptive, not a CPU percentage or an isolated timing speedup. The per-image waiting/completion duplication and its removal are supported by both the source lifecycle and timeline events.

Retained fix: a stateful, URL-aware lifecycle owns one manifest future/subscription, disposes it safely, and bypasses FutureBuilder for manifests already available. Unknown/legacy URLs still use the existing batch resolver. Changed manifests still update the visible image. Decode bounds, format fallback, semantics, cache namespace/limits and public interfaces remain unchanged.

### Confirmed detail-return page-window loss

Route focus revalidation previously called refresh(), replacing a deep loaded window with page one, re-laying out the grid and forcing pagination catch-up. All five baseline runs failed the probe's unchanged-data scroll-position check. The candidate runs preserve it.

Retained fix: a dedicated atomic revalidate() reads the previously loaded window through the existing cursor/read-cache client, deduplicates IDs, suppresses unchanged-state emissions, keeps the valid previous window on transient failure, and rejects stale completions when the filter changes. It stops at the current server end rather than retaining an unverified stale tail. Categories are also re-read through their existing use case/cache; a category-only change must not be suppressed just because cards are unchanged. A regression test covers this case. Only the home listener's background/focus revalidation uses it; explicit refresh still resets to page one. No purchase, stock, bid or authentication rules changed.

### Raster/presentation delay remains

Before Profile trace: 253 scrolling GPURasterizer::Draw slices average 16.288ms, maximum 43.591ms; eglSwapBuffers within that stage averages 7.621ms, maximum 33.540ms. Detail-return raster maximum is 70.220ms and swap maximum 63.674ms. This supports a substantial GLES submission/presentation waiting component, **not** proof that a particular widget or shader caused every late frame. Nested slice durations must not be summed as exclusive CPU time.

The same trace also contains layout bursts (Arabic-search LAYOUT maximum 70.855ms; category-switch maximum 82.340ms), widget churn and GC. Heavy per-widget tracing inflates these costs. Image decode/manifest widget work is not the sole bottleneck; no evidence justified moving small JSON/search work to another isolate, replacing the cache, disabling semantics, changing the design or renderer, or indiscriminately adding repaint boundaries.

A single targeted boundary around the static navigation beam was tested. It did not materially remove saveLayer activity (564 vs 542 calls across differing frame counts) or establish a raster benefit. **Rejected and reverted.** The original beam appearance and composition are retained. No broad clipping/shadow or grid virtualisation rewrite was made.

## Release before/after results

The generated comparison and all variance/count data are in `benchmarks/phase3-1/comparison.md` and `summary.json`. Each side has five Release samples per scenario. P50/P95 below are pooled raw-frame distributions, not percentiles of only five P95 values; run-level distributions are separately retained. Few-frame cache/invalidations stages should not be read as stable timing estimates. All values are milliseconds.

| Scenario | Before build P50/P95 | Retained build P50/P95 | Before raster P50/P95 | Retained raster P50/P95 |
|---|---:|---:|---:|---:|
| Initial catalog | 3.48 / 28.45 | 2.47 / 35.35 | 14.62 / 64.30 | 15.40 / 61.94 |
| Continuous scrolling | 0.78 / 16.14 | 0.74 / 15.72 | 12.65 / 30.03 | 12.92 / 28.16 |
| Fast scrolling | 4.84 / 30.02 | 2.97 / 28.88 | 11.90 / 24.44 | 11.94 / 28.51 |
| Detail navigation | 0.63 / 25.59 | 0.64 / 25.91 | 11.47 / 48.81 | 11.74 / 52.24 |
| Return to catalog | 0.71 / 16.66 | 0.70 / 9.07 | 16.83 / 51.03 | 17.30 / 54.48 |
| Category switch/reset | 4.48 / 39.18 | 2.10 / 42.48 | 10.95 / 26.82 | 11.27 / 23.86 |
| Image cache reuse | 4.74 / 5.47 | 5.23 / 6.39 | 11.58 / 28.89 | 11.57 / 30.77 |
| Arabic search/reset | 3.62 / 41.92 | 2.74 / 43.05 | 16.28 / 33.47 | 13.99 / 32.98 |
| Image invalidation | 2.10 / 14.58 | 2.05 / 15.96 | 12.35 / 29.66 | 12.25 / 31.38 |

**Acceptance failed.** Return build work and scroll restoration improved descriptively, but raster tails, Arabic-search build tails, initial build tails and several other cases did not reliably improve and some regressed. Do not claim an across-the-board speedup or a statistically established causal percentage. Continuous-scroll run raster P95 ranges overlap: before 27.15–31.61ms (SD 1.56), retained 24.46–31.91ms (SD 2.78). Search build P95 ranges are 22.76–56.70ms (SD 12.29) before and 29.02–52.77ms (SD 8.25) retained. Detail-return raster P95 remains 41.14–56.97ms. These do not consistently fit the observed 16.67ms budget.

All five retained runs preserved the unchanged-data scroll position, versus zero of five before. Mounted-card snapshots stayed at 16 rather than building the full dataset. First cards from the post-preflight customer entrypoint: before 501–578ms, retained 491–554ms; first decoded images after guest navigation: before 490–544ms, retained 444–478ms. These clocks are not native Android end-to-end launch times. Device battery remained 100% / AC powered, with battery temperature 23.6–23.8°C across the matched samples (not SoC temperature).

The atomic focus refresh has a deliberate tradeoff: detail-return HTTP calls increased from one to five per sample (approximately 3.8–4.0KB to 18.8–19.0KB encoded response bodies), because the already-loaded window is revalidated instead of discarded. This restores correctness but is **not a network optimization**; very deep loaded windows can cost proportionally more requests. That cost needs staging evaluation before release. Explicit filter/search transitions still incur layout bursts and remain a performance risk.

### Memory and transfer observations

Across measured stage snapshots, Dart process RSS is 198.07–233.08MiB before and 197.94–233.48MiB retained. Decoded-cache contents are 16.86–24.10MiB in both sets, below the unchanged 64MiB cap. Continuous-scroll median RSS is 199.59MiB before / 198.35MiB retained. This is not a peak-memory measurement or proof of leak freedom; later Android PSS/RSS snapshots are retained separately in `*-meminfo.txt` and must not be equated to Dart RSS.

Continuous scrolling made seven HTTP requests per sample, including three image GETs, about 54,462–54,466 encoded body bytes. Arabic search made one request and zero image GETs per sample. Actual observer decisions during scrolling are 400 decoded-memory hits / 420 resolutions = **95.24%**, with 15 misses and five already-pending reuses, in both five-run sets. Search resolutions are 80/80 memory hits in each set. These are stage/workload-specific denominators, not a global application cache efficiency claim. The deliberately cold successful file lookups are network-first, not disk-first hits; failures from old fixtures remain separately reported.

## Cache instrumentation and denominator definitions

The optional observer is null in normal app entrypoints. When enabled by the QA probe:

- ImageProvider resolution observes the **same underlying decoded-cache key**. Resolution decisions are memoryHit, memoryMiss or pendingReuse (already in-flight deduplication). Rate = memoryHit / all three decisions; pending reuse is reported separately, not mislabeled a decoded hit.
- The existing cache manager observes actual FileInfo.source: first Cache result = diskHit; first Online result = networkLoad; a subsequent online result = revalidationResult. Disk-first hit rate = diskHit / (diskHit + networkLoad) for first-source successes. Failed/empty/incomplete streams are separate. Failure and incomplete events overlap; do not add them as two failed loads.
- File-source rates are conditional on a cache-manager lookup. Memory hits never enter that denominator. Original/private URLs remain non-persistent and are not silently included in disk rates.
- HTTP status/body-byte counts validate the transport but are not used to infer cache hit rates. Encoded HTTP body bytes exclude TLS/TCP/header overhead.
- The observer preserves image keys/provider equality and stream data/errors. Existing public hashed variant URL selection remains unchanged. No extra cache layer was added.

Cold, warm process-restart, explicit decoded-cache eviction, four concurrent resolutions, targeted file eviction and stale-file revalidation are tested separately. A successful URL change assertion is not by itself proof of decoded pixels: the comparison probe checks changed URL presence plus decoded catalog images generally; the separate extended coverage target strengthens this to a decoded RawImage specifically under the expected changed-image URL. The reserved fixture-image switch can legitimately hit memory after earlier QA runs because another old fixture references the same versioned asset. Extended coverage also corrects the probe's screen assertion to the actual dedicated AuctionGridTile class (the mixed home uses AppCommerceCard). These coverage-only assertion changes do not change production UI/business code or get retroactively described as part of earlier timing APKs.

### Old disposable fixture limitation

For a strictly identical before/after workload, the comparison probe selects the first pre-existing QA category. That category contains earlier disposable media references from an old MinIO bucket. Each comparison run records two failed variant-file loads; these are **not** passed off as successful cache loads or zero-error browsing. This constrains interpretation of category timings. A separate coverage run explicitly resolves the freshly created product's category and validates the fresh media/active-auction/pagination paths, without deleting old records or mutating a protected database to repair fixtures. A clean isolated staging dataset is still required.

### Completed physical cache and fresh-fixture checks

Evidence: `retained-warm-1.json`, `retained-coverage-1.json` and their raw trace/HTTP/cache-source artifacts.

| Check | Observed result |
|---|---|
| Process restart persistence | Previous QA PID 21243 → new PID 21679; clearDisk=false. Initial catalog: seven memory misses, seven cache-manager lookups, **7/7 disk-first hits**, no image HTTP GET; scrolling adds **3/3 disk-first hits**, also no image HTTP GET. This directly verifies persisted bytes/metadata in a new process. |
| Repeated decoded display | Four repeated resolves in the normal reuse stage are memory hits; search has zero image HTTP GETs. |
| Forced decoded eviction + concurrent reuse | Four concurrent resolves produce one miss + three pending reuses, one file lookup, one disk hit, no image network request. |
| Targeted disk eviction | One decoded miss, one file lookup/network response, one successful WebP GET, 20,836 body bytes. Only the exact QA URL was evicted. |
| Cold network deduplication | Across the five retained cold startup runs: eight actual image resolutions per run, six/seven misses with two/one pending reuses respectively, matching six/seven network-first file loads. Shared in-flight image keys do not initiate a second file load. The four-resolve controlled test above is specifically disk-backed deduplication, not mislabeled a cold-network test. |
| Revalidation | A known QA cache entry was deliberately made stale with identical bytes. Observer: one disk-first result followed by one revalidation result. HTTP was **200 / 20,836 bytes**, not 304. Conditional-304 behavior was not verified and is not claimed. |
| Variant selection | Observed public hashed `-catalog.webp` requests with immutable cache headers; decode bounds and original/JPEG fallback are also covered by automated tests. |
| Changed image | Extended run verifies a decoded RawImage specifically under the expected new original-reference URL, without clearing the whole cache. |
| Pagination on the physical app | Fresh category `cmwntdhee0001vtb0frsc4nmy`: **51 pages, 1,020 distinct entries: 1,000 fixture products + 20 currently active auctions**, no duplicate identifiers, terminal hasMore=false. All 1,000 product IDs are retained in the raw artifact. |
| Arabic normalization | Diacritized and normalized Arabic queries produce equal ordered first-page ID lists through the real app Cubit/API. |
| Active auction UI | Dedicated auction screen loads actual AuctionGridTile widgets and decoded images. Follow-up screenshot after a normal scroll visibly shows active countdowns (~23h remaining), IQD 10,000 prices, zero bids and the existing bid buttons. No bid or purchase was submitted by this browsing probe. |

The warm/detail stage legitimately fetched a different uncached detail variant after the fixture's image-reference toggle; warm does not mean that every possible URL is already cached. These are controlled cache correctness checks, not additional five-run smoothness distributions. [Active auction cards](benchmarks/phase3-1/active-auction-cards.png), [auction screen](benchmarks/phase3-1/active-auction-screen.png).

## Android presentation metrics and limits

Perfetto FrameTimeline on this OEM build exposes only a few launch transaction/layer slices for this package (process names can remain zygote64 in the trace; analysis joins the recorded PID). It does not supply a complete Flutter SurfaceView frame denominator. Reporting those five transaction slices as the application's jank rate would be wrong.

SurfaceFlinger --latency is separately sampled where available. It supplies presentation timestamps/refresh period, not a root-cause jank classification. Script pauses and stationary screens produce long gaps that must not be counted as dropped animation frames. Supplemental capture results are reported separately from the matched benchmark runs so additional polling overhead is not hidden. Native HWUI statistics are not substituted for Flutter raster statistics.

Supplemental warm run: 26 snapshots / 491 unique presentation records. Continuous-scroll window: 277 records, desired-to-actual presentation P50 **35.45ms**, P95 **54.12ms**. Extended run: 35 snapshots / 582 records; scrolling 266 records, P50 **34.09ms**, P95 **56.87ms**. This measures presentation latency from SurfaceFlinger timestamps, **not** build/raster time or a jank rate. Window association uses the shared monotonic timebase, not a claimed one-to-one engine frame mapping. The latency dumps also expose 16,666,666ns and 20,833,333ns periods (60/48Hz dynamic/idle behavior), so supplemental runs are not treated as fixed-60Hz acceptance samples. All inter-present P95 gaps include intentional scripted pauses and are not converted to a dropped-frame percentage. [AOSP FrameTracker column definitions](https://android.googlesource.com/platform/frameworks/native/+/master/services/surfaceflinger/FrameTracker.cpp) support this interpretation. Data/analysis: `*-surface-latency.json`, `surface-summary.json`, `scripts/phase3-1-surface-summary.cjs`.

## Regression validation and security

- Backend current local unit suite: 155 passed / 21 suites.
- Current local e2e command: 6 passed, 21 skipped / 27 declared; DB-dependent suites were not enabled against the shared fixture database. The previous Phase 3 DB-e2e evidence is historical, not reclassified as newly run.
- Restarted isolated fixture server executed eight real transaction assertions: wallet debit/replay, COD no wallet debit, insufficient-balance rollback, final-unit concurrency, bid 10% reservation/insufficient funds, automatic winning-order COD deposit, remainder-payment replay safety and shipped-payment lock.
- Customer suite: 166 passed, including three new atomic-revalidation/category/race/failure tests and existing buying, bid, payment, account-deletion, guest, order, Arabic and responsive checks. Machine events: `benchmarks/phase3-1/customer-tests.jsonl`.
- Admin suite: 139 passed. API client suite: 20 passed. Shared UI suite: 18 passed, including the known-manifest/URL reuse regression; one optional native image benchmark skipped (not a hardware-performance test).
- Targeted analyzer: no issues after lifecycle/probe lint fixes. Full final test evidence/any later deviations are recorded in the appended results.

The dependency security changes from Phase 3 were left intact. The documented three production high findings in the MinIO/query-string/decode-uri-component chain **remain unresolved** and need a compatible reviewed remediation or release-owner risk acceptance. No incompatible override was forced. No claim of a new dependency advisory scan is made by this rendering task.

## Exact task-source changes

In AboEssaMobile:

- `apps/customer_app/android/app/build.gradle.kts`: same-key Profile updates for the explicitly isolated QA package only.
- `apps/customer_app/lib/validation/phase3_catalog_probe.dart`: stages/raw timings/cache observations/controlled local coverage; normal main is untouched.
- `apps/customer_app/lib/features/marketplace/presentation/bloc/customer_marketplace_cubit.dart`: atomic focus revalidation.
- `apps/customer_app/lib/features/marketplace/presentation/pages/customer_marketplace_page.dart`: distinct focus revalidation callback.
- `packages/shared_ui/lib/src/components/app_catalog_image.dart`: stable URL/manifest lifecycle and observed existing cache manager.
- `packages/shared_ui/lib/src/components/app_optimized_image.dart`: optional passive provider observation, same decode policy.
- `packages/shared_ui/lib/src/components/catalog_image_diagnostics.dart`: new opt-in observer.
- `packages/shared_ui/lib/shared_ui.dart`: observer export.
- `apps/customer_app/test/phase_c_customer_marketplace_test.dart`, `packages/shared_ui/test/catalog_image_diagnostics_test.dart`, `packages/shared_ui/test/app_optimized_image_test.dart`: new regression/key compatibility/lifecycle cases.

In AboEssa: this report, the linked follow-up/status addition in the earlier readiness report, benchmark artifacts/config and `scripts/phase3-1-device-profile.cjs`, `phase3-1-analyze-trace.py`, `phase3-1-summarize.cjs`, `phase3-1-surface-summary.cjs`, `phase3-1-evidence-manifest.cjs`. The temporary beam edit has no retained diff. Existing unrelated dirty worktree changes were preserved.

Artifact identity (SHA-256): before Release `20bf87d04b0f34ecbb539aa86497cb8f1b564266185eff316a8bcd8062de6421`; retained Release `6ebc4230e82bcb87cd0958da0b30a19241f91ac6af1fccd627e8759b48577f12`; extended-assertion Release `9393a46d6aba0928bb2745c7a019514ecb8abf7eb13462e36733844cef4f3481`. All are private QA-signed APKs, **not Play-upload artifacts**. Complete hashes and snapshots are retained locally; private keys/CA defines were not copied into the repository. The extended APK differs in QA assertions only; it is not substituted into the retained timing comparison.

`benchmarks/phase3-1/evidence-manifest.json` records artifact/APK/dependency-file hashes. Raw traces are intentionally retained and are large; they were not staged, committed or pushed automatically. Some traces report one to four negative-timestamp packets dropped by the trace sorter; error stats are retained in the analysis JSON. Exact lossless OS-event coverage is not claimed, and the raw Flutter FrameTiming samples are a separate source. Successful Release builds still warn about future Flutter built-in-Kotlin migration for the app/plugins; that tooling debt was not addressed with unrelated upgrades here.

## Reproduction

Use the existing `REZONA_IMAGE_QA=1` loopback-only fixture server and TLS proxy with their documented QA ports. Recreate the short-lived private certificate through the same authorized QA procedure if expired. Keep the CA/key/keystore outside the repository; never use production keys. Both Android manifest and Dart validation guards must remain enabled.

Build QA with `REZONA_PHASE3_VALIDATION=1`, complete QA signing environment, `flutter build apk --release --no-pub --target-platform android-arm64 -t lib/validation/phase3_catalog_probe.dart --dart-define-from-file=<private-QA-defines-file>`. That defines file must retain APP_ENV=production and the private HTTPS origin. Profile builds use --profile and the same key/package. Attach using Flutter's supported authenticated VM service flags; do not disable service authentication.

Collector examples: `node scripts/phase3-1-device-profile.cjs before-release-1`, `retained-release-1`, `retained-warm-1`, `retained-coverage-1`. It acts only on the hard-coded QA package and hard-coded isolated loopback service. Profile runs wait for a fresh Flutter VM-service file; remove only that exact task-owned stale file before attaching. Run `phase3-1-analyze-trace.py <trace> <analysis.json> <recorded-PID>` with the official Perfetto package, then `node scripts/phase3-1-summarize.cjs`. Enable supplemental SurfaceFlinger polling with REZONA_CAPTURE_SURFACE=1 only on separately reported runs.

Tooling references: [Flutter performance profiling](https://docs.flutter.dev/perf/ui-performance), [Perfetto FrameTimeline](https://perfetto.dev/docs/data-sources/frametimeline), [official Trace Processor Python API](https://perfetto.dev/docs/analysis/trace-processor-python). The Profile CPU-service export contained zero samples because the initial collector queried a time window unrelated to the device's monotonic clock. It is not used for function attribution. The collector now queries the VM's current timeline clock; the trace-supported conclusions above rely on the actual Perfetto data, not that empty sample export.

## Remaining gates / next actions

1. Rendering acceptance remains blocked if the final repeated critical build/raster P95 values exceed the observed display budget. Do not replace that failure with an unsupported displayed-jank percentage. Next targeted investigation should separate GLES draw/submission/fence waiting from layout and compare render-backend hypotheses only in isolated QA with visual parity checks.
2. Repeat on a clean, reachable isolated staging endpoint over real Wi-Fi and mobile WAN. ADB reverse does not satisfy either gate. Re-run active auction/media coverage with a clean fixture category and correctly retained bucket assets.
3. Review MinIO high findings; obtain compatible remediation or explicit owner risk acceptance. Profiling does not approve security risk.
4. Re-run the existing staging migration/backfill/rollback and old-app compatibility checklist from the Phase 3 report against the actual staging candidate. No new schema migration was added in Phase 3.1. Keep image optimization/old endpoints rollback-compatible; do not drop original media or Phase 3 indexes during an app-only rollback.
5. Repeat relevant DB e2e suites in their own authorized disposable test database, not the shared device fixture database. Perform release visual QA and presentation-level capture when supported before declaring smoothness.

**No release authorization is implied. Stop after this validation; do not start Phase 4 or deploy.**
