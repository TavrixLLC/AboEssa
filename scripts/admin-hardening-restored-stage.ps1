param([switch]$ResumeDiagnosticOnly)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security.Cryptography.ProtectedData
$releaseManifest=Get-Content -LiteralPath ((Get-Content -LiteralPath 'D:\rezona-admin-hardening\active.json' -Raw | ConvertFrom-Json).manifest) -Raw | ConvertFrom-Json
$releaseStage='rezona-admin-restored-'+$releaseManifest.id
$releaseSilo='rezona-admin-silo-'+$releaseManifest.id
$releaseImage='rezona-admin-rc:'+$releaseManifest.id
$releaseSiloImage='pgsty/silo:RELEASE.2026-11-12T00-00-00Z@sha256:c20d112390b9a9ce8c11b8af95ad35bcaa62f4759663c09c936cd8d2b511f329'
function Invoke-StageDocker([string[]]$Arguments,[byte[]]$InputBytes=$null,[hashtable]$Environment=@{},[switch]$AllowFailure) {
  $releaseInfo=[System.Diagnostics.ProcessStartInfo]::new('docker');$releaseInfo.UseShellExecute=$false;$releaseInfo.CreateNoWindow=$true
  $releaseInfo.RedirectStandardInput=$true;$releaseInfo.RedirectStandardOutput=$true;$releaseInfo.RedirectStandardError=$true
  foreach($releaseArg in $Arguments){$releaseInfo.ArgumentList.Add($releaseArg)}
  foreach($releasePair in $Environment.GetEnumerator()){$releaseInfo.Environment[$releasePair.Key]=[string]$releasePair.Value}
  $releaseProcess=[System.Diagnostics.Process]::Start($releaseInfo)
  $releaseOut=$releaseProcess.StandardOutput.ReadToEndAsync();$releaseErr=$releaseProcess.StandardError.ReadToEndAsync()
  if ($InputBytes) {$releaseProcess.StandardInput.BaseStream.Write($InputBytes,0,$InputBytes.Length)}
  $releaseProcess.StandardInput.Close();$releaseProcess.WaitForExit()
  $releaseText=$releaseOut.GetAwaiter().GetResult();$releaseError=$releaseErr.GetAwaiter().GetResult()
  foreach($releasePair in $Environment.GetEnumerator()){if($releasePair.Key -match 'SECRET|PASSWORD'){$releaseText=$releaseText.Replace([string]$releasePair.Value,'[REDACTED]');$releaseError=$releaseError.Replace([string]$releasePair.Value,'[REDACTED]')}}
  if($releaseProcess.ExitCode -ne 0 -and !$AllowFailure){throw ('Local staging Docker operation failed: '+$releaseError)}
  return @{code=$releaseProcess.ExitCode;stdout=$releaseText;stderr=$releaseError}
}
function Save-StageEvidence([string]$Name,$Value){$releasePath=Join-Path $releaseManifest.out $Name;if(Test-Path -LiteralPath $releasePath){throw 'Evidence overwrite refused'};[System.IO.File]::WriteAllText($releasePath,($Value|ConvertTo-Json -Depth 20))}
function Get-StageCounts {
  $releaseSql='SELECT json_build_object(''migrations'',(SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL),''products'',(SELECT count(*) FROM "ProductListing"),''auctions'',(SELECT count(*) FROM "Auction"),''orders'',(SELECT count(*) FROM "Order"),''customers'',(SELECT count(*) FROM "Customer"),''fileAssets'',(SELECT count(*) FROM "FileAsset"),''walletEntries'',(SELECT count(*) FROM "WalletEntry"));'
  return ((Invoke-StageDocker @('exec',$releaseStage,'psql','-U','postgres','-d',$releaseCurrentDb,'-Atc',$releaseSql)).stdout|ConvertFrom-Json)
}
$releaseCurrentDb='rezona_staging'
$releaseExisting=Invoke-StageDocker @('container','inspect',$releaseStage) -AllowFailure
if($releaseExisting.code -eq 0 -and !$ResumeDiagnosticOnly){throw 'Staging container already exists; no replacement/removal allowed'}
if($ResumeDiagnosticOnly -and $releaseExisting.code -ne 0){throw 'Expected restored baseline is missing'}
$releaseImageInfo=(Invoke-StageDocker @('image','inspect',$releaseSiloImage,'--format','{{json .RepoDigests}}')).stdout
if($releaseImageInfo -notmatch 'c20d112390b9a9ce8c11b8af95ad35bcaa62f4759663c09c936cd8d2b511f329'){throw 'Published Silo digest mismatch'}
if(!$ResumeDiagnosticOnly){
$null=Invoke-StageDocker @('run','-d','--name',$releaseStage,'--network','none','--memory','1g','--cpus','2','--label','com.rezona.scope=isolated-restore','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=rezona_staging','postgres:16-alpine')
$releaseReady=$false
for($releaseTry=0;$releaseTry -lt 30;$releaseTry++){if((Invoke-StageDocker @('exec',$releaseStage,'pg_isready','-U','postgres') -AllowFailure).code -eq 0){$releaseReady=$true;break};Start-Sleep -Seconds 1}
if(!$releaseReady){throw 'Isolated Postgres not ready'}
$releaseDbMetadata=Get-ChildItem -LiteralPath $releaseManifest.out -Filter 'encrypted-backup-db-*.json' | Sort-Object Name -Descending | Select-Object -First 1 | Get-Content -Raw | ConvertFrom-Json
$releaseDump=[System.Security.Cryptography.ProtectedData]::Unprotect([System.IO.File]::ReadAllBytes($releaseDbMetadata.privateEncryptedArtifact),$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)
if([Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($releaseDump)).ToLowerInvariant() -ne $releaseDbMetadata.originalSha256){throw 'Dump checksum mismatch'}
$null=Invoke-StageDocker @('exec','-i',$releaseStage,'pg_restore','-U','postgres','-d','rezona_staging','--no-owner','--no-acl','--exit-on-error') $releaseDump
[Array]::Clear($releaseDump,0,$releaseDump.Length)
}
$releaseBefore=Get-StageCounts
$releaseSchemaRows=(Invoke-StageDocker @('exec',$releaseStage,'psql','-U','postgres','-d','rezona_staging','-Atc','SELECT json_agg(x) FROM (SELECT migration_name,checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name) x;')).stdout | ConvertFrom-Json
$releaseMismatches=@()
foreach($releaseRow in $releaseSchemaRows){$releaseSqlFile=Join-Path $PSScriptRoot ('..\prisma\migrations\'+$releaseRow.migration_name+'\migration.sql');$releaseActualHash=(Get-FileHash -LiteralPath $releaseSqlFile -Algorithm SHA256).Hash.ToLowerInvariant();if($releaseActualHash -ne $releaseRow.checksum){$releaseMismatches+=@{migration=$releaseRow.migration_name;recorded=$releaseRow.checksum;source=$releaseActualHash}}}
Save-StageEvidence 'historical-migration-checksum-review.json' @{baseline='Fresh production restored clone';migrations=19;matching=(19-$releaseMismatches.Count);mismatches=$releaseMismatches;productionRepairPerformed=$false;productionMigrationGate='BLOCKED';observation='Running deployed SQL and three September source archives match the local SQL, but not the historical recorded checksum. No newline/BOM-only match found. Original applied SQL remains unverified.'}
if($releaseMismatches.Count -ne 1 -or $releaseMismatches[0].migration -ne '202609190001_auction_optional_featured_rarity' -or $releaseMismatches[0].source -ne '4388744932e623810a54f5f5262a201ef0bb3b183fd38bebf3e3286d655556b5' -or !$ResumeDiagnosticOnly){throw 'Historical drift: stop; no production migration or checksum rewrite permitted'}
# Preserve the exact restored baseline. Migration below is a separate diagnostic
# copy only, not approval to repair history or migrate production.
$null=Invoke-StageDocker @('exec',$releaseStage,'createdb','-U','postgres','-T','rezona_staging','rezona_migration_trial')
$releaseCurrentDb='rezona_migration_trial'
$releaseDbUrl='postgresql://postgres@127.0.0.1:5432/rezona_migration_trial?schema=public'
$releaseMigration=Invoke-StageDocker @('run','--rm','--network',('container:'+$releaseStage),'-e',('DATABASE_URL='+$releaseDbUrl),'--entrypoint','node',$releaseImage,'node_modules/prisma/build/index.js','migrate','deploy')
$releaseAfter=Get-StageCounts
foreach($releaseField in @('products','auctions','orders','customers','fileAssets','walletEntries')){if($releaseBefore.$releaseField -ne $releaseAfter.$releaseField){throw ('Unexpected migration aggregate change: '+$releaseField)}}
if($releaseBefore.migrations -ne 19 -or $releaseAfter.migrations -ne 40){throw 'Unexpected migration baseline/count'}
Save-StageEvidence 'fresh-production-db-restore-and-migration.json' @{passed=$true;kind='DIAGNOSTIC_COPY_ONLY_NOT_PRODUCTION_MIGRATION_APPROVAL';source='FRESH_PRODUCTION_READ_ONLY_BACKUP';hostNetworkExposed=$false;isolatedNamespace=$releaseStage;before=$releaseBefore;after=$releaseAfter;all19HistoricalChecksumsMatch=$false;historicalChecksumMismatchCount=1;baselineClonePreservedAt19=$true;pendingMigrations=21;priorBinaryNotStarted=$true;dataPlaneWritesOnProduction=0;log=$releaseMigration.stdout;remainingLimits=@('Historical checksum inconsistency remains a production blocker','Online snapshot not writer-quiesced','Not public HTTPS staging','No old writer allowed against mapped schema','No end-user sign-in on this protected clone')}
$releaseStageSecret=[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(36))
$releaseStageEnv=@{REZONA_STAGE_ACCESS_KEY='rezona-stage';REZONA_STAGE_SECRET=$releaseStageSecret;MINIO_ROOT_USER='rezona-stage';MINIO_ROOT_PASSWORD=$releaseStageSecret}
$null=Invoke-StageDocker @('run','-d','--name',$releaseSilo,'--network',('container:'+$releaseStage),'--memory','1g','--cpus','2','--label','com.rezona.scope=silo-local-evaluation','-e','MINIO_ROOT_USER','-e','MINIO_ROOT_PASSWORD',$releaseSiloImage,'server','/data','--console-address',':9001') -Environment $releaseStageEnv
$releaseSiloReady=$false
for($releaseTry=0;$releaseTry -lt 30;$releaseTry++){if((Invoke-StageDocker @('exec',$releaseSilo,'silo','healthcheck','ready') -AllowFailure).code -eq 0){$releaseSiloReady=$true;break};Start-Sleep -Seconds 1}
if(!$releaseSiloReady){throw 'Isolated Silo not ready'}
$releaseMediaMetadata=Get-ChildItem -LiteralPath $releaseManifest.out -Filter 'encrypted-backup-media-*.json' | Sort-Object Name -Descending | Select-Object -First 1 | Get-Content -Raw | ConvertFrom-Json
$releaseMedia=[System.Security.Cryptography.ProtectedData]::Unprotect([System.IO.File]::ReadAllBytes($releaseMediaMetadata.privateEncryptedArtifact),$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)
if([Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($releaseMedia)).ToLowerInvariant() -ne $releaseMediaMetadata.originalSha256){throw 'Media checksum mismatch'}
$releaseScriptPath=Join-Path $PSScriptRoot 'admin-hardening-media-restore.cjs'
$releaseMediaResult=Invoke-StageDocker @('run','--rm','-i','--network',('container:'+$releaseStage),'-e',('DATABASE_URL='+$releaseDbUrl),'-e','REZONA_STAGE_ACCESS_KEY','-e','REZONA_STAGE_SECRET','-e','NODE_PATH=/app/node_modules','--mount',('type=bind,source='+$releaseScriptPath+',target=/tmp/media-restore.cjs,readonly'),'--entrypoint','node',$releaseImage,'/tmp/media-restore.cjs') $releaseMedia $releaseStageEnv
[Array]::Clear($releaseMedia,0,$releaseMedia.Length);$releaseStageSecret=$null
Save-StageEvidence 'silo-fresh-media-restore-evaluation.json' ($releaseMediaResult.stdout | ConvertFrom-Json)
Write-Output 'Fresh clone preserved at19; 21 migrations tested on a separate diagnostic copy; business counts preserved; Silo media evaluation completed. Historical checksum mismatch still blocks production. No deployment.'
