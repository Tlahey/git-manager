<!--
No workflow in .github/workflows runs typecheck, lint or the tests — they build the docs and cut
releases. This checklist is the only gate between a broken build and a user's auto-updater, so the
boxes below are load-bearing rather than ceremonial: tick what you actually ran.
-->

## What changed

<!-- What a reader sees differently, or what the code now does. Behaviour, not a file list — the
     diff already lists the files. -->

## Why

<!-- The problem this solves. If a decision here was not the obvious one, say which and why: the
     next person to touch it will otherwise re-litigate it, or "fix" it back. -->

## Notes for the reviewer

<!-- The parts worth arguing with. Interpretations you made of an ambiguous ask, trade-offs you
     chose, anything you deliberately left out, and any consequence that is easy to miss from the
     diff. "Nothing" is a fine answer; a wrong assumption stated here costs a comment, and the same
     one discovered after merge costs a revert. -->

## Verification

- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm --filter @git-manager/desktop test`
- [ ] Rust, from `apps/desktop/src-tauri/`: `cargo fmt --check`, then
      `CARGO_TARGET_DIR=target/clippy cargo clippy --all-targets` — the separate target dir keeps
      clippy from poisoning the one `tauri dev` links against
- [ ] `cargo test` for any module with `#[cfg(test)]` tests that this touches
- [ ] Ran it in the app (`pnpm dev`), or said below why the change isn't observable there

<!-- A cached cargo run reports "Finished" in under a second and replays the previous diagnostics —
     `touch src/lib.rs` first when the answer matters. -->

## If this PR touches…

<!-- Skip every line that doesn't apply. Each one is a failure that is silent rather than loud. -->

- [ ] **A new Tauri command** — registered in `generate_handler![...]` in `src-tauri/src/lib.rs`, or
      the frontend cannot call it
- [ ] **A command's return shape** — mirrored in `packages/git-types`, which the Rust `serde` structs
      have to keep agreeing with
- [ ] **User-facing text** — goes through `t()`, and the key exists in **both**
      `packages/i18n/locales/en` and `.../fr`; en↔fr parity is a hard invariant
- [ ] **A new IPC or HTTP call** — made through `src/api/*.api.ts` (or the feature's own `api/`),
      never `invoke()`/`fetch()` from a component; bypassing it silently drops undo/redo and the
      achievement bus
- [ ] **A new or changed source file** — has its co-located test
- [ ] **New UI** — built from `@git-manager/ui` / `@git-manager/components` rather than hand-rolled;
      a re-rolled primitive drops the APCA contrast and ARIA guarantees those carry
- [ ] **An invariant someone could plausibly break later** — recorded in the module doc comment
      beside the code that enforces it, not in a `docs/` file that will drift
