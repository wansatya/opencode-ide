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

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Installing OpenCode IDE (Windows)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Git is required. Install Git from https://git-scm.com" -ForegroundColor Red
    exit 1
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Node.js 20+ is required. Install Node.js from https://nodejs.org" -ForegroundColor Red
    exit 1
}

$nodeMajor = node -p 'process.versions.node.split(".")[0]'
if ([int]$nodeMajor -lt 20) {
    Write-Host "Error: Node.js 20+ is required (found Node $(node -v)). Please upgrade at https://nodejs.org" -ForegroundColor Red
    exit 1
}

if (Test-Path $InstallDir) {
    Write-Host "Removing previous installation at $InstallDir..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $InstallDir
}

Write-Host "Cloning $RepoUrl -> $InstallDir..." -ForegroundColor Green
git clone --depth 1 $RepoUrl $InstallDir

Write-Host "Installing dependencies..." -ForegroundColor Green
Set-Location $InstallDir
npm install

if (-not $NoBuild) {
    Write-Host "Building OpenCode IDE web & bridge apps..." -ForegroundColor Green
    npm run build
}

if (-not (Test-Path $BinDir)) {
    New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
}

# Create Windows Launcher wrappers for CMD, PowerShell & Bash
$cmdPath = Join-Path $BinDir "cockpit.cmd"
Set-Content -Path $cmdPath -Value "@echo off`r`nbash `"%~dp0cockpit`" %*" -Encoding ASCII

$psPath = Join-Path $BinDir "cockpit.ps1"
Set-Content -Path $psPath -Value "& bash `"`$PSScriptRoot/cockpit`" `$args" -Encoding ASCII

$bashLauncher = Join-Path $BinDir "cockpit"
Copy-Item -Force (Join-Path $InstallDir "bin\cockpit") $bashLauncher

Write-Host ""
Write-Host "Done! OpenCode IDE has been installed." -ForegroundColor Green
Write-Host "Start OpenCode IDE:" -ForegroundColor Yellow
Write-Host "  cockpit start C:\projects\my-app" -ForegroundColor Cyan
