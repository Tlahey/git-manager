#!/usr/bin/env bash
# A "pretty history" repo used by the @screenshots e2e scenarios (and handy in
# dev): three authors across a month of history, two merged feature branches,
# a feature branch with its own merged sub-branch (so the graph shows a
# branch built off another branch, not just off main), two still-open
# branches, two tags and an uncommitted change — so the commit graph, ref
# pills, avatars and the WIP row all show up in one marketing-quality
# screenshot, dated like a real repo rather than everything reading "just
# now".
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib.sh"

fixture_init "showcase"

alex()  { git -c user.name="Alex Smith"   -c user.email="alex@example.com"   "$@"; }
marie() { git -c user.name="Marie Dubois" -c user.email="marie@example.com" "$@"; }
sam()   { git -c user.name="Sam Wallace"  -c user.email="sam@example.com"   "$@"; }

# `days_back "N"` -> an ISO date N days before today at noon, for GIT_AUTHOR_DATE/
# GIT_COMMITTER_DATE — same pattern as daily-summary.sh, spread across the whole
# script so the graph reads as a month of real work instead of one instant.
days_back() { date -v-"$1"d '+%Y-%m-%dT12:00:00'; }

echo "# Showcase" > README.md
git add README.md
d="$(days_back 28)"
GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" sam commit -q -m "chore: scaffold application"

cat > .editorconfig <<'EOF'
root = true

[*]
indent_style = space
indent_size = 2
EOF
git add .editorconfig
d="$(days_back 27)"
GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" marie commit -q -m "chore: add editorconfig"

cat > .eslintrc.json <<'EOF'
{
  "extends": ["eslint:recommended"]
}
EOF
git add .eslintrc.json
d="$(days_back 26)"
GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" marie commit -q -m "chore: set up linting and CI config"

cat > graph.ts <<'EOF'
export interface GraphNode {
  oid: string
  column: number
}
EOF
git add graph.ts
d="$(days_back 25)"
GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" marie commit -q -m "feat: add commit graph layout"

# ── feature branch: AI commits (merged) ──
git checkout -q -b feat/ai-commit
cat > ollama.ts <<'EOF'
export async function generateCommitMessage(diff: string): Promise<string> {
  return `feat: ${diff.slice(0, 20)}`
}
EOF
git add ollama.ts
d="$(days_back 24)"
GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" alex commit -q -m "feat: local Ollama client"

cat > prompt.ts <<'EOF'
export function buildPrompt(diff: string): string {
  return `Summarize this diff:\n${diff}`
}
EOF
git add prompt.ts
d="$(days_back 23)"
GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" alex commit -q -m "refactor: extract prompt builder"

cat >> ollama.ts <<'EOF'

export function streamTokens(): AsyncIterable<string> {
  throw new Error('todo')
}
EOF
git add ollama.ts
d="$(days_back 22)"
GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" alex commit -q -m "feat: stream generated message live"

cat > ollama.test.ts <<'EOF'
import { generateCommitMessage } from './ollama'

test('handles an empty diff', async () => {
  await expect(generateCommitMessage('')).resolves.toBe('feat: ')
})
EOF
git add ollama.test.ts
d="$(days_back 21)"
GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" alex commit -q -m "test: cover empty diff edge case"

git checkout -q main
cat >> README.md <<'EOF'

Window drag region fix.
EOF
git add README.md
d="$(days_back 20)"
GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" sam commit -q -m "fix: window drag region on macOS"

d="$(days_back 20)"
GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" \
  sam merge -q --no-ff feat/ai-commit -m "Merge branch 'feat/ai-commit'"
git tag v0.1.0
git branch -q -d feat/ai-commit

# ── feature branch: rollback (merged) ──
git checkout -q -b feat/rollback
cat > rollback.ts <<'EOF'
export type ResetMode = 'soft' | 'mixed' | 'hard'
EOF
git add rollback.ts
d="$(days_back 19)"
GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" marie commit -q -m "feat: reset preview dialog"

cat >> rollback.ts <<'EOF'

export function confirmHardReset(typed: string): boolean {
  return typed === 'RESET'
}
EOF
git add rollback.ts
d="$(days_back 18)"
GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" marie commit -q -m "feat: typed confirmation for hard reset"

cat > rollback.test.ts <<'EOF'
import { confirmHardReset } from './rollback'

test('only the exact word RESET confirms', () => {
  expect(confirmHardReset('reset')).toBe(false)
  expect(confirmHardReset('RESET')).toBe(true)
})
EOF
git add rollback.test.ts
d="$(days_back 17)"
GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" marie commit -q -m "test: reset preview snapshot"

cat >> rollback.ts <<'EOF'

export function diffStats(added: number, removed: number): string {
  return `+${added} -${removed}`
}
EOF
git add rollback.ts
d="$(days_back 16)"
GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" marie commit -q -m "feat: add reset preview diff stats"

git checkout -q main
cat >> README.md <<'EOF'

Badges!
EOF
git add README.md
d="$(days_back 15)"
GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" alex commit -q -m "docs: add readme badges"

d="$(days_back 15)"
GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" \
  alex merge -q --no-ff feat/rollback -m "Merge branch 'feat/rollback'"
git tag v0.2.0
git branch -q -d feat/rollback

# ── open branch: stash UI, with its own merged sub-branch ──
# feat/stash-ui-keyboard branches off feat/stash-ui (not off main) and is merged back
# into it — the graph shows a branch built on another branch, not just on main, while
# feat/stash-ui itself stays open (never merged into main).
git checkout -q -b feat/stash-ui
cat > stash.ts <<'EOF'
export function stashLabel(index: number): string {
  return `stash@{${index}}`
}
EOF
git add stash.ts
d="$(days_back 14)"
GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" marie commit -q -m "feat: stash list in sidebar"

cat >> stash.ts <<'EOF'

export function stashPreview(index: number): string {
  return `preview of stash@{${index}}`
}
EOF
git add stash.ts
d="$(days_back 13)"
GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" marie commit -q -m "feat: stash preview on hover"

git checkout -q -b feat/stash-ui-keyboard
cat >> stash.ts <<'EOF'

export function focusStash(index: number, total: number): number {
  return (index + 1) % total
}
EOF
git add stash.ts
d="$(days_back 12)"
GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" marie commit -q -m "feat: keyboard navigation for stash list"

cat >> stash.ts <<'EOF'

export function handleStashKey(key: 'Enter' | 'Backspace'): 'apply' | 'drop' {
  return key === 'Enter' ? 'apply' : 'drop'
}
EOF
git add stash.ts
d="$(days_back 11)"
GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" marie commit -q -m "feat: enter to apply, backspace to drop"

git checkout -q feat/stash-ui
d="$(days_back 10)"
GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" \
  marie merge -q --no-ff feat/stash-ui-keyboard -m "Merge branch 'feat/stash-ui-keyboard' into feat/stash-ui"
git branch -q -d feat/stash-ui-keyboard

# ── open branches (two colored side lanes at the top of the graph) ──
git checkout -q main
cat > DEPENDENCIES.md <<'EOF'
# Dependencies

Bumped monthly; see the lockfile for exact versions.
EOF
git add DEPENDENCIES.md
d="$(days_back 9)"
GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" sam commit -q -m "chore: bump dependencies"

git checkout -q -b feat/notifications
cat > notifications.ts <<'EOF'
export interface Notification {
  id: string
  read: boolean
}
EOF
git add notifications.ts
d="$(days_back 8)"
GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" sam commit -q -m "feat: notification bell"

cat >> notifications.ts <<'EOF'

export function badgeCount(items: Notification[]): number {
  return items.filter((n) => !n.read).length
}
EOF
git add notifications.ts
d="$(days_back 7)"
GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" sam commit -q -m "fix: notification bell badge count"

cat >> notifications.ts <<'EOF'

export function markAllRead(items: Notification[]): Notification[] {
  return items.map((n) => ({ ...n, read: true }))
}
EOF
git add notifications.ts
d="$(days_back 6)"
GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" sam commit -q -m "feat: mark all notifications read"

cat >> notifications.ts <<'EOF'

export function groupByDay(items: Notification[]): Record<string, Notification[]> {
  return { today: items }
}
EOF
git add notifications.ts
d="$(days_back 5)"
GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" sam commit -q -m "feat: notification grouping by day"

cat > NOTIFICATIONS.md <<'EOF'
# Notifications API

`Notification { id, read }`, grouped by day for the bell dropdown.
EOF
git add NOTIFICATIONS.md
d="$(days_back 4)"
GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" alex commit -q -m "docs: document the notification API"

git checkout -q main
cat > undo.ts <<'EOF'
export function pinRef(oid: string): string {
  return `refs/git-manager/undo/${oid}`
}
EOF
git add undo.ts
d="$(days_back 3)"
GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" sam commit -q -m "feat: undo history with pinned refs"

d="$(days_back 2)"
GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" alex commit -q --allow-empty -m "perf: virtualize graph rows"

cat > avatar.ts <<'EOF'
export function avatarUrl(email: string): string {
  return email ? `https://gravatar.com/avatar/${email}` : '/default-avatar.png'
}
EOF
git add avatar.ts
d="$(days_back 1)"
GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" marie commit -q -m "fix: avatar fallback for missing gravatar"

# Uncommitted change → the WIP row renders at the top of the graph
cat >> undo.ts <<'EOF'

export function unpinRef(oid: string): string {
  return `refs/git-manager/undo/${oid}`
}
EOF

register_fixture "showcase" "Pretty multi-author history spread over a month, with merges, tags, a branch built off another branch (feat/stash-ui-keyboard onto feat/stash-ui), two open branches and a WIP change — used by the @screenshots e2e scenarios."
