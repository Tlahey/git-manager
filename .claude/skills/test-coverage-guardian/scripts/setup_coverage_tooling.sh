#!/usr/bin/env bash
# Idempotent one-time setup for coverage measurement in this repo.
# Safe to run every time this skill triggers — every step checks before acting.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$REPO_ROOT" ]; then
  echo "error: not inside a git repo — run this from within git-manager" >&2
  exit 1
fi

DESKTOP_DIR="$REPO_ROOT/apps/desktop"
VITE_CONFIG="$DESKTOP_DIR/vite.config.ts"
TAURI_DIR="$DESKTOP_DIR/src-tauri"

echo "== Frontend: @vitest/coverage-v8 =="
if grep -q '"@vitest/coverage-v8"' "$DESKTOP_DIR/package.json" 2>/dev/null; then
  echo "already installed, skipping"
else
  # Must match the installed vitest major.minor exactly — "latest" resolves to a newer
  # @vitest/coverage-v8 major than this repo's pinned `vitest@^2.1.8`, which pnpm installs
  # anyway but then reports as an unmet peer dependency (coverage silently mismatched).
  VITEST_VERSION="$(node -e "console.log(require('$DESKTOP_DIR/node_modules/vitest/package.json').version)")"
  echo "installing @vitest/coverage-v8@$VITEST_VERSION (matching installed vitest)..."
  (cd "$REPO_ROOT" && pnpm --filter @git-manager/desktop add -D "@vitest/coverage-v8@$VITEST_VERSION")
fi

echo
echo "== Frontend: vite.config.ts coverage block =="
if grep -q "coverage:" "$VITE_CONFIG" 2>/dev/null; then
  echo "coverage block already present in vite.config.ts, skipping"
else
  cat <<'EOF'
Not found. Add this to vite.config.ts, inside the existing `test: { ... }` block, as a sibling of
`environment`/`setupFiles`/`css`/`alias` (do not create a second `test:` key):

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      // No repo-wide thresholds here on purpose — this repo's legacy files aren't at 95% yet.
      // check_ts_coverage.mjs enforces the 95% bar per-file, scoped to files you actually touch.
    },

Apply this with the Edit tool (precise, reviewable) rather than scripting the insertion — it's a
one-time change, not a repeated operation.
EOF
fi

echo
echo "== Backend: cargo-llvm-cov =="
if command -v cargo-llvm-cov >/dev/null 2>&1 || cargo llvm-cov --version >/dev/null 2>&1; then
  echo "already installed, skipping"
else
  echo "installing (cargo install cargo-llvm-cov)..."
  cargo install cargo-llvm-cov --locked
fi

echo
echo "== Backend: llvm-tools-preview component =="
if rustup component list --installed 2>/dev/null | grep -q llvm-tools; then
  echo "already installed, skipping"
else
  echo "installing..."
  rustup component add llvm-tools-preview
fi

echo
echo "== Backend: nightly toolchain (only needed for --branch coverage) =="
if rustup toolchain list 2>/dev/null | grep -q '^nightly'; then
  echo "nightly toolchain present — branch coverage available"
else
  cat <<EOF
Not installed. This changes global rustup state, so it's not installed automatically here.
Without it, check_rust_coverage.sh falls back to line/function/region coverage and reports
branch coverage as unavailable — usable, just less precise. To get branch numbers, run once:

    rustup toolchain install nightly
EOF
fi

echo
echo "Setup check complete."
