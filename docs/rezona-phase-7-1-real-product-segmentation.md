# REZONA Phase 7.1 — real-product segmentation, local validation

Date: 2026-11-21, Asia/Baghdad. Repositories: AboEssa and AboEssaMobile.

## Verdict

The local engineering workflow is implemented and tested. A pinned offline U²-Net worker now generates real probability masks, composites captured product RGB, stores private candidates/masks and reuses Phase 7 employee review and Phase 5 submission. No stock, checkout, wallet, order or auction semantics were changed.

**Quality acceptance is narrower:** both models failed to select just the can automatically in the cluttered Rexona photograph. Employee rectangle guidance plus full U²-Net produced a useful limited demonstration: the visible can was separated from the desk, glass and speaker, with the photographed Rexona/72h lettering retained. The cap was already clipped in the original capture; it was not reconstructed. Minor edge uncertainty still requires inspection. This is **one distinct real product**, not warehouse-wide acceptance. A normal recapture should include the complete cap and more separation from touching clutter.

**Production remains NO-GO.** No staging/production deployment, Git push, paid inference, external private-image transfer, APK installation/launch, app-data clear or real-customer mutation occurred. All new features default OFF. Physical camera/native UI acceptance is NOT VERIFIED.

## 1. Baseline and boundaries

Read the existing Phase 7, 6, 5, 4 and 3.1 reports and Phase 7 benchmark evidence. Phase 7 CLEAN retained the entire scene on a neutral canvas; it was not background removal. Its conservative white-border algorithm correctly refused this cluttered photograph. The previous 694 tests and CLEAN P95 554ms are historical evidence, not substitutes for this run.

Only the retained authorized `D:/rezona-phase5-qa/physical-upload-original.jpg` was used as a real photograph: 1600×900, 234,959 bytes, SHA256 `3bc638e8e0d51fa0c8c347aaf807e88700b27094146abeed11517b50f14de912`. The source file remains unchanged. No online product images were scraped or substituted.

Three generated fixtures cover simple white-on-white, dark-on-dark and thin-handle geometry. These are synthetic test inputs, not three additional real products. Automatic and guided runs of Rexona are conditions of the same photograph. Thirty timing operations do not mean thirty products.

## 2. Model rights, provenance and runtime decision

The [pre-download model audit](benchmarks/phase7-1/model-license-audit.md) records upstreams, artifact/card links, revisions, license evidence, exclusions, redistribution obligations and provenance limitations. It was created before downloading/executing weights.

Admitted local artifacts:

| Model | Exact file / bytes | SHA256 |
| --- | --- | --- |
| U²-Net-P | `u2netp.onnx` / 4,574,861 | `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8` |
| U²-Net general | `u2net.onnx` / 175,997,641 | `8d10d2f3bb75ae3b6d527c77944fc5e7dcd94b29809d47a739a7a728a912b491` |

These are the maintainer-distributed rembg release v0.0.0 ONNX artifacts, assets 85857953 and 85857932, cross-checked against pinned mirror manifests and maintainer MD5s. SHA256 is checked on the actual buffer before session creation, not merely against a caller-supplied checksum. Input `input.1`, first saliency output `1959`, CPU FP32 320×320; seven-output graph lineage is recorded in `models.json`.

The U²-Net author explicitly includes released models in the Apache-2.0 permission statement; rembg's permissive library license alone was not treated as a weight grant. See the [author clarification](https://github.com/xuebinqin/U-2-Net/issues/208) and [maintainer source mapping](https://github.com/danielgatis/rembg#models). Exact historical exporter commit/PTH checksum and independently reproduced numerical conversion parity are unavailable; the evidence is upstream released-weight permission plus maintainer distribution/source mapping and independently corroborated artifact identity. This limitation is retained, not silently presented as a fully reproduced conversion. Dataset rights remain separate and require owner/legal review before commercial packaging. No legal non-infringement opinion or production clearance is asserted.

IS-Net/DIS was excluded because exact pretrained-weight commercial permission was not sufficiently established; [upstream issue 150](https://github.com/xuebinqin/DIS/issues/150) distinguishes this from code licensing. BiRefNet_lite was excluded for this task despite MIT declarations: [the author discussion](https://github.com/ZhengPeng7/BiRefNet/issues/306) acknowledges training-dataset complications and exact converted-checkpoint provenance needs stronger review. BRIA noncommercial weights were excluded. withoutBG ensembles and thin-provenance alternatives were not adopted or downloaded. No cloud package or service was started.

Selected runtime: Node `onnxruntime-node` **1.31.1**, MIT, CPU-only, exact lockfile in `tools/segmentation-runtime/`. Its optional runtime directory is outside the application dependency tree. [Official binding documentation](https://onnxruntime.ai/docs/get-started/with-javascript/node.html). No PyTorch inference or GPU is required. Python was not benchmarked: no usable existing interpreter was identified, and the working Node route gave no demonstrated advantage justifying another stack. This is an unrun comparison, not a claim that Python is slower.

Selected model: **full U²-Net with a disposable process per image**, because guided mask fidelity was better on the available real case. U²-Net-P remains an explicitly selectable evaluated alternative, not an automatic fallback: it retained touching cable residue in the guided real example. Full-model process reuse was unsafe at the original 768MiB budget; see resource investigation below. Selection does not imply broad accuracy or server-capacity acceptance.

## 3. Implementation and product-pixel policy

Existing private Phase 5 source → existing Phase 7 job/outbox → isolated local ONNX child → validated mask → captured RGB/alpha composition → private candidate → employee decision → existing Phase 5 transaction.

The worker accepts bytes from the immutable original, never a public URL or catalog thumbnail. JPEG/PNG/WebP decoding is bounded to 12MiB, 12MP and 8192px edges, single page, orientation-corrected and converted to sRGB. Metadata is not copied into derivatives. Originals are never overwritten.

Preprocessing follows upstream U²-Net channel normalization: RGB divided by the maximum pixel value, mean `[0.485,0.456,0.406]`, standard deviation `[0.229,0.224,0.225]`, NCHW. **Versioned variation:** the upstream square-stretch resize is replaced with aspect-preserving 320px letterboxing and normalized-zero padding. This is explicitly our recipe, not a claim that upstream uses letterboxing. Padding offsets, integer resize dimensions and optional employee crop are retained; output padding is removed, mask resized to crop geometry and placed back at its original coordinates.

The first sigmoid output is checked for finite/range/shape validity, then min/max normalized. The stored mask is the unthresholded, normalized, inverse-mapped probability image, not ground truth or a raw float tensor. Composition alpha snaps only confident exterior/interior values (`<=10→0`, `>=245→255`); intermediate edge alpha remains. No broad erosion, blur, hole filling, automatic component deletion, texture painting, OCR reconstruction, generative repair or inpainting occurs.

RGB comes only from the decoded source. Confident foreground RGB is not changed before ordinary aspect-preserving crop/resampling and neutral composition. Output is contained within an 880px area on a 1024×1024 white/light-gray canvas, without enlargement. This is not a claim that every final resized pixel is bit-identical to the source JPEG. Unit tests verify source-color retention and mask alignment; lossless WebP is checked for exact decoded equality to its PNG composition. Label review is visual, not a semantic OCR certificate.

Recipe: `u2net-letterbox-original-rgb-v1`. Job identity includes source hash, model, exact weight revision, recipe, mode, background and canonical optional rectangle. Guidance changes the request identity. Recognition still reads the original capture; enhancement cannot overwrite employee-approved metadata, price, location or quantity.

### Guidance and safety gates

The optional employee action selects a rectangle containing the whole product and accessories. It is not an automatic product detector or a brush editor. Coordinates are validated, stored with the job and inversely mapped. The UI supports resetting/cancelling selection. No Rexona-specific coordinates are hardcoded in production code; the benchmark's rectangle is explicitly a human QA annotation.

Malformed/flat/empty/nearly opaque masks are refused. Foreground fraction guards (`0.005–0.97`), uncertainty fractions, border contact and separated salient components produce refusal/review signals. Components are not automatically discarded because they may be real accessories or multipacks. These broad numeric guards are **engineering heuristics, not thresholds calibrated on 30–50 real products**.

Warnings cover source-boundary clipping, ambiguous masks, disconnected regions, attached clutter, transparency and checking labels/shape. All warnings are visible in Flutter, including boundary warnings. Every candidate retains the existing `REVIEW_REQUIRED` status; no candidate is automatically accepted or published. Clearly invalid processing returns failure and leaves the original/manual route available. Low-resolution saliency can still remove real parts: employee review is not optional.

## 4. Real visual evidence and review outcome

Private directory: `D:/rezona-phase7-1-qa/evidence/`. No photographs or model binaries were added to Git.

Key files:

- `rexona-review-board.png`: original, rejected automatic result, guided full result, raw mapped mask, checkerboard and label crop.
- `rexona-real-original.jpg`: unchanged source copy.
- `rexona-guided-u2net-mask.png`, `rexona-guided-u2net-checker.png`, `rexona-guided-u2net-white.png`.
- `rexona-original-label.png`, `rexona-guided-label.png`, `rexona-q95-label-comparison.png`.
- Equivalent U²-Net-P and automatic outputs, PNG/lossless/Q95 files and synthetic fixtures.
- `review-notes.json`: engineering inspection, explicitly not employee sign-off.

The [evidence manifest](benchmarks/phase7-1/evidence-manifest.json) records hashes, model identities and private file sizes. Engineer inspection found the automatic results unacceptable because they include the table and unrelated objects. Guidance plus the small model still retains cable residue. Guidance plus the full model separates the visible can; the captured lettering, color and tilted silhouette remain recognizable. The original blur and already-clipped cap remain; no missing cap was synthesized. Small edge fringes are not presented as perfect matting.

Synthetic white/dark outlines and the thin handle were inspected. Their success does not establish transparent bottle walls, real metallic reflections, motion blur, multipacks, attached accessories, hands or touching clutter accuracy. Those real cases were unavailable. Employee approval rate, missing-part rate and broad isolation accuracy are **not estimated** from one photo. Future acceptance needs roughly 30–50 authorized distinct real products and genuine operator review, not more crops/repetitions of this image.

## 5. Timing, memory and storage

Latest Windows benchmark: Node v24.16.0, 12 logical CPUs, approximately 16GB host RAM, ONNX CPU with two intra-op threads / one inter-op thread, sequential execution. One real photo under two conditions plus three synthetic fixtures; three repetitions each = 15 attempts per model, 30 total. Final benchmark ran after the HTTP test process exited, with no build rewriting active worker code. OS file caches were not flushed: cold means a new process/session, not a cold disk or device boot.

| Metric | U²-Net-P | Full U²-Net, selected |
| --- | ---: | ---: |
| Computed valid derivatives (not quality approvals) | 15/15 | 15/15 |
| Inference P50 / P95 | 244 / 293ms | 619 / 669ms |
| Local whole processing P50 / P95 | 697 / 1445ms | 1790 / 2409ms |
| Cold verify/runtime/model initialization | 132, 141ms | 568–634ms |
| Warm inference P50 | 241ms | Not applicable: process discarded per image |
| Maximum sampled child RSS, Windows | 605,134,848 bytes | 807,628,800 bytes |
| Codec CPU time P95 | 922,000µs | 1,703,000µs |

Whole-processing timings include the benchmark's PNG/WebP/Q95 comparisons and eight Phase 2 variants, not the HTTP queue. CPU time is the codec phase, not all model-initialization CPU. RSS is sampled every 100ms and can miss transient peaks; it is not a hard native-memory limit. This fixture mix differs from Phase 7's mix, so the historical CLEAN 554ms P95 is not an apples-to-apples speed ratio. Neural isolation is materially more expensive.

Real HTTP/Postgres/BullMQ/MinIO job cohort: 10 completed full-model QA jobs, including intentional restart/concurrency cases. Claim-to-result P50/P95 **1790/1895ms**; request-created-to-completed P50/P95 **3045/4601ms**, including dispatch/queue waits. These repeat the same authorized photo and are not independent acceptance samples or production SLAs. See `http-job-metrics.json`.

Forty local catalog HTTP reads concurrent with an actual full-model job all returned successfully: P50 **17.04ms**, P95 **22.42ms**, maximum **24.62ms**. There is no matched idle-control trial, production traffic soak, or measured concurrent checkout latency; do not infer a production capacity improvement. Commerce correctness was regression-tested separately.

### Resource investigation and hard-limit test

The original 768MiB Linux container test let the small model finish 6/6 but the full model failed 6/6. Earlier Windows full-model reuse also caused 7/15 resource refusals. Both failed investigations are retained, not hidden by successful reruns. This motivated one image per full-model process, not a larger JS heap masquerading as native safety.

The reviewed local alternative used an existing cached Linux QA image (no image pull), image ID `sha256:247f071e36b4d0e03bbadc47ccca34ef7e32304e0e47ecb7f8aaf77208097dd6`, Node v24.22.3, glibc2.36, Sharp0.35.5. Container: 1GiB hard memory/swap cap, two CPUs, pids64, nonroot, read-only root/source/model/runtime, no network, no capabilities, no unrelated credentials. Full model completed **6/6**, each with a fresh process; small model completed **6/6** with safe bounded reuse. Combined cgroup peak: **1,010,618,368 bytes**. Child RSS and cgroup charged memory are different accounting metrics and must not be summed/interchanged. Headroom is limited; this is not proof that all 12MP images or the intended production server fit.

Normal host child safeguards: one active inference locally, PostgreSQL advisory/lease gate for one neural job across consumers, 45s watchdog, two native inference threads, sampled RSS exit guard (small768MiB/full1024MiB), full-model disposal, small-model recycle after 12 jobs or 60s idle. JS heap cap256MiB is not a native memory cap. A future deployment must supply an OS/container hard limit and validate total API/DB/cache/worker capacity; host watchdogs alone are insufficient. A simultaneous-consumer integration test verifies the second job remains pending with zero consumed attempts. This is not a multi-replica soak test.

Optional runtime files occupy 308,893,509 bytes across 539 files in the QA runtime; evaluated weights total 180,572,502 bytes. This cross-platform development package is not a reviewed production image. No runtime/weights are in Flutter. No destructive cleanup/retention policy was introduced.

### Storage comparison, guided full-model example

| Object | Bytes |
| --- | ---: |
| Immutable source | 234,959 |
| Equivalent composed PNG | 635,103 |
| Selected WebP lossless master | 224,524 |
| Opaque Q95 WebP, evaluated but not selected | 52,144 |
| Private mapped mask PNG | 76,185 |
| Eight existing public optimized variants | 108,864 |

Lossless master saves approximately 64.6% versus the same composed PNG and decodes to exactly the same RGB. Q95 has full-canvas mean absolute channel difference0.2812/255 and maximum12/255; those are not OCR or fine-print acceptance scores. It was visually compared but not selected because pixel-changing compression is unnecessary for the immutable master. Public lower-resolution WebP/JPEG recipe v1 and old original URLs are unchanged. Source+selected master+mask+eight variants here total 644,532 bytes, before database/history/storage overhead. Originals, rejected candidates and QA evidence remain retained.

## 6. Durable integration and media privacy

Added mode `NEURAL_BACKGROUND_REMOVE` to existing job validation/check constraint. Additive migration `20261121000100_local_product_segmentation` adds job `parameters`, nullable candidate `processingDetails` and a private mask FileAsset relation. It does not modify inventory tables or rewrite prior migrations. Full source/model/recipe identity survives requests, job recovery and result replay.

Existing queue capacities remain: 100 pending/processing globally, 10 per employee, 32 jobs per session, bounded BullMQ dispatch. Neural computation is outside database transactions and the Nest request event loop. Existing leases, current-source authorization, cancellation fences and maximum three local attempts apply. No local segmentation ledger charge is created. Old/new model configuration mismatches fail closed rather than silently changing checkpoints.

Tests exercise retake while actual inference is in flight, cancelled/expired work, persisted queue restart, repeated same-key requests, conflicting rectangle reuse and a deliberately corrupt QA weight COPY. The corrupt copy is rejected by SHA before ONNX execution; the approved model is not modified. Original/manual NEW submission still succeeds after failure. Source A cannot replace selected source B or change manual business fields.

JWT, employee role/permissions and session ownership protect original/candidate/mask preview. Mask preview reuses the existing authenticated endpoint with `kind=mask`, edge480/1024 and `no-store`; there is no standalone public inference service. Draft/unknown intake prefixes remain404. Candidate/source/mask public access was tested; after explicitly activating a QA product, only the exact associated candidate and eligible eight variants become public. Mask and original stay private. No automatic model download, checksum bypass, provider-secret inheritance or arbitrary remote URL input exists.

The child environment contains only necessary OS/runtime/model configuration, not database/signing/provider credentials. Model bytes are verified before loading. Linux inference was proven with networking disabled. Optional runtime health checks are configuration/file/version availability, not a promise of model accuracy; initialization/decode/resource errors still fail safely.

NEW selection resolves through the existing serializable submit transaction: one DRAFT product, one physical opening, same-key replay returns the original result. STOCK_IN records media review but does not replace existing catalog images. Phase 6 recognition and Phase 4 inventory authority remain intact.

## 7. Flutter review and test matrix

Rectangle selection is bound to the image ID captured before opening the page. If the employee retakes the photo while that page is open, the coordinator refuses to apply the old rectangle to the new capture. A regression test verifies that no inference starts in this case.

Existing enhancement coordinator/journal persists the rectangle before POST, reuses the same identity after a lost response, scopes data to origin/employee/image and retains stale-source protections. The employee sees processing, failure, review-ready and boundary/label/shape warnings; all warnings are displayed rather than truncating off the cap warning. Existing original/enhanced toggle, side-by-side zoom, accept/reject/keep-original and manual fallback remain. No new model package is bundled with the app.

New selection page only draws a rectangle over a bounded private preview; source proportions and coordinate mapping were widget-tested on 320px phone and 834px tablet sizes. Reset/cancel are supported. This is a widget test, not a physical Android acceptance claim. No Phase7.1 APK was installed, launched or used to clear/replace an existing application.

| Verification | Result |
| --- | --- |
| Backend build / scoped ESLint | Pass |
| Backend unit | 295 tests, 27 suites pass |
| Backend database/HTTP e2e | 27 tests, 7 suites pass |
| Admin analyze | No issues |
| Admin Flutter tests | 184 pass |
| Customer Flutter tests | 166 pass |
| Shared UI | 18 pass; one inherited opt-in performance test skipped |
| API client | 20 pass |
| Total automated tests | **710 pass, one optional skip** |
| Actual Phase7.1 + Phase7/6 integration | 44 check groups pass |
| Phase4 commerce/inventory regressions | 16 check groups pass |
| Phase5 intake regressions | 11 check groups pass |
| Fresh37 / read-only Phase7 clone36→37 | Pass; 56 old-table column projections unchanged |
| Isolated runtime npm security audit | Zero reported advisories at audit time; not a model/native-binary security certification |

Real integration used Nest HTTP, PostgreSQL, Redis, BullMQ, MinIO and actual local ONNX, not a mocked segmentation provider. Phase6 recognition and Phase7 external-editing provider tests remain mocks with zero paid/live calls. Checkout, wallet/COD, cancellation/refund, shipment, stock races/transfers/reconciliation, intake and existing auction-related automated suites were rerun. No new live auction or customer payment was created outside isolated QA. Log details and individual checks are under `docs/benchmarks/phase7-1/`.

## 8. Exact source scope and reproduction

Backend additions: `segmentation-model.ts`, `segmentation-codec.ts`, `segmentation-child.ts`, `segmentation-isolate.ts`, isolated runtime manifest/lock, `.env.phase7-1.example`, unit tests and `scripts/phase7-1-*`. Existing enhancement service/runtime/config, intake enhancement DTO/preview controller, Prisma schema and narrowly scoped e2e target allowlists were extended. No unrelated business implementation was edited for this phase.

Flutter: new `intake_foreground_region.dart` and tests; existing enhancement card/repository and enhancement test extended. Existing dirty source trees were not reset, cleaned, committed or pushed.

Evidence integrity note: while adapting the QA launcher, initial reruns inadvertently wrote three generated summaries into `docs/benchmarks/phase7/{checks,commerce-regressions,intake-regressions}.json`. They now explicitly identify the Phase71 QA database and are **not the original Phase7 snapshots**. Original Phase7 narrative, image benchmark and manifest remain; old manifest hashes for these three summaries no longer establish their original bytes. This was not hidden or reconstructed with invented timestamps. The destination was corrected; all final reports are separately under `phase7-1`. No original photographs or application source were lost.

Run from `C:/Users/3ma/Documents/aboessa/AboEssa`, PowerShell, with no active workers during builds:

```powershell
$env:REZONA_PHASE71_QA='1'
node scripts/phase7-1-prepare-models.cjs
node scripts/phase7-1-resources.cjs
$env:DATABASE_URL='postgresql://phase71_qa:phase71-local-only@127.0.0.1:55452/rezona_phase71_qa'
npx prisma migrate deploy
node scripts/phase7-1-test-matrix.cjs backend
node scripts/phase7-1-test-matrix.cjs mobile
node scripts/phase7-1-segmentation-qa.cjs checks
node scripts/phase7-1-segmentation-qa.cjs commerce-regressions
node scripts/phase7-1-segmentation-qa.cjs intake-regressions
node scripts/phase7-1-segmentation-benchmark.cjs
node scripts/phase7-1-run-container.cjs
node scripts/phase7-1-job-metrics.cjs
node scripts/phase7-1-evidence.cjs
```

The model installer is an explicit operator-time action using exact pins and `npm ci --ignore-scripts`; requests never install dependencies or download models. Runtime/model directories are fixed isolated QA paths. HTTP test port18495 (serve18493), PG55452, Redis56392 and MinIO59052 bind loopback. Windows reserved the initial proposed58495 port; it was not worked around by weakening OS security. No repository dotenv is loaded by the QA API launcher. The one-off migration-clone script refuses an existing upgrade database; do not delete/overwrite it just to rerun evidence. Protected Phase5/6 services were not written. Protected Phase7 PostgreSQL was only read for a dump and returned to its original stopped state.

QA APIs exited after tests. Dedicated Phase71 data/services and private artifacts are retained for investigation; no cleanup or production operation is automated.

## 9. Packaging, rollback and unresolved acceptance

Before any separately authorized staging deployment: owner/legal review of exact weight/dataset/conversion evidence; reviewed model/runtime artifact registry with SHA and license/NOTICE preservation; nonroot isolated backend worker with no image egress; OS CPU/memory/pids limits and real server-capacity measurements; no GPU/automatic infrastructure upgrade; migration rehearsal/backup/restore; 30–50 distinct authorized product photos with operator review; physical camera/review workflow; privacy, retention and failure/queue alarms. Apache redistribution obligations and runtime notices must accompany any future approved packaging. Weights are backend-only, never Flutter assets.

Sequence: backup database and private media; deploy additive migration37; deploy new backend with neural flags OFF; validate old clients/CLEAN/manual flows and existing private/public gates; provision separately reviewed pinned runtime/weights; enable only isolated staging opt-in; evaluate quality, saturation and recovery before requesting production approval.

Rollback: disable neural flag, stop neural dispatch/worker safely, retain originals, candidates, masks and decisions. Roll back only to a compatible Phase7 backend with private intake-media guards; leave additive columns/tables in place. Do not drop masks, rewrite approved media or modify stock to roll back image processing. Old workers reject the unfamiliar recipe rather than silently reinterpret it. Old clients can continue original/manual flows; actual old signed APK/iOS compatibility remains unverified. WebP lossless uses already-supported source types; all eight unchanged v1 public variants were exercised. Do not roll back to a server version predating private intake-prefix enforcement.

Remaining release gates are not waived: Phase3/3.1 catalog frame-tail findings; real staging Wi-Fi/mobile-WAN; MinIO dependency-chain high advisories; production signing and older app compatibility; staging migration/disaster recovery; physical warehouse reconciliation and employee acceptance; Phase5 draft/media retention; Phase6 live recognition quality/native acceptance; Phase7 live image-editing quality/provider billing; Phase7.1 broad real-product segmentation quality and total server CPU/memory capacity.

Final local engineering verdict: **implemented with verified isolated integration and a guided single-photo demonstration; automatic cluttered-scene selection and general commercial/production readiness are not accepted.**
