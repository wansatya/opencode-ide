# OpenCode IDE Windows PowerShell Installer
# Usage in PowerShell:
#   iwr -useb https://raw.githubusercontent.com/wansatya/opencode-ide/main/install.ps1 | iex

param (
    [string]$RepoUrl = "https://github.com/wansatya/opencode-ide.git",
    [string]$InstallDir = "$HOME\.opencode-ide",
    [string]$BinDir = "$HOME\.local\bin",
    [switch]$NoBuild
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  ██████   ██████  ███████ ███    ██  ██████  ██████  ██████  ███████   ██████  ██████  ███████" -ForegroundColor White
Write-Host " ██    ██  ██   ██ ██      ████   ██ ██      ██    ██ ██   ██ ██          ██    ██   ██ ██     " -ForegroundColor White
Write-Host " ██    ██  ██████  █████   ██ ██  ██ ██      ██    ██ ██   ██ █████       ██    ██   ██ █████  " -ForegroundColor White
Write-Host " ██    ██  ██      ██      ██  ██ ██ ██      ██    ██ ██   ██ ██          ██    ██   ██ ██     " -ForegroundColor White
Write-Host "  ██████   ██      ███████ ██   ████  ██████  ██████  ██████  ███████   ██████  ██████  ███████" -ForegroundColor White
Write-Host ""
Write-Host " Next-Gen Web IDE & Developer Control Center" -ForegroundColor White
Write-Host ""
Write-Host " ┌── RECOMMENDED ──────────────────────────────────────────────────────────────┐" -ForegroundColor Green
Write-Host " │ > cockpit start .          Next-Gen Web IDE (Windows)         Press Enter ↵ │" -ForegroundColor Green
Write-Host " └─────────────────────────────────────────────────────────────────────────────┘" -ForegroundColor Green
Write-Host ""
Write-Host " ↓ See all commands: cockpit start [path] [--prod] [--no-branch]" -ForegroundColor Gray
Write-Host " ✦ Includes Monaco Editor, Real-Time Git Cockpit & Session Auto-Branching" -ForegroundColor Gray
Write-Host ""

$logFile = Join-Path $env:TEMP "opencode-install.log"
"=== OpenCode IDE Installation Log $(Get-Date) ===" | Out-File -FilePath $logFile -Encoding utf8

function Invoke-InstallStep {
    param (
        [int]$StepNum,
        [int]$TotalSteps,
        [string]$Title,
        [scriptblock]$Action
    )
    $startTime = Get-Date
    Write-Host -NoNewline " "
    Write-Host "✦" -ForegroundColor Green -NoNewline
    Write-Host " [$StepNum/$TotalSteps] " -ForegroundColor White -NoNewline
    Write-Host "$Title..." -ForegroundColor White -NoNewline

    try {
        & $Action *>> $logFile
        $duration = [math]::Round(((Get-Date) - $startTime).TotalSeconds)
        Write-Host "`r " -NoNewline
        Write-Host "✔" -ForegroundColor Green -NoNewline
        Write-Host " [$StepNum/$TotalSteps] " -ForegroundColor White -NoNewline
        Write-Host "$Title " -ForegroundColor White -NoNewline
        Write-Host "(${duration}s)" -ForegroundColor Gray
    }
    catch {
        Write-Host "`r " -NoNewline
        Write-Host "✖" -ForegroundColor Red -NoNewline
        Write-Host " [$StepNum/$TotalSteps] " -ForegroundColor White -NoNewline
        Write-Host "$Title " -ForegroundColor Red -NoNewline
        Write-Host "FAILED" -ForegroundColor Red
        Write-Host "`nInstallation failed at step ${StepNum}: $Title" -ForegroundColor Red
        Write-Host "Log tail ($logFile):" -ForegroundColor Gray
        Get-Content $logFile -Tail 25
        exit 1
    }
}

$totalSteps = if ($NoBuild) { 4 } else { 5 }

Invoke-InstallStep 1 $totalSteps "Checking system environment" {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw "Git is required. Install Git from https://git-scm.com"
    }
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw "Node.js 20+ is required. Install Node.js from https://nodejs.org"
    }
    $nodeMajor = node -p 'process.versions.node.split(".")[0]'
    if ([int]$nodeMajor -lt 20) {
        throw "Node.js 20+ is required (found Node $(node -v)). Please upgrade at https://nodejs.org"
    }
}

Invoke-InstallStep 2 $totalSteps "Cloning repository into $InstallDir" {
    if (Test-Path $InstallDir) {
        Remove-Item -Recurse -Force $InstallDir
    }
    git clone --depth 1 $RepoUrl $InstallDir
}

Invoke-InstallStep 3 $totalSteps "Installing workspace dependencies" {
    Set-Location $InstallDir
    npm install
}

$stepIdx = 4
if (-not $NoBuild) {
    Invoke-InstallStep 4 $totalSteps "Building production web & bridge apps" {
        Set-Location $InstallDir
        npm run build
    }
    $stepIdx = 5
}

Invoke-InstallStep $stepIdx $totalSteps "Configuring launcher binaries in $BinDir" {
    if (-not (Test-Path $BinDir)) {
        New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
    }
    $cmdPath = Join-Path $BinDir "cockpit.cmd"
    Set-Content -Path $cmdPath -Value "@echo off`r`nbash `"%~dp0cockpit`" %*" -Encoding ASCII

    $psPath = Join-Path $BinDir "cockpit.ps1"
    Set-Content -Path $psPath -Value "& bash `"`$PSScriptRoot/cockpit`" `$args" -Encoding ASCII

    $bashLauncher = Join-Path $BinDir "cockpit"
    Copy-Item -Force (Join-Path $InstallDir "bin\cockpit") $bashLauncher
}

Write-Host ""
Write-Host "Done! OpenCode IDE has been successfully installed." -ForegroundColor Green
Write-Host ""
Write-Host "Start OpenCode IDE:" -ForegroundColor Yellow
Write-Host "  cockpit start C:\projects\my-app" -ForegroundColor Green
Write-Host ""
