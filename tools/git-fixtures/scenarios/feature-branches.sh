#!/usr/bin/env bash
# Two local branches with HEAD on `main` and a clean working tree — for exercising a plain branch
# checkout and, above all, the undo/redo of one: switch to `feature/login`, Cmd+Z back to `main`,
# Cmd+Shift+Z forward again. HEAD stays on a *named* branch (not detached) so the toolbar's branch
# indicator always resolves to a real branch name, which is what the undo/redo test asserts on.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib.sh"

fixture_init "feature-branches"

echo "line 1" > app.txt
git add app.txt
git commit -q -m "chore: initial app"

git checkout -q -b feature/login
echo "login screen" > login.txt
git add login.txt
git commit -q -m "feat: add login screen"

# Back on main with one more commit, leaving a clean tree and HEAD on a named branch.
git checkout -q main
printf 'line 2\n' >> app.txt
git add app.txt
git commit -q -m "chore: extend app on main"

register_fixture "feature-branches" "Two local branches (main + feature/login) with a clean tree, for branch checkout and its undo/redo"
