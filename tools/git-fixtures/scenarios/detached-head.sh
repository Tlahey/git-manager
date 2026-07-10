#!/usr/bin/env bash
# HEAD detached two commits behind main, with an unrelated side branch also present — for testing
# detached-HEAD warnings/UI and checkout-from-detached flows.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib.sh"

fixture_init "detached-head"

echo "v1" > VERSION
git add VERSION
git commit -q -m "chore: v1"
FIRST_SHA=$(git rev-parse HEAD)

echo "v2" > VERSION
git add VERSION
git commit -q -m "chore: v2"

git checkout -q -b feature/unrelated-work
echo "wip" > feature.txt
git add feature.txt
git commit -q -m "feat: unrelated work on a side branch"

git checkout -q main
echo "v3" > VERSION
git add VERSION
git commit -q -m "chore: v3"

git checkout -q "$FIRST_SHA"

register_fixture "detached-head" "HEAD detached at an early commit, two commits behind main, with an unrelated side branch also present"
