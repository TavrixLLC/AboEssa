# REZONA — 20 premium AI Product Studio templates

Date: 2026-11-23, Asia/Baghdad. Repositories: `AboEssa` and `AboEssaMobile`. Local implementation and isolated QA only. No production deployment, GitHub push, APK installation, paid inference, real-photo transfer or automatic AI-image publication.

## Verdict and evidence boundaries

The integrated backend registry, authenticated APIs, Flutter intake browser, explicit mode/consent controls, durable jobs and factual/promotional review separation are implemented. Exactly **20** active templates ship in code, five per group. There are **39 supported template/mode pairs**: 19 support both modes; F04 supports generative promotional mode only.

Actual local HTTP/JWT/PostgreSQL/BullMQ/MinIO/U²-Net tests processed all 39 pairs with deterministic **MOCK** editing. This verifies workflow, lineage, privacy and inventory integration, **not fal image quality, real-garment reconstruction, live schema acceptance or production readiness**. No real product photo was needed for these new tests.

**Production: NO-GO. Paid generation: OFF by default.** Existing real-image/segmentation, billing, security, device and staging gates are not cleared by this feature. No new paid test is authorized. Owner approval is required for any later paid pilot.

Run ID: `dd83f28e`. Sanitized evidence: [benchmarks/studio20/dd83f28e](benchmarks/studio20/dd83f28e). Private runtime and media evidence: `D:/rezona-studio20-qa/run-dd83f28e`. Prior evidence was not overwritten; failed development runs are retained alongside successful reruns.

## 1. Architecture and source audit

Reviewed the existing Phase 5/6/7/7.1/7.2/7.3 reports and source, fal pilot/failure review, native tabletop refinement and premium-3D pilot. Reused:

- Phase 5 owned intake sessions, immutable image identities, ordinary authenticated admin routes and transactional NEW/STOCK_IN submission.
- Phase 6 recognition/duplicate review and shared `RecognitionUsage` ledger; no mock recognition is presented as real Gemini recognition.
- Phase 7 candidates, private assets, worker leases, request idempotency, append-only decisions and keep-original flow.
- Phase 7.1 approved neural masks, source/mask hashes, guided isolation and original captured RGB.
- Phase 7.2 fixed fal transport, inline private image preparation/output, bounded decoding, sanitized error diagnostics and no retries/fallback.
- Phase 7.3 native-scale tabletop composition, reviewed source posture and contact shadows.
- Phase 2 existing eight optimized media variants, private-until-explicit-publication behavior and original retention.

`Category` is flat, not hierarchical. Its active name can suggest a studio group through an exact normalized-label allowlist. Unknown categories suggest GENERAL. Beauty is not assumed to be a child of HOME. Overriding a studio group never writes the catalog category.

Theme audited against current shared UI: customer canvas `#08090B`, surface `#141517`, elevated `#1D1E20`, gold `#F4C46C`, deep gold `#B87B28`; admin gold `#E7BC61`, canvas `#0C0F0F`, surface `#151919`, border `#2B3030`. Cairo/fallback typography and 10px admin radii are retained.

## 2. Registered templates, versions and exact prompts

All initial template versions are **1**, square `1:1`, active, backend-owned. Shared system version: `rezona-premium-studio-system-v1`. Recipe: `rezona-premium-studio-library-v1`.

| Code | Group | Stable ID | Arabic title | Modes |
| --- | --- | --- | --- | --- |
| F01 | FASHION | REZONA_FASHION_BOUTIQUE_PEDESTAL_V1 | منصة بوتيك فاخرة | Faithful / Hero |
| F02 | FASHION | REZONA_FASHION_GOLD_RING_TABLE_V1 | طاولة الأزياء الدائرية الذهبية | Faithful / Hero |
| F03 | FASHION | REZONA_FASHION_MARBLE_EDITORIAL_V1 | عرض أزياء على الرخام الأسود | Faithful / Hero |
| F04 | FASHION | REZONA_FASHION_GHOST_MANNEQUIN_V1 | عرض المانيكان الاحترافي | Hero only, high risk |
| F05 | FASHION | REZONA_FASHION_DARK_WALNUT_TABLE_V1 | طاولة الأزياء الخشبية الفاخرة | Faithful / Hero |
| E01 | ELECTRONICS | REZONA_ELECTRONICS_TECH_DESK_V1 | المكتب التقني الفاخر | Faithful / Hero |
| E02 | ELECTRONICS | REZONA_ELECTRONICS_GOLD_PEDESTAL_V1 | منصة الإلكترونيات الذهبية | Faithful / Hero |
| E03 | ELECTRONICS | REZONA_ELECTRONICS_FUTURE_CIRCUIT_V1 | استوديو التقنية المستقبلية | Faithful / Hero |
| E04 | ELECTRONICS | REZONA_ELECTRONICS_EXECUTIVE_DESK_V1 | مكتب الإلكترونيات التنفيذي | Faithful / Hero |
| E05 | ELECTRONICS | REZONA_ELECTRONICS_BLACK_GLASS_V1 | معرض الزجاج الأسود | Faithful / Hero |
| H01 | HOME | REZONA_HOME_BLACK_MARBLE_KITCHEN_V1 | عرض المطبخ الرخامي الفاخر | Faithful / Hero |
| H02 | HOME | REZONA_HOME_DINING_TABLE_V1 | طاولة الطعام الأنيقة | Faithful / Hero |
| H03 | HOME | REZONA_HOME_LIVING_ROOM_DISPLAY_V1 | عرض غرفة المعيشة الفاخرة | Faithful / Hero |
| H04 | HOME | REZONA_HOME_BATHROOM_VANITY_V1 | منصة الحمّام الراقية | Faithful / Hero |
| H05 | HOME | REZONA_HOME_ARCHITECTURAL_PEDESTAL_V1 | منصة المنتجات المنزلية المعمارية | Faithful / Hero |
| G01 | GENERAL | REZONA_GENERAL_SIGNATURE_HERO_V1 | عرض ريزونا الأسود والذهبي | Faithful / Hero |
| G02 | GENERAL | REZONA_GENERAL_GOLD_ARCH_V1 | المعرض الذهبي المقوّس | Faithful / Hero |
| G03 | GENERAL | REZONA_GENERAL_CHARCOAL_DESIGNER_V1 | طاولة الفحم الفاخرة | Faithful / Hero |
| G04 | GENERAL | REZONA_GENERAL_MUSEUM_SPOTLIGHT_V1 | منصة المتحف المضيئة | Faithful / Hero |
| G05 | GENERAL | REZONA_GENERAL_BLACK_GLASS_LUXURY_V1 | الزجاج الأسود والانعكاس الذهبي | Faithful / Hero |

Authoritative full English owner-supplied scene prompts and Arabic titles are in [studio-templates.data.ts](../src/image-enhancement/studio-templates.data.ts). The **complete exact 20 prompt texts, shared instruction, descriptions, scene specifications, versions and all 39 prompt hashes** are exported in [the frozen registry appendix](benchmarks/studio20/dd83f28e/registry-prompts-1795457838725.json). This is the report's full prompt appendix, not abbreviated prompt suggestions.

[studio-templates.ts](../src/image-enhancement/studio-templates.ts) deep-freezes the code-backed registry and checks 20 unique IDs / five per group at import. A hash binds template ID, version, processing mode, shared-system version and complete prompt text. Built-ins are registered idempotently by code; no static prompt database or taxonomy migration was introduced.

Faithful mode deliberately uses a separate complete **empty-environment** instruction derived from the scene specification, rather than sending a conflicting product-render instruction and pretending the output preserves pixels. Hero mode uses the full product presentation prompt. Future prompt changes require a new version; historical job parameters remain frozen and are never rewritten. A worker refuses configuration/hash drift rather than regenerating historical work.

## 3. Two explicit modes and source compatibility

| Mode | Arabic | What it does | Catalog role |
| --- | --- | --- | --- |
| FAITHFUL_COMPOSITE | الحفاظ على المنتج الأصلي | Approved original RGB + approved mask; generated empty scene; native local foreground/contact-shadow composition | FACTUAL candidate, still requires review |
| GENERATIVE_3D_HERO | عرض دعائي ثلاثي الأبعاد بالذكاء الاصطناعي | Prepared real-reference image, full generated raster; no original-foreground overlay on the generated result | AI_PROMOTIONAL secondary candidate only; never factual primary |

Neither mode creates a mesh/CAD/GLB asset. There is no silent mode change, perspective invention, product stretching or automatic rotation. The employee explicitly reviews TOP_DOWN/UPRIGHT placement and may choose a discrete quarter-turn. Folded/flat apparel in faithful mode requires TOP_DOWN. Hanging apparel is rejected pending recapture/review. Volume-garment sources are not accepted as faithful flat tabletop compositions.

F04 is generative-only/high-risk and requires explicit visible garment-volume evidence review. Insufficient evidence is a recapture/review condition, not permission to invent a back, sleeve, label or seam. These constraints cannot prove unseen geometry; all real apparel visual acceptance remains pending.

Faithful native composition verifies fully opaque source RGB against final pixels (zero mismatches); alpha edges blend with the environment and are not claimed byte-identical. Structural raster gates check format, bounded dimensions, opacity, black/gold border coverage, non-flatness and obvious empty-plate color/brightness violations. They are **not** object detection, text/brand validation or proof that no duplicate product was generated. Surface, grounding, identity and meaningful-value review remain human gates.

## 4. Factual versus promotional decisions

Candidate `mediaRole` is durable and checked defensively against job mode and stored render policy. A new additive migration backfills legacy PREMIUM_3D_STUDIO candidates as AI_PROMOTIONAL; it does not delete or modify any image bytes.

- Generative acceptance requires all five strict scene/value/identity/premium/generative checks, explicit `materialMismatchObserved=false`, and the current decision revision. A material mismatch cannot be approved away.
- Promotional acceptance records secondary-candidate approval but does **not** change selected factual candidate or factual `mediaRevision`.
- `imageDecisionRevision` independently orders append-only review history. Thus reviewing a promotional candidate does not invalidate an otherwise unchanged approved source mask.
- The unchanged Phase 5 NEW transaction calls the existing selection resolver, now hardened to fall back to the original if a legacy/promotional candidate was selected. STOCK_IN behavior is unchanged and never replaces existing catalog media.
- Public media authorization also refuses promotional assets, even if accidentally associated with a product. A future explicitly labeled secondary-publication feature is required before customer exposure. This implementation does not publish promotional media.

## 5. Authenticated APIs and immutable lineage

Base: `/api/admin/product-intake/sessions/:id/enhancements`.

| Operation | Purpose |
| --- | --- |
| GET `/studio/templates` | Owned bounded catalog; optional validated group; four groups/20 or five templates; safe cost status |
| GET `/studio/templates/:templateId` | Safe active-template detail at current version |
| POST base | Existing durable request, now accepts nested studioSelection |
| GET base | Existing bounded job status, factual selection, decisionRevision and approved promotional IDs |
| GET `/candidates/:candidateId/preview` | Existing authenticated bounded private preview/no-store |
| POST `/decision` | Existing reviewed accept/reject/original workflow with stricter promotional checks |

The existing admin JWT/token-type/permission guards and session ownership apply. Sensitive generation reuses `product_intake.gemini_studio`. Unknown nested properties are forbidden by validation. Client prompts, endpoints, models, system instructions and provider URLs are not accepted.

Start selection contains only `templateId`, `templateVersion`, `processingMode`, `sourceKind`, optional `evidenceReviewed`. Backend job identity binds these to source/mask/candidate/decision hashes, reviewed placement, provider/model revision, style/prompt/system/recipe versions and generation=0. Exact parameters and full prompt profile stay in backend provenance; Flutter receives safe template snapshots and processing metadata, not raw prompt profiles.

Retakes fence worker commit by image identity and source revision; original/mask/history remain private. Same-body/lost-response replay and identical alias requests return the existing job (including UNKNOWN), never redispatch. A changed source decision cannot bypass UNKNOWN guards. Expired dispatched work recovers as UNKNOWN, not an automatic retry.

## 6. fal transport, budgets and default-off configuration

Only the existing fixed `google/nano-banana-lite/edit` transport is used for future authorized work. The [official endpoint schema](https://fal.ai/models/google/nano-banana-lite/edit/api) was reviewed read-only on 2026-11-23. Request construction uses prompt, system_prompt, one inline PNG image_urls entry, aspect_ratio=1:1, num_images=1, output_format=png, safety_tolerance="2", sync_mode=true and limit_generations=true. No invented resolution field, remote draft URL, arbitrary proxy or paid SDK fallback was added. Schema review/stub tests are not a real inference compatibility claim.

The original bounded transport preserves no-redirect/no-retry behavior, private inline IO, bounded image decoding and allowlisted sanitized provider diagnostics. No real provider credentials were loaded for these tests. Dummy test credentials are nonworking accounting fixtures only.

New flags and **disabled documentation-only defaults**: [.env.studio20.example](../.env.studio20.example). The example is not an approval or a renewal of exhausted old pilots.

Future live enablement is restricted to explicit isolated loopback QA, NODE_ENV=test, approved model revision, private-transfer/terms/owner approval, exact template-version-mode-promptHash scope and source/mask allowlists. Concurrency=1; regenerations=0; bounded request count <=4; monthly <=$10; daily <=$1.50; pilot <=$1. A separate owner authorization must set lower applicable caps and exact images/request count. No broad automatic usage.

The reservation comes from a reviewed official fal pricing record plus maximum billable units, fingerprint/evidence ID and review timestamp (at most seven days old). Missing/stale pricing blocks generation. No fixed actual charge is assumed. The UI shows a conservative reserved ceiling before consent, not an invoice amount. Account spending outside REZONA is not controlled by this ledger.

Admission uses the existing shared advisory-locked ledger, quotas, concurrency and daily/monthly limits. Historical carried commitments must remain at least $1.044480 in a new isolated live run. Same-source/template attempts are bounded across both modes; reservations/UNKNOWN are not released to create capacity. Positive-reservation accounting tests verify exhaustion and UNKNOWN retention without dispatching a provider call.

## 7. Flutter implementation and employee flow

New integrated section: **استوديو صور ريزونا**, inside `IntakeEnhancementCard`, not a disconnected screen. One reusable typed template card plus one code-native concept painter serves all 20 templates. The backend owns titles, descriptions, IDs, versions, compatibility and scene specs; no provider prompt text is duplicated in Flutter.

Features: four Arabic group chips, five cards/group, RTL phone vertical browsing/tablet grids, gold selection, concept/paid indicators, selected detail, explicit mode/source/posture controls, high-risk evidence review, cost/transfer confirmation, loading/error/retry/empty state and safe original retention. Merely opening, scrolling, selecting, canceling, polling or rebuilding never generates an image. Generation selection is persisted in the existing durable request before POST. Manual product fields and duplicate review are not reset.

Original/local/styled candidates use the existing private comparison/zoom UI. Generative results are labeled secondary/promotional; materially wrong results must be rejected. Candidate acceptance still requires comparison, not just a generated-image success response.

All thumbnails are **local illustrative EMPTY scenes**, not fal output or product photos. They resolve via the versioned `REZONA_STUDIO_CONCEPT_V1` painter and symbolic local asset IDs. Distinct marble, walnut, fabric, glass, architectural/podium/ring/circuit compositions require no inference or network image assets. No fake preview is described as a paid provider result.

### Screenshots: all four groups / all twenty cards

Private final UI evidence directory: `D:/rezona-studio20-qa/run-dd83f28e/ui-20261123-2`.

| Group | Phone 320px, all five cards | Tablet 834px, all five cards |
| --- | --- | --- |
| FASHION | [Phone](D:/rezona-studio20-qa/run-dd83f28e/ui-20261123-2/320-FASHION-all5.png) | [Tablet](D:/rezona-studio20-qa/run-dd83f28e/ui-20261123-2/834-FASHION-all5.png) |
| ELECTRONICS | [Phone](D:/rezona-studio20-qa/run-dd83f28e/ui-20261123-2/320-ELECTRONICS-all5.png) | [Tablet](D:/rezona-studio20-qa/run-dd83f28e/ui-20261123-2/834-ELECTRONICS-all5.png) |
| HOME | [Phone](D:/rezona-studio20-qa/run-dd83f28e/ui-20261123-2/320-HOME-all5.png) | [Tablet](D:/rezona-studio20-qa/run-dd83f28e/ui-20261123-2/834-HOME-all5.png) |
| GENERAL | [Phone](D:/rezona-studio20-qa/run-dd83f28e/ui-20261123-2/320-GENERAL-all5.png) | [Tablet](D:/rezona-studio20-qa/run-dd83f28e/ui-20261123-2/834-GENERAL-all5.png) |

These are raster captures of the actual production browser widget/theme at 320×800 and 834×1194 test viewports (scroll-content captures are taller). Arabic system Arial is aliased to Cairo for render-only evidence. They are not native-device/Cairo/font-performance acceptance. All 20 IDs, all groups and local thumbnail resolution are asserted by widget tests. No device installation occurred.

## 8. Isolated QA, tests and comparisons

Fresh containers `rezona-studio20-qa-dd83f28e-{postgres,redis,minio}`; no existing container/data was reused, deleted or migrated. Loopback PostgreSQL 55455, Redis 56395, MinIO 59055/59056, transient API 18523. Fresh databases `rezona_studio20_qa_dd83f28e` and `rezona_studio20_reg_dd83f28e`; all 40 migrations applied successfully. Runtime/API processes close after each test. Private random runtime secrets remain outside both repositories.

Validation uses normal JWT admin login and real owned HTTP requests, actual PostgreSQL transactions, BullMQ workers, MinIO private media and local approved U²-Net masks. Synthetic product fixtures only; no original six real QA products/customer environments were modified. A hard fetch fence refuses external traffic; provider-editing output is explicitly MOCK. Regression tests may explicitly transition synthetic originals through publication to test privacy; no real or AI promotional image is published.

Verified areas:

- Registry exact counts, Arabic fields, deep freeze, safe IDs/versions, 39 distinct hashes, filtering, source/mode/garment guards and official request shape.
- Native captured-RGB equality in faithful mode; hero output remains generated, not a pasted-original/claimed-pixel-preserved result. White/flat/invalid plates refused.
- All 20 templates / 39 mode pairs through the actual QA worker and private storage, explicit reviews, one-job replay, current source/mask hashes, no leaked prompt profiles and unchanged business fields.
- All 20 promotional review sequences leave factual selection unchanged; wrong-identity declarations cannot be accepted. Actual NEW/replay produces one DRAFT/one opening with no promotional primary.
- Retake race prevents stale candidate commit. Ambiguous mock outcome survives recovery as UNKNOWN; alias replay returns the same UNKNOWN; source-reselection cannot force a new dispatch. No reservation release.
- Quoted positive reservations, daily/carry exhaustion, prior pair limit, unknown/concurrency, missing pricing/source/scope and preserved UNKNOWN costs tested without a real transport.
- Existing commerce/stock regressions: wallet reservation/refund, COD idempotency/final-unit race, paired transfers, adjustment/reconciliation guards, shipment consumption, cancellation rules, legacy backfill and unchanged publication semantics.
- Existing intake regressions: owned/RBAC flows, atomic initial stock, duplicate submission/recovery, eight optimized variants, physical STOCK_IN, transaction rollback, immutable retakes, source preservation and private/public media revocation.
- Flutter phone/tablet RTL, all20 cards, explicit mode/source/pose/consent/cancel, no generation on browsing, safe retry and durable payload/manual-field preservation. Customer/shared/API-client regression suites also run.

Final automated results: **414 backend unit tests / 35 suites**, **27 e2e / seven suites**, **198 admin**, **166 customer**, **18 shared UI**, **20 API-client** tests passed: **843 passed in aggregate**, plus one intentionally skipped optional image-decode benchmark. TypeScript, scoped ESLint and full admin analysis passed. These are automated cases, not 843 physical-device tests. Machine-readable totals, source/evidence hashes and the readiness verdict are in [final-validation.json](benchmarks/studio20/dd83f28e/final-validation.json). Failed intermediate checks are retained and must not be mistaken for the final reruns.

Private before/after boards compare synthetic original, approved local mask, faithful local mock and visibly labeled hero surrogate for F01/E01/H01/G01. Board paths/hashes are in `comparison-boards-*.json`. Preview copies are lossy review images; exact RGB assertions use native codec outputs, not board screenshots. **No fal visual superiority, real text fidelity or human employee acceptance is claimed from these mocks.**

## 9. Historical billing — preserved, not reconciled anew

| Historical pilot | Retained conservative commitment | Actual charge status |
| --- | --- | --- |
| Phase 7.2, two attempts | $0.348160 | TECLAST exact request: confirmed dashboard billed event $0.042409, not final invoice. Soap-attributed charge UNKNOWN. |
| Phase 7.3, three attempts | $0.522240 | Clean outputs each $0.042446 estimated; TECLAST Warm UNKNOWN; actual total UNKNOWN. Warm soap and both Modern pairs unattempted. |
| Premium 3D, one TECLAST attempt | $0.174080 | $0.042478 estimated, not reconciled actual charge; unselected/unapproved. |
| Historical aggregate | **$1.044480** | **Total actual spend UNKNOWN**; commitments are not charges. |
| This implementation | **$0 paid inference / $0 actual new inference spend** | Local mock usage only; not a claim that historical UNKNOWNs cost zero. |

Soap 422 root cause remains UNRESOLVED; request correlation remains PROVISIONAL. Candidate dashboard zero does not prove a definitively soap-attributed zero charge. The prior inference-key billing 403 was not bypassed, permissions were not expanded and the account was not queried with a new key. Old databases were not started or migrated for this task; historical accounting statements rely on preserved prior sealed evidence, not a fresh account/DB reconciliation.

## 10. Future real-image matrix and production blockers

| Family | Eligible owner-authorized real source for a later approved test | Live acceptance |
| --- | --- | --- |
| FASHION | No suitable owner-approved clothing photograph yet | PENDING; F04 especially needs visible volume evidence |
| ELECTRONICS | Previously approved TECLAST box, original + passed mask | PENDING for new 20-template system |
| HOME | Previously approved GUXIAOBEI soap packaging, vanity-style context only | PENDING; do not invent contents/claims |
| GENERAL | TECLAST as a generic packaged item, or a separately supplied approved product | PENDING |

The other four previously problematic segmentation photographs remain blocked. Do not batch them, switch paid models or retry an UNKNOWN. Keep local neutral composition the default. Optional paid styling is justified only for a clearly different owner-approved scene after source/mask/quote/budget review and real visual comparison.

Open gates: new-template real fal schema/output/quality/cost validation; real employee visual approval, brand/text/shape and no-duplicate checks; suitable apparel source and segmentation coverage; provider retention/data-terms acceptance and reconciliation route; secondary promotional publication design; native-device camera/RTL/fonts/performance; staging end-to-end/old-binary compatibility; existing residual dependency/security and catalog frame/WAN performance gates. This task does not supersede the previous NO-GO reviews or claim current dependency audit counts.

## 11. Migration, disable and compatibility

Additive migration: `20261123000200_studio_media_roles`. Apply only after backup/staging validation and Prisma client generation; then deploy a compatible backend before enabling the updated admin. It adds `imageDecisionRevision`, initializes it from existing media/decision history, adds/backfills `mediaRole`, and extends the job-mode CHECK. It does not alter stock/price/wallet/order tables or rewrite historical media.

For rollback/disable: leave all PRODUCT_STUDIO/legacy paid flags off, stop only newly queued dispatch through existing controls, retain evidence/usage/UNKNOWNs and keep additive schema columns/check values. Do not drop modes/rows or refund reservations to make rollback easier. Keep the safer primary resolver/privacy guard even if the new browser is hidden. Do not blindly roll an old backend over new decision rows: promo/factual revisions now differ. A destructive/down migration has not been tested or authorized.

Old customer apps/catalog responses do not gain promotional primaries. Old admin clients lack the stricter generative review/revision fields and cannot approve reconstructed images through the updated server. Existing non-generative endpoints and NEW/STOCK_IN payloads remain supported; real distributed old-binary testing on staging remains pending.

## 12. Local reproduction and exact implementation files

Do not run these against production or reuse an old immutable evidence destination. Existing run snapshots v1–v7 are retained; choose an unused build version/destination for a new run. Commands below run from `C:/Users/3ma/Documents/aboessa/AboEssa` unless stated otherwise.

```powershell
node scripts/studio20-qa.cjs baseline
# A NEW run requires a fresh no-overwrite base/manifest; do not overwrite this run.
# node scripts/studio20-qa.cjs init
# node scripts/studio20-qa.cjs services
# node scripts/studio20-qa.cjs migrate
node scripts/studio20-qa.cjs build v8  # only if v8 does not exist
$env:STUDIO20_DIST='D:/rezona-studio20-qa/run-dd83f28e/dist-v8'
node scripts/studio20-runtime.cjs checks
node scripts/studio20-runtime.cjs resilience
node scripts/studio20-runtime.cjs commerce
node scripts/studio20-runtime.cjs intake
node scripts/studio20-runtime.cjs comparisons
node scripts/studio20-matrix.cjs backend
node scripts/studio20-matrix.cjs e2e
node scripts/studio20-matrix.cjs mobile
```

Flutter: `C:/Users/3ma/develop/flutter/bin/flutter.bat`, always `--no-pub`. UI evidence: set `REZONA_STUDIO20_RENDER_DIR` to a new existing private directory, then run `flutter test --no-pub test/intake_studio_browser_test.dart`. Do not install on a physical device without owner authorization.

Source changes for this feature (pre-existing unrelated dirty files are preserved):

```text
AboEssa/.gitignore
AboEssa/.env.studio20.example
AboEssa/prisma/schema.prisma
AboEssa/prisma/migrations/20261123000200_studio_media_roles/migration.sql
AboEssa/src/image-enhancement/studio-templates.data.ts                 new
AboEssa/src/image-enhancement/studio-templates.ts                      new
AboEssa/src/image-enhancement/studio-library.config.ts                 new
AboEssa/src/image-enhancement/studio-library-codec.ts                  new
AboEssa/src/image-enhancement/studio-scenes.ts                         new
AboEssa/src/image-enhancement/studio-media-role.ts                     new
AboEssa/src/image-enhancement/brand-studio.config.ts
AboEssa/src/image-enhancement/tabletop-native-codec.ts
AboEssa/src/image-enhancement/enhancement.config.ts
AboEssa/src/image-enhancement/enhancement-codec.ts
AboEssa/src/image-enhancement/enhancement.provider.ts
AboEssa/src/image-enhancement/enhancement.service.ts
AboEssa/src/image-enhancement/enhancement-selection.ts
AboEssa/src/image-enhancement/fal-studio.provider.ts
AboEssa/src/ai/recognition-budget.service.ts
AboEssa/src/files/intake-media-visibility.ts
AboEssa/src/product-intake/intake-enhancement.controller.ts
AboEssa/tests/unit/studio-library.spec.ts                              new
AboEssa/tests/unit/studio-budget.spec.ts                               new
AboEssa/tests/admin-console-flow.e2e-spec.ts                           adds only explicit new isolated DB guard
AboEssa/tests/customer-account-deletion.e2e-spec.ts                     adds only explicit new isolated DB guard
AboEssa/scripts/studio20-*.cjs                                         new feature QA/evidence runners
AboEssa/docs/rezona-20-premium-ai-studio-templates.md                    new
AboEssa/docs/benchmarks/studio20/dd83f28e/*                             new sanitized evidence
AboEssaMobile/apps/admin_app/lib/features/product_intake/intake_studio_models.dart   new
AboEssaMobile/apps/admin_app/lib/features/product_intake/intake_studio_browser.dart  new
AboEssaMobile/apps/admin_app/lib/features/product_intake/intake_enhancement_remote.dart
AboEssaMobile/apps/admin_app/lib/features/product_intake/intake_repository.dart
AboEssaMobile/apps/admin_app/lib/features/product_intake/intake_enhancement_card.dart
AboEssaMobile/apps/admin_app/test/intake_studio_browser_test.dart                    new
AboEssaMobile/apps/admin_app/test/fixtures/studio20-catalog.json                       new safe display fixture
AboEssaMobile/apps/admin_app/test/intake_premium_3d_test.dart
```

No dependency upgrade or lockfile change was needed for this feature. Retired display files were not restored. The protected baseline includes prior reports/benchmark artifacts and Phase5 transaction/inventory/sales/auction/shipping sources; the final hash audit must remain unchanged. Only the selected-media resolver is intentionally hardened for promotional separation; financial and physical-stock business services are not edited.
