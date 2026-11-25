param([ValidateSet('full','definitions-only','continuity-only')][string]$Mode='full')
$ErrorActionPreference='Stop'
$phase91Lines=@((Get-Clipboard -Raw) -split '\r?\n'|ForEach-Object{$_.Trim()}|Where-Object{$_})
if($phase91Lines.Count-ne 3 -or $phase91Lines[0]-ne '217.76.54.57' -or $phase91Lines[1]-ne 'root'){throw 'Matching owner clipboard unavailable; no connection attempted.'}
$phase91Info=[System.Diagnostics.ProcessStartInfo]::new((Get-Command node.exe).Source)
$phase91Info.UseShellExecute=$false;$phase91Info.CreateNoWindow=$true
$phase91Info.WorkingDirectory=$PSScriptRoot;$phase91Info.RedirectStandardInput=$true;$phase91Info.RedirectStandardOutput=$true;$phase91Info.RedirectStandardError=$true
$phase91Info.ArgumentList.Add((Join-Path $PSScriptRoot 'phase91-server-preflight.cjs'))
$phase91Info.ArgumentList.Add($Mode)
$phase91Process=[System.Diagnostics.Process]::Start($phase91Info)
$phase91Process.StandardInput.WriteLine($phase91Lines[2]);$phase91Process.StandardInput.Close();$phase91Lines=$null
$phase91Error=$phase91Process.StandardError.ReadToEndAsync()
while(!$phase91Process.StandardOutput.EndOfStream){$phase91Process.StandardOutput.ReadLine()}
$phase91Process.WaitForExit()
if($phase91Process.ExitCode-ne 0){throw 'Read-only preflight incomplete; sanitized evidence retained, no provisioning.'}
