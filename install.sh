#!/usr/bin/env bash
# OpenCode IDE Installer — Cross-Platform (macOS, Linux, Windows)
#
# Quick Install:
#   curl -fsSL https://raw.githubusercontent.com/wansatya/opencode-ide/main/install.sh | bash
#
# Custom Install Options (note the `-s --` passthrough):
#   curl -fsSL .../install.sh | bash -s -- --dir ~/my-ide --no-build
#
# Supported Operating Systems:
#   - macOS (Intel & Apple Silicon)
#   - Linux (Ubuntu, Debian, Fedora, Arch, Alpine, WSL)
#   - Windows (Git Bash, MSYS2, Cygwin, PowerShell, CMD)
#
# Env Overrides: COCKPIT_REPO_URL, COCKPIT_DIR, COCKPIT_BIN_DIR
set -euo pipefail

# Detect Operating System
OS_NAME="$(uname -s 2>/dev/null || echo "Unknown")"
case "$OS_NAME" in
  Darwin*)  PLATFORM="macOS" ;;
  Linux*)   PLATFORM="Linux" ;;
  MINGW*|MSYS*|CYGWIN*|Windows_NT*) PLATFORM="Windows" ;;
  *)        PLATFORM="$OS_NAME" ;;
esac

DEFAULT_INSTALL_DIR="$HOME/.opencode-ide"
DEFAULT_BIN_DIR="$HOME/.local/bin"

# On Windows Git Bash/MSYS, fallback to ~/bin if ~/.local/bin does not exist
if [ "$PLATFORM" = "Windows" ] && [ ! -d "$DEFAULT_BIN_DIR" ] && [ -d "$HOME/bin" ]; then
  DEFAULT_BIN_DIR="$HOME/bin"
fi

REPO_URL="${COCKPIT_REPO_URL:-https://github.com/wansatya/opencode-ide.git}"
INSTALL_DIR="${COCKPIT_DIR:-$DEFAULT_INSTALL_DIR}"
BIN_DIR="${COCKPIT_BIN_DIR:-$DEFAULT_BIN_DIR}"
WITH_BUILD=1

print_banner() {
  local G="\033[38;5;118m"
  local W="\033[1;97m"
  local DIM="\033[38;5;245m"
  local RESET="\033[0m"

  local pad1="           "
  local pad2="          "
  if [ "$PLATFORM" = "Windows" ]; then
    pad1="          "
    pad2="         "
  fi

  echo ""
  echo -e "${W}  ██████   ██████  ███████ ███    ██  ██████  ██████  ██████  ███████   ██████  ██████  ███████${RESET}"
  echo -e "${W} ██    ██  ██   ██ ██      ████   ██ ██      ██    ██ ██   ██ ██          ██    ██   ██ ██     ${RESET}"
  echo -e "${W} ██    ██  ██████  █████   ██ ██  ██ ██      ██    ██ ██   ██ █████       ██    ██   ██ █████  ${RESET}"
  echo -e "${W} ██    ██  ██      ██      ██  ██ ██ ██      ██    ██ ██   ██ ██          ██    ██   ██ ██     ${RESET}"
  echo -e "${W}  ██████   ██      ███████ ██   ████  ██████  ██████  ██████  ███████   ██████  ██████  ███████${RESET}"
  echo ""
  echo -e " ${W}Next-Gen Web IDE & Developer Control Center${RESET}"
  echo ""
  echo -e " ${G}┌── RECOMMENDED ──────────────────────────────────────────────────────────────┐${RESET}"
  echo -e " ${G}│${RESET} \033[1;32m>\033[0m ${W}cockpit start .${RESET}${pad1}\033[38;5;248mNext-Gen Web IDE (${PLATFORM})\033[0m${pad2}\033[1;32mPress Enter ↵${RESET} ${G}│${RESET}"
  echo -e " ${G}└─────────────────────────────────────────────────────────────────────────────┘${RESET}"
  echo ""
  echo -e " ${DIM}↓ See all commands: cockpit start [path] [--prod] [--no-branch]${RESET}"
  echo ""
  echo -e " ${DIM}✦ Includes Monaco Editor, Real-Time Git Cockpit & Session Auto-Branching${RESET}"
  echo ""
}

usage() {
  print_banner
  cat <<EOF
Usage:
  install.sh [--repo URL] [--dir PATH] [--bin-dir PATH] [--no-build]

Options:
  --repo URL     Git URL to clone (default: $REPO_URL)
  --dir PATH     Directory to clone into (default: $INSTALL_DIR)
  --bin-dir PATH Path to install executable link/launcher (default: $BIN_DIR)
  --no-build     Skip production build (use development server only)
  -h, --help     Show this help message
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO_URL="$2"; shift 2 ;;
    --dir) INSTALL_DIR="$2"; shift 2 ;;
    --bin-dir) BIN_DIR="$2"; shift 2 ;;
    --no-build) WITH_BUILD=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

print_banner

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required tool: $1" >&2
    case "$1" in
      node)
        echo "Install Node.js 20+ from https://nodejs.org" >&2
        if [ "$PLATFORM" = "macOS" ]; then
          echo "  (macOS tip: brew install node@20)" >&2
        fi
        ;;
      git)
        echo "Install Git from https://git-scm.com" >&2
        if [ "$PLATFORM" = "macOS" ]; then
          echo "  (macOS tip: brew install git)" >&2
        fi
        ;;
    esac
    exit 1
  }
}

need git
need node
need npm

# Enforce Node >= 20
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo "0")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js 20+ is required (found Node $(node -v)). Please upgrade from https://nodejs.org" >&2
  exit 1
fi

if [ -e "$INSTALL_DIR" ]; then
  echo "Removing previous installation at $INSTALL_DIR…"
  rm -rf "$INSTALL_DIR"
fi

echo "Cloning $REPO_URL → $INSTALL_DIR…"
git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"

echo "Installing workspace dependencies…"
(cd "$INSTALL_DIR" && npm install)

if [ ! -f "$INSTALL_DIR/bin/cockpit" ]; then
  echo "Error: Launcher file $INSTALL_DIR/bin/cockpit was not found." >&2
  exit 1
fi

if [ "$WITH_BUILD" -eq 1 ]; then
  echo "Building OpenCode IDE web & bridge apps…"
  (cd "$INSTALL_DIR" && npm run build)
fi

mkdir -p "$BIN_DIR"
chmod +x "$INSTALL_DIR/bin/cockpit" "$INSTALL_DIR/install.sh"

# Link or copy executable launcher
if ln -sf "$INSTALL_DIR/bin/cockpit" "$BIN_DIR/cockpit" 2>/dev/null; then
  echo "Linked launcher: $INSTALL_DIR/bin/cockpit → $BIN_DIR/cockpit"
else
  cp -f "$INSTALL_DIR/bin/cockpit" "$BIN_DIR/cockpit"
  chmod +x "$BIN_DIR/cockpit"
  echo "Copied launcher: $BIN_DIR/cockpit"
fi

# On Windows environments, generate CMD and PowerShell launcher wrappers
if [ "$PLATFORM" = "Windows" ] || [ -n "${WINDIR:-}" ] || [ -n "${SYSTEMROOT:-}" ]; then
  cat <<'CMDWRAPPER' > "$BIN_DIR/cockpit.cmd"
@echo off
bash "%~dp0cockpit" %*
CMDWRAPPER
  chmod +x "$BIN_DIR/cockpit.cmd" 2>/dev/null || true

  cat <<'PSWRAPPER' > "$BIN_DIR/cockpit.ps1"
& bash "$PSScriptRoot/cockpit" $args
PSWRAPPER
  chmod +x "$BIN_DIR/cockpit.ps1" 2>/dev/null || true

  echo "Created Windows CMD (cockpit.cmd) and PowerShell (cockpit.ps1) wrappers in $BIN_DIR"
fi

echo ""
echo "Done! OpenCode IDE has been installed."
echo ""

if ! echo ":$PATH:" | grep -q ":$BIN_DIR:"; then
  echo "Notice: $BIN_DIR is not currently in your PATH."
  echo "To run 'cockpit' from any directory, add it to your environment:"
  case "$PLATFORM" in
    macOS)
      echo "  Zsh (default):    echo 'export PATH=\"$BIN_DIR:\$PATH\"' >> ~/.zshrc && source ~/.zshrc"
      echo "  Bash:            echo 'export PATH=\"$BIN_DIR:\$PATH\"' >> ~/.bash_profile && source ~/.bash_profile"
      ;;
    Linux)
      echo "  Bash:            echo 'export PATH=\"$BIN_DIR:\$PATH\"' >> ~/.bashrc && source ~/.bashrc"
      echo "  Zsh:             echo 'export PATH=\"$BIN_DIR:\$PATH\"' >> ~/.zshrc && source ~/.zshrc"
      ;;
    Windows)
      echo "  Git Bash:        echo 'export PATH=\"$BIN_DIR:\$PATH\"' >> ~/.bashrc && source ~/.bashrc"
      echo "  PowerShell:      [Environment]::SetEnvironmentVariable(\"Path\", \$env:Path + \";$BIN_DIR\", \"User\")"
      ;;
  esac
  echo ""
fi

echo "Start OpenCode IDE:"
echo "  cockpit start ~/projects/my-app"

# Print raw curl link for easy sharing
RAW_URL="$(echo "$REPO_URL" | sed -E 's#^https://github\\.com/([^/]+)/([^/]+?)(\\.git)?$#https://raw.githubusercontent.com/\\1/\\2/main/install.sh#')"
case "$RAW_URL" in
  https://raw.githubusercontent.com/*)
    echo ""
    echo "Share installer:"
    echo "  curl -fsSL $RAW_URL | bash"
    ;;
esac
