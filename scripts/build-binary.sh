#!/usr/bin/env bash
set -euo pipefail

# Build single binary using Bun compile
# Usage: ./scripts/build-binary.sh [target...]
# Targets: linux-x64, linux-arm64, windows-x64
# If no target specified, builds all targets.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENTRY_POINT="$PROJECT_ROOT/src/cli/entry-bun.ts"
DIST_DIR="$PROJECT_ROOT/dist"

ALL_TARGETS=("linux-x64" "linux-arm64" "windows-x64")

# Use arguments as targets, or default to all
if [ $# -gt 0 ]; then
  TARGETS=("$@")
else
  TARGETS=("${ALL_TARGETS[@]}")
fi

mkdir -p "$DIST_DIR"

for target in "${TARGETS[@]}"; do
  case "$target" in
    linux-x64)
      bun_target="bun-linux-x64"
      output="$DIST_DIR/search-hub-linux-x64"
      ;;
    linux-arm64)
      bun_target="bun-linux-arm64"
      output="$DIST_DIR/search-hub-linux-arm64"
      ;;
    windows-x64)
      bun_target="bun-windows-x64"
      output="$DIST_DIR/search-hub-windows-x64.exe"
      ;;
    *)
      echo "Error: Unknown target '$target'" >&2
      echo "Valid targets: ${ALL_TARGETS[*]}" >&2
      exit 1
      ;;
  esac

  echo "Building for $target..."
  bun build --compile --target="$bun_target" "$ENTRY_POINT" --outfile "$output"
  echo "  -> $output"
done

echo "Build complete."
