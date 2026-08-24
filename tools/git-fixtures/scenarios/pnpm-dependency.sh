#!/usr/bin/env bash
# A real pnpm-managed dependency, installed for real over the network — the one fixture in this
# suite that isn't fully offline, and deliberately so: `pnpm patch` (services/dependency_patch.rs)
# materialises its "pristine" copy from pnpm's own content-addressable store, which only a package
# pnpm actually resolved from a registry populates. A `file:`-referenced local package was tried
# and 404s the moment `pnpm patch` tries to fetch it — see issue #436's dependency-patch-flow PR
# for the full investigation. `left-pad@1.3.0` is deliberately tiny (one file, zero dependencies,
# a permanently archived, never-changing version) so the install is fast and the diff a scenario
# produces by editing it is trivial to assert on.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib.sh"

fixture_init "pnpm-dependency"

cat > package.json <<'EOF'
{
  "name": "pnpm-dependency-fixture",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "left-pad": "1.3.0"
  }
}
EOF

# pnpm 9+ writes `patchedDependencies` here rather than into `package.json` — needed for the file
# to exist at all before the first patch is committed, exactly like a real project's.
cat > pnpm-workspace.yaml <<'EOF'
packages: []
EOF

cat > .gitignore <<'EOF'
node_modules/
EOF

pnpm install

git add package.json pnpm-workspace.yaml pnpm-lock.yaml .gitignore
git commit -q -m "base: add left-pad as a real pnpm-managed dependency"

register_fixture "pnpm-dependency" "A real, network-installed pnpm dependency (left-pad), for the dependency-patch flow"
