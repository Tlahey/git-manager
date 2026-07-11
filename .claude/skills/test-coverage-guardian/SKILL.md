---
name: test-coverage-guardian
description: Use this whenever creating a new source file or modifying an existing one in apps/desktop/src, packages/*/src, or apps/desktop/src-tauri/src — every such file needs a co-located test (Vitest for .ts/.tsx, a #[cfg(test)] module for .rs) that drives its own coverage to at least 95% on lines, branches, functions, and statements, with real edge cases exercised (errors, empty/boundary inputs, confirmation-gated destructive actions), not just the happy path. Trigger this for "add a feature", "write a component/hook/store/command/service", "fix a bug", or any task that touches .ts/.tsx/.rs source — not only when the user explicitly says "write tests" or "check coverage".
---

# Test coverage guardian

A coverage percentage is a proxy, not the goal. The reason this skill exists is that the lines
which never execute during a test run are disproportionately the ones that break in
production — error-handling arms, `else` branches, confirmation gates on destructive actions.
Chasing the number honestly (by finding and testing what's actually uncovered) gets those paths
exercised as a side effect; padding coverage with tests that don't assert anything meaningful
does not. Keep that distinction in mind throughout — see [references/edge-case-checklist.md](references/edge-case-checklist.md)
for what "real" edge-case coverage looks like, since it's the harder and more valuable half of
this skill, not the percentage itself.

## Workflow

1. **Write or edit the source file first**, as normal.
2. **Add or update its test**, following this repo's existing convention — don't invent a new
   one:
   - `.ts`/`.tsx`: colocate `Foo.test.tsx` next to `Foo.tsx` (or in a local `__tests__/` folder
     if that directory already uses one).
   - `.rs`: append a `#[cfg(test)] mod tests { use super::*; ... }` block to the bottom of the
     same file — this repo does not use separate test files for Rust.
3. **Before writing assertions, pick which edge cases actually apply** from
   [references/edge-case-checklist.md](references/edge-case-checklist.md) — empty/boundary
   inputs, error/rejection paths, confirmation-gated destructive actions, concurrent/async
   states, special input. Skip categories that plainly don't apply to this file's logic; forcing
   an irrelevant test just to pad the count is the wrong tradeoff.
4. **First time in this repo, or if the tooling looks missing**, run
   `scripts/setup_coverage_tooling.sh`. It's idempotent — checks before installing
   `@vitest/coverage-v8` and `cargo-llvm-cov`, and prints (rather than silently applies) the one
   `vite.config.ts` snippet to add if it isn't there yet, since that's a one-time hand-edit, not a
   repeated operation.
5. **Run the coverage check scoped to the file(s) you just touched** — not the whole repo. Most
   of this codebase predates this skill and isn't at 95% yet; that's not this task's job to fix,
   and a repo-wide run would be slow and full of unrelated noise anyway.
   - TS/TSX: `node .claude/skills/test-coverage-guardian/scripts/check_ts_coverage.mjs <path/to/File.tsx>`
   - Rust: `.claude/skills/test-coverage-guardian/scripts/check_rust_coverage.sh <path/to/file.rs>`
   Both accept multiple file paths in one call. Each prints per-file percentages for every metric
   plus the specific uncovered line numbers (and uncovered branches/functions where available) —
   use that list to know exactly what to add next, not just whether you passed.
6. **If any metric is below 95%, add tests targeting the reported lines/branches specifically,
   then rerun.** Repeat until every file you created or modified is at or above 95% on all
   applicable metrics, or you hit the documented exception below.
7. **If a file genuinely can't reach 95%, say so explicitly** — state the actual percentage and
   the reason — rather than silently shipping under-threshold coverage or writing hollow tests
   that inflate the number without exercising real behavior. The most common legitimate reason is
   a thin Tauri command that shells out or hits a real network/filesystem path with no
   `services/` extraction yet (`github.rs`, `ollama.rs`, `ssh.rs`, `undo.rs` — see
   [references/rust-test-patterns.md](references/rust-test-patterns.md) for what to do about it
   when it's actually worth extracting).

## Before debugging a confusing test failure

Check the relevant gotcha file first — several failure modes here look like application bugs
(0 calls recorded, `NaN` instead of a thrown error, a selector matching nothing) but are actually
known quirks of this repo's test environment:
- TS/TSX: [references/frontend-vitest-patterns.md](references/frontend-vitest-patterns.md) —
  query-cache bleed between tests, `react-virtual` rendering nothing in jsdom, missing
  `PointerEvent`, hex-vs-rgb color serialization, the Monaco fake harnesses, `act()` timing, a
  `userEvent`/clipboard mock ordering trap, and a `.rejects.toThrow('string')` quirk in this
  repo's vitest version.
- Rust: [references/rust-test-patterns.md](references/rust-test-patterns.md) — where tests live,
  table-driven tests for pure logic, building a real repo in a tempdir for `git2`-touching code,
  and why command-layer functions usually aren't where the test belongs.

## Scope discipline

Only the files created or modified in the current task are held to this bar. If you notice a
large pre-existing coverage gap elsewhere while working, mention it rather than silently
expanding the current task to fix it — that's a separate piece of work with its own scope and
review.
