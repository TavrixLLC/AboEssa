# Checkout deposit rollout

This change is staged locally. It has not been applied to the production database or server.

## Contract

- A bid reserves 10% of that bid's amount, rounded up to cents. An outbid or cancelled auction releases the hold.
- New auction responses advertise `bidDepositPercent: 10`. The updated Customer app refuses to submit bids when this field is absent or different, so it cannot silently place a full-hold bid against the old server. Older installed app versions do not have this safeguard.
- The winning hold remains reserved until the customer confirms payment and delivery.
- Wallet payment applies the hold and debits the remainder. Cash on delivery consumes the 10% hold as part of the final price; the remaining 90% is due on delivery.
- A fixed-price order requires a delivery address and the same payment choice. Wallet payment debits the full amount; cash on delivery does not debit the wallet and records the full amount due on delivery.
- A confirmed order creates a shipping request in `REQUESTED` status and displays as awaiting fulfillment.

## Deployment sequence

1. Back up the production database and verify the restore procedure.
2. Apply `202609180001_checkout_deposit` migration and deploy the matching backend. Do not deploy the backend before the migration.
3. Release the matching Customer app. Older app versions cannot submit the new product-buy fields, so coordinate rollout or add a temporary compatibility strategy before deploying the backend to a live user base.
4. Test on a staging database first: insufficient balance, outbid release, cancellation release, win with each payment method, product stock rollback, retry/idempotency, and admin shipping visibility.
5. Reconcile wallet ledger against order item and shipping request paid/due amounts. Verify existing legacy bids with full-amount holds are handled correctly.

Cash collection at delivery is recorded as an amount due, not an in-app card charge or a cash-receipt confirmation. Add operational reconciliation before treating COD as fully settled.
