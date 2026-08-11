# Backend Inventory + Marketplace Report

Date: 2026-07-25

## Scope

Phase C.2 implemented backend support for fixed-price product inventory quantity and the unified marketplace endpoint consumed by the customer app. No Phase D features were added.

## Product Inventory

- `ProductListing` now stores `totalQuantity`, `availableQuantity`, and `soldQuantity`.
- Quantity defaults to `1` on create.
- Creation accepts quantity greater than `1`.
- Quantity `0`, negative, non-integer, and non-numeric values are rejected with stable `INVALID_PRODUCT_QUANTITY`.
- Editing can increase quantity and can decrease quantity only when the new total is not below `soldQuantity`.
- Reducing below sold units is rejected with `PRODUCT_QUANTITY_BELOW_SOLD`.
- Existing products are migrated safely with default/backfilled quantity fields and check constraints.

## Atomic Purchase Behavior

- `POST /api/products/{id}/buy` accepts optional `{ "quantity": n }`.
- Buy quantity defaults to `1`.
- Purchases are handled in a database transaction with guarded inventory decrement.
- Each physical purchased unit creates its own `OrderItem` with its own item identifier/barcode workflow.
- Products remain active while `availableQuantity > 0`.
- Products become sold/out of stock when `availableQuantity = 0`.
- Idempotency includes the buy request body/quantity in the fingerprint.
- Concurrent oversell attempts are rejected.
- Prisma serializable transaction conflict `P2034` is mapped to `INSUFFICIENT_PRODUCT_STOCK` instead of surfacing as a 500.

## Marketplace Endpoint

- Added `GET /api/marketplace`.
- Returns a single backend-paginated feed of products and auctions.
- Default feed includes live/active auctions and active products with stock.
- Default sorting places live auctions first, then products, with stable item metadata.
- Supports item type, category, search, status, pagination, and meta response data.
- Sold-out products are omitted from the default feed.
- REST remains the source of truth; socket payloads are not final business data.

## Category Enforcement

- Product create/update requires an existing active category.
- Auction create/update requires an existing active category.
- Inactive/missing categories return stable category failures.
- Existing admin category endpoints are preserved.

## OpenAPI And Smoke Coverage

- Product create/edit/buy DTOs and response DTOs include quantity fields.
- Marketplace response DTOs document mixed `PRODUCT` and `AUCTION` items.
- `scripts/mobile-phase-c-readiness-smoke.mjs` was updated for quantity and marketplace expectations.
- Added `scripts/inventory-marketplace-smoke.mjs`.

## Validation

- `npm run build`: passed.
- `npm test`: passed, 3 suites / 39 tests.
- `npm run test:e2e`: passed, with the DB-gated suite skipped by env configuration.
- `docker compose down -v`: passed.
- `docker compose up --build -d`: passed.
- `docker compose exec -T api npm run prisma:seed`: passed.
- `node scripts/inventory-marketplace-smoke.mjs`: passed, 15 passed / 0 failed.
- `node scripts/mobile-phase-c-readiness-smoke.mjs`: passed, 23 passed / 0 skipped / 0 failed.
- `node full-api-smoke-test.mjs`: passed, 31 passed / 0 skipped / 0 failed.

## Bugs Found And Fixed

- Concurrent serializable product buy conflicts could surface as an internal error. Fixed by mapping the retry-conflict path to `INSUFFICIENT_PRODUCT_STOCK`.

## Remaining Backend Gaps

None blocking for Phase C.2.

## Backend Decision

Can the backend be considered complete for the requested inventory and marketplace changes? Yes.
