# REZONA Phase 7.2 — Gemini brand studio

Review: **2026-11-22, Asia/Baghdad**. **Local implementation and mock-backed QA verified; live Gemini and production NOT approved. Production remains NO_GO.** No production/staging deployment, Git push, device installation, external photograph transfer, free-tier inference or paid inference occurred. All positive approval flags/keys used by contract/accounting tests are synthetic and never authorize a real request.

## 1. Architecture audit and scope

Read the complete Phase 5, 6, 7 and 7.1 reports, inspected both dirty worktrees, existing private captures, segmentation transforms, enhancement service/worker/provider, budget ledger, Phase 5 transaction and Flutter journal/review card before implementation. Existing unrelated changes were retained. No applicable AGENTS.md was found. No runtime dependency or lockfile upgrade was introduced.

The new `GEMINI_BRAND_STUDIO` mode extends the **same** enhancement jobs, request aliases, candidates, decisions, PostgreSQL outbox, BullMQ queue, RecognitionUsage ledger and private FileAsset storage. It does not introduce a second upload, product registration, warehouse, publication or optimization system. Recognition remains a separate advisory metadata lane. The legacy `AI_ENHANCE` Gemini route remains unavailable intentionally: Gemini now requires the new approved-Phase7.1-mask mode, not the old approximate-matting input.

Flow: original capture → reviewed Phase7.1 mask → prepared captured foreground → background-only provider request → local captured-pixel composition → private candidate → explicit employee decision → existing Phase5 NEW/STOCK_IN transaction.

## 2. Actual visual identity and configurable photography profile

Inspected the active `AppTheme.rezonaCustomer()` and `AppTheme.rezonaAdmin()` in `AboEssaMobile/packages/shared_ui/lib/src/theme/app_theme.dart`, their app wiring, color tokens and typography. The legacy generic blue palette is **not** REZONA's active storefront theme.

| Surface | Extracted tokens |
| --- | --- |
| Customer | gold `#F4C46C`, pressed gold `#B87B28`, canvas `#08090B`, surface `#141517`, elevated `#1D1E20`, ink `#F8F6F1` |
| Admin | gold `#E7BC61`, canvas `#0C0F0F`, surface `#151919`, border `#2B3030`, ink `#F4F4F1` |
| Typography | Cairo; existing Noto Sans Arabic, Manrope, Arial and sans-serif fallbacks |

`REZONA_CATALOG_STUDIO_V1`, revision `neutral-provisional-v1`, prompt `rezona-background-plate-v1`: 1024×1024, light `#F8F6F1`/white background, centered aspect-preserving foreground, ≥72px margins, no upscaling/cropping, diffuse light, locally rendered soft contact shadow with opacity ≤0.10. Actual gold accents are optional and **off by default**. No lettering, decorations, badges, extra objects or repairs. Typography is not drawn onto the photograph.

This is a **provisional photography direction**, not an invented owner-approved brand standard. Live use also requires an explicitly approved profile. Backend-only `GEMINI_BRAND_STUDIO_PROFILE_JSON` can replace the validated complete profile with a new revision/prompt version; its content hash fences existing jobs. Employees cannot supply a prompt, palette, model, URL or API key in HTTP requests.

## 3. Official API verification versus actual account access

Public official documentation was checked on the review date. Documentation access is not model/account acceptance.

The [model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite-image) lists stable `gemini-3.1-flash-lite-image`, image input/editing, text/image output, 1K square support, 65,536 input and 4,096 output token ceilings. Larger image sizes are not enabled here. This model is not the text-only recognition model. No automatic model substitution is implemented.

The supported [GenerateContent REST contract](https://ai.google.dev/api/generate-content) supplies inline image parts and generation configuration; the adapter uses `imageConfig: {aspectRatio: "1:1", imageSize: "1K"}`, TEXT/IMAGE response modalities and at most 4,096 output tokens. It reads one completed non-thought inline image, response/model identifiers and whitelisted usage components. The [image guide](https://ai.google.dev/gemini-api/docs/image-generation) documents image editing and provider-generated provenance/watermarking. This integration does not promise watermark-free AI output or authoritative generated lettering.

The [published standard prices](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-flash-lite-image) observed were $0.25/M input tokens, $1.50/M text/thinking output, and $30/M image output; 1K image output alone is listed as 1,120 tokens/$0.0336. That is **not** the complete request cost, invoice amount or cost per accepted photograph.

[Quota documentation](https://ai.google.dev/gemini-api/docs/rate-limits) directs users to their project limits; no project quota has been checked. [Available regions](https://ai.google.dev/gemini-api/docs/available-regions) includes Iraq, but does not establish this account's entitlement, billing status or processing locality. [Provider error guidance](https://ai.google.dev/gemini-api/docs/troubleshooting) discusses throttling/transient failures; this image integration deliberately does not blindly retry possibly billed work.

**NOT VERIFIED:** real key configuration, authenticated model access/revision, account quotas, billing entitlement, actual schema acceptance by that account, real quality, token completeness, latency, final billing or provider retention acceptance. No authenticated Google request was made. The real transport was exercised only with an intercepted in-process HTTP stub.

## 4. Implemented real adapter and security boundary

`gemini-studio.provider.ts` uses existing Node fetch and the official fixed HTTPS `generativelanguage.googleapis.com/v1beta/models/...:generateContent` endpoint. Keys are backend header values, never URL parameters or Dart defines. There is no SDK retry layer, arbitrary hostname, redirect, result-URL download, Search, grounding, tools, Files API or conversation reuse.

Only the bounded 1024px metadata-stripped prepared product reference and style instructions are sent. The unmodified original remains the local identity authority; unrelated scene, price, quantity, employee/customer/order and warehouse data are not intentionally sent. Input is ≤6MiB; streamed response JSON ≤17MiB, inline decoded image ≤12MiB; accepted raster formats are PNG/JPEG/WebP, single-frame, exactly 1024×1024, fully decoded. Unsafe, truncated, URL-only, multiple-image, blocked and incomplete responses fail closed. HTTP/network/timeout uncertainty retains conservative accounting and never triggers another automatic POST.

## 5. Durable jobs and immutable lineage

Job parameters snapshot source candidate, source acceptance decision/media revision, mask asset/hash/recipe/model revision, complete style/hash, employee mask review and per-request private-transfer consent. Job columns retain original hash, provider/model/operator-reviewed revision, prompt/recipe and generation. Candidate processing details additionally retain composed foreground/plate hashes, source dimensions/crop, provider usage and returned model version when available.

Start requires an explicitly selected completed `NEURAL_BACKGROUND_REMOVE` candidate, a private unassociated source/mask, recorded mask SHA-256 and employee review. CLEAN is **not** an isolation source. Ambiguous/clipped-source warning states are blocked. Older candidates without a mask hash require a fresh local segmentation, not a silent trust upgrade.

Workers recheck actor permissions/current capture/lease, source and mask bytes, style/model context and source acceptance. They recheck after reservation, before dispatch and before candidate commit. Retake, cancel, mask revocation or another media decision fences late output/acceptance. Request replay returns the original identity. At most three explicit studio generations per capture; prior pending/UNKNOWN jobs **or RESERVED/UNKNOWN usage on a cancelled job** block another request, including generation-zero/reselection attempts. External crash recovery is UNKNOWN, not a paid retry.

## 6. Product-pixel preservation and limits

The worker reconstructs foreground from the **captured original RGB and raw Phase7.1 mask**, with the same ≤10/≥245 alpha snapping, source alpha, zero-alpha bounding box and aspect-preserving lossless resize. It never extracts product RGB from Gemini's output or from an opaque white preview. Geometry, printed identity and all selected disconnected parts remain captured pixels; output is never a generated product reconstruction. Source originals/masks are not rewritten.

Generated content is treated only as a background plate. Full-plate validation, **including pixels subsequently hidden behind the product**, rejects nonneutral/dark/high-contrast/structured artifacts, transparency, wrong dimensions and obvious ghost silhouettes. A bounded locally blurred contact shadow and captured foreground are composited afterward. Sharp runs in the existing disposable, secret-free child: cache off, concurrency one, 128MiB JS heap limit, 30s watchdog and bounded input decode. The JS heap is **not** a hard native-RSS/container limit.

This strict neutral/low-frequency gate may reject legitimate artistic backgrounds and is **not semantic proof** against every faint silhouette. Source-mask quality is still decisive: a perfectly preserved wrong mask can omit the actual product. Human original/isolation/styled comparison remains mandatory. No package repair, text synthesis, background-included “identity guarantee”, broad 50-photo acceptance or live Gemini fidelity is claimed.

## 7. Privacy and permission review

The [Gemini terms](https://ai.google.dev/gemini-api/terms) distinguish paid-project data handling from unpaid services. Paid prompts/responses are not used to improve Google's products under the cited terms, but limited abuse-monitoring logging and potentially international processing remain; this is **not zero retention or local-only processing**. Commercial deployment still needs owner/legal review of rights, data processing, retention, account/billing and selected-photo consent. No real transfer consent was inferred from this implementation request.

New sensitive permission: `product_intake.gemini_studio`, in addition to existing JWT/admin/intake/upload/session ownership guards. Generation remains backend-only; worker permissions are rechecked. Draft originals, masks, previews, rejected/accepted candidates and unpublished variants retain existing publication-bound visibility. No public staging photo URL or bucket-policy relaxation was added. Retention/GC remains disabled pending the inherited approved policy.

## 8. Live gates and shared cost accounting

`.env.phase7-2.example` documents disabled defaults: feature/live/private-transfer/terms flags false, provider mock, concurrency one, monthly and fixed-pilot ceilings zero, model revision/account verification UNVERIFIED, provisional profile. Live additionally needs the exact reviewed model, secure key, review no older than seven days, approved style, selected-photo consent and positive **shared AI, image-edit daily/monthly, studio monthly and fixed-total-pilot** budgets. Existing employee daily/hourly quotas and global concurrency also apply. No positive real budget was configured.

The existing ledger lock 660061 reserves **$0.139264** before dispatch: the entire documented input ceiling at $0.25/M plus all 4,096 possible output tokens conservatively at $30/M. It is an upper-bound planning reservation, not a measured charge. Published image-only prices do not replace it. UNKNOWN retains the commitment; even successful output does not automatically release it without reliable reconciliation. Complete reported token components can produce a separate estimate; missing components remain unknown. `actualBilledUsd` stays null. Read-only owner/self summaries exclude explicitly synthetic accounting rows.

The PostgreSQL accounting test retains synthetic prior rows instead of deleting them; its cap is based on that retained baseline plus $0.20. One new $0.139264 ceiling fits; the next fails both fixed-pilot and shared-global exhaustion tests. The fake key/config never reaches a provider. These rows are marked synthetic, not billed work.

## 9. Flutter employee review

Extended the existing journal/repository/card, not a new intake form. Arabic actions include تطبيق تنسيق ريزونا, comparison, acceptance, rejection, keep-original and bounded regeneration. A selected locally approved mask is required; the dialog identifies mock versus external transfer and asks for source review. Status/profile/provisional warnings are visible. Comparison shows original, local isolation and proposed result, vertically scrollable on narrow screens and alongside one another on tablets, with zoom.

Request key, source candidate, mask review and transfer consent are persisted **before POST**. A dialog returning after retake cannot attach its old mask to the new capture. Media results do not reset title/description/category/price/quantity/location/recognition/duplicate decisions. Employee data entry can continue while processing. Acceptance remains separate from publication. These are repository/widget validations, not physical-device employee acceptance; no new APK was installed in this phase.

## 10. NEW, STOCK_IN and Phase2

The existing Phase5 serializable/idempotent NEW transaction binds the explicitly selected private image, creates DRAFT and commits one Phase4 physical opening. Image work never runs inside that stock transaction. Acceptance schedules the existing eight Phase2 immutable variants. STOCK_IN can retain styled intake artifacts but does not replace existing catalog media. Existing purchase, wallet, COD, auction, order, fulfillment and stock rules were not changed.

## 11. Six-photo controlled evaluation

Verified all six authorized source files exist and match their previously recorded SHA-256, then copied them byte-for-byte to fresh private evaluation directories. Each evaluation uses a new private intake draft in the new Phase72 QA database, normal admin login/JWT and existing service endpoints. No product/stock submission or final styled-image acceptance occurred for this pilot. Repeated runs remain six **distinct** photos, not an expanded dataset.

| Photo | Local finding and styling result |
| --- | --- |
| 1 TECLAST tPad package | Exact reproduction of the previously reviewed complete-package mask; deterministic mock background candidate retained for owner review |
| 2 Yoton Y7 package | Automatic/guided mask fades package edges/Y7 marking; rejected, studio HTTP 409 |
| 3 UGREEN receiver package | Automatic/guided model selects the printed illustration, not the physical package; rejected, HTTP 409 |
| 4 cutting board | Sticker selected instead of the board; rejected, HTTP 409 |
| 5 GUXIAOBEI soap package | Exact reproduction of previously reviewed complete-package mask; mock candidate retained for owner review |
| 6 decorative jars/wheel | Guided result still has background residue/halo inside frame; stricter styling review withheld, HTTP 409 |

Private pilot folders retain originals, automatic/guided full-resolution masks and local renders, prepared references, deterministic mock plates, final mock compositions, review state, per-photo A/B/C boards and `review.html`. The C panel for blocked images explicitly says **no generated result**; no fake Gemini example is substituted. All six boards were visually inspected. Packaging orientation/damage remains as captured. Image 6 still needs a better mask/recapture; it was not admitted merely to complete six stylings.

The final-build (`v6`) six-photo evaluation is recorded by `six-photo-pilot-1795298911722.json` in the evidence directory. Its private comparison index is `D:/rezona-phase7-2-qa/20261122-6470081b/pilot-6745d227/review.html`. For photos 1/5, single observed mock request→candidate intervals were 2,581/2,534ms, including scheduling/polling/storage/local work. These are **not Gemini latency, repeated percentiles, professional-quality scores or employee preference**. Real usable-image cost, live fidelity, preference and live latency are NOT MEASURED; real inference requests and authorized spend are zero.

Read-only normal authenticated Phase71 API verification compares all six original listings' identity, title/description/category/media/price/status/quantities and entire inventory snapshots against the original registration journal. All remain unchanged: DRAFT, one unit, same physical allocation and original approved media. The Phase71 server was not rebuilt/replaced.

## 12. Automated tests and real isolated integration

Evidence destination: `C:/Users/3ma/Documents/aboessa/AboEssa/docs/benchmarks/phase7-2/20261122-6470081b/`. Every artifact uses exclusive-create/no-overwrite guards. Private photos/provider media remain on D:, outside Git. Earlier failed diagnostic logs are retained, not relabeled as successful tests; final passing matrix records are authoritative.

| Validation | Verified scope/result |
| --- | --- |
| Backend | TypeScript separate versioned build + scoped ESLint pass; 316 unit cases / 28 suites |
| Backend DB e2e | 27 / 7 suites, fresh disposable e2e DB; none skipped |
| Flutter | Admin analyze clean; admin 187, customer 166, shared UI 18, API client 20 passed |
| Total | **734 unique automated cases passed**; repeated executions are not extra cases; one inherited optional shared-UI engine-image benchmark remains skipped |
| New mode | 11 real HTTP/Prisma/PostgreSQL/Redis/BullMQ/MinIO groups: approved mask, lineage, dedupe, no-store/private access, NEW/Phase2, STOCK_IN, retake, UNKNOWN, stale review, cancelled unknown accounting, restart and budgets |
| Legacy enhancement/recognition | 34 groups: unchanged Phase7 enhancement plus 19 Phase6 recognition/duplicate-review groups |
| Intake/commerce | 11 Phase5 groups and 16 Phase4 inventory/commerce groups |
| Migrations | Fresh 38 in both new QA/e2e DBs; separate read-only Phase71 dump upgraded 37→38, all **56** business/media tables identical before/after |

Contract tests intercept fetch: exact REST host/body/header/redirect behavior, no unauthorized dispatch, malformed/blocked/URL-only output, HTTP 403/429/500 and ambiguous connection failures. Pixel tests compare every opaque source foreground pixel, including printed text and disconnected accessories. Ghost validation checks central hidden artifacts. Flutter cases cover persisted source/consent identity, lost-reply replay, retake safety, no business-field reset and Arabic 320px/tablet layouts. Existing suites cover auctions/winner orders, checkout, payments, account behavior and orders. No external bank/card funding provider or new business rule is claimed.

Dedicated resources only: PostgreSQL `127.0.0.1:55454` (`rezona_phase72_qa`, `rezona_phase72_e2e`, fresh upgrade clone), Redis `56394`, MinIO `59054`/`phase72-qa`, temporary API `18497`. Versioned builds under `D:/rezona-phase7-2-qa/20261122-6470081b/v*/dist` avoid rewriting the active Phase71 root dist. Tests never reset the six-record database. A hard QA fetch fence rejects external transport even if a flag is accidentally changed. The six-photo boards are local mock evaluations, not physical Android/iOS screenshots or a signed release.

Some inherited regressions deliberately publish synthetic fixtures or introduce an invalid synthetic ledger to test visibility/reconciliation rejection. These operations occur only in the disposable Phase72 services, never on the six real-product records or photo-evaluation drafts. No automatic-publishing feature was enabled.

## 13. Exact Phase7.2 source changes

Backend additions: `src/image-enhancement/{brand-studio.config,brand-studio-codec,gemini-studio.provider}.ts`; `prisma/migrations/20261122000100_gemini_brand_studio/migration.sql`; `.env.phase7-2.example`; `tests/unit/gemini-brand-studio.spec.ts`; `scripts/phase7-2-{qa,checks,pilot,protected-audit,migration-upgrade,evidence}.cjs`; this report and new-run evidence.

Backend extensions: `src/image-enhancement/{enhancement.config,enhancement-codec,enhancement-isolate,enhancement.provider,enhancement.service,segmentation-isolate}.ts`; `src/ai/recognition-budget.service.ts`; `src/product-intake/intake-enhancement.controller.ts`; permission constant/catalog; exact new disposable-DB allowlists in `tests/{admin-console-flow,customer-account-deletion}.e2e-spec.ts`. No Prisma model/client regeneration was needed: the migration only extends the mode CHECK. No old migration was edited.

Flutter extensions: `apps/admin_app/lib/features/product_intake/{intake_repository,intake_enhancement_card}.dart`, `apps/admin_app/test/intake_enhancement_test.dart`; new `intake_brand_studio_card_test.dart`. No customer source or dependency version was changed by Phase7.2. File SHA-256 manifests distinguish these changes from inherited dirty-tree work.

## 14. Reproduction and evidence integrity

Use `REZONA_PHASE72_QA=1`, existing run ID `20261122-6470081b` and guarded `scripts/phase7-2-qa.cjs` modes: `build`, `unit`, `lint`, `e2e`, `mobile`, `checks`, `legacy`, `intake`, `commerce`, `pilot`. `prepare` refuses existing directories/containers; never delete or repurpose protected resources to make it pass. A new immutable build requires an unused `PHASE72_BUILD=vN`. Do not run two API modes on 18497 simultaneously. The dedicated e2e DB is disposable, unlike the protected real-product QA DB.

`phase7-2-migration-upgrade.cjs` refuses an existing upgrade DB; its only Phase71 operation is read-only pg_dump. `phase7-2-protected-audit.cjs` uses login plus GETs only for existing records. Evidence capture hashes sources, new-run outputs and private pilot files without copying photographs/secrets into repository evidence. It is integrity metadata, not a signed release attestation. No Phase5/6/7/7.1 evidence files were rewritten during this phase.

QA runtime passwords/audit login configuration stay in the private D: run directory, not repository code/evidence; new scratch environments and temporary fixture admins generate local random passwords. This local QA configuration is not a substitute for a production secret manager or an audited Windows ACL/storage policy. No real Gemini key was read or persisted by this task.

## 15. Future staging sequence — NOT EXECUTED

1. Obtain separate staging authority and resolve inherited security/release gates; approve retention, rights, provider terms/regions and photo/style review. Rehearse DB/object backups and restore.
2. Keep new server/Flutter exposure and every live flag off; apply migration 38. Upgrade all compatible API/queue consumers together using an atomic immutable release, not an in-place live dist build. Do not leave old workers claiming the new mode.
3. Verify existing manual intake, NEW/STOCK_IN, private/public serving and the old customer contract. Test actual older signed customer/admin binaries and operator workflows; unit/schema compatibility is not a binary acceptance result.
4. Enable mock/local review for named staff using the new separate permission. Fix/review masks 2/3/4/6 and obtain photography-direction approval. Complete native lifecycle, load/native-RSS and employee acceptance.
5. Only after separate explicit consent: securely configure the real account/model revision, recent quota/pricing/terms review, per-photo transfer approval and a **fixed** total pilot ceiling within shared budgets. This task's runner intentionally cannot perform a live pilot. No budget or provider enablement should be inferred from the synthetic accounting test.
6. Run a separately authorized small live pilot; compare identity/edges/ghost rejection, actual usage estimates, accepted-image costs and latency; reconcile UNKNOWN/invoices before expansion. Do not publish any candidate automatically.

## 16. Rollback and compatibility

Disable new admissions/live dispatch, drain or reconcile existing work, and retain original captures/masks/candidates/decisions/usage. Cancellation is not a refund. Preserve additive schema and the lineage-aware backend for affected drafts. Do not restore the old CHECK while new-mode rows exist, blindly redispatch UNKNOWN, delete historical assets/stock movements or roll back to an approval path that ignores source-mask fences. A full older-code rollback must block/review affected drafts first. Existing public catalogs still use ordinary selected media plus Phase2 URLs; no customer checkout payload changed. Actual older installed binaries remain unverified.

## 17. Explicit remaining risks and verdict

**Verified:** local real adapter implementation/contract stubs, mock-backed durable workflow, pixel-preserving composition, strict background gate, budgets/UNKNOWN/cancellation fencing, migration rehearsal, regressions and two complete-package mock examples. **Not verified/approved:** real account/API exchange, live visual quality/cost/latency/retention, final photography direction, four source masks, native physical/release acceptance, representative 50-photo quality, hard native memory/concurrent production capacity and older binaries.

Inherited NO_GO remains: Phase3/3.1 frame-tail/real Wi-Fi-cellular staging gaps, retained MinIO→query-string→decode-uri-component security exceptions, production signing/rollback/staging acceptance, physical warehouse/operator reconciliation, Phase5 retention, Phase6 live/native acceptance and broad Phase7.1 segmentation quality/capacity. No new complete dependency audit or waiver is implied. **Do not deploy to production or begin the next phase on the basis of this report.** The safe handoff is owner review of the local comparisons and separately scoped authorization before any real Gemini photo transfer.
