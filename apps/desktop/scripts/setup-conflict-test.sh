#!/usr/bin/env bash
# Builds a throwaway git repo at /tmp/conflict-test with a real, unresolved conflict (via a
# paused rebase — see the note further down on why not a plain `git merge`) on
# dependency-manifest.txt — for manually exercising the 3-way merge editor
# (src/components/merge-editor/ThreeWayMergeEditor.tsx) end to end in `pnpm dev`, since it reads
# live git conflict state rather than standalone files.
#
# The file contains two occurrences each of every block kind the merge editor distinguishes:
# ours-only addition, theirs-only addition, ours-only deletion, theirs-only deletion, ours-only
# modification (blue), theirs-only modification (blue), and a genuine two-sided conflict (red) —
# spread across ~110 lines so scrolling / sync-scroll / connector geometry can be tested too, not
# just a single small block.
#
# Usage: bash scripts/setup-conflict-test.sh
set -euo pipefail

TARGET_DIR=/tmp/conflict-test

rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"
cd "$TARGET_DIR"
git init -q
git checkout -q -b main
git config user.email test@example.com
git config user.name "Test User"

cat > dependency-manifest.txt <<'BASE_EOF'
# ============================================================
# dependency-manifest.txt
# Test fixture for git-manager's 3-way merge editor.
# Every kind of diff block appears twice (top half + bottom
# half) so scrolling / sync-scroll / connector geometry across
# a tall file can be tested, not just a single small block.
# ============================================================

# --- stable core (identical on both branches, never touched) ---
core-runtime = 3.2.1
core-utils = 1.0.4
core-logging = 2.5.0
core-config = 1.1.2
core-crypto = 4.0.0
core-network = 2.2.2
core-storage = 1.8.0
core-testing = 0.9.1
core-cli = 1.4.0
core-scheduler = 0.6.2
core-metrics-base = 1.0.0
core-events = 2.0.0
core-validation = 1.3.0
core-serialization = 1.6.0

# --- ADDITION, ours-only: nothing here on base or theirs ---

# --- ADDITION, theirs-only: nothing here on base or ours ---

# --- DELETION, ours-only: base has these, ours removes them, theirs keeps them ---
legacy-cache = 0.3.0
legacy-session = 0.4.1

# --- DELETION, theirs-only: base has these, theirs removes them, ours keeps them ---
deprecated-auth = 0.2.0
deprecated-mailer = 0.5.5

# --- MODIFICATION, ours-only: ours bumps the version, theirs leaves it untouched ---
http-client = 7.4.0

# --- MODIFICATION, theirs-only: theirs bumps the version, ours leaves it untouched ---
json-parser = 2.1.0

# --- CONFLICT, both-different: both branches bump this to different versions ---
database-driver = 5.0.0

# --- more stable context ---
ui-kit = 6.6.6
ui-icons = 3.3.3
ui-theme = 1.2.0
build-tooling = 9.0.0
lint-rules = 4.4.4
format-tool = 2.0.0
release-notes = 1.0.0
changelog-gen = 1.0.0
docs-site = 2.3.0
docs-search = 1.1.0
i18n-runtime = 3.0.0
i18n-cli = 1.0.0
theme-editor = 0.9.0
icon-pack = 4.0.0

# --- ADDITION, ours-only, second occurrence ---

# --- ADDITION, theirs-only, second occurrence ---

# --- DELETION, ours-only, second occurrence ---
old-widget = 0.0.9

# --- DELETION, theirs-only, second occurrence ---
old-gadget = 0.0.7

# --- MODIFICATION, ours-only, second occurrence ---
retry-policy = 3.0.0

# --- MODIFICATION, theirs-only, second occurrence ---
timeout-policy = 10.0.0

# --- CONFLICT, both-different, second occurrence ---
auth-provider = 2.0.0

# --- final stable context ---
final-package-a = 1.0.0
final-package-b = 1.0.0
final-package-c = 1.0.0
final-package-d = 1.0.0
final-package-e = 1.0.0
final-package-f = 1.0.0
final-package-g = 1.0.0
final-package-h = 1.0.0
final-package-i = 1.0.0
final-package-j = 1.0.0

# End of manifest
BASE_EOF

git add dependency-manifest.txt
git commit -q -m "base: initial dependency manifest"

git checkout -q -b ours
cat > dependency-manifest.txt <<'OURS_EOF'
# ============================================================
# dependency-manifest.txt
# Test fixture for git-manager's 3-way merge editor.
# Every kind of diff block appears twice (top half + bottom
# half) so scrolling / sync-scroll / connector geometry across
# a tall file can be tested, not just a single small block.
# ============================================================

# --- stable core (identical on both branches, never touched) ---
core-runtime = 3.2.1
core-utils = 1.0.4
core-logging = 2.5.0
core-config = 1.1.2
core-crypto = 4.0.0
core-network = 2.2.2
core-storage = 1.8.0
core-testing = 0.9.1
core-cli = 1.4.0
core-scheduler = 0.6.2
core-metrics-base = 1.0.0
core-events = 2.0.0
core-validation = 1.3.0
core-serialization = 1.6.0

# --- ADDITION, ours-only: nothing here on base or theirs ---
addon-metrics = 1.0.0
addon-tracing = 1.0.0

# --- ADDITION, theirs-only: nothing here on base or ours ---

# --- DELETION, ours-only: base has these, ours removes them, theirs keeps them ---

# --- DELETION, theirs-only: base has these, theirs removes them, ours keeps them ---
deprecated-auth = 0.2.0
deprecated-mailer = 0.5.5

# --- MODIFICATION, ours-only: ours bumps the version, theirs leaves it untouched ---
http-client = 7.32.0

# --- MODIFICATION, theirs-only: theirs bumps the version, ours leaves it untouched ---
json-parser = 2.1.0

# --- CONFLICT, both-different: both branches bump this to different versions ---
database-driver = 5.1.0

# --- more stable context ---
ui-kit = 6.6.6
ui-icons = 3.3.3
ui-theme = 1.2.0
build-tooling = 9.0.0
lint-rules = 4.4.4
format-tool = 2.0.0
release-notes = 1.0.0
changelog-gen = 1.0.0
docs-site = 2.3.0
docs-search = 1.1.0
i18n-runtime = 3.0.0
i18n-cli = 1.0.0
theme-editor = 0.9.0
icon-pack = 4.0.0

# --- ADDITION, ours-only, second occurrence ---
experimental-flag-a = 0.1.0
experimental-flag-b = 0.1.0

# --- ADDITION, theirs-only, second occurrence ---

# --- DELETION, ours-only, second occurrence ---

# --- DELETION, theirs-only, second occurrence ---
old-gadget = 0.0.7

# --- MODIFICATION, ours-only, second occurrence ---
retry-policy = 3.5.0

# --- MODIFICATION, theirs-only, second occurrence ---
timeout-policy = 10.0.0

# --- CONFLICT, both-different, second occurrence ---
auth-provider = 2.1.0

# --- final stable context ---
final-package-a = 1.0.0
final-package-b = 1.0.0
final-package-c = 1.0.0
final-package-d = 1.0.0
final-package-e = 1.0.0
final-package-f = 1.0.0
final-package-g = 1.0.0
final-package-h = 1.0.0
final-package-i = 1.0.0
final-package-j = 1.0.0

# End of manifest
OURS_EOF

git commit -q -am "ours: add metrics/tracing addons, bump http-client/database-driver/retry-policy/auth-provider, drop old-widget/legacy-cache/legacy-session"

git checkout -q main
git checkout -q -b theirs
cat > dependency-manifest.txt <<'THEIRS_EOF'
# ============================================================
# dependency-manifest.txt
# Test fixture for git-manager's 3-way merge editor.
# Every kind of diff block appears twice (top half + bottom
# half) so scrolling / sync-scroll / connector geometry across
# a tall file can be tested, not just a single small block.
# ============================================================

# --- stable core (identical on both branches, never touched) ---
core-runtime = 3.2.1
core-utils = 1.0.4
core-logging = 2.5.0
core-config = 1.1.2
core-crypto = 4.0.0
core-network = 2.2.2
core-storage = 1.8.0
core-testing = 0.9.1
core-cli = 1.4.0
core-scheduler = 0.6.2
core-metrics-base = 1.0.0
core-events = 2.0.0
core-validation = 1.3.0
core-serialization = 1.6.0

# --- ADDITION, ours-only: nothing here on base or theirs ---

# --- ADDITION, theirs-only: nothing here on base or ours ---
theirs-metrics = 1.0.0
theirs-tracing = 1.0.0

# --- DELETION, ours-only: base has these, ours removes them, theirs keeps them ---
legacy-cache = 0.3.0
legacy-session = 0.4.1

# --- DELETION, theirs-only: base has these, theirs removes them, ours keeps them ---

# --- MODIFICATION, ours-only: ours bumps the version, theirs leaves it untouched ---
http-client = 7.4.0

# --- MODIFICATION, theirs-only: theirs bumps the version, ours leaves it untouched ---
json-parser = 2.9.0

# --- CONFLICT, both-different: both branches bump this to different versions ---
database-driver = 5.2.0

# --- more stable context ---
ui-kit = 6.6.6
ui-icons = 3.3.3
ui-theme = 1.2.0
build-tooling = 9.0.0
lint-rules = 4.4.4
format-tool = 2.0.0
release-notes = 1.0.0
changelog-gen = 1.0.0
docs-site = 2.3.0
docs-search = 1.1.0
i18n-runtime = 3.0.0
i18n-cli = 1.0.0
theme-editor = 0.9.0
icon-pack = 4.0.0

# --- ADDITION, ours-only, second occurrence ---

# --- ADDITION, theirs-only, second occurrence ---
beta-feature-x = 0.1.0
beta-feature-y = 0.1.0

# --- DELETION, ours-only, second occurrence ---
old-widget = 0.0.9

# --- DELETION, theirs-only, second occurrence ---

# --- MODIFICATION, ours-only, second occurrence ---
retry-policy = 3.0.0

# --- MODIFICATION, theirs-only, second occurrence ---
timeout-policy = 15.0.0

# --- CONFLICT, both-different, second occurrence ---
auth-provider = 2.5.0

# --- final stable context ---
final-package-a = 1.0.0
final-package-b = 1.0.0
final-package-c = 1.0.0
final-package-d = 1.0.0
final-package-e = 1.0.0
final-package-f = 1.0.0
final-package-g = 1.0.0
final-package-h = 1.0.0
final-package-i = 1.0.0
final-package-j = 1.0.0

# End of manifest
THEIRS_EOF

git commit -q -am "theirs: add theirs-metrics/beta-feature, bump json-parser/database-driver/timeout-policy/auth-provider, drop deprecated-auth/deprecated-mailer/old-gadget"

# A plain `git merge` here produces a real conflict too, but the app currently only detects
# conflicts from a *paused rebase* (`.git/rebase-merge`) — the whole conflict UI (banner,
# ConflictResolutionPanel, the synthetic CONFLICT row in the graph) is gated on rebase state in
# GitGraph.tsx (`isRebasePaused = rebaseState?.kind === 'conflict' || ...`), with no equivalent
# check for a plain merge's `MERGE_HEAD`. Using a rebase here instead means the conflict is
# actually reachable in today's UI. `theirs` is rebased ONTO `ours` (not the other way around) so
# HEAD during the conflict is `ours`'s commit and the replayed commit is `theirs`'s — matching
# the "ours"/"theirs" labeling in the file's own section comments above; rebasing the other
# direction would swap what HEAD means and make those comments read backwards.
git checkout -q theirs
git rebase ours || true

echo "=== repo ready at $TARGET_DIR, currently mid-rebase (theirs onto ours) ==="
git status --short
