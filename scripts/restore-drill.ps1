param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile
)

$ErrorActionPreference = 'Stop'
$resolvedBackup = (Resolve-Path -LiteralPath $BackupFile).Path
$containerId = (docker compose -p aboessa ps -q postgres).Trim()
if (-not $containerId) { throw 'AboEssa PostgreSQL container is not running.' }

$suffix = Get-Date -Format 'yyyyMMddHHmmss'
$databaseName = "aboessa_restore_$suffix"
if ($databaseName -notmatch '^aboessa_restore_[0-9]{14}$') { throw 'Unsafe restore database name.' }
$containerFile = "/tmp/aboessa-restore-$suffix.dump"

try {
  docker cp $resolvedBackup "${containerId}:${containerFile}"
  if ($LASTEXITCODE -ne 0) { throw 'Copying the restore drill backup failed.' }
  docker compose -p aboessa exec -T postgres createdb -U postgres $databaseName
  if ($LASTEXITCODE -ne 0) { throw 'Creating the isolated restore database failed.' }
  docker compose -p aboessa exec -T postgres pg_restore -U postgres -d $databaseName --no-owner --no-acl $containerFile
  if ($LASTEXITCODE -ne 0) { throw 'Restoring the isolated database failed.' }

  $verificationSql = 'SELECT (SELECT count(*) FROM \"Customer\"), (SELECT count(*) FROM \"AdminUser\"), (SELECT count(*) FROM \"Notification\");'
  $counts = docker compose -p aboessa exec -T postgres psql -U postgres -d $databaseName -Atc $verificationSql
  if ($LASTEXITCODE -ne 0 -or -not $counts) { throw 'Restore verification failed.' }
  Write-Output "RESTORE_DRILL_DATABASE=$databaseName"
  Write-Output "RESTORE_DRILL_COUNTS=$($counts.Trim())"
  Write-Output 'RESTORE_DRILL=PASS'
} finally {
  docker compose -p aboessa exec -T postgres dropdb -U postgres --if-exists $databaseName | Out-Null
  docker compose -p aboessa exec -T postgres rm -f $containerFile | Out-Null
}
