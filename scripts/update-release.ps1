<#
.SYNOPSIS
  Applies a verified Sonderr release update on Windows.
.DESCRIPTION
  PowerShell counterpart to scripts/update-release.sh. Waits for the old
  process to exit, clones the verified tag, installs locked dependencies,
  swaps it into the managed install path with a timestamped backup, and
  restarts the localhost app after a health check. Never touches source
  checkouts or development installs.
.PARAMETER Tag
  Release tag to install (e.g. v1.6.1).
.PARAMETER Port
  Localhost port the previous app was serving.
.PARAMETER OldPid
  PID of the previous app process (0 to skip waiting).
.PARAMETER Workspace
  Working directory to run from.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Tag,
  [Parameter(Mandatory = $true)][int]$Port,
  [Parameter(Mandatory = $true)][int]$OldPid,
  [string]$Workspace = $HOME
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Repository = "https://github.com/dxn111/sonderr.git"
$baseHome = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { $HOME }
$dataHome = if ($env:XDG_DATA_HOME) { $env:XDG_DATA_HOME } else { $baseHome }
$expectedInstall = if ($env:SONDERR_INSTALL_DIR) { $env:SONDERR_INSTALL_DIR } else { Join-Path $dataHome "sonderr-v1.5" }
$installDir = if ($env:SONDERR_UPDATE_INSTALL_DIR) { $env:SONDERR_UPDATE_INSTALL_DIR } else { $expectedInstall }
$logDir = if ($env:SONDERR_UPDATE_LOG_DIR) { $env:SONDERR_UPDATE_LOG_DIR } else { Join-Path $HOME ".sonderr" }
$logFile = Join-Path $logDir "update.log"
$tempDir = ""
$backupDir = ""
$newPid = 0
$swapped = $false

function Write-Log([string]$Message) {
  Add-Content -Path $logFile -Value $Message -ErrorAction SilentlyContinue
}
function Fail([string]$Message) {
  Write-Error $Message
  Write-Log "Update failed: $Message"
  exit 1
}

if ($installDir -ne $expectedInstall) { Fail "target install path does not match the official install location" }
if ($Tag -notmatch "^v[0-9]+\.[0-9]+\.[0-9]+$") { Fail "invalid release tag" }
if ($Port -lt 1 -or $Port -gt 65535) { Fail "invalid local port" }
if ($OldPid -lt 0) { Fail "invalid running process id" }
if (-not (Test-Path (Join-Path $installDir "package.json")) -or -not (Test-Path (Join-Path $installDir "bin\sonderr-1.5.js"))) {
  Fail "managed Sonderr install was not found"
}
if ((node -p "require(process.argv[1]).name" "$installDir\package.json").Trim() -ne "sonderr-v1.5") {
  Fail "install target is not Sonderr"
}
if (-not (Test-Path $Workspace -PathType Container)) { $Workspace = $HOME }
Set-Location $Workspace

New-Item -ItemType Directory -Force -Path $logDir, $dataHome | Out-Null
Set-Content -Path $logFile -Value "" -ErrorAction SilentlyContinue
$tempDir = Join-Path $dataHome (".sonderr-update." + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

function Restart-App {
  if ((Test-Path (Join-Path $installDir "bin\sonderr-1.5.js"))) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "node"
    $psi.Arguments = "`"$installDir\bin\sonderr-1.5.js`" --no-open --port $Port"
    $psi.WorkingDirectory = $installDir
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $proc = [System.Diagnostics.Process]::Start($psi)
    $script:newPid = $proc.Id
  }
}
function Restore-AndRestart {
  try {
    if ($script:newPid -gt 0) {
      $p = Get-Process -Id $script:newPid -ErrorAction SilentlyContinue
      if ($p) { Stop-Process -Id $script:newPid -Force -ErrorAction SilentlyContinue }
    }
  } catch {}
  if ($script:swapped -and $script:backupDir -and (Test-Path $script:backupDir)) {
    try {
      if (Test-Path $installDir) { Move-Item $installDir (Join-Path $tempDir "failed-install") -Force }
      Move-Item $script:backupDir $installDir -Force
      $script:swapped = $false
    } catch { Write-Log "Restore failed: $_" }
  }
  Restart-App
}

try {
  Write-Log "Waiting for the old Sonderr process to stop..."
  $waited = 0
  while ($OldPid -ne 0 -and (Get-Process -Id $OldPid -ErrorAction SilentlyContinue)) {
    if ($waited -ge 480) { Fail "old Sonderr process did not stop" }
    Start-Sleep -Milliseconds 250
    $waited++
  }

  Write-Log "Downloading verified release tag $Tag..."
  git clone --depth 1 --branch $Tag --single-branch $Repository (Join-Path $tempDir "source") *>> $logFile
  if ($LASTEXITCODE -ne 0) { Fail "could not download the official release" }
  $packageName = (node -p "require(process.argv[1]).name" "$tempDir\source\package.json").Trim()
  $packageVersion = (node -p "require(process.argv[1]).version" "$tempDir\source\package.json").Trim()
  if ($packageName -ne "sonderr-v1.5" -or $Tag.TrimStart("v") -ne $packageVersion) {
    Fail "downloaded release version did not match the verified tag"
  }
  npm --prefix (Join-Path $tempDir "source") ci --omit=dev *>> $logFile
  if ($LASTEXITCODE -ne 0) { Fail "dependency installation failed" }

  $stamp = Get-Date -Format "yyyyMMddHHmmss"
  $script:backupDir = "$installDir.backup.$stamp"
  if (Test-Path $script:backupDir) { Fail "backup path already exists" }
  Move-Item $installDir $script:backupDir
  $script:swapped = $true
  try {
    Move-Item (Join-Path $tempDir "source") $installDir
  } catch {
    try { Move-Item $script:backupDir $installDir -Force } catch {}
    $script:swapped = $false
    Fail "could not activate the downloaded release"
  }

  Write-Log "Waiting for the updated app on localhost..."
  $started = $false
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 5
      if ($health.version -eq $packageVersion) { $started = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 500
  }
  if (-not $started) {
    Write-Log "Starting Sonderr v$packageVersion on localhost..."
    Restart-App
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
      try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 5
        if ($health.version -eq $packageVersion) { $started = $true; break }
      } catch {}
      $p = Get-Process -Id $script:newPid -ErrorAction SilentlyContinue
      if (-not $p) { break }
      Start-Sleep -Milliseconds 500
    }
  }
  if (-not $started) { Fail "updated app did not pass its localhost health check" }

  $script:swapped = $false
  $script:newPid = 0
  Write-Log "Update to Sonderr v$packageVersion completed. Previous install preserved at $script:backupDir"
  exit 0
} catch {
  $msg = $_.Exception.Message
  if ($msg -notmatch "^Update failed") {
    Restore-AndRestart
    Fail $msg
  }
  Restore-AndRestart
  exit 1
} finally {
  if ($tempDir -and (Test-Path $tempDir)) { Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue }
}
