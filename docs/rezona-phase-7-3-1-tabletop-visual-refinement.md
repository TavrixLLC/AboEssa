# REZONA Phase 7.3.1 — tabletop visual refinement

Date: 22 November 2026, Asia/Baghdad. Run: `20261122-2ea9d93d`.

## Outcome and scope

Six deterministic **LOCAL CONCEPTS** are ready: three styles each for TECLAST tPad packaging and GUXIAOBEI soap packaging. These are **not fal outputs, new photographs, employee-approved candidates or published product images**. No provider requests or provider-account reads were made. Incremental inference spend for this task is **$0**; historical actual spend remains **UNKNOWN**.

The strongest visible material change is **Warm Premium / pale oak**. Clean and Modern are more grounded than the prior neutral cutout, but their visual difference is modest; they do not yet justify a paid run merely to reproduce these local backgrounds. All six require owner/employee review. This is a direction-selection exercise, not a claim that the premium photography standard has been reached.

No deployment, GitHub push, publishing, APK installation, product submission, inventory operation or customer-facing change occurred. The other four photographs were not processed.

## 1. Source limitations and orientation

Both approved sources appear consistent with boxes lying on a surface, viewed close to overhead. That is a visual interpretation, not a verified physical camera pose. The main concepts keep the captured orientation and proportions. TECLAST's lettering therefore remains sideways, as in its source. Soap stays horizontal.

A full-frame tabletop is the plausible surface for these views. A wall/horizon behind an unchanged near-overhead box would misleadingly suggest an upright object. Therefore these concepts deliberately have **no invented wall transition, new box side, perspective warp, pedestal or standing geometry**. There is a separate employee-confirmed upright recipe for genuinely upright captures; it is tested synthetically, not asserted appropriate for these two sources.

Source wear, wrapping creases, reflections, existing lighting and blurred print remain. Relighting the opaque package to create a dramatic hero shot would violate captured-RGB preservation. For a genuinely eye-level display, recapture the real product on a simple surface at the intended angle, re-isolate, then review again.

TECLAST has a supplemental **270° clockwise / 90° counterclockwise** pixel-permutation example. It is explicitly **NOT SELECTED / NOT EMPLOYEE APPROVED** and is not substituted into any product or main comparison.

## 2. Review boards — private local files

[Open the complete local review](D:/rezona-phase7-3-1-qa/20261122-2ea9d93d/review.html).

Each A–E board shows A original, B previous neutral composition, C Clean, D Warm and E Modern. Original/master files are unchanged lossless/native artifacts; JPEG boards and zoom panels are inspection derivatives, not authoritative product masters. B retains its earlier framing; C–E use larger native-pixel canvases, so apparent scale on the overview is not identical.

| Source | A–E comparison | Print inspection | Contact-edge inspection |
| --- | --- | --- | --- |
| TECLAST | [Board](D:/rezona-phase7-3-1-qa/20261122-2ea9d93d/product-1-A-to-E-comparison.jpg) | [Label](D:/rezona-phase7-3-1-qa/20261122-2ea9d93d/product-1-label-inspection.jpg) | [Edge](D:/rezona-phase7-3-1-qa/20261122-2ea9d93d/product-1-ground-edge-inspection.jpg) |
| GUXIAOBEI | [Board](D:/rezona-phase7-3-1-qa/20261122-2ea9d93d/product-5-A-to-E-comparison.jpg) | [Label](D:/rezona-phase7-3-1-qa/20261122-2ea9d93d/product-5-label-inspection.jpg) | [Edge](D:/rezona-phase7-3-1-qa/20261122-2ea9d93d/product-5-ground-edge-inspection.jpg) |

[Optional TECLAST quarter-turn — not selected](D:/rezona-phase7-3-1-qa/20261122-2ea9d93d/product-1-rotation-OPTION-NOT-SELECTED.png).

The masters, approved-mask copies and foreground sidecars are private filesystem artifacts under that run directory, not public media URLs or catalog attachments. They were not uploaded to a provider or the app. The review page and report do not approve a candidate.

## 3. Versioned style and placement recipes

The three public style IDs remain unchanged. Profiles now use `*-grounding-v2`; prompt versions use `*-geometry-v2`. The old v1 profile definitions and historical QA evidence are retained. New revisions/hashes are **not authorized by the old six-request approval**.

| Stable style ID | Deterministic local material and lighting | Visual assessment |
| --- | --- | --- |
| `REZONA_STYLE_CLEAN_TABLE_V1` | Ivory honed-stone plane, very fine low-contrast pores, upper-left diffuse key, neutral ambient fill | Support and edge depth improved; quiet texture is intentionally subtle. Still close to neutral at small thumbnail size. |
| `REZONA_STYLE_WARM_PREMIUM_TABLE_V1` | Pale oak, restrained fine grain/seams, soft side key, neutral warm fill, slightly richer cast shadow | Most visibly different. No global orange/yellow tint applied to the real box. Procedural oak is a concept, not a validated realistic photographed wood texture. |
| `REZONA_STYLE_MODERN_SOFT_STUDIO_V1` | Pearl/cool-stone plane, softbox-style upper-left illumination, gentle fill, tiny low-contrast brass inlay at the far left | Clean listing direction without poster graphics. Depth is restrained; not a dramatic commercial hero scene. |

All materials are self-authored procedural code: no downloaded textures, new model weights or external asset/licensing assumptions. The renderer generates the **empty surface only**, then applies local shadows and the preserved foreground. No extra object, logo, text, hands or generated product is introduced.

Placement recipe: `rezona-tabletop-native-grounding-v2`.

| Recorded geometry | TECLAST | GUXIAOBEI |
| --- | --- | --- |
| Original dimensions | 900×1600 | 1600×1036 |
| Nonzero approved-alpha bounding box `(left, top, width, height)` | `(119,139,673,1096)` | `(90,169,1443,639)` |
| Master canvas | 1472×1472 | 1920×1920 |
| Foreground origin | `(400,188)` | `(239,641)` |
| Native product scale / rotation | `1 / 0°` | `1 / 0°` |
| Horizontal placement / camera | `0.5 / TOP_DOWN` | `0.5 / TOP_DOWN` |
| Reviewed lower-alpha contact span / y | `434…737 / 1283` | `256…1598 / 1279` |
| Table plane | `y=0`, full-frame surface | `y=0`, full-frame surface |
| Cast dx/dy/blur: Clean & Modern | `13/16/9 px` | `17/21/12 px` |
| Cast dx/dy/blur: Warm | `19/16/9 px` | `25/21/12 px` |

For top-down packages the contact occlusion follows the **whole actual alpha footprint**, not an ellipse beneath an imaginary upright box. The lower-alpha span remains recorded for inspection. Cast shadows move down/right, consistent with the upper-left key. Contact blur is 1.3 px at native scale, contact opacity 0.20; cast opacity 0.10, or 0.13 for Warm. Upright geometry instead records a lower-boundary contact and a surface transition at 57% of canvas height; it requires explicit employee selection and does not reproject a source.

Only quarter-turn rotations are allowed; horizontal placement is bounded. Geometry and the review acknowledgment participate in durable request identity. Changes invalidate the UI acknowledgment and create a distinct request identity; replaying an unchanged lost response preserves the existing identity. Rebuilds, polling and style selection do not dispatch paid work. A retake resets orientation review; the server's existing source/revision guards still block stale acceptance.

## 4. Foreground/source preservation

The original JPEGs and approved PNG masks were copied byte-for-byte and hash-checked. Source RGB is decoded to sRGB; the existing approved alpha policy is retained: values ≤10 become 0, values ≥245 become 255, intermediate coverage is preserved. The cutout is **not resized or perspective-warped**. A quarter-turn is an exact pixel permutation. The native master limit is 3072²; oversize sources request recapture instead of silently shrinking the product.

For future provider operation only, the reference sent to the adapter remains a 1024² derivative. It is **not** the authoritative foreground. Only an accepted background plate would be resized to the native canvas before the original foreground is recomposed. This input-reference preparation is not a paid request.

| Proof per style | TECLAST | GUXIAOBEI |
| --- | --- | --- |
| Fully opaque pixels checked | 673,660 | 859,176 |
| Final-master opaque RGB mismatches | **0** | **0** |
| Captured foreground across the three styles | Identical PNG/hash | Identical PNG/hash |

Six final-codec replays matched the initial six saved master PNGs **byte-for-byte**, after adding input-format guards. A separate direct source-to-final audit checked every fully opaque approved pixel against the decoded original JPEG for all six masters: **zero mismatches**. Initial evidence was not overwritten. The supplemental rotation also reports zero opaque RGB mismatches. Tests independently map asymmetric fixture pixels through all four rotations and check the final image against the original source, including a disconnected accessory.

Alpha-edge blending naturally changes the final blended edge RGB with the background. We do not claim those semi-transparent composite pixels equal the original opaque background-contaminated photo. They retain the captured foreground RGB/approved alpha before blending. Mask errors are not repaired by this styling stage.

## 5. Visual assessment and structural safety gate

Viewed both A–E boards, both label crops, both contact-edge crops and the optional rotation. Labels, package colors and shape remain recognizable and unchanged; no duplicate package or extra object appears in these local concepts. The narrow shadow follows the contact edge, not a detached floating oval. Warm produces the clearest tabletop material difference. Clean and Modern remain deliberately understated, with a risk that the owner sees insufficient value over free neutral styling.

The v2 gate is a separate explicit structural gate, **not a loosened legacy neutral gate**. It verifies single-frame dimensions and opacity, style-specific brightness/chroma limits, warm-cast limits, high-frequency clutter and minimum surface variation. Tests reject flat, dark, transparent and strongly colored/cluttered backgrounds. It does **not** recognize every low-contrast object, ghost silhouette or implausible scene: surviving provider outputs must still be rejected by a human if duplicated, floating, mislabeled or visually unhelpful. Structural success is not semantic or premium-quality approval.

The UI adds an unselected-by-default camera/orientation review, optional safe rotation, a free rotated-original preview and bounded horizontal placement. Final styled-image approval still requires separate scene/identity/grounding and meaningful-value checks. Canceling consent starts nothing; a fake-transport test verifies the explicitly reviewed geometry is sent only after consent. Screenshot checks at 320 and 834 logical pixels show scrolling controls, not a physical-device acceptance test; the render-only Arabic font aliases local Arial, not production Cairo/icon fidelity.

## 6. Revised fal prompts — prepared, NOT EXECUTED

[Six source/style prompt records](benchmarks/phase7-3-1/20261122-2ea9d93d/prepared-prompts-NOT-EXECUTED.json) include the three revised templates and their normalized planned geometry. No image payload or unrestricted media URL is stored in these prompt records. `executed=false` for every entry.

Each prompt requests an **EMPTY** commercial tabletop environment: clear subject rectangle, intended contact point, table-plane y/coverage, original camera interpretation, rotation already applied, style material/palette, upper-left key, neutral ambient fill and appropriate background depth. It prohibits product reconstruction, text, logos, ghost silhouettes, extra objects and generated product shadows. Contact/cast shadows are added locally afterward. Near-overhead sources explicitly prohibit an unrelated wall/horizon or invented standing pose.

The model path is unchanged; no alternative model was used. This task did not revalidate the current external fal schema, pricing or model availability. Prepared prompts are engineering artifacts, **not provider-validated results or live authorization**.

## 7. UNKNOWN and budget preservation

Read-only transactions audited the existing isolated Phase 7.2 and 7.3 databases; no provider billing permission was changed, no billing endpoint was queried and no reservation was released.

| Ledger/evidence | Status |
| --- | --- |
| Previous Phase 7.2 commitment | **$0.348160**, unchanged; its UNKNOWN retained |
| Previous Phase 7.3 commitment | **$0.522240**, unchanged, three dispatches only |
| Aggregate retained commitment | **$0.870400**, reservations/commitments, **not actual charges** |
| Phase 7.3 Clean TECLAST / Clean soap | Prior recorded estimates $0.042446 each; not newly confirmed account charges |
| Phase 7.3 TECLAST Warm | **UNKNOWN** transport/billing; $0.174080 reservation retained within the $0.522240 |
| Historical total actual spend | **UNKNOWN** |
| New paid calls / incremental inference spend | **0 / $0** |

No captured provider request ID exists for TECLAST Warm. Missing metadata is not evidence of non-dispatch or zero charge. It was not retried. The unresolved source/style registry blocks that exact source hash + stable Warm preset regardless of profile revision. The actual ledger filter also counts the old dispatch by stable preset rather than revision-specific hash; read-only audit confirmed its cross-revision count is 1. A missing registry fails closed for future tabletop fal dispatch.

Warm soap, Modern TECLAST and Modern soap remain **unattempted**. The durable attempt directory remains at exactly three markers. Old `live` and `continue-approved` script modes now stop immediately with `PHASE731_PAID_REQUESTS_SUSPENDED`; the previous continuation question is superseded by this task. New v2 live approval defaults off, approved hashes must match, and `.env.phase7-3-1.example` explicitly disables live use with zero new daily/pilot allocation. No real backend environment or credentials were modified.

## 8. QA results and evidence provenance

Fresh repository evidence: [run directory](benchmarks/phase7-3-1/20261122-2ea9d93d/). All writes use fresh filenames/exclusive creation. Earlier Phase 7.3 evidence hashes and protected business-code baselines remain unchanged. The preview compile snapshot and a separate final-codec validation snapshot remain private; the latter reproduced every initial master exactly.

- Backend unit suite: **32 suites, 371 tests passed**. Includes inherited image/privacy/source-retake guards, provider no-retry/UNKNOWN handling, intake and inventory regressions, plus 17 new geometry/material/native-RGB cases.
- Backend TypeScript no-emit check: passed. Scoped ESLint: passed after removing two unnecessary non-null assertions; the initial failed lint log is retained.
- Admin Flutter: **191 tests passed**, with `--no-pub`; analysis of the four changed Dart files: no issues.
- Responsive controls render: 2 tests passed, 320×800 and 834×1194. Fake consent dispatch only, no real network provider.
- All six native-codec replays matched the preserved masters; all six original/mask checks and opaque-pixel comparisons passed.
- Read-only QA audit: three existing fal jobs/usages only, UNKNOWN unchanged, three pairs unattempted, assets private, no styled candidate accepted. Pilot database still contains zero products, customers, wallets, orders, auctions, inventory balances/movements/allocations or warehouse records; intake drafts remain unsubmitted. No claim is made of rerunning a complete purchasing/device/production integration test in this visual-only task.

Local first-pass rendering took approximately **0.92–1.82 seconds** per concept; sampled worker RSS was **77.7–103.9 MiB**. These are single-run desktop worker measurements, **not peak-memory guarantees, mobile benchmarks or production throughput**. The existing secret-free child process, serial execution and 30-second timeout remain in place.

Exact implementation files changed for this follow-up (existing unrelated work is retained):

```text
AboEssa/.gitignore
AboEssa/.env.phase7-3-1.example
AboEssa/src/image-enhancement/tabletop-placement.ts             [new]
AboEssa/src/image-enhancement/tabletop-scenes.ts                [new]
AboEssa/src/image-enhancement/tabletop-native-codec.ts          [new]
AboEssa/src/image-enhancement/brand-studio.config.ts
AboEssa/src/image-enhancement/brand-studio-codec.ts
AboEssa/src/image-enhancement/enhancement-codec.ts
AboEssa/src/image-enhancement/enhancement.provider.ts
AboEssa/src/image-enhancement/enhancement.service.ts
AboEssa/src/image-enhancement/fal-studio.config.ts
AboEssa/src/image-enhancement/fal-studio.provider.ts
AboEssa/src/ai/recognition-budget.service.ts                    [stable-preset attempt filter only]
AboEssa/src/product-intake/intake-enhancement.controller.ts
AboEssa/tests/unit/tabletop-styles.spec.ts
AboEssa/tests/unit/tabletop-placement.spec.ts                   [new]
AboEssa/scripts/phase7-3-style-pilot.cjs                         [paid modes suspended]
AboEssa/scripts/phase7-3-1-local-concepts.cjs                    [new]
AboEssa/scripts/phase7-3-1-validation.cjs                        [new]
AboEssa/docs/rezona-phase-7-3-1-tabletop-visual-refinement.md     [this report]
AboEssa/docs/benchmarks/phase7-3-1/20261122-2ea9d93d/*            [new evidence only]
AboEssaMobile/apps/admin_app/lib/features/product_intake/intake_enhancement_card.dart
AboEssaMobile/apps/admin_app/lib/features/product_intake/intake_repository.dart
AboEssaMobile/apps/admin_app/test/intake_tabletop_styles_card_test.dart
AboEssaMobile/apps/admin_app/test/intake_enhancement_test.dart
```

No payment, wallet, price, stock, warehouse, order or auction business rule changed. Phase 5 NEW/STOCK_IN service and image-selection commit resolver match the saved baselines. Recognition-budget changes affect the fal attempt fence, not reservation release/UNKNOWN settlement rules. The full dirty worktree was not committed, reset or cleaned.

## 9. Recommendation and remaining limits

Keep free neutral composition as the default. Offer local tabletop concepts for explicit review, not broad paid generation. **Warm Premium soap** is the best candidate for a future *separately owner-approved* single paid comparison because it asks for a materially different scene and that pair is unattempted. This is a recommendation only: no dispatch is scheduled or authorized. TECLAST Warm stays blocked until reliably reconciled; another revision does not erase its UNKNOWN.

Before any future paid experiment, the owner must choose the style/orientation, approve a new limited scope/budget and private transfer, and review the revised template. Carry all retained commitments, keep concurrency 1 and no automatic retries/regeneration/alternative paid models. Do not process the four problematic masks until segmentation is resolved. No employee approval can be inferred from this engineering review.

Remaining limitations: two-source sample; source wear/glare/blur; no opaque-product relighting or new viewpoint; stylized procedural materials; human-dependent object/geometry/value checks; no live v2 fal result, billing reconciliation or physical-device verification. More convincing depth may require **better source capture**, not more inference spending.

**Stopped at local previews. All employee approvals remain PENDING.**
