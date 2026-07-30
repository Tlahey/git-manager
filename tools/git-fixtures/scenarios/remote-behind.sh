#!/usr/bin/env bash
# A real clone of a bare "origin" repo, one commit behind main after a teammate's follow-up push
# — for testing fetch/pull from the toolbar against a genuine local remote. The bare repo means
# a later push-based fixture never trips receive.denyCurrentBranch (nothing is checked out there).
# The teammate's commit is made from a throwaway scratch clone, never from the fixture's own
# working tree, so opening the fixture never touches its HEAD.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib.sh"

ORIGIN_DIR="$FIXTURES_ROOT/remote-behind-origin.git"
SCRATCH_DIR="$FIXTURES_ROOT/remote-behind-scratch"
LOCAL_DIR="$(fixture_dir "remote-behind")"

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

git clone -q "$ORIGIN_DIR" "$LOCAL_DIR"
cd "$LOCAL_DIR"
git config user.email test@example.com
git config user.name "Test User"

# The teammate's follow-up, pushed straight to origin after the clone above — the local clone's
# remote-tracking ref stays stale until it fetches.
cd "$SCRATCH_DIR"
echo "line 2" >> app.txt
git add app.txt
git commit -q -m "chore: teammate's follow-up commit"
git push -q origin main

register_fixture "remote-behind" "A clone of a bare origin, one commit behind main after a teammate's push — for fetch/pull"
