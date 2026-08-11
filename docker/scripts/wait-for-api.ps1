param(
  [string]$Url = "http://localhost:8080/health",
  [int]$TimeoutSeconds = 60
)

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
do {
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
      Write-Host "API is healthy at $Url"
      exit 0
    }
  } catch {
    Start-Sleep -Seconds 2
  }
} while ((Get-Date) -lt $deadline)

Write-Error "API did not become healthy within $TimeoutSeconds seconds"
exit 1
