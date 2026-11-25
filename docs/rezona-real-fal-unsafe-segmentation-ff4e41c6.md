# REZONA — prepaid fal experiment and original-reference review

2026-11-24 · Asia/Baghdad · isolated QA run `ff4e41c6` · **production NO-GO**.

## Result

The existing Admin Studio now distinguishes a blocked **faithful local composite** from an optional **generative promotional image using the original photograph**. An unsafe mask is not substituted or presented as accurate. All 17 authorized originals remain accounted for; all 20 registered templates remain browsable, with mode/source/permission/funding eligibility checked separately.

Six representative real requests completed, across four existing templates and all four studio groups. **Two outputs were rejected through the existing authenticated QA image-decision workflow**; four remain pending owner/employee review. No output was accepted, selected as the factual primary, associated with a published product or automatically published.

- [New private before/after gallery — all 17 photographs](D:/rezona-real-fal-qa/run-ff4e41c6/review-gallery.html)
- [Per-photo visual review and 17 comparison-board hashes](C:/Users/3ma/Documents/aboessa/AboEssa/docs/benchmarks/real-fal-studio/ff4e41c6/visual-evaluation-all17.json)
- [Before-account evidence](C:/Users/3ma/Documents/aboessa/AboEssa/docs/benchmarks/real-fal-studio/ff4e41c6/account-before.json) and [after-account reconciliation](C:/Users/3ma/Documents/aboessa/AboEssa/docs/benchmarks/real-fal-studio/ff4e41c6/account-after.json).

The old gallery/reports are immutable historical evidence, not the updated UX. Open the new gallery above.

## Funding and charges — verified dashboard events, not invented invoice totals

Read-only authenticated fal dashboard inspection showed **$9.83 before**, **$9.58 after**, pay-as-you-go with **$0/month subscription** and **Auto top-up Disabled**, both before and after. No recharge, payment-method change or subscription action occurred. Dashboard balances are displayed to cents and fal warns they can lag usage by up to one hour; they are not an exact real-time account API balance.

Current pricing was retrieved with the existing backend-only inference key using the read-only [official pricing API](https://fal.ai/docs/platform-apis/v1/models/pricing): `google/nano-banana-lite/edit`, `USD`, `units`, **$1 per billable unit**. HTTP 200; no key permissions expanded. Invoice/billing API permissions were not requested. The actual six response IDs were captured from provider responses and matched exactly against dashboard Billing events, not inferred by timestamp.

**New confirmed dashboard-billed usage: $0.254955. New unknown charges: 0.** Provider-reported unit estimates happened to match these dashboard events; estimates were not treated as confirmation until that reconciliation. Rejected visual outputs still incurred provider charges.

| Photo | Existing template, v1 | Captured provider request ID | Workflow latency | Confirmed billed USD | Visual decision |
| --- | --- | --- | --- | --- | --- |
| P01 AirTag-labelled package | E02 Electronics Gold Pedestal | `01a20d9a-e5aa-78f3-b059-f6dc91569b8f` |11.857s |0.042492 |Pending close label/shape review; authenticity not verified |
| P04 T6 charger-stand package | E02 Electronics Gold Pedestal | `01a20d9b-1df0-7ae2-a852-1f1aa3096442` |10.931s |0.042492 |Pending; package retained despite unsafe isolation |
| P10 blue knit sweater | F03 Fashion Marble Editorial | `01a20d9b-4d07-77a0-bd8c-3045c6bd6061` |11.007s |0.042494 |Pending; inspect regenerated knit/label details |
| P11 wheel covers with bags | G05 General Signature Hero | `01a20d9b-7c14-7af3-bc96-a06888ac791d` |11.236s |0.042493 |Strict review; poses/bags reconstructed and display support added |
| P13 Yoton Y7 package | E02 Electronics Gold Pedestal | `01a20d9b-aaf8-7873-823b-dd8f80fc48d6` |11.927s |0.042492 |**REJECTED:** printed illustration became an unboxed device; package text moved to pedestal |
| P16 GUXIAOBEI soap package | H01 Home Black Marble Kitchen | `01a20d9b-e5d2-7641-9080-33d96a012d48` |11.003s |0.042492 |**REJECTED:** brand/small label lettering and FRAGRANT text rewritten |

All six used **`GENERATIVE_3D_HERO` + `ORIGINAL_REFERENCE`**, the existing `google/nano-banana-lite/edit` provider, one request per chosen combination, no regeneration/alternative model/automatic retry. All responses were HTTP 200 with decoded **1024×1024** images. Latency above includes the local workflow, not just provider compute. Request timestamps, source/reference/prompt hashes, exact field names, content types, provider units, response IDs, dimensions and private source lineage are retained in the six `paid-Pxx-*.json` records in the new evidence directory. Full-resolution provider rasters are private in the run directory; sanitized reports contain neither image payloads nor unrestricted image URLs.

The four template IDs are `REZONA_ELECTRONICS_GOLD_PEDESTAL_V1`, `REZONA_FASHION_MARBLE_EDITORIAL_V1`, `REZONA_GENERAL_SIGNATURE_HERO_V1`, and `REZONA_HOME_BLACK_MARBLE_KITCHEN_V1`. These are generated promotional rasters, **not 3D meshes or preserved product pixels**. Upstream model weights/revision are not independently pinned; the backend revision label identifies the reviewed integration, not a provider weight guarantee.

### Reservations and historical uncertainty

The six-request conservative planning reservation is **$1.044480** (`6 × $0.174080`), separate from its confirmed **$0.254955** charge. The historical **$1.044480** commitment remains retained separately. No UNKNOWN or other reservation was released. The planning ceiling is not a provider-enforced per-request price cap; the prepaid account, disabled auto-top-up, budget accounting and stop-on-ambiguity policy are the financial boundaries.

The old five visible account billing events sum to **$0.169779**. Combined known model billing events sum to **$0.424734**, consistent with the displayed post-experiment balance. However, the historical soap request/source correlation remains **PROVISIONAL**: the suspected failed request ID has a **$0.00** billing event, but that does not establish its source attribution. Historical attempt-level UNKNOWN evidence/reservations remain unchanged, and no ambiguous historical request was re-dispatched.

## All 17 photographs and remaining source limitations

Original filenames, complete SHA-256 hashes, dimensions and old QA product references remain in the [protected source inventory](C:/Users/3ma/Documents/aboessa/AboEssa/docs/benchmarks/real-product-studio/3bbbdf05/source-inventory.json). All 17 stored originals were validated as private current references; this does **not** mean that missing/obscured product details are known. No photograph was replaced by a synthetic input or silently skipped.

| Photo | Local isolation state | Faithful recapture flag | This batch |
| --- | --- | --- | --- |
|P01 AirTag-labelled package |Ready for human review, not approved |No |Real fal; pending |
|P02 neck beauty-device package |Ready for human review, not approved |No |Not generated |
|P03 HeadaTerm package |Review required |Yes, clipped source |Not generated |
|P04 T6 charger-stand package |Review required; guided mask selected printed device |Yes for faithful workflow |Real fal; pending |
|P05 George home steamer package |Review required |Yes, clipped/occluded boundaries |Not generated |
|P06 suitcase |Ready for human review; wheel/edge concern remains |No |Not generated |
|P07 SUNKISS wipe package |Review required |Yes, incomplete boundary |Not generated |
|P08 ring-light kit |Review required |Yes, multiple/thin/cropped parts |Not generated |
|P09 smart-lock set |Review required |Yes, accessories lost / floor retained |Not generated |
|P10 sweater |Ready for human review, not approved |No |Real fal; pending |
|P11 wheel covers |Review required; transparency/holes unresolved |No blanket recapture flag; finer source/mask review needed |Real fal; strict review |
|P12 TECLAST package |Ready for human review, not approved |No |Not generated |
|P13 Yoton package |Review required |Yes for faithful workflow |Real fal; **rejected** |
|P14 UGREEN package |Review required; printed device selected |Yes |Not generated |
|P15 cutting board |Review required; label selected |Yes |Not generated |
|P16 soap package |Ready for human review, not approved |No |Real fal; **rejected** |
|P17 decorative jars/wheel |Review required; transparent/thin pieces lost |Yes |Not generated |

Local outcomes remain **6 preliminary review-ready / 11 segmentation-review / 10 recapture flags**. A creative experiment does not resolve any of those flags. Remaining 11 photographs have no new paid output; this is a deliberate representative evaluation, not an authorization refusal or a hidden two-image/$0.20 cap. No blanket17×20 batch was submitted.

The fresh authenticated `export-review-*.json` in the private run directory records the full17×20 mode compatibility matrix and actual fal candidates/review actions. Ghost mannequin remains incompatible without reviewed volume-garment evidence. Switching display groups does not change a catalog category.

## Implemented admission, UX and privacy rules

The blocked-faithful message now states:

> تعذر إنشاء معاينة محلية دقيقة لأن عزل المنتج يحتاج مراجعة. الصورة الأصلية محفوظة.

The separate promotional explanation states:

> يمكن تجربة عرض دعائي بالذكاء الاصطناعي باستخدام الصورة الأصلية، لكن النتيجة قد تختلف عن المنتج الحقيقي وتحتاج مراجعة قبل اعتمادها.

Cropping, obscuration, missing pieces and physical packaging versus its printed illustration are explicitly called out. The real-photo review opens the existing intake editor for generation/review; it does not replace it with a demo. Actual outputs and `REJECT`/pending states appear separately from LOCAL PREVIEW and MOCK results.

- Faithful composition still requires an explicitly approved complete mask and reviewed placement. No synthetic mask fallback was added.
- Original-reference admission is **library HERO-only**, explicit, original/warning-reviewed, privately transferable only after actor/ownership/source/template/cost/authorization guards pass. Mixing it with a mask or using it for CLEAN/faithful is rejected.
- Actual privately stored READY originals, active capture, asset identity, media revision, actor status/permissions and source hash are checked at admission, worker processing, immediately before transport and before candidate persistence/acceptance. Retakes cannot select stale outputs.
- The native child validates bytes/format/frame count/dimensions and produces a bounded PNG reference, auto-oriented and resized **inside without crop**; immutable storage is untouched. It makes no opaque-RGB-preservation claim and creates no mask. Source, reference and generated hashes are distinct.
- The registered template is supplemented with an original-reference warning about boxes, printed illustrations, hidden edges, sets and included items. The request/system hashes actually sent are recorded. The Yoton failure proves that prompt wording is not a fidelity guarantee.
- Results remain private, `AI_PROMOTIONAL`, secondary and `REVIEW_REQUIRED`. Material mismatch requires rejection through the existing decision path. No primary selection or accept operation occurred. Two QA-agent rejections are not owner acceptance.
- Client actions use backend-per-template `generationAllowedModes`, not just a global generation switch. Invalid originals, unavailable scope or funding controls disable the option; server-side checks remain authoritative.
- A default-off prepaid-experiment policy accepts fresh backend-only observed account evidence on the exact isolated QA DB. It replaces the legacy tiny **daily/experiment/source-count/request-count pilot ceilings** within the authorized prepaid fund, while retaining the $10 monthly fund boundary, current reviewed pricing, scoped source/template hashes, concurrency1, idempotency, no retries/UNKNOWN fencing and privacy/terms checks. Approval is for the experiment, not a new owner spending prompt per image. Operator-selected representative batch scope is deliberate, not a global auto-generation switch.
- Missing/stale/invalid balance/top-up evidence, insufficient conservative availability or unresolved new usage fails closed. Provider credentials stay only in backend configuration and are removed from offline test processes/child image workers. No billing permissions were broadened.

## Verification and scope

Backend unit tests, TypeScript and scoped ESLint; full Flutter Admin tests/analysis; actual authenticated HTTP/BullMQ/PostgreSQL/private MinIO integration were run. Final counts and source/artifact hashes are in the new `final-validation.json`; earlier failed test-run artifacts are retained rather than overwritten. Tests include unsafe original references, private/current-source fences, no-mask hero preparation, faithful denial, explicit warning acknowledgement, unauthenticated denial, idempotent replay, no-store private previews, public404, real promotional display/rejection and unchanged business metadata. Mock workflow assertions are not claims about fal visual quality.

Verification detail: an initial full backend run passed **426/426 tests in37 suites**. The final full rerun passed425/426, with the existing native tabletop-material test exceeding its unchanged30000ms deadline; there was no failed value assertion. Its unchanged file then passed **17/17** in isolation, with the same test deadline. CPU contention is a possible explanation, **not a verified cause**; native timing sensitivity remains a risk rather than being hidden by increasing timeouts. Final Admin **203/203** and analysis passed; TypeScript, scoped ESLint and the final12 original-reference/review tests passed. This is functional coverage with a documented timing flake, not a claim of a completely green final full-suite run.

The actual real-photo database still has **zero products, customers, wallets, warehouses, balances, movements, orders and auctions**. All17 intake sessions remain DRAFT with unchanged business fields and no quantity/location/completed product. The only new decisions are two explicit image REJECTs; no ACCEPT or factual selected candidate. Existing historical QA products were not modified. Protected546 prior/business file checks, 227 prior review-artifact hash checks and all17 original hashes remain unchanged.

No schema migration, dependency upgrade, physical-device installation, production/customer-facing deployment, GitHub push, account recharge or automatic publishing occurred. Native-device/staging/performance acceptance and historical unresolved gates are not superseded: **production remains NO-GO**.

Key implementation files: `src/image-enhancement/prepaid-studio-policy.ts`, `studio-library.config.ts`, `studio-library-codec.ts`, `enhancement.service.ts`, provider request metadata, Start DTO, existing budget source guard; Flutter intake repository/browser/enhancement card/real-photo review and template eligibility model. `.env.prepaid-studio.example` is documentation only and default OFF. Immutable run builds and new scripts are under the new QA workspace/evidence tree.

## Recommendation

The real backgrounds add a meaningful premium scene, unlike neutral cutouts. They do **not** establish accurate product reconstruction: two of six representative outputs are already unusable for identity/text reasons, and the other four are unapproved. Keep the factual original (or a genuinely approved faithful foreground) as primary. Review these comparisons before deliberately selecting further compatible experiments under the existing prepaid authorization; verify the current balance/top-up state again before the next batch. Resolve unsafe masks for faithful use, retain old UNKNOWNs, and never automatically retry a failure or reinterpret a pretty image as proof of hidden product details.
