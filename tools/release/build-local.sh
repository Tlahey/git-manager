#!/usr/bin/env bash
# Builds the macOS Tauri bundle on this machine instead of waiting on release.yml's GitHub-hosted
# runner (a universal build there takes 15-20+ minutes: two full `cargo build --release` passes,
# one per architecture, each with full LTO).
#
# Signing is automatic and optional: if ~/.tauri/git-manager-release.env exists, it's sourced to
# set TAURI_SIGNING_PRIVATE_KEY_PATH/TAURI_SIGNING_PRIVATE_KEY_PASSWORD, and `tauri build` picks
# those up on its own to produce a signed bundle — the same private key as the
# TAURI_SIGNING_PRIVATE_KEY GitHub secret release.yml signs with, so an existing install's
# auto-updater trusts it too. Without that file (or those two vars set another way), the build is
# unsigned — still useful to sanity-check that a build/bundle actually works before pushing a
# release tag, just not something an existing install would accept as an update. See
# tools/release/README.md for how to (re)create that env file.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

RELEASE_ENV="$HOME/.tauri/git-manager-release.env"
if [ -f "$RELEASE_ENV" ]; then
  echo "=== loading signing key env vars from $RELEASE_ENV ==="
  # shellcheck disable=SC1090
  source "$RELEASE_ENV"
else
  echo "=== $RELEASE_ENV not found — building unsigned ==="
fi

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

echo "=== done — bundle under apps/desktop/src-tauri/target/*/release/bundle/macos ==="
