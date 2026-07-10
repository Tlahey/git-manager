#!/usr/bin/env bash
# A branch with two fixup!-able commit pairs, separated by an unrelated commit — for testing the
# autosquash grouping preview and running a real autosquash. services/git_fixup.rs's
# group_into_autosquash groups a `fixup! <subject>` commit with the nearest earlier commit whose
# subject matches verbatim, so the two pairs below use distinct subjects to stay unambiguous.
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

register_fixture "fixup-chain" "Two fixup!/target commit pairs separated by an unrelated commit, for testing autosquash grouping"
