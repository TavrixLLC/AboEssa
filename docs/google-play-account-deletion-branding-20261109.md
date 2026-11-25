# Google Play account-deletion branding correction — 2026-11-09

## Rejection and verified cause

Google Play rejected the production submission because the account deletion URL
in Data safety did not identify the app/developer shown in its store listing.
The listing is **ريزونا / REZONA**, package
`com.tavrix.aboessa_customer_app`. The configured URL was already correct:
`https://shanasheel.tavrixllc.com/account-deletion`, but its live HTML still
identified **شناشيل / Shanashil**. It returned HTTP 200; this was an identity
mismatch, not an unavailable endpoint or a bundle validation error.

## Correction

- Updated the Arabic/English deletion page title, heading, app name and package
  identity. Added prominent instructions for its existing phone/password form.
- Aligned the linked privacy page and deletion success message with REZONA.
- Removed the old brand initial from the shared stylesheet. Versioned CSS/JS
  URLs prevent clients reusing the old cached branding.
- Kept password reauthentication, explicit irreversible-delete confirmation,
  endpoint, data-handling policy and Data safety declarations unchanged.
- Did not delete a real account or submit anyone's credentials to test the page.

## Production deployment and checks

Four static files only were patched in the currently bound legal directory:
`/opt/aboessa/releases/20261102-guest-account/public/legal`.
The current release symlink and API image were not changed. Original files were
hash-verified and retained under the restricted server backup directory
`/opt/aboessa/backups/20261109-rezona-legal/original` before atomic replacement.
Rollback copies and deployment scripts remain in that backup directory.

No containers were restarted, no migration ran, and no account, order, wallet,
database or media state was modified. API readiness still reports database and
Redis OK, and all five aboessa containers remain healthy.

Final deployed SHA-256 hashes (also verified against public HTTPS responses):

| File | SHA-256 |
| --- | --- |
| account-deletion.html | `75077ee6529d37d35753ed366fa5c87fe4a2d1ce5bcacfdc5913e00f916607fa` |
| account-deletion.js | `14d4c6940d9c8875997eb478d9c935b98c7623af83fdcad2a64aa233bf84d6a4` |
| privacy-policy.html | `64f1304cfd207226a02d49b757ccbc0293622d2cb2d8c9b2755e19ca69282017` |
| legal.css | `3944c15a79dd3b5cac27d053ba85e1ae04b1edfb73f73e66d0c0fdfab1f07a54` |

Browser verification confirms the public page now visibly identifies REZONA in
Arabic and English, gives deletion steps, and exposes the original form.
All 161 backend unit tests across 18 suites pass. Regression tests cover both pages' listing identity, removal of old branding,
form availability, cache versioning and preservation of confirmation/password
reauthentication.

## Play Console

The owner explicitly selected publishing the existing tested **1.0.5 (8)**,
not a new bundle containing later source changes. That choice was preserved.
After verifying the corrected public page, the same production rollout and the
existing Iraq/Jordan country change were resubmitted. Console now shows them
under **التغييرات قيد المراجعة**. Automatic pre-review checks completed and the
final status explicitly says the changes are now under review.
No appeal, new bundle or unrelated declaration was
submitted. Approval is still Google's decision; managed publishing remains on.

Screenshots are retained locally under the ignored directory
`backups/google-play/20261109`, including the corrected public page and the
resubmitted review state. No release has been represented as publicly live.
