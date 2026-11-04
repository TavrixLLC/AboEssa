# Guest browsing and account deletion — 2026-11-01

## Scope and rollout status

Update: the owner subsequently approved deployment on 2026-11-02. See
`customer-guest-deployment-20261102.md` for the completed production rollout and
phone-emulator verification. The paragraphs below record the original local
implementation stage.

Implemented locally in the customer Flutter app and the customer-auth backend.
No production deployment, real customer deletion, App Store upload, or store
submission was performed in this change. The owner reports an error on deletion;
the exact message/screenshot is still needed to match that specific failure.

## Guest flow

- Welcome and sign-in screens have an explicit "Browse without an account" action.
- Home, discounts, products, auctions, categories, and detail screens are public.
- No guest account, fake identity, session token, or wallet is created.
- Buy, bid, and favorite actions prompt for sign-in. Dismissing the prompt leaves
  the visitor browsing. Signing in never automatically executes a money action.
- Account, wallet, addresses, orders, notifications, and settings show a sign-in
  gate without constructing/loading their authenticated feature providers.
- Authenticated realtime/push activation remains restricted to authenticated
  customers. The notification badge no longer makes an authenticated request at
  startup for a visitor; badge and in-memory favorites clear on logout/deletion.
- Existing backend authentication remains enforced on private/mutation routes.

## Account deletion

- Settings > Delete account permanently > current password > Confirm deletion.
- Duplicate submissions/back navigation are disabled while the request is pending.
- Failed deletion keeps the account signed in and shows an error. No push-device
  unregister is performed before the password/deletion succeeds.
- Password rejection (`INVALID_CREDENTIALS`) no longer triggers token refresh or
  an automatic replay of the deletion request. Expired-token refresh is retained.
- Successful deletion clears local tokens and returns to the public catalog,
  explicitly removing the confirmation dialog and private navigation history.
- Platform keychain cleanup failure cannot misreport an already deleted account
  as still active. An in-memory invalidation prevents sending stale credentials;
  the server also rejects those credentials after an app restart.
- Server verifies the actual current password under a row lock, anonymizes the
  account, removes personal/device/address records, scrubs delivery snapshots,
  phone numbers and order/shipment notes, and invalidates refresh credentials.
- Password reauthentication accepts existing non-empty passwords rather than
  applying today's registration minimum length to historical credentials. Hash
  verification remains mandatory; empty/missing passwords are rejected.
- The anonymous deletion audit receipt commits atomically with erasure; a failed
  audit write can no longer occur after deletion has already committed.
- Anonymized financial/transaction links remain for accounting. No real wallet
  funds, order states, bids or auction settlements are altered by these tests.
- No schema migration is required for this patch.

## Verification

- Customer Flutter suite: 157 passing; `flutter analyze --no-pub`: no issues.
- Shared API-client suite: 14 passing; analysis: no issues. Admin regression suite:
  143 passing after the shared HTTP change.
- Backend build passed; complete unit suite: 156 passing.
- `tests/customer-account-deletion.e2e-spec.ts` uses real HTTP, validation,
  PostgreSQL, Argon2 and the existing JWT guard. It checks successful erasure,
  delivery snapshot scrubbing, ownership, old access/refresh revocation, blocked
  subsequent login, incorrect/empty passwords, and public web deletion.
- HTTP integration tests are opt-in via `ACCOUNT_QA_DATABASE_URL`; they refuse
  every target except `127.0.0.1:55439/rezona_admin_qa`. They never use the normal
  `DATABASE_URL` or production `.env` as a fallback.
- Real HTTP/Postgres account-deletion integration suite: 4 passing.
- Read-only production checks: public marketplace/products/auctions and `/ready`
  each returned HTTP 200 without an account token.
- Local disposable test container: `rezona-account-qa-20261101`; production and
  the developer's existing data were not changed. The test container was stopped
  after verification; its disposable QA records remain available for reruns.

For iOS delivery, build/sign the updated customer source on macOS with bundle ID
`com.aboessa.rezona` and production `API_BASE_URL` / `SOCKET_URL` dart defines.
An iOS archive was not built or device-tested on this Windows machine.
