# Single Store Commerce API

NestJS backend for one store only. There is no tenant switching or store selection. Store-level operational configuration lives in the singleton `AppSettings` row. Live streaming is intentionally decommissioned from the current product; its legacy persistence remains dormant for compatibility.

## Phase A Contents

- NestJS project scaffold with `/api` REST prefix, Swagger at `/api/docs`, and health at `/health`.
- PostgreSQL Prisma schema for the full single-store domain.
- Global validation, Helmet, CORS from env, request IDs, success/error envelopes, throttling, and audit logging.
- Admin JWT login, refresh-token rotation, logout, and `me`.
- Customer WhatsApp OTP login with hashed OTPs, cooldown, max attempts, refresh-token rotation, and virtual customer claiming by phone.
- Admin users, customers, verification requests, singleton settings, and categories modules.
- Docker, Docker Compose, production Compose, seed script, and provider interfaces for storage, push, and label printing.

## Phase B Contents

- Manual sales sessions backed by the historical shared `LiveSession` table.
- Transactional `SalesService` for sold item creation.
- Quick sale with idempotency, virtual customer reuse/creation, customer box updates, and print-job creation.
- Label payloads, print jobs, mark printed, mark failed, and confirm attached.
- Warehouse label-pending, print-label, confirm-attached, customer boxes, and barcode search.
- Customer `/customer/box`, `/customer/order-items`, and `/customer/orders` endpoints.
- Screen devices with separate screen JWTs and realtime events for latest sale/session/label updates.

## Phase C Contents

- Fixed-price app products with admin create/publish/cancel and atomic customer purchase.
- Product purchase uses `Idempotency-Key`, a conditional database status update, and `SalesService`.
- Auctions, bids, extension logic, BullMQ close jobs, close-now, and winner OrderItem creation.
- Database notifications and customer notification settings.

## Phase D Contents

- Influencers, referral codes, referral attribution integration, and commission ledger management.
- In-app ads with placement, active-window, and customer-target filtering.
- Customer addresses, shipping requests, admin approve/pack/ship/cancel flow, shipments, and notifications.
- Dashboard stats and reports for sales, categories, customers, warehouse, influencers, and auctions.

## Main Business Rules

- Single store only; no tenant or store switching.
- Every sold physical piece becomes an `OrderItem`.
- Product purchase has no waiting list; first successful server-side transaction wins.
- Auction winners are decided by server time and database state.
- App product and auction sales enter warehouse with `labelStatus: PENDING`.
- Financial records use status changes and ledger rows rather than hard deletes.

## Local Setup

```bash
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run start:dev
```

Open:

- Swagger: `http://localhost:8080/api/docs`
- Health: `http://localhost:8080/health`

## Docker Setup

```bash
cp .env.example .env
docker compose up --build
```

The development Compose file starts:

- `api` on host port `8080`, mapped to container port `3000`
- `postgres` on port `5432`
- `redis` on port `6379`
- `minio` on ports `9000` and `9001`

To reset a development database and rerun migrations from an empty Postgres volume:

```bash
docker compose down -v
docker compose up --build
```

This removes local Compose volumes and destroys development data.

The default `.env` values use `localhost` so host-side commands such as `npm run prisma:seed` can reach the mapped Postgres and Redis ports. Docker Compose overrides `DATABASE_URL` and `REDIS_URL` for the API container so it can use the internal service hostnames `postgres` and `redis`.

Development API addresses:

- Windows host: `http://localhost:8080`
- Current LAN address: `http://192.168.1.5:8080`
- Android Studio emulator: `http://10.0.2.2:8080`
- Intentional `adb reverse tcp:8080 tcp:8080`: `http://127.0.0.1:8080`

`192.168.1.5` is assigned by the current LAN and may change with DHCP. Keep client URLs runtime-configurable. For uploaded media intended for a phone, set `PUBLIC_BASE_URL` to a URL that the phone can reach.

## Environment Variables

Required values are listed in `.env.example`. For production, replace every JWT secret with a long random value and set a strong database password. Never commit real credentials.

Important variables:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_ADMIN_ACCESS_SECRET`
- `JWT_CUSTOMER_ACCESS_SECRET`
- `JWT_SCREEN_ACCESS_SECRET`
- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_PASSWORD`
- `CORS_ORIGINS`

## Database Migration

Development migration:

```bash
npm run prisma:migrate
```

Production deployment:

```bash
npm run prisma:deploy
```

## Seed Admin

Set these in `.env` before seeding:

```bash
SEED_ADMIN_EMAIL=owner@example.com
SEED_ADMIN_PASSWORD=change-me-in-env
SEED_ADMIN_NAME=Store Owner
```

Then run:

```bash
npm run prisma:seed
```

## Common Commands

```bash
npm run start:dev
npm run build
npm run start:prod
npm run lint
npm run test
npm run test:e2e
npm run prisma:generate
npm run prisma:migrate
npm run prisma:deploy
npm run prisma:seed
npm run prisma:seed:dev
```

## Manual Quick Sale Flow

1. Seed an owner admin and login with `POST /api/admin/auth/login`.
2. Create or use a category from `POST /api/admin/categories`.
3. Ensure settings allow the target customer to purchase, or verify the customer.
4. Start a session with `POST /api/admin/sales-sessions/start`.
5. Create a quick sale with `POST /api/admin/sales/quick` and an `Idempotency-Key` header.
6. Use returned `labelPayloads` for the printer UI.
7. Mark the print job printed with `POST /api/admin/labels/jobs/{id}/mark-printed`.
8. Confirm attachment with `POST /api/admin/labels/jobs/{id}/confirm-attached` or `POST /api/admin/warehouse/items/{id}/confirm-label-attached`.

## Product Purchase Flow

1. Admin creates a product with `POST /api/admin/products`.
2. Admin publishes with `POST /api/admin/products/{id}/publish`.
3. Customer buys with `POST /api/products/{id}/buy` using a customer JWT and `Idempotency-Key`.
4. The product is atomically marked `SOLD`, an `OrderItem` is created, and the item appears in warehouse label-pending.

## Auction Flow

1. Admin creates an auction with `POST /api/admin/auctions`.
2. Admin publishes with `POST /api/admin/auctions/{id}/publish`; a BullMQ close job is scheduled.
3. Customers bid with `POST /api/auctions/{id}/bids` and `Idempotency-Key`.
4. Bids near the end extend the auction up to `maxExtensions`.
5. Close job or `POST /api/admin/auctions/{id}/close-now` marks bids, creates the winner `OrderItem`, and notifies customers.

## Referral And Commission Flow

1. Admin creates an influencer and referral code.
2. Customer verifies OTP with `referralCode`.
3. Future sales created by `SalesService` create pending `CommissionLedger` rows during the active referral window.
4. Admin approves, pays, or cancels commissions.

## Shipping Flow

1. Customer creates an address under `POST /api/customer/addresses`.
2. Customer requests shipping with attached-label item IDs using `POST /api/customer/shipping-requests` and `Idempotency-Key`.
3. Admin approves, packs, ships, or cancels from `/api/admin/shipping-requests`.
4. Shipping updates create customer notifications.

## Swagger And OpenAPI

- Swagger UI: `http://localhost:8080/api/docs`
- OpenAPI JSON: `http://localhost:8080/api/docs-json`

## Running Tests

```bash
npm run lint
npm run build
npm test
npm run test:e2e
```

Optional DB-backed e2e harness:

```bash
$env:DATABASE_URL_TEST="postgresql://postgres:postgres@localhost:5432/live_commerce_test?schema=public"
$env:RUN_DB_E2E="true"
npm run test:e2e
```

## Troubleshooting

- `DATABASE_URL` is required for Prisma migrate/seed and application startup.
- BullMQ auction jobs require Redis.
- If OTP is requested in development, the mock WhatsApp provider logs the OTP to stdout.
- Product purchase and auction bid conflicts should be retried with a new `Idempotency-Key` only when the request body changes.

## Production Notes

- Use `docker-compose.prod.yml` as a baseline and put Postgres/Redis on private networks only.
- Run `npm run prisma:deploy` during release, not `prisma migrate dev`.
- Keep JWT secrets and `SEED_ADMIN_PASSWORD` in a secrets manager.
- Lock down `CORS_ORIGINS` to the real admin/customer/screen origins.
- Configure object storage, push, and printer providers by replacing the Phase A interfaces with real implementations.
- Serve only over HTTPS behind a reverse proxy.
- Configure database backups and restore drills.
- Keep upload volumes backed by durable storage or replace local uploads with object storage.
- Replace mock WhatsApp, push, printer, and live provider implementations before production use.
