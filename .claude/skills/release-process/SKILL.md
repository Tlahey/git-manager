---
name: release-process
description: Use this whenever the user wants to cut, prepare, trigger, or publish a new git-manager release — phrases like "release a new version", "let's ship v1.2.0", "bump the version", "sortir une release", "on release quoi pour cette version", "publie la mise à jour", "pnpm release", or any request to run `tools/release/cut-release.sh`. Also use it if the user asks what the release process looks like, whether it's safe to release right now, or how the changelog/version bump/build pipeline fits together — this repo has no CI gate on tests, so this skill is the only thing standing between a broken build and a real user's auto-updater.
---

# git-manager release process

This repo ships a signed macOS app with an in-app auto-updater. There is **no CI workflow** that
runs tests/lint/typecheck on every push, so the local pre-flight checks below (run automatically
by the release script) are the only quality gate this pipeline has.

## Why this runs locally, not from GitHub Actions

`.github/workflows/prepare-release.yml` exists but **cannot work on this repo** — don't trigger
it. It pushes the version-bump commit and tag using the default `GITHUB_TOKEN`, and this repo has
a `protect-main` ruleset that rejects that (`GH013: Cannot update this protected ref`). On an
org-owned repo you could grant the GitHub Actions app a ruleset bypass; this repo is under a
personal account, and GitHub doesn't support that bypass type there — confirmed by trying it
(`Actor GitHub Actions integration must be part of the ruleset source or owner organization`).
Only a repo admin's own credentials bypass the ruleset, so the push has to come from somewhere
authenticated as one: `tools/release/cut-release.sh` (`pnpm release`), run from an admin's machine,
instead of that workflow's runner.

`.github/workflows/release.yml` (the actual build-and-sign step) works fine and still runs
automatically on every `vX.Y.Z` tag push — including tags pushed by `cut-release.sh` — as a free
safety-net CI build. It's just expensive: a universal build takes 15-20+ minutes on a macOS
runner, billed at 10x the Linux rate. `cut-release.sh --local-build` builds, signs, and drafts the
release from your own machine instead, in a few minutes, so you don't have to wait on or pay for
that CI build — see Step 3.

## The pipeline, in one picture

1. **You** run `pnpm release` with the version bump you want; it runs pre-flight checks itself.
2. **`cut-release.sh`** bumps the version everywhere, asks GitHub for the list of merged PRs since
   the last tag, writes that into `CHANGELOG.md`, commits and tags on `main` in a throwaway
   worktree, and — after you confirm — pushes both to `origin`.
3. The tag push **automatically triggers `release.yml`** on GitHub (safety net). Depending on
   whether you passed `--local-build`, the script either watches that CI run to completion, or
   builds/signs/drafts the release itself and leaves the CI run for you to `gh run cancel` if you
   don't want it. Either way you end up with a **draft** GitHub Release — invisible to the
   auto-updater and to users until published.
4. **You** review the draft and publish it. Only then does `tauri-plugin-updater` (which polls
   `releases/latest/download/latest.json`) actually offer the update to installed apps.

Steps 1–3 run one command; step 4 is the one to slow down for. Treat running `pnpm release` and
publishing the release as checkpoints, not something to chain through unattended — each is public
and hard to fully undo (a bad build still leaves a tag and a version-bump commit on `main`; a
published release is downloadable by real users within minutes).

## Step 1 — Decide the version bump

`cut-release.sh` takes `--bump=patch|minor|major` (default `patch`) or an explicit `--tag=vX.Y.Z`.
Look at what's actually merged since the last tag to decide:

- **patch** — bug fixes, internal refactors, docs/tooling changes, nothing user-visible changed
  in behavior.
- **minor** — new features or visible UI changes, backward compatible.
- **major** — breaking changes (unlikely for a desktop app with no external API, but e.g. a
  settings-format change that can't migrate automatically would qualify).

If unsure, look at what's queued up: `gh api "repos/Tlahey/git-manager/releases/generate-notes" -f "tag_name=vNEXT" -f "previous_tag_name=vCURRENT" -f "target_commitish=main" --jq .body`
(replace `vCURRENT` with the version in `apps/desktop/src-tauri/tauri.conf.json`) shows the exact
PR list the changelog will use — read it and use your judgment on patch/minor/major from there,
rather than guessing. **Note this list is merged-PR-based**: commits pushed straight to `main`
(the norm for this script's own admin-bypass pushes) won't show up in it, so the generated
changelog can come back empty even when real changes happened — see "If something goes wrong"
below for patching that after the fact. Tell the user what you picked and why before moving on;
this is exactly the kind of call worth surfacing rather than silently deciding.

## Step 2 — Confirm before running

**Confirm with the user before running `pnpm release`.** It pushes a commit and a tag straight to
`main` and kicks off a real signed build — there's no draft/review stage before that part happens.
(The script itself also prompts for a final `y/N` before pushing, unless `--yes` is passed —
that's a second, script-level checkpoint, not a substitute for asking first.)

```bash
pnpm release --bump=patch                     # CI builds it (release.yml), script watches
pnpm release --bump=minor --local-build       # this machine builds, signs and drafts it instead
pnpm release --tag=v1.2.0 --local-build --yes # explicit version, skip the confirmation prompt
```

`--local-build` needs a signing key set up first — see `tools/release/README.md`'s Signing
section (`~/.tauri/git-manager-release.env` must export `TAURI_SIGNING_PRIVATE_KEY`, the key's
actual string content, and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`). Without it the script exits
before touching anything.

The script always runs pre-flight checks (typecheck, lint, desktop test suite, `cargo fmt --check`,
`cargo clippy`) against a throwaway worktree of `origin/main` before bumping anything — not against
whatever branch is checked out locally. `--skip-validation` skips all of that; use it only for
fast iteration on the release tooling itself, not for a real release. A clean `cargo clippy` isn't
the bar — this codebase carries pre-existing warnings (see the root `CLAUDE.md`); the check only
needs to catch new errors, not add to the warning count.

If the user asks "is it safe to release right now" without specifying more, running the pre-flight
checks alone answers that question:

```bash
pnpm typecheck && pnpm lint && pnpm --filter @git-manager/desktop test
(cd apps/desktop/src-tauri && cargo fmt --check && cargo clippy --all-targets)
```

## Step 3 — Watch the build

Without `--local-build`, the script finds and watches the `release.yml` run the tag push
triggered — this is the slow step (15-20+ minutes: installs deps, builds Rust for two
architectures, signs the bundle). With `--local-build`, it builds/signs/drafts locally instead
(a few minutes) and prints the CI run's id so you can cancel the redundant one:

```bash
gh run cancel <id> --repo Tlahey/git-manager
```

Either way, the script doesn't exit until a draft release exists.

## Step 4 — Review the draft release before publishing

A **draft** Release named `vX.Y.Z` now exists on GitHub with the `CHANGELOG.md` section as its
body and the signed bundle (`.dmg`, `.app.tar.gz`, `.app.tar.gz.sig`) + `latest.json` attached.
Check:

```bash
gh release view vX.Y.Z
```

- Does the changelog body look right? (Empty/just a compare link means no PRs were merged since
  the last tag — see Step 1's note. Rewrite it by hand with `gh release edit vX.Y.Z --notes-file
<file>` if the release has real changes worth describing, and update the matching section in
  `CHANGELOG.md` too so the in-app Settings → Changelog view matches — note that a fix to
  `CHANGELOG.md` after the fact won't be reflected in an _already-built_ bundle's own embedded
  copy of the file, only in the GitHub release page and in whatever the _next_ release ships.)
- Are the expected assets attached — a `_universal.dmg`, `.app.tar.gz` + `.sig`, and `latest.json`?
- Draft asset URLs show a `releases/tag/untagged-<hash>` host, not the real tag — that's normal
  GitHub behavior for unpublished drafts and resolves to `releases/tag/vX.Y.Z` on publish; the
  asset URLs _inside_ `latest.json` are already the real, final ones either way.

If something's off (wrong changelog, missing assets, bad signature), fix the underlying issue and
either delete the draft (`gh release delete vX.Y.Z`) and re-run `cut-release.sh --local-build`
against the same existing tag, or `gh run rerun <run-id>` on the CI build — don't publish a broken
draft hoping to patch it in place, since the updater endpoint reads whatever's published.

## Step 5 — Publish (the step that actually ships it)

**This is the point of no return — confirm explicitly with the user before doing it.** Publishing
makes the release visible to `releases/latest/download/latest.json`, which every running copy of
the app polls when a user clicks "Check for updates" (Settings → General). Once published, real
users can and will pull it.

```bash
gh release edit vX.Y.Z --draft=false
```

After publishing, a good sanity check is confirming the updater manifest now resolves:

```bash
curl -sI https://github.com/Tlahey/git-manager/releases/latest/download/latest.json | head -1
```

A `302`/`200` means it's live.

## If something goes wrong mid-pipeline

- **`cut-release.sh` fails during pre-flight or version-bump** — nothing was pushed, safe to fix
  and re-run. If it fails after creating a local tag but before pushing (including when you
  decline the confirmation prompt), the script deletes that local tag itself on exit — re-running
  immediately for the same version won't collide with a stray leftover.
- **It fails after pushing the tag** — the version-bump commit and tag are already on `main`, and
  `release.yml`'s CI build likely already started. Either let that CI build finish and review its
  draft normally, or fix the issue and run `cut-release.sh --local-build` — `gh release create`
  will attach to the existing tag rather than erroring, so this doesn't require re-bumping the
  version. Don't re-run `cut-release.sh` without `--tag=<the same version>` pointed at a _new_
  version — it'll refuse with "Tag already exists on origin" for the one that's already pushed.
- **A draft release has assets missing or a botched changelog body** — safe to delete
  (`gh release delete vX.Y.Z`) and rebuild, since nothing was published yet.
- **You published and then found a bug** — don't unpublish; ship a new patch release instead. The
  updater already may have offered the download to someone.

See `tools/release/README.md` for the scripts themselves (flags, signing key setup) and
`tools/release/cut-release.sh`'s own header comment for the `protect-main` root cause in more
detail.
