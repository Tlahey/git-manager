#!/usr/bin/env bash
# End-to-end release cut: pre-flight checks, version bump + changelog, commit + tag, push to
# main, and watch the resulting release.yml build. Runs against origin/main in a throwaway
# worktree (not whatever branch happens to be checked out here), so it's safe to run from any
# clone/worktree of this repo.
#
# Replaces .github/workflows/prepare-release.yml's job for this repo: that workflow pushes with
# the default GITHUB_TOKEN, which the `protect-main` ruleset always rejects (GH013 — "Cannot
# update this protected ref"), and rulesets on a personal-account repo (this one isn't in an org)
# can't grant the GitHub Actions app a bypass the way they can on an org repo. Only a repo admin's
# own credentials can bypass it, so the push has to happen from somewhere authenticated as one —
# here, instead of prepare-release.yml's runner. See docs/architecture or
# .claude/skills/release-process/SKILL.md for the rest of the pipeline (release.yml, drafting,
# publishing).
#
# A tag push always fires release.yml's own `push: tags:` trigger regardless of which path you
# take below — that's deliberate (see tools/release/README.md), not a bug: it's a free safety-net
# CI build. --local-build additionally builds, signs and drafts the release from this machine, so
# you don't have to wait 15-20+ minutes (and burn 10x-billed macOS runner minutes) on the CI build
# just to get a reviewable draft; cancel the redundant CI run yourself if you don't want it (the
# script prints its run id).
#
# Usage:
#   pnpm release --tag=v0.3.0
#   pnpm release --bump=minor                   # computes the next version from the current tag
#   pnpm release --bump=patch --yes             # skip the confirmation prompt (e.g. for scripting)
#   pnpm release --bump=patch --local-build     # build/sign/draft here instead of waiting on CI
#   pnpm release --bump=patch --skip-validation # skip typecheck/lint/test/fmt/clippy (fast iteration only)
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPO="Tlahey/git-manager"

TAG=""
BUMP="patch"
ASSUME_YES=false
LOCAL_BUILD=false
SKIP_VALIDATION=false

for arg in "$@"; do
  case "$arg" in
    --tag=*) TAG="${arg#--tag=}" ;;
    --bump=*) BUMP="${arg#--bump=}" ;;
    --yes) ASSUME_YES=true ;;
    --local-build) LOCAL_BUILD=true ;;
    --skip-validation) SKIP_VALIDATION=true ;;
    *)
      echo "Unknown argument: $arg (expected --tag=vX.Y.Z, --bump=patch|minor|major, --yes, --local-build, --skip-validation)" >&2
      exit 1
      ;;
  esac
done

if [ "$LOCAL_BUILD" = true ]; then
  RELEASE_ENV="$HOME/.tauri/git-manager-release.env"
  [ -f "$RELEASE_ENV" ] || {
    echo "--local-build needs a signing key: $RELEASE_ENV not found (see tools/release/README.md)" >&2
    exit 1
  }
fi

if [ -n "$TAG" ] && [[ ! "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Invalid --tag: $TAG (expected vX.Y.Z)" >&2
  exit 1
fi
if [ -z "$TAG" ] && [[ ! "$BUMP" =~ ^(patch|minor|major)$ ]]; then
  echo "Invalid --bump: $BUMP (expected patch, minor, or major)" >&2
  exit 1
fi

command -v gh >/dev/null || { echo "gh CLI is required" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Run 'gh auth login' first" >&2; exit 1; }

WORKTREE_DIR="$(mktemp -d -t git-manager-release)"
rmdir "$WORKTREE_DIR" # git worktree add requires the target not to exist yet
TAG_PUSHED=false
cleanup() {
  git -C "$ROOT_DIR" worktree remove "$WORKTREE_DIR" --force >/dev/null 2>&1 || true
  # Worktrees share the repo's local refs — an aborted run's local tag would otherwise collide
  # with the next run's tag creation even though it was never pushed anywhere.
  if [ "$TAG_PUSHED" != true ] && [ -n "$TAG" ]; then
    git -C "$ROOT_DIR" tag -d "$TAG" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "=== fetching origin/main ==="
git -C "$ROOT_DIR" fetch origin main --tags
git -C "$ROOT_DIR" worktree add "$WORKTREE_DIR" origin/main --detach >/dev/null

echo "=== installing dependencies ==="
(cd "$WORKTREE_DIR" && pnpm install --frozen-lockfile)

if [ "$SKIP_VALIDATION" = true ]; then
  echo "=== --skip-validation: skipping typecheck/lint/test/fmt/clippy ==="
else
  echo "=== pre-flight: typecheck, lint, test ==="
  (cd "$WORKTREE_DIR" && pnpm typecheck && pnpm lint && pnpm --filter @git-manager/desktop test)

  echo "=== pre-flight: cargo fmt --check, cargo clippy ==="
  (
    cd "$WORKTREE_DIR/apps/desktop/src-tauri"
    cargo fmt --check
    # Not -D warnings: this repo carries pre-existing clippy warnings (see CLAUDE.md) that aren't
    # release-blocking on their own — this only needs to fail on actual compile errors.
    CARGO_TARGET_DIR="$(mktemp -d)" cargo clippy --all-targets
  )
fi

CURRENT_VERSION="$(node -p "require('$WORKTREE_DIR/apps/desktop/src-tauri/tauri.conf.json').version")"
PREVIOUS_TAG="v$CURRENT_VERSION"

if [ -n "$TAG" ]; then
  NEXT_VERSION="${TAG#v}"
else
  IFS='.' read -r major minor patch <<< "$CURRENT_VERSION"
  case "$BUMP" in
    major) major=$((major + 1)); minor=0; patch=0 ;;
    minor) minor=$((minor + 1)); patch=0 ;;
    patch) patch=$((patch + 1)) ;;
  esac
  NEXT_VERSION="$major.$minor.$patch"
  TAG="v$NEXT_VERSION"
fi

if git -C "$ROOT_DIR" ls-remote --exit-code --tags origin "$TAG" >/dev/null 2>&1; then
  echo "Tag $TAG already exists on origin" >&2
  exit 1
fi

echo "=== bumping $CURRENT_VERSION -> $NEXT_VERSION ($TAG) ==="
node -e "
  const fs = require('fs');
  const next = '$NEXT_VERSION';
  for (const file of ['package.json', 'apps/desktop/package.json', 'apps/desktop/src-tauri/tauri.conf.json']) {
    const path = '$WORKTREE_DIR/' + file;
    const json = JSON.parse(fs.readFileSync(path, 'utf8'));
    json.version = next;
    fs.writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
  }
"
node -e "
  const fs = require('fs');
  const path = '$WORKTREE_DIR/apps/desktop/src-tauri/Cargo.toml';
  const next = '$NEXT_VERSION';
  const content = fs.readFileSync(path, 'utf8');
  const updated = content.replace(/^version = \"\d+\.\d+\.\d+\"/m, \`version = \"\${next}\"\`);
  if (updated === content) throw new Error('Cargo.toml version line not found');
  fs.writeFileSync(path, updated);
"

echo "=== generating changelog from merged PRs since $PREVIOUS_TAG ==="
NOTES_FILE="$(mktemp)"
gh api "repos/$REPO/releases/generate-notes" \
  -f "tag_name=$TAG" \
  -f "previous_tag_name=$PREVIOUS_TAG" \
  -f "target_commitish=main" \
  --jq .body > "$NOTES_FILE"

node -e "
  const fs = require('fs');
  const next = '$NEXT_VERSION';
  const date = new Date().toISOString().slice(0, 10);
  const notes = fs.readFileSync('$NOTES_FILE', 'utf8').trim();

  const entry = '## [' + next + '] - ' + date + '\n\n' + (notes || '_No notable changes._') + '\n';
  const unreleasedNote = '_Auto-populated at release time from the merged pull requests since the last tag, via the GitHub release notes API — see tools/release/cut-release.sh._';

  const path = '$WORKTREE_DIR/CHANGELOG.md';
  const content = fs.readFileSync(path, 'utf8');
  const marker = '## [Unreleased]';
  const markerIdx = content.indexOf(marker);
  if (markerIdx === -1) throw new Error('CHANGELOG.md is missing an ## [Unreleased] heading');
  const bodyStart = content.indexOf('\n', markerIdx) + 1;
  const nextHeadingIdx = content.indexOf('\n## [', bodyStart);
  const bodyEnd = nextHeadingIdx === -1 ? content.length : nextHeadingIdx + 1;
  const updated = content.slice(0, bodyStart) + '\n' + unreleasedNote + '\n\n' + entry + '\n' + content.slice(bodyEnd);
  fs.writeFileSync(path, updated);
"

(
  cd "$WORKTREE_DIR"
  git add package.json apps/desktop/package.json apps/desktop/src-tauri/tauri.conf.json apps/desktop/src-tauri/Cargo.toml CHANGELOG.md
  git commit -q -m "chore(release): bump version to $TAG"
  git tag "$TAG"
)

echo
echo "=== ready to push $TAG to origin/main ==="
git -C "$WORKTREE_DIR" log --oneline -1
if [ "$ASSUME_YES" != true ]; then
  read -r -p "Push and trigger the release build? [y/N] " reply
  case "$reply" in
    y|Y) ;;
    *) echo "Aborted — nothing pushed."; exit 1 ;;
  esac
fi

echo "=== pushing commit + tag ==="
git -C "$WORKTREE_DIR" push origin HEAD:main
git -C "$WORKTREE_DIR" push origin "$TAG"
TAG_PUSHED=true

echo "=== waiting for release.yml's tag-triggered run to appear ==="
PREVIOUS_RUN_ID="$(gh run list --repo "$REPO" --workflow=release.yml --limit=1 --json databaseId --jq '.[0].databaseId // empty')"
RUN_ID=""
for _ in $(seq 1 30); do
  sleep 2
  # $TAG is pre-validated against ^v[0-9]+\.[0-9]+\.[0-9]+$, safe to inline into the jq filter.
  # (gh run list's --jq, unlike gh api's, doesn't support --arg.) `|| true`: a transient gh
  # hiccup here shouldn't abort the whole release under set -e, just retry next loop iteration.
  RUN_ID="$(gh run list --repo "$REPO" --workflow=release.yml --limit=1 --json databaseId,headBranch --jq ".[] | select(.headBranch == \"$TAG\") | .databaseId" 2>/dev/null | head -1 || true)"
  [ -n "$RUN_ID" ] && [ "$RUN_ID" != "$PREVIOUS_RUN_ID" ] && break
done
[ -n "$RUN_ID" ] && echo "release.yml also started automatically: https://github.com/$REPO/actions/runs/$RUN_ID"

if [ "$LOCAL_BUILD" = true ]; then
  if [ -n "$RUN_ID" ]; then
    echo "Not waiting on it — building locally instead. Cancel the redundant CI run if you don't want it:"
    echo "  gh run cancel $RUN_ID --repo $REPO"
  fi

  echo "=== building universal bundle locally (signed) ==="
  BUNDLE_DIR="$WORKTREE_DIR/apps/desktop/src-tauri/target/universal-apple-darwin/release/bundle"
  (
    cd "$WORKTREE_DIR/apps/desktop"
    # shellcheck disable=SC1090
    source "$RELEASE_ENV"
    pnpm tauri build --target universal-apple-darwin --features vendored-openssl
  )

  DMG_PATH="$(find "$BUNDLE_DIR/dmg" -name '*.dmg' | head -1)"
  APP_TARBALL_PATH="$(find "$BUNDLE_DIR/macos" -name '*.app.tar.gz' | head -1)"
  APP_SIG_PATH="$APP_TARBALL_PATH.sig"
  [ -f "$DMG_PATH" ] && [ -f "$APP_TARBALL_PATH" ] && [ -f "$APP_SIG_PATH" ] || {
    echo "Build finished but expected artifacts are missing under $BUNDLE_DIR — was the signing key valid?" >&2
    exit 1
  }

  echo "=== assembling latest.json ==="
  ASSET_URL="https://github.com/$REPO/releases/download/$TAG/$(basename "$APP_TARBALL_PATH")"
  SIGNATURE="$(cat "$APP_SIG_PATH")"
  # `gh release create`'s uploaded filename is this path's basename — it must be literally
  # "latest.json" to match what releases/latest/download/latest.json (the updater endpoint) serves.
  LATEST_JSON="$(mktemp -d)/latest.json"
  node -e "
    const fs = require('fs');
    const platform = { signature: '$SIGNATURE', url: '$ASSET_URL' };
    const manifest = {
      version: '$NEXT_VERSION',
      notes: fs.readFileSync('$NOTES_FILE', 'utf8').trim(),
      pub_date: new Date().toISOString(),
      platforms: {
        'darwin-aarch64': platform,
        'darwin-x86_64': platform,
        'darwin-aarch64-app': platform,
        'darwin-x86_64-app': platform,
      },
    };
    fs.writeFileSync('$LATEST_JSON', JSON.stringify(manifest, null, 2));
  "

  echo "=== creating draft release $TAG ==="
  gh release create "$TAG" \
    --repo "$REPO" \
    --title "$TAG" \
    --notes-file "$NOTES_FILE" \
    --draft \
    "$DMG_PATH" \
    "$APP_TARBALL_PATH" \
    "$APP_SIG_PATH" \
    "$LATEST_JSON"
else
  if [ -z "$RUN_ID" ]; then
    echo "Tag pushed, but couldn't find the triggered release.yml run — check:"
    echo "  gh run list --repo $REPO --workflow=release.yml --limit=3"
    exit 1
  fi

  echo "=== watching release.yml run $RUN_ID ==="
  gh run watch "$RUN_ID" --repo "$REPO" --exit-status || {
    echo "Build failed — see: https://github.com/$REPO/actions/runs/$RUN_ID" >&2
    exit 1
  }
fi

echo
echo "=== done ==="
echo "Draft release ready for review: https://github.com/$REPO/releases/tag/$TAG"
echo "Once it looks right, publish it yourself with:"
echo "  gh release edit $TAG --draft=false --repo $REPO"
