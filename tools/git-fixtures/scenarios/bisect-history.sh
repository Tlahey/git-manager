#!/usr/bin/env bash
# A clean linear history for exercising git bisect end to end: eight commits on `main`, each
# adding one line to app.txt, with a "bug" line deliberately introduced at commit 5. The working
# tree is left clean so bisect's successive checkouts apply without needing a stash — the stash
# dialog is covered by unit tests, not here. A tag (v1.0.0) sits on an early commit so a bisect
# range can also be picked from a tag, matching the real use case.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib.sh"

fixture_init "bisect-history"

echo "line 1" > app.txt
git add app.txt
git commit -q -m "feat: commit 1"

echo "line 2" >> app.txt
git add app.txt
git commit -q -m "feat: commit 2"
git tag v1.0.0

echo "line 3" >> app.txt
git add app.txt
git commit -q -m "feat: commit 3"

echo "line 4" >> app.txt
git add app.txt
git commit -q -m "feat: commit 4"

# The commit that "introduces the bug" — the one a bisect should converge on.
echo "BUG introduced here" >> app.txt
git add app.txt
git commit -q -m "feat: commit 5 (introduces bug)"

echo "line 6" >> app.txt
git add app.txt
git commit -q -m "feat: commit 6"

echo "line 7" >> app.txt
git add app.txt
git commit -q -m "feat: commit 7"

echo "line 8" >> app.txt
git add app.txt
git commit -q -m "feat: commit 8"

register_fixture "bisect-history" "Eight-commit linear history with a bug introduced at commit 5 and a v1.0.0 tag on commit 2 — for driving git bisect from the tools menu (pick bad/good in the graph, mark, find the culprit)"
