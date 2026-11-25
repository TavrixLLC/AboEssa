# REZONA — Phase 3 pre-production readiness review

**Phase 3.1 follow-up, 2026-11-19:** repeated physical Profile/Release tracing and cache/active-auction coverage are now documented in [the performance validation report](rezona-phase-3-1-performance-optimization.md). Five retained Release samples per scenario still fail rendering acceptance; status remains **NO-GO**. The original one-session metrics below remain historical and are not overwritten by the new methodology.

Client date: **2026-11-18**. Scope: current dirty local repositories. **No production deployment, GitHub push, app-store submission, or Phase 4 work.**

Machine-readable evidence/status: [catalog-preproduction-status.json](benchmarks/catalog-preproduction-status.json).

**Historical earlier handoff, 2026-11-19 (superseded by the successful corrected run below):** the first USB attempt was rejected and the original QA installer was copied to Downloads for manual installation. That original local-mode release subsequently failed startup and is obsolete. Disk headroom was restored (56.39 GiB C / 70.06 GiB D observed). Security counts below remain the dated 2026-11-18 snapshot, not a fresh 2026-11-19 audit.

Final npm audit refresh completed on **2026-11-18 15:40:01 UTC**; counts remained 12 production / 61 full-tree entries with zero critical findings. Audits exit nonzero because the documented residual findings remain.

## Latest physical-device follow-up — 2026-11-19

**The startup failure is fixed in the isolated validation release, not a production deployment.** The first manually installed probe used `APP_ENV=local` in release. The unchanged production startup guard in `customer_di.dart` deliberately rejects that combination before dependency initialization, explaining the shown failure screen. The physical report confirmed `release=true` with a failed bootstrap. The earlier successful build was therefore not a successful runtime test.

Correction: rebuilt with `APP_ENV=production`, HTTPS for API/socket, and a single explicitly trusted seven-day local QA certificate. Added a loopback TLS facade at port 58445 over the existing isolated API. Certificate-chain and hostname validation remain enabled; default trust rejected the test certificate and explicit QA trust returned authorized HTTP 200. No trust-all callback, TLS bypass, production guard exemption, authentication or business-transaction change. Both validation and ordinary Android manifests now prohibit cleartext.

New artifact: `D:/rezona-phase3-validation-20261117/rezona-phase3-qa-https-20261119.apk`, SHA-256 `34022e9f640ca285f62715e516c93860046af7f2cdfe42c2bf72f7731cc12181`, package `com.tavrix.aboessa_customer_app.phase3qa`, visible label **ريزونا — اختبار**. Same temporary QA signing key, **not for store distribution**. Installed successfully via a normal ADB update; original customer package/data untouched. The earlier `257c5b78...` probe is obsolete and must not be reused.

Observed the real home screen and loaded images on the tablet; scripted scrolling, detail/back, Arabic search and image invalidation completed with `finished=true`. [Screenshot](benchmarks/catalog-device-screen-20261119.png), [raw failed/successful reports](benchmarks/catalog-device-usb-release-20261119.json).

This is **one USB/ADB-reverse release smoke sample**, not Wi-Fi/cellular measurements or repeated cold/warm distributions. Scenario reported `clearDisk=false`; do not advertise it as a controlled cold-disk-cache benchmark. Existing seeded QA auctions had expired, so this sample validates product browsing, not an active-auction screen.

Observed timing boundaries: Android activity launch reported 807ms (wait 881ms); first product-card frame readiness was 1,296ms from `customer.main` **after** probe TLS/cache preflight, and first image frame readiness 783ms after scripted guest navigation from Welcome. These are different clocks and must not be summed or called full process-to-catalog startup latency.

| Phase | Flutter frames | Build P95 ms | Raster P95 ms | Build-or-raster over budget | Dart RSS snapshot MiB | Encoded HTTP body bytes |
|---|---:|---:|---:|---:|---:|---:|
| initialCatalog | 79 | 9.726 | 26.484 | 20 | 240.8 | 121,797 |
| scroll | 275 | 13.830 | 28.589 | 169 | 213.1 | 27,694 |
| returnFromDetail | 20 | 12.871 | 52.868 | 10 | 215.7 | 37,988 |
| arabicSearch | 44 | 34.705 | 26.318 | 35 | 234.8 | 51,205 |
| imageInvalidation | 4 | 10.746 | 17.030 | 1 | 230.5 | 25,219 |

Display API reported 90Hz, so the probe used an 11.11ms build/raster budget. These are **frame-budget exceedances, not a system-presented-frame jank percentage**. Scroll raster P95 was 28.589ms and search build P95 34.705ms. Even allowing for instrumentation/cold shader work and refresh-rate policy, this does **not** establish smooth-scrolling acceptance. Obtain a repeatable profile trace and actual display-mode evidence before concluding cause or readiness. Do not hide this failed performance gate.

Decoded-cache snapshots grew from about 18.5 to 24.1 MiB, below the configured 64 MiB evictable-cache setting; this does not prove absence of a process-memory leak. A later Android snapshot reported total PSS 194,134 KiB, total RSS 332,700 KiB and swap PSS 388 KiB. These are different measurements/times from Dart RSS. Device battery 100%, AC powered, temperature 23.6°C.

HTTP counters describe response bodies, not radio/TLS/header overhead. Image request counts across initial/scroll/detail-back/search/invalidation were 8/1/1/0/1. No cache-source denominator is instrumented, so no hit-rate is claimed. Process-restart disk persistence and warm-start measurements remain pending.

Four new configuration guard tests reject local-release settings, HTTP API/socket URLs, non-QA origins, misleading hostnames and missing opt-in. Full customer suite **163 passed**, analysis clean. Other previously verified suites remain dated 2026-11-18; aggregate evidence is now **533 cases** (previous 529 + four new customer configuration tests), not a fresh rerun of every backend suite.

The initial combined fixture-renewal/restart command was blocked by execution policy and was not executed; no alternative DB mutation or force-stop bypass was attempted. The subsequent normal activity launch was permitted. The expired auctions remain a documented coverage limitation.

The app-opening problem and USB-install blocker are resolved. **Overall decision remains NO-GO**: observed frame-budget overruns, repeated/device cache tests, real Wi-Fi/mobile WAN, active-auction UI, staging/security/signing gates are still open. No Phase 4 or production deployment.


## Decision: NO-GO for production / validation incomplete

Security remediation and automated regression validation are substantially verified. A corrected physical release smoke succeeded, but repeated cold/warm/cache and active-auction validation, real Wi-Fi/mobile-WAN benchmarks, investigation of the observed frame-budget overruns and owner acceptance/remediation of retained dependency risks are **not** complete. Do not approve Phase 4 or release based on this report alone.

The user selected the connected Redmi Pad SE. Initial USB installations were rejected, then manual installation succeeded but exposed the invalid local/release build configuration. The corrected production/HTTPS QA release installed normally and completed the USB smoke run described above. No bypass, original-app replacement or account clearing was performed. No dedicated internet-accessible staging endpoint was supplied; the local QA API is loopback-only. ADB reverse is a useful device baseline, **not** a Wi-Fi/cellular benchmark.

### Evidence summary

| Area | Verified | Remaining gate |
|---|---|---|
| Production npm tree | 28 vulnerable package entries → **12**; critical **1 → 0**, high **14 → 3**, moderate 12 → 9, low 1 → 0 | Three inherited high entries in MinIO/query-string/decode remain; explicit risk disposition required |
| Full npm tree | 82 entries → **61**; critical **2 → 0**, high 59 → 44, moderate 20 → 17, low 1 → 0 | Development-only glob/picomatch/minimatch graph retained; no safe patched picomatch release at review |
| Backend tests | **155 unit tests / 21 suites; 27 e2e tests / 7 suites**, all passed, DB suites enabled | Staging infrastructure and actual external FCM delivery |
| Flutter tests | **351 cases in aggregate**; customer 163 re-run on Nov 19, other 188 verified Nov 18 | Repeatable physical profile/release observations |
| Real HTTP transactions | Eight isolated purchase/wallet/auction/order/stock assertions passed | No external bank/card gateway funding is implemented or claimed tested |
| Real catalog HTTP | 1,000 distinct cards / 25 pages; Arabic normalization, legacy response, cursor scope, hidden-item stability, changed image/immutable WebP verified | Same paths on the actual tablet, old distributed binary and public staging |
| Linux | Build and real HTTP boot passed; native Sharp and Argon2 passed; runtime excludes Jest/Handlebars/Picomatch | OS/base-image vulnerability scan not performed |
| Android release | Corrected QA target installed and passed a product smoke; ordinary `lib/main.dart` built/manifest inspected; cleartext=false in both | Production signing/store artifact and full ordinary binary validation |
| Device/network measurements | One physical USB/HTTPS product smoke sample with frame/RSS/body-byte evidence; startup corrected | Repeated cold/warm/cache and active-auction tests; genuine Wi-Fi/mobile WAN; frame-budget overrun investigation |

Total aggregate automated cases: **533 passed** (155 backend unit + 27 e2e + 351 Flutter, across dated runs), plus the eight live transactional checks and six live catalog assertions. They are not 529 physical-device tests.

## 1. Security review method and artifacts

The prior “28 advisories” is npm's **28 vulnerable package entries**, including propagated parent findings, representing **32 unique GHSA identifiers** in the production tree. The complete developer tree initially had 82 package entries / 60 unique GHSA identifiers. Do not count propagated parents as independent exploitable endpoints.

Snapshots:

- [Before: production](security/phase3-audit-before-production.json)
- [Before: full installation](security/phase3-audit-before-full.json)
- [Affected installed versions before](security/phase3-affected-versions-before.json)
- [After: production](security/phase3-audit-after-production.json)
- [After: full installation](security/phase3-audit-after-full.json)
- [Affected installed versions after](security/phase3-affected-versions-after.json)

Reviewed each production finding's installed path, parent chain, affected range, suggested fix, actual call sites and exposure. Compared production/development/optional flags. Inspected upstream advisories, registry metadata and module exports. The reports contain package metadata, not production secrets.

No `npm audit fix --force` or global dependency upgrade was executed. Changes were selected in `package.json`, installed without lifecycle scripts initially, then verified through normal Prisma/build/test and clean Linux `npm ci` stages.

### Critical findings

- **Production proxy-addr:** [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), fixed in 2.0.8. The vulnerability needs specific incorrectly expressed IPv4-mapped IPv6 trust subnets. This app currently configures numeric `TRUST_PROXY_HOPS`, not those subnet strings. This reduces current exploitability; it does not justify retaining the vulnerable package. Patched it and tested that the short mapped subnet does not trust arbitrary IPv4, while correctly written subnets still work.
- **Development Handlebars:** 4.7.9 → 4.7.10 fixes the development-only injection findings, including [GHSA-8r5x-fm3f-whwj](https://github.com/advisories/GHSA-8r5x-fm3f-whwj) and [GHSA-p8wg-vrv2-v86f](https://github.com/advisories/GHSA-p8wg-vrv2-v86f). No untrusted template compiler is exposed by this API. Also verified Handlebars is absent from the final Linux runner.

### All 28 original production entries

All rows below are in the **production dependency tree**. “Optional” still means installed by the current default runner install, not automatically safe or absent. “Resolved” means absent from the new audit, with the relevant package path tested; it is not a blanket security certification.

| Package | Initial severity / relationship | Installed before → after | Audit status | Exposure, fix and compatibility assessment |
|---|---|---|---|---|
| `@fastify/busboy` | high; transitive | 3.2.0 → 3.2.2 | RESOLVED | Firebase Admin multipart support, not our inbound Multer parser. Updated 3.2.0 → 3.2.2 (fixes both high DoS and CRLF advisories); no application API change. |
| `@google-cloud/firestore` | moderate; transitive; optional | 7.11.6 → 7.11.6 | RETAINED | Optional Firebase dependency, installed in runner but not used: application imports only firebase-admin/app and messaging. Inherited uuid/retry chain remains. Parent remediation firebase-admin 14.5.1 is a major update; defer until FCM/staging validation. |
| `@google-cloud/storage` | moderate; transitive; optional | 7.22.0 → 7.22.0 | RETAINED | Optional Firebase storage dependency, unused by this application's MinIO provider. Inherited retry/uuid chain remains; parent Firebase 14.5.1 major update not forced. |
| `@grpc/grpc-js` | high; transitive; optional | 1.14.4 → 1.14.5 | RESOLVED | Optional Firestore/gax dependency. No gRPC server or getAuthContext authorization exists in this application; patched 1.14.4 → 1.14.5 anyway. The low error-message leak advisory is fixed too. |
| `@nestjs/platform-express` | high; direct | 11.1.28 → 11.2.10 | RESOLVED | Inbound uploads use Multer. Upgraded the coherent Nest 11 runtime/testing family 11.1.28 → 11.2.10; its exact Multer is 2.5.0. Remains Nest 11, no Nest 12 migration. |
| `@nestjs/swagger` | moderate; direct | 11.4.7 → 11.4.8 | RESOLVED | Development Swagger/OpenAPI generation can parse YAML; production Swagger defaults off. Updated within Nest Swagger 11 to 11.4.8, which pins js-yaml 5.5.0. |
| `@prisma/config` | high; transitive | 6.19.3 → 6.19.3 | RESOLVED | Prisma CLI/configuration package, shipped because migrations run in the runner, not an HTTP input path. Scoped deepmerge-ts 7.1.5 → 8.0.0 override is deliberate (major). CommonJS merge contract, generate, build and fresh migrations verified. |
| `body-parser` | high; transitive | 2.3.0 → 2.4.0 | RESOLVED | Default Nest/Express JSON parser is reachable before authentication. Compressed malformed body DoS applicable; patched 2.3.0 → 2.4.0. New qs dependency also patched. HTTP and transaction tests passed. |
| `compression` | high; direct | 1.8.1 → 1.8.2 | RESOLVED | Enabled globally; aborted compressed responses could leak native zlib memory. Applicable production path; patched 1.8.1 → 1.8.2, same API, real Linux HTTP exercised. |
| `decode-uri-component` | high; transitive | 0.2.2 → 0.2.2 | RETAINED | Unresolved high: 0.2.2 remains through query-string 7.1.3 / MinIO. Fix 0.5.1 is ESM; isolated CommonJS substitution produced TypeError: decodeComponent is not a function. MinIO calls stringify, not query parse/decode, in inspected code. Provider only uses generated bounded keys and bucket/get/put/stat/remove. Low current reachable risk, not zero; upstream-compatible remediation/SDK migration and explicit acceptance required. |
| `deepmerge-ts` | high; transitive | 7.1.5 → 8.0.0 | RESOLVED | Patched to 8.0.0 only beneath @prisma/config. Trusted local configuration graphs only, not customer JSON; avoids unsafe recursive-graph handling. Deliberate transitive major override tested against normal Prisma config/migrations. |
| `engine.io` | high; transitive | 6.6.9 → 6.6.10 | RESOLVED | Unauthenticated Socket.IO handshake parser is exposed. Patched 6.6.9 → 6.6.10. Linux invalid-EIO handshake returned 400 and subsequent /health stayed 200. |
| `fast-xml-parser` | low; transitive | 5.10.1 → 5.12.1 | RESOLVED | Parses trusted MinIO service XML, not a public XML upload. Updated within major 5 to 5.12.1. Fixed branch is >5.11.2; local storage/upload/backfill and Linux API verified. |
| `firebase-admin` | moderate; direct | 13.10.0 → 13.10.0 | RETAINED | Only app initialization and FCM messaging used; no Firestore/storage APIs or attacker-supplied uuid buffer. Inherited moderate Google SDK/uuid findings remain. Suggested 14.5.1 is a major version; no real FCM credentials/network delivery were tested, so no blind upgrade. |
| `gaxios` | moderate; transitive; optional | 7.3.1, 6.7.1 → 7.3.1, 6.7.1 | RETAINED | Optional Google SDK transport; uuid advisory concerns v3/v5/v6 with supplied output buffers, not normal request-ID v4 usage. Inherited moderate risk retained; resolve with supported Firebase/Google SDK upgrade after live FCM staging test. |
| `google-gax` | moderate; transitive; optional | 4.6.1 → 4.6.1 | RETAINED | Optional unused Firestore transport. Inherited uuid/retry findings, not a public app server. grpc-js high finding fixed separately. Parent Firebase 14.5.1 major remediation deferred. |
| `joi` | high; direct | 17.13.4 → 17.13.9 | RESOLVED | Used for trusted startup environment validation, not arbitrary customer-defined schemas. Patched 17.13.4 → 17.13.9 within major 17 (all five listed advisories), startup/config tests passed. |
| `js-yaml` | moderate; transitive | 3.15.0, 5.3.0, 4.3.2 → 3.15.2, 5.5.0, 4.3.2 | RESOLVED | Swagger's production-tree js-yaml 5.4.0 → 5.5.0. No arbitrary public YAML import. Developer copies updated in their compatible branches too; all js-yaml findings disappeared. |
| `minio` | high; direct | 8.0.7 → 8.0.7 | RETAINED | Unresolved inherited high through query-string/decode and moderate through stream-json. Latest MinIO remains 8.0.7. npm suggests a downgrade to 7.1.3, not a compatible patched 8.x update. No blind downgrade or ESM/stream major override. Current provider never parses user query bodies nor opens notification JSON streams; retain as explicit risk requiring review. |
| `multer` | high; transitive | 2.2.0 → 2.5.0 | RESOLVED | Real authenticated multipart upload parser. All reported upload DoS/limit/abort advisories fixed by 2.5.0 through Nest 11.2.10. File/field/size caps retained; corrupt/MIME/oversize/normal upload integration passed. |
| `prisma` | high; direct | 6.19.3 → 6.19.3 | RESOLVED | CLI 6.19.3 retained along with @prisma/client 6.19.3. Inherited config finding removed by scoped deepmerge override; no Prisma 7/8 migration or schema rewrite. |
| `proxy-addr` | critical; transitive | 2.0.7 → 2.0.8 | RESOLVED | Critical IP-spoofing advisory patched 2.0.7 → 2.0.8. Current application uses numeric TRUST_PROXY_HOPS, not vulnerable IPv4-mapped subnet strings; remote exploit prerequisites not present in inspected config. Tests still verify the malicious subnet no longer trusts arbitrary IPv4 and correct subnet behavior remains. |
| `qs` | moderate; transitive | 6.15.3 → 6.16.1 | RESOLVED | Patched 6.15.3 → 6.16.1. Express/body-parser parser chain can see user input; also resolves stringify advisory even though this app does not use comma-format stringify on customer objects. JSON/auth/API regressions passed. |
| `query-string` | high; transitive | 7.1.3 → 7.1.3 | RETAINED | Unresolved inherited high via decode 0.2.2. Current MinIO code only calls stringify; grep found no parse/decode call in its provider paths. New query-string majors change ESM/export APIs; require supported SDK update or a separately maintained/tested patch, not unverified override. |
| `retry-request` | moderate; transitive; optional | 7.0.2 → 7.0.2 | RETAINED | Optional Google Cloud storage/gax retry helper; inherited teeny-request/uuid moderate issue. No direct customer-controlled buffer API. Defer supported Google SDK parent upgrade; restrict FCM use to trusted service configuration. |
| `stream-json` | moderate; transitive | 1.9.1 → 1.9.1 | RETAINED | Unresolved moderate: 1.9.1 → fixed 3.6.0 would be a major parser API/module upgrade. MinIO imports its JSONL notification parser but this provider never calls listenBucketNotification. JSONC/filter paths also unused. Low reachable risk in present feature set; do not add notification parsing until remediated. |
| `teeny-request` | moderate; transitive; optional | 9.0.0 → 9.0.0 | RETAINED | Optional Google transport helper. Inherited uuid moderate issue; no use of affected uuid output-buffer APIs from application code. Parent SDK upgrade needs FCM validation. |
| `uuid` | moderate; transitive; optional | 9.0.1 → 9.0.1 | RETAINED | 9.0.1 remains in optional Google transport graph. Fixed 11.1.1; affected functionality v3/v5/v6 with an external buffer is not used by the app (Node crypto.randomUUID used for own IDs). Retain explicit moderate risk rather than force a cross-major Google override. |

### Why the remaining MinIO high finding was not force-fixed

There are three high package entries but one dependency chain: `minio 8.0.7 → query-string 7.1.3 → decode-uri-component 0.2.2`.

The patched decoder 0.5.1 was installed **only in a disposable compatibility directory on D**. On Node 24 its CommonJS `require()` returns a module object with a default export; query-string 7 calls that import as a function. A process-local substitution test failed with **`TypeError: decodeComponent is not a function`**, even for a normal Arabic query. This is actual compatibility evidence, not an assumption from the “type: module” field. That override was **not** applied to the application.

The inspected MinIO code uses query-string **stringify**, not parse/decode, and this application's storage provider only uses bucket checks/create, put/get/stat/remove with generated bounded keys. The JSONL notification parser is imported by the SDK but never used through this provider. Thus the known attack inputs have no identified reachable application path today. Residual risk: future SDK feature use, compromised storage service, or an overlooked call path. This is a lower contextual risk, **not “fixed”**. Require documented acceptance by the security/release owner or a supported, tested SDK remediation before green approval. Do not enable presigned-query parsing or bucket notifications until revisited.

### Remaining development-only findings

The remaining full-tree-minus-production graph contains **49 package entries**. Their high findings propagate chiefly from [unpatched Picomatch ReDoS](https://github.com/advisories/GHSA-fc5q-39xc-vjpf); the advisory lists no patched version at review. Minimatch's fix requires a new major; Glob's cancellation/traversal finding also remains. No Jest downgrade, Nest CLI 12 migration, or broad matcher override was forced merely to obtain a green audit.

These tools consume trusted repository/build patterns, not public API glob patterns. Run CI in isolated, resource-limited jobs with bounded timeouts and do not pass attacker-supplied glob expressions/template ASTs into build tools. Review untrusted PRs before privileged builds. This mitigates contextual risk but does not patch those packages. The final runner was checked: `require.resolve('picomatch'|'handlebars'|'jest')` failed for all three.

| Retained non-production package | Severity | Propagation / advisory |
|---|---|---|
| `@angular-devkit/core` | high | `picomatch` |
| `@angular-devkit/schematics` | high | `@angular-devkit/core` |
| `@angular-devkit/schematics-cli` | high | `@angular-devkit/core`, `@angular-devkit/schematics` |
| `@jest/console` | high | `jest-message-util`, `jest-util` |
| `@jest/core` | high | `@jest/console`, `@jest/reporters`, `@jest/test-result`, `@jest/transform`, `jest-changed-files`, `jest-config`, `jest-haste-map`, `jest-message-util`, `jest-resolve`, `jest-resolve-dependencies`, `jest-runner`, `jest-runtime`, `jest-snapshot`, `jest-util`, `jest-watcher` |
| `@jest/environment` | high | `@jest/fake-timers`, `jest-mock` |
| `@jest/expect` | high | `expect`, `jest-snapshot` |
| `@jest/fake-timers` | high | `jest-message-util`, `jest-mock`, `jest-util` |
| `@jest/globals` | high | `@jest/environment`, `@jest/expect`, `jest-mock` |
| `@jest/reporters` | high | `@jest/console`, `@jest/test-result`, `@jest/transform`, `glob`, `jest-message-util`, `jest-util`, `jest-worker` |
| `@jest/test-result` | high | `@jest/console` |
| `@jest/test-sequencer` | high | `@jest/test-result`, `jest-haste-map` |
| `@jest/transform` | high | `jest-haste-map`, `jest-util` |
| `@nestjs/cli` | high | `@angular-devkit/core`, `@angular-devkit/schematics`, `@angular-devkit/schematics-cli`, `@nestjs/schematics`, `glob` |
| `@nestjs/schematics` | high | `@angular-devkit/core`, `@angular-devkit/schematics` |
| `@typescript-eslint/eslint-plugin` | moderate | `@typescript-eslint/type-utils`, `@typescript-eslint/utils` |
| `@typescript-eslint/parser` | moderate | `@typescript-eslint/typescript-estree` |
| `@typescript-eslint/type-utils` | moderate | `@typescript-eslint/typescript-estree`, `@typescript-eslint/utils` |
| `@typescript-eslint/typescript-estree` | high | `minimatch`, `tinyglobby` |
| `@typescript-eslint/utils` | moderate | `@typescript-eslint/typescript-estree` |
| `anymatch` | high | `picomatch` |
| `babel-jest` | high | `@jest/transform` |
| `expect` | high | `jest-message-util`, `jest-mock`, `jest-util` |
| `fdir` | high | `picomatch` |
| `glob` | moderate | [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4), `minimatch` |
| `jest` | moderate | `@jest/core`, `jest-cli` |
| `jest-changed-files` | high | `jest-util` |
| `jest-circus` | high | `@jest/environment`, `@jest/expect`, `@jest/test-result`, `jest-each`, `jest-message-util`, `jest-runtime`, `jest-snapshot`, `jest-util` |
| `jest-cli` | high | `@jest/core`, `@jest/test-result`, `jest-config`, `jest-util` |
| `jest-config` | high | `@jest/test-sequencer`, `babel-jest`, `glob`, `jest-circus`, `jest-environment-node`, `jest-resolve`, `jest-runner`, `jest-util` |
| `jest-each` | high | `jest-util` |
| `jest-environment-node` | high | `@jest/environment`, `@jest/fake-timers`, `jest-mock`, `jest-util` |
| `jest-haste-map` | high | `anymatch`, `jest-util`, `jest-worker`, `picomatch` |
| `jest-message-util` | high | `jest-util`, `picomatch` |
| `jest-mock` | high | `jest-util` |
| `jest-resolve` | high | `jest-haste-map`, `jest-util` |
| `jest-resolve-dependencies` | high | `jest-snapshot` |
| `jest-runner` | high | `@jest/console`, `@jest/environment`, `@jest/test-result`, `@jest/transform`, `jest-environment-node`, `jest-haste-map`, `jest-message-util`, `jest-resolve`, `jest-runtime`, `jest-util`, `jest-watcher`, `jest-worker` |
| `jest-runtime` | high | `@jest/environment`, `@jest/fake-timers`, `@jest/globals`, `@jest/test-result`, `@jest/transform`, `glob`, `jest-haste-map`, `jest-message-util`, `jest-mock`, `jest-resolve`, `jest-snapshot`, `jest-util` |
| `jest-snapshot` | high | `@jest/transform`, `expect`, `jest-message-util`, `jest-util` |
| `jest-util` | high | `picomatch` |
| `jest-watcher` | high | `@jest/test-result`, `jest-util` |
| `jest-worker` | high | `jest-util` |
| `minimatch` | moderate | [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) |
| `picomatch` | high | [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) |
| `tinyglobby` | high | `fdir`, `picomatch` |
| `ts-jest` | high | `jest-util` |
| `ts-loader` | high | `picomatch` |
| `typescript-eslint` | moderate | `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `@typescript-eslint/typescript-estree`, `@typescript-eslint/utils` |

## 2. Implemented dependency changes

- Nest common/core/platform-express/platform-socket.io/websockets/testing remain on **major 11**, upgraded together to 11.2.10. Swagger stays major 11 at 11.4.8. This brings Multer 2.5.0 and js-yaml 5.5.0.
- Compression 1.8.2; Joi 17.13.9.
- Explicit security overrides: proxy-addr 2.0.8, body-parser 2.4.0, engine.io 6.6.10, @fastify/busboy 3.2.2, @grpc/grpc-js 1.14.5, qs 6.16.1.
- **Deliberate transitive major:** deepmerge-ts 8.0.0 only under @prisma/config. Tested its configuration merge API, Prisma generate, full build, fresh migrations, backend tests and Linux build. Prisma/client remain 6.19.3; no database model migration caused by this dependency fix.
- Compatible lockfile updates for Handlebars 4.7.10, Browserslist 4.29.6, fast-uri 3.1.9, baseline-browser-mapping 2.11.38, brace-expansion's compatible branches and fast-xml-parser 5.12.1; current js-yaml branches no longer flagged.
- Retained Firebase Admin 13 and MinIO 8. No untested Firebase 14 major upgrade, Prisma 7/8 change or npm-suggested MinIO 7 downgrade.

Potential change risk is covered by fresh installs and regression tests, but external Firebase delivery was not exercised without staging credentials. Keep the exact reviewed lockfile; re-run audits/tests when it changes.

## 3. Automated and integration verification

### Business regression checks

The disposable server [script](../scripts/phase3-preproduction-server.cjs) creates clearly marked synthetic customers with QA-only balances and uses real authenticated HTTP requests plus PostgreSQL assertions. It never accepts another database URL or loads production dotenv values.

Passed:

1. Wallet product purchase debits 10,000 IQD and decreases stock once; replay with the same idempotency key does neither twice.
2. Direct-product COD leaves the wallet unchanged.
3. Insufficient wallet purchase fails 409 and rolls back stock/sale.
4. Two concurrent final-unit purchase attempts yield exactly one success; inventory ends at zero.
5. A bid holds exactly 10%; a zero-balance higher bidder fails.
6. Closing a winning auction automatically confirms the order, settles the 10% COD deposit once and clears reserved balance.
7. Paying the confirmed order's remainder from the wallet is replay-safe.
8. Shipped orders reject payment changes.

The separate 27 e2e tests include real isolated admin/order/auction and account-deletion/Argon2 flows. All opt-in database variables were set to guarded QA databases; they were not silently skipped. Existing backend payment/deposit/wallet/cancellation/stock and Flutter checkout/order regression tests also passed.

**Payment scope:** these are wallet/COD ledger operations, not proof of an external Mastercard/bank funding integration.

### Catalog, image and compatibility checks

[HTTP validation script](../scripts/phase3-catalog-http-validation.cjs) and [raw results](benchmarks/catalog-preproduction-http.json):

- Traversed 1,000 public products in 25 keyset pages with 1,000 unique IDs and correct end-of-list.
- Reusing a cursor with changed filters returns 400.
- Arabic query without diacritics matches the first 40 diacritized-title results.
- Existing `/api/products` returns descriptions/legacy fields and no unsolicited `imageMedia`.
- Temporarily hiding a previously viewed QA product leaves the next page unchanged; restored its prior state afterward.
- Replacing the published QA image changes its original/manifest and serves content-hashed WebP with correct MIME and immutable caching (20,836-byte checked sample); restored the image afterward.

The Phase 2 real multipart/MinIO/BullMQ integration passed again: size/MIME/corrupt-source limits, unchanged original hashes, legacy URLs, private/draft denial, all eight variants, retry/backfill idempotency and failure fallback. All operations targeted disposable QA data.

Flutter: customer 163 (re-run Nov 19, including four new probe-policy tests), admin 139, core 7, app_models 1, secure_storage 2, realtime_socket 1, printer_bridge 1, API client 20, shared_ui 17 (other suites verified Nov 18). The first broad shared_ui run explicitly skipped the optional decode fixture test; it was then rerun with `REZONA_IMAGE_REVIEW` and all 17 passed. Host decoder results are not tablet frame measurements.

### Linux runtime verification

Built `rezona-phase3-preproduction:local`, **linux/amd64**, image ID:

`sha256:247f071e36b4d0e03bbadc47ccca34ef7e32304e0e47ecb7f8aaf77208097dd6`

Node v24.22.3. Clean full/build and production-only installs completed with the documented residual audit findings. Native Sharp encoded a WebP (44 bytes) and native Argon2 hash/verify returned true under the runner's normal user. Real Linux HTTP API booted against isolated PostgreSQL/Redis/MinIO:

| Request | Observed |
|---|---|
| /health | 200 |
| Legacy /api/products | 200, 20 items, no media field without opt-in |
| Opted-in /api/catalog/marketplace | 200, 20 items, imageMedia present |
| Invalid Engine.IO protocol handshake | 400, subsequent /health still 200 |

This is not an OS-package vulnerability scan or a public CDN/load test.

### Failures observed and disposition

- New dependency regression test initially failed TypeScript compilation because proxy-addr has no declaration installed. Replaced the import with a locally typed require; final **155/155** unit tests passed.
- An existing e2e expected the retired quick-sale endpoint to create a sale. Source controller is deliberately empty from prior approved work. Updated the test to require **404 and no service call**, not to revive quick sales. Final **27/27** e2e passed.
- QA script fixture definitions initially omitted required auction fields / used a wrong relation name; corrected test fixtures only and reran successfully.
- Initial installation failed on device security/user approval; subsequent manual install and corrected normal ADB update succeeded on Nov 19. No security bypass. The invalid local/release probe startup was corrected separately as documented above.
- Drive C was low. The generated `apps/customer_app/build/app` directory was moved recoverably to `D:/rezona-phase3-validation-20261117/customer-app-build`, and the final regenerated output to `customer-app-build-final` under the same task directory; no source or user data deleted. New builds can recreate it. C still had only **0.41 GiB free** at the final check. No global Gradle/npm caches or unrelated files were purged. Restore adequate disk headroom before further large builds; these local capacity constraints are not an application assertion failure.

## 4. Android release and physical-device validation

### Build facts

Two ARM64-target release builds succeeded using a temporary seven-day **QA-only signing key**, not a production/distribution credential:

- `D:/rezona-phase3-validation-20261117/rezona-phase3-probe-release.apk`
- `D:/rezona-phase3-validation-20261117/rezona-normal-release-qa-signed.apk`

**Neither is an approved Play upload artifact.** Version remains the repository's 1.0.5 (8); a future distribution build must use the authorized signing identity and a verified greater store versionCode.

Ordinary `lib/main.dart` build used the explicit production API/socket HTTPS defines, original package `com.tavrix.aboessa_customer_app`, normal Firebase Gradle setup, cleartext=false and no debuggable manifest flag. It was **built/inspected, not installed**.

The corrected validation build uses `REZONA_PHASE3_VALIDATION=1`, `PHASE3_VALIDATION=true`, `APP_ENV=production`, HTTPS URLs and the explicit QA CA, separate package `com.tavrix.aboessa_customer_app.phase3qa`, Firebase push off and cleartext=false. Earlier HTTP/local validation builds are obsolete. Normal builds default to the original ID/Firebase and disallow cleartext. The opt-in [probe](../../AboEssaMobile/apps/customer_app/lib/validation/phase3_catalog_probe.dart) uses the real customer bootstrap, routes/cards, API client and cache with scripted guest navigation. It is not a replacement production UI or mock API.

Device observed: **Redmi Pad SE, model 23073RPBFG / SM6225, Android 15, 1200×1920**. Tablet, not phone; user approved it as the test device. The corrected QA release is installed; see the successful USB run above.

### Physical measurement matrix — no fabricated values

| Required measurement | Wi-Fi | Mobile WAN / hotspot | Current evidence |
|---|---|---|---|
| Cold launch/catalog/card/image ready | NOT MEASURED | NOT MEASURED | One initial USB release sample above; not controlled repeated cold/warm distributions |
| Warm navigation and process restart | NOT MEASURED | NOT MEASURED | USB detail/back smoke only; no process-restart benchmark |
| Frame build/raster P50/P95, missed budget | NOT MEASURED | NOT MEASURED | USB timings observed above, with overruns; network profiles pending |
| Process RSS / Android PSS and decoded cache | NOT MEASURED | NOT MEASURED | USB snapshots above; network profiles pending; cache setting is not RSS |
| Public image disk/memory hit rates | NOT MEASURED | NOT MEASURED | Controlled host cache reuse test passed; not a device hit-rate |
| Actual downloaded bytes/network transfers | NOT MEASURED | NOT MEASURED | USB body counters observed; not radio/TLS/header overhead |
| Pagination/search/image update on screen | PENDING | PENDING | USB product search/scroll/invalidation smoke passed; active-auction screen pending |

No physical performance numbers from Phase 2/3 file sizes or host engine decoding are substituted here.

### Required execution protocol after unblocking

1. Install only the corrected HTTPS `.phase3qa` release identified above. Never uninstall/clear the real customer package. The first corrected USB installation/startup gate is now resolved.
2. Start the guarded API and TLS facade (`scripts/phase3-qa-tls-proxy.cjs`, explicit local QA certificate/key outside the repository). ADB reverse to **58445** reaches the HTTPS facade, not plaintext 58443. This is a **USB baseline only**, not Wi-Fi.
3. Capture Android foreground/resume, app launch result, crash logs and native memory. Confirm actual release mode and screen displays the guest catalog, not a black/error/loading screen.
4. Collect at least five cold and five warm/restart samples per network, reporting distributions and variability. Clear only QA image/cache data for cold runs; retain it for restart persistence checks. First-card/image readiness must be tied to rendered frames; distinguish scripted welcome navigation from automatic home entry.
5. Capture FrameTiming build/raster distribution and missed display-frame budgets, plus foreground scroll phases and post-navigation. Record actual refresh rate, device thermal/power state and test duration.
6. Measure image bytes/requests with server logs and client cache-source instrumentation. Separate decoded-memory reuse, disk hits, network revalidation and failures; report the denominator. Existing server request counts alone do not establish an all-image production hit-rate.
7. Capture RSS and `adb shell dumpsys meminfo <QA-package>` PSS before/after cold, scrolling, detail/back navigation and process restart. Do not equate image-cache bytes with whole-process memory.
8. Verify Arabic input, category changes, cursor end/no duplicates, details/back, immutable image selection and changed-image visibility without clearing app cache.
9. For **real Wi-Fi**, connect to a reachable isolated staging endpoint and remove this task's USB reverse before measuring data flow.
10. For **mobile WAN**, tablet Wi-Fi hotspot traffic must actually traverse the phone's cellular connection to an internet staging host. A tablet and local PC on the same hotspot reaching each other is LAN traffic, **not** cellular WAN. Record network route/latency/bandwidth/loss and ensure server requests arrive over the intended path. Simulated 4G shaping must be labelled simulated.
11. Current probe now requires production-mode HTTPS on private QA IP origins; the TLS facade and control server bind loopback only. A public staging instrumentation deployment needs explicit configuration, access restriction and TLS; do not expose its test controls to production or tunnel it publicly without approval.

## 5. Staging deployment checklist and migration sequence

No command below was run against staging/production. Two fresh disposable QA databases each applied the complete **29-migration** history successfully.

### Before staging deployment

- [ ] Explicit staging host/URL, isolated database/Redis/MinIO bucket, no real customers or production secrets.
- [ ] Reviewed source diff contains all intended existing local changes; record source revision and exact lock/image digest.
- [ ] Resolve/accept retained security findings with named release/security owner; no critical/high reachable public path knowingly retained.
- [ ] Use Node 24, clean `npm ci`, reviewed optional dependencies and native modules; repeat full/prod audits and image scan.
- [ ] Use tested Flutter 3.44 / Dart 3.12 and exact lockfile; validate iOS separately on macOS if shipping it.
- [ ] Production-signed Android/AAB built by authorized CI; separate QA key must never be used for distribution.
- [ ] Record current DB migration history; take consistent PostgreSQL backup and MinIO originals/variants backup. Perform and time a restore into an isolated environment.
- [ ] Inspect known schema drift rather than using db push/reset.
- [ ] Confirm pg_trgm installation privileges, disk headroom, long transactions, concurrent index creation capacity and backups.

### Apply/backward-compatible rollout

1. Keep image worker disabled initially: `IMAGE_OPTIMIZATION_ENABLED=false`. Existing originals and legacy routes stay online.
2. Apply only unapplied migrations using `prisma migrate deploy`; do not reset or reapply initial migrations.
3. Phase 2 order: `202611160001_image_optimization`, then product/auction image lookup GIN migrations `...002` / `...003`.
4. Phase 3 order: `202611170001_catalog_search` (pg_trgm and normalization function), `...002_product_search`, `...003_auction_search`, `...004_product_cursor`, `...005_auction_cursor`, `...006_product_category_cursor`, `...007_auction_category_cursor`.
5. Each concurrent index migration remains its own statement, outside an explicit transaction wrapper. Inspect failed/invalid indexes before retrying; do not mark failed migrations resolved blindly.
6. Deploy reviewed backward-compatible API **before** clients depend on the additive catalog endpoints. Verify /health, /ready, public/private media, permissions and both old/new contracts.
7. Confirm cache policy: no public caching on personalized API/manifests/original mutable media; long immutable caching only on content-versioned variant bytes. No global `/api/*` or `/api/media/*` cache rule.
8. Enable one image worker in staging; inspect CPU/RSS, queue depth and job retry behavior. Backfill first in dry-run, then bounded explicitly approved batches; preserve originals and order snapshots.
9. Run internal wallet/COD/purchase/bid/order/stock regression against staging QA accounts, then real Firebase staging credentials if used. Never test charges or credits on real customer accounts.
10. Validate existing installed client + new client. Old no-header requests must not get manifest overhead; legacy URLs and transactions remain valid. New endpoint 404 fallback, feature-disable build, signed guest browsing and account deletion need real binary testing.
11. Capture the physical network/performance evidence above, compare to agreed thresholds, verify proxy hop configuration against actual Cloudflare/Nginx topology, origin restrictions, throttle/IP behavior and request-ID/error handling.
12. Monitor latency/error rates, stock conflicts, ledger consistency, cache failure rate, search plans, DB/Redis/MinIO resources and image fallback use. Define owner, observation period, alert thresholds and abort conditions before promotion.

### Known migration/schema drift

Read-only `prisma migrate diff` from the fresh migrated QA database to current schema reported:

- Schema omits `AdminUser_deactivatedById_idx`.
- Schema omits `InAppAd_placement_priority_sortOrder_idx`.
- Schema omits `LiveSession_status_scheduledAt_idx`.
- Schema declares default MANUAL for LiveSession.source; migration history does not.

These pre-existing differences are not Phase 3 catalog schema changes. No suggested DROP INDEX or ALTER was executed. Catalog expression/partial indexes are SQL-managed and may not be fully represented by Prisma schema introspection. Reconcile ownership/default intent in a reviewed additive change before a general schema synchronization. **Never use db push or reset as a production readiness shortcut.**

### Rollback strategy

- API: retain previous verified image/digest and environment snapshot; route traffic back only after checking migration/schema compatibility. Additive Phase 2/3 migrations, originals and variant metadata remain.
- Worker: disable image processing first if CPU/queue/storage behavior degrades; do not delete original or hashed files.
- Client: rebuild/distribute with `CATALOG_OPTIMIZATION_ENABLED=false` and/or `CATALOG_DISK_CACHE_ENABLED=false` if needed. Existing distributed clients cannot be remotely changed by a compile-time flag. Retain old endpoints and fallback behavior.
- Database: do not auto-drop new tables/indexes or restore a live backup over newer orders/payments. Stop writes and use a separately reviewed recovery procedure if a real data incident occurs; reconcile wallet/stock ledgers.
- Security: rollback must not silently reintroduce critical/high exposed vulnerable dependencies. Prefer a hotfix/feature disable on the patched runtime; any emergency version rollback requires explicit security-risk sign-off.
- CDN/cache: content-versioned keys avoid overwrites; do not rely on cache clearing to revoke sensitive published bytes. Purge actions need explicit approval.
- Abort conditions: increased purchase/bid failures, ledger/stock mismatch, crash/black startup, private media exposure, invalid indexes, unexpected DB load or uncontrolled image fallback. Collect evidence, stop promotion and preserve QA data/logs for diagnosis.

## 6. Local changes and resources

Additional files touched in this review:

- `package.json`, `package-lock.json`: selected security updates/overrides.
- `tests/unit/dependency-security.spec.ts`: critical proxy/subnet and Prisma merge compatibility guards.
- `tests/e2e/phase-b.e2e-spec.ts`: assert the already-retired quick-sale route remains unavailable.
- `scripts/phase3-preproduction-server.cjs`: guarded QA server, real transactional regression, representative image catalog and counters.
- `scripts/phase3-catalog-http-validation.cjs`: real HTTP cursor/search/legacy/image checks.
- `scripts/phase3-qa-tls-proxy.cjs`: loopback-only TLS facade for corrected release validation; local test key/certificate remain outside the repository.
- Security snapshots, HTTP results and this readiness report.
- Flutter `apps/customer_app/android/app/build.gradle.kts`, main AndroidManifest.xml: opt-in isolated validation ID / Firebase / cleartext switch; defaults preserve normal builds.
- Flutter `apps/customer_app/lib/validation/phase3_catalog_probe.dart`: separate scripted release probe; normal main unchanged.
- Flutter `apps/customer_app/lib/validation/phase3_probe_config.dart` and its four regression tests: enforce the same production/HTTPS policy before running the probe. Normal `main.dart` and the release guard in `customer_di.dart` were not exempted or weakened.

The corrected build used `--release -t lib/validation/phase3_catalog_probe.dart --dart-define-from-file=D:/rezona-phase3-validation-20261117/qa-production-defines-20261119.json` with QA-only native packaging/signing. That local define file contains `APP_ENV=production`, HTTPS loopback API/socket URLs, validation opt-in, push disabled and the public QA certificate in base64. Do not reuse the previous local/HTTP probe recipe. Do not include the local private TLS or signing keys in source control or a distributed production artifact.

The original display-retirement, legal branding and Phase 2/3 local modifications were retained. No production customer, balance, order, auction, stock or image was mutated.

Local resources used: task-only PostgreSQL ports 55442 and 55439, Redis 56382, MinIO 59042, loopback QA API 58443 and Linux smoke API 58444. Normal `aboessa-*` services were not restarted. The completed Linux smoke container (`rezona-phase3-api-qa`) and separate admin QA Postgres (`rezona-phase3-admin-qa`) were stopped/auto-removed, including disposable admin-test data, after their checks. Fixtures are reproducible from scripts/tests. Main QA Postgres/Redis/MinIO and the loopback probe API remain ready for the pending tablet installation. Stop only exact task-created resources afterward; never prune unrelated Docker data.

## 7. Unresolved release blockers / next action

1. **Resolved startup/install gate:** corrected QA release installed and completed one physical USB product smoke. Repeated cold/warm restart/cache and active-auction screen tests remain required; observed frame-budget overruns need profiling.
2. **Internet-accessible isolated staging** or an explicitly configured safe equivalent for genuine Wi-Fi/mobile-WAN measurements. User will switch tablet to phone hotspot when requested; do not request the switch before a reachable test path exists.
3. **Retained high MinIO dependency chain:** compatible upstream remediation or documented release/security owner acceptance based on the inspected non-reachable path. Keep it visible in audits.
4. **Development matcher/glob risks:** resource-isolated CI and explicit risk acceptance pending safe upstream fixes/compatible toolchain upgrade.
5. **Distribution identity/version + actual old/new app validation**, live staging Firebase delivery if used, restore drill, OS/container image scan and agreed device performance thresholds.
6. Review the known existing schema drift; do not silently synchronize/drop objects.
7. **Resolved 2026-11-19:** local disk capacity now has adequate headroom (56.39 GiB C / 70.06 GiB D observed). No broad user/global cache cleanup was performed by this follow-up.

**Current decision stays NO-GO.** Automated success and file compression gains do not close these gates.

## Appendix — original production GHSA mapping

### @fastify/busboy

[GHSA-xjh9-v7x6-24jw](https://github.com/advisories/GHSA-xjh9-v7x6-24jw) — high; affected range `>=3.1.0 <3.2.1`. [GHSA-x8mw-p69m-v3mx](https://github.com/advisories/GHSA-x8mw-p69m-v3mx) — high; affected range `>=1.0.0 <3.2.1`. [GHSA-gxm5-99cw-xjw9](https://github.com/advisories/GHSA-gxm5-99cw-xjw9) — moderate; affected range `<3.2.2`.

### @google-cloud/firestore

Inherited via `google-gax`.

### @google-cloud/storage

Inherited via `retry-request`. Inherited via `teeny-request`.

### @grpc/grpc-js

[GHSA-m9gg-hp2v-232j](https://github.com/advisories/GHSA-m9gg-hp2v-232j) — high; affected range `>=1.14.0 <1.14.5`. [GHSA-f596-whhp-79r4](https://github.com/advisories/GHSA-f596-whhp-79r4) — low; affected range `>=1.14.0 <1.14.5`.

### @nestjs/platform-express

Inherited via `multer`.

### @nestjs/swagger

Inherited via `js-yaml`.

### @prisma/config

Inherited via `deepmerge-ts`.

### body-parser

[GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828) — high; affected range `>=2.0.0 <2.4.0`.

### compression

[GHSA-vc2v-76pw-4v95](https://github.com/advisories/GHSA-vc2v-76pw-4v95) — high; affected range `<1.8.2`.

### decode-uri-component

[GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) — moderate; affected range `<=0.4.2`. [GHSA-qr28-fpjm-wq7f](https://github.com/advisories/GHSA-qr28-fpjm-wq7f) — high; affected range `<=0.5.0`.

### deepmerge-ts

[GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) — high; affected range `<8.0.0`.

### engine.io

[GHSA-2gc4-cqfq-p2gv](https://github.com/advisories/GHSA-2gc4-cqfq-p2gv) — high; affected range `>=6.6.0 <6.6.10`.

### fast-xml-parser

[GHSA-474x-hrwr-fgx4](https://github.com/advisories/GHSA-474x-hrwr-fgx4) — low; affected range `<=5.11.2`.

### firebase-admin

Inherited via `@google-cloud/firestore`. Inherited via `@google-cloud/storage`.

### gaxios

Inherited via `uuid`.

### google-gax

Inherited via `retry-request`. Inherited via `uuid`.

### joi

[GHSA-6w3j-5fw6-r9vr](https://github.com/advisories/GHSA-6w3j-5fw6-r9vr) — low; affected range `>=17.2.0 <17.13.6`. [GHSA-gg4h-3hg2-grpc](https://github.com/advisories/GHSA-gg4h-3hg2-grpc) — low; affected range `>=16.0.0 <17.13.5`. [GHSA-wr44-6hxh-3jwq](https://github.com/advisories/GHSA-wr44-6hxh-3jwq) — moderate; affected range `<17.13.8`. [GHSA-6h2x-m376-mqjq](https://github.com/advisories/GHSA-6h2x-m376-mqjq) — high; affected range `>=17.2.0 <17.13.7`. [GHSA-4528-x5fx-h6hg](https://github.com/advisories/GHSA-4528-x5fx-h6hg) — high; affected range `>=17.1.1 <17.13.9`.

### js-yaml

[GHSA-r3ph-w7gj-g6xm](https://github.com/advisories/GHSA-r3ph-w7gj-g6xm) — moderate; affected range `>=5.0.0 <=5.4.0`.

### minio

Inherited via `query-string`. Inherited via `stream-json`.

### multer

[GHSA-wc9g-mqfw-jrwm](https://github.com/advisories/GHSA-wc9g-mqfw-jrwm) — high; affected range `<2.3.0`. [GHSA-qfvm-cv95-jqjf](https://github.com/advisories/GHSA-qfvm-cv95-jqjf) — high; affected range `=2.2.0`. [GHSA-qvfw-j98x-7q72](https://github.com/advisories/GHSA-qvfw-j98x-7q72) — low; affected range `<2.3.0`. [GHSA-535w-7cp7-47q4](https://github.com/advisories/GHSA-535w-7cp7-47q4) — high; affected range `<2.3.0`. [GHSA-3pph-fpjx-jg34](https://github.com/advisories/GHSA-3pph-fpjx-jg34) — moderate; affected range `>=2.2.0 <2.4.0`. [GHSA-q7qp-rjg7-q26m](https://github.com/advisories/GHSA-q7qp-rjg7-q26m) — high; affected range `>=2.0.0 <2.5.0`.

### prisma

Inherited via `@prisma/config`.

### proxy-addr

[GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) — critical; affected range `>=1.1.0 <2.0.8`.

### qs

[GHSA-x5fp-wj9c-mxmx](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx) — moderate; affected range `>=6.14.2 <=6.15.3`. [GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g) — moderate; affected range `>=2.2.5 <6.16.0`. [GHSA-6pq8-jhm2-2vcw](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw) — moderate; affected range `>=6.7.0 <=6.16.0`.

### query-string

Inherited via `decode-uri-component`.

### retry-request

Inherited via `teeny-request`.

### stream-json

[GHSA-528h-pc64-c93x](https://github.com/advisories/GHSA-528h-pc64-c93x) — moderate; affected range `<=3.4.0`. [GHSA-hqr4-qq8f-hg3x](https://github.com/advisories/GHSA-hqr4-qq8f-hg3x) — moderate; affected range `<=3.5.0`. [GHSA-mjw6-4jj6-33hc](https://github.com/advisories/GHSA-mjw6-4jj6-33hc) — moderate; affected range `<3.6.0`.

### teeny-request

Inherited via `uuid`.

### uuid

[GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) — moderate; affected range `<11.1.1`.


