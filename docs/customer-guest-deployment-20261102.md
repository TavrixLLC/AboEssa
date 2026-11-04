# Guest browsing / deletion deployment — 2026-11-02

The owner explicitly requested deployment to the existing server and running the
customer app on a phone emulator (not the tablet).

## Production

- Current release: `/opt/aboessa/releases/20261102-guest-account`.
- Previous release retained unchanged: `/opt/aboessa/releases/20261101-admin-console`.
- Overlay contained only `src/customer-auth/customer-auth.service.ts`, its
  deletion DTO, and `public/legal/account-deletion.html`. Previous deployed files
  were hash-verified against the expected baseline before any change.
- API image: `sha256:aaef434fb83436522ec03b488a67e367928d806205a3793f006f5adfb8064c03`.
- Rollback image retained as `aboessa-api:pre-guest-20261102`.
- Only API and the REZONA nginx container were recreated; nginx needed its legal
  bind mount rebound to the new immutable release. Postgres, Redis, MinIO and
  unrelated server projects were not recreated or reconfigured.
- Health, database and Redis checks passed. Public marketplace, products and
  auctions return 200 without authentication. Admin overview remains protected
  with 401. No captured backend errors during the deployment health checks.
- Public account-deletion page serves the updated password field. A request with
  a nonexistent phone and a one-character invalid password returned the expected
  401 `INVALID_CREDENTIALS`, not old minimum-length validation; no real customer
  credential or account was used for this negative check.
- Existing 19 migrations remain unchanged; this patch required no new migration.
- Before/after counts unchanged: 15 customers, 3 orders, 11 wallet entries.
  No real customer was created, deleted, debited or credited for smoke testing.
- Existing historical pending wins/holds were not settled or otherwise modified.

## Backup

- Restricted server backup: `/opt/aboessa/backups/20261102-guest-account`.
- Fresh PostgreSQL dump was actually restored into the separate
  `rezona_restorecheck_guest_20261102` database and checked before deployment;
  only that temporary restore-check database was then removed.
- A verified off-server copy is stored in the ignored local backup directory,
  encrypted with DPAPI for this Windows user. Plaintext download was removed
  only after successful decryption/hash verification; server original retained.
- Dump SHA256: `cd2d292ef69230a0aad9e032daa4645a8bc8b35212acec0ee760a95f92cd4326`.
- Previous release and earlier media backups remain available. No primary
  database restore or schema rollback was performed.

## Phone emulator

- Built the real `lib/main.dart` customer entry point with `APP_ENV=production`,
  `API_BASE_URL=https://shanasheel.tavrixllc.com` and matching `SOCKET_URL`.
- The existing Pixel 10 Pro app was version 1.0.2+5 with a different signing
  certificate. An in-place debug update was rejected; it was not uninstalled and
  its data was not cleared.
- Created a separate phone AVD `Rezona_Phone_Test` using a Pixel 9 Pro phone
  profile, installed system image API 37.1 x86_64 / 16KB, and emulator-5554.
- Installed customer debug version 1.0.5+8, package
  `com.tavrix.aboessa_customer_app`, from the production-configured build.
- Welcome UI and the explicit Arabic guest-browse action were visually verified.
- Tapped guest browse on the actual emulator: the public home loaded real server
  products and images without an account. No captured Flutter/Android fatal
  exception. App is left open for the owner to test.
- No connected physical-phone app, Google Play release or App Store submission
  was changed. No iOS build was generated on this Windows machine.
