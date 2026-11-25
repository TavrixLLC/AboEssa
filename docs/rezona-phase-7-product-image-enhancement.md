# REZONA Phase 7 — product image enhancement

Status: local deterministic/mock implementation validated within the limitations recorded below; production NO_GO. No deployment, Git push, production/customer-data mutation, paid inference or later phase is authorized. Prior paid-call and device-install deferrals remain respected unless separately changed by the user. The current Phase 7 request is image preparation, not the hypothetical future pricing feature mentioned in the historical Phase 6 report.

## Mandatory audit — recorded before schema changes (2026-11-20, Asia/Baghdad)

Read the complete current Phase 6, 5, 4, 3 readiness and 3.1 performance reports and the current dirty source rather than relying on HEAD. No applicable AGENTS.md was found in the workspace. Previous source changes, display retirement and QA evidence must remain intact.

- FileAsset stores immutable upload keys, private-intake state and a publication-bound product association. ProductIntakeImage retains the original asset, SHA-256 of MIME + original upload bytes, and immutable per-session client image ID. Never replace that source association: Phase 6 must continue recognizing the captured source.
- MediaController rejects unknown/uncommitted `products/intake-*` keys before storage. Original/variant/manifest/catalog lookup checks require an approved product, ACTIVE/available state and exact current image reference. New derivatives will use the same private prefix and FileAsset mechanism, not another unrestricted media route or bucket policy.
- Phase 2 already supplies a durable DB/BullMQ optimizer and 40/240/480/1024px WebP/JPEG content-hashed variants. Candidates will use that optimizer after acceptance; acceptance is not publication.
- Phase 5's serializable, idempotent submission creates one DRAFT product and a physical opening through the Phase 4 stock-in primitive in the same transaction. Only its selected FileAsset resolver needs extension; quantity, wallet, order, auction, location and stock authority must not change. STOCK_IN must ignore the candidate for catalog association.
- Phase 6 recognition jobs/duplicate decisions operate on original image identity and approved metadata. Selecting an enhanced output must not rewrite those fields or invalidate an unrelated duplicate decision merely by incrementing the business draft revision.
- Phase 6 RecognitionUsage is an existing precise reservation ledger. Its mandatory recognition FK currently prevents legitimate editing entries, and its provider='gemini' aggregate would miss fal spend. Extend that ledger with an exclusive nullable editing-job reference/purpose and shared lock/budget accounting; do not fabricate recognition tasks or create an inconsistent second ledger.
- Flutter's existing IntakeRepository, encrypted employee/origin journal, per-draft queues, Cubit and bounded preview caches are the integration points. Add independent enhancement state and a media-selection revision; never recreate metadata controllers on candidate completion.
- Existing product image editing is permissioned by products.edit/manage; stock receipt is not image replacement authority. Phase 7 will not add implicit replacement of an existing product's media.

## Integration design before implementation

1. Add scoped enhancement jobs/candidates/decision history and extend the existing usage ledger. A decision has its own monotonic selection revision and idempotent key, checks the current business revision/image and serializes on the session row, but does not mutate approved metadata or increment the business revision. Final NEW submission revalidates the selected candidate in the original transaction; its FileAsset is associated there. Retake falls back to original, not an old candidate. Feature flags default off.
2. Preserve the source. Deterministic CLEAN fits the entire oriented photograph on a neutral square without stretching, unsafe automatic crop, synthetic product details or default exposure changes. Transparent-source composition and optional conservative uniform-edge matting are separate, review-required paths. Complex/low-contrast/ambiguous masks fail to original rather than fabricate parts.
3. Run CPU-heavy decoding/composition in a bounded child process, with byte/pixel/time/resource guards and no provider secrets in the child environment. Keep the API event loop available for ordinary commerce. Use the existing storage/optimizer and Redis infrastructure, plus durable job leases/outbox recovery.
4. Optional neural segmentation is not an application prerequisite. Evaluate current rembg/U2Net licensing/provenance/runtime requirements before adopting weights; do not install Python/PyTorch or automatically download unreviewed model weights. Provide an explicit disabled capability if licensing/quality/checksums are not established.
5. Implement server-only fal/Gemini image-editing adapters with fixed HTTPS origins, bounded binary/data-URI input/output, no public draft URL, conservative versioned prompt, explicit authorization/budget gates and mocks. Do not make live calls. Prefer background-only recomposition using captured foreground pixels; a prompt or similarity score is not identity proof. No automatic paid fallback or ambiguous paid retry.
6. Extend existing admin intake with original/candidate comparison, zoom, accept/reject/keep-original, warnings and independent progress. Persist request/decision identities before network activity. No metadata, price, quantity or location changes on image completion/approval.
7. Create dedicated Phase 7 QA resources, never write to protected Phase 5/6 fixtures. Test real HTTP/Postgres/Redis/MinIO/BullMQ, original/variant privacy, replay, retake, cancellation, restart, ledger budgets and existing commerce. Benchmark local codecs and available authorized photos; do not relabel synthetic examples or past native tests as real Phase 7 acceptance. Physical installation and paid testing require the separate approval previously deferred.

## Documentation observations — not account access or measured quality

Reviewed official [fal endpoint schema](https://fal.ai/models/blackforestlabs/flux-3/klein/edit-image/api), [fal queue behavior](https://fal.ai/docs/documentation/model-apis/inference/queue), [fal terms](https://fal.ai/legal/terms-of-service), [Gemini image guide](https://ai.google.dev/gemini-api/docs/image-generation), [Gemini model](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite-image), [pricing](https://ai.google.dev/gemini-api/docs/pricing) and [terms](https://ai.google.dev/gemini-api/terms).

fal's documented endpoint accepts image_urls including base64 data URIs, supports explicit image_size and png output, and documents sync_mode data-URI results. Queue retries need explicit disabling; client timeout does not mean server cancellation. Its displayed current account price was not independently accessible from the rendered pricing control: the supplied $0.008–$0.014 figures remain planning references, not verified billing. No account access, retention arrangement or live output is verified.

Google currently documents gemini-3.1-flash-lite-image separately from text recognition, with 1K image output equivalent to $0.0336 plus applicable inputs/text/thinking. This is not a measured usable-image cost. Paid-data terms/retention and exact account/model revision still need review before any real photo transfer.

[rembg](https://github.com/danielgatis/rembg) has an MIT library license, Python/ONNX requirements and separately licensed weights; its current default BRIA model requires a commercial agreement. [U2Net source license](https://github.com/xuebinqin/U-2-Net/blob/master/LICENSE) is Apache-2.0, but provenance/checksums/commercial rights and actual quality of any specific converted weights must be established separately. No weights or sidecar have been adopted or downloaded by this audit.

## Evidence and readiness

At audit time implementation/testing/benchmarks were pending; completed evidence and outstanding limits follow. Carry forward all inherited NO_GO items: rendering tails, genuine Wi-Fi/mobile-WAN staging coverage, retained MinIO chain advisories, signing/release/older-binary acceptance, physical warehouse/operator reconciliation, Phase 5 retention, Phase 6 live quality and physical acceptance. Local Phase 7 success cannot waive them.

---

## Final local implementation review — 2026-11-20 (Asia/Baghdad)

### 1. Outcome and authorization

The deterministic preparation, private candidate lifecycle, human selection, durable jobs and existing NEW/STOCK_IN integration are implemented and exercised locally. This is **not production approval**, not general-purpose warehouse segmentation acceptance, and not a verified live AI feature. The user authorized available samples only, not a new 50-photo dataset. Previous paid-call and physical-install deferrals were respected. No production deployment, Git push, production/customer-data write, real inference, image transfer to a provider, model-weight download or later phase was performed.

### 2. Audited integration points

The pre-change audit above remains the design record. Existing ProductIntakeSession/ProductIntakeImage, FileAsset, Phase 2 codecs/variants, Phase 4 inventory primitives, Phase 5 journal/editor and Phase 6 recognition/duplicate guard remain authoritative. No replacement registration module, alternate stock ledger, wallet/order schema or customer screen was introduced. Previously dirty changes and retired display files were not reset or restored.

### 3. Additive schema and migration

Migration `20261120000400_product_image_enhancement` adds four tables: scoped computation jobs, durable client-request aliases, immutable candidate/asset lineage, and append-only-by-service selection decisions. Session `mediaRevision` is independent from business `revision`. RecognitionUsage gains nullable `enhancementJobId`, nullable recognition `taskId`, purpose and usage details. A SQL CHECK requires recognition XOR editing ownership; unique job/attempt reservations prevent duplicate accounting. Existing task/attempt uniqueness is retained.

These additions have no destructive down migration. Original FileAsset/ProductIntakeImage references remain unchanged. Decision history has no update/delete API; it is application-append-only, **not a claim that a privileged database user cannot rewrite it**. Foreign keys restrict deletion. Existing stock append-only/database invariants are unchanged.

### 4. Deterministic CLEAN recipe

`clean-v1` validates supported raster input, auto-orients, strips metadata, converts to sRGB and fits the entire oriented photo into an 880px inner area of a neutral 1024px square, without enlargement or distortion. It never automatically picks one object, removes damage, rewrites labels, changes color/exposure or crops product parts. PNG is a lossless master of the resampled image, not a claim of losslessness relative to a compressed/resized capture. Large sources receive a fine-print review warning. CLEAN preserves a cluttered scene; **adding white margins is not background removal**.

### 5. Local background removal and studio composition

Working paths are existing source alpha and an explicitly enabled conservative near-white, border-connected flood-fill matte. The latter requires a highly uniform white perimeter, meaningful foreground area and contrast. It removes only connected near-white background, not arbitrary scenes or a guessed single object; multipiece captures are not intentionally reduced to one object. BACKGROUND_REMOVE and STUDIO_COMPOSITE retain foreground and compose neutral white/light-gray canvases. Thin, white, reflective and transparent features require review. Unusable/ambiguous masks fail to original. No cast-shadow synthesis, artificial product reconstruction, automatic cropping or automatic metadata approval was added.

### 6. Neural segmentation evaluation

No neural runtime or weights are installed. `neuralSegmentation:false` is an honest capability, not a silently downloaded fallback. The audited rembg/ONNX route is technically plausible but needs separately verified weight rights, provenance/checksum, startup/decode/RSS/CPU limits and warehouse quality acceptance. Python/ONNX plus model distribution would expand deployment substantially; unreviewed commercial weights are not justified by a library's open-source license. This remains an explicit limitation, especially for the available cluttered real photo. Library/source references are in the audit above; no commercial-rights conclusion for a particular converted weight file is asserted.

### 7. Replaceable editing provider and mock

Server-side ImageEditingProvider accepts prepared bounded JPEG bytes and returns an image result. The deterministic mock returns a neutral background and has in-memory-only fault fixtures. It cannot be configured through customer HTTP. Mock results are labelled QA in the editor and never represented as real product understanding. Local CLEAN does not need recognition, a model key, a paid allowance or an image-editing ledger reservation.

### 8. fal adapter and optional Gemini status

The fal adapter uses fixed `https://fal.run/blackforestlabs/flux-3/klein/edit-image`, inline input, one 1024px PNG output, prompt expansion off, safety checking on, sync-mode inline output and no redirects. Arbitrary provider URLs, including CDN URLs, are rejected rather than fetched or proxied. A sanitized response request ID is retained when available. The synchronous design deliberately does **not** pretend to support durable queue-result retrieval: ambiguous outcomes require operator reconciliation, never another POST automatically.

Current documented headers disable retries and automatic fallback, disable request-history payload storage and request one-hour object expiry. These are not universal zero-retention guarantees or verified account settings. See [fal platform headers](https://fal.ai/docs/documentation/model-apis/common-parameters) and [retention](https://fal.ai/docs/documentation/model-apis/media-expiration). Current exact account price, entitlement, deployment/checkpoint revision, terms and actual billing are UNVERIFIED. The configured revision is provenance/config context, **not cryptographic proof of fal's backend checkpoint**.

Gemini image editing is explicitly unavailable (`IMAGE_GEMINI_ADAPTER_UNVERIFIED`), although its optional configuration/model name is reserved. Its changing current API/account contract was not validated sufficiently to ship a working paid adapter. Text recognition from Phase 6 is unaffected. The earlier official Gemini pricing observation is planning context only; no provider ranking, measured usable-image price or live-quality comparison is claimed.

### 9. Product identity and quality controls

The versioned background-only prompt is advisory, not an identity guarantee. AI mode requires a usable source matte **before** reserving/dispatching. Generated foreground pixels are not selected: captured, oriented/resampled foreground is recomposited over an output that must pass a stringent near-neutral-background gate. Non-neutral/added-scene outputs fail. Raster type, dimensions, size and decoding are validated; unsupported/SVG/animated output cannot be accepted. All successful candidates remain REVIEW_REQUIRED. Central captured-color preservation is tested; mask correctness and all tiny label details are not proven by that pixel test. Human review remains mandatory.

### 10. Durable async processing

Postgres is the job/outbox authority; a separate bounded BullMQ queue dispatches existing IDs. One worker per process handles an image at a time. Conditional lease/token/status updates fence duplicate/expired/cancelled workers. Local transient work can retry within three attempts. Processing leases expire after 150s. Local interrupted work returns to PENDING (or terminal after the cap); external interrupted work becomes UNKNOWN. A cancelled late writer cannot create a selectable candidate. Read/storage and provider timeouts are bounded; late storage objects remain inaccessible orphans, not automatically deleted originals.

### 11. Idempotency, cache keys and regeneration

The job identity includes session, immutable capture ID/hash, mode/background, recipe, provider/model/configured revision, prompt version and explicit generation. Repeated POSTs and separate client aliases reuse that scoped computation, not another employee's authorization. The alias table detects reuse of one key with different parameters. No public cache is used for private bytes. Decisions also persist payload hash/key for lost-reply replay. External generation is capped at three jobs per capture across background/model contexts (initial plus two explicit regenerations); UNKNOWN predecessor work cannot automatically regenerate. Local deterministic retries never create a paid fallback.

### 12. Flutter coordinator, comparison and restart

The existing IntakeRepository/Cubit/local encrypted employee-origin journal remains the sole coordinator. Independent enhancement JSON and request/decision keys are saved before HTTP. Auto-CLEAN can start after a confirmed immutable upload; text fields remain editable during processing. Status polling uses bounded/backed-off reads, not new computation. Completion merges media state only. Retakes and actor changes fence old callbacks. Ambiguous acceptance is replayed with its original key; unresolved acceptance blocks product submission. Definite stale-revision rejection clears the rejected pending decision so the employee can reload/review.

The existing editor now offers original/enhanced switch, side-by-side zoom, warnings, accept, reject, keep original, status refresh, cancellation and bounded local retry. No AI copy, price or stock is approved by selecting an image. A private in-memory four-entry preview cache is separate from the public catalog disk cache; candidate previews use 480px, zoom 1024px and bounded decode sizes. Original editor previews retain the existing Phase 5 480px remote/bounded local-source behavior. This is not a full-resolution forensic label viewer; native-device legibility still needs acceptance.

### 13. Transactional inventory safety

`selectedIntakeAsset` performs only database validation inside the existing serializable, idempotent Phase 5 submission: same session/capture, completed job, reviewable private candidate and unassociated FileAsset. It never calls a provider or changes a financial/stock value. NEW uses the selected asset URL and binds that asset to the one created DRAFT product in the existing transaction; existing Phase 4 opening stock is committed once. Business-revision-bound duplicate decisions are not invalidated merely by media selection. Post-selection metadata edits still use the original guards. HTTP replay, receipt, rollback and commerce regression evidence is separate from image-quality acceptance.

### 14. STOCK_IN and existing product media

STOCK_IN can retain/review its intake capture but **never** uses that candidate to replace the existing listing's image URLs. The regression confirms original catalog image and candidate's unassociated FileAsset remain unchanged. No new existing-product replacement feature was introduced; ordinary permissioned product editing remains separate and is not inferred from receipt authority.

### 15. Publication/privacy invariants

Derivative keys deliberately reuse protected `products/intake-<64hex>.png`. Unknown keys fail before storage. Source and candidate remain private during processing, rejection, acceptance and DRAFT creation. Existing original/manifest/variant gates require a real associated ACTIVE, available product and its exact current image reference. Approval is not publication. Removing the reference revokes server access; it cannot erase a previously public file already downloaded by a customer. No bucket policy weakening, public temporary image, unrestricted download endpoint or provider staging URL was added.

### 16. Optimized catalog URLs and invalidation

Acceptance schedules the existing Phase 2 FileAssetImageJob, not another optimizer. Its eight 40/240/480/1024px WebP/JPEG variants use existing content-hashed immutable URLs and visibility gates. The original is retained. Selecting a new asset creates a new URL/hash lineage; it never overwrites old hashed objects or clears every customer's image disk cache. Existing product/inventory publication notifications and scoped catalog read invalidation remain responsible for consumers. Private preview bytes are not passed into AppCatalogImage's public cache.

### 17. Shared budgeting and cost reporting

The existing RecognitionUsage ledger and PostgreSQL advisory lock 660061 account for recognition plus editing. Both fal and Gemini count toward the existing `AI_MONTHLY_BUDGET_USD`/`AI_DAILY_BUDGET_USD` global paid ceilings. Image-specific ceilings, employee/day/hour quotas, concurrency and regeneration caps apply in addition. Decimal(18,9) reservations occur before dispatch; rates/ceiling context is snapshotted. Unknown work retains its ceiling. Image output success retains the conservative commitment until reliable reconciliation; estimated/actual charges are never invented. `actualBilledUsd` remains null. Local cleanup creates no paid ledger entry.

The read-only image-enhancement-usage endpoint reports the employee's own ledger or all employees for an owner, grouped by provider/model/status, with explicit NOT_AVAILABLE actual billing. Synthetic accounting tests are excluded from human-facing summaries and marked separately. A planning $10 shared monthly allowance is not enabled: every real budget defaults to zero. At an **operator-verified** $0.02 request ceiling, $10 permits at most 500 such reservations before recognition/other commitments; that is arithmetic, not fal's verified price. The optional Gemini conservative $0.139264 bound would permit at most 71 reservations under $10, but that adapter is disabled and these are not measured usable-image costs.

### 18. Configuration and permissions

See `.env.phase7.example`. Backend `IMAGE_ENHANCEMENT_ENABLED`, local matting and AI flags default off, live/data approvals default false, budgets zero and mock default. Flutter enhancement is a separate default-off build flag. A disabled enhancement runtime returns before parsing optional provider configuration. JwtAccessGuard, admin token type, RBAC, IntakeEnabledGuard, X-Intake-Actor and session ownership apply. External requests additionally require sensitive `product_intake.enhance_paid`; workers re-read active actor/permissions/current source before work and before candidate commit. Backend-only keys never enter Dart, APK defines, returned status or media URLs.

### 19. Resource/security bounds

Existing upload admission remains MIME/signature/full-decode bounded (normal HTTP default 5MiB). Processing independently caps 12MiB, 12MP, 8192px edges and supported nonanimated JPEG/PNG/WebP. Sharp/native processing lives in a disposable child with a 128MiB JS heap cap, Sharp concurrency one/cache off and a 30s wall deadline. The child environment whitelists OS/runtime fields, not DB/provider secrets. Heap limits do not cap all native RSS: sample and boundary RSS below are snapshots, not a hard OS limit. A container memory/CPU budget and concurrent host load test remain staging requirements. Queue capacity, employee pending requests and per-draft job counts are bounded.

### 20. Automated test matrix

Current source has **694 passing automated tests**: backend 284 across 26 unit suites; backend real-DB e2e 27 across 7 suites; admin 179; customer 166; shared UI 18; API client 20. One existing optional shared-UI real-image test remains skipped. Backend build/lint and admin analyze pass. The full matrix lives under `docs/benchmarks/phase7/tests/`; counts exclude integration check groups below (not double-counted as another number of tests). Targeted enhancement tests cover pixel-preserving composition, empty output/unsafe masks/outputs, inline-only provider IO, identity/selection guards, journal replay, concurrent typing, retake, account switch and responsive card states.

### 21. Real local integration and regression evidence

Dedicated resources: Phase7 Postgres 55450, Redis 56390, MinIO 59050/bucket phase7-qa; API checks 58485. Protected Phase5/Phase6 resources received no fixture/migration writes. `checks.json` records 34 integration groups: 15 enhancement/shared-ledger groups plus 19 unchanged recognition groups, all real HTTP/Postgres/Redis/MinIO/BullMQ with **mock inference only**. Separate unchanged Phase5 intake regression: 11 groups. Phase4 inventory/commerce regression: 16 groups including wallet/COD, reserve/refund/cancellation, shipment consumption, stock receipt/transfer/adjustment, races, reconciliation and Arabic pagination. Auction/order behavior is additionally covered by existing backend/customer suites; no new auction or payment behavior was implemented.

Migration evidence verifies fresh 36 migrations and a **read-only protected Phase6 dump restored into a new Phase7 upgrade database, 35→36**. Exact pre-migration column projections in 52 tables hash identically before/after. Four new tables and ledger XOR constraint exist. The three inherited legacy-index differences and LiveSession.source default difference were deliberately not folded into this migration or removed.

### 22. Android and visual status

A separate arm64 debug package `com.singlestore.admin_app.phase7qa` was built and APK identity verified, with no install/start/clear/uninstall attempt. Current archive/hash is in `device/build.json`; it targets normal `lib/main.dart`, not a test that automatically creates stock. QA packages refuse release tasks; production package/signing/cleartext defaults are unchanged. Previous APKs were copied to hash-named local backups before rebuilding. This is not a signed release, physical camera acceptance, frame-time result, network benchmark or older-binary test.

The 320×800 and 834×1194 comparison cards were widget-tested/rendered locally, including pending/unknown/manual fallback states. Screenshot artifacts are private local QA output, **not physical device screenshots**. Render-only system Arial aliases replace missing test fonts, and Material icon glyphs may be placeholders; actual native Cairo/icon rendering remains unverified. The user deferred tablet installation, so no new physical acceptance is claimed.

### 23. Dataset and quality findings

Authorized dataset: **one distinct existing real QA product photo**, plus eight explicitly synthetic shape/text/alpha fixtures. Three repetitions per sample/mode are timing repetitions, not 54 distinct products or a 50-real-photo benchmark. Fifty-photo employee acceptance, reflective/transparent/thin-edge quality, live model fidelity and cost per accepted image remain UNVERIFIED. No percentage acceptance rate is fabricated.

Visual inspection confirms CLEAN preserves the real Rexona photo including its desk/glass/cables, with neutral margins; it does **not** isolate the can. Its BACKGROUND_REMOVE attempts all correctly refuse that cluttered image. Synthetic alpha fixtures produce clean white composition, but cannot prove ordinary opaque warehouse segmentation. Thus the broad goal of consistently professional isolated product photos from arbitrary ordinary-camera captures is **not fully achieved/validated by this limited local matte**. It needs an approved segmentation implementation/dataset or separately authorized live evaluation.

### 24. Measured local performance

`local-benchmark.json`: 9 distinct inputs × 2 modes × 3 runs = 54 operations; 51 completed, three expected unsafe-mask refusals on the one cluttered real photo. CLEAN p95 including child startup and all eight Phase2 variant encodes: **554ms**; child processing p95 **176ms**, child CPU p95 **203,000µs**, max CLEAN end-RSS snapshot **63,897,600 bytes (~60.9MiB)**. This tiny mixed synthetic set is not a production SLO, WAN latency or Android scroll metric.

`resource-boundary.json`: one 4000×3000 input; CLEAN 312ms total/202ms child, ~97.7MiB RSS snapshot; white-border removal 600ms total/496ms child, ~135.7MiB RSS snapshot. 12,003,000 pixels rejected. These are not peak/native-allocation guarantees or simultaneous commerce-load measurements. Baseline measurements were rerun after the build finished: a preliminary benchmark run overlapping `nest build` lost child files during dist replacement and was invalidated, not reported as product failure rates. Future deployment must use atomic build/version switches rather than rewriting live dist in place.

### 25. Storage, compression and cache tradeoffs

The real sample: 234,959-byte source; 1,099,360-byte CLEAN PNG master; 178,316 bytes for all eight variants. Total about **1.51MB decimal per retained source+master+variant set**, approximately 15.1GB for 10,000 equally sized images before rejected alternatives, replicas/backups/object overhead. PNG prioritizes label fidelity over master storage: it can be larger than the JPEG source. Mixed-set mean retained bytes ~269,926 is synthetic-heavy and must not be used as a real business forecast. Candidate versions/rejected outputs increase storage; dedup is scoped, not a global confidential-media sharing scheme. Private previews remain bounded memory-only; public optimized disk cache behavior is inherited, not re-benchmarked on hardware.

### 26. Files and reproducibility

Backend additions: `src/image-enhancement/*`, `src/product-intake/intake-enhancement.controller.ts`, the additive migration, `.env.phase7.example`, `tests/unit/image-enhancement.spec.ts`, `scripts/phase7-*.cjs`/offline QA Gradle init and this report/evidence. Modified integration points: schema, ProductIntakeModule/service asset resolver, permission constant/catalog, shared budget/export, recognition reaper purpose filter, exact isolated QA allowlists in two e2e tests. Mobile additions: enhancement remote/card and two test files. Existing intake repository/models/pages are extended; Android adds a mutually exclusive Phase7 debug-only package flag. No customer source or dependency/lock version is changed by Phase7.

Reproduce with explicit `REZONA_PHASE7_QA=1` and the guarded scripts: migration QA (fresh targets only, refuses overwrite), test matrix backend/mobile, enhancement-qa checks/intake-regressions/commerce-regressions, budget arithmetic, image benchmark/resource boundary and build-only QA. Do not run protected Phase5/6 launchers to produce Phase7 results. Build first, then run compiled-worker checks; do not race a dist-clearing build against a live codec. The evidence manifest records file hashes and exclusions; it is not a signature or proof of production state.

### 27. Known implementation limitations

- General clutter/background segmentation, neural weight selection, 50-real-product QA and employee acceptance are outstanding.
- Gemini editing is explicitly unavailable; fal is only contract-stubbed, never account/live tested. Provider URLs are rejected, even legitimate CDN-only results, until an approved private retrieval contract exists.
- Synchronous ambiguous paid work has no result-retrieval implementation; UNKNOWN is deliberately terminal for automatic processing and requires ledger/operator reconciliation.
- Mask/text/geometry heuristics are not semantic identity proof; human acceptance is required, and the real cluttered scene cannot yet be isolated.
- No hard native-RSS OS cap or multi-replica production-load result. One worker is per process, not a claim of one worker across an entire future cluster.
- No full-resolution remote original download/viewer, signed release, native camera/restart acceptance or old installed APK experiment in this phase.

### 28. Retention and security disposition

Sources, candidates, decisions and potentially ambiguous storage objects are retained. No automatic destructive GC, source deletion, history rewrite or provider cancellation-as-refund assumption exists. Operations must approve retention periods, legal/data processing, encryption/access/backups, provider logging/retention and orphan lifecycle before enabling production. No private photos or QA tokens/passwords are stored in repository evidence; generated QA media/APKs stay under local `D:/rezona-phase7-qa`.

No new runtime dependencies or model downloads were introduced. Existing unresolved MinIO→query-string→decode-uri-component high advisories and their prior risk assessment remain blockers; this phase did not silently force an incompatible storage upgrade. Provider documentation consultation is not an inference call; zero real inference requests and zero authorized nonzero spend occurred. Synthetic fake-approval configurations in budget tests never instantiate a provider and are explicitly not real billing.

### 29. Staging sequence, compatibility and rollback

Do not deploy automatically. Proposed sequence: back up database/object metadata and record current release; approve inherited gates/retention/security; migrate additive schema with flags off; deploy one identical API/worker version atomically with constrained CPU/RSS; confirm existing manual P5/P6 and old customer APIs; enable local CLEAN to a small employee QA cohort; run real device/camera/background/commerce-load tests and reconcile stock; only after separate consent/terms/entitlement/pricing approval consider a tiny live external pilot. No provider secret belongs in Flutter defines or logs.

Existing/manual clients may omit all new state: they continue selecting the original and using unchanged submission/missing-field contracts. New image choices are resolved on the server so old public catalogs still consume ordinary image URLs/Phase2 variants. This compatibility is exercised by unchanged regression code, **not** by installing every historical signed binary. Before allowing old staff clients to resume a draft edited by a new client, test their handling of the server-owned media choice/status in staging.

Rollback: disable new admissions/AI, drain or reconcile in-flight external usage (never POST it again automatically), stop enhancement workers, retain all additive tables/objects/decisions and keep the selection-aware server for drafts with accepted candidates. Do **not** blindly roll back to a pre-Phase7 submitter that ignores an accepted choice or to a Phase6 ledger process that cannot account for editing usage. A previously accepted candidate must not silently revert to original when flags turn off. If full code rollback is necessary, block/edit affected drafts or explicitly review their selection before rollback; keep migrations and public assets. Do not drop columns, delete originals or run a destructive down migration as routine rollback.

### 30. Readiness verdict and inherited gates

**Local deterministic/mock workflow: functionally implemented and verified within the stated evidence. Production: NO_GO.** General professional warehouse isolation/employee quality acceptance is not signed off. Live fal quality/latency/billing/retention/revision, optional Gemini editing, neural segmentation, real dataset breadth, physical/release/old-binary acceptance and production concurrent load remain unresolved.

Inherited Phase3/3.1 rendering tails (28.164/43.048/54.48ms vs 16.67ms observed), genuine staging Wi-Fi/cellular WAN coverage, MinIO-chain advisories, signing/release compatibility, warehouse/operator reconciliation, Phase5 retention and Phase6 live/physical acceptance remain unchanged blockers. Phase7 did not waive them, deploy production or begin Phase8. The safe next step is review of this local result and choosing/approving realistic foreground segmentation/device acceptance, not automatic publication.
