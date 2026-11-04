# REZONA essentials admin / automatic auction checkout

## Scope

The Flutter admin has five primary areas: home, products, auctions, orders, customers. Ads, notifications, store settings, a sales report, staff/roles, sessions and audit logs are secondary destinations. Retired modules are hidden from active menus; historical records and backward-compatible APIs are not deleted.

No production data or balances were modified while implementing this change. The local preview uses an isolated in-memory repository and blocks network API mutations.

## Checkout rules

- A winning bid is converted to a dedicated confirmed order in the same serializable Postgres transaction that closes the auction.
- Default payment is COD. The existing reserved 10% is settled as a deposit; 90% remains due on delivery.
- The customer can pay the remaining amount from the wallet on the already-confirmed order, until shipping. The deposit is not charged again.
- Fixed-price COD does not debit the wallet. Wallet checkout debits the full fixed-price total.
- Active saved default address is copied to the order; otherwise the most recently updated active saved address is used. If none is valid, the order is still confirmed, but preparation/shipping is blocked until the customer adds delivery details.
- Wallet funding remains unavailable. There is no new public balance-credit endpoint.
- Pre-wallet legacy bids without a hold are not charged retroactively.

## Order states / authorization

`NEW → PREPARING → READY → SHIPPED → DELIVERED`

Cancellation is allowed only before shipping, requires a reason and refunds the actual wallet-paid amount (including the auction deposit). Historical paid/due fields are retained; a unique `REFUND` wallet entry records the reversal. Fixed product stock and pending commissions are reversed atomically. No deletion of financial history.

| Endpoint | Required access |
| --- | --- |
| `GET /api/admin/console/overview` | `dashboard.view` |
| `GET /api/admin/orders[/:id]` | `shipping.manage` |
| `POST /api/admin/orders/:id/actions` | `shipping.manage`; additionally `shipping.ship` for ship/deliver, `sales.cancel` for cancel |
| `GET /api/admin/console/customers/:id` | `customers.read` |
| `POST /api/customer/orders/:id/pay-wallet` | Authenticated owner of the order |
| `PATCH /api/customer/orders/:id/delivery` | Authenticated owner, before preparation |

Order actions lock the order row; auction settlement locks the auction row. Money comes from server-side amounts, not request-body amounts. Unique wallet event keys prevent duplicate debit/refund entries. Concurrent serializable conflicts roll back; the caller can retry safely. Closing jobs use a distinct deadline-based id and exponential retries. Legacy shipping mutations reject confirmed orders with `USE_ORDER_ACTIONS` to prevent bypassing the new transitions/refund path.

## Deployment checklist (not performed by this implementation)

1. Back up production Postgres and record running release versions.
2. Run `prisma migrate deploy` before enabling the new cancellation flow. Migration `202610310001_order_refunds` adds the `REFUND` enum value only; it deletes no rows.
3. Build/deploy the API and worker together. Verify Redis/BullMQ workers and the scheduled close jobs for all active auctions, including already-expired ACTIVE records.
4. Audit historical ENDED auctions with no order, or `AWAITING_SELECTION` items. This change does **not** silently confirm or recharge historical pending wins. Resolve that backlog explicitly before rolling out a customer build that removes the old confirmation interface.
5. Smoke test with an authorized test customer: fixed COD, wallet payment, auction expiry, missing address, prepare/ready/ship/deliver, and pre-shipping cancellation. Verify wallet ledger and order totals. Do not use a real customer's balance for smoke testing.
6. Release the admin/customer builds with the production API and socket URLs. No new Firebase, signing or production credentials are introduced here.

Rollback: restore the previous API/app release after checking in-flight jobs; keep the additive enum migration and all ledger entries. Do not delete refunds or reset balances.

## Reproducible verification

- `npm run build`
- `npm test -- --runInBand`
- `ADMIN_QA_DATABASE_URL=<isolated-db> npx jest --config tests/jest-e2e.json --runInBand admin-console-flow.e2e-spec.ts`

The integration suite refuses every database except `127.0.0.1:55439/rezona_admin_qa`. It never falls back to `DATABASE_URL` or `.env`. Tests use new fixture ids and leave records only in that disposable test database. They cover actual Postgres transactions, replay/concurrent payments, ownership, deposit/full-wallet arithmetic, missing addresses, transitions, cancellation/refund and the legacy shipping guard.
