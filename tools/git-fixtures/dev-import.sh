#!/usr/bin/env bash
# `pnpm dev:import-repo` entry point: rebuilds every fixture scenario, then launches the app with
# them injected as extra tab-bar entries (see apps/desktop/src/hooks/useDevFixtureImport.ts and
# apps/desktop/src/stores/devFixtureRepos.store.ts).
#
# The manifest built by build-all.sh is read here and exported as VITE_DEV_FIXTURES *before* Vite
# boots, since import.meta.env.VITE_* values are baked in at dev-server start — a plain `pnpm dev`
# never sets this var, so it's completely unaffected and never touches localStorage.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

bash "$SCRIPT_DIR/build-all.sh"

export VITE_DEV_FIXTURES
VITE_DEV_FIXTURES="$(cat "$MANIFEST_FILE")"

cd "$SCRIPT_DIR/../.."
exec pnpm --filter @git-manager/desktop dev
