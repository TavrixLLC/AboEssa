param([ValidateSet('baseline','schema')][string]$Mode='baseline')
$ErrorActionPreference='Stop'
$releaseManifest=Get-Content -LiteralPath ((Get-Content -LiteralPath 'D:\rezona-admin-hardening\active.json' -Raw | ConvertFrom-Json).manifest) -Raw | ConvertFrom-Json
$releaseKnown=@(& 'C:\Windows\System32\OpenSSH\ssh-keygen.exe' -F '217.76.54.57' -f 'C:\Users\3ma\.ssh\known_hosts') | Where-Object { $_ -match ' ssh-ed25519 ' } | Select-Object -First 1
if (!$releaseKnown) { throw 'Trusted stored ED25519 host key not found; refusing password authentication.' }
$releasePublicKey=Join-Path $releaseManifest.dir 'trusted-server-ed25519.pub'
if (!(Test-Path -LiteralPath $releasePublicKey)) { [System.IO.File]::WriteAllText($releasePublicKey,$releaseKnown+"`n") }
$releaseFingerprint=(& 'C:\Windows\System32\OpenSSH\ssh-keygen.exe' -lf $releasePublicKey) -split ' ' | Where-Object { $_ -like 'SHA256:*' } | Select-Object -First 1
if (!$releaseFingerprint) { throw 'Missing trusted host fingerprint' }
# Password is never an argument, log line or committed file. It is read only
# from the clipboard that matches the owner-provided host/user exactly.
$releaseClipboardLines=@((Get-Clipboard -Raw) -split '\r?\n' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($releaseClipboardLines.Count -ne 3 -or $releaseClipboardLines[0] -ne '217.76.54.57' -or $releaseClipboardLines[1] -ne 'root') { throw 'Owner-provided clipboard is no longer available; do not paste password into tool arguments.' }
$releaseTempDir=Join-Path $releaseManifest.dir 'ssh-auth-temporary'
if (!(Test-Path -LiteralPath $releaseTempDir)) {
  $null=New-Item -ItemType Directory -Path $releaseTempDir
  $releaseAcl=[System.Security.AccessControl.DirectorySecurity]::new();$releaseAcl.SetAccessRuleProtection($true,$false)
  $releaseAcl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new([System.Security.Principal.WindowsIdentity]::GetCurrent().User,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
  Set-Acl -LiteralPath $releaseTempDir -AclObject $releaseAcl
}
$releasePassFile=Join-Path $releaseTempDir ([Guid]::NewGuid().ToString('N')+'.txt')
$releasePasswordBytes=[System.Text.Encoding]::UTF8.GetBytes($releaseClipboardLines[2]+"`n")
$releaseSecretStream=[System.IO.FileStream]::new($releasePassFile,[System.IO.FileMode]::CreateNew,[System.IO.FileAccess]::ReadWrite,[System.IO.FileShare]::None)
try {
  $releaseSecretStream.Write($releasePasswordBytes,0,$releasePasswordBytes.Length);$releaseSecretStream.Flush()
  $releaseSecretStream.Dispose()
  [Array]::Clear($releasePasswordBytes,0,$releasePasswordBytes.Length)
  $releaseCommands=@{
    baseline="set -eu; printf 'OS '; uname -srm; printf 'USER '; id -un; printf 'RELEASE '; readlink -f /opt/aboessa/current; docker ps --format '{{.Names}} {{.Image}} {{.Status}}'; printf 'DISK '; df -Pk /opt/aboessa | tail -1"
    schema="set -eu; cd /opt/aboessa/current; printf 'COMPOSE_FILES '; find . -maxdepth 1 -name '*compose*' -type f -printf '%f '; printf '\n'; printf 'SOURCE_VERSION '; node --version 2>/dev/null || true; docker ps --format '{{.Names}} {{.Image}}'"
  }
  $releaseInfo=[System.Diagnostics.ProcessStartInfo]::new('C:\Program Files\PuTTY\plink.exe');$releaseInfo.UseShellExecute=$false;$releaseInfo.CreateNoWindow=$true;$releaseInfo.RedirectStandardOutput=$true;$releaseInfo.RedirectStandardError=$true
  foreach($releaseArg in @('-batch','-ssh','-T','-noagent','-hostkey',$releaseFingerprint,'-l','root','-P','22','-pwfile',$releasePassFile,'217.76.54.57',$releaseCommands[$Mode])){$releaseInfo.ArgumentList.Add($releaseArg)}
  $releaseProcess=[System.Diagnostics.Process]::Start($releaseInfo);$releaseOut=$releaseProcess.StandardOutput.ReadToEndAsync();$releaseErr=$releaseProcess.StandardError.ReadToEndAsync()
  if (!$releaseProcess.WaitForExit(60000)) { $releaseProcess.Kill();throw 'Read-only SSH command timed out' }
  $releaseText=($releaseOut.GetAwaiter().GetResult()+"`n"+$releaseErr.GetAwaiter().GetResult()).Replace($releaseClipboardLines[2],'[REDACTED]')
  $releaseLog=Join-Path $releaseManifest.out ('server-readonly-'+$Mode+'-'+[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+'.log')
  [System.IO.File]::WriteAllText($releaseLog,$releaseText)
  if ($releaseProcess.ExitCode -ne 0) { throw "SSH failed (see sanitized log); exit $($releaseProcess.ExitCode)" }
  Write-Output $releaseText
} finally {
  $releaseSecretStream.Dispose();$releaseClipboardLines=$null
  # Only this new, validated task-specific credential file is removed.
  if ((Split-Path -Parent $releasePassFile) -ne $releaseTempDir) { throw 'Credential cleanup path mismatch' }
  if (Test-Path -LiteralPath $releasePassFile) { Remove-Item -LiteralPath $releasePassFile -Force }
}
