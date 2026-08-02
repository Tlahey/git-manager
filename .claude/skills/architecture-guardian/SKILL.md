---
name: architecture-guardian
description: Use before writing or right after writing code in git-manager that adds/changes a Tauri command (apps/desktop/src-tauri/src/commands/*.rs or services/*.rs), a React component, hook, Zustand store, or an api/*.api.ts file. Reminds of the repo's mandatory layering rules (one file = one responsibility, every operation goes through a service/API layer) and file-size/complexity discipline — split a component, function, or module before it crosses ~300 lines or piles up nested branches and mixed concerns, into a feature-scoped components/hooks/utility file with its own test — so new code doesn't reproduce known anti-patterns (oversized files mixing concerns, invoke() calls bypassing the API layer, duplicated Diff structs/helpers, untested extractions). Also use whenever a file you're editing is already near or past 300 lines, the user asks how to split/refactor/organize a large component, hook, or function, or the task is to safely retrofit an existing god-file/god-component into smaller test-mapped hooks and colocated `*.config.ts` files (test-backed incremental extraction, reusing an existing manager pattern before inventing a new one, barrel re-exports for a multi-domain split). Not for general code review of correctness — see the code-review skill for that.
---

# Architecture guardian

This repo has a documented architecture plan at
[docs/architecture/2026-07-architecture-refactor-plan.md](../../../docs/architecture/2026-07-architecture-refactor-plan.md)
and a **frozen** execution record at
[docs/architecture/2026-07-architecture-refactor-tracking.md](../../../docs/architecture/2026-07-architecture-refactor-tracking.md)
— that tracker's own header says "Finished, and not to be updated"; see step 4 under "What to do
with this" for where new findings actually go. The plan (phases 1-6) is fully applied — R1 and R2
below are no longer aspirational, they're the current state of the code. Treat them as invariants
to preserve, not goals to work toward: before adding new code in the areas below, apply these rules
so we don't reintroduce problems that were already found and fixed. R3 is the newer, complementary
half: a 2026-08 audit found three files that had grown past these invariants anyway (`GitGraph.tsx`,
`git.api.ts`, `RepositorySidebar.tsx`) and R3 is the safe-retrofit method that came out of unwinding
them — use it whenever you're the one un-growing a file rather than keeping a new one small.

## When this applies

- Adding or editing a `#[tauri::command]` in `apps/desktop/src-tauri/src/commands/*.rs`, or its
  backing logic in `apps/desktop/src-tauri/src/services/*.rs`.
- Adding or editing a React component under `apps/desktop/src/components/` or `apps/desktop/src/app/**/components/`.
- Adding or editing a hook under `apps/desktop/src/hooks/`.
- Adding or editing a Zustand store under `apps/desktop/src/stores/`.
- Adding or editing a file under `apps/desktop/src/api/*.api.ts` or `apps/desktop/src/lib/*.ts`.
- Any time the file or function you're about to touch is already near or past ~300 lines, or the
  user asks how to split/refactor/organize a large component, hook, or module — this applies
  project-wide, not just to the paths above.

## Rules to apply (R1 / R2 from the plan, R3 from the 2026-08 retrofit audit)

**R1 — one file, one responsibility.**

- A `.tsx` component renders. If it needs polling, timers, tree-building, parsing, or any
  non-presentational logic, that logic belongs in a hook (`hooks/useX.ts`), not inline in the
  component. Example of what NOT to repeat: `GithubSection.tsx` grew to 562 lines by keeping the
  OAuth device-flow polling inline instead of a `useGithubDeviceFlow` hook.
- A Rust command function should stay thin: deserialize input, call into business logic, map
  errors, serialize output. `apps/desktop/src-tauri/src/services/` already exists and holds diff
  generation (`git_diff.rs`), stage/unstage/commit/discard (`git_commit.rs`), repo open/build
  (`git_repo.rs`) and commit-graph layout (`git_graph.rs`) — if you're touching one of those
  domains, delegate to the service rather than adding `git2` calls back into the command. For
  domains without a service yet (`branch.rs`, `remote.rs`, `stash.rs`, `rollback.rs`, `fixup.rs`),
  at minimum don't duplicate logic that exists elsewhere — reuse `utils.rs` (`short_oid()`,
  `get_git_signature()`) and `models.rs` (`GitDiffLine`/`GitDiffHunk`/`GitDiffFile`/`GitDiff`)
  instead of re-deriving them.
- A page/parent component should not have large sub-components (rows, cards, panels) defined
  inline — split them into a local `components/` folder (already required by `.agents/AGENTS.md`).
- Treat ~300 lines as the point to actively look for a seam, for both components and individual
  functions (TS or Rust) — not a hard limit to hit exactly, but the size where deferring the split
  starts costing more than doing it now. `CommitFileList.tsx` (697 lines), `git_merge_diff.rs`
  (656) and `commands/repo.rs` (516) are examples of what happens when a file keeps absorbing "just
  one more case" — none of them need an urgent rewrite, but new logic in that area should default
  to a new file, not another method bolted onto the existing one. The 2026-08 audit's clearest
  example is `GitGraph.tsx` (1299 lines): on top of 13 imported hooks it accumulates ~20 more
  inline `useEffect`/`useMemo`/`useState`/`useRef` calls covering at least 7 unrelated concerns
  (column layout, search highlighting, drag & drop, conflict auto-open, rebase progress, stash
  indexing, scroll sync) — see R3 below for how that one is actually being unwound. The same
  applies well under 300 lines if a function has deep nesting, many branches, or handles more than
  one concern you couldn't summarize in a single sentence — line count is a proxy for cognitive
  load, not the actual target, so don't let a 280-line function slide just because it's under the
  number.
- **Line count alone doesn't prove a problem — read the file before proposing a split.**
  `GraphRow.tsx` (568 lines, one of the highest-churn files in the repo) looks identical in shape
  to `GitGraph.tsx` from the outside — a big, frequently-touched git-graph component — but a full
  read (2026-08 audit) found it already cleanly split into a per-column-type render function
  (`CellContent`) and the row shell (`GraphRow`), with the size explained by legitimate feature
  breadth (WIP row, worktree row, conflict row, bisect status, inline tag input), not disorder.
  Nothing there needs extracting. Don't let a size/churn heuristic substitute for actually opening
  the file.
- This doesn't apply uniformly to flat aggregator files like `api/git.api.ts`: a file that's just
  many independent, near-identical thin wrappers (one per Tauri command, no shared state or
  branching) is lower-risk than the same line count concentrated in one function or component,
  because there's nothing to hold in your head across lines. If one of those wrapper functions
  grows real logic, extract _that function_, not the whole file. But check this premise before
  relying on it: `git.api.ts` was 667 lines when this note was written and is 1253 now, and it grew
  a genuine shared kernel in the process (`generateId`/`pushAction`/`clearRedo`,
  `pendingRebasePreviousOid`, `settleRebase`, `raiseHookFailureCard`/`withHookFailureCard`) that
  every one of its ~90 exports can reach into across 9 unrelated git sub-domains (commit, fixup,
  patch, stash, branch, remote, log, bisect, rebase). Once a "flat" aggregator has cross-cutting
  state like that, "nothing to hold in your head across lines" no longer holds — see R3 for the
  shared-kernel-first, barrel-file split that applies once you're in this situation.
- When you extract a sub-component, hook, or utility function, give it its own colocated test
  (React Testing Library for components, a plain Vitest unit test for hooks/utilities, `#[cfg(test)]`
  for Rust modules — see `apps/desktop/vitest.config.ts` / `git_merge_diff.rs` for the existing
  patterns, or the `test-coverage-guardian` skill for the coverage bar) rather than relying on the
  parent's coverage. An untested extraction just moves the risk instead of reducing it, and defeats
  the point of splitting for testability in the first place.

**R2 — every operation goes through the service/API layer.**

- Frontend: never call `invoke()` directly from a component, hook, or store, and never import a
  function from `lib/tauri.ts` directly either (type-only imports are fine) — go through
  `api/*.api.ts` so the operation is reachable from one place. This is what lets cross-cutting
  concerns like the `appEventBus` event bus (`lib/appEventBus.ts`, notified via `callCommand()` in
  `api/service.ts`) and undo/redo history (`pushAction`/`clearRedo` in
  `stores/undoHistory.store.ts`) hook in without touching every call site. A repo-wide audit
  (tracking doc action 6.5) found 27 files bypassing this and fixed them — as of that fix, zero
  files under `hooks/`, `components/`, or `stores/` call a `lib/tauri.ts` function directly. Don't
  reintroduce one: it's easy to miss because the code still compiles and mostly works, it just
  silently drops the undo/redo or achievement side effect (this happened for real — a raw
  `checkoutBranch()` call skipped `clearRedo` until the audit caught it).
- Backend: a command should not reach into `git2` for logic that's really business logic
  (validation, computation, traversal) — once `services/` exists for that domain, delegate to it.
- If you're adding a new cross-cutting concern (analytics, achievements, audit logging), hook it
  into the existing Observer (`lib/appEventBus.ts` + `api/service.ts`'s `callCommand()`) instead of
  adding ad hoc notification calls at each call site.

**R3 — retrofitting a file that's already too large (safe, test-mapped extraction).**

R1/R2 are about not creating the next god-file. R3 is what to actually do once one already exists —
distilled from unwinding `GitGraph.tsx`, `git.api.ts` and `RepositorySidebar.tsx` in the 2026-08
audit (see `AUDIT.md` at the repo root for the full diagnostic behind these rules; that file is a
point-in-time audit artifact, not a living doc — don't treat it as a spec to keep in sync).

- **Map the cut to an existing test before moving anything.** Find the `describe`/`it` block (TS)
  or `#[cfg(test)]` case (Rust) that already exercises the behavior you're about to relocate. If
  none covers it, add that test _first_, before moving the code — not after. In practice a
  well-tested god-file already has near 1:1 coverage of its natural seams (`GitGraph.test.tsx`'s 81
  `describe`/`it` blocks turned out to map almost one-to-one onto the hooks worth extracting); a
  seam with no matching test is the one to be most careful with, not skip.
- **Order of extraction: pure before effectful.** Move `useMemo`-only derived state (no side
  effects, no external calls) before effect-driven hooks, and save anything with cross-hook
  coupling for last. Pure code is both the safest to move and the fastest to verify in isolation.
- **One concern, one commit, test in between.** Never batch several extractions into one commit —
  if something regresses, you want the diff that caused it to be the only thing in the commit, not
  one of five.
- **Reuse an existing manager/pattern before inventing a new one.** Before designing a new
  abstraction, search the codebase for a sibling that already solved the same shape of problem.
  Example: `RepositorySidebar.tsx` needed to bundle 8 dialogs + their open-state out of the main
  component — rather than invent a new pattern, the answer is to copy the one `GitGraph.tsx`
  already uses for exactly this (`GitGraphOverlayManager`, `TagDialogsManager`) into a
  `SidebarDialogsManager`. A second, slightly-different-looking solution to an already-solved
  problem is its own kind of duplication.
- **Split a large multi-domain aggregator behind a barrel re-export**, not by migrating every call
  site in one PR. When `git.api.ts`'s ~90 exports get split into domain files
  (`git-commit.api.ts`, `git-stash.api.ts`, `git-remote.api.ts`, …), `git.api.ts` itself becomes
  `export * from './git/git-commit.api'` etc., so the ~150 existing `from '../api/git.api'` import
  sites keep working untouched; migrate them to the specific file gradually (or not at all) instead
  of a big-bang rename.
- **When you notice the config pattern, use it — see the CLAUDE.md bullet under "Frontend
  organization rules" and `components/git-graph/columns.config.ts` for the shape.** A repeated
  `condition ? X : undefined` across several props for the same discriminant, or a lookup table
  keyed by a fixed enum, belongs in a colocated `*.config.ts`, not another ternary.
- **A test file inherits the same split.** If the god-file has a single large test file
  (`git.api.test.ts` was 806 lines / 81 blocks for 9 domains), move its `describe` blocks into the
  matching new co-located test file in the same commit as the source split — don't leave the test
  file as the one remaining aggregator.

## What to do with this

1. Before writing the code, check whether the file you're about to touch already grew past
   ~300 lines or mixes rendering with logic. The plan's original audit table is historical; the
   current state — including everything fixed in Phase 6 — is in the execution tracking's tables
   and Journal. If the file you're touching is already large, prefer extracting the piece you're
   adding into its own hook/service/component instead of adding more lines to it, and give that
   extraction its own test.
2. After writing the code, if the change is non-trivial (new command, new component with any
   non-trivial logic, new store), consider invoking the `architecture-reviewer` agent to check the
   diff against these rules before opening a PR.
3. If a rule genuinely doesn't fit the situation, say so explicitly and explain why rather than
   silently ignoring it. R1/R2/R3 live in this skill file, not in the (frozen) architecture docs —
   update this file directly if a rule needs to change.
4. If you find a _new_ violation (a file that grew, a new `lib/tauri.ts` bypass, duplicated
   logic): **do not touch `docs/architecture/2026-07-architecture-refactor-tracking.md`** — its own
   header says it plainly ("Finished, and not to be updated... nothing here should be checked off,
   re-ordered or extended"). Its stated convention is "a new refactor gets its own dated document"
   (see `2026-07-notification-system-refactor.md`, `2026-07-panels-interaction-refactor.md`,
   `2026-07-rewards-system-refactor.md` for the shape to copy). For an initiative-sized retrofit
   spanning several files and sessions, create a new `docs/architecture/YYYY-MM-<name>-refactor.md`
   that way. For a single small extraction that doesn't warrant its own doc, it's enough to explain
   the "why" in the PR description and/or a module doc comment on the new file (per CLAUDE.md's
   "Invariant-shaped rationale lives in the module doc comment" convention) — don't create a dated
   doc for every minor split.
