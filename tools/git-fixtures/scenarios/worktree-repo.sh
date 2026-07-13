#!/usr/bin/env bash
# Main repo with a second branch already checked out in a linked worktree at a fixed sibling
# path — for the sidebar's Worktrees section (list + remove pre-existing) and its "add" flow
# (which creates a further, temp-path worktree at test time). The linked worktree must live
# *outside* the fixture's own directory: `git worktree add` refuses/complains about nesting one
# inside the repo it's linked to.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib.sh"

fixture_init "worktree-repo"

echo "line 1" > app.txt
git add app.txt
git commit -q -m "chore: initial app"

git checkout -q -b feature/login
echo "login screen" > login.txt
git add login.txt
git commit -q -m "feat: add login screen"

git checkout -q main

# Never checked out anywhere — main is checked out in this (the primary) worktree and
# feature/login in the linked one below, so the "add worktree" e2e scenario needs a third branch:
# git refuses to check out a branch that's already checked out in another worktree.
git branch feature/settings

LINKED_WORKTREE_DIR="$FIXTURES_ROOT/worktree-repo-linked"
rm -rf "$LINKED_WORKTREE_DIR"
git worktree add -q "$LINKED_WORKTREE_DIR" feature/login

register_fixture "worktree-repo" "main + feature/login, the latter already checked out in a linked worktree at a fixed sibling path (for the Worktrees sidebar section)"
