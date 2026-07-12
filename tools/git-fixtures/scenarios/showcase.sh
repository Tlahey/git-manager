#!/usr/bin/env bash
# A "pretty history" repo used by the @screenshots e2e scenarios (and handy in
# dev): several authors, two merged feature branches, one open branch, two tags
# and an uncommitted change — so the commit graph, ref pills, avatars and the
# WIP row all show up in one marketing-quality screenshot.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib.sh"

fixture_init "showcase"

alex()  { git -c user.name="Alex Smith"   -c user.email="alex@example.com"   "$@"; }
marie() { git -c user.name="Marie Dubois" -c user.email="marie@example.com" "$@"; }

echo "# Showcase" > README.md
git add README.md
git commit -q -m "chore: scaffold application"

cat > graph.ts <<'EOF'
export interface GraphNode {
  oid: string
  column: number
}
EOF
git add graph.ts
marie commit -q -m "feat: add commit graph layout"

# ── feature branch: AI commits (merged) ──
git checkout -q -b feat/ai-commit
cat > ollama.ts <<'EOF'
export async function generateCommitMessage(diff: string): Promise<string> {
  return `feat: ${diff.slice(0, 20)}`
}
EOF
git add ollama.ts
alex commit -q -m "feat: local Ollama client"
cat >> ollama.ts <<'EOF'

export function streamTokens(): AsyncIterable<string> {
  throw new Error('todo')
}
EOF
git add ollama.ts
alex commit -q -m "feat: stream generated message live"

git checkout -q main
cat >> README.md <<'EOF'

Window drag region fix.
EOF
git add README.md
git commit -q -m "fix: window drag region on macOS"

git merge -q --no-ff feat/ai-commit -m "Merge branch 'feat/ai-commit'"
git tag v0.1.0
git branch -q -d feat/ai-commit

# ── feature branch: rollback (merged) ──
git checkout -q -b feat/rollback
cat > rollback.ts <<'EOF'
export type ResetMode = 'soft' | 'mixed' | 'hard'
EOF
git add rollback.ts
marie commit -q -m "feat: reset preview dialog"
cat >> rollback.ts <<'EOF'

export function confirmHardReset(typed: string): boolean {
  return typed === 'RESET'
}
EOF
git add rollback.ts
marie commit -q -m "feat: typed confirmation for hard reset"

git checkout -q main
cat >> README.md <<'EOF'

Badges!
EOF
git add README.md
alex commit -q -m "docs: add readme badges"

git merge -q --no-ff feat/rollback -m "Merge branch 'feat/rollback'"
git tag v0.2.0
git branch -q -d feat/rollback

# ── open branch (colored side lane at the top of the graph) ──
git checkout -q -b feat/stash-ui
cat > stash.ts <<'EOF'
export function stashLabel(index: number): string {
  return `stash@{${index}}`
}
EOF
git add stash.ts
marie commit -q -m "feat: stash list in sidebar"

git checkout -q main
cat > undo.ts <<'EOF'
export function pinRef(oid: string): string {
  return `refs/git-manager/undo/${oid}`
}
EOF
git add undo.ts
git commit -q -m "feat: undo history with pinned refs"
alex commit -q --allow-empty -m "perf: virtualize graph rows"

# Uncommitted change → the WIP row renders at the top of the graph
cat >> undo.ts <<'EOF'

export function unpinRef(oid: string): string {
  return `refs/git-manager/undo/${oid}`
}
EOF

register_fixture "showcase" "Pretty multi-author history with merges, tags, an open branch and a WIP change — used by the @screenshots e2e scenarios."
