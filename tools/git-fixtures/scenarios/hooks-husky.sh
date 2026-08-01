#!/usr/bin/env bash
# The same hooks as `hooks-plain`, but installed the way husky v9 installs them: `core.hooksPath`
# pointing at `.husky/_` in the working tree, with each hook there a shim that delegates to the
# user-facing script one directory up.
#
# This is the setup most real projects actually have, and it is a different code path in the app —
# `hooks_dir()` has to read `core.hooksPath` and resolve it *relative to the working tree*, where
# resolving it against the git dir would look inside `.git/` and find nothing. That resolution is
# unit-tested against made-up paths only; nothing until this fixture ran a husky-style hook
# end-to-end. If hooks fire in `hooks-plain` but not here, `core.hooksPath` resolution is why.
#
# Triggers match the plain fixture, so the two can be compared directly:
#   pre-commit  fails when a staged file contains BREAK-PRECOMMIT (ships in trip-precommit.txt)
#   pre-push    fails when the pushed branch is `break-prepush`
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib.sh"

ORIGIN_DIR="$FIXTURES_ROOT/hooks-husky-origin.git"
SCRATCH_DIR="$FIXTURES_ROOT/hooks-husky-scratch"
LOCAL_DIR="$(fixture_dir "hooks-husky")"

rm -rf "$ORIGIN_DIR" "$SCRATCH_DIR" "$LOCAL_DIR"

git init -q --bare "$ORIGIN_DIR"

mkdir -p "$SCRATCH_DIR"
cd "$SCRATCH_DIR"
git init -q
git checkout -q -b main
git config user.email test@example.com
git config user.name "Test User"
echo "line 1" > app.txt
git add app.txt
git commit -q -m "chore: initial app"
git remote add origin "$ORIGIN_DIR"
git push -q origin main

git clone -q "$ORIGIN_DIR" "$LOCAL_DIR"
cd "$LOCAL_DIR"
git config user.email test@example.com
git config user.name "Test User"

# What `husky init` does: the hooks live in the working tree, not in .git/hooks.
mkdir -p .husky/_
git config core.hooksPath .husky/_

# The user-facing hooks, the ones a project commits.
cat > .husky/pre-commit <<'HOOK'
#!/bin/sh
echo "husky pre-commit: checking staged files"
if git diff --cached | grep -q 'BREAK-PRECOMMIT'; then
  echo "husky pre-commit: found the BREAK-PRECOMMIT marker" >&2
  echo "  trip-precommit.txt:1  no-marker  remove BREAK-PRECOMMIT before committing" >&2
  echo "husky pre-commit: 1 problem, commit refused" >&2
  exit 1
fi
echo "husky pre-commit: ok"
HOOK

cat > .husky/pre-push <<'HOOK'
#!/bin/sh
echo "husky pre-push: checking refs bound for $1"
status=0
while read -r local_ref local_oid remote_ref remote_oid; do
  echo "husky pre-push: $local_ref -> ${remote_ref:-(new)}"
  case "$local_ref" in
    refs/heads/break-prepush)
      echo "husky pre-push: refusing to push $local_ref" >&2
      echo "  this branch is the fixture's failing-hook case" >&2
      status=1
      ;;
  esac
done
if [ "$status" -ne 0 ]; then
  echo "husky pre-push: 1 ref refused, push blocked" >&2
fi
exit $status
HOOK

# The `_` shims git actually invokes — husky's generated indirection. Kept faithful on purpose:
# the app has to find and execute *these*, and they in turn run the scripts above, so a fixture
# that skipped the indirection would test less than the real thing.
for hook in pre-commit pre-push; do
  cat > ".husky/_/$hook" <<HOOK
#!/bin/sh
# husky's generated shim: runs the project's own hook, forwarding args and stdin.
[ -f "\$(dirname "\$0")/../$hook" ] || exit 0
exec "\$(dirname "\$0")/../$hook" "\$@"
HOOK
  chmod +x ".husky/_/$hook"
  chmod +x ".husky/$hook"
done

cat > trip-precommit.txt <<'EOF'
BREAK-PRECOMMIT
Staging this file makes the husky pre-commit hook refuse the commit.
Delete the marker line above to let it through.
EOF
cat > clean.txt <<'EOF'
This file passes every hook. Edit it freely to make a commit that succeeds.
EOF

git add .husky
git commit -q --no-verify -m "chore: install husky-style hooks under .husky"

# break-prepush: the branch `pre-push` refuses by name.
git checkout -q -b break-prepush
echo "this branch cannot be pushed while the hook is installed" > blocked.txt
git add blocked.txt
git commit -q --no-verify -m "chore: a commit the pre-push hook will refuse to send"
git checkout -q main

register_fixture "hooks-husky" "The same hooks installed husky-style via core.hooksPath=.husky/_ — the resolution path only fake-path unit tests covered until now"
