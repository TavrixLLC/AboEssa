# Customer wallet rollout gate

The wallet implementation is staged locally. Do **not** deploy the wallet migration or wallet-backed purchase/bid paths until a real funding workflow exists. New customers have no wallet row and read as IQD 0.00; deploying the current purchase/bid enforcement before funding would reject every unfunded customer transaction.

## Current behavior

- The wallet balance is separate from the value of goods in `CustomerBox`.
- Product purchase debits available funds in the same serializable transaction as stock and sale creation.
- A new bid reserves its full amount. Outbidding or auction cancellation releases its hold; an auction win settles it in the sale transaction.
- Wallet entries are append-only. The database rejects negative balances and duplicate event keys.
- No public or admin funding/credit endpoint exists, and no customer balances were migrated or credited.
- Bids created before wallet rollout have `walletReserved = false`; they are never charged retroactively. Active legacy auctions need a rollout decision before enforcement is deployed.

## Required before enabling

1. Choose a real funding provider and implement server-verified, idempotent crediting after confirmed payment; never trust client-reported success or amount.
2. Decide how to handle active legacy auctions, blocked winners, refunds, and chargebacks. A blocked winner currently prevents sale creation and can leave a hold until an explicit policy is implemented.
3. Exercise migration and full purchase/bid/release/settlement flows in staging with an isolated database, including concurrent requests and crash/retry cases.
4. Reconcile wallet balances against append-only entries and payment-provider settlements before and after rollout.
5. Deploy backend schema and code before a Customer App build that exposes the wallet. Do not apply this migration to production as an isolated step.

The migration SQL was exercised on a disposable PostgreSQL 16 container attached to the `aboessa` Compose network; the production and existing local customer databases were not used for that check.
