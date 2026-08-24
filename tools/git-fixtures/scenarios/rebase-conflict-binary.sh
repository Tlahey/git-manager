#!/usr/bin/env bash
# Paused rebase with a real, unresolved conflict on a *binary* file — for exercising
# `resolve_conflict_binary`'s "keep ours"/"keep theirs" buttons (ConflictMergeWindow.tsx), the one
# conflict-resolution path `rebase-conflict.sh`'s text file can't cover: `git2::Blob::is_binary()`
# needs a NUL byte in the blob, which a plain heredoc text file never contains.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib.sh"

fixture_init "rebase-conflict-binary"

# A NUL byte anywhere in the blob is all `git2::Blob::is_binary()` needs — the rest is arbitrary
# bytes standing in for a real asset, distinct per side so "keep ours"/"keep theirs" is verifiable.
printf 'BASE\x00asset-v1' > asset.bin
git add asset.bin
git commit -q -m "base: add binary asset"

git checkout -q -b ours
printf 'OURS\x00asset-v2-ours' > asset.bin
git commit -q -am "ours: update binary asset"

git checkout -q main
git checkout -q -b theirs
printf 'THEIRS\x00asset-v2-theirs' > asset.bin
git commit -q -am "theirs: update binary asset"

# Same rebase-not-merge reasoning as rebase-conflict.sh: the app only detects conflicts from a
# paused rebase (.git/rebase-merge), not a plain merge's MERGE_HEAD.
git checkout -q theirs
git rebase ours || true

register_fixture "rebase-conflict-binary" "Paused rebase with an unresolved conflict on a binary file, for the keep-ours/keep-theirs buttons"
