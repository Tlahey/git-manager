# Spec 13 — Architecture refactor plan

## Objective

This document is a **reusable plan**, not a feature spec: it serves as a reference every
time we touch an area of the code that violates the splitting rules below, and as a checklist
before merging a PR that adds a Tauri command, a component, a hook, or a store.

It starts from a factual audit of the code (July 2026, see § Current state) and sets out:

1. the splitting rules to follow (file = 1 role, mandatory service layer),
2. the design patterns to introduce and where,
3. a prioritized roadmap,
4. the automated guardrails (Claude Code agent + skill) to avoid regressions.

**Execution**: the action-by-action tracking of this plan (status, order, dependencies) is in
[14-architecture-refactor-tracking.md](14-architecture-refactor-tracking.md) — that's the file
to consult/update to know where things concretely stand.

`docs/specs/00-architecture.md` remains the overview of the stack. This document complements it:
where `00-architecture.md` describes a `git/` layer that was never implemented (noted as
"aspirational" in `CLAUDE.md`), this plan **replaces** that ambition with something closer to
the real code: a `services/` layer on the Rust side and a strengthening of the `api/*.api.ts`
layer on the frontend side, rather than a complete rewrite.

---

## Current state (audit)

### Strengths to preserve

- The IPC boundary is respected: the frontend never talks to git directly, everything goes
  through `#[tauri::command]` → `lib/tauri.ts`.
- The `api/*.api.ts` layer already exists and covers ~95% of the commands used by the frontend
  (`git.api.ts`, `github.api.ts`, `nativeMenu.api.ts`, `repo.api.ts`, `shell.api.ts`, `ssh.api.ts`,
  `theme.api.ts`, `ollama.api.ts`).
- An Observer already exists: [`lib/gameObserver.ts`](../../apps/desktop/src/lib/gameObserver.ts), a
  small pub/sub used by `game.store.ts` and `api/git.api.ts` to notify achievements on
  stage/unstage/commit. This is the base to generalize (see § Observer).
- Tauri events (`app_handle.emit` / `listen`) are already used for Ollama streaming —
  this is a second Observer channel, this time on the Rust→Frontend side.

### Identified violations

**Frontend — files that mix several responsibilities:**

| File                                                  | Lines | Problem                                                                                                                                                                                       |
| ----------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/git-graph/components/CommitFileList.tsx`  | 682   | file tree logic + UI + stage/unstage calls in a single file                                                                                                                                   |
| `components/git-graph/GitGraph.tsx`                   | 586   | orchestrator component that absorbs too much coordination                                                                                                                                     |
| `app/settings/components/GithubSection.tsx`           | 562   | the entire OAuth device flow (polling, state, timers) is inline in the component instead of a dedicated hook                                                                                  |
| `components/git-graph/components/WipStagingPanel.tsx` | 488   | batching/batch commit + LLM generation + stage/unstage/commit calls mixed together (no tree duplication with `CommitFileList.tsx`, contrary to the initial hypothesis — see correction below) |
| `app/pull-requests/components/CustomViewsTab.tsx`     | 454   | YAML parsing + GitHub query construction + UI form                                                                                                                                            |
| `components/git-graph/DiffViewCenter.tsx`             | 427   | virtualization + stage/unstage interactions directly coupled to the view                                                                                                                      |

**Frontend — API layer violation:**

- `stores/game.store.ts:228` calls `invoke('get_terminal_commands')` **directly**, bypassing
  `lib/tauri.ts` and `api/*.api.ts`. This is the only violation found, but it illustrates
  the risk: a store that short-circuits the service layer cannot be observed/traced
  uniformly.

**Frontend — store that mixes UI and business data:**

- `stores/repos.store.ts` (209 lines) mixes pure UI state (open tabs, active panel, selected
  diff file) and business data (active repo, WIP messages, hidden stashes).
- `stores/settings.store.ts` mixes business config (Ollama, protected branches, GitHub) and
  UI preferences (appearance).

**Backend Rust — duplication and oversized files:**

| File                 | Lines | Problem                                                                                                   |
| -------------------- | ----- | --------------------------------------------------------------------------------------------------------- |
| `commands/log.rs`    | 816   | mixes graph computation (columns/colors/edges), commit parsing, stash filtering, and full diff generation |
| `commands/commit.rs` | 649   | 6 distinct commands (stage, unstage, commit, discard, diff, raw content) in a single file                 |
| `commands/repo.rs`   | 611   | scan/clone/init logic not factored out                                                                    |

- **`DiffLine` / `DiffHunk` / `DiffFile` / `CommitDiff` are redefined identically** in
  `commands/commit.rs` (lines 10-44) and `commands/log.rs` (lines 38-70). Two sources of truth
  for the same data serialized to `packages/git-types`.
- SHA shortening (`sha[..7.min(sha.len())]`) is rewritten in `rollback.rs`, `remote.rs`,
  `log.rs`, `commit.rs` instead of a single utility function.
- `build_git_repo()` (`repo.rs:64-111`) and the equivalent logic in `open_repo()` (`repo.rs:9-60`)
  partially overlap.
- Each command accesses `git2` directly and mixes business validation (protected branch,
  destructive confirmation) + disk access + serialization — nothing is reusable outside the
  `#[tauri::command]` context, so nothing is testable independently of Tauri.

---

## Target principles

These rules are **binding**, not suggestions. They complement (without replacing)
`.agents/AGENTS.md` and the Architecture section of `CLAUDE.md`.

### R1 — One file, one role

A file should have only one reason to change. Concretely:

- A `.tsx` component = one displayed feature. Any non-presentational logic (tree
  construction, polling, parsing) goes into a dedicated hook (`hooks/useX.ts`).
- A Rust module in `commands/` should only expose **thin** `#[tauri::command]` functions:
  deserialize the input, call a service, serialize the output, map the error. All business
  logic (git2 traversal, computations, validations) goes into `services/`.

### R2 — All operations must go through a service

This is the explicitly requested rule and it has a direct benefit for the Observer: if a single
entry point executes _all_ operations, it's the only place to hook cross-cutting side effects
(notifications, undo/redo history, achievements, future audit log) into without
duplicating them at each call site.

- **Frontend**: no component, hook, or store calls `invoke()` directly anymore — not even
  via `lib/tauri.ts` without going through `api/*.api.ts`. Today `lib/tauri.ts` is already the
  only gateway to `invoke`, but some components import `lib/tauri.ts` directly, skipping the
  `api/` layer. Target: **all business calls go through `api/*.api.ts`**, and each
  `api/*.api.ts` file goes through a common wrapper (see Observer below) rather than calling
  `lib/tauri.ts` directly wherever convenient.
- **Backend**: each command calls exactly one service (`services::git::stage_file(...)`,
  `services::branch::delete(...)`, etc). The service is the only layer allowed to touch `git2`.

### R3 — Design patterns, applied where they solve a real problem

No pattern for the pattern's sake — each introduction below addresses a duplication
or coupling observed in the audit.

---

## Patterns to introduce

### Observer — generalize `gameObserver` into an application-wide event bus

**Problem solved**: today only `api/git.api.ts` notifies `gameObserver` (for
achievements). Other domains (GitHub, stash, remote) have no common instrumentation
point; if tomorrow we want to add an audit log, we'd have to add manual calls in each
API function.

**Target**:

- Rename `lib/gameObserver.ts` to `lib/appEventBus.ts` (`GameEvent`/`GameListener` →
  `AppEvent`/`AppEventListener`), same pub/sub implementation.
- Introduce an `api/service.ts` wrapper:
  ```ts
  export async function callCommand<T>(
    event: AppEvent,
    fn: () => Promise<T>,
    payload?: any
  ): Promise<T> {
    const result = await fn()
    appEventBus.notify(event, payload)
    return result
  }
  ```

> **Post-implementation correction (2026-07-02)**: `api/git.api.ts` was inspected before
> migrating it, and its instrumentation is **not** a simple uniform "invoke + notify" everywhere —
> most of its functions also drive the undo/redo history (`pushAction`/`clearRedo`/
> `pinObject`, conditional snapshots depending on the action mode), with a different shape per
> action type. Forcing _the entire function_ through `callCommand` would have added a generic
> catch-all parameter without removing any real duplication (which is legitimate: each undo
> action is different, Command-pattern style, not Observer style).
>
> The scope was therefore narrowed to what genuinely corresponds to an Observer: **only the calls
> that already notified `gameObserver`** (stage/unstage/stageAll/unstageAll/commit/discard/fixup/
> autosquash — 8 sites) go through `callCommand`, wrapping only the `invoke` call
> itself (`callCommand('commit', () => createCommit(...))`), without touching the surrounding
> undo/redo logic, which remains unchanged. The other `api/*.api.ts` files (`github.api.ts`,
> `nativeMenu.api.ts`, `repo.api.ts`, `shell.api.ts`, `ssh.api.ts`, `theme.api.ts`, `ollama.api.ts`)
> were **not** forced through `callCommand`: they notify nothing today, and routing them through
> an unused event would have been indirection without benefit (cf. the project's
> anti-premature-abstraction rule). The day one of them has a real event to notify,
> `callCommand` is already ready to accommodate it — see
> [14-architecture-refactor-tracking.md](14-architecture-refactor-tracking.md) action 4.4.

### Service layer (Rust) — extract `services/` between `commands/` and `git2`

**Problem solved**: `log.rs` (816 lines) and `commit.rs` (649 lines) mix business logic and
Tauri plumbing, making the code untestable outside `#[tauri::command]`, and duplicate the
`DiffLine`/`DiffHunk`/`DiffFile` structs.

**Target**:

```
src-tauri/src/
├── commands/         # thin #[tauri::command] functions: deserialization + delegation + errors
│   ├── log.rs
│   ├── commit.rs
│   └── ...
├── services/          # pure business logic, testable without Tauri
│   ├── git_log.rs      # history traversal (formerly log.rs without graph rendering)
│   ├── git_graph.rs     # columns/colors/edges computation (pure function, not a Builder — see below)
│   ├── git_diff.rs      # diff generation — sole source of truth for DiffLine/DiffHunk/DiffFile
│   ├── git_commit.rs    # stage/unstage/commit/discard
│   └── git_repo.rs      # open/scan/clone/init, unified build_git_repo
├── models.rs           # shared structs (DiffLine, DiffHunk, DiffFile, CommitDiff, ShortOid...)
└── utils.rs             # short_oid(), get_git_signature() — currently duplicated 4x
```

This directly resolves the Diff struct duplication and the `short_oid`/signature helper
duplication noted in the audit, without rewriting the existing git2 access (no additional
abstraction layer of the `git/` kind as in `00-architecture.md` — just a commands/services split).

### Builder — commit graph construction (rescoped as a simple service function)

**Problem solved**: `log.rs` computed columns/colors/edges inline in `get_log` (~375
lines of algorithm mixed with request preparation), with several optional parameters
(limit, stash filters, branch) passed in cascade.

> **Post-implementation correction (2026-07-02)**: the plan proposed a `GitGraphBuilder` with
> chainable methods (`.with_limit()`, `.include_stashes()`, `.from_ref()`). Looking at the
> actual code, `get_log` has only a single call site (the Tauri command itself) and its
> parameters are already simple `Option<T>` values with no complex cross-validation — exactly the
> case where a Builder brings no ergonomic value over named function arguments. Rather than
> inventing a chainable API unused anywhere else, the layout algorithm was extracted as-is into
> `services/git_graph.rs::build_graph_nodes(repo, oids, stash_oids,
refs_map, branch)` — a pure function, testable independently of Tauri, without changing its
> call shape. Extraction verified line by line against the original (exact diff aside from
> borrow/ownership signature adaptations) to guarantee zero behavior change on an algorithm
> that cannot be visually tested from this environment.
>
> The `DiffOptionsBuilder` for diff options was also not introduced: usages of
> `DiffOptions` in the code (`context_lines`, `ignore_whitespace_change`, `include_untracked`)
> have 2-3 options per call site, already readable as-is — same anti-over-engineering
> reasoning.

### Strategy — diff rendering based on content type

**Problem solved (assumed)**: `DiffViewCenter.tsx` (427 lines) allegedly mixed virtualization,
interactions, and formatting logic that varies by file type (text, binary, image,
pure rename), with stacked `if/else`s to be replaced by a `DiffRenderStrategy` interface.

> **Post-implementation correction (2026-07-02)**: upon re-reading `DiffViewCenter.tsx` to
> implement it, the hypothesis doesn't hold. There is only a single branching point per content
> type, a two-branch ternary (`diffData.isBinary ? <binary placeholder> :
<MonacoDiffViewer>`) — no stacked `if/else`s, no separate "image" case anywhere in the
> code (nor in `MonacoDiffViewer.tsx`), and "split-view" is not a separate rendering strategy
> but a simple prop (`viewMode`) passed to `MonacoDiffViewer`, which handles both modes
> internally. Introducing a `DiffRenderStrategy` interface for a 5-line ternary would be
> over-engineering — the project's guiding principle is explicit about this ("three similar lines is better
> than a premature abstraction"). No Strategy to extract here; see
> [14-architecture-refactor-tracking.md](14-architecture-refactor-tracking.md) actions 5.1/5.2.
>
> The actual size of `DiffViewCenter.tsx` (427 lines) comes from a rich header/toolbar (tabs,
> blame/history toggles, navigation between changes, stage/discard actions), not from diff-type
> rendering logic. A future split into a sub-component (header/toolbar separated from content)
> would be a legitimate R1 action if the file keeps growing, but that's out of scope for this
> plan as written — to be added as a new action if needed rather than forcing the Strategy
> planned here.

### Composite — file tree (already implicit)

**Problem solved**: `CommitFileList.tsx` builds its recursive tree (`buildFileTree`,
`computeFolderStats`, sorting, expand/collapse) inline in the component, mixed with rendering.

**Target**: a `hooks/useFileTree.ts` hook that takes a list of files (path + status) and
returns a Composite structure with search/expand-collapse state. A single place for
sorting, folder stats computation, and filtering.

> **Post-implementation correction (2026-07-02)**: the initial audit assumed that
> `WipStagingPanel.tsx` duplicated this logic — re-reading it during implementation, this
> turned out not to be the case. Its `wipBatches` does a simple flat grouping by root folder for
> "batch commit" mode (LLM per group), a different need from `CommitFileList`'s nested tree.
> The hook was therefore only extracted from `CommitFileList.tsx`; see
> [14-architecture-refactor-tracking.md](14-architecture-refactor-tracking.md) action 2.3.

---

## Detailed action plan by file

### Backend Rust

1. Create `models.rs` (or extend the existing one) with `DiffLine`, `DiffHunk`, `DiffFile`, `CommitDiff`
   as the single definition; remove the redefinitions in `commit.rs` and `log.rs`.
2. Create `utils.rs` with `short_oid()` and `get_git_signature()`; replace the 4 duplicated
   occurrences (`rollback.rs`, `remote.rs`, `log.rs`, `commit.rs`).
3. Extract `services/git_diff.rs` (diff generation, used by `commit.rs` and `log.rs`).
4. Extract `services/git_graph.rs` (graph computation with `GitGraphBuilder`) out of `log.rs`.
5. Extract `services/git_commit.rs` (stage/unstage/commit/discard) out of `commit.rs`.
6. Unify `build_git_repo()` / `open_repo()` in `services/git_repo.rs`.
7. Once 1-6 are done, `commands/log.rs` and `commands/commit.rs` should no longer exceed ~150
   lines each (deserialization + service call + errors).

### Frontend

1. `GithubSection.tsx` → extract `hooks/useGithubDeviceFlow.ts` (polling, state, timer cleanup);
   the component keeps only the rendering.
2. `CommitFileList.tsx` → extract `hooks/useFileTree.ts` (see Composite above; correction:
   `WipStagingPanel.tsx` ultimately had nothing to migrate, cf. tracker action 2.3).
3. ~~`DiffViewCenter.tsx` → extract rendering strategies per diff type~~ — not applicable,
   see the correction in the Strategy section above.
4. `GitGraph.tsx` → check whether the 6+ coordinated hooks can be grouped into a single
   composition hook (`hooks/useGitGraphController.ts`) to declutter the page component.
5. `stores/repos.store.ts` → split into `stores/repoUI.store.ts` (tabs, active panel, diff
   selection) and `stores/repoData.store.ts` (active repo, WIP messages, hidden stashes).
6. `stores/settings.store.ts` → separate UI preferences (appearance) from business config
   (Ollama, protected branches, GitHub) if the store keeps growing.
7. `stores/game.store.ts:228` → replace the direct `invoke('get_terminal_commands')` call with an
   export from `lib/tauri.ts` (`getTerminalCommands()`), itself called via `api/*.api.ts`.
8. Introduce `api/service.ts` (the `callCommand` described in Observer) and migrate the 8 sites in
   `api/git.api.ts` that already notified `gameObserver`/`appEventBus`. Do not force the other
   `api/*.api.ts` files through `callCommand` as long as they have nothing to notify (cf. the
   post-implementation correction above).

---

## Prioritized roadmap

**Phase 1 — Quick wins (low risk, immediate value)**

- Fix `game.store.ts:228` (API layer violation).
- Centralize `short_oid()` / `get_git_signature()` in `utils.rs`.
- Centralize the Diff structs in `models.rs`.

**Phase 2 — Hook extraction (frontend, no behavior change)**

- `useGithubDeviceFlow`, `useFileTree`, `repos.store.ts` split.

**Phase 3 — Introduction of the service layer (Rust)**

- Extraction of `services/git_diff.rs`, `services/git_commit.rs`, `services/git_repo.rs`,
  `services/git_graph.rs` with `GitGraphBuilder`.

**Phase 4 — Generalized event bus**

- `api/service.ts` + `appEventBus`, migration of the 8 existing notification sites in
  `api/git.api.ts`. No forced migration of the other `api/*.api.ts` files (nothing to notify
  there today).

**Phase 5 — Strategy for diff rendering**

- ~~Refactor `DiffViewCenter.tsx`~~ — not applicable, see the correction in the Strategy section.

Each phase is independent and separately shippable — don't do everything in a single PR.

---

## Automated guardrails

To avoid reproducing these violations on future features, two Claude Code tools have been
added to the repo:

- **Skill `architecture-guardian`** (`.claude/skills/architecture-guardian/SKILL.md`) — triggers
  when adding/modifying a Tauri command, a component, a hook, a store, or an
  `api/*.api.ts` file, and recalls the R1/R2 rules before writing the code.
- **Agent `architecture-reviewer`** (`.claude/agents/architecture-reviewer.md`) — review
  subagent to invoke after an implementation or before a PR, which checks file size, adherence to
  the service/API layer, and duplication, relying on this document.

Both of these tools reference this file as the source of truth — update it if the rules
evolve rather than duplicating the rules elsewhere.
