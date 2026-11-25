# REZONA Phase 4 — warehouse inventory foundation

Scope: local development and isolated QA only, 19 November 2026. Production deployment, remote pushes and Phase 5 are not authorized. **Inventory foundation implemented and locally validated; production remains NO-GO.** Existing Phase 3.1 rendering/security/WAN release blockers remain open. Native employee acceptance against an actual staging candidate is still required. This report distinguishes automated evidence from those unperformed release checks.

## Mandatory source audit (before migrations/business changes)

Repository examined: current dirty AboEssa / AboEssaMobile, not HEAD alone. Existing uncommitted Phase 2/3/3.1 and display-retirement changes are preserved.

### Current stock model and mutation map

| Path | Actual behavior | Existing protection |
|---|---|---|
| ProductsService.create | Creates DRAFT ProductListing; total=available=input quantity, sold=0 | Single create; no inventory locations |
| ProductsService.update | Replaces lifetime total; available=total-sold; SOLD↔ACTIVE on exhaustion/replenishment | Read outside write transaction: quantity-edit/purchase race needs coordination |
| ProductsService.claimInventoryAndCreateSale | Decrements available, increments sold at successful confirmed checkout, WALLET or COD; total unchanged | Conditional updateMany and Serializable transaction; checkout/sale/stock rollback together |
| SalesService.createSoldItemInTransaction | Quantity 4 creates **four OrderItems with quantity=1**, individual barcodes | Same purchase transaction; not a second product-stock mutation |
| AdminConsoleService.changeOrder CANCEL | Locks Order; refunds existing wallet amounts; cancels order/items; restores product once using item-row count | Serializable transaction, row lock, repeated target state is a no-op |
| AdminConsoleService.changeOrder SHIP | Marks order/items/shipment; no product quantity change | Same order transaction |
| ShippingService.ship | Legacy shipping path marks items SHIPPED; confirmed checkout is rejected here and must use order actions | Transaction, existing transition checks; not another product sale |
| ShippingService.cancel | Cancels a shipment request and returns its items to customer box | Does **not** cancel the sale or restore stock |
| OrderActionsService | Wallet remainder payment/delivery edits | No product quantity mutation |
| Product publish/cancel | Changes visibility/status only | No quantity change; no hard product deletion route |
| Auctions and auction jobs | Separate Auction entity, no ProductListing stock FK or product quantity mutation | Existing bid/deposit/settlement transactions remain independent |
| Manual sales/live/labels/warehouse | OrderItem/fulfilment domains; no ProductListing quantity write found outside the paths above | Not a new receipt/location source |

Authoritative customer sellable stock is **ProductListing.availableQuantity**. `totalQuantity = availableQuantity + soldQuantity` under valid existing product operations; total is not necessarily physical warehouse stock after sales. Existing product reservations/physical allocations do not exist. Wallet/bid monetary reserves are not product-unit inventory reservations. No supported partial order cancellation/product-return stock-restoration workflow was found; do not invent it.

Current checkout idempotency is controller-backed by PostgreSQL IdempotencyKey, but its stored response is written **after** purchase commit; concurrent same-key failures/crash windows must be tested rather than assumed safe. Existing checkout monetary event keys protect wallet debits, but COD has no wallet debit to provide that guarantee. Phase 4 must not silently broaden payment rules.

### Cancellation investigation

The suspected row-count-vs-quantity bug is **not present in normal current purchases**: four units produce four quantity-one rows. The actual HTTP/PostgreSQL test passed with management disabled before commerce integration, and again with the completed bridge: **20 → purchase 4 → 16 → legitimate cancellation → 20 → repeated cancellation → 20**. COD did not debit the wallet. Mapped wallet purchases also reserved four units, debited 4,000 once, released the original location allocations, and refunded 4,000 exactly once. The existing row-count restoration was therefore preserved, not replaced speculatively. See `benchmarks/phase4/baseline.json` and `integration.json` for product/order IDs and assertions. The baseline file is the post-bridge flag-off rerun; the initial pre-bridge run also passed during the audit. Unsupported imported quantity!=1 pending rows are now flagged by dry-run/backfill for explicit review, not rewritten. Partial cancellation, product returns and partial-refund stock restoration are not supported by the existing order state machine and were not invented.

## Architecture decision

1. Keep legacy product fields authoritative for customer availability. No customer catalog warehouse joins and no new tenant IDs.
2. Add opt-in per-product mapping (`inventoryMappedAt`). Mapping/backfill holds the same product-row lock used by subsequent commerce writes, so a transaction cannot switch authorities midway.
3. Physical on-hand includes confirmed units still awaiting shipment; reserve units at checkout, subtract physical on-hand and reservation together at shipment, and release the exact reservation at legitimate pre-shipment cancellation. Thus `sum(onHand-reserved)=legacy available`. This preserves existing debit-at-checkout customer semantics while representing physical stock honestly.
4. Record per-order-item/location allocations when stock is reserved. Cancellations reverse those recorded allocations, not a newly invented location. Existing pending legacy orders are explicitly allocated to UNALLOCATED_LEGACY during controlled backfill; opening balance is available + pending reserved, stamped at migration time, not fabricated historical receipts.
5. Use a coordinated transaction helper for mapped product writes. Unmapped legacy products remain compatible. Management flags default off, but **turning management off never disables enforcement for already-mapped stock**. Mapped quantity replacements must use audited inventory operations.
6. Lock product first for stock writes; deterministic product/location ordering for multi-row operations. New stock operations use durable, non-expiring operation keys, canonical request hashes and bounded retries only for rolled-back serialization/deadlock conflicts. No external service inside stock transactions.
7. All new receipts require an explicitly selected active physical location, including zero-stock replenishment. UNALLOCATED_LEGACY is system-managed and cannot receive employee receipts. Preserve the audited existing visibility rule: replenished SOLD becomes ACTIVE; counted-out ACTIVE becomes SOLD. DRAFT/CANCELLED stay unpublished. Both directions and the disabled/draft exceptions have actual integration assertions.
8. Additive tables/fields/indexes, immutable movement ledger, no movement-edit API, reconciliation read-only. One narrow related constraint relaxation permits zero lifetime total; see the migration exception below. No unrelated drift is synchronized. Migration/backfill execution targets a new disposable PostgreSQL instance, not production or the shared device fixture database.

## Implemented schema and invariants

`prisma/schema.prisma` now defines:

| Entity | Purpose / enforced relationship |
|---|---|
| Warehouse | Existing CUID convention; unique normalized code, name, description, active/system flags |
| WarehouseLocation | Warehouse FK, optional same-warehouse parent, flat locations supported, code unique within warehouse, type/sort order, active/system flags |
| InventoryBalance | One row per product/location; integer on-hand and reserved; `0 <= reserved <= onHand` |
| InventoryOperation | Durable `(scope,key)` uniqueness, canonical request hash, operation kind, actor, bounded reason/reference/notes, committed outcome |
| InventoryMovement | Append-only location deltas, before/after arithmetic, reservation deltas, operation/reference, historical warehouse/location code snapshots |
| InventoryAllocation | Exact order-item/location quantity and RESERVED/SHIPPED/REVERSED state |
| ProductListing.inventoryMappedAt | Nullable per-product cutover marker; existing stock fields/IDs retained |

Movement types implemented: OPENING_BALANCE, STOCK_IN, RESERVATION, SALE, SALE_REVERSAL, TRANSFER_IN/OUT and ADJUSTMENT_IN/OUT. RETURN is deliberately absent because there is no supported return workflow. A SALE at shipping consumes physical units already sold at checkout; it is not a second customer charge. SALE_REVERSAL releases a pre-shipment reservation and restores legacy availability in the same order transaction.

Foreign keys restrict deletion of referenced warehouse history. There is **no delete warehouse/location/movement API**. Empty entities may be deactivated; nonempty warehouses/locations cannot. New receipts cannot target inactive or system locations. Parent cycles/cross-warehouse parents and location relocation to another warehouse are rejected. Codes are trimmed/uppercased; the database also enforces their normalized ASCII shape.

Deferred commit checks enforce mapped availability versus balances, legacy total arithmetic, reserved totals versus active allocations (globally and per location), and allocation product versus its OrderItem. Movement arithmetic and nonnegative balances have database CHECKs. UPDATE/DELETE of ledger rows is rejected by an append-only trigger. Service-level reconciliation additionally checks **each location's ledger totals**, so offsetting location errors cannot hide behind a correct product-wide sum. Privileged database administrators can still corrupt append-only history by inserting false records; ordinary CRUD cannot. Reconciliation detects such a deliberately inserted QA record and blocks subsequent stock management writes; it does not silently repair it.

Customer catalog queries still use the existing indexed product availability fields, not warehouse/ledger joins. Historical movement pages are separate, paginated reads.

## Transactions, idempotency and concurrency

- Stock-in, transfer, adjustment and backfill use Serializable PostgreSQL transactions and a product row lock. Management mutations retain bounded retries for aborted serialization/deadlock errors only (including raw-lock SQLSTATE 40001/40P01 surfaced by Prisma as P2010).
- A transaction-scoped advisory lock serializes an operation key; a durable unique operation row, stock changes, ledger, allocations and stored result commit together. Matching retries return the stored result; changed payloads return 409. These operation keys have **no TTL cleanup**.
- Operation scope is `ADMIN:<actorId>` across stock mutation kinds. Reusing a key for another kind/product/body conflicts. Transfer pairs share one operation/reference, reserve-safe source checks and one commit. Two employees cannot overspend the same source. Product/location acquisition order is deterministic; serialization/deadlock aborts are safe failures rather than partial commits.
- WALLET and COD purchases now also have an in-transaction durable attempt keyed by customer. This closes the existing controller-cache-after-commit gap, particularly for COD. Concurrent same-key HTTP requests return one order; eviction of the controller response and retry also recovered the same COD order without consuming another unit.
- Existing controller response caching remains for compatibility. Crash-window recovery reconstructs the committed receipt from current order/shipment rows plus stored original unit price/quantity; **byte-identical historical HTTP snapshots after later order changes are not promised**. Financial/stock exactly-once behavior is tested. Post-commit notification delivery is not an exactly-once message outbox and can still fail independently.
- Purchase attempt identity now includes payment and delivery. Older pre-upgrade stored response hashes can reject a retried old key with 409; never silently reuse it as a new charge. Clients must check their existing order before creating a genuinely new purchase. Stock operation keys are not interchangeable between employees.
- Existing order transitions remain unchanged. An aborted concurrent order action now returns a sanitized `ORDER_CONFLICT_RETRY` 409; retry the same transition. Repeated completed cancellation/shipment is a no-op. All product locks precede wallet refunds to avoid a product/wallet lock inversion.
- Mapped products reject replacement quantity edits with `USE_INVENTORY_OPERATION`; metadata edits and unchanged quantities remain accepted. Unmapped legacy editing behavior remains, now under the shared product lock.
- Inventory detail/reconciliation snapshots use RepeatableRead so concurrent commits do not produce a mixed-time false mismatch. Reconciliation is explicit/admin-only, not run on customer cards.

PostgreSQL locking reference: [PostgreSQL 16 explicit locking](https://www.postgresql.org/docs/16/explicit-locking.html). The implementation uses the inspected local Prisma 6.19.3 client, not newer Prisma 8 examples. No new dependency was added for Phase 4.

## Backend APIs and permissions

All routes below are under `/api/admin`, require an admin JWT, the listed permission and the backend management flag. Customer/no-token/insufficient-permission requests were rejected through the real guards.

| Routes | Permission |
|---|---|
| GET warehouses[/id], warehouse-locations[/id] | inventory.read |
| POST/PATCH warehouses, warehouse-locations | warehouse.manage |
| GET inventory/products; products/:id/inventory; products/:id/inventory/movements | inventory.read |
| POST products/:id/inventory/stock-in | inventory.receive |
| POST products/:id/inventory/adjust | inventory.adjust |
| POST inventory/transfers | inventory.transfer |
| GET inventory/reconciliation | inventory.reconcile |
| POST inventory/backfill | inventory.migrate |

Mutations require `Idempotency-Key` (1–160 characters). Receipt/transfer quantities are integers 1–1,000,000; adjustment deltas are nonzero integers within ±1,000,000 with a nonblank reason. Inputs, IDs, status, location selection and transferable balances are rechecked server-side. Integer overflow is rejected. Product/location/history lists paginate; default 20, maximum 100. Backfill is capped at 50 products per request and has an explicit ID cursor. Audit responses never go through public customer endpoints.

Adjustment/migration permissions are marked dangerous in the existing bilingual permission catalog. Owner access follows the existing owner resolver; staff receive no implicit new rights. Warehouse edits create the existing AuditLog records. Stock changes carry structured ledger operations with actor/reason/reference and safe post-commit acknowledgement logs, without tokens, passwords, delivery bodies or raw idempotency keys in logs.

Stock application services are reusable through the exported `InventoryService`: `productInventory`, `locations`, `stockIn`, `transfer`, `adjust`, `movements`, `backfill`. A future trusted intake workflow must call the same service with its authenticated actor/permission checks, not duplicate stock writes or expose these methods publicly. No AI integration was started.

## Flutter administration implementation

New code is in `apps/admin_app/lib/features/inventory/` in AboEssaMobile, registered through existing GetIt and the protected admin router. The existing five primary navigation tabs remain; an opt-in “المخزون والمواقع” entry appears in settings/tablet sidebar and the destination registry.

Implemented connected pages:

1. Warehouse list, add/edit and safe active-state changes; location counts and view locations.
2. Location list/search, add/edit, safe deactivation and view products at a location.
3. Debounced server-side product search with pagination and optimized thumbnails.
4. Product stock summary, location balances, read-only reconciliation state, controlled opening-balance preview/backfill and movement history.
5. Add stock form with quantity delta, explicit searchable active physical location, optional reference and server-confirmed refresh.
6. Transfer form with available source balances, explicit distinct destination and quantity.
7. Reason-required adjustment and paginated movement history with type filter, date, product, original location code, actor and reason/reference.

The UI uses the current admin shell/design tokens (10px panels), Cubit, ApiClient/Dio, normal Arabic RTL/localization delegates and LTR codes/numeric fields. There is no client-side full-catalog download and no silent reuse of another product's location. Existing product SKU/barcode fields **do not exist**; search supports name/ID and Arabic normalization. OrderItem fulfillment barcodes were not falsely presented as product SKUs.

Invalid submission is disabled; an in-flight submit disables repeat taps. An unchanged network retry retains its operation key while that form remains open. Changed input creates a new key. **A pending form/key is not persisted across app termination/navigation**: after an ambiguous failure, employees must inspect history before starting a fresh operation. This is a remaining operational limitation, not server-side key expiry.

Image requests opt into the existing media-manifest infrastructure; product list/detail payloads feed the existing AppCatalogImages registry and bounded thumbnail component. Draft/inactive inventory imagery can use optimized admin manifests without exposing private customer images. Stock acknowledgement invalidates affected product/marketplace reads, not image bytes or all image disk caches. No Phase 3 image lifecycle code was replaced.

Automated UI checks cover 320px phone and 834px tablet layouts, Arabic RTL/LTR codes, search, connected detail, zero-stock selection, in-flight submit prevention, stable retry keys, transfer fields and history pagination. The debug Android APK compiled with the flag on. **No Phase 4 APK was installed on the shared device and no interactive authenticated native/staging employee acceptance was claimed.**

## Migrations and historical stock rehearsal

New migrations:

- `202611190001_warehouse_inventory`: additive types, tables, relations, indexes and commit/append-only constraints.
- `202611190002_inventory_zero_and_allocation_checks`: strengthens allocation consistency and replaces only `totalQuantity >= 1` with `totalQuantity >= 0`. **This is a deliberate inventory-related constraint relaxation, not a purely additive constraint change.** Counting the final unsold unit out must be representable. Existing product creation still requires positive quantity. No rows are changed by the relaxation; no tables/stock/history columns are removed.

Existing unrelated drift (three legacy indexes and a LiveSession.source default) was not synchronized/dropped. Original migration history remains intact. No reset or db push was used. Prisma generation used a same-version copied engine basename to avoid the DLL held by the existing Phase 3 server; the shared server was not stopped just to unlock it.

Dedicated Phase 4 services bind only to loopback: PostgreSQL 55444, Redis 56384 and MinIO 59044. API assertions bind 58453 and close afterward. The protected Phase 2/3 device fixture database on 55442 was **only read through consistent pg_dump** for the upgrade rehearsal. All restores and writes occurred in newly named Phase 4 databases.

Evidence: `benchmarks/phase4/migrations.json`:

| Check | Verified result |
|---|---|
| Empty database | All 31 migrations applied |
| Existing Phase 3 clone | 29 → 31 migrations applied |
| Products inspected/mapped | 2,005 |
| Opening balances/movements | 2,005 / 2,005 |
| Pending item allocations | 12 |
| Review-required rows in that snapshot | 0 |
| Reconciliation | 2,005 UNALLOCATED, zero MISMATCH/INVALID_QUANTITY |
| Backfill rerun/restart | No duplicate balances, movements or allocations |
| Order, item, auction, wallet and wallet-entry fingerprints | Unchanged |
| Legacy product business-field fingerprints | Unchanged; inventoryMappedAt and product updatedAt intentionally excluded |

The first strict fingerprint attempt correctly noticed `updatedAt` changed when mapping a product; it was not a stock/order mutation. The comparison was narrowed explicitly to exclude only the mapping marker and product updatedAt, then a new clone rehearsal passed. Order/item/auction/wallet timestamps were **not** excluded.

Opening movements use migration-time timestamps, available + still-pending physical units, and the system-managed **UNALLOCATED_LEGACY** location. This is an accounting transition bucket, **not a real shelf or historical receipt**. No physical locations were guessed. Shipped/cancelled units are not resurrected. Employees later transfer counted available stock to actual shelves. Existing reserved allocations remain tied to their recorded location; reserved stock cannot be transferred with the ordinary transfer command.

Dry-run is read-only, reports pending quantity/proposed opening on-hand and flags unsupported history. Commits are per-product atomic and cursor-resumable. A mixed QA batch containing a deliberately malformed quantity-two historical item returned reviewRequired for that product, committed the valid product, then reran without duplicates or rewriting the bad history. Cursor progress and review rows must be saved by an operator; there is no automatic nightly catalog-wide migration job.

## Automated and real-database evidence

Primary machine-readable artifacts under `docs/benchmarks/phase4/`:

- `baseline.json`: legacy multi-unit cancel/replay with management off.
- `integration.json`: actual HTTP/Nest guards, PostgreSQL locks/constraints and service transactions, not mocked stock persistence.
- `migrations.json`: fresh and cloned-upgrade migration/backfill/reconciliation results.
- `tests/matrix.json` and individual `.log` files: command exit codes and suite summaries.
- `evidence-manifest.json`: SHA-256 source/evidence and local debug APK identity; not an upload/signing authorization.

| Suite | Result |
|---|---|
| Nest build | Passed |
| New inventory module + touched catalog-media interceptor ESLint | Passed; not a claim that unrelated legacy files are lint-clean |
| Backend unit | 162 passed, 22 suites |
| Backend e2e | 27 passed, 7 suites, **zero skipped** with explicit isolated DB flags |
| Flutter admin analyze | No issues |
| Flutter admin | 147 passed (139 existing + 8 inventory) |
| Inventory widgets with feature flag on | Same 8 passed separately, not eight additional unique tests |
| Flutter customer | 166 passed |
| Shared UI | 18 passed, 1 optional engine-decode benchmark skipped (REZONA_IMAGE_REVIEW unset) |
| API client | 20 passed |
| Android admin debug build | Passed; local emulator-loopback API defines, not a Play/staging release |

The existing real admin-flow suite now permits an additional exact Phase 4 localhost database **only when REZONA_PHASE4_QA=1**; its original target guard is retained. The account-deletion suite has the same narrow opt-in. Neither falls back to production or the shared fixture URL. Early e2e commands skipped those 14 opt-in cases; the subsequent fully enabled run executed all 27. Do not confuse the early skipped run with final evidence.

Real integration assertions include normalized duplicate warehouse/location codes; inactive/invalid/system location rejection; ten + five units; concurrent receipts; operation replay/conflict; paired transfer/replay and source exhaustion; reasoned positive/negative adjustments; zero-stock location selection; SOLD visibility restoration and DRAFT/CANCELLED preservation; wallet debit/refund exactly once; COD no deposit for direct products; original-allocation cancellation; shipment consumption; forbidden post-shipment cancellation; concurrent final-unit and same-key purchases; controller-cache-loss recovery; insufficient-wallet rollback; database invalid-write/append-only rejection; unauthenticated/customer/staff rejection; Arabic search and pagination; management-off enforcement; failed transfer transaction residue checks; deliberately inconsistent ledger detection; and partial/resumed backfill.

Existing e2e also re-executed the separate auction 10% deposit/automatic COD winner confirmation, missing-address handling, remaining-90% wallet payment, blocked-account existing commitment, shipping/order transitions and cancellation refund rules. Auctions have no product-stock FK and were not artificially connected to warehouse units.

Reproduce only in the dedicated QA environment, from AboEssa:

```powershell
$env:REZONA_PHASE4_QA='1'
node scripts/phase4-test-matrix.cjs
node scripts/phase4-inventory-qa.cjs baseline
node scripts/phase4-inventory-qa.cjs integration
node scripts/phase4-migration-qa.cjs
```

The migration rehearsal creates new Phase 4 databases each run and intentionally retains them for inspection. Never point these scripts at a production URL. Full integration intentionally leaves clearly named corrupt/review QA fixtures to prove detection; those are not production discrepancies.

## Compatibility, limits and unperformed checks

Verified: old-style public product responses, current customer regression suite, unmapped legacy checkout, mapped checkout, existing orders/payments/auctions and disabled-management mapped enforcement. The new inventory APIs are internal admin additions. No customer schema authority switch was made.

Important remaining risks/limits:

1. **No production/staging deployment or physical stock count was performed.** Rehearsal data is a test fixture clone, not a production snapshot. Unknown real historical rows may require manual review; zero mismatches in QA is not proof about production.
2. Do not run an old backend writer beside a mapped catalog. Old binaries cannot maintain the ledger; database invariants fail closed, but availability errors are still unacceptable operationally. Drain/upgrade **every** stock/order/shipping writer before mapping. The new durable purchase attempt also requires one consistent backend generation across a checkout rollout.
3. Old admin quantity replacement on a mapped product returns an explicit conflict. Deploy/train the new admin stock workflow before enabling it for staff. Existing customer clients can still buy without knowing a location, but an actual older APK against the future staging candidate remains an acceptance check, not a freshly measured fact.
4. Reservation allocation is deterministic (physical active locations first, legacy last), not FIFO/FEFO, picking optimization or warehouse logistics. Unallocated stock remains explicitly transitional, not proof of physical placement. No reserved-unit relocation, partial cancellations, returns, supplier receiving/accounting, scanner hardware or AI was added.
5. UI pending keys survive unchanged retries only within the form session. If an employee loses the form after a timeout, inspect ledger/reconciliation before issuing a fresh key. A persistent pending-operation UX and native employee acceptance are recommended before broad warehouse rollout.
6. Admin product/history pagination is bounded offset pagination; customer Phase 3 cursors are unchanged. Explicit reconciliation performs per-product balance/allocation/ledger queries and is capped by page size, not meant for every catalog request. Large-ledger/high-contention capacity testing and query plans on a realistic staging dataset remain unperformed.
7. Append-only financial/inventory records and durable outcomes grow indefinitely until an audited retention/archive policy is designed. Do not delete idempotency rows blindly. Corrections need compensating operations, not history edits. A suspected mismatch intentionally blocks replenishment rather than auto-repairing it.
8. The Android build emitted the existing future built-in-Kotlin/KGP plugin migration warnings. It passed with the current toolchain; future Flutter compatibility is not guaranteed by that result. No unrelated plugin upgrades were attempted.
9. **Inherited Phase 3/3.1 NO-GO remains:** rendering tails above the observed 16.67ms budget (retained scrolling raster P95 ~28.164ms; search build ~43.048ms; return raster ~54.48ms), actual Wi-Fi/mobile WAN staging coverage still incomplete, retained MinIO dependency-chain high advisories require compatible remediation or explicit security-owner acceptance. See `rezona-phase-3-production-readiness.md` and `rezona-phase-3-1-performance-optimization.md`. Phase 4 did not revisit/waive those gates or run Phase 3.2 rendering experiments.

## Staging checklist and controlled migration sequence — NOT EXECUTED

1. Obtain staging-only approval, named inventory/security owners, an actual snapshot, restore rehearsal, capacity window and recorded compatibility matrix. Resolve/retain explicitly all inherited release gates; do not call an inventory green result an application release approval.
2. Review the exact dirty candidate diff, dependencies and two migrations; keep original media/catalog indexes. Set backend `INVENTORY_MANAGEMENT_ENABLED=false` and omit/false the equivalent Flutter dart-define by default. Management-off still requires migrations before deploying the new backend because purchase idempotency uses the new operation table.
3. Back up PostgreSQL and transaction/ledger evidence; verify restore/checksums. Set appropriate session lock/statement timeouts for the staging migration window. Additive ALTER TABLE operations still acquire locks; no production timing is inferred from the empty QA database.
4. Apply the two migrations with Prisma migrate deploy to staging. Do not reset, db push, regenerate/drop legacy indexes, or run a blind drift cleanup. Compare migration status, row counts, quantities and existing order/payment fingerprints.
5. Drain old mutation processes/jobs and deploy the bridge-capable backend to all writers before mapping any product. Leave all unreviewed products unmapped. Verify legacy customer/catalog/payment behavior first.
6. Enable management only for a tightly scoped admin pilot. Grant read/receive/transfer/adjust/reconcile/migrate separately. Run dry-run per product/batch, record pre-snapshots and review-required rows; only then commit bounded batches. Save nextAfterId, outcomes and post-snapshots. Do not treat a partially successful batch as all-success.
7. Reconcile legacy availability, on-hand/reserved, allocations and per-location ledger totals. Expected UNALLOCATED is transitional; MISMATCH/INVALID_QUANTITY is a stop condition. Perform real physical counts and explicit transfers; never silently choose an old shelf for zero stock.
8. Exercise current and older customer APKs plus native Arabic phone/tablet admin: purchase WALLET/COD, final unit, concurrent staff receipts/transfers, auction win/settlement, cancellation/refund, shipment, app kill/ambiguous retry, image manifests/cache and stale catalog refresh. Confirm staff cannot bypass permissions and stock remains consistent with management off.
9. Approve any broader rollout only after employee acceptance, capacity/backup/recovery checks and all separate application security/rendering/WAN gates are satisfied. Production deployment needs a new explicit authorization.

For a local admin build, the UI entry is enabled with `--dart-define=INVENTORY_MANAGEMENT_ENABLED=true`. API_BASE_URL/SOCKET_URL must point to the approved isolated QA server, never accidentally the production endpoint. The compiled debug artifact used emulator loopback `http://10.0.2.2:58453`; it is not a production package or a claim that an API server remains running.

## Rollback and recovery

- **Before any mapping:** turn management off, stop new admin mutations, retain additive schema, and verify existing stock/order behavior. An app-only rollback is possible only after reviewing purchase-operation compatibility; do not automatically down-migrate/drop history.
- **After mapping:** turning the management flag off hides management endpoints but keeps reserve/ship/reverse hooks and database checks active. Keep the bridge-capable runtime deployed. Rolling back to the pre-Phase-4 backend is **not safe** just because the UI flag is off.
- On mismatch, pause affected stock-changing operations, retain all snapshots/operation keys, reconcile the exact product/location and review source orders. Use a reviewed compensating operation after root cause analysis; there is intentionally no automatic SQL overwrite or movement-edit screen.
- A transaction abort rolls back quantities, allocations, operation record and movements together. Reuse the same key after a connection loss. Do not repeat a successful receipt with a new key merely because its HTTP response was lost.
- Prefer rolling forward with a bridge-compatible hotfix. A database restore must coordinate checkout, wallets, orders and inventory to a consistent point with a maintenance window and reconciliation of later payments. Restoring only warehouse tables or nulling inventoryMappedAt would strand real orders and is prohibited as an ad-hoc rollback.
- Never drop original media, existing product IDs, order rows, historical migrations or inventory evidence as a feature rollback.

## Phase 4 source changes

Backend new files: `src/inventory/{inventory.module,inventory.controller,inventory.dto,inventory.service,inventory-ledger}.ts`; the two migrations above; `tests/unit/inventory-ledger.spec.ts`; five `scripts/phase4-*.cjs`; this report and generated Phase 4 evidence.

Backend integration/config changes: `prisma/schema.prisma`, `.env.example`, `production.env.example`, `src/app.module.ts`, `src/config/{configuration,env.validation}.ts`, `src/common/constants/permissions.constants.ts`, `src/permissions/permissions.catalog.ts`, `src/products/{products.service,products.controller}.ts`, `src/admin-console/admin-console.service.ts`, `src/shipping/shipping.service.ts`, `src/catalog/catalog-media.interceptor.ts`, `tests/unit/mobile-phase-c-readiness.spec.ts`, and the two narrowly gated real-DB e2e files. Existing dirty Phase 2/3/3.1/display-retirement changes outside this task were preserved, not represented as new Phase 4 work.

Mobile new files: `apps/admin_app/lib/features/inventory/{inventory_repository,inventory_cubit,inventory_pages}.dart` and `apps/admin_app/test/inventory_test.dart`. Wiring: existing `admin_di.dart`, `admin_routes.dart`, `admin_router.dart`, `admin_destination_registry.dart`, `admin_navigation_scaffold.dart` and console settings page. No Phase 4 customer checkout redesign or new mobile dependency.

## Readiness recommendation

The warehouse foundation, coordinated stock bridge, controlled historical mapping and admin UI are implemented and pass the local automated checks listed above. No known unfinished product stock writer remains outside the mapped bridge in the audited current source; auctions remain deliberately independent. **Local engineering validation is not production authorization.** Native employee/staging acceptance, realistic capacity/older-APK checks, physical allocation and inherited application release gates remain outstanding. The reusable inventory service is available for future intake design, but **Phase 5 was not started and should not be treated as automatically approved**. No production deployment, remote push or real-customer modification occurred.
