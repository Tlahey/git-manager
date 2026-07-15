---
name: release-process
description: Use this whenever the user wants to cut, prepare, trigger, or publish a new git-manager release — phrases like "release a new version", "let's ship v1.2.0", "bump the version", "sortir une release", "on release quoi pour cette version", "publie la mise à jour", or any request to run the "Prepare Release" GitHub Actions workflow. Also use it if the user asks what the release process looks like, whether it's safe to release right now, or how the changelog/version bump/build pipeline fits together — this repo has no CI gate on tests, so this skill is the only thing standing between a broken build and a real user's auto-updater.
---

# git-manager release process

This repo ships a signed macOS app with an in-app auto-updater, driven by two GitHub Actions
workflows plus a human in the loop. There is **no CI workflow** that runs tests/lint/typecheck on
every push — `prepare-release.yml` will happily bump the version and tag `main` even if the build
is currently broken. That gap is exactly why this skill exists: the local pre-flight checks below
are the only quality gate this pipeline has.

## The pipeline, in one picture

1. **You** run local checks and decide the version bump.
2. **`prepare-release.yml`** (manual trigger) bumps the version everywhere, asks GitHub for the
   list of merged PRs since the last tag, writes that into `CHANGELOG.md`, commits straight to
   `main`, and pushes a `vX.Y.Z` tag.
3. That tag push **automatically triggers `release.yml`**, which builds a signed universal
   (Apple Silicon + Intel) macOS bundle and publishes it as a **draft** GitHub Release — draft
   releases are invisible to the auto-updater and to users.
4. **You** review the draft and publish it. Only then does `tauri-plugin-updater` (which polls
   `releases/latest/download/latest.json`) actually offer the update to installed apps.

Steps 2–3 are automated once triggered; steps 1 and 4 are where judgment and confirmation matter
most. Treat triggering the workflow and publishing the release as checkpoints, not something to
chain through unattended — each is public and hard to fully undo (a bad build still leaves a tag
and a version-bump commit on `main`; a published release is downloadable by real users within
minutes).

## Step 1 — Local pre-flight (safe to run without asking)

Run these from the repo root before triggering anything. They're read-only/local, so there's no
need to check in before running them — only before acting on a failure by pushing ahead anyway.

```bash
pnpm typecheck   # turbo, all packages
pnpm lint        # turbo, all packages (oxlint)
pnpm --filter @git-manager/desktop test   # vitest run
```

For the Rust backend, from `apps/desktop/src-tauri`:

```bash
cargo fmt --check
cargo clippy
```

A clean `cargo fmt --check` is expected. `cargo clippy` is noisier: this codebase currently
carries ~30 pre-existing warnings (redundant closures, borrow suggestions, etc. — nothing
release-blocking on its own). Don't treat the whole repo being warning-free as the bar; instead
compare clippy's output against what it looked like before your change and make sure you didn't
*add* new warnings or, more importantly, any errors. If any of the four commands above fail
outright (not just clippy warnings), stop and fix it — don't trigger a release on top of a red
build, since nothing downstream will catch that for you.

If the user asks "is it safe to release right now" without specifying more, this step alone
answers that question — run it and report back before going further.

## Step 2 — Pick the version bump

`prepare-release.yml` takes a `bump` input: `patch`, `minor`, or `major` (semver). Look at what's
actually merged since the last tag to decide:

- **patch** — bug fixes, internal refactors, docs/tooling changes, nothing user-visible changed
  in behavior.
- **minor** — new features or visible UI changes, backward compatible.
- **major** — breaking changes (unlikely for a desktop app with no external API, but e.g. a
  settings-format change that can't migrate automatically would qualify).

If unsure, look at what's queued up: `gh api "repos/Tlahey/git-manager/releases/generate-notes" -f "tag_name=vNEXT" -f "previous_tag_name=vCURRENT" -f "target_commitish=main" --jq .body`
(replace `vCURRENT` with the version in `apps/desktop/src-tauri/tauri.conf.json`) shows the exact
PR list `prepare-release.yml` will use for the changelog — read it and use your judgment on
patch/minor/major from there, rather than guessing. Tell the user what you picked and why before
moving on; this is exactly the kind of call worth surfacing rather than silently deciding.

## Step 3 — Trigger `prepare-release.yml`

**Confirm with the user before running this.** It pushes a commit and a tag straight to `main`
and kicks off a real signed build — there's no draft/review stage before that part happens.

```bash
gh workflow run prepare-release.yml -f bump=<patch|minor|major>
```

Then watch it rather than walking away:

```bash
gh run list --workflow=prepare-release.yml --limit=1
gh run watch <run-id>
```

If it succeeds, it will have pushed `vX.Y.Z` to `main`, which fires `release.yml` automatically.
Watch that one too — it's the slower step (installs deps, builds Rust for two targets, signs the
bundle):

```bash
gh run list --workflow=release.yml --limit=1
gh run watch <run-id>
```

## Step 4 — Review the draft release before publishing

Once `release.yml` finishes, a **draft** Release named `git-manager vX.Y.Z` exists on GitHub with
the `CHANGELOG.md` section as its body and the signed bundle + `latest.json` attached. Check:

```bash
gh release view vX.Y.Z
```

- Does the changelog body look right (matches what you previewed in Step 2)?
- Are the expected assets attached (the `.dmg`/`.app.tar.gz` and `latest.json`)?

If something's off (wrong changelog, failed codesign, etc.), fix the underlying issue and either
`gh run rerun <run-id>` on `release.yml` (same tag, same commit) or cut a follow-up patch release
— don't publish a broken draft hoping to patch it in place, since the updater endpoint reads
whatever's published.

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

- **`prepare-release.yml` fails before pushing** (e.g. the Node bump script errors) — nothing was
  pushed, safe to fix and re-run.
- **It fails after pushing the tag but `release.yml` never got a clean build** — the version-bump
  commit and tag are already on `main`. Fix the issue, then `gh run rerun` on `release.yml` for
  that same tag rather than re-running `prepare-release.yml` (which would try to bump the version
  *again* on top of the one that already landed).
- **A draft release has assets missing or a botched changelog body** — safe to delete
  (`gh release delete vX.Y.Z`) and rerun `release.yml`, since nothing was published yet.
- **You published and then found a bug** — don't unpublish; ship a new patch release instead. The
  updater already may have offered the download to someone.
