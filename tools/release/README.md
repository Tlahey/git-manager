# tools/release

## Cutting a release

`cut-release.sh` (`pnpm release`) runs the whole release process from this machine: pre-flight
checks (typecheck, lint, desktop test suite, `cargo fmt --check`, `cargo clippy`), version bump +
`CHANGELOG.md` entry, commit + tag, and push to `main`. It always operates on a throwaway worktree
of `origin/main`, never on whatever branch is checked out locally, so it's safe to run from any
clone.

```bash
pnpm release --tag=v0.3.0                 # explicit version
pnpm release --bump=minor                 # or patch / major — computed from the current tag
pnpm release --bump=patch --yes           # skip the push confirmation prompt
pnpm release --bump=patch --local-build   # build/sign/draft here instead of waiting on CI
```

Pushing the tag always fires `release.yml`'s own trigger too, as a free safety-net CI build — that
redundancy is intentional (see below), not a bug to fix. By default the script then waits on and
streams that CI build. With `--local-build`, it instead builds, signs (see Signing below) and
drafts the release itself, so you don't have to wait 15-20+ minutes for a 10x-billed macOS Actions
runner just to get a reviewable draft; it prints the CI run's id so you can `gh run cancel` it
yourself if you don't want the redundant build.

Either way it stops after the build finishes — it never publishes the draft release itself (see
`.claude/skills/release-process/SKILL.md` for why that stays a manual, reviewed step). It prints
the draft URL and the exact `gh release edit` command to run once you've checked it.

This exists because `.github/workflows/prepare-release.yml`'s equivalent job can't work on this
repo: it pushes with the default `GITHUB_TOKEN`, which the `protect-main` ruleset always rejects
(`GH013: Cannot update this protected ref`), and — because this repo is under a personal account,
not an organization — the ruleset has no way to grant the GitHub Actions app a bypass the way an
org-owned repo could. Only a repo admin's own credentials bypass it, so the push has to come from
one, which is what running this script locally (as an admin) does.

## Building locally without releasing

`build-local.sh` (`pnpm release:build:local`) builds the macOS Tauri bundle on this machine
instead of waiting on `release.yml`'s GitHub-hosted runner, which takes 15-20+ minutes for a
universal build (two full `cargo build --release` passes with full LTO, one per architecture).

## Signing

The script auto-signs if `~/.tauri/git-manager-release.env` exists — it's `source`d before the
build and expected to export `TAURI_SIGNING_PRIVATE_KEY_PATH` and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, which `tauri build` itself then picks up. This must be the
same private key as the `TAURI_SIGNING_PRIVATE_KEY` GitHub secret `release.yml` signs with (see
the pubkey in `apps/desktop/src-tauri/tauri.conf.json`'s `plugins.updater`) — otherwise a
locally-signed build won't be trusted by an existing install's auto-updater, or vice versa.

That file lives outside the repo (never commit a private key) and is not created by this script.
To (re)create it after generating a keypair with `pnpm --filter @git-manager/desktop exec tauri
signer generate -w ~/.tauri/git-manager-updater.key`:

```bash
cat > ~/.tauri/git-manager-release.env <<'EOF'
export TAURI_SIGNING_PRIVATE_KEY_PATH="$HOME/.tauri/git-manager-updater.key"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD='...'
EOF
chmod 600 ~/.tauri/git-manager-release.env
```

Without that file (or those two vars set another way), the build is unsigned — still useful to
sanity-check that a build/bundle actually works before pushing a release tag, just not something
an existing install would accept as an update (see `.claude/skills/release-process/SKILL.md`).

```bash
pnpm release:build:local              # this machine's architecture only, fastest
pnpm release:build:local -- --universal   # aarch64 + x86_64, matches what release.yml ships
```
