param([ValidateSet('create','build')][string]$Mode = 'create')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security.Cryptography.ProtectedData
$releaseManifest = Get-Content -LiteralPath ((Get-Content -LiteralPath 'D:\rezona-admin-hardening\active.json' -Raw | ConvertFrom-Json).manifest) -Raw | ConvertFrom-Json
$releaseSigningDir = 'C:\Users\3ma\Documents\aboessa-secrets\rezona-admin-release'
$releaseSecretFile = Join-Path $releaseSigningDir 'signing.dpapi'
$releaseMetadataFile = Join-Path $releaseSigningDir 'signing-metadata.json'
$releaseJava = 'C:\Program Files\Android\Android Studio\jbr'
function Invoke-ReleaseProcess([string]$Exe,[string[]]$Arguments,[hashtable]$Environment,[string]$WorkingDirectory,[string]$Log) {
  $releaseInfo = [System.Diagnostics.ProcessStartInfo]::new($Exe)
  $releaseInfo.UseShellExecute = $false; $releaseInfo.CreateNoWindow = $true
  $releaseInfo.RedirectStandardOutput = $true; $releaseInfo.RedirectStandardError = $true
  $releaseInfo.WorkingDirectory = $WorkingDirectory
  foreach ($releaseArgument in $Arguments) { $releaseInfo.ArgumentList.Add($releaseArgument) }
  foreach ($releaseEntry in $Environment.GetEnumerator()) { $releaseInfo.Environment[$releaseEntry.Key] = $releaseEntry.Value }
  foreach ($releaseName in @('FAL_KEY','GEMINI_API_KEY','GOOGLE_API_KEY','REZONA_PHASE5_QA','REZONA_PHASE6_QA','REZONA_PHASE7_QA','REAL_PRODUCT_STUDIO_QA')) { $null = $releaseInfo.Environment.Remove($releaseName) }
  $releaseProcess = [System.Diagnostics.Process]::Start($releaseInfo)
  $releaseStdout = $releaseProcess.StandardOutput.ReadToEndAsync(); $releaseStderr = $releaseProcess.StandardError.ReadToEndAsync()
  $releaseProcess.WaitForExit(); $releaseText = $releaseStdout.GetAwaiter().GetResult()+"`n"+$releaseStderr.GetAwaiter().GetResult()
  foreach ($releaseEntry in $Environment.GetEnumerator()) { if ($releaseEntry.Key -match 'PASSWORD' -and $releaseEntry.Value) { $releaseText = $releaseText.Replace([string]$releaseEntry.Value,'[REDACTED]') } }
  if (Test-Path -LiteralPath $Log) { throw 'Refusing log overwrite' }
  [System.IO.File]::WriteAllText($Log,$releaseText)
  if ($releaseProcess.ExitCode -ne 0) { throw "Release process failed; inspect sanitized log. Exit: $($releaseProcess.ExitCode)" }
  return $releaseText
}
if ($Mode -eq 'create') {
  if (Test-Path -LiteralPath $releaseSigningDir) { throw 'Refusing to replace an existing signing directory' }
  $null = New-Item -ItemType Directory -Path $releaseSigningDir
  $releaseAcl = [System.Security.AccessControl.DirectorySecurity]::new()
  $releaseAcl.SetAccessRuleProtection($true,$false)
  foreach ($releasePrincipal in @([System.Security.Principal.WindowsIdentity]::GetCurrent().User,[System.Security.Principal.SecurityIdentifier]::new('S-1-5-18'),[System.Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))) {
    $releaseAcl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($releasePrincipal,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
  }
  Set-Acl -LiteralPath $releaseSigningDir -AclObject $releaseAcl
  $releasePassword = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(36))
  $releaseKeystore = Join-Path $releaseSigningDir 'rezona-admin-production.jks'
  $releaseAlias = 'rezona_admin_production'
  $null = Invoke-ReleaseProcess (Join-Path $releaseJava 'bin\keytool.exe') @('-genkeypair','-noprompt','-alias',$releaseAlias,'-keyalg','RSA','-keysize','4096','-validity','10000','-storetype','PKCS12','-keystore',$releaseKeystore,'-storepass:env','REZONA_ADMIN_SIGN_PASSWORD','-keypass:env','REZONA_ADMIN_SIGN_PASSWORD','-dname','CN=REZONA Admin, OU=Release, O=REZONA') @{REZONA_ADMIN_SIGN_PASSWORD=$releasePassword} $releaseSigningDir (Join-Path $releaseManifest.dir 'keytool-create-sanitized.log')
  $releaseSecret = @{keystore=$releaseKeystore;alias=$releaseAlias;password=$releasePassword} | ConvertTo-Json -Compress
  $releaseBytes = [System.Text.Encoding]::UTF8.GetBytes($releaseSecret)
  [System.IO.File]::WriteAllBytes($releaseSecretFile,[System.Security.Cryptography.ProtectedData]::Protect($releaseBytes,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser))
  [Array]::Clear($releaseBytes,0,$releaseBytes.Length)
  $releaseMetadata = @{createdAt=[DateTime]::UtcNow.ToString('o');package='com.singlestore.admin_app';purpose='Owner-approved NEW Admin production identity; incompatible with historic debug signature';keystore=$releaseKeystore;alias=$releaseAlias;algorithm='RSA4096';passwordProtection='Windows DPAPI CurrentUser';oldDebugKeyReused=$false;productionInstall=$false}
  [System.IO.File]::WriteAllText($releaseMetadataFile,($releaseMetadata | ConvertTo-Json))
  $releasePassword=$releaseSecret=$null
  Write-Output 'Admin production key created outside Git. Password protected with Windows DPAPI; no device installation.'
} else {
  $releaseSecretBytes = [System.Security.Cryptography.ProtectedData]::Unprotect([System.IO.File]::ReadAllBytes($releaseSecretFile),$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)
  $releaseSigning = [System.Text.Encoding]::UTF8.GetString($releaseSecretBytes) | ConvertFrom-Json
  [Array]::Clear($releaseSecretBytes,0,$releaseSecretBytes.Length)
  $releaseApp = 'C:\Users\3ma\Documents\aboessa\AboEssaMobile\apps\admin_app'
  $releaseOldApk = Join-Path $releaseApp 'build\app\outputs\flutter-apk\app-release.apk'
  $releaseOldBackup = Join-Path $releaseManifest.dir 'prior-debug-signed-admin.apk'
  if ((Test-Path -LiteralPath $releaseOldApk) -and !(Test-Path -LiteralPath $releaseOldBackup)) { Copy-Item -LiteralPath $releaseOldApk -Destination $releaseOldBackup }
  $releaseEnvironment = @{JAVA_HOME=$releaseJava;ABOESSA_KEYSTORE_PATH=$releaseSigning.keystore;ABOESSA_KEYSTORE_PASSWORD=$releaseSigning.password;ABOESSA_KEY_ALIAS=$releaseSigning.alias;ABOESSA_KEY_PASSWORD=$releaseSigning.password}
  $releaseLog = Join-Path $releaseManifest.out ('admin-signed-build-'+[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+'.log')
  # Flutter 3.44 skips release plugin-registry regeneration with --no-pub.
  # Frozen offline pub-get has already run. Allow cached pub-get here so the
  # tool removes native dev-only registrations; never patch the SDK or Java file.
  $releaseLock = 'C:\Users\3ma\Documents\aboessa\AboEssaMobile\pubspec.lock'
  $releaseLockHash = (Get-FileHash -LiteralPath $releaseLock -Algorithm SHA256).Hash
  $null = Invoke-ReleaseProcess 'cmd.exe' @('/d','/c','C:\Users\3ma\develop\flutter\bin\flutter.bat','build','apk','--release','--target','lib/main.dart','--build-name=1.1.0','--build-number=3','--dart-define=APP_ENV=production','--dart-define=API_BASE_URL=https://shanasheel.tavrixllc.com','--dart-define=SOCKET_URL=https://shanasheel.tavrixllc.com') $releaseEnvironment $releaseApp $releaseLog
  if ((Get-FileHash -LiteralPath $releaseLock -Algorithm SHA256).Hash -ne $releaseLockHash) { throw 'Dependency lockfile changed; do not distribute this build.' }
  $releaseArtifact = Join-Path $releaseManifest.dir 'rezona-admin-v1.1.0-3-production.apk'
  if (Test-Path -LiteralPath $releaseArtifact) { throw 'Refusing artifact overwrite' }
  Copy-Item -LiteralPath $releaseOldApk -Destination $releaseArtifact
  $releaseSigning.password=$null
  Write-Output ('Signed Admin APK built privately; SHA256: '+(Get-FileHash -LiteralPath $releaseArtifact -Algorithm SHA256).Hash)
}
