# REZONA admin deployment — 2026-11-01

Owner explicitly approved updating the production server and running the real admin app on the connected phone, rather than using the local preview.

## Applied release

- Host/domain: the existing authorized REZONA server, `shanasheel.tavrixllc.com`.
- Previous release retained: `/opt/aboessa/releases/20260919-1706`.
- New release: `/opt/aboessa/releases/20261101-admin-console`; `/opt/aboessa/current` points here.
- Only changed backend source files, the admin-console module, internal delivery/order helpers and the new refund migration were overlaid. Existing production Compose configuration, environment/secrets, TLS material, legal pages, MinIO and uploads were preserved.
- The API container (including its BullMQ workers) was rebuilt/recreated. Postgres, Redis, MinIO and nginx containers were not recreated. nginx configuration was validated and gracefully reloaded.
- Migration `202610310001_order_refunds` applied successfully. Production now has 19 completed migrations.
- Health gate passed at approximately 14:10 Asia/Baghdad. `/ready` reports both database and Redis OK. New admin overview route returns 401 without authentication, not the old 404. Product catalog/media remain HTTP 200.

## Safety / backups

- Pre-deployment DB dump, uploads snapshot, and read-only MinIO-volume snapshot retained under `/opt/aboessa/backups/20261101-admin-console` (restricted access).
- Database dump was actually restored into the separate `rezona_restorecheck_admin_20261101` database. All 3 orders restored; the new migration was exercised there first, resulting in 19 successful migrations. The temporary verification database was then removed; the primary database was never restored over.
- A verified copy of the backup bundle is on the owner's Windows computer under the repository's ignored `backups/production/20261101-admin-console` directory. It is encrypted with Windows DPAPI for the current Windows user. The downloaded temporary plaintext copy was removed only after successful decrypt/hash verification; originals remain on the server. Keep the Windows profile/DPAPI recovery material available for recovery.
- Old API image retained as `aboessa-api:pre-admin-20261101` for application rollback. No destructive schema rollback was run.

## Production data checks

Before and after deployment:

- 3 orders total: 2 `SHIPPING_REQUESTED`, 1 `OPEN`.
- 23 ended auctions, no active/overdue active auctions.
- 5 historical pending wins and their 5 existing wallet holds remain untouched. No retrospective checkout, debit, release or refund was performed. Legacy winner-checkout endpoints remain available to the currently installed older customer client. Audit these records explicitly before a future customer-app rollout that removes its old confirmation UI.
- Wallet balances reconcile against append-only wallet entries: 0 mismatches.
- Confirmed order item paid + due totals reconcile to their prices.
- No customer balance was credited or modified for a production smoke test; no test order or auction was created in production.

## Phone

- Updated the real `com.singlestore.admin_app` package on Android device `ed5d050d` using install-in-place; existing app data was not cleared.
- Built from `lib/main.dart`, not the preview entry point, with `APP_ENV=production` and the real HTTPS API/socket URLs.
- Android reports launch status OK and a running app process, with no captured Flutter/Android fatal exception. After the owner unlocked the phone, the actual native admin login screen was visually verified on the device. The app is not stuck on a black launch screen. Authenticated dashboard verification awaits the owner's normal sign-in; no credentials were reset or bypassed.
- No Google Play release and no customer-app installation were changed in this deployment.
