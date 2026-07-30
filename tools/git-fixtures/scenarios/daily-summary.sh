#!/usr/bin/env bash
# A repo with one commit on main, dated to the morning auto-run's default window — the *previous
# working day* (see apps/desktop/src/lib/dailySummaryWindow.ts's previousWorkingDayKey, mirrored
# here in bash) — rather than "now". Every other fixture's commits land at build time (today), which
# is exactly the one day the daily-summary feature never looks at by default, so a fixture built from
# `fixture_init` alone always reports "nothing to summarize" regardless of what it actually contains.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib.sh"

fixture_init "daily-summary"

# `date +%w` returns 0=Sunday..6=Saturday, the same numbering as JS `Date#getDay()`, so the
# Monday/Sunday special cases below mirror previousWorkingDayKey() exactly.
dow="$(date +%w)"
case "$dow" in
  1) days_back=3 ;; # Monday -> reach back over the weekend to Friday
  0) days_back=2 ;; # Sunday -> Friday
  *) days_back=1 ;;
esac
commit_date="$(date -v-"${days_back}"d '+%Y-%m-%dT12:00:00')"
# Well before the window regardless of which day it lands on, so this commit is always excluded
# from the walk by the `since_epoch` cutoff in `ai_activity.rs`'s `collect_commits`.
baseline_date="$(date -v-30d '+%Y-%m-%dT12:00:00')"

cat > report.py <<'EOF'
def build_report(entries):
    return ""
EOF
git add report.py
GIT_AUTHOR_DATE="$baseline_date" GIT_COMMITTER_DATE="$baseline_date" \
  git commit -q -m "chore: scaffold the report module"

# A root commit is its own range base (`ai_activity.rs`'s `collect_commits` falls back to
# `commit.id()` when there is no parent), which makes `baseOid == headOid` and the day's diff
# empty — `generateDailySummary` then treats a real commit as "nothing to summarize". Giving the
# target commit a parent (the baseline above) is what makes the range genuinely non-empty.
cat > report.py <<'EOF'
def build_report(entries):
    return "\n".join(entries)
EOF
git add report.py
GIT_AUTHOR_DATE="$commit_date" GIT_COMMITTER_DATE="$commit_date" \
  git commit -q -m "feat: add the report builder"

register_fixture "daily-summary" "One baseline commit well outside the window, then one on main dated to the previous working day, for the daily-summary feature's default auto-run window"
