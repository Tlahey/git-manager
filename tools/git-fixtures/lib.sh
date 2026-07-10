#!/usr/bin/env bash
# Shared helpers for tools/git-fixtures/scenarios/*.sh — source this, don't execute it directly.
set -euo pipefail

FIXTURES_ROOT="/tmp/git-manager-fixtures"
MANIFEST_FILE="$FIXTURES_ROOT/manifest.json"

fixture_dir() {
  echo "$FIXTURES_ROOT/$1"
}

# Wipes and recreates $FIXTURES_ROOT/<name>, cd's into it, and git-inits it with a fixed test
# identity so every scenario starts from the same clean slate.
fixture_init() {
  local name="$1"
  local dir
  dir="$(fixture_dir "$name")"
  rm -rf "$dir"
  mkdir -p "$dir"
  cd "$dir"
  git init -q
  git checkout -q -b main
  git config user.email test@example.com
  git config user.name "Test User"
}

# Call once, at the end of every scenario script, after the repo is fully built. Merges this
# scenario's entry into the shared manifest.json — the payload that `pnpm dev:import-repo`
# exports as VITE_DEV_FIXTURES for the app to read (see
# apps/desktop/src/hooks/useDevFixtureImport.ts). Safe to call standalone (re-running one
# scenario only replaces its own entry, others are left untouched) or as part of build-all.sh.
register_fixture() {
  local name="$1"
  local description="$2"
  local dir
  dir="$(fixture_dir "$name")"
  mkdir -p "$FIXTURES_ROOT"
  FIXTURE_NAME="$name" FIXTURE_DIR="$dir" FIXTURE_DESC="$description" MANIFEST_FILE="$MANIFEST_FILE" node -e '
    const fs = require("fs")
    const file = process.env.MANIFEST_FILE
    const entry = {
      name: process.env.FIXTURE_NAME,
      path: process.env.FIXTURE_DIR,
      description: process.env.FIXTURE_DESC,
    }
    let manifest = []
    if (fs.existsSync(file)) {
      try {
        manifest = JSON.parse(fs.readFileSync(file, "utf8"))
      } catch {
        manifest = []
      }
    }
    manifest = manifest.filter((e) => e.name !== entry.name)
    manifest.push(entry)
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2))
  '
  echo "registered fixture '$name' -> $dir"
}
