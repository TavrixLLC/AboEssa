# REZONA Phase 6 — recognition and duplicate review

Status: local/mock implementation verified; **Phase 6 acceptance incomplete / production NO_GO**. Local, isolated QA only. No deployment, push, Phase 7 or customer-data changes. The user explicitly selected **no paid calls** during this task; no Gemini inference was performed, including free-tier inference.

## Pre-implementation audit (2026-11-20)

Read the Phase 3 readiness, Phase 3.1 performance, Phase 4 inventory, and latest Phase 5 intake reports before implementation. Inspected the actual Prisma models, intake controller/service/DTOs, inventory transaction/idempotency core, private storage interface, image codec and durable BullMQ dispatcher, catalog search, Flutter intake journal/repository/cubit/editor and QA harness.

- The existing catalog has title/description/category, not structured brand/model/SKU/barcode columns. Category is a flat active taxonomy, not a hierarchy. Do not invent either structure.
- Phase 5 already provides immutable client image IDs and source fingerprints, private media, employee-owned versioned drafts, explicit approved metadata and replay-safe atomic product + stock receipts. Recognition must not create another stock path.
- Existing Phase 2 catalog previews are 480px; these are not recognition inputs. Recognition will decode the authorized original with existing limits, auto-orient, strip metadata and prepare a bounded 1600px JPEG.
- Phase 3 PostgreSQL `catalog_search` and trigram indexes can retrieve a bounded candidate set without a vector database. Matching must be variant-sensitive, explainable and advisory.
- The Flutter journal persists employee edits separately from HTTP state. Suggestions must remain separate until explicit approval; late results must be correlated to the selected image and must never overwrite manual text, price, quantity or location.
- Protected Phase 5 QA uses database 55446, Redis 56386, MinIO 59046 and API 58463. Phase 6 must use distinct services and database. Never run Phase 6 fixtures against those protected services.

## Integration approach recorded before source changes

1. Add additive recognition task/subscriber/usage/duplicate-decision tables. Preserve existing catalog and intake scalar contracts. AI is disabled by default on server and Flutter.
2. Introduce one Nest AI module: versioned strict schema/prompt, deterministic mock adapter, fixed-origin Gemini REST adapter, durable DB/BullMQ worker and budget ledger. No external URLs, tools, customer records, keys or employee financial inputs enter model prompts.
3. Cache a shared computation by source fingerprint + provider/model + prompt/schema + complete active-category snapshot. Link each private intake image separately; cancellation/supersession and authorization are per session. Record billable-attempt reservations before external calls; unknown outcomes retain their reservation and are not blindly retried.
4. Expose intake-scoped analyze/status/cancel/approve/duplicate-review endpoints behind existing admin intake guards. Approvals require selected image, taxonomy and draft revision to still match. No stock, pricing or locations are AI-controlled.
5. Rank a bounded indexed text candidate set using Arabic normalization and explicit variant conflict checks. Recheck strong candidates inside the existing NEW submission transaction, after idempotent replay and before creating a product. Explicit distinct-product decisions bind current draft identity/revision and candidate identity set. This is not a catalog uniqueness constraint or a promise against all concurrent duplicates.
6. Extend the existing Flutter intake flow with isolated suggestion/duplicate cards, explicit empty-field approval, per-field overwrite confirmation and manual fallback. Reuse Phase 5 STOCK_IN selection and Phase 4 receipts.
7. Test schema, provider transport, budgets, image/revision races and duplicates; then real HTTP/PostgreSQL/Redis/MinIO/BullMQ mock-backed scenarios and inherited stock/commerce regressions on a separate Phase 6 environment. Physical and live results must be labeled independently, never inferred from mocks.

## Provider documentation versus actual access

Official documentation reviewed on 2026-11-20: [3.1 Flash-Lite model](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite), [structured output](https://ai.google.dev/gemini-api/docs/structured-output), [GenerateContent REST](https://ai.google.dev/api/generate-content), [pricing](https://ai.google.dev/gemini-api/docs/pricing), [data terms](https://ai.google.dev/gemini-api/terms).

The documented 3.1 Flash-Lite accepts images, returns text, supports structured output and lists 1,048,576 input / 65,536 output tokens. Standard text/image input and output (including thinking) rates are respectively $0.25/$1.50 per million tokens; 3.5 Flash-Lite lists $0.30/$2.50. These are documentation observations, not verified account access or measured cost. Do not confuse the image-generation model with the recognition model. No automatic fallback is permitted. Rates/limits require dated operator review before live use.

Paid API data handling requires a project with active billing; it does not mean zero retention or local-only processing. No key, billing entitlement, quota, region, approved-photo collection or live extraction/JSON capability has yet been verified. Live recognition remains blocked pending explicit consent, secure server configuration, a small approved budget and non-sensitive approved photos. Cost estimates are not provider invoice charges.

## Inherited NO_GO

Phase 3/3.1 frame-tail and realistic WAN acceptance gaps, staging/release/old-client acceptance, Phase 4 physical inventory/employee acceptance, dependency advisory residuals and Phase 5 source/journal retention policy remain open. Phase 6 cannot waive them.

## Verification ledger

No mocked result is live Gemini quality, no synthetic text corpus is a 50-photo recognition evaluation, and no desktop test is physical-device acceptance. Authoritative local evidence is under `docs/benchmarks/phase6/`; test matrix files, rather than early diagnostic logs, identify the final regression runs.

| Verification | Actual result / scope |
| --- | --- |
| Backend | Build + scoped ESLint passed; 266 unit cases / 25 suites; 27 DB e2e cases / 7 suites, no DB suites skipped |
| Flutter | Admin analyze clean; admin 166, customer 166, shared UI 18, API client 20 passed; one inherited optional shared-UI engine-image skip |
| Counts | 663 unique automatic test cases passed across those matrices; repeat reruns are not extra cases |
| Real local integration | 19 Phase 6 groups using actual Nest HTTP/JWT/PostgreSQL/Redis/MinIO/BullMQ, deterministic in-memory model adapter only |
| Inherited integration | 11 Phase 5 intake and 16 Phase 4 inventory/commerce groups passed on the separate Phase 6 services, AI disabled for these legacy regression runs |
| Migrations | Fresh 35 migrations; read-only Phase 5 clone upgraded 32→35; all 48 legacy table row-count/content fingerprints unchanged |
| Budget race | Actual isolated PostgreSQL reservation lock tested with synthetic accounting records, no provider instantiated: one $0.360448 reservation fits a $0.50 simulated cap; another is rejected; an ambiguous timeout does not free the reservation |
| Images | Real codec unit tests verify 1600px auto-orientation/metadata removal, private-key restriction and changed-byte rejection |
| Physical Phase 6 | Test APK built and package verified. Initial installation rejected by Xiaomi (`INSTALL_FAILED_USER_RESTRICTED`); the user subsequently explicitly deferred installation. Native workflow has NOT passed. No further install was attempted, and no uninstall/data clear fallback was used |
| Live provider / release / WAN | NOT VERIFIED. No paid or free-tier Gemini call, release-mode Phase 6 acceptance or realistic Wi-Fi/mobile-WAN benchmark |

Evidence: `tests/matrix-backend.json`, `tests/matrix-mobile.json`, `checks.json`, `intake-regressions.json`, `commerce-regressions.json`, `budget.json`, `migrations.json`, `matching-text-evaluation.json`, and `device/` build/install logs. Early failed test/build logs are not successful acceptance evidence. Inherited regression fixtures intentionally exercise invalid ledger states on disposable QA records; they are not customer records.

## Architecture and schema

The existing Nest application, PostgreSQL, Redis/BullMQ and storage provider are reused. No SDK dependency, vector database, microservice, permanent SKU/barcode, brand column or product merge subsystem was added.

| Entity | Responsibility |
| --- | --- |
| `ProductRecognitionTask` | Unique shared computation identity, source image/hash, provider/model/revision, prompt/schema, category snapshot/hash, durable status, fenced lease and bounded validated result/errors |
| `ProductRecognitionRequest` | Private employee/session/image association, persisted client request key, re-analysis generation and database-locked per-session sequence; independent cancellation/supersession |
| `RecognitionUsage` | One reserved provider attempt, precise USD values, snapshotted prices, token components, latency and failure/unknown status; actual billed cost stays nullable |
| `IntakeDuplicateDecision` | Current explicit distinct-product review bound to revision, approved metadata/image identity and strong-candidate identity set; not a permanent product-duplicate relationship |

Migrations: `202611200001_product_recognition`, `202611200002_recognition_request_sequence`, `202611200003_recognition_model_revision`. No catalog/intake scalar contract was replaced. The generated Prisma client remains 6.19.3; the tool's major-version upgrade suggestion was not executed. Unrelated legacy schema drift (three existing indexes and a LiveSession default) was deliberately excluded from the migration.

Task states: `PENDING → PROCESSING → COMPLETED / FAILED / UNKNOWN`. Request links are `ACTIVE / SUPERSEDED / CANCELLED`; stale taxonomy and stale selected-image states are computed for delivery. Workers use conditional lease-token updates. PostgreSQL is the outbox; Redis failure does not discard a draft. Dispatch is bounded to 100 queued jobs, batches of 20 and 1–2 configured workers. Cross-instance billable concurrency is checked under the budget lock. Pre-dispatch concurrency contention can defer with bounded backoff (three total task claims); external calls are not automatically retried. An expired in-flight task becomes UNKNOWN, not another charge.

Default analysis is deduplicated by image fingerprint, provider, model + operator-reviewed model revision, prompt/schema, recognition-image preparation version and complete active-taxonomy hash. An explicit re-analysis has a persisted new request identity and at most two generations per image. Polls, rebuilds, upload retries, reopen and response-loss recovery reuse the original identity. Computation sharing does not grant access to another employee's image or draft. Cache hits and computation reuse are recorded in bounded request audit metadata; usage has a read-only summary.

The complete flat active category list is sorted and hashed. More than 200 categories or oversized taxonomy values require manual selection rather than silently truncating the allowed list. A taxonomy change invalidates cached delivery/approval. Category existence/activity is rechecked on approval and by the existing product-save path.

## Structured extraction and employee approval

The versioned prompt treats packaging text as untrusted observations, not instructions. The provider receives only a bounded, metadata-stripped, auto-oriented recognition-ready JPEG and allowed category IDs/names. No price, inventory quantity, location, wallet/customer/order data or credentials enter the prompt. The backend reads the private object directly; request DTOs accept no arbitrary external image URL. The fixed Gemini origin does not follow redirects or enable tools, URL context, grounding, files, conversation history or automatic model fallback.

The response schema requires explicit nullable name_ar/name_en/description_ar/brand/type/category/size/unit/color/model/manufacturer/barcode fields, up to 12 bounded visible attributes, uncertain-field identifiers and needs_review. Local validation rejects extra properties, financial/inventory fields, invalid categories, oversized/coerced data and malformed observations. It checks Arabic-character presence, not semantic truth or language quality. Barcodes are readable-text observations only; no checksum verification or exact catalog lookup is claimed.

Results remain separate suggestions. An employee can approve only title, description or an existing category. Bulk approval skips nonempty fields and locally marked manual edits; individual replacement requires explicit confirmation. Expected revision, current image, request ownership/status and taxonomy must still match. The Flutter merge is field-scoped: text typed while the approval response is in flight wins. Price/quantity/location controllers are never populated from AI. Recognition can continue while the employee edits them. If the provider fails, is disabled, times out or returns invalid JSON, normal manual entry remains available.

Approval writes a bounded recognized-metadata provenance snapshot and an audit event. The worker itself does not write approved metadata, product quantities or inventory. Active employee permissions/session ownership are checked again before dispatch, including after image preparation/reservation. Cancellation or retake before dispatch avoids the call where possible; cancelling a call already in flight does not guarantee cancellation of billing.

One existing Phase 5 defect was found by real HTTP testing and fixed: transformed nested DTOs contained undefined fields, so a price-only PATCH could erase untouched title/category fields. The merge now removes undefined DTO entries, while preserving explicit null clears. The full inherited intake/commerce regressions were rerun after this integration.

## Duplicate detection and inventory boundary

PostgreSQL `catalog_search` trigram/LIKE predicates retrieve at most 60 candidate titles; at most five ranked results are returned. Arabic forms/diacritics/digits, unit equivalents, model strings, colors and pack counts are considered. Known conflicting variants are downgraded; unknown size explicitly is not an exact match. Strong review uses matching normalized title or a conservative canonical title with matching known sizes, not a fabricated calibrated confidence percentage. An overlapping memory size cannot hide a conflicting volume; a shared model/size cannot alone establish a different brand as the same product.

The UI shows image, category, availability, reasons/conflicts and inspection/stock-in actions. Initial suggestions can include advisory candidates; explicit review refreshes candidates against current approved employee metadata. Selecting an existing product reuses the original Phase 5 STOCK_IN flow and clears the previous location, including zero-stock products. It does not overwrite the existing product's image/metadata or discard the new capture.

Every NEW intake submission checks fresh candidates **inside the original serializable transaction**, after idempotent replay and before product creation. A new strong candidate requires review (409) with no product/stock commit. Distinct-product approval binds current revision/metadata/image/candidate set; editing the draft or introducing a new candidate invalidates it. It is audited, not a hidden bypass. An actual two-employee concurrent same-title test produced one commit and one review response. This is a specific tested race, not a universal uniqueness guarantee. Legacy non-intake product forms are not converted into a new globally unique catalog.

Stock still goes through Phase 4's transaction-scoped stock-in primitive. Verified: a new physical opening of 10 creates one listing/one opening; adding 5 to an existing product yields 15, once, with no second listing. Same-key replay, response-loss recovery, invalid location rollback, concurrent receipts, wallet/COD reservation/refund/cancellation/shipping and reconciliation protections are retained. AI never bypasses the original permissions, quantity validation, location selection, ledger locks or idempotency key.

## Costs, privacy and provider readiness

Defaults are off on both server and Flutter (`AI_RECOGNITION_ENABLED=false`); mock mode and zero budgets are the local defaults. `docs/phase6-local.env.example` documents flags without secrets. Live use additionally requires explicit live approval, paid-data-terms acceptance, account/model verification, a model revision, a provider review no older than seven days, securely supplied key, positive dated price rates and daily/monthly budgets. These operator attestations are gates, **not evidence that the account was actually checked during this task**.

Requests have daily global, per-employee, rolling-hour and per-model quotas, per-employee pending limits, a global pending cap, concurrency and re-analysis limits. Reservation is committed under a PostgreSQL advisory lock before the provider call. Decimal(18,9), rounded conservatively upward, is used, with prices snapshotted per attempt. Reservation uses the documented entire input/output ceilings, not a guessed image token count: $0.360448 for the reviewed 3.1 rates, $0.4784128 for the 3.5 rates. Uncertain billing retains the reservation. Reported visible output **and thinking tokens** enter computed estimates. Missing components retain a conservative reservation. There is no automatic paid retry or costlier fallback. `actualBilledUsd` remains null without reliable billing evidence.

The PostgreSQL budget test uses explicitly marked synthetic ledger rows, a fake nonworking key and no provider instance/fetch. Those rows are excluded from the human usage summary and are not real charges. All external inference requests in this task: **0**.

| Model | Documentation | Actual access / vision+JSON quality / latency p50+p95 / real tokens+cost |
| --- | --- | --- |
| Gemini 3.1 Flash-Lite | Preferred configurable adapter model; documented image input and structured output | NOT VERIFIED / NOT TESTED |
| Gemini 3.5 Flash-Lite | Optional allowlisted selection, never automatic fallback; [documented multimodal limits](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) reviewed | NOT VERIFIED / NOT TESTED |
| Gemini 2.5 Flash-Lite | Not enabled as a fallback or implemented selection in this phase | NOT TESTED; reference prices are not proof of current account availability |

No live model recommendation or measured quality/cost comparison can be made. For capacity planning only, assuming 1,500 input + 500 total output/thinking tokens, 3.1 arithmetic is $0.001125/recognition; 500 / 3,000 / 10,000 per day over 30 days would be $16.875 / $101.25 / $337.50 before caching, retries, tax or rate changes. These are hypothetical estimates, not measurements or configured capacity. Default quotas are far lower. Production load/DB query plans on a representative catalog remain unmeasured.

## Evaluation limitations and physical validation

The available 50-case evaluation is explicitly a **synthetic text rule corpus**: five repeated brand tokens × ten variant cases, not 50 independent products or photos. Its deterministic strong-review labels produced TP=20, TN=30, FP=0, FN=0 (precision/recall 1.0 on that curated corpus only). This does not establish real-world matching precision/recall, Arabic naming quality, hallucination rate or live model accuracy. No 50-photo, manually reviewed representative product corpus has been evaluated. Unknown sizes, Arabic/English brand aliases, unseen specifications, packaging changes and catalog titles with missing identity information remain material matching risks.

Physical test target: `integration_test/phase6_recognition_device_test.dart`; separate debug package `com.singlestore.admin_app.phase6qa`, label “ريزونا — تعرّف QA”. It uses the real camera and isolated services, clearly labeled mock suggestions, explicit empty-field approval and the normal UI submit plus replay/readback. It must not be distributed as a release; its test entrypoint can create synthetic QA stock. The runner verifies package/hash, uses explicit install -r and attaches a driver to the installed application, with no uninstall/clear-data fallback. Original customer/admin and Phase 5 QA packages are separate and were not replaced.

Online Android Maven metadata resolution failed due to DNS; an offline-only Gradle init script pins the **already cached satisfying test runner 1.3.0** for these QA invocations. It does not modify normal/release dependency resolution. The APK then built successfully; installation was rejected by Xiaomi. The user then chose to continue without installation; no further install is authorized in this task. Camera/end-to-end timings, before/after like-for-like benefit, background/resume behavior on this Phase 6 package, and physical acceptance remain NOT VERIFIED until a separately approved test actually passes. Previous Phase 5 measurements are not relabeled as Phase 6 results. Even a future USB-loopback debug pass would not establish live inference, release mode or mobile-WAN behavior.

## Files and reproduction

Backend implementation: `src/ai/{ai.config,ai.module,recognition.schema,recognition.provider,recognition-image,recognition.service,recognition.runtime,recognition-budget.service,duplicate-detection.service}.ts`; intake recognition controller/module/service, the bounded duplicate-error response in the exception filter, Prisma models/migrations and recognition tests. Existing intake tests only received the new dependency mock; e2e guards gained an exact Phase 6 loopback/database allowlist, not an arbitrary test URL bypass.

Flutter implementation: existing intake models/repository/editor plus `intake_recognition_remote.dart`, `intake_recognition_card.dart`, their tests, the physical target/driver and a dedicated debug-only Gradle QA package selector. No customer app source change was needed for Phase 6.

Guarded local tools: `scripts/phase6-recognition-qa.cjs`, `phase6-recognition-checks.cjs`, `phase6-budget-qa.cjs`, `phase6-migration-qa.cjs`, `phase6-test-matrix.cjs`, `phase6-text-evaluation.cjs`, `phase6-device-validation.cjs`, `phase6-qa.init.gradle`. The migration runner refuses to overwrite existing scratch targets. They use Phase 6 loopback services: PostgreSQL 55448, Redis 56388, MinIO 59048, API 58473 (device) / 58475 (checks). Protected Phase 5 ports/databases are never used as write targets. Read-only pg_dump was used solely to create the separate upgrade clone.

PowerShell local reproduction (not production deployment):

```powershell
$env:REZONA_PHASE6_QA='1'
node scripts/phase6-test-matrix.cjs backend
node scripts/phase6-test-matrix.cjs mobile
# No other Phase6 serve process should consume the mock queue during isolated checks:
node scripts/phase6-recognition-qa.cjs checks
node scripts/phase6-recognition-qa.cjs intake-regressions
node scripts/phase6-recognition-qa.cjs commerce-regressions
node scripts/phase6-budget-qa.cjs
node scripts/phase6-text-evaluation.cjs
# Physical only after QA server, normal user install/camera approval:
node scripts/phase6-recognition-qa.cjs serve
# Separate terminal:
$env:PHASE6_OFFLINE_BUILD='1'
node scripts/phase6-device-validation.cjs build
node scripts/phase6-device-validation.cjs test
```

## Future staging checklist, compatibility and rollback — NOT EXECUTED

1. Obtain explicit staging authority; verify inherited Phase 3/3.1/4/5 NO_GO items, retention/access policy, tested database/media backups and realistic release/WAN acceptance. Do not infer that these local services are staging.
2. Keep both AI flags off. Apply the three additive migrations in timestamp order, generate the matching Prisma client, deploy the matching API/worker build, confirm all old stock/commerce invariants and schema version. Do not include unrelated Prisma diff drops/default changes.
3. Validate real older customer APKs against staging; Phase 6 changes no customer checkout contract, but this binary compatibility has not been directly tested here. Older admin intake clients work with the AI flag off. With the server flag on, an old client can receive the new duplicate-review 409 without the new distinct-review UI: **coordinate upgraded admin clients before enablement**, do not silently bypass the guard for old headers.
4. With separate future approval, secure a key on the server, review region/billing/quota/data terms and model revision using the actual account; perform an explicitly bounded image+JSON capability check on approved non-sensitive photos. Attestation flags alone are insufficient acceptance evidence. Never send keys in chat or Flutter defines.
5. Collect/review at least 50 representative approved product photos and labeled catalog identities; measure model quality, failures, cache behavior, p50/p95 latency/tokens/estimated costs and compare allowed models. Run representative duplicate-retrieval plans/load tests, native lifecycle tests, physical warehouse/operator acceptance and a like-for-like before/after intake benchmark. No threshold or speedup from the synthetic corpus may substitute for this.
6. Only after approval and evidence, choose explicit quotas/budgets, enable in a controlled environment and monitor failures/UNKNOWN reservations/cache reuse/latencies. Current flags are global; no per-employee rollout/config-write UI was invented. Read-only usage follows existing owner vs employee scope.

Rollback: turn off server/Flutter AI flags and stop initiating new model work, preserving manual Phase 5/Phase 4 operations. Keep pending/UNKNOWN tasks, reservations, source references, receipts and audit history for reconciliation. Do not issue new intake operation keys to “retry” a committed receipt. The old API can run against additive tables with AI off; retain those tables rather than destructively dropping them. An already dispatched external request cannot be assumed unbilled. Do not undo committed stock by deleting a movement or directly rewriting quantities; use the existing audited inventory workflow if a business correction is required.

## Remaining blockers and Phase 7 boundary

No unconditional Phase 6 completion or production GO is claimed. Live access/JSON capability, representative photo quality, actual costs/tokens/latencies, physical Phase 6 flow, release/WAN behavior and production-sized matching performance are unresolved. Retention/GC for original captures, private recognition results and audit history needs an approved policy; no unsafe deletion job was introduced. Prompt/schema constraints do not prove visual facts, prevent all hallucinations or guarantee all duplicate variants are detected. Legacy creation routes and incomplete catalog identity mean no global uniqueness guarantee.

Inherited performance, dependency exceptions, staging, old-binary and warehouse acceptance blockers remain open. The current task did not redeploy, push Git, mutate customer wallets/orders or begin pricing automation.

Future Phase 7 may consume a versioned employee-reviewed recognition snapshot, product identity candidates and explicit provenance. Any pricing suggestion must be a separate permissioned/reviewed feature with its own budget and acceptance criteria. It must not gain authority to choose inventory quantity/location, merge products or mutate wallet/order/stock records. No Phase 7 service or automatic pricing path was implemented.
