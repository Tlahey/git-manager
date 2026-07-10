#!/usr/bin/env bash
# Two stashes (one plain, one including an untracked file) plus staged and unstaged changes left
# on top of both — for testing the stash list, apply/pop/drop, and stash-vs-working-tree
# conflicts without an empty status panel getting in the way.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib.sh"

fixture_init "stash-stack"

cat > config.yml <<'EOF'
service: api
replicas: 2
timeout: 30
EOF
git add config.yml
git commit -q -m "base: add config"

# Stash 1: a plain tracked-file change.
echo "replicas: 4" >> config.yml
git stash push -q -m "bump replicas"

# Stash 2: tracked-file change + an untracked file, stashed together with -u.
echo "timeout: 60" >> config.yml
cat > notes.txt <<'EOF'
scratch notes, not committed
EOF
git stash push -q -u -m "tune timeout + scratch notes"

# Leftover uncommitted changes on top of both stashes: one staged, one unstaged.
echo "service: api-v2" >> config.yml
git add config.yml
cat > IN_PROGRESS.md <<'EOF'
work in progress, not staged
EOF

register_fixture "stash-stack" "Two stashes (plain + one with an untracked file) plus staged and unstaged changes left on top"
