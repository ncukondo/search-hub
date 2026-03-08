#!/bin/sh
set -eu

# search-hub binary installer
# Usage: curl -fsSL https://raw.githubusercontent.com/ncukondo/search-hub/main/install.sh | sh

REPO="ncukondo/search-hub"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"

detect_platform() {
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Linux)  platform="linux" ;;
    *)
      echo "Error: Unsupported OS: $os" >&2
      echo "Currently only Linux is supported. macOS support is planned." >&2
      exit 1
      ;;
  esac

  case "$arch" in
    x86_64|amd64)  arch="x64" ;;
    aarch64|arm64) arch="arm64" ;;
    *)
      echo "Error: Unsupported architecture: $arch" >&2
      exit 1
      ;;
  esac

  echo "${platform}-${arch}"
}

get_latest_version() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed 's/.*"tag_name": *"//;s/".*//'
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed 's/.*"tag_name": *"//;s/".*//'
  else
    echo "Error: curl or wget is required" >&2
    exit 1
  fi
}

download() {
  url="$1"
  output="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$output"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$output" "$url"
  fi
}

main() {
  target="$(detect_platform)"
  version="$(get_latest_version)"

  if [ -z "$version" ]; then
    echo "Error: Could not determine latest version" >&2
    exit 1
  fi

  echo "Installing search-hub ${version} for ${target}..."

  binary_name="search-hub-${target}"
  download_url="https://github.com/${REPO}/releases/download/${version}/${binary_name}"

  mkdir -p "$INSTALL_DIR"
  download "$download_url" "${INSTALL_DIR}/search-hub"
  chmod +x "${INSTALL_DIR}/search-hub"

  echo "Installed search-hub to ${INSTALL_DIR}/search-hub"

  # Check if INSTALL_DIR is in PATH
  case ":$PATH:" in
    *":${INSTALL_DIR}:"*) ;;
    *)
      echo ""
      echo "Add ${INSTALL_DIR} to your PATH:"
      echo "  export PATH=\"${INSTALL_DIR}:\$PATH\""
      echo ""
      echo "Or add it to your shell profile (~/.bashrc, ~/.zshrc, etc.)"
      ;;
  esac
}

main
