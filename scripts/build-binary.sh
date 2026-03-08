#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENTRY="$PROJECT_DIR/src/cli/entry-bun.ts"
OUT_DIR="$PROJECT_DIR/dist"

declare -A BUN_TARGETS=(
  [linux-x64]="bun-linux-x64"
  [linux-arm64]="bun-linux-arm64"
  [darwin-x64]="bun-darwin-x64"
  [darwin-arm64]="bun-darwin-arm64"
  [windows-x64]="bun-windows-x64"
)

build_target() {
  local target="$1"
  local bun_target="${BUN_TARGETS[$target]:-}"
  if [[ -z "$bun_target" ]]; then
    echo "Unknown target: $target" >&2
    echo "Valid targets: ${!BUN_TARGETS[*]}" >&2
    return 1
  fi
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
