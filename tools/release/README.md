# tools/release

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
