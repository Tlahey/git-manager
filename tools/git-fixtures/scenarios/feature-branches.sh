#!/usr/bin/env bash
# Two local branches with HEAD on `main` and a clean working tree — for exercising a plain branch
# checkout and, above all, the undo/redo of one: switch to `feature/login`, Cmd+Z back to `main`,
# Cmd+Shift+Z forward again. HEAD stays on a *named* branch (not detached) so the toolbar's branch
# indicator always resolves to a real branch name, which is what the undo/redo test asserts on.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib.sh"

fixture_init "feature-branches"

# Two distinct authors so a per-line `git blame` (blame-history.feature) has something real to
# show — one commit per identity, not a single "Test User" that makes every line look
# hand-written by the same person.
alex()  { git -c user.name="Alex Smith"   -c user.email="alex@example.com"   "$@"; }
marie() { git -c user.name="Marie Dubois" -c user.email="marie@example.com" "$@"; }

echo "line 1" > app.txt
git add app.txt
alex commit -q -m "chore: initial app"

git checkout -q -b feature/login
echo "login screen" > login.txt
git add login.txt
marie commit -q -m "feat: add login screen"

# Back on main with one more commit, leaving a clean tree and HEAD on a named branch. A different
# author from the line above it, so app.txt's two lines blame to two different people.
git checkout -q main
printf 'line 2\n' >> app.txt
git add app.txt
marie commit -q -m "chore: extend app on main"

register_fixture "feature-branches" "Two local branches (main + feature/login) with a clean tree, for branch checkout and its undo/redo"
