# Backend Mobile Phase D Readiness Report

Date: 2026-07-28

## 1. Summary

Phase D backend contracts were added additively to the existing single-store NestJS/Prisma backend. Existing product, auction, marketplace, sales-session, notification, shipping, ads, influencer, commission, report, and smoke endpoints were preserved.

The implementation is code-ready for Mobile Phase D integration, but the final readiness decision is **No** because customer-authenticated smoke flows and the full legacy smoke suite could not be completed without a supplied customer access token or OTP.

## 2. Files created/updated

Created or materially updated:

- `prisma/schema.prisma`
- `prisma/migrations/202607280000_phase_d_readiness/migration.sql`
- `prisma/migrations/202607280001_live_session_statuses/migration.sql`
- `prisma/migrations/202607280002_live_session_constraint/migration.sql`
- `src/live-sessions/**`
- `src/notifications/dto/read-batch-notifications.dto.ts`
- `src/customer-addresses/dto/update-customer-address.dto.ts`
- `scripts/backend-mobile-phase-d-readiness-smoke.mjs`
- `tests/unit/phase-d-readiness.spec.ts`
- `docs/REALTIME_SOCKET_CONTRACT.md`
- `openapi.json`
- `openapi.jsoncurl`
- `BACKEND_MOBILE_PHASE_D_READINESS_REPORT.md`

Also updated auction, ads, shipping, addresses, influencers, commissions, reports, permissions, seed, sockets, products, and app-module wiring.

## 3. Product/auction separation status

Complete. `GET /api/products` and `GET /api/products/{id}` remain fixed-price product contracts. `GET /api/auctions` and `GET /api/auctions/{id}` remain auction contracts. The compatibility `GET /api/marketplace` endpoint remains available.

Product and auction lists are independently paginated and include stable metadata. Product responses do not contain auctions, and auction responses do not contain fixed-price products.

## 4. Auction NORMAL/VIP implementation

Complete. Added `AuctionTier` with `NORMAL` and `VIP`; the database default is `NORMAL`, so existing and new auctions safely default to normal. Responses include `tier` and `isVip`.

## 5. VIP sorting contract

Complete. Default auction ordering is VIP first, then start/end date ordering, then stable `id` ordering. Explicit `sortBy`/`sortOrder` applies with `id` as the final tie-breaker. Pagination ordering is deterministic.

## 6. VIP permission status

Complete. Added `auctions.set_vip` to the permission catalog and seed permissions. VIP creation and tier changes are checked by the service in addition to the existing admin guard. Unauthorized changes return the stable forbidden permission envelope.

## 7. Category enforcement

Complete. Product and auction creation/update paths require an existing active category. Missing, missing-id, and inactive-category cases map to `CATEGORY_REQUIRED`, `CATEGORY_NOT_FOUND`, or `CATEGORY_INACTIVE`. Existing items remain readable if a category is later deactivated. Public responses include `categoryId` and `categoryName`. Ads support category-targeted filtering.

## 8. Notification unread-count status

Complete. Added customer-owned `GET /api/notifications/unread-count`, counting only unread notifications for the authenticated customer.

## 9. Batch mark-read status

Complete. Added `POST /api/notifications/read-batch`. It deduplicates ids, updates only owned unread notifications, is idempotent, safely ignores other-customer ids, and returns `updatedCount`. The existing single mark-read endpoint remains available with `NOTIFICATION_NOT_FOUND` handling.

## 10. Notification realtime status

Complete. The existing `notification` event now includes `notificationId`, `type`, and `createdAt` alongside the compatibility notification payload. The realtime contract documents REST unread-count refresh as the source of truth.

## 11. Live-session metadata/status contract

Complete. Added `GET /api/live/current` and admin live-session CRUD/lifecycle endpoints. Supported metadata includes title, description, cover image, playback URL, scheduled time, status, viewer count, and server time. `LIVE` is unique at the database level and conflicts map to `LIVE_SESSION_ALREADY_ACTIVE`.

## 12. Actual streaming transport status

Metadata only. No ingest, transcoding, or video transport was invented. `playbackUrl` is an externally configured playback address. Public current-live returns null when no legitimate live session with configured playback metadata exists.

## 13. Store-ad placement status

Complete. Added `STORE_HERO`, `STORE_INLINE`, `LIVE_BANNER`, and `SETTINGS_PROMO` placements, ad `priority` and `sortOrder`, deterministic ordering, date/activity filtering, category targeting, and target validation including external URLs. Existing image upload support accepts the `ads` folder.

## 14. Address/shipping status

Hardened. Addresses now support update, soft delete/deactivation, and set-default operations with ownership checks and one active default per customer. Shipping requests store an address snapshot, expose stable aliases for item ids/note/request time, validate ownership and eligibility, reject conflicting active requests, enforce transitions, and expose stable shipping error codes.

Full customer-to-shipped-item smoke execution remains unverified because the environment did not provide a customer token/OTP and the clean seed contains no eligible labelled customer item.

## 15. Influencer/referral status

Hardened. Codes are normalized to uppercase, influencer activity and date windows are validated, commission rates are capped at 100, and first attribution remains authoritative in the existing transaction flow. Decimal values are serialized consistently in commission responses.

## 16. Commission status

Hardened. Approval, payment, and cancellation transitions are validated transactionally. Payment requires approval; paid commissions cannot be cancelled; cancelled commissions cannot be reused. Responses expose mobile-safe money strings and stable sale/order aliases.

## 17. Dashboard/report status

Existing real database aggregations were preserved and money serialization was hardened to fixed decimal strings. Date filters remain supported where applicable. Report routes remain admin permission protected. No fake statistics were introduced.

## 18. Permissions catalog updates

Complete. Added Phase D live, VIP, shipping, commission, dashboard/report, staff, and settings-security keys. Dangerous flags include VIP changes, live lifecycle, shipping, commission payment, staff permission changes, and security settings.

## 19. OpenAPI status

Regenerated from the running API into `openapi.json` and `openapi.jsoncurl`. The generated document includes the separated product/auction paths, tier fields, notification endpoints, live endpoints, ad fields, address lifecycle, shipping, influencer/referral/commission routes, reports, and Phase D schemas.

## 20. Tests

- `npm run build`: passed.
- `npm test -- --runInBand`: passed, 4 suites / 44 tests.
- `npm run test:e2e -- --runInBand`: passed with the existing DB-gated suite skipped; 2 tests passed, 1 skipped.
- Added focused Phase D unit coverage for auction tier mapping, notification batch reads, live empty state, commission transitions, and ad ordering.

## 21. Phase D readiness smoke result

`scripts/backend-mobile-phase-d-readiness-smoke.mjs` ran against an isolated clean Docker Compose project:

- 12 passed
- 3 skipped because no customer OTP/access token was supplied
- 0 failed

Passed coverage includes health, admin login, permission catalog, active category, normal/VIP auctions, VIP ordering/category filter, empty/current live lifecycle, Store Hero ads, influencers/referrals/commission reports, dashboard/reports, and OpenAPI.

## 22. Regression smoke results

- Clean isolated Docker database migration: passed.
- Seed: passed.
- Health endpoint: passed.
- `inventory-marketplace-smoke.mjs`: blocked at customer login because no OTP/token was supplied.
- `full-api-smoke-test.mjs`: blocked at customer OTP login for the same environment reason.
- `mobile-phase-c-readiness-smoke.mjs`: not marked passed; it requires the same customer OTP flow.

The requested destructive `docker compose down -v` was not run against existing local volumes. Validation used a fresh isolated Compose project and did not touch existing local Docker data.

## 23. Remaining backend gaps

- Customer-authenticated smoke and end-to-end shipping verification require a supplied customer access token or OTP configuration.
- Actual streaming transport remains external metadata integration, not an ingest server.
- Non-owner negative-permission e2e coverage for `auctions.set_vip` and live lifecycle should be run with dedicated staff credentials.

## 24. What Mobile Phase D can rely on

- Separate product and auction REST destinations.
- Normal/VIP auction tier fields and deterministic VIP-first defaults.
- Category ids/names and category filtering.
- Customer unread count and loaded-notification batch read.
- Live current null/metadata contract and lifecycle socket hints.
- Store Hero ad filtering, ordering, and navigation target validation.
- Address lifecycle and shipping snapshot/transition contracts.
- Influencer, referral, commission, dashboard, report, permission, and OpenAPI contracts.

## 25. What Mobile Phase D must not assume

- A live session implies video transport; `playbackUrl` must be present and externally playable.
- Socket events replace REST state; they are refresh hints only.
- VIP is inferred from price or customer behavior; it is explicit admin state.
- An address edit changes an existing shipment; shipping uses its stored snapshot.
- Money/Decimal fields are JavaScript-safe numbers; consume documented strings.

## 26. Explicit decision

**Can we start Mobile Phase D now? No — not yet for formal readiness sign-off.**

The backend implementation and code-level verification are ready, but the formal criteria require the Phase D smoke and previous smoke scripts to pass without customer-authentication skips. Provide a customer OTP/token-capable test environment, rerun the three customer-dependent smoke scripts, and the final decision can be revisited.

## 27. Phase D.1 Customer Authenticated Final Sign-Off

Phase D.1 closed the remaining authenticated verification gap without changing runtime authentication or adding test backdoors. This section supersedes the pre-D.1 provisional **No** in section 26; sections 14, 21, 22, and 23 retain the earlier baseline for traceability.

### Authentication handling

All four smoke suites now use `scripts/lib/customer-auth.mjs` with this precedence:

1. `CUSTOMER_ACCESS_TOKEN`
2. `CUSTOMER_PHONE` + `CUSTOMER_OTP` through the real request/verify endpoints
3. The existing non-production MockWhatsAppProvider development OTP mechanism, read internally from the isolated API logs

If none is available, the smoke fails clearly. Credentials, OTPs, and tokens are redacted and are never printed.

### Isolated authenticated verification

Executed against a fresh named Docker Compose project, with existing local containers and volumes left untouched:

- `backend-mobile-phase-d-readiness-smoke.mjs`: **13 passed / 0 skipped / 0 failed**
- `inventory-marketplace-smoke.mjs`: **15 passed / 0 skipped / 0 failed**
- `mobile-phase-c-readiness-smoke.mjs`: **23 passed / 0 skipped / 0 failed**
- `full-api-smoke-test.mjs`: **30 passed / 0 skipped / 0 failed**

The Phase D.1 flow verified real customer notifications unread count plus single/batch read, address create/list/update/default, product purchase, warehouse label-pending eligibility, print-label, confirm-label-attached, shipping request, customer/admin retrieval, approve, pack, ship, final `SHIPPED` status, and immutable address snapshot behavior.

### Final decision

**Can we start Mobile Phase D now? Yes.**

The remaining customer-authenticated smoke and shipping verification criteria are now satisfied. Actual video ingest/transcoding remains outside this backend scope as documented above.
