#!/usr/bin/env bash
# A real clone of a bare "origin", checked out on a topic branch that diverged from main *before*
# a teammate's conflicting push — for the toolbar's merge-target indicator, which simulates a merge
# against `origin/main` in memory. Both sides rewrite the same line of app.txt from the same base
# commit, so the in-memory merge stops on a genuine, single-file conflict the indicator can report.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib.sh"

ORIGIN_DIR="$FIXTURES_ROOT/merge-target-origin.git"
SCRATCH_DIR="$FIXTURES_ROOT/merge-target-scratch"
LOCAL_DIR="$(fixture_dir "merge-target")"

rm -rf "$ORIGIN_DIR" "$SCRATCH_DIR" "$LOCAL_DIR"

git init -q --bare "$ORIGIN_DIR"

mkdir -p "$SCRATCH_DIR"
cd "$SCRATCH_DIR"
git init -q
git checkout -q -b main
git config user.email test@example.com
git config user.name "Test User"
echo "line 1" > app.txt
git add app.txt
git commit -q -m "chore: initial app"
git remote add origin "$ORIGIN_DIR"
git push -q origin main
BASE="$(git rev-parse main)"

# The teammate's push: origin/main moves ahead with an edit to the very line the local branch
# below will also touch, from the same base commit.
echo "teammate's line 1" > app.txt
git commit -q -am "fix: teammate's rename of the app title"
git push -q origin main

# Cloned only now, so origin/main already reflects the teammate's push above.
git clone -q "$ORIGIN_DIR" "$LOCAL_DIR"
cd "$LOCAL_DIR"
git config user.email test@example.com
git config user.name "Test User"

# A topic branch off the shared base, not tracking main, with its own edit to the same line —
# a real two-sided conflict once merged against origin/main's current tip.
git checkout -q -b feature/rename-line "$BASE"
echo "my own line 1" > app.txt
git commit -q -am "feat: my own rename of the app title"

register_fixture "merge-target" "A clone of a bare origin: feature/rename-line diverged from main before a teammate's conflicting push, so merging it into origin/main now conflicts on app.txt"
