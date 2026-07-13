#!/usr/bin/env bash
# A parent repo with one real git submodule registered via `git submodule add` — for testing the
# sidebar's Submodules section (SubmodulesSection.tsx), which lists real libgit2-detected
# submodules (repo.submodules() in submodule.rs), not synthetic data.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib.sh"

# The submodule's own source repo — kept outside the parent's fixture_init (which only wipes its
# own named directory), so it survives as the `git submodule add` target below.
CHILD_DIR="$(fixture_dir "submodule-repo-child")"
rm -rf "$CHILD_DIR"
mkdir -p "$CHILD_DIR"
(
  cd "$CHILD_DIR"
  git init -q
  git checkout -q -b main
  git config user.email test@example.com
  git config user.name "Test User"
  echo "shared library code" > lib.txt
  git add lib.txt
  git commit -q -m "chore: initial shared library"
)

fixture_init "submodule-repo"

echo "# Parent repo" > README.md
git add README.md
git commit -q -m "chore: initial parent repo"

# protocol.file.allow=always: git 2.38+ blocks file:// / local-path submodule sources by default
# (CVE-2022-39253) — safe here since CHILD_DIR is a fixture we just created ourselves.
git -c protocol.file.allow=always submodule add -q "$CHILD_DIR" vendor/shared-lib
git commit -q -m "chore: add shared-lib as a submodule"

register_fixture "submodule-repo" "A parent repo with one real git submodule (vendor/shared-lib) registered via git submodule add"
