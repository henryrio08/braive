param([switch]$InstallOnPhone)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
function Run-Check([string]$Program, [string[]]$Arguments) {
  & $Program @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Verification failed: $Program" }
}
Push-Location $projectRoot
try {
  Run-Check 'python' @('scripts/generate-project.py')
  Push-Location (Join-Path $projectRoot 'backend')
  try {
    Run-Check 'npm' @('run','check')
    Run-Check 'npm' @('test')
  } finally { Pop-Location }
  if ($InstallOnPhone) {
    Run-Check 'docker' @('exec','braive-xtool-ready','sh','-lc','cd /work && USBMUXD_SOCKET_ADDRESS=host.docker.internal:27015 xtool dev run --usb')
  }
  Write-Host 'Automated checks passed. Complete the device acceptance checklist in docs/FINISH_IMPLEMENTATION.md before claiming completion.'
} finally { Pop-Location }
