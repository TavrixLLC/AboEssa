# AboEssa Environment Configuration

This repository distinguishes `development`, `test`, and `production` through `NODE_ENV`. Copy `.env.example` to a deployment-owned environment file and supply values through the deployment secret manager; never commit that file.

## Critical backend values

| Variable | Development/test | Production |
|---|---|---|
| `DATABASE_URL` | Required; Compose uses `postgres:5432` | Required; use a private PostgreSQL endpoint |
| `REDIS_URL` | Optional fallback for local work | Required; prefer TLS where supported |
| `JWT_*_SECRET` | Required, at least 32 characters | Required, independent random secrets |
| `CORS_ORIGINS` | May list local origins | Required explicit allow-list; `*` and empty are rejected |
| `PUBLIC_BASE_URL` | HTTP is permitted locally | Required HTTPS URL |
| `PUSH_PROVIDER` | `disabled` or `firebase` | Explicitly choose one |
| `FIREBASE_SERVICE_ACCOUNT_HOST_FILE` | External host path used by Compose | External host path used by Compose |
| `FIREBASE_SERVICE_ACCOUNT_FILE` | Not needed when disabled | Required mounted file path when Firebase is enabled |
| `FIREBASE_PROJECT_ID` | Optional | Firebase project identifier, if required by deployment |
| `LOCAL_UPLOAD_DIR` | Defaults to `uploads` | Persistent mounted path or replace storage provider |

Optional providers are not required when explicitly disabled. Customer authentication uses phone and password and does not require a message-delivery provider.

## Firebase secret rule

Set `FIREBASE_SERVICE_ACCOUNT_HOST_FILE` only in the deployment process to the external JSON path. Compose mounts that file read-only into only the API at `/run/secrets/aboessa-firebase-admin.json`; set that harmless container path in `FIREBASE_SERVICE_ACCOUNT_FILE`. Never place the host path in the repository `.env`, or place JSON, private keys, token values, or credentials in environment documentation, logs, container images, or source control.

## Mobile build configuration

Both Flutter apps require `API_BASE_URL`. `APP_ENV=production` rejects non-HTTPS API URLs and non-HTTPS/WSS socket URLs. Local manual Android builds may use the documented LAN HTTP endpoint because debug manifests alone permit cleartext.

Customer Android Firebase configuration is supplied by the validated FlutterFire files in the Customer app. Native push is enabled by default for that configured Android build; `PUSH_ENABLED=false` explicitly selects the local no-op provider. The backend Firebase Admin service-account JSON remains a separate external deployment secret and must never be committed.
