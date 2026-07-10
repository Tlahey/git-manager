#!/usr/bin/env bash
# A branch covering both fixup entry points in the app:
#   - two pre-existing fixup!/target commit pairs, for testing the autosquash grouping preview
#     and running a real autosquash (services/git_fixup.rs's group_into_autosquash groups a
#     `fixup! <subject>` commit with the nearest earlier commit whose subject matches verbatim,
#     so the two pairs below use distinct subjects to stay unambiguous)
#   - a third commit with NO fixup yet, plus a staged (uncommitted) change on top of it, for
#     testing *creating* a fixup commit from the UI (create_fixup_commit in git_fixup.rs requires
#     staged changes against a chosen target commit — a clean working tree can't exercise that)
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib.sh"

fixture_init "fixup-chain"

echo "# fixup-chain fixture" > README.md
git add README.md
git commit -q -m "chore: initial commit"

cat > greeting.ts <<'EOF'
export function greet(name: string): string {
  return `Hello, ${name}!`
}
EOF
git add greeting.ts
git commit -q -m "feat: add greeting module"

cat > greeting.ts <<'EOF'
export function greet(name: string): string {
  return `Hello, ${name}!`
}

export function greetLoudly(name: string): string {
  return `HELLO, ${name.toUpperCase()}!`
}
EOF
git add greeting.ts
git commit -q -m "fixup! feat: add greeting module"

cat >> README.md <<'EOF'

Unrelated documentation tweak sitting between the two fixup pairs below.
EOF
git add README.md
git commit -q -m "chore: expand readme"

cat > farewell.ts <<'EOF'
export function farewell(name: string): string {
  return `Goodbye, ${name}!`
}
EOF
git add farewell.ts
git commit -q -m "feat: add farewell module"

cat > farewell.ts <<'EOF'
export function farewell(name: string): string {
  return `Farewell, ${name}!`
}
EOF
git add farewell.ts
git commit -q -m "fixup! feat: add farewell module"

cat > config.ts <<'EOF'
export const config = {
  retries: 3,
}
EOF
git add config.ts
git commit -q -m "feat: add config module"

# Left staged on purpose, deliberately NOT committed as a fixup!: this is what "create fixup
# commit" in the UI needs to act on, targeting the "feat: add config module" commit above.
cat > config.ts <<'EOF'
export const config = {
  retries: 3,
  timeoutMs: 5000,
}
EOF
git add config.ts

register_fixture "fixup-chain" "Two pre-existing fixup!/target pairs (autosquash grouping) plus a staged change ready to become a fixup for a third, not-yet-fixed-up commit (create-fixup flow)"
