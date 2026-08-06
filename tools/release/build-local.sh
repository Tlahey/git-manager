#!/usr/bin/env bash
# Builds the macOS Tauri bundle on this machine instead of waiting on release.yml's GitHub-hosted
# runner (a universal build there takes 15-20+ minutes: two full `cargo build --release` passes,
# one per architecture, each with full LTO). The output here is UNSIGNED — the Tauri updater
# private key only exists as the TAURI_SIGNING_PRIVATE_KEY GitHub secret (write-only, not
# available locally), so this script can't produce a `.sig` or `latest.json` a real install would
# trust. Use it to sanity-check that a build/bundle actually works before pushing a release tag;
# the signed artifact real users get still comes from release.yml.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

UNIVERSAL=false
for arg in "$@"; do
  case "$arg" in
    --universal) UNIVERSAL=true ;;
    *)
      echo "Unknown argument: $arg (only --universal is supported)" >&2
      exit 1
      ;;
  esac
done

cd "$ROOT_DIR/apps/desktop"

if [ "$UNIVERSAL" = true ]; then
  echo "=== building universal (aarch64 + x86_64) bundle — vendors OpenSSL for the cross-compiled arch, several minutes ==="
  pnpm tauri build --target universal-apple-darwin --features vendored-openssl
else
  echo "=== building for this machine's architecture only (fast) ==="
  pnpm tauri build
fi

echo "=== done — unsigned bundle under apps/desktop/src-tauri/target/*/release/bundle/macos ==="
