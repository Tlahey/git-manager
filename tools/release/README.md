# tools/release

`build-local.sh` (`pnpm release:build:local`) builds the macOS Tauri bundle on this machine
instead of waiting on `release.yml`'s GitHub-hosted runner, which takes 15-20+ minutes for a
universal build (two full `cargo build --release` passes with full LTO, one per architecture).

The output is **unsigned**. The Tauri updater private key
(`TAURI_SIGNING_PRIVATE_KEY`) only exists as a GitHub Actions secret — it's write-only, so it
can't be pulled down and used here. Use this script to sanity-check that a build/bundle actually
works before pushing a release tag; the signed artifact real users install still comes from
`release.yml` (see `.claude/skills/release-process/SKILL.md`).

```bash
pnpm release:build:local              # this machine's architecture only, fastest
pnpm release:build:local -- --universal   # aarch64 + x86_64, matches what release.yml ships
```
