# AboEssa Backup and Restore

PostgreSQL and uploaded files are separate backup domains. A database dump does not contain images or other uploaded objects.

## PostgreSQL backup

From the Backend directory, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backup-postgres.ps1
```

The script addresses only `docker compose -p aboessa`, writes a custom-format timestamped dump under `backups/postgres`, and never uses a host PostgreSQL port. Keep daily, weekly, and monthly generations according to the business recovery objective; encrypt copies at rest and keep at least one off-host copy.

## Safe restore drill

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\restore-drill.ps1 -BackupFile .\backups\postgres\aboessa-postgres-YYYYMMDD-HHMMSS.dump
```

The drill creates only an isolated database named `aboessa_restore_<timestamp>` inside the AboEssa PostgreSQL container, restores the dump, verifies representative tables, and removes only that temporary database and copied dump. It never overwrites `live_commerce` and never removes volumes.

## Production recovery

Stop writes, preserve the failed primary for investigation, create a new database, restore into that new database, run integrity checks, then deliberately switch the application connection. Never test a restore by overwriting the only business database.

## MinIO/object-storage backup

The current API persists uploads in its mounted `uploads` volume; the Compose MinIO volume must nevertheless be protected independently if it holds business assets. Production should use bucket versioning where supported and scheduled provider-native replication or `mc mirror` to an encrypted, access-restricted backup bucket in another failure domain.

For a manual mirror, configure `mc` credentials interactively or through the deployment secret manager, then mirror the AboEssa bucket to an explicit backup alias. Do not embed access keys in scripts or shell history. Verify object count, total bytes, representative image retrieval, metadata/content type, and a restore into a separate verification bucket. Database and object backups should share a recovery timestamp so references can be reconciled.

The development MinIO service has no host port exposure; backup access should run on the `aboessa` network or through deployment-native tooling. Never connect to unrelated Compose networks or volumes.

After the owner approves source/destination aliases and bucket names, a non-destructive mirror can use this pattern (descriptions in angle brackets are not literal values):

```powershell
mc mirror --preserve <primary-alias>/<source-bucket> <backup-alias>/<verification-bucket>
```

Do not add `--remove` to a recovery copy. Credentials must come from the operator's secret manager, and the destination must be in another failure domain. The owner must approve retention, recovery-point objective, recovery-time objective, encryption, immutability/versioning, and deletion policy before production go-live.
