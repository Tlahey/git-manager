---
name: architecture-guardian
description: Use before writing or right after writing code in git-manager that adds/changes a Tauri command (apps/desktop/src-tauri/src/commands/*.rs), a React component, hook, Zustand store, or an api/*.api.ts file. Reminds of the repo's mandatory layering rules (one file = one responsibility, every operation goes through a service/API layer) so new code doesn't reproduce known anti-patterns (oversized files mixing concerns, invoke() calls bypassing the API layer, duplicated Diff structs/helpers). Not for general code review of correctness — see the code-review skill for that.
---

# Architecture guardian

This repo has a documented architecture plan at
[doc/specs/13-architecture-refactor-plan.md](../../../doc/specs/13-architecture-refactor-plan.md)
built from a real audit of the codebase. Before adding new code in the areas below, apply the
rules from that plan so we don't add new instances of the problems it lists.

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
  errors, serialize output. If the plan's `services/` layer already exists for that domain, call
  into it. If it doesn't yet, at minimum don't duplicate logic that already exists elsewhere
  (e.g. don't re-write SHA shortening or re-define `DiffLine`/`DiffHunk`/`DiffFile` — those are
  already duplicated between `commit.rs` and `log.rs` per the audit; reuse, don't triplicate).
- A page/parent component should not have large sub-components (rows, cards, panels) defined
  inline — split them into a local `components/` folder (already required by `.agents/AGENTS.md`).

**R2 — every operation goes through the service/API layer.**
- Frontend: never call `invoke()` directly from a component, hook, or store. Never call
  `lib/tauri.ts` directly for a new *business* operation either — go through `api/*.api.ts` so the
  operation is reachable from one place (this is what lets cross-cutting concerns like the
  `gameObserver` event bus, undo/redo history, or notifications hook in without touching every
  call site). Simple read-only getters already wired through `lib/tauri.ts` elsewhere in the
  codebase are an accepted exception, not a pattern to extend.
- Backend: a command should not reach into `git2` for logic that's really business logic
  (validation, computation, traversal) — once `services/` exists for that domain, delegate to it.
- If you're adding a new cross-cutting concern (analytics, achievements, audit logging), hook it
  into the existing Observer (`lib/gameObserver.ts` today, evolving toward `appEventBus` per the
  plan) instead of adding ad hoc notification calls at each call site.

## What to do with this

1. Before writing the code, check whether the file you're about to touch is already flagged in
   the plan's audit table. If so, prefer extracting the piece you're touching into its own
   hook/service instead of adding more lines to an already-oversized file.
2. After writing the code, if the change is non-trivial (new command, new component with any
   non-trivial logic, new store), consider invoking the `architecture-reviewer` agent to check the
   diff against these rules before opening a PR.
3. If a rule genuinely doesn't fit the situation, say so explicitly and explain why rather than
   silently ignoring it — the plan doc is a living document, update it if a rule needs to change.
4. If the change corresponds to an action item in
   [doc/specs/14-architecture-refactor-tracking.md](../../../doc/specs/14-architecture-refactor-tracking.md),
   mark it ✅ (or 🔄 if partially done) and update the "Étape courante" line + add a Journal entry
   with the date once the change lands — that file is the single source of truth for where the
   refactor stands, keep it accurate rather than letting it drift from reality.
