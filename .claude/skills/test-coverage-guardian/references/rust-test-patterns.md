# Rust test conventions (apps/desktop/src-tauri)

## Placement

This repo does **not** use separate `_test.rs` files or a top-level `tests/` integration
directory for unit tests. Every existing test lives in a `#[cfg(test)] mod tests { use super::*;
... }` block appended at the bottom of the same file it tests — see
`services/git_merge_diff.rs` and `services/git_interactive_rebase.rs`. Follow that pattern:
append to the file you just wrote or edited, don't create a sibling file.

Small test-only helper functions/builders (e.g. a `hunk(base_start, base_len, side_len) -> Hunk`
constructor to keep test bodies readable) belong inside the `mod tests` block itself, not in the
production code above it.

## Pure-logic services: table-driven tests, no fixtures needed

Most of the current test coverage is on pure transformation logic (diff/merge block layout,
rebase-plan construction) that takes plain data in and returns plain data out — no filesystem or
`git2::Repository` involved. For this kind of function, just construct inputs directly and assert
on the returned structure, one `#[test] fn` per distinct case. Favor several small, named tests
over one large test with many assertions — a failing `fn ours_only_change()` tells you exactly
which case broke; a failing `fn test_all_cases()` doesn't.

## Services that need a real repo: build one in a tempdir

Once you're testing something that actually calls into `git2` (stage/commit, branch create,
stash push/pop, reset/revert), pure input/output fixtures aren't enough — you need a real
on-disk repo. This repo doesn't have that harness yet (no test currently exercises `git2` against
a real repository), so when you hit this, add it:

1. Add `tempfile` as a dev-dependency if it isn't already there: `cargo add tempfile --dev` (run
   from `apps/desktop/src-tauri`).
2. Build a throwaway repo per test (or per `mod tests` via a shared helper), commit whatever
   fixture state the function under test needs, then call the function against that path:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn init_repo_with_commit() -> (TempDir, git2::Repository) {
        let dir = TempDir::new().unwrap();
        let repo = git2::Repository::init(dir.path()).unwrap();
        let sig = git2::Signature::now("Test", "test@example.com").unwrap();
        std::fs::write(dir.path().join("a.txt"), "hello\n").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(std::path::Path::new("a.txt")).unwrap();
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        repo.commit(Some("HEAD"), &sig, &sig, "initial", &tree, &[]).unwrap();
        (dir, repo) // keep `dir` alive for the test's lifetime — dropping it deletes the tempdir
    }

    #[test]
    fn some_operation_on_clean_repo() {
        let (_dir, repo) = init_repo_with_commit();
        // ... call the function under test with `repo` or `_dir.path()`
    }
}
```

The `TempDir` guard must stay bound (`_dir`, not `_`) for as long as the repo is used — dropping
it deletes the directory immediately, which is a common source of "file not found" failures that
look unrelated to the actual test.

## Command layer (`commands/*.rs`) is usually not where the tests belong

Per this repo's architecture rule (see the `architecture-guardian` skill), a `#[tauri::command]`
function should stay thin — deserialize input, delegate to a `services/*.rs` function, map errors,
serialize output. If you're testing a command and find yourself needing a `tauri::AppHandle` or
`tauri::State` to exercise the real logic, that's usually a sign the logic itself belongs in (or
already is in) `services/`, and the service function is what should carry the test — it takes
plain arguments and returns a plain `Result`, no Tauri runtime required.

For the handful of commands that intentionally have no service (`github.rs`, `ollama.rs`,
`ssh.rs`, `undo.rs` — see the root `CLAUDE.md` for why), reaching 95% may require pulling the
shell/HTTP/filesystem-driven logic into a small pure function that takes an injected path/client
instead of constructing one internally, so it can be called from a test without a real network
call or `AppHandle`. If that extraction is out of scope for the current task, say so explicitly
with the actual percentage rather than leaving it silently under threshold or writing tests that
don't exercise the real logic (e.g. asserting on a hardcoded mock return value).

## Branch coverage needs a nightly toolchain

`cargo llvm-cov --branch` (used by this skill's `check_rust_coverage.sh`) requires a nightly Rust
toolchain — branch-coverage instrumentation isn't available on stable as of the toolchain this
repo currently targets. If nightly isn't installed, the script falls back to line/function/region
coverage only and reports branch coverage as unavailable rather than failing outright. Installing
a nightly toolchain (`rustup toolchain install nightly`) changes the user's global rustup state,
so `setup_coverage_tooling.sh` prints that step as an instruction rather than running it
automatically — run it yourself if you want real branch numbers, or proceed without them.

## Function coverage is scoped to `--lib` on purpose

`check_rust_coverage.sh` runs `cargo llvm-cov --lib`, not a plain `cargo llvm-cov`. This crate
has two targets that both link the library code — `src/lib.rs` (where every `#[cfg(test)]` lives)
and `src/main.rs` (the thin Tauri binary entry point, which has no tests of its own). Without
`--lib`, cargo-llvm-cov instruments *both* targets, and every `pub fn` in the lib gets a second,
separate coverage entry from the binary target's perspective — one where it's fully exercised
(by the lib's own tests) and one where it shows 0 hits (because the binary target runs 0 tests).
The two get counted as separate functions, so real 100%-tested functions silently report as ~50%
covered. Restricting to `--lib` avoids instrumenting the untested binary target in the first
place, so this doesn't come up. If a future change adds tests under `src/main.rs` itself, revisit
this — for now there are none, so `--lib` loses nothing.
