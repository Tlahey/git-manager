---
name: architecture-guardian
description: Use before writing or right after writing code in git-manager that adds/changes a Tauri command (apps/desktop/src-tauri/src/commands/*.rs), a React component, hook, Zustand store, or an api/*.api.ts file. Reminds of the repo's mandatory layering rules (one file = one responsibility, every operation goes through a service/API layer) so new code doesn't reproduce known anti-patterns (oversized files mixing concerns, invoke() calls bypassing the API layer, duplicated Diff structs/helpers). Not for general code review of correctness — see the code-review skill for that.
---

# Architecture guardian

This repo has a documented architecture plan at
[docs/architecture/13-architecture-refactor-plan.md](../../../docs/architecture/13-architecture-refactor-plan.md)
built from a real audit of the codebase, and a living execution log at
[docs/architecture/14-architecture-refactor-tracking.md](../../../docs/architecture/14-architecture-refactor-tracking.md).
As of that tracker, the plan (phases 1-6) is fully applied — R1 and R2 below are no longer
aspirational, they're the current state of the code. Treat them as invariants to preserve, not
goals to work toward: before adding new code in the areas below, apply these rules so we don't
reintroduce problems that were already found and fixed.

## When this applies

- Adding or editing a `#[tauri::command]` in `apps/desktop/src-tauri/src/commands/*.rs`.
- Adding or editing a React component under `apps/desktop/src/components/` or `apps/desktop/src/app/**/components/`.
- Adding or editing a hook under `apps/desktop/src/hooks/`.
- Adding or editing a Zustand store under `apps/desktop/src/stores/`.
- Adding or editing a file under `apps/desktop/src/api/*.api.ts`.

## Rules to apply (R1 / R2 from the plan)

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

## What to do with this

1. Before writing the code, check whether the file you're about to touch already grew past a
   reasonable size or mixes rendering with logic. The plan's original audit table (doc 13) is
   historical; the current state — including everything fixed in Phase 6 — is in doc 14's tables
   and Journal. If the file you're touching is already large, prefer extracting the piece you're
   adding into its own hook/service instead of adding more lines to it.
2. After writing the code, if the change is non-trivial (new command, new component with any
   non-trivial logic, new store), consider invoking the `architecture-reviewer` agent to check the
   diff against these rules before opening a PR.
3. If a rule genuinely doesn't fit the situation, say so explicitly and explain why rather than
   silently ignoring it — the plan doc is a living document, update it if a rule needs to change.
4. If you find a *new* violation (a file that grew, a new `lib/tauri.ts` bypass, duplicated
   logic), add a new numbered action to Phase 6 of
   [docs/architecture/14-architecture-refactor-tracking.md](../../../docs/architecture/14-architecture-refactor-tracking.md)
   rather than reopening a closed phase — that's the file's own stated convention. Mark actions ✅
   (or 🔄 if partially done), update the "Current step" line, and add a dated Journal entry once
   the change lands. That file is the single source of truth for where the refactor stands — keep
   it accurate rather than letting it drift from reality.
