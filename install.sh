#!/usr/bin/env bash
# OpenCode Cockpit installer — curl-pipeable:
#   curl -fsSL https://raw.githubusercontent.com/wansatya/opencode-ide/main/install.sh | bash
# Or with options (note the `-s --` passthrough):
#   curl -fsSL .../install.sh | bash -s -- --dir ~/cockpit --no-build
#
# Env overrides: COCKPIT_REPO_URL, COCKPIT_DIR, COCKPIT_BIN_DIR
set -euo pipefail

# >>> EDIT ME: point this at your GitHub repo before sharing the curl link.
REPO_URL="${COCKPIT_REPO_URL:-https://github.com/wansatya/opencode-ide.git}"
INSTALL_DIR="${COCKPIT_DIR:-$HOME/.opencode-ide}"
BIN_DIR="${COCKPIT_BIN_DIR:-$HOME/.local/bin}"
WITH_BUILD=1

usage() {
  cat <<EOF
Install OpenCode Cockpit from GitHub.

Usage:
  install.sh [--repo URL] [--dir PATH] [--bin-dir PATH] [--no-build]

  --repo URL     Git URL to clone (default: $REPO_URL)
  --dir PATH     Where to clone (default: $INSTALL_DIR)
  --bin-dir PATH Where to link the \`cockpit\` command (default: $BIN_DIR)
  --no-build     Skip \`npm run build\` (use dev mode only)
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

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required tool: $1" >&2
    case "$1" in
      node) echo "Install Node.js 20+ from https://nodejs.org" >&2 ;;
      git) echo "Install git from https://git-scm.com" >&2 ;;
    esac
    exit 1
  }
}

need git
need node
need npm

# Enforce Node >= 20 (bridge uses modern APIs).
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node 20+ required (found $(node -v)). Upgrade from https://nodejs.org" >&2
  exit 1
fi

if [ -d "$INSTALL_DIR/.git" ]; then
  echo "Updating existing checkout at $INSTALL_DIR…"
  git -C "$INSTALL_DIR" pull --ff-only || echo "Warning: could not fast-forward; keeping local checkout." >&2
else
  if [ -e "$INSTALL_DIR" ]; then
    echo "$INSTALL_DIR exists and is not a git checkout. Remove it or pass --dir." >&2
    exit 1
  fi
  echo "Cloning $REPO_URL → $INSTALL_DIR…"
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi

echo "Installing dependencies…"
(cd "$INSTALL_DIR" && npm install)

# Guard: the checkout must contain the launcher (older clones predate
# bin/cockpit, which used to be git-ignored). Fail here with a clear message
# instead of a cryptic chmod/ln error later.
if [ ! -f "$INSTALL_DIR/bin/cockpit" ]; then
  echo "Error: $INSTALL_DIR/bin/cockpit not found." >&2
  echo "Your checkout is outdated (or cloned from a repo/branch without it)." >&2
  echo "Fix: cd $INSTALL_DIR && git pull && re-run this installer." >&2
  exit 1
fi

if [ "$WITH_BUILD" -eq 1 ]; then
  echo "Building web + bridge…"
  (cd "$INSTALL_DIR" && npm run build)
fi

mkdir -p "$BIN_DIR"
ln -sf "$INSTALL_DIR/bin/cockpit" "$BIN_DIR/cockpit"
chmod +x "$INSTALL_DIR/bin/cockpit" "$INSTALL_DIR/install.sh"
"$BIN_DIR/cockpit" --version

echo ""
echo "Done. Next steps:"
if ! echo ":$PATH:" | grep -q ":$BIN_DIR:"; then
  echo "  1. Add $BIN_DIR to PATH:  export PATH=\"\$HOME/.local/bin:\$PATH\""
  echo "  2. cockpit start ~/projects/my-app"
else
  echo "  cockpit start ~/projects/my-app"
fi

# Print the curl command for this same repo, when derivable.
RAW_URL="$(echo "$REPO_URL" | sed -E 's#^https://github\.com/([^/]+)/([^/]+?)(\.git)?$#https://raw.githubusercontent.com/\1/\2/main/install.sh#')"
case "$RAW_URL" in
  https://raw.githubusercontent.com/*)
    echo ""
    echo "Share this installer with:"
    echo "  curl -fsSL $RAW_URL | bash" ;;
esac
