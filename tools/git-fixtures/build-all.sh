#!/usr/bin/env bash
# Rebuilds every fixture scenario from scratch and regenerates manifest.json. Run standalone
# (`pnpm fixture:build`) to refresh fixtures without relaunching the app — e.g. to reset the
# rebase-conflict fixture back to "unresolved" after you resolved it in a running `pnpm dev`
# session; just re-select the tab afterwards to pick up the fresh state.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

for scenario in "$SCRIPT_DIR"/scenarios/*.sh; do
  echo "=== building fixture: $(basename "$scenario" .sh) ==="
  bash "$scenario"
done

echo "=== all fixtures ready under /tmp/git-manager-fixtures ==="
