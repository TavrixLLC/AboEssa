# REZONA — real product studio evaluation

Date: **2026-11-24, Asia/Baghdad**. Run: **3bbbdf05**. Local/isolated QA only. **No new paid inference, production changes, GitHub push, device installation, automatic image acceptance/publication or real inventory registration.**

## Decision and important distinctions

All **17 distinct authorized photographs** were accounted for: **11 new photographs** from the exact owner-supplied folder plus **six already-authorized historical originals** from their known private QA copies. No missing sources, no byte-identical duplicates and no unrelated-folder crawl. Originals were copied without modification, verified by SHA-256 and admitted through the actual authenticated Phase 5 upload service.

- **6 READY_FOR_REVIEW:** P01, P02, P06, P10, P12, P16. These are preliminary agent visual-QA assessments, **not employee approval**, not proof of perfect segmentation, and not paid-transfer authorization.
- **11 SEGMENTATION_REVIEW_REQUIRED:** all remaining photographs. Technical job completion does not mean that a mask contains the actual complete product.
- **10 RECAPTURE_NEEDED:** P03, P04, P05, P07, P08, P09, P13, P14, P15, P17. This includes both physically cropped/occluded sources and products for which safe complete isolation was not achieved after the permitted local attempts.
- **All 17 REAL_FAL_NOT_AUTHORIZED / NOT YET GENERATED.** No new REAL_FAL_COMPLETED, REAL_FAL_FAILED or REAL_FAL_UNKNOWN outcome exists in this evaluation. Historical provider UNKNOWNs are a separate accounting matter.
- Six category-appropriate **LOCAL PREVIEW** images and one additional GENERAL-style local preview were produced using the captured product RGB and a self-authored local scene. These are **not fal results** and cannot be selected as factual catalog assets through the new preview endpoint.
- **Five provisional paid-test candidates**, not six: P01/P02/P10/P12/P16. P06's wheels/feathered edges need closer employee inspection first. Fully approved/authorized paid combinations today: **zero**.

**Production remains NO-GO.** The local evaluation is completed, but the supplied photographs do not all pass isolation. Do not equate the green automated-test results with broad real-product visual acceptance.

## Private gallery and integrated Admin review

[Open the private all-photo gallery](D:/rezona-real-studio-qa/run-3bbbdf05/review-gallery-final.html).

This local HTML file is a **private evidence report**, not another product-intake application. It contains every original, actual automatic/guided attempt, the local cleanup fallback, local previews where permitted, exact blockers and all20 compatibility metadata. No remote images/scripts or public image URLs are used.

The actual Flutter Admin intake feature now includes **تقييم صور المنتجات الحقيقية — QA** when explicitly compiled with `REAL_PRODUCT_STUDIO_QA=true`. It uses the normal authenticated Admin API and opens the existing intake editor for original/mask comparison and explicit accept/reject/keep-original controls. Paid generation is visibly disabled. The evaluation matrix is an as-of QA assessment; the existing editor/decision history remains authoritative for any later employee decision.

Actual production review widgets were rendered with captured authenticated API data and the real private image bytes at **320×800** and **834×1194**, not empty scene cards or invented product outputs. These are render-only UI proofs, **not a physical-device app run**. Arial was aliased to Cairo for these screenshots; native font/device acceptance remains pending.

- [Tablet: real garment, wheel covers and retained historical sources](D:/rezona-real-studio-qa/run-3bbbdf05/admin-screens-1/834-P10-review.png)
- [Phone: failed box mask and recapture cases remain visible](D:/rezona-real-studio-qa/run-3bbbdf05/admin-screens-1/320-P04-review.png)
- [Actual garment inside Admin LOCAL PREVIEW](D:/rezona-real-studio-qa/run-3bbbdf05/admin-screens-2/detail-local-preview.png)

All17 gallery rows have both phone and tablet screenshot proof under `D:/rezona-real-studio-qa/run-3bbbdf05/admin-screens-1`. The initial detail capture lacked a loaded image; it is retained, not presented as the final detail proof. The corrected image is in `admin-screens-2`.

## 1. Source inventory, identity and preservation

Authorized current folder: `C:/Users/3ma/Downloads/منتجات`. Historical originals were read only from their already-known `D:/rezona-phase7-1-qa/real-products-20261121/NN-original.jpeg` paths. The six old download paths no longer appear in the current folder; the matching authorized private copies were used, not substituted synthetic photographs.

Stable photo IDs are `RP-` plus the first16 SHA-256 hex characters; uniqueness is checked for the complete dataset. P01–P17 are readable display labels, not inventory SKUs. Each source is single-frame JPEG with recorded orientation and dimensions. Original SHA-256 and the backend MIME+bytes request hash are different identities and are not confused.

Full machine-readable inventory, including stable IDs, original/copy paths, metadata and existing product references: [source-inventory.json](benchmarks/real-product-studio/3bbbdf05/source-inventory.json).

| Photo | Original filename | Validated image | Original SHA-256 |
| --- | --- | --- | --- |
| P01 | WhatsApp Image 2026-11-23 at 18.01.32 (1).jpeg | 900×1600 JPEG | `bd2687e3d6f8867ab1ba3e756fec6d37fac1fd8490ecc986a04177da45eeb913` |
| P02 | WhatsApp Image 2026-11-23 at 18.01.32 (2).jpeg | 900×1600 JPEG | `074f9f1e7394a52a7490fb5ccd8b1ec2634f819f83c31f40042ab89ece51bfdc` |
| P03 | WhatsApp Image 2026-11-23 at 18.01.32 (3).jpeg | 900×1600 JPEG | `7ff7e7a839331e9b391e8ccf4912a03bbc1bcd04e681ddc0460fa26d7cf475c2` |
| P04 | WhatsApp Image 2026-11-23 at 18.01.32.jpeg | 900×1600 JPEG | `b310f92f950cc7e3b4d5ecd33a1baeb893aad66a27bb96f434308ddfd57c7bc0` |
| P05 | WhatsApp Image 2026-11-23 at 18.01.33 (1).jpeg | 1080×1493 JPEG | `eb2ecede5c45e776d447e5a8813e851a4b62d49be01bda071642e593195207ce` |
| P06 | WhatsApp Image 2026-11-23 at 18.01.33.jpeg | 978×1394 JPEG | `4d98bac9f2cf57ea5bbda25c3499486812e9134aa9d2331c99c3e0c9a2163f02` |
| P07 | WhatsApp Image 2026-11-23 at 18.02.48.jpeg | 1080×1203 JPEG | `996ec1ce88691a7991a700a8d0b660a4690b4258e9d7d68ab7b643c5886e92e1` |
| P08 | WhatsApp Image 2026-11-23 at 18.08.15.jpeg | 650×1280 JPEG | `5f424cf0769b8262c9d010c49768c0b6ca3d8256fa18b0ddb9252c5490102ae0` |
| P09 | WhatsApp Image 2026-11-23 at 18.17.04.jpeg | 1080×1348 JPEG | `24c259cd31c3b122d078f54d84ccfbf9f46292b50f435b50dab0c3ee537b8a7e` |
| P10 | WhatsApp Image 2026-11-23 at 18.19.19.jpeg | 1080×1345 JPEG | `8a991913c4cd357316314c4cbe8cddca49215d8222966fdfdf218ff9400b77d4` |
| P11 | WhatsApp Image 2026-11-23 at 18.34.42.jpeg | 959×1581 JPEG | `56d18f1c06ad9a4da1b7b4b673b7e2b0de752bfb30276474dc05d2a6074716c3` |
| P12 | WhatsApp Image 2026-11-21 at 16.49.55.jpeg | 900×1600 JPEG | `d5283669cd2a4c49ff37913bcc7d20547f879ef50a7fb033c15da6e883c056e7` |
| P13 | WhatsApp Image 2026-11-21 at 16.51.05.jpeg | 1600×1003 JPEG | `c5015f3ae260627a20bfe0bbb004957fe7c4200bace579473bae1c9a825e928d` |
| P14 | WhatsApp Image 2026-11-21 at 16.51.47.jpeg | 1132×1600 JPEG | `323e03535d3ce747bb25f359bde70f202e079cc0dbdd6d811421c0156718e176` |
| P15 | WhatsApp Image 2026-11-21 at 16.52.09.jpeg | 900×1600 JPEG | `21a67c17b2d2893c86b60baf19eabea05ff615131bf1e6cef85a9cfee70d0801` |
| P16 | WhatsApp Image 2026-11-21 at 16.48.46.jpeg | 1600×1036 JPEG | `1653e7d90f34b8b51055db6574185a72726d6e23e6370d1a82644d163752c97a` |
| P17 | WhatsApp Image 2026-11-21 at 16.49.20.jpeg | 923×1600 JPEG | `4baa83d32da448c311b7a1242b676f6b4f78c64d9da53eb630750aa64f098c60` |

Originals remain in the owner folder or their historical authorized copy and are preserved again under `D:/rezona-real-studio-qa/run-3bbbdf05/originals`. Admission/preview generation never overwrites them. Final integrity verification compares both original and copied bytes.

## 2. Actual pipeline executed for every photograph

1. Normal JWT Admin login into a new isolated QA backend.
2. Normal owned Phase5 intake DRAFT creation and immutable image admission. Only a provisional visible-information QA title/description is stored. **Price, quantity, warehouse, location and completedProductId remain null. No submit operation was called for these photographs.**
3. Private source storage and existing Phase2 original variants.
4. Real, pinned offline **U²-Net / ONNX Runtime 1.31.1**, through the existing worker/queue, not a synthetic mask.
5. Automatic mask inspection against the actual original.
6. Eight actual guided ONNX attempts: P03/P04/P06/P09 plus the exact previously authorized rectangles for P13/P14/P15/P17. Rectangles are input guidance, **not painted masks**; no mask was fabricated to force success.
7. Existing local CLEAN fallback for all17 sources. CLEAN retains the original scene; it is explicitly **not background isolation**.
8. Manual visible-information studio-group suggestion, all20 template compatibility records, source/posture validation, private neutral isolation preview and local black/gold preview where allowed.
9. Explicit pending employee review. **No image acceptance decision, promotional selection, product creation or stock movement was written in the photo database.**

Job accounting: 17 automatic neural attempts (**16 completed / one area-guard failure**), eight guided neural attempts, and17 CLEAN jobs. A completed task can still be semantically wrong: notably T6/UGREEN/Yoton printed device images and the cutting-board sticker. No provider recognition, mock Gemini suggestion or unseen product specification was treated as factual metadata.

## 3. Per-photo outcome matrix

All rows also carry **REAL_FAL_NOT_AUTHORIZED**, employee review **PENDING** and template version1. Source and segmentation statuses are deliberately separate.

| Photo | Provisional visible-information label | Suggested group | Chosen diagnostic mask | Segmentation | Source/recapture | Recommended template |
| --- | --- | --- | --- | --- | --- | --- |
| P01 | عبوة تحمل AirTag — 4 pack | ELECTRONICS | Automatic | READY_FOR_REVIEW | Original retained | REZONA_ELECTRONICS_GOLD_PEDESTAL_V1 v1 |
| P02 | عبوة جهاز تجميل للرقبة | HOME | Automatic | READY_FOR_REVIEW | Original retained | REZONA_HOME_BATHROOM_VANITY_V1 v1 |
| P03 | عبوة جهاز HeadaTerm | ELECTRONICS | Guided | SEGMENTATION_REVIEW_REQUIRED | RECAPTURE_NEEDED | REZONA_ELECTRONICS_GOLD_PEDESTAL_V1 v1 |
| P04 | عبوة حامل شحن لاسلكي T6 | ELECTRONICS | Guided | SEGMENTATION_REVIEW_REQUIRED | RECAPTURE_NEEDED | REZONA_ELECTRONICS_GOLD_PEDESTAL_V1 v1 |
| P05 | عبوة جهاز طهي بالبخار George home | HOME | Automatic | SEGMENTATION_REVIEW_REQUIRED | RECAPTURE_NEEDED | REZONA_HOME_BLACK_MARBLE_KITCHEN_V1 v1 |
| P06 | حقيبة سفر صلبة داكنة | FASHION | Guided | READY_FOR_REVIEW | Original retained | REZONA_FASHION_GOLD_RING_TABLE_V1 v1 |
| P07 | عبوة مناديل مبللة SUNKISS | HOME | Automatic | SEGMENTATION_REVIEW_REQUIRED | RECAPTURE_NEEDED | REZONA_HOME_BATHROOM_VANITY_V1 v1 |
| P08 | حلقة إضاءة مع حوامل وكابل وعبوة | ELECTRONICS | Automatic | SEGMENTATION_REVIEW_REQUIRED | RECAPTURE_NEEDED | REZONA_ELECTRONICS_GOLD_PEDESTAL_V1 v1 |
| P09 | طقم قفل ذكي ومفاتيح وملحقات ظاهرة | ELECTRONICS | Automatic | SEGMENTATION_REVIEW_REQUIRED | RECAPTURE_NEEDED | REZONA_ELECTRONICS_GOLD_PEDESTAL_V1 v1 |
| P10 | كنزة محبوكة زرقاء فاتحة مفرودة | FASHION | Automatic | READY_FOR_REVIEW | Original retained | REZONA_FASHION_MARBLE_EDITORIAL_V1 v1 |
| P11 | أغطية عجلات ظاهرة مع تغليف بلاستيكي | GENERAL | Automatic | SEGMENTATION_REVIEW_REQUIRED | Original retained | REZONA_GENERAL_SIGNATURE_HERO_V1 v1 |
| P12 | جهاز لوحي TECLAST tPad | ELECTRONICS | Automatic | READY_FOR_REVIEW | Original retained | REZONA_ELECTRONICS_GOLD_PEDESTAL_V1 v1 |
| P13 | بروجكتر Yoton Y7 | ELECTRONICS | Guided | SEGMENTATION_REVIEW_REQUIRED | RECAPTURE_NEEDED | REZONA_ELECTRONICS_GOLD_PEDESTAL_V1 v1 |
| P14 | مستقبل صوت بلوتوث للسيارة UGREEN | ELECTRONICS | Guided | SEGMENTATION_REVIEW_REQUIRED | RECAPTURE_NEEDED | REZONA_ELECTRONICS_GOLD_PEDESTAL_V1 v1 |
| P15 | لوح تقطيع بني مستطيل | HOME | Guided | SEGMENTATION_REVIEW_REQUIRED | RECAPTURE_NEEDED | REZONA_HOME_BLACK_MARBLE_KITCHEN_V1 v1 |
| P16 | علبة صابون يدوي GUXIAOBEI | HOME | Automatic | READY_FOR_REVIEW | Original retained | REZONA_HOME_BLACK_MARBLE_KITCHEN_V1 v1 |
| P17 | قطعة ديكور بشكل جرار وعجلة مائية | HOME | Guided | SEGMENTATION_REVIEW_REQUIRED | RECAPTURE_NEEDED | REZONA_HOME_BLACK_MARBLE_KITCHEN_V1 v1 |

Exact reasons, warnings, candidate IDs and source/mask hashes are in [per-photo-evaluation.json](benchmarks/real-product-studio/3bbbdf05/per-photo-evaluation.json).

- **P01 — عبوة تحمل AirTag — 4 pack:** عزل العبوة كاملة ظاهرياً؛ الكتابة والاصفرار الموجود بالأصل محفوظان. يحتاج اعتماد الموظف وفحص الأطراف الدقيقة.
- **P02 — عبوة جهاز تجميل للرقبة:** عزل العبوة كاملة ظاهرياً دون اختراع الجهاز خارج العبوة؛ النص الرئيسي محفوظ. بانتظار الموظف.
- **P03 — عبوة جهاز HeadaTerm:** فشل العزل التلقائي بفحص المساحة. التوجيه أعاد معظم العبوة، لكن طرفها الأيسر مقصوص عند حافة التصوير؛ أعد تصوير العبوة كاملة. ادعاءات العلاج المطبوعة غير متحققة.
- **P04 — عبوة حامل شحن لاسلكي T6:** التلقائي ضم جزءاً من الطاولة، والتوجيه عزل صورة الشاحن المطبوعة بدلاً من العبوة الفعلية؛ لا يجوز تقديم الرسم كجهاز مصوّر. أعد التصوير بخلفية أبسط وهامش كامل.
- **P05 — عبوة جهاز طهي بالبخار George home:** العبوة مقصوصة عند حدود الصورة واليد تحجب طرفاً؛ الخلفية البيضاء لا تعيد الأجزاء المفقودة. أعد التصوير كاملاً.
- **P06 — حقيبة سفر صلبة داكنة:** التوجيه أزال أرضية زائدة مع بقاء الهيكل والبطاقة والمقبض والعجلات ظاهرياً؛ راجع الأطراف والانعكاسات قبل الاعتماد. The suitcase remains excluded from the proposed paid set until wheel/thin-edge inspection is explicitly accepted.
- **P07 — عبوة مناديل مبللة SUNKISS:** العبوة تلامس وتتجاوز حدود التصوير، خاصة الجانبين؛ لا يمكن اعتبار القناع صورة كاملة للمنتج. أعد التصوير مع فراغ حولها.
- **P08 — حلقة إضاءة مع حوامل وكابل وعبوة:** قناع التلقائي يحتفظ بمساحة أرضية واسعة بين قطع الطقم، والعمود يصل لحافة الصورة السفلية؛ لا يمكن تأكيد الطقم كاملاً. أعد تصوير كل القطع والكابل داخل الإطار.
- **P09 — طقم قفل ذكي ومفاتيح وملحقات ظاهرة:** التلقائي يحتفظ بأرضية بين الملحقات؛ التوجيه أفقد معظم المقابض والمفاتيح والملحقات. لا نختار العبوة وحدها كتمثيل للطقم؛ أعد ترتيب جميع القطع على خلفية موحدة.
- **P10 — كنزة محبوكة زرقاء فاتحة مفرودة:** الكنزة المفرودة والبطاقة والملمس واللون محفوظة ظاهرياً؛ لا توجد أدلة لحجم مانيكان، لذلك F04 غير متوافق. راجع الثقوب الدقيقة وحواف الأكمام.
- **P11 — أغطية عجلات ظاهرة مع تغليف بلاستيكي:** ظهرت الأغطية المتعددة، لكن البلاستيك الشفاف واللمعان والفتحات تحمل خلفية وتحتاج مراجعة تفصيلية؛ لا نعتمد فصل الشفافية أو عدد القطع بالمخزون من الصورة.
- **P12 — جهاز لوحي TECLAST tPad:** العبوة الكاملة محفوظة ظاهرياً؛ لا نصحّح ميل أو كتابة أو تلف تلقائياً. قارن بالقناع التاريخي المعتمد ثم اعتمد كمراجعة جديدة إن رغبت.
- **P13 — بروجكتر Yoton Y7:** التلقائي والتوجيه التاريخي اختارا رسم البروجكتر وأجزاء من العبوة بدل كامل العبوة؛ بعض الحواف ضيقة/مقصوصة. أعد التصوير على خلفية أبسط.
- **P14 — مستقبل صوت بلوتوث للسيارة UGREEN:** كلا المسارين يختاران صورة المستقبل المطبوعة لا علبة UGREEN الكاملة؛ هذا ليس جهازاً مصوراً خارج العبوة. أعد تصوير العبوة كاملة مع هامش واضح.
- **P15 — لوح تقطيع بني مستطيل:** العزل التلقائي والتوجيه يختاران الملصق فقط ويفقدان لوح التقطيع؛ لا قناع صالح للمنتج الكامل. أعد التصوير بخلفية ذات تباين أو راجع عزلاً تفصيلياً.
- **P16 — علبة صابون يدوي GUXIAOBEI:** علبة الصابون الكاملة وتصميمها محفوظان ظاهرياً؛ لا ندّعي محتويات أو خصائص غير مثبتة بالصورة. يحتاج الموظف مراجعة الحواف.
- **P17 — قطعة ديكور بشكل جرار وعجلة مائية:** العزل يفقد الكرة الشفافة وأجزاء دقيقة بالخلف/العجلة؛ نجاح المهمة تقنياً لا يثبت اكتمال القطعة. أعد التصوير مع فصل وتباين للأجزاء الشفافة.

No new brand authentication, device specifications, warranty, medical efficacy, product contents, actual condition or stock quantities are inferred. AirTag/HeadaTerm/other labels describe visible packaging, not verified authenticity or clinical claims.

## 4. Existing historical products — reference only

| Photograph | Known existing QA product ID | Action |
| --- | --- | --- |
| P12 | `cmwqhrgat000gvt24q2ovqxge` | Historical reference only; no new write |
| P13 | `cmwqhrkaa0018vt24vy2fly34` | Historical reference only; no new write |
| P14 | `cmwqhro8p0020vt24uuv488jc` | Historical reference only; no new write |
| P15 | `cmwqhrrtb002svt24sxf8yowp` | Historical reference only; no new write |
| P16 | `cmwqhrvqf003evt24nl089q68` | Historical reference only; no new write |
| P17 | `cmwqhrzp30043vt24wceja8fe` | Historical reference only; no new write |

Those products/warehouses were not connected to this dataset or changed. The IDs are retained solely for source lineage and to avoid duplicate catalog registration. Original/mask hashes for P12 TECLAST and P16 soap match the previously approved mask PNGs exactly, but no historical approval was silently replayed as a new employee acceptance.

## 5. Twenty-template compatibility and local composition

The existing versioned registry, scene prompts, pricing controls and media roles are retained. For every photo the authenticated review API returns all20 definitions, with the five relevant-group templates recommended first and the other groups still browsable. **340 per-photo/template metadata compatibility records** were checked.

All17 sources are incompatible with F04 ghost-mannequin mode: the real garment is flat, not an approved volume-garment reference, and the other items are unrelated merchandise. No invisible body, clothing volume, rear seam or unseen garment detail was invented. Faithful apparel previews require TOP_DOWN; no automatic rotation or viewpoint reconstruction was applied.

Mode compatibility does **not** imply mask readiness or real fal quality. The all39 supported registry/mode job paths are additionally re-exercised with explicitly synthetic, locally mocked workflow fixtures in the **separate regression DB**, not by auto-approving these real sources. MOCK outputs there are not part of the real-photo gallery and are not represented as fal results.

Six primary local previews: P01/E02, P02/H04, P06/F02, P10/F03, P12/E02, P16/H01. One extra P01/G01 preview verifies cross-group style browsing without changing catalog metadata. Each records exact template ID/version, source candidate/hash, mask hash, placement and `FAITHFUL_COMPOSITE` lineage.

Native codec verification reports **zero fully opaque captured-RGB mismatches** on the six primary local previews. Edge alpha can blend/feather, and displayed WebP/screenshot copies are lossy; neither is asserted byte-identical to the original. This verifies foreground pixel policy, not completeness of transparent objects or tiny wheels.

Private A/B/C boards:

- [Real garment: original / ONNX isolation / local black-gold composition](D:/rezona-real-studio-qa/run-3bbbdf05/media/P10-comparison.png)
- [AirTag package comparison](D:/rezona-real-studio-qa/run-3bbbdf05/media/P01-comparison.png)
- [Suitcase comparison — inspect wheel edges before any paid test](D:/rezona-real-studio-qa/run-3bbbdf05/media/P06-comparison.png)

Every remaining photograph has its original and actual isolation attempts visible in the gallery. Unsafe masks are not hidden or converted into a fake successful premium result. The gallery links local cleanup fallbacks separately from isolation.

There is also a separate private before/after board for **every photograph**, including all failures: [all17 board paths and hashes](benchmarks/real-product-studio/3bbbdf05/all17-comparison-boards.json). Files are `D:/rezona-real-studio-qa/run-3bbbdf05/media/P01-before-after.png` through `P17-before-after.png`; unsafe-mask boards are explicitly labeled DO NOT SELECT, with the real CLEAN fallback identified as not isolation.

## 6. Admin/backend changes and safety boundaries

New isolated-QA read flow:

- GET `/api/admin/product-intake/studio-review`: bounded owned results matrix, all20 compatibility records, no arbitrary manifest path.
- POST `/api/admin/product-intake/studio-review/:photoId/local-preview`: template ID/version only; no provider URL/model/prompt/image input. It is a **derived local-only preview**, not a generation/approval endpoint.
- Existing original/private-candidate preview APIs and existing editor decisions are reused.

The feature is default OFF and requires NODE_ENV=test, the exact loopback real-photo database pattern/port, and a fixed private QA index path. The API checks Admin JWT/token type, existing intake/upload permissions, session ownership, current capture, source/mask hashes, compatible template and source posture. Unsafe/recapture rows are blocked. Retaken/finalized sources are marked unavailable; local-preview commit/response checks the current capture again.

One local transformation is allowed at a time; concurrent preview receives429 rather than spawning unbounded work. The existing isolated child codec is reused and inherits no provider/DB credentials. A preview has no selectable candidate ID, creates no FileAsset/decision/usage row and cannot become a product primary.

Flutter uses account-scoped authenticated routes, two concurrent image reads, immutable source-aware caching and actor fences before/after responses. No public storage URLs are embedded in the client. Browsing/selection/cancel/rebuild does not dispatch paid work. The template cards remain truthful local scene concepts; the real product/result is shown in separate labeled views.

Labels are explicit: **LOCAL PREVIEW**, **NOT YET GENERATED**, **REAL_FAL_NOT_AUTHORIZED**. No new mock image is mixed into the real-photo gallery. Existing generative candidates remain AI_PROMOTIONAL, never factual primaries; material identity mismatches must still be rejected.

No schema migration or new product/inventory subsystem was introduced. The evaluator is not permission to bypass approved-mask/employee approval requirements in the actual paid Studio path.

## 7. Isolation, privacy and unchanged business state

New resources only:

- PostgreSQL: loopback55456; photo DB `rezona_real_studio_qa_3bbbdf05`.
- Separate regression DB: `rezona_real_studio_reg_3bbbdf05`.
- Redis56396, DB0 for photos / DB1 for synthetic business regressions.
- Private MinIO59057/console59058; distinct photo/regression buckets.
- Transient actual API18524 for photos;18526 for regression fixtures.

All40 existing migrations were applied only to these new databases. Runtime processes close after each test. Existing protected containers/databases were not migrated or seeded.

In the **photo DB**: zero ProductListing, Customer, CustomerWallet, Warehouse, WarehouseLocation, InventoryMovement, Order and Auction records; zero image decisions; zero RecognitionUsage/provider jobs. All82 admitted original/local/mask assets rejected unauthenticated public API reads (404). Tests also check no-store owned previews, invalid template/version/client fields, disabled-feature404 and one-preview concurrency.

Synthetic commerce/intake tests deliberately create toy records only in the separate regression DB; they never register the17 photographs or use historical product IDs for writes. Their explicit synthetic publication/privacy tests are not automatic publication of real or AI product imagery.

The protected baseline includes **546** prior evidence/report/private-original and financial/intake source hashes. It is checked unchanged, alongside all17 current/copied source hashes. This proves this evaluation did not rewrite those artifacts; it is not a fresh read audit of every historical DB balance.

## 8. Tests and evidence

Final verification index: [final-validation.json](benchmarks/real-product-studio/3bbbdf05/final-validation.json).

Automated matrix: **421 backend unit tests /36 suites**, **27 e2e /seven suites**, **202 Admin**, **166 customer**, **18 shared UI**, **20 API-client** tests — **854 passed in aggregate**, plus one optional image-decode benchmark skipped. TypeScript, scoped ESLint and full Admin analysis pass. Test logs retain earlier failed intermediate attempts and corrected reruns; native-device acceptance is not claimed.

Relevant actual service checks include all17 admissions, real ONNX + guided processing, 340 compatibility records, six primary local previews, an extra GENERAL preview, private asset access denial, conservative concurrency, mode/version/field rejection, no provider calls and unchanged session metadata. Seven new backend cases cover QA scope, source/actor fences and no-write/no-provider preview behavior. Four new widget cases cover all17 real-photo rows at phone/tablet sizes, explicit local preview, paid-disabled controls and two-slot actor-scoped transport.

Separate real HTTP regression checks:16 warehouse/commerce groups and11 Phase5 intake groups, including wallet/COD/idempotency/final-unit races, shipment/cancellation, physical stock/transfer/adjustment/reconciliation, NEW/replay, STOCK_IN, rollback, retakes and private eight-variant lifecycle. The 39 mocked template/mode service paths are isolated regression evidence, not real model acceptance.

Failures retained include the initial DB startup race (before any photo admission), corrected safety-audit model name, and initial analyzer/render fixes. No old evidence was overwritten or deleted. Final success does not relabel a bad mask as good.

## 9. Proposed future fal plan — NOT AUTHORIZED

Read-only [official Nano Banana Lite Edit page](https://fal.ai/models/google/nano-banana-lite/edit), reviewed2026-11-24, lists input $0.3125/million tokens, text output $1.875/million and image output $37.50/million, with fixed1024×1024 output. No account key, billing permission or inference endpoint was used for this review.

For planning only, the previously conservative65536 input /4096 output token assumptions, with all output priced at the higher image rate, give:

`(65536 × 0.3125 + 4096 × 37.50) / 1,000,000 = $0.174080 per request`.

This is a **planning reservation**, not a confirmed charge, contractual/provider-enforced maximum or configured current fal billable-unit quote. Actual account balance/shared remaining budget was **not read and remains UNKNOWN**. The real adapter still requires a current reviewed pricing record and explicit approval.

| Plan | Exact source/template combinations | Count | Conservative planning reserve |
| --- | --- | --- | --- |
| Full provisional set, only after employee review | P01/E02, P02/H04, P10/F03, P12/E02, P16/H01; faithful only |5 | **$0.870400** |
| Smaller first pilot recommendation | P01/E02 electronics + P10/F03 flat garment, only after approval |2 | **$0.348160** |
| Conditional/excluded | P06 wheels need closer review; other11 masks/source cases unsafe |0 authorized | No reservation/dispatch |

A funded account is not authorization. These combinations require separate fixed request/spend and private-transfer approval, exact source/mask/template hashes, current pricing and read-only budget reconciliation.

Existing historical conservative commitments remain **$1.044480**, separate from charges. The earlier TECLAST dashboard billed event $0.042409 remains the known confirmed event, not an invoice. Soap422 correlation is still PROVISIONAL and its source-attributed charge/root cause remain UNKNOWN/UNRESOLVED. TECLAST Warm remains UNKNOWN; no re-dispatch or reservation release occurred. **Historical total actual spend remains UNKNOWN.**

The existing conservative daily admission gate would count $1.044480 +$0.870400 =$1.914880 for all five, above the retained $1.50 daily ceiling, and five sources exceed the existing four-source pilot scope. First two plus carry=$1.392640, but still require a real remaining-budget check. The current photo QA DB is not in the live-provider allowlist. **No gate was widened to make the full set fit.** Proposed numbers do not authorize execution or change daily/monthly policy.

Machine-readable exact plan: [proposed-paid-plan-NOT-AUTHORIZED.json](benchmarks/real-product-studio/3bbbdf05/proposed-paid-plan-NOT-AUTHORIZED.json).

## 10. Coverage limits and next safe step

- Fashion now has one real flat garment and a travel accessory; no evidence supports ghost-mannequin reconstruction. Do not claim all clothing types or volume/pattern/label fidelity accepted.
- General merchandise is represented by wheel covers but their transparent packaging is not accepted; the extra G01 box preview demonstrates style override, not wheel-cover quality.
- Agent visual review is preliminary. Close employee inspection of labels, edges, holes, thin/transparent pieces and completeness remains required. P06 is specifically excluded from the provisional paid set.
- No new real fal result exists. Premium lighting/grounding/no-duplicate/brand correctness and paid value are not proven by local scenes, mock tests or prompt wording.
- Native-device camera/font/performance, staging/old-binary tests, current account reconciliation and existing security/catalog performance/WAN gates remain open. The previous production NO-GO is not superseded.
- Next: owner/employee reviews the private gallery, recaptures the ten flagged sources (with a simpler contrasting background and all parts inside the frame), resolves P11 transparent packaging and P06 fine edges, then may separately approve a two-image paid pilot. Nothing is sent automatically.

## 11. Reproduction / changed files

From `C:/Users/3ma/Documents/aboessa/AboEssa`:

```powershell
node scripts/real-studio-qa.cjs baseline
# Existing immutable run snapshots already exist; never overwrite/re-initialize them.
# New runs need a fresh no-overwrite workspace and explicitly scoped database resources.
$env:REAL_STUDIO_BUILD='v3'
node scripts/real-studio-runtime.cjs checks
node scripts/real-studio-business-regression.cjs commerce
node scripts/real-studio-business-regression.cjs intake
node scripts/real-studio-business-regression.cjs studio
node scripts/real-studio-matrix.cjs backend
node scripts/real-studio-matrix.cjs e2e
node scripts/real-studio-matrix.cjs mobile
# Optional local API for an authorized QA Admin build, no paid provider enabled:
node scripts/real-studio-runtime.cjs serve
```

Do not rerun one-shot export/preview scripts into existing output filenames. QA Admin build uses the existing app with `RAPID_PRODUCT_INTAKE_ENABLED`, `INVENTORY_MANAGEMENT_ENABLED`, `IMAGE_ENHANCEMENT_ENABLED` and `REAL_PRODUCT_STUDIO_QA` compile flags; target only this isolated API. No APK was installed and no real customer-facing runtime was deployed. Runtime credentials remain private/backend-only and are not printed in this report.

Feature source files:

```text
AboEssa/.gitignore
AboEssa/.env.real-studio-review.example                         new disabled documentation
AboEssa/src/image-enhancement/real-studio-review.ts            new QA scope/index contract
AboEssa/src/image-enhancement/enhancement.service.ts           read-only matrix/local preview
AboEssa/src/product-intake/intake-enhancement.controller.ts
AboEssa/src/product-intake/product-intake.module.ts
AboEssa/tests/unit/real-studio-review.spec.ts
AboEssa/tests/admin-console-flow.e2e-spec.ts                   explicit new regression DB guard only
AboEssa/tests/customer-account-deletion.e2e-spec.ts            explicit new regression DB guard only
AboEssa/scripts/real-studio-*.cjs                              isolated setup/evaluation/evidence
AboEssa/docs/rezona-real-product-studio-evaluation.md
AboEssa/docs/benchmarks/real-product-studio/3bbbdf05/*           sanitized new evidence
AboEssaMobile/apps/admin_app/lib/features/product_intake/real_studio_review.dart
AboEssaMobile/apps/admin_app/lib/features/product_intake/intake_pages.dart
AboEssaMobile/apps/admin_app/test/real_studio_review_test.dart
```

All unrelated local changes/retired files are preserved. No dependency upgrade, payment/stock/wallet/order/auction change, Git push, production deployment, automatic publishing or paid inference was performed.

