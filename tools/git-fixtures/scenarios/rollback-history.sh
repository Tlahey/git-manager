#!/usr/bin/env bash
# Linear history of small commits repeatedly touching the same file — for testing reset
# (soft/mixed/hard), revert, and undo/redo of those operations.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib.sh"

fixture_init "rollback-history"

echo "counter=0" > counter.txt
git add counter.txt
git commit -q -m "chore: start counter at 0"

for i in 1 2 3 4; do
  echo "counter=$i" > counter.txt
  git add counter.txt
  git commit -q -m "chore: bump counter to $i"
done

register_fixture "rollback-history" "Five linear commits bumping the same file, for testing reset/revert/undo"
