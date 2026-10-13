#Requires -Version 5.1
<#
.SYNOPSIS
  Installs Sonderr on Windows without administrator rights.
.DESCRIPTION
  Clones the latest main source, installs locked Node dependencies, and
  creates a `sonderr.cmd` shim. Mirrors install.sh behavior:
  refuses to overwrite non-Sonderr paths and preserves reinstalls as
  timestamped backups.
.EXAMPLE
  irm https://raw.githubusercontent.com/dxn111/sonderr/main/install.ps1 | iex
#>
[CmdletBinding()]
param(
  [string]$Branch = $env:SONDERR_BRANCH,
  [string]$Repository = "https://github.com/dxn111/sonderr.git"
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Branch)) { $Branch = "main" }
$baseHome = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { [Environment]::GetFolderPath("LocalApplicationData") }
if ([string]::IsNullOrWhiteSpace($baseHome)) { $baseHome = $HOME }
$dataHome = if ($env:XDG_DATA_HOME) { $env:XDG_DATA_HOME } else { $baseHome }
$binDir = if ($env:SONDERR_BIN_DIR) { $env:SONDERR_BIN_DIR } else { Join-Path $HOME ".local\bin" }
$installDir = if ($env:SONDERR_INSTALL_DIR) { $env:SONDERR_INSTALL_DIR } else { Join-Path $dataHome "sonderr-v1.5" }
$commandPath = Join-Path $binDir "sonderr.cmd"

foreach ($cmd in @("git", "node", "npm")) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    Write-Error "Missing required command: $cmd. Install Node.js 20+ (which includes npm) and Git for Windows first."
    exit 1
  }
}

$nodeMajor = [int]((node -p "Number(process.versions.node.split('.')[0])").Trim())
if ($nodeMajor -lt 20) {
  Write-Error ("Sonderr requires Node.js 20 or newer (found {0})." -f (node --version))
  exit 1
}

if ((Test-Path $installDir) -and (-not (Test-Path (Join-Path $installDir "package.json")) -or -not (Test-Path (Join-Path $installDir "bin\sonderr-1.5.js")))) {
  Write-Error "Install path exists but does not look like a Sonderr installation; refusing to replace it: $installDir"
  exit 1
}
if (Test-Path (Join-Path $installDir "package.json")) {
  $installedName = node -p "require(process.argv[1]).name" "$installDir\package.json"
  if ($installedName.Trim() -ne "sonderr-v1.5") {
    Write-Error "Install path belongs to a different package; refusing to replace it: $installDir"
    exit 1
  }
}
if (Test-Path $commandPath) {
  Write-Error "Command path already exists; refusing to replace it: $commandPath"
  exit 1
}

New-Item -ItemType Directory -Force -Path $dataHome, $binDir | Out-Null
$tempDir = Join-Path $dataHome (".sonderr-install." + [Guid]::NewGuid().ToString("N"))
try {
  Write-Host "Downloading Sonderr from $Repository ($Branch)..."
  git clone --depth 1 --branch $Branch $Repository (Join-Path $tempDir "source")
  if ($LASTEXITCODE -ne 0) { throw "git clone failed" }
  Write-Host "Installing Node dependencies..."
  npm --prefix (Join-Path $tempDir "source") ci --omit=dev
  if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }

  $backupDir = ""
  if (Test-Path $installDir) {
    $stamp = Get-Date -Format "yyyyMMddHHmmss"
    $backupDir = "$installDir.backup.$stamp"
    if (Test-Path $backupDir) { throw "Backup path already exists; refusing to replace it: $backupDir" }
    Move-Item $installDir $backupDir
  }
  try {
    Move-Item (Join-Path $tempDir "source") $installDir
  } catch {
    if ($backupDir -and (Test-Path $backupDir)) { Move-Item $backupDir $installDir -ErrorAction SilentlyContinue }
    throw "Could not move the downloaded install into place: $_"
  }

  Set-Content -Path $commandPath -Value "@echo off`r`nnode `"$installDir\bin\sonderr-1.5.js`" %*`r`n" -Encoding Ascii

  Write-Host ""
  Write-Host "Sonderr installed. Start it with: sonderr"
  if ($backupDir) { Write-Host "Previous install preserved at: $backupDir" }
  $pathEntries = ($env:PATH -split ";") | ForEach-Object { $_.TrimEnd("\") }
  if ($pathEntries -notcontains $binDir.TrimEnd("\")) {
    Write-Host "Add $binDir to your PATH to use the command from any terminal."
    Write-Host '  [Environment]::SetEnvironmentVariable("PATH", $env:PATH + ";' + $binDir + '", "User")'
  }
} finally {
  if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue }
}
