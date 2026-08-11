# Backend Mobile Phase C Readiness Report

## 1. Summary

Backend Mobile Phase C Readiness is complete for the single-store backend. The existing backend was not rewritten and existing endpoints were preserved. Products, auctions, notifications, realtime, permissions, uploads, server time, idempotency docs, tests, smoke coverage, and OpenAPI were hardened for the next mobile phase.

## 2. Files Created/Updated

Created:

- `docs/REALTIME_SOCKET_CONTRACT.md`
- `scripts/mobile-phase-c-readiness-smoke.mjs`
- `src/common/guards/optional-jwt-access.guard.ts`
- `src/common/swagger/response-envelope.schema.ts`
- `src/permissions/**`
- `src/time/**`
- `src/uploads/**`
- `src/products/dto/product-response.dto.ts`
- `src/auctions/dto/auction-response.dto.ts`
- `src/notifications/dto/notification-response.dto.ts`
- `tests/unit/mobile-phase-c-readiness.spec.ts`

Updated:

- `Dockerfile`
- `openapi.json`
- `openapi.jsoncurl`
- `prisma/seed.ts`
- `src/app.module.ts`
- `src/main.ts`
- `src/products/**`
- `src/auctions/**`
- `src/notifications/**`
- `src/sockets/**`
- `src/common/constants/permissions.constants.ts`
- `src/common/filters/http-exception.filter.ts`
- `src/common/idempotency/idempotency.service.ts`
- `src/sales/sales.controller.ts`
- `src/warehouse/warehouse.controller.ts`

## 3. OpenAPI Audit Result

Audited live `GET /api/docs-json`. Existing product, auction, notification, auth, socket-adjacent, and idempotent REST endpoints were present. Gaps before coding were:

- No `GET /api/admin/permissions/catalog`.
- No `GET /api/time`.
- Product and auction responses exposed raw-ish Prisma shapes and weak Swagger response schemas.
- Auction public details did not include authenticated customer bid state.
- Notification rows exposed `readAt` instead of a mobile-stable `isRead`.
- No image upload endpoint despite existing upload config and `FileAsset` model.
- Socket contract was not documented.
- Idempotency conflict code was `IDEMPOTENCY_KEY_CONFLICT`, not the requested `IDEMPOTENCY_CONFLICT`.

OpenAPI was refreshed and now includes the new paths plus required `Idempotency-Key` headers for quick sale, warehouse print label, product buy, and auction bid.

## 4. Permissions Catalog Status

Implemented `GET /api/admin/permissions/catalog`, admin-token only. The catalog includes grouped Arabic/English labels, descriptions, dangerous flags, new granular product/auction/notification permissions, and existing groups: dashboard, customers, sales, labels, warehouse, shipping, screens, categories, settings, staff, reports, influencers, ads, commissions.

## 5. Server Time Status

Implemented `GET /api/time`:

```json
{ "success": true, "data": { "serverTime": "2026-07-13T12:00:00.000Z" } }
```

Auction list and detail responses also include `serverTime`.

## 6. Product Response Contract Status

Public and admin product responses now include stable fields:

- `id`, `title`, `description`, `categoryId`, `categoryName`, `imageUrls`
- `price` as a fixed decimal string
- `status`, `isAvailable`, `soldAt`, `createdAt`, `updatedAt`
- Admin-only sale context: `saleSource`, `buyerCustomerId`, `buyerCustomer`, `orderItemId`, `labelStatus`

Product buy returns stable purchase fields including `productId`, `orderItemId`, `orderId`, `customerId`, `price`, `labelStatus`, `purchasedAt`, `status`, `message`, plus backward-compatible `product`, `sale`, `item`, and `orderItem`.

Already sold errors return HTTP 409 with `PRODUCT_ALREADY_SOLD`.

## 7. Auction Response Contract Status

Auction list/detail responses now include:

- `serverTime`
- `startingPrice`, `currentPrice`, `minIncrement`, `minimumNextBid` as fixed decimal strings
- `isLive`, `isEnded`, `totalBids`
- details fields: extension settings/count, `canBid`, `bidDisabledReason`
- authenticated customer fields: `myHighestBid`, `isWinning`, `isOutbid`

Bid result now includes `auctionId`, `bidId`, `amount`, `currentPrice`, `minimumNextBid`, `endsAt`, `serverTime`, `isWinning`, `createdAt`, `auction`, and `bid`.

Stable bid errors implemented:

- `AUCTION_NOT_STARTED`
- `AUCTION_ENDED`
- `AUCTION_CANCELLED`
- `BID_TOO_LOW`
- `CUSTOMER_NOT_ALLOWED_TO_BID`
- `IDEMPOTENCY_CONFLICT`

## 8. Notification Contract Status

Notification list returns stable mobile fields:

- `id`, `title`, `body`, `type`, `isRead`, `createdAt`
- optional `linkType`, `linkTargetId`
- `metadata`

Mark read returns unit-like success: `{ id, read: true }`.

Notification settings keep the actual backend names:

- `auctionOutbid`
- `auctionEndingSoon`
- `auctionWon`
- `orderUpdates`
- `ads`
- `system`

## 9. Realtime Socket Contract Status

Created `docs/REALTIME_SOCKET_CONTRACT.md`. Actual socket behavior is documented:

- Default Socket.IO namespace/path.
- Token via `auth.token` or `Authorization: Bearer`.
- Admin room `admins`.
- Customer rooms `customers` and `customer:{customerId}`.
- Screen room `screens`.
- Event payload examples and REST refresh endpoints.

Emissions now cover:

- product sold: `product_sold`
- bid placed / auction updated: `auction_updated`
- auction closed: `auction_closed`
- notification created: `notification`

Existing sale, label, screen/session events are documented.

## 10. Upload/Image Support Status

Implemented `POST /api/admin/uploads/images`.

Features:

- Admin only.
- Requires `products.upload_images` permission, with OWNER bypass preserved.
- Multipart `file`.
- Optional `folder`: `products`, `auctions`, `ads`, `customers`, `labels`.
- Validates MIME and image signature for `jpg/jpeg`, `png`, `webp`.
- Enforces configured max size.
- Stores to configured local upload directory and records `FileAsset`.
- Serves local uploads from `/uploads/...`.

Dockerfile now creates/chowns `/app/uploads` before running as `node`, so clean Docker uploads work.

## 11. Idempotency Docs/Enforcement Status

Swagger documents required `Idempotency-Key` with examples for:

- `POST /api/admin/sales/quick`
- `POST /api/admin/warehouse/items/{id}/print-label`
- `POST /api/products/{id}/buy`
- `POST /api/auctions/{id}/bids`

Conflict code is now stable: `IDEMPOTENCY_CONFLICT`.

## 12. Query/Pagination Status

Existing paginated shape is preserved:

```json
{
  "items": [],
  "meta": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 }
}
```

Products support `page`, `limit`, `search`, `categoryId`, `status`, `sortBy`, `sortOrder`.

Auctions support `page`, `limit`, `search`, `categoryId`, `status`, `sortBy`, `sortOrder`.

Notifications support `page`, `limit`, `unreadOnly`, `type`, `sortBy`, `sortOrder`.

## 13. Tests Added/Updated

Added `tests/unit/mobile-phase-c-readiness.spec.ts`.

Coverage includes:

- permissions catalog groups/keys
- time controller server time
- idempotency key required/conflict
- product response mapping, buy success, already sold
- auction list fields, bid success, low bid, ended auction, close-now delegation
- notification list/read shape
- upload validation and persistence
- sockets customer/private room emissions

## 14. Smoke Script Result

`node scripts/mobile-phase-c-readiness-smoke.mjs` passed on clean Docker DB:

- Passed: 21
- Skipped: 0
- Failed: 0

## 15. Docker Clean DB Validation Result

Executed:

- `docker compose down -v`
- `docker compose up --build -d`
- `docker compose exec -T api npm run prisma:seed`
- `curl http://localhost:3000/health`

Result: passed. API, PostgreSQL, Redis, and MinIO containers healthy. Seed completed.

## 16. Existing Full Smoke Test Result

`node full-api-smoke-test.mjs` passed:

- Passed: 31
- Skipped/optional failed: 0
- Failed: 0

## 17. Backend Issues/Gaps Remaining

No critical blocker remains for Mobile Phase C products, auctions, notifications, realtime foundation, permissions catalog, server time, or image upload.

Non-critical notes:

- Uploads use configured local storage and Docker volume, not MinIO/S3 SDK integration.
- Socket updates are authenticated; unauthenticated public marketplace users should use REST polling/refresh.
- Socket payloads are refresh hints, not a substitute for REST source-of-truth state.

## 18. What Mobile Phase C Can Now Rely On

- Stable product list/detail/buy contracts.
- Stable auction list/detail/bid contracts with backend `serverTime`.
- Backend-calculated `minimumNextBid`, `isLive`, `isEnded`, and authenticated bid state.
- Stable notification list/read/settings contracts.
- Permission catalog from backend.
- Required idempotency docs/enforcement.
- Authenticated realtime events and documented rooms.
- Admin image upload endpoint for product/auction image URL creation.

## 19. What Mobile Must Not Assume

- Mobile must not decide auction winners locally.
- Countdown is display-only; REST/backend remains source of truth.
- Price fields should be treated as decimal strings.
- Public unauthenticated users should not assume socket access.
- Socket events should trigger REST refreshes instead of replacing REST reads.
- Mobile must not assume MinIO/S3 URLs; it should consume returned upload `url`.

## 20. Final Decision

Can we start Mobile Phase C now?

Yes.

Reason: build passes, unit tests pass, e2e tests pass, Docker clean DB works, seed works, readiness smoke passes, full smoke passes, OpenAPI is updated, and no critical backend gap remains for the products/auctions/notifications/realtime foundation.

