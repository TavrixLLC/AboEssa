param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\backups\postgres')
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $resolvedOutput | Out-Null

$containerId = (docker compose -p aboessa ps -q postgres).Trim()
if (-not $containerId) { throw 'AboEssa PostgreSQL container is not running.' }

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$fileName = "aboessa-postgres-$timestamp.dump"
$containerFile = "/tmp/$fileName"
$hostFile = Join-Path $resolvedOutput $fileName

try {
  docker compose -p aboessa exec -T postgres pg_dump -U postgres -d live_commerce --format=custom --no-owner --no-acl --file=$containerFile
  if ($LASTEXITCODE -ne 0) { throw 'AboEssa PostgreSQL backup failed.' }
  docker cp "${containerId}:${containerFile}" $hostFile
  if ($LASTEXITCODE -ne 0) { throw 'Copying the AboEssa backup failed.' }
} finally {
  docker compose -p aboessa exec -T postgres rm -f $containerFile | Out-Null
}

$backup = Get-Item -LiteralPath $hostFile
Write-Output "BACKUP_PATH=$($backup.FullName)"
Write-Output "BACKUP_BYTES=$($backup.Length)"
