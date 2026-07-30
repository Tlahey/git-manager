#!/usr/bin/env bash
# A real clone of a bare "origin" repo, set up for two push scenarios against a genuine local
# remote: `main` has one local-only commit ready for a clean fast-forward push, and
# `feature/diverged` has a local commit that shares a base with — but is not a descendant of —
# what a teammate already pushed to that same branch on origin, so pushing it is rejected as
# non-fast-forward. The bare origin means neither push ever trips receive.denyCurrentBranch.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib.sh"

ORIGIN_DIR="$FIXTURES_ROOT/remote-ahead-origin.git"
SCRATCH_DIR="$FIXTURES_ROOT/remote-ahead-scratch"
LOCAL_DIR="$(fixture_dir "remote-ahead")"

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

# A teammate's branch, pushed to origin before the fixture's own clone exists — the base commit
# both sides will later diverge from.
git checkout -q -b feature/diverged
echo "teammate's version" > shared.txt
git add shared.txt
git commit -q -m "feat: teammate's take on shared.txt"
git push -q origin feature/diverged
git checkout -q main

git clone -q "$ORIGIN_DIR" "$LOCAL_DIR"
cd "$LOCAL_DIR"
git config user.email test@example.com
git config user.name "Test User"

# main: one local-only commit, ready to push cleanly (fast-forward).
echo "line 2" >> app.txt
git add app.txt
git commit -q -m "chore: local work not yet pushed"

# feature/diverged: branches from the SAME base commit the teammate's push started from — not
# from origin/feature/diverged itself — so this commit is a sibling of theirs, not a descendant.
# Pushing it is a genuine non-fast-forward rejection, not just "behind".
git checkout -q -b feature/diverged "$BASE"
echo "my own take" > shared.txt
git add shared.txt
git commit -q -m "feat: my own take on shared.txt"
git checkout -q main

register_fixture "remote-ahead" "A clone of a bare origin: main is one commit ahead (clean push), feature/diverged has a locally-diverged commit (rejected push)"
