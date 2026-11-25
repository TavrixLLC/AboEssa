# REZONA tabletop styling presets

22 November 2026, Asia/Baghdad. Local implementation and isolated QA only. **Three presets implemented; two real Clean Table comparisons completed. The third transport attempt became UNKNOWN, so paid work stopped. Three unattempted pairs await the owner's continuation decision.** No production deployment, GitHub push, automatic publication or image replacement occurred.

## Workflow and presets

The admin defaults to **Keep Local Neutral**, with no paid request on upload, rebuild or style selection. Paid Apply requires an already accepted Phase 7.1 mask, existing styling permission, an explicit preset, transfer/cost confirmation and server-side approval/budget gates.

| Identifier | Admin label | Separate prompt direction |
| --- | --- | --- |
| `REZONA_STYLE_CLEAN_TABLE_V1` | طاولة نظيفة | Light matte ivory tabletop, visible quiet surface plane, soft studio daylight, refined minimal depth |
| `REZONA_STYLE_WARM_PREMIUM_TABLE_V1` | طاولة فاخرة دافئة | Warm pale oak/matte wood-like surface, restrained grain, gentle rich commercial lighting, no lifestyle clutter |
| `REZONA_STYLE_MODERN_SOFT_STUDIO_V1` | استوديو عصري ناعم | Pearl-to-stone gradient, minimal surface, soft controlled highlights and modern premium depth |

Full immutable templates are in `src/image-enhancement/brand-studio.config.ts` and the run's `readonly-audit-*.json`. Every template requests an **empty environment**, not an AI product: no logos, lettering, reconstructed packaging, duplicates, props, hands, people or missing-part repair. Original RGB plus the approved mask is recomposed locally, with unchanged framing/proportions and a local subtle shadow. AI lighting affects the environment, not captured product pixels.

## Configuration and review controls

The existing job, candidate, private-media, optimization, accounting and employee-decision infrastructure is reused. No schema migration or second product-registration lane was added. Explicit preset/style hash joins durable request/cache identity and is rechecked by the worker/provider. Changing presets does not clear title, description, category, price, quantity, location, NEW/STOCK_IN mode or duplicate decision.

The old strict neutral gate is unchanged. Canonical tabletop profiles opt into a **separate versioned structural gate**, allowing controlled planes/texture and rejecting flat/no-scene, excessive edge clutter or strong saturated/dark regions. This is **not semantic object detection**: all surviving scenes remain REVIEW_REQUIRED. Accept additionally requires the employee to confirm scene/identity correctness **and meaningful improvement over local**. No result should be accepted if it duplicates the product, adds clutter or offers no value. Fal regeneration controls are disabled; there is no automatic retry or model fallback.

Disabled defaults are in `.env.phase7-3-style.example`. Live tabletop enablement is restricted to a fresh loopback phase73 QA database, the exact owner-approval ID, two source/mask pairs, three fixed profile hashes, maximum six distinct initial requests and concurrency one. The owner authorized $1.10 pilot / $1.50 daily / $10 monthly, zero regenerations. Six conservative reservations would be $1.044480; the prior $0.348160 is additionally carried into daily/monthly admission checks, never released to create headroom. Controls apply to this workflow, not unrelated account spending. Key remains backend-only outside Git/Flutter.

## Actual pilot evidence

Private run: `D:/rezona-phase7-3-qa/run-69afc240`; API target was loopback port 18503, a new private bucket/database and Redis namespace, not existing products or customer services.

| Preset | TECLAST | GUXIAOBEI soap |
| --- | --- | --- |
| Clean Table | Completed; employee approval pending | Completed; employee approval pending |
| Warm Premium Table | UNKNOWN transport outcome, no HTTP response/ID captured | Not attempted, awaiting owner decision |
| Modern Soft Studio | Not attempted, awaiting owner decision | Not attempted, awaiting owner decision |

There were **3 transport attempts, no regenerations, maximum concurrency 1**. The unknown warm request failed after about 3.4 seconds without an HTTP response. Metadata search returned no event in its window; absence does not establish zero cost or justify a retry. No failure cause is asserted. The exact same unknown pair is fenced against repeat requests. Any approved continuation may attempt only the three previously unattempted pairs, preserving this unknown reservation and the original six-attempt ceiling.

Clean Table returned 1024 × 1024 environments. Each response reported **$0.042446 estimated** (units × verified quoted rate); known subtotal **$0.084892**, **not a reconciled total charge**. Warm amount and total actual pilot cost remain UNKNOWN. New conservative commitments are **$0.522240**, plus unchanged previous **$0.348160**; these are reservations, not charges. Ledger actual-billing fields were not backfilled from estimates.

A/B/C/D boards show original, local neutral, raw AI environment and recomposition. Actual proof compared final RGB at **432,685 fully opaque foreground pixels for TECLAST** and **317,684 for soap**: **zero mismatches**. Prepared RGBA hashes also match the neutral controls (`5ef5967a…b98bd3` / `b12beb61…b4b39`). Antialiased edges naturally blend with the background; they are not claimed byte-identical to original RGB. Originals/masks match prior SHA-256 values. No styled candidate was accepted; API attempts missing scene/value acknowledgements were rejected. All QA sessions remain private DRAFT with null quantity/location and no product association; business-record counts remain zero.

## Value recommendation and remaining work

Clean Table adds a subtle tabletop/horizon and soft depth, without visible duplicate products or clutter. It is cleaner than the original chair background, but **the local isolation already supplies most of that improvement**. The extra paid benefit remains modest. Keep local neutral as default; Clean Table is the only preset with two real outputs, not a proven winner over the other two. Warm/Modern quality and comparative value cannot be ranked without their missing outputs. No mock rendering is presented as a real fal result.

Backend **354 unit tests**, lint and TypeScript checks passed; admin **190 tests** and scoped analysis passed. Phone/tablet layout checks cover explicit selection/consent, disabled paid default, style-specific durable replay and unchanged manual fields. Raster UI proofs use a render-only system Arabic font, not native-device/Cairo acceptance. This task did not install or deploy an app.

Evidence: `docs/benchmarks/phase7-3/69afc240/` contains manifest, actual result, read-only audit with full hashes/pixel counts, provider metadata and test logs. Private comparisons: `D:/rezona-phase7-3-qa/run-69afc240/review.html`. Three remaining paid pairs are pending the owner's explicit response; **do not rerun the UNKNOWN pair or publish anything**.
