#!/usr/bin/env bash
# A clone of a bare "origin" carrying real, executable hooks in plain `.git/hooks` —
# `pre-commit`, `commit-msg`, `post-commit` and `pre-push` — so the app's hook support can be
# exercised by hand instead of only by unit test. libgit2 runs no hooks at all, so every one of
# these was silently skipped before the notch work landed; the point of this fixture is to make
# "did it actually run?" a one-click question.
#
# Each hook is a gate with a deterministic trigger, so both the passing and the failing path can
# be reached from inside the app without editing a script:
#
#   pre-commit   fails when a staged file contains the marker BREAK-PRECOMMIT
#                -> stage `trip-precommit.txt`, which ships with the marker in it
#   commit-msg   fails when the commit message contains BREAK-COMMITMSG
#                -> type that word in the commit box
#   post-commit  always succeeds, and prints — it runs after the commit is written
#   pre-push     fails when the pushed branch is `break-prepush`
#                -> check that branch out and push; `main` pushes cleanly
#
# Every hook prints several lines on purpose: the notch card shows the tail of a failing hook's
# output, and a one-line failure would not exercise that block.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib.sh"

ORIGIN_DIR="$FIXTURES_ROOT/hooks-plain-origin.git"
SCRATCH_DIR="$FIXTURES_ROOT/hooks-plain-scratch"
LOCAL_DIR="$(fixture_dir "hooks-plain")"

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

install_hooks() {
  local hooks_dir="$1"
  mkdir -p "$hooks_dir"

  cat > "$hooks_dir/pre-commit" <<'HOOK'
#!/bin/sh
# Refuses the commit when a staged file still carries the fixture's marker.
echo "pre-commit: checking staged files"
if git diff --cached | grep -q 'BREAK-PRECOMMIT'; then
  echo "pre-commit: found the BREAK-PRECOMMIT marker" >&2
  echo "  trip-precommit.txt:1  no-marker  remove BREAK-PRECOMMIT before committing" >&2
  echo "pre-commit: 1 problem, commit refused" >&2
  exit 1
fi
echo "pre-commit: ok"
HOOK

  cat > "$hooks_dir/commit-msg" <<'HOOK'
#!/bin/sh
# $1 is the path to the file holding the message git is about to use.
echo "commit-msg: linting the message"
if grep -q 'BREAK-COMMITMSG' "$1"; then
  echo "commit-msg: the message carries the BREAK-COMMITMSG marker" >&2
  echo "  subject must not contain the marker" >&2
  echo "commit-msg: message refused" >&2
  exit 1
fi
echo "commit-msg: ok"
HOOK

  cat > "$hooks_dir/post-commit" <<'HOOK'
#!/bin/sh
# Runs after the commit is written. Its exit code cannot undo anything, so it only reports.
echo "post-commit: ran after the commit was written"
HOOK

  cat > "$hooks_dir/pre-push" <<'HOOK'
#!/bin/sh
# git feeds this hook one "<local ref> <local oid> <remote ref> <remote oid>" line per ref on
# stdin, and passes the remote's name and URL as $1 and $2.
echo "pre-push: checking refs bound for $1"
status=0
while read -r local_ref local_oid remote_ref remote_oid; do
  echo "pre-push: $local_ref -> ${remote_ref:-(new)}"
  case "$local_ref" in
    refs/heads/break-prepush)
      echo "pre-push: refusing to push $local_ref" >&2
      echo "  this branch is the fixture's failing-hook case" >&2
      status=1
      ;;
  esac
done
if [ "$status" -ne 0 ]; then
  echo "pre-push: 1 ref refused, push blocked" >&2
fi
exit $status
HOOK

  chmod +x "$hooks_dir/pre-commit" "$hooks_dir/commit-msg" \
    "$hooks_dir/post-commit" "$hooks_dir/pre-push"
}

install_hooks "$LOCAL_DIR/.git/hooks"

# A file that trips `pre-commit` the moment it is staged, and one that never does — so both
# outcomes are reachable without editing anything.
cat > trip-precommit.txt <<'EOF'
BREAK-PRECOMMIT
Staging this file makes the pre-commit hook refuse the commit.
Delete the marker line above to let it through.
EOF
cat > clean.txt <<'EOF'
This file passes every hook. Edit it freely to make a commit that succeeds.
EOF

# main: one local-only commit, ready to push cleanly past `pre-push`. The payload is deliberately
# a few MB of incompressible data so the push moves enough bytes to render a real progress card —
# over file:// it is still quick, so the phase breakdown is best judged against a network remote.
mkdir -p payload
head -c 4000000 /dev/urandom | base64 > payload/bulk.txt
git add payload/bulk.txt
git commit -q --no-verify -m "chore: bulk payload so a push has something to transfer"

# break-prepush: the branch `pre-push` refuses by name.
git checkout -q -b break-prepush
echo "this branch cannot be pushed while the hook is installed" > blocked.txt
git add blocked.txt
git commit -q --no-verify -m "chore: a commit the pre-push hook will refuse to send"
git checkout -q main

register_fixture "hooks-plain" "Real pre-commit/commit-msg/post-commit/pre-push hooks in .git/hooks, against a bare origin: stage trip-precommit.txt to fail pre-commit, commit with BREAK-COMMITMSG to fail commit-msg, push break-prepush to fail pre-push"
