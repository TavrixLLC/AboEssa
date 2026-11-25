param([ValidateSet('full','redis-only')][string]$Mode = 'full')
$ErrorActionPreference = 'Stop'
# Read owner clipboard directly into a child stdin; no plaintext auth file,
# argument, environment secret, transcript or credential output is created.
$capacityLines = @((Get-Clipboard -Raw) -split '\r?\n' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($capacityLines.Count -ne 3 -or $capacityLines[0] -ne '217.76.54.57' -or $capacityLines[1] -ne 'root') {
  throw 'Matching owner clipboard not available. Nothing connected or printed.'
}
$capacityInfo = [System.Diagnostics.ProcessStartInfo]::new((Get-Command node.exe).Source)
$capacityInfo.UseShellExecute = $false
$capacityInfo.CreateNoWindow = $true
$capacityInfo.WorkingDirectory = $PSScriptRoot
$capacityInfo.RedirectStandardInput = $true
$capacityInfo.RedirectStandardOutput = $true
$capacityInfo.RedirectStandardError = $true
$capacityInfo.ArgumentList.Add((Join-Path $PSScriptRoot 'phase9-capacity-readonly.cjs'))
$capacityInfo.ArgumentList.Add($Mode)
$capacityProcess = [System.Diagnostics.Process]::Start($capacityInfo)
$capacityProcess.StandardInput.WriteLine($capacityLines[2])
$capacityProcess.StandardInput.Close()
$capacityLines = $null
$capacityErr = $capacityProcess.StandardError.ReadToEndAsync()
while (!$capacityProcess.StandardOutput.EndOfStream) {
  $capacityProcess.StandardOutput.ReadLine()
}
$capacityProcess.WaitForExit()
if ($capacityProcess.ExitCode -ne 0) {
  throw 'Bounded read-only collector did not complete. See sanitized evidence; no deployment attempted.'
}
