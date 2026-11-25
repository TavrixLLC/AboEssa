# REZONA Phase 5 — rapid product intake

Review date: **2026-11-20, Asia/Baghdad**. Scope: the existing dirty AboEssa/AboEssaMobile worktrees. **Local automated validation and the physical Android debug core workflow pass. Release/WAN/employee acceptance and a fair full-workflow benchmark are not complete. Production remains NO-GO.** No production/staging deployment, Git push, real-customer mutation, paid AI service or Phase 6 work was performed. Phase 3/3.1 security/rendering/WAN gates and Phase 4 physical/staging acceptance remain open.

## Mandatory creation/media audit — recorded before implementation

- Current `POST /api/admin/products` uses ProductsService.create: title, active category and price >=0.01; optional description/images/discount. normalizeQuantity defaults to one and requires positive integer quantity. A single Prisma create initializes DRAFT with total=available=quantity and sold=0. Audit is a later side effect. Images are not mandatory in this legacy endpoint. Product price is Decimal(12,2), not a guessed new pricing model.
- Publication is a separate explicit action: active category, positive availability, status ACTIVE and publication timestamp. SOLD means exhausted availability; CANCELLED is deliberate visibility removal. Phase 4 stock receipts reactivate SOLD but not DRAFT/CANCELLED. Legacy creation has no location mapping.
- Phase 4 `InventoryService.stockIn` commits its own Serializable transaction: durable operation key, product lock, mapping/reconciliation, explicit active physical location, quantity/ledger update, then catalog acknowledgement. Calling legacy create(quantity=N) followed by independent stockIn(N) would double stock and can partially commit. This path will not be used.
- Shared transaction boundaries will be extracted rather than duplicated: create a new DRAFT with an internal zero mapped seed and apply the initial physical opening through the same Phase 4 stock-in core **in the caller's transaction**. Draft completion, media association and durable submission result commit together. Existing-product replenishment calls that same core without creating another listing.
- FileAsset originals and Phase 2 imageJobs/variants already exist. SOURCE_KEY accepts products/auctions; BullMQ claims durable jobs, fences retries, preserves originals and generates content-hashed variants. UploadsService validates MIME/signature/size/pixels/full decode and persists originals. Existing variant byte routes check public ACTIVE references, but the legacy original route serves valid folder keys without publication checks. New intake media therefore needs an explicit private marker and a publication-bound approval link, checked on originals and variants. Existing unrelated legacy media behavior will be preserved.
- Existing Flutter uses ApiClient.multipart, GetIt, Cubit, image_picker, image, path_provider and FlutterSecureStorage through secure_storage. The old picker opens a system camera/crop workflow, not an in-app flash/focus preview. Phase 5 adds the official camera plugin only to admin and takes lifecycle/permission responsibility. Public customer code is not redesigned.
- ProductListing has no product SKU/barcode. OrderItem barcodes are fulfillment identifiers, not duplicate matching data. Existing normalized Arabic inventory search and location selector can be reused.
- Existing Phase 4 pending form keys are memory-only. Phase 5 drafts will persist employee/origin-scoped metadata, session/client/image IDs and the immutable submission key before network work. Image source files stay in app-private storage; authorization tokens remain in the existing token store, never draft JSON. Server-side revision checks prevent silent stale overwrites; image IDs keep delayed uploads attached to their original draft.

## Selected implementation boundary

Separate private intake sessions from catalog listings. Explicit NEW/STOCK_IN mode; employee-approved metadata is authoritative; recognized metadata remains absent. DRAFT/COMPLETED/CANCELLED are durable session states, with independent upload/job status rather than a UI spinner pretending to be server state. Session ownership is enforced; cross-employee access requires an explicit dangerous manage-all permission. Feature defaults off on backend and admin, and depends on Phase 4 management availability without ever disabling mapped-commerce invariants.

Image upload/normalization/processing never runs inside the stock transaction. Retakes use a new immutable image ID. Source originals survive failures; destructive media cleanup is disabled until an approved reference-aware retention procedure exists. Submission recovery queries the immutable server operation, retries the persisted payload/key, and never starts a second receipt just because a response was lost.

## Architecture delivered

The new workflow is part of the **existing Flutter admin app**, not a demonstration project or another primary tab. Entry points are the catalog/products toolbar, admin settings and tablet sidebar, labeled **إضافة منتجات سريعة**. Both the compiled admin flag and server flag default to false and require the Phase 4 inventory-management flag. Existing public customer screens and checkout contracts were not redesigned.

The camera uses the official `camera` package pinned at 0.12.2, rear-first, audio disabled, JPEG, large shutter, flash, focus, gallery and retake. Permission failures show an Arabic explanation/retry/gallery path. Initialization, capture, disposal and lifecycle transitions are serialized. Backgrounding/disposal releases the native camera; a second route cannot open a competing controller. Native `CameraPreview` handles orientation, and focus coordinates account for letterboxing rather than focusing a photograph edge when the employee taps an empty bar. Flash state resets on camera reinitialization. These responsibilities follow the [official camera package guidance](https://pub.dev/packages/camera) and [Flutter camera documentation](https://docs.flutter.dev/cookbook/plugins/picture-using-camera).

`IntakeCubit` provides view state; a GetIt-owned `IntakeRepository` survives route disposal and coordinates drafts, persisted journals, background preprocessing/uploads and submission recovery. The editor exposes one stock-submit action, Save Draft, Capture Next, retake/gallery, explicit location/category selection and a cancel confirmation. Capture Next creates a new image/client/operation identity and clears the physical location; it does not implicitly submit the previous draft. Incomplete input and independent image/media status are visible in a lazy pending list with paginated server loading.

Existing-product suggestions use authorized, bounded Phase 4 inventory search with the existing Arabic normalization. Results include title, category, ID, quantity and a thumbnail/fallback. The employee chooses View Existing, Stock In or Continue New; there is no automatic merge, product barcode matching or fuzzy/AI matching. The full existing-product selector is reused. Changing product or mode clears location. Stock-in never replaces the existing listing's image or approved metadata.

### Local and remote drafts

- A stable `clientDraftId`, separate immutable image IDs and `submissionOperationKey` are generated before network activity. Quantity text and incomplete manual fields can be saved locally. Server state is authoritative for committed work, not a spinner.
- Each journal is stored through `FlutterSecureStorage`, scoped by SHA-256 of API origin + employee ID. There is no plaintext index, password, bearer token or refresh token in draft JSON. Authorization uses the existing normal token store and refresh mechanism.
- Source and prepared photographs are retained in **app-private files**, not the public gallery. Source photographs are not separately application-encrypted; do not equate encrypted journal metadata with end-to-end encrypted images. Android backup is disabled for the admin app. Rooted devices, unrestricted forensic access and an iOS backup/file-protection audit are outside this validation.
- Per-draft serial queues and a two-request gate bound background work. Image preparation is serialized in an isolate. New local unfinished drafts are capped at 100; server pages default to 20, maximum 30; preview bytes are held in an employee-scoped, memory-only cache capped at 12 entries. Lists are lazy and image decodes are bounded (not original-resolution preloading).
- The selected immutable image ID is the only authority for preview/submission. Delayed uploads cannot replace another draft or a later retake. Local edits made during upload are preserved by local-version checks. Interrupted uploads can resume from retained source/prepared files on reopening; pending submissions recover before allowing new edits.
- Server revisions reject stale writes. On conflict, the editor offers an explicit local/server comparison including metadata, quantity, location, mode and image identity. An employee must choose a version, with a fresh revision check; previous local fields/paths are archived in the encrypted journal. Resolving a conflict does not itself commit stock or publish a product.
- Every real request carries a fixed expected actor derived from that operation's original scope. The server rejects an expected-actor/JWT mismatch; a mutable shared actor is not used. A login/refresh/account switch cannot silently replay an old employee's draft as the new employee.

## Database migration and API

`202611190003_rapid_product_intake` is additive. It creates `ProductIntakeSession`, `ProductIntakeImage` and their three state enums; adds `FileAsset.intakePrivate` and nullable approved-product FK; adds owner/client-draft uniqueness, globally unique submission key, per-session immutable image uniqueness and supporting indexes. Foreign keys use restrictive deletion where history/media must survive. Quantity, revision, READY-asset and completed-state checks reject invalid committed records. There is no stock/order rewrite, reset, automatic schema synchronization or historical image-library deletion.

Session states are DRAFT / COMPLETED / CANCELLED. Image-upload states are UPLOADING / READY / FAILED; media-processing states come from the existing Phase 2 job. `approvedMetadata` holds validated employee input. `recognizedMetadata` is absent/null and is **not accepted as an API input in Phase 5**. The schema intentionally separates future suggestions from approved input.

All endpoints below live under `/api/admin/product-intake`, use normal admin JWT/RBAC, feature guard, session ownership (or explicit `product_intake.manage_all`) and `Cache-Control: no-store`.

| Method / relative endpoint | Contract |
|---|---|
| POST `/sessions` | Durable create/replay with client draft ID and persisted operation key |
| GET `/sessions` | Paginated; defaults to own sessions, including for owners; all-employees opt-in requires manage-all |
| GET `/sessions/:id` | Owned server snapshot and current upload/media/missing-field status |
| PATCH `/sessions/:id` | Expected revision; whitelist approved fields, NEW/STOCK_IN, quantity, active physical location, selected image |
| POST `/sessions/:id/image` | One authenticated multipart image and immutable client image ID; max 5 MiB upload |
| GET `/sessions/:id/preview` | Authorized bounded WebP bytes encoded in JSON; no public/private draft-image URL shortcut |
| POST `/sessions/:id/retry-media` | Reuses Phase 2 job; resets FAILED only, not an active/completed job |
| POST `/sessions/:id/submit` | Persisted `Idempotency-Key` + expected revision; atomic product/stock/session completion |
| GET `/submissions/:key` | Owned COMPLETED / NOT_COMMITTED / CANCELLED result recovery |
| POST `/sessions/:id/cancel` | Revision-checked cancellation; no stock mutation or destructive media cleanup |

`product_intake.use` permits intake use, not arbitrary product creation. Upload also requires existing image-upload authority; submission dynamically requires `inventory.receive` and, for NEW, existing product-create/manage authority. Permissions are registered in the existing bilingual catalog. Customers, unauthenticated calls and unrelated staff cannot access private drafts.

### Atomic inventory and idempotency

The existing `ProductsService.createInTransaction` and `InventoryService.stockInInTransaction` share the caller's Serializable transaction and existing bounded retry/locking/reconciliation logic. The legacy product-create API preserves its positive quantity and DRAFT behavior; no zero-quantity input was exposed to old clients.

```text
lock durable INTAKE operation + session / validate revision
  NEW: validate existing fields → create internal mapped zero DRAFT seed
       → approve selected FileAsset → Phase4 physical OPENING_BALANCE(N)
  STOCK_IN: existing product → Phase4 receipt(N), no second listing
  complete session + durable outcome + audit
COMMIT all together; catalog/socket acknowledgement only after commit
```

For NEW quantity 10, final `totalQuantity=availableQuantity=10`, sold=0, one physical opening movement of 10, and no artificial UNALLOCATED opening. A failed location/stock validation rolls back product, asset association, balances, movements, operation and session completion. Upload/storage/optimization do not hold this transaction open.

Operation scope is `INTAKE:<sessionId>`. Canonical request hashing includes session identity + immutable submitted revision; the stock child key is derived deterministically. Same key/payload returns the committed outcome, while a changed revision/key conflicts. The client flushes `pendingSubmit`, original revision and original key to secure storage **before HTTP**. On an ambiguous reply it queries that key and, if not committed, retries exactly that key/revision—not a new receipt. A transient NOT_COMMITTED observation is not treated as proof that an earlier request cannot still commit. Existing mapped-commerce enforcement is not disabled by switching off intake/management UI.

## Media processing and privacy

Client preprocessing validates the header before a full decode: 12 MiB / 12 million pixels / 8192 edge upper bounds, applies orientation, downsizes longest edge to at most 1600 and JPEG quality 88, removes upload EXIF (including GPS), and retains the untouched app-private capture. The backend still enforces MIME/signature/dimensions/full-decode and upload limits through the existing `UploadsService`; client validation is not a trust boundary.

Original upload keys are deterministic, private `products/intake-<sha256>.<ext>` paths scoped to session/image/content. Upload retries may leave an unassociated private object after a DB outage but **never delete a potentially committed/shared object**. A second payload under the same image identity conflicts. Asset/job metadata, queue, Sharp encoder, hash-based immutable variants and retries reuse Phase 2; no independent optimizer was introduced.

An authorized preview uses the same recipe (current source uses CATALOG WebP, 480px; the first native sample used the earlier 240px thumbnail). Fallback generation from the stored original is bounded and uses the same encoder, not a public original URL. At most two previews process concurrently, with byte and stream-time bounds. Completed processing updates preview without recreating text controllers.

Both original and variant byte endpoints now protect **new intake keys**, including objects written before an asset row commits. They require an approved product link, ACTIVE/available product and an exact current image reference. Explicit publication is separate from intake completion. Cancelled/completed drafts retain their asset references. Existing unrelated legacy-original serving behavior is not silently redesigned.

### Orphan and local retention strategy

No automatic destructive cleanup is enabled. A future approved retention job must first produce an owner-scoped dry-run manifest, apply a documented retention period, exclude pending/ambiguous submissions, active jobs/leases and every completed/published/historical reference (products, auctions and retained audit/history), recheck references under concurrency fencing, then quarantine/review before any storage deletion. It must reconcile object and DB state and use an audited recoverable policy. Never delete by intake prefix or draft age alone. Failed old retakes are not automatically garbage.

Completed/cancelled local journals and capture files currently remain retained; their lifetime storage is **not yet bounded by an archival policy**. Pending list/network/decoded-memory bounds do not solve long-term disk growth. Before broad warehouse rollout, agree a local retention/export/explicit-cleanup UX with employee confirmation and retain unresolved journals indefinitely. No existing local media was deleted to implement a cleanup shortcut.

## Validation evidence

Machine-readable artifacts are in `docs/benchmarks/phase5/`; they are QA evidence, not production authorization. Tests use dedicated local PostgreSQL:55446, Redis:56386, MinIO:59046 and loopback Nest API. The device API uses USB/ADB reverse on 58463; command checks use 58465. Synthetic accounts and products are clearly QA named. Normal login/Argon2/JWT, real HTTP/Prisma/MinIO/BullMQ are used; this is not a mocked end-to-end pipeline. The original applications and shared earlier QA services were not targets of install/uninstall/clear commands.

| Check | Verified result / artifact |
|---|---|
| Nest compile + scoped intake/inventory/media ESLint | Passed; `tests/matrix-backend.json` |
| Backend unit | 172 passed / 23 suites; includes DTO/private-key/actor/feature guards |
| Existing backend real-DB e2e | 27 passed / 7 suites, zero skipped; explicit exact Phase5 DB allow-list opt-in |
| Admin analysis | No issues |
| Admin widgets/unit | 158 passed, including 11 intake cases; `tests/matrix-mobile.json` |
| Customer regression | 166 passed |
| Shared UI | 18 passed, one optional engine-image-review benchmark skipped because REZONA_IMAGE_REVIEW is unset |
| API client/cache | 20 passed |
| Feature-on admin subset | Re-executes inventory/intake tests; not additional unique cases |
| Real intake HTTP/DB/media | 11 check groups passed; `integration.json` |
| Real Phase4 inventory/commerce re-run | 16 check groups passed against Phase5 services; `inventory-commerce-regressions.json` |
| Migration fresh/upgrade | Fresh 32 migrations; 31→32 upgrade; unchanged business fingerprints across 14 tables, `migration.json` |
| Android debug QA APK | Built successfully; separate package; physical acceptance limitations below |
| Native capture + force-stop recovery/replenishment/capture-next/cancel | Both pass on the same verified APK; `device/capture.json`, `device/restore.json` |
| Independent native-stock readback | One product, opening 10 + receipt 5, two physical balances, DRAFT/private source; `device/stock-evidence.json` |
| Normal admin QA preview | Installed/launched `lib/main.dart`, normal dashboard/products/intake UI observed; `device/preview.json` |

Unique passing backend/Flutter cases in the matrix: **561**, plus the 19 feature-enabled subset re-executions (not counted twice) and the separately listed real-service assertions. One optional shared-image engine benchmark remains skipped; this is not described as a zero-skip whole-project run.

Real intake checks prove concurrent duplicate submit → one DRAFT/10 units/one selected physical opening; conflicting revisions/keys; private uncommitted/original/variant/preview access; actual eight-variant worker processing; explicit publication; one existing receipt of 5; transaction rollback when a location is invalidated; retake correlation; retained cancellation media; injected one-time storage failure and same-image upload retry; failed-job reset/reprocessing without duplicate variants; and two independent concurrent receipts (15→19) without a lost update.

The reused real inventory checks cover warehouse validation, historical mapping replay, unallocated allocation, concurrent receipts/transfers/exhaustion, adjustments, explicit location at zero stock, DRAFT/CANCELLED visibility, wallet debit/refund, COD, cancellation to original allocation, shipping consumption/replay, forbidden shipped cancellation, final-unit races, append-only/database checks, Arabic search/pagination, management-off mapped enforcement and deliberate inconsistency detection. They deliberately retain corrupt/review **QA-only** fixtures to prove detection; those are not production discrepancies. Existing e2e re-runs auction deposit/automatic winner-order/payment/address/order transitions. No external bank/card funding provider is implemented or claimed tested.

The migration rehearsal reads a **clean previous QA clone** with `pg_dump`, not production. All restores/migrations target newly created Phase5 names. The 2005 products, 14 orders/items, 43 auctions, wallets and existing inventory rows retained identical count/content fingerprints (only newly additive FileAsset fields excluded). Failed rehearsal scaffolding attempts remain isolated; no source DB reset or write occurred.

### Physical Redmi Pad SE — latest verification and historical incidents

Approved device: serial `2b6f28b2`, model `23073RPBFG`, Redmi Pad SE, Android 15. Separate package `com.singlestore.admin_app.phase5qa`, visible label **ريزونا — إدخال QA**; no original-app replacement. Debug + USB loopback only, **not** Release/Wi-Fi/cellular/staging acceptance.

Historical first capture: log `capture-1795121381757.log`. The rear camera captured a real Rexona product on the employee's table; Arabic fields, existing category, keyboard-driven entry, quantity 10 and explicit first shelf were exercised through the real app/API. Upload completed, the product/stock really committed, and a Dio fault deliberately discarded the successful submit response **after** commit. The encrypted local journal was read back in that process with the same pending identity/key and source file. That earlier run alone did not prove process-restart recovery; the successful paired follow-up below now does.

Native photo evidence: capture 485,521 bytes → uploaded original 234,959 bytes, 1600×900, EXIF absent. Actual uploaded bytes were downloaded through the isolated private storage for local visual inspection and stored outside the repository. Main brand/72h labeling remained recognizable, orientation was upright; this single grainy handheld photo does not establish fine-print/OCR quality or broad representative-packaging acceptance. The 240px thumbnail is not the retained recognition source. `device/photo-metadata.json` records dimensions/hash, not AI recognition accuracy. No private photograph was published or embedded into this report.

**Installation incident and honesty boundary:** the initial capture run passed using Flutter's integration-test installer. On the next update Xiaomi returned `INSTALL_FAILED_USER_RESTRICTED`. Flutter's own cleanup attempted an uninstall and reported `DELETE_FAILED_INTERNAL_ERROR`; subsequent read-only checks found the QA package absent. Therefore the local journal from that installation is no longer available. Its server draft, private media, product and ledger remain. No original customer/admin package was targeted, and no manual `pm clear`, security-setting change or data reset was used.

The runner was corrected: explicit `adb install -r` with package verification only; **no uninstall fallback**. Capture and recovery now share one APK, attach the host driver to its existing VM service, and restart by force-stop/relaunch **without reinstall**. Initial further installs were rejected by Xiaomi; the user subsequently approved the normal installation. The historical failed update is retained in `restore-1795121539888.log`. Current `device/capture.json` and `device/restore.json` are the subsequent successful runs, not a relabeling of that failed attempt.

The historical intermediate `4009dcf25d44...` APK was copied to tablet Downloads for **user-controlled** installation. It is superseded by the successful test artifact **SHA-256 `ba63dbdb0ad18f2207235daec1198d13ae69c3a546e949b0822831142ae7bd56`, 176,610,948 bytes**. `device/build.json` binds its sources and archived file; both native runs verify the installed APK's SHA-256 against it. These test-target APKs are not warehouse/store releases and must not be distributed. The isolated API remains on the PC and requires USB reverse.

**Successful paired follow-up, 2026-11-20:** capture `capture-1795158653005.log` and restore `restore-1795158735899.log` both pass against the same installed artifact above. Capture flushes the pending journal before the real request and intentionally drops its successful reply. Restore force-stops/relaunches the same installation, reads the still-pending encrypted journal **before recovery**, recovers the committed result, verifies the retained source file and exactly 10 available units, then captures another image, selects that existing product, explicitly selects the second shelf and adds 5. It verifies 15 units, Capture Next's new operation identity/empty location, and camera cancellation leaving a draft without an image. It also successfully runs the separate lower-scope legacy create/save baseline. No installation/data reset occurs between the capture and restore stages.

Independent read-only verification in `device/stock-evidence.json` confirms one product `cmwon4sjz005rvt10licz8bwb`, DRAFT, total/available 15, sold 0; exactly two completed intake sessions (NEW 10 and STOCK_IN 5); one physical OPENING_BALANCE of 10 on A-01 and one STOCK_IN of 5 on B-02; no system/unallocated balance or duplicate receipt; private original still returns unauthenticated 404. This is real device/API/DB evidence, not just a fake repository result.

Earlier failed native probes remain in the log directory. Their fixes were **test-driver fixes**, not changes to stock rules: tolerate the brief `pidof` startup race; search a paginated location list; target the result ListTile rather than the identically named search EditableText; wait for hit-testability during route transitions; and use the same checked tap helper on the legacy Save action. An attempted in-place Flutter hot restart failed to launch its root isolate; normal QA update/relaunch succeeded afterward. The passing runs used the actual installed APK, not an unrecorded hot-reload overlay. CameraX emitted configuration/close warnings during immediate initialization/cancellation in earlier probes; final Dart assertions pass, but long repeated-camera stress acceptance is still needed.

The newer native captures are transport/lifecycle probes, not additional representative label-quality evidence. The historical Rexona review above remains the single packaging-quality observation. iOS, physical phone layout, real gallery process-kill recovery and device Release behavior remain unperformed.

**Usable handoff after tests:** the automated test APK was archived outside the repository, then the **same isolated QA package** was updated with ordinary `lib/main.dart` (SHA-256 `437ef0f08da9d921ae3d156bafcc5c8a0f166d500ecd7efd0d0b1b10a21213b7`, 175,166,411 bytes). This normal preview does not execute the automated intake test on startup and excludes the PHASE5_QA email/password compile defines. Existing QA journal/session data was preserved by `install -r`; no uninstall/clear was used. Normal login state, dashboard, products and the rapid-intake pending screen were visually observed through normal Android touch navigation. It was left on **إضافة منتجات سريعة** for the user. `device/preview.json` records this separately from native test results. It still uses only the PC's isolated loopback services and is **not the production admin or a store release**. Earlier Download test APKs are superseded and should not be reopened as ordinary apps.

### Workflow timing and comparison

The latest successful paired debug run records these boundaries (historical earlier timings remain in their raw logs):

| Observation | Measured boundary |
|---|---|
| Camera-ready remaining wait | 906 ms; starts after camera route/shutter exists, not complete route/process startup |
| Shutter → editor/source preview | 1,758 ms; includes scripted settling waits |
| New-product capture + required fields/category/location + dropped reply | 14,474 ms; 11 scripted actions, including searching the location list |
| Existing-product photograph/search + quantity/location + receipt | 12,672 ms |
| Legacy required fields/create/save only | 3,932 ms; five scripted actions; no photograph, upload or physical placement |

New-product actions: New → Capture → Title → Category picker → Category choice → Price → Quantity → Location picker → Location search → Location choice → Submit. Upload/optimization runs independently while fields are entered. The probe includes explicit keyboard dismissal and pointer-ready waits. These are scripted debug/USB measurements, **not employee entry speed, repeated distributions, network benchmarks or a percentage speedup**.

Old workflow inspection shows product creation, external camera/gallery/crop/upload and then separate inventory mapping/location work; it cannot provide the same atomic location receipt as one legacy form submission. The successfully measured 3,932ms baseline intentionally excludes image and physical placement. It is **not comparable** to the 14,474ms complete intake path; neither a speedup nor a slowdown follows from comparing them. **A like-for-like measured old-vs-new employee benchmark remains unresolved. No faster-workflow percentage or employee acceptance claim is made.** Required follow-up: same device/network, randomized order, same representative products/fields/photo/location, at least five samples per path, record all camera/crop/retry/next actions and time full committed end states separately from employee typing.

## Known limitations and release gates

1. Physical **debug core workflow** now passes, including restart recovery and receipt/capture-next/cancel. Release/WAN/employee acceptance and the like-for-like benchmark remain open. Permission-denied, flash/focus, cross-device conflict and account-switch scenarios remain fakes/widgets where stated, not falsely called native tests. The 320×680 and 834×1194 layouts pass; human keyboard/ergonomics acceptance is still needed.
2. Local and remote drafts are not immortal storage: app uninstall/OS data clear or failed device storage can remove local-only work. Uploaded server drafts survive separately. Long-term local/server/orphan-media retention needs an approved policy; no destructive GC was enabled.
3. After Android kills an external gallery picker, the draft survives but the interrupted gallery selection may need to be selected again. Global `retrieveLostData` is not silently attached to whichever draft happens to be current. A future durable per-picker correlation/recovery test is required to improve this safely.
4. Cross-device recovered drafts may display saved category/location/product IDs until reselected because those labels are not all persisted remotely. Public image widgets in older admin galleries cannot display new private DRAFT intake media; review it through the authorized intake preview until publication. A private-image placeholder is preferable to bypassing authorization.
5. Bounded processing is not a leak/performance certificate. High-volume multi-shift camera capture, low-storage failure, slow/offline network restart, process-kill at each journal boundary, stale conflict between two physical devices, metadata/label quality across many packages and large-ledger contention require expanded acceptance. Native camera focus/flash support varies; no unsupported-device guarantee is inferred from plugin presence.
6. QA uses cleartext **USB loopback only** under the dedicated opt-in package. Normal Android defaults to cleartext=false; QA release builds are explicitly refused. Test-target APKs include synthetic QA test defines; the normal preview excludes those credential defines. Neither may be uploaded to stores. Real signed Release/TLS behavior, iOS camera permission/native compilation and an older distributed app against future staging are pending.
7. Current Android toolchain emitted future KGP/built-in-Kotlin and Gradle deprecation warnings. The SDK integration-test plugin's AndroidX dependency resolution required online downloads; an offline retry failed before a subsequent successful build. This is test infrastructure, not justification for arbitrary production dependency upgrades. Existing resolved application versions were preserved when adding camera/SDK test dependencies.
8. **Inherited NO-GO remains**: Redmi raster/search/detail-return performance overruns, real Wi-Fi and cellular-WAN staging measurements, retained high MinIO dependency-chain risk, production/rollback/older-APK validation, physical warehouse reconciliation and employee acceptance. Phase5 does not waive any. No new full-tree vulnerability scan is claimed in this phase; consult the dated Phase3 security report and refresh it before a release.

## Deployment/compatibility and rollback plan — instructions, not execution

1. Obtain separate staging authorization. Snapshot PostgreSQL and storage with a restore rehearsal; record exact candidate source/lock/migration hashes. Check inherited security/rendering gates and deploy TLS/private-bucket policy. Do not reuse USB debug credentials/packages.
2. Keep intake and inventory-management feature exposure disabled initially. Drain/upgrade **all** product/order/shipping/worker writers together as required by Phase4. Old backends cannot safely write a mapped catalog; a mixed writer generation is not an acceptable rollback strategy.
3. Generate Prisma from this schema; apply existing migrations in order through `202611190003_rapid_product_intake` using `migrate deploy`, not db push/reset. This phase requires no backfill of legacy products/orders/media. Review SQL/locks on a realistic staging snapshot, not just clean QA.
4. Deploy the code that enforces intake privacy **before allowing any intake upload**; also deploy the existing Phase2 dispatcher/workers, bucket access policy and configured PUBLIC_BASE_URL consistently. Verify unauthenticated originals, unknown/uncommitted prefixes and immutable variants return 404 before publication. Old byte-serving binaries must not be rolled back while new private intake objects exist.
5. Deploy the new admin with both flags consistent and permissions assigned minimally (`use`, upload, stock receive, create only where needed). Start with a named pilot employee; explicit location selection and DRAFT vs publication training are required. Validate old customer/current customer and an old admin's mapped-quantity conflict on staging.
6. Enable only for pilot staff. Watch draft/save/upload/job failures, queue backlog, revision/idempotency conflicts, storage growth, reconciliation and operator feedback without logging tokens/photos/addresses. Re-run the physical restart and complete workflow benchmark before broad enablement.
7. Stop exposure by disabling intake and admin entry. Do not remove schema, operation rows, stock history or media. Pending journals remain and can resume once the same compatible service is available. If mapped-stock or privacy behavior is involved, retain the compatible backend and invariant/privacy guards, then roll forward. Do not revert to the original unrestricted media controller or an old stock writer.
8. A disaster restore is a coordinated DB+object-store recovery under a maintenance window with operator approval; replayed actions must use recorded keys, reconcile media references, and verify that no order/payment/stock commitment is lost. This has not been rehearsed against production or claimed safe merely because the migration is additive.

## Phase 6 integration contract (documented only)

Future recognition takes a **private captured source image + stable session/image identity + current valid category candidates**. It may return structured suggestions (Arabic name/description, existing category ID, brand/visible attributes, possible duplicate product IDs) into the separate recognized-metadata lane with provider/model/version/confidence/job correlation. It must not change approved fields silently, fabricate categories/barcodes, choose price/quantity/location, publish, debit a wallet or mutate stock. If image ID or revision changes, stale results remain associated with their original draft. An employee reviews/edits and confirms NEW vs existing stock-in; the same Phase5 submit operation and Phase4 stock core perform all mutations. Retain manual editing/offline drafts if recognition fails. No provider, paid API, embeddings/vector store, AI category selection or Phase7 image editor was implemented.

## Reproduction and files

Run only with the dedicated disposable Phase5 containers/ports; harnesses do not accept arbitrary production DB URLs or load deployment dotenv. The opt-in e2e DB guards retain their original allowed targets and add only the exact Phase5 localhost DB when `REZONA_PHASE5_QA=1`.

```powershell
$env:REZONA_PHASE5_QA='1'
node scripts/phase5-test-matrix.cjs backend
node scripts/phase5-test-matrix.cjs mobile
node scripts/phase5-intake-qa.cjs checks
node scripts/phase5-intake-qa.cjs regressions
node scripts/phase5-migration-qa.cjs
# For approved physical testing, run the local serve mode, then use the safe
# phase5-device-validation.cjs runner. Installation needs normal user approval.
# Restore never reinstalls; it force-stops/relaunches the same test-only package.
```

Backend new: `src/product-intake/{product-intake.dto,product-intake.controller,product-intake.service,product-intake.module}.ts`, `src/files/intake-media-visibility.ts`, migration above, unit test, Phase5 QA/device/migration/matrix/visual/evidence scripts and this report/artifacts. Shared edits: `prisma/schema.prisma`, AppModule, configuration/Joi/env examples, permission constants/catalog, ProductsService/InventoryService transactional extraction/search metadata, UploadsService, original/variant media authorization, catalog-media visibility, media unit constructors and narrow real-DB test opt-ins.

Mobile new: `apps/admin_app/lib/features/product_intake/{intake_models,intake_local_store,intake_image_preparer,intake_repository,intake_cubit,intake_camera_page,intake_pages}.dart`, `test/product_intake_test.dart`, native integration target and `test_driver/phase5_driver.dart`. Wiring: existing admin DI/routes/router/destination/sidebar/navigation, console catalog/settings, inventory picker, Android Gradle/manifest, iOS Info.plist, admin pubspec/SDK dev dependencies and workspace lock/registrant. Existing Phase2/3/3.1/4 and display-retirement worktree changes were preserved, not all attributed to Phase5.

**Handoff:** the coordinated intake implementation and automated/real-service checks are available for review. Mandatory physical acceptance and fair UX comparison are not fully satisfied, so this report does **not** declare Phase5 unconditionally complete, production ready, or Phase6 approved. No deploy/push/store submission occurred.
