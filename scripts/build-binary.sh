#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENTRY="$PROJECT_DIR/src/cli/entry-bun.ts"
OUT_DIR="$PROJECT_DIR/dist"

get_bun_target() {
  case "$1" in
    linux-x64) echo "bun-linux-x64" ;;
    linux-arm64) echo "bun-linux-arm64" ;;
    darwin-x64) echo "bun-darwin-x64" ;;
    darwin-arm64) echo "bun-darwin-arm64" ;;
    windows-x64) echo "bun-windows-x64" ;;
    *) return 1 ;;
  esac
}

build_target() {
  local target="$1"
  local bun_target
  bun_target="$(get_bun_target "$target")" || {
    echo "Unknown target: $target" >&2
    echo "Valid targets: linux-x64 linux-arm64 darwin-x64 darwin-arm64 windows-x64" >&2
    return 1
  }
  local outfile="$OUT_DIR/search-hub-${target}"
  if [[ "$target" == windows-* ]]; then
    outfile="${outfile}.exe"
  fi
  echo "Building for $target..."
  bun build --compile --target="$bun_target" "$ENTRY" --outfile "$outfile"
  echo "  -> $outfile ($(du -h "$outfile" | cut -f1))"
}

if [[ $# -eq 0 ]]; then
  arch="$(uname -m)"
  case "$arch" in
    x86_64) arch="x64" ;;
    aarch64|arm64) arch="arm64" ;;
    *) echo "Unsupported architecture: $arch" >&2; exit 1 ;;
  esac
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  set -- "${os}-${arch}"
fi

mkdir -p "$OUT_DIR"
for target in "$@"; do
  build_target "$target"
done
echo "Done."
