#!/usr/bin/env bash
# A small pnpm workspace with real, deliberate manifest drift, for the offline
# package health check (Tools -> Health Check). Three checks fire for real:
#   - versionAlignment: @dashboard/web pins react to a different range than @dashboard/ui
#   - catalogDrift: @dashboard/ui writes a literal typescript range instead of "catalog:"
#   - workspaceProtocol: @dashboard/web depends on the sibling @dashboard/ui by version
# No node_modules is installed, so the two install-state checks report "skipped" rather
# than "ok" or a finding — on purpose, to show that badge state too. This all comes from
# `run_package_health_check` (apps/desktop/src-tauri/src/services/package_health.rs),
# which is filesystem-only: no `pnpm install` and no network access needed to build or
# to exercise this fixture.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib.sh"

fixture_init "package-health"

git config user.name "Priya Natarajan"
git config user.email "priya@example.com"

cat > pnpm-workspace.yaml <<'EOF'
packages:
  - "packages/*"
catalog:
  typescript: ^5.7.2
EOF

cat > package.json <<'EOF'
{
  "name": "dashboard-tools",
  "private": true,
  "packageManager": "pnpm@11.12.0",
  "devDependencies": {
    "typescript": "catalog:"
  }
}
EOF

mkdir -p packages/ui packages/web

cat > packages/ui/package.json <<'EOF'
{
  "name": "@dashboard/ui",
  "version": "1.2.0",
  "dependencies": {
    "react": "^18.3.1"
  },
  "devDependencies": {
    "typescript": "^5.6.0"
  }
}
EOF

cat > packages/web/package.json <<'EOF'
{
  "name": "@dashboard/web",
  "version": "1.0.0",
  "dependencies": {
    "react": "^18.2.0",
    "@dashboard/ui": "^1.2.0"
  }
}
EOF

echo "lockfileVersion: '9.0'" > pnpm-lock.yaml

git add pnpm-workspace.yaml package.json pnpm-lock.yaml packages
git commit -q -m "chore: scaffold the dashboard-tools workspace"

register_fixture "package-health" "A pnpm workspace with real manifest drift (misaligned react range, catalog drift, a sibling dependency by version), for the offline package health check"
