#!/usr/bin/env bash
# A paused rebase with a MULTI-STEP plan — for exercising the rebase progress view
# (components/rebase-progress/RebaseProgressCenter.tsx), which draws the whole todo list as a
# rail: replayed steps, the step git stopped on, and the ones still ahead.
#
# The existing rebase-conflict fixture only ever has one step, so it can't show any of that.
# Here the branch carries six commits, and the rebase is stopped on step 2 of 6 — which leaves
# one replayed step above the pause, four pending below it, and a `squash` + a `drop` among them
# so the rail's folding/struck-through variants show up too.
#
# The plan is injected through GIT_SEQUENCE_EDITOR rather than typed interactively, the same way
# `run_interactive_rebase` does it in services/git_interactive_rebase.rs.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib.sh"

fixture_init "rebase-multi-step"

# The tunables sit in separate sections, far enough apart that only the one both branches touch
# (cache_size) actually conflicts — the earlier step has to replay cleanly for the progress view
# to have a "replayed" step above the pause.
cat > settings.conf <<'EOF'
# ── logging ───────────────────────────────────────────
log_level = info
log_format = json
log_rotate = daily
log_retention_days = 14

# ── networking ────────────────────────────────────────
listen_port = 8080
max_connections = 512
keepalive_seconds = 60

# ── cache ─────────────────────────────────────────────
cache_size = 256
cache_ttl_seconds = 600
cache_eviction = lru

# ── resilience ────────────────────────────────────────
timeout_seconds = 30
retry_attempts = 3
backoff_ms = 250
EOF
echo "# Release notes" > CHANGELOG.md
git add .
git commit -q -m "chore: initial settings and changelog"

# --- main moves on, colliding with two of the feature branch's commits ------------------------
# Two collisions on purpose: the rebase pauses on step 2 (settings.conf), and again on step 4
# (CHANGELOG.md) once the first is resolved — so the progress view can be checked *advancing*
# through the plan, not just sitting on its first pause.
git checkout -q -b main-work main
sed -i '' 's/^cache_size = 256$/cache_size = 1024/' settings.conf
echo "- cache defaults raised on main" >> CHANGELOG.md
git commit -q -am "perf: raise the cache size on main"
git checkout -q main
git merge -q --ff-only main-work
git branch -q -D main-work

# --- the feature branch: six commits, forked from before main's change ------------------------
git checkout -q -b feature/tuning main~1

sed -i '' 's/^log_level = info$/log_level = debug/' settings.conf
git commit -q -am "feat: log at debug level while tuning"

# Step 2 of the plan — this one collides with main's cache_size change and is where the rebase
# stops, so the progress view opens on a real conflict with steps on both sides of it.
sed -i '' 's/^cache_size = 256$/cache_size = 512/' settings.conf
git commit -q -am "perf: bump the cache size for tuning"

sed -i '' 's/^timeout_seconds = 30$/timeout_seconds = 45/' settings.conf
git commit -q -am "fix: allow slower backends to answer"

echo "- tuning pass over settings.conf" >> CHANGELOG.md
git commit -q -am "docs: note the tuning pass"

echo "- (typo fix)" >> CHANGELOG.md
git commit -q -am "docs: fix a typo in the tuning note"

echo "scratch = true" >> settings.conf
git commit -q -am "chore: leftover scratch setting"

# --- rebase onto main with a plan that isn't all picks ----------------------------------------
# squash folds the typo fix into the note above it; drop removes the scratch commit. Both render
# with their own rail variant (dashed fold / struck-through) in the progress view.
PLAN_SCRIPT="$(mktemp)"
cat > "$PLAN_SCRIPT" <<'PLAN_EOF'
#!/usr/bin/env bash
todo="$1"
awk '
  /^pick .* docs: fix a typo in the tuning note$/ { sub(/^pick/, "squash"); print; next }
  /^pick .* chore: leftover scratch setting$/      { sub(/^pick/, "drop");   print; next }
  { print }
' "$todo" > "$todo.new"
mv "$todo.new" "$todo"
PLAN_EOF
chmod +x "$PLAN_SCRIPT"

GIT_SEQUENCE_EDITOR="$PLAN_SCRIPT" GIT_EDITOR=true git rebase -i main || true
rm -f "$PLAN_SCRIPT"

register_fixture "rebase-multi-step" \
  "Paused rebase with a 6-step plan (squash + drop included), stopped on step 2 — for the rebase progress view"
