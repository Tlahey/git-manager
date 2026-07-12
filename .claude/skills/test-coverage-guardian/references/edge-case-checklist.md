# Edge-case checklist

A coverage percentage is a proxy, not the goal. The real goal is that the lines and branches
which tend to break in production — error paths, empty/boundary inputs, confirmation-gated
destructive actions — are the ones actually exercised, not just the happy path that was easiest
to write a test for. Use this checklist to decide which categories genuinely apply to the file
you're testing; skip categories that don't apply rather than forcing an irrelevant test just to
inflate the count (a pure string-formatting helper has no async/loading edge cases, for example).

## Empty / absent input

- Empty collections: zero commits, empty branch list, empty diff (no hunks), repo with no
  remotes, empty stash list.
- Absent optional fields: a `GitDiff` with no `old_path` (renamed/added file), a commit with no
  parent (initial commit), a `None`/`null` config value falling back to a default.

## Boundary values

- Smallest non-empty case: single-line file, single-commit repo, single-hunk diff.
- Exactly-at-threshold values: 0 vs 1 conflicting files, a diff context window boundary, a string
  exactly at a truncation length.
- Largest realistic case if the logic does anything size-dependent (pagination, virtualization,
  truncation) — don't assume it scales without a data point above the threshold.

## Error / rejection paths

- Every `Err(...)` arm of an `AppError` variant a function can return, not just the `Ok` path.
- Every `.catch()` / rejected promise a frontend API call can produce (network failure to Ollama,
  GitHub API error response, invalid SSH key, git2 operation failure surfaced as a string).
- Partial failures: one item in a batch operation fails while others succeed (e.g. multi-file
  stage, multi-branch fetch).

## Confirmation-gated / destructive actions

This repo has specific guardrails around destructive operations (see the root `CLAUDE.md`
"Security-relevant conventions" section) — these branches are exactly the kind that are easy to
leave untested because they're not on the "normal" path, and exactly the kind where a regression
is expensive:

- Hard reset's confirmation requires the literal string `RESET` — test both the correct
  confirmation text (action proceeds) and an incorrect one (action is rejected, nothing happens).
- Force-push is explicit opt-in — test both the default (off, rejected/blocked) and the
  explicitly-enabled case.
- Protected-branch guards — test an operation attempted against a protected branch (blocked) and
  a non-protected one (allowed).

## Concurrent / async state

- Loading and in-flight states: a component rendered while its query is still pending, not just
  after it resolves.
- Cancellation: the Ollama generation cancel flag actually stopping a stream, not just existing.
- Rapid/repeated interaction: double-clicking a submit action, a redo stack that must be cleared
  after a new undoable action is pushed (this repo has a documented past bug of exactly this
  shape — a bypass of the API layer silently skipped `clearRedo`).

## Special / unusual input

- Filenames or commit messages with unicode, spaces, or characters that look like diff markers
  (`+`, `-`, `@@`) to make sure parsing doesn't confuse content for structure.
- Very long strings (commit message, branch name) if the code truncates or wraps them.
- Multi-line commit messages (subject + body) if the code splits or displays them separately.

## Rust-specific

- Every `Option::None` branch, not just `Some`.
- Every enum variant of a `match`, including ones that look "impossible" in practice — if the
  compiler requires a catch-all arm, that arm is reachable by construction and should have a test
  proving what it does.
