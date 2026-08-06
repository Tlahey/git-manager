# tools/release

`build-local.sh` (`pnpm release:build:local`) builds the macOS Tauri bundle on this machine
instead of waiting on `release.yml`'s GitHub-hosted runner, which takes 15-20+ minutes for a
universal build (two full `cargo build --release` passes with full LTO, one per architecture).

The output is **unsigned by default**. `tauri build` itself signs automatically when
`TAURI_SIGNING_PRIVATE_KEY_PATH` (or `TAURI_SIGNING_PRIVATE_KEY`) and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` are set in the environment — same key as the
`TAURI_SIGNING_PRIVATE_KEY` GitHub Actions secret that `release.yml` uses, so a locally-signed
build is trusted by the same installs. Whoever holds that private key file locally can export:

```bash
export TAURI_SIGNING_PRIVATE_KEY_PATH=~/.tauri/git-manager-updater.key
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD='...'
```

before running the script to get a signed build. Without those two variables set, the build is
unsigned — fine for sanity-checking that a build/bundle actually works before pushing a release
tag, but not something an existing install's auto-updater would accept. The GitHub secret and any
local copy of the private key must be rotated together (see the pubkey in
`apps/desktop/src-tauri/tauri.conf.json`'s `plugins.updater` — it must match whichever private key
signed the build) or old and new installs stop trusting each other's updates.

```bash
pnpm release:build:local              # this machine's architecture only, fastest
pnpm release:build:local -- --universal   # aarch64 + x86_64, matches what release.yml ships
```
