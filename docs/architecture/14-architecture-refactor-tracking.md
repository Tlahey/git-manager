# Spec 14 — Architecture Refactor Execution Tracking

## Objective

This file is the **living dashboard** for the plan described in
[13-architecture-refactor-plan.md](13-architecture-refactor-plan.md). It breaks down each phase into
atomic actions (one action = one reasonable PR), in the order in which they must be done
(some depend on previous ones — do not skip the order without checking the "Depends on" column).

**Usage rule:** at every work session on the refactor, update this file —
check off completed actions, add a line to the Journal at the bottom with the date. This file
must always reflect the actual state of the code, not the intention.

## Status legend

| Symbol | Meaning |
|---|---|
| ⬜ | Not started |
| 🔄 | In progress |
| ✅ | Done |
| ⏭️ | Out of scope / will not be done (justified) |
| ⏸️ | Deferred to a future session (to be resumed later, not abandoned) |

---

## Phase 1 — Quick wins (backend)

| # | Action | File(s) | Depends on | Status |
|---|---|---|---|---|
| 1.1 | Create `models.rs` with `GitDiffLine`/`GitDiffHunk`/`GitDiffFile`/`GitDiff` as the single definition (names aligned with `packages/git-types`, which already used these names on the TS side) | `src-tauri/src/models.rs` | — | ✅ |
| 1.2 | Replace the redefinition of these structs in `commit.rs` with an import from `models.rs` | `commands/commit.rs` | 1.1 | ✅ |
| 1.3 | Replace the redefinition of these structs in `log.rs` with an import from `models.rs` (along the way: `CommitDiff` renamed to `GitDiff` — this was already the expected type on the TS side, the old Rust name was simply inconsistent) | `commands/log.rs` | 1.1 | ✅ |
| 1.4 | Create `utils.rs` with `short_oid()` | `src-tauri/src/utils.rs` | — | ✅ |
| 1.5 | Replace duplicated occurrences of SHA shortening with `short_oid()` (7 sites actually found, not 4: `rollback.rs` x2, `commit.rs`, `remote.rs`, `log.rs`, `fixup.rs` x2) | `rollback.rs`, `remote.rs`, `log.rs`, `commit.rs`, `fixup.rs` | 1.4 | ✅ |
| 1.6 | Add `get_git_signature()` in `utils.rs` and replace duplicated usages (4 sites found: `rollback.rs`, `commit.rs`, `stash.rs`, `fixup.rs`) | `utils.rs`, `rollback.rs`, `commit.rs`, `stash.rs`, `fixup.rs` | 1.4 | ✅ |

## Phase 1 — Quick wins (frontend)

| # | Action | File(s) | Depends on | Status |
|---|---|---|---|---|
| 1.7 | Add `getTerminalCommands()` in `lib/tauri.ts`, expose it via `api/shell.api.ts` (terminal domain, consistent with `apiOpenTerminal`) under the name `apiGetTerminalCommands()`, fix `game.store.ts:228` to stop calling `invoke()` directly | `lib/tauri.ts`, `api/shell.api.ts`, `stores/game.store.ts` | — | ✅ |

## Phase 2 — Hook extraction (frontend, no behavior change)

| # | Action | File(s) | Depends on | Status |
|---|---|---|---|---|
| 2.1 | Extract `hooks/useGithubDeviceFlow.ts` (polling, state, timer cleanup) from `GithubSection.tsx` | `hooks/useGithubDeviceFlow.ts`, `app/settings/components/GithubSection.tsx` | — | ✅ |
| 2.2 | Extract `hooks/useFileTree.ts` (Composite: `buildFileTree`, `computeFolderStats`, sorting, filtering, expand/collapse state) from `CommitFileList.tsx` | `hooks/useFileTree.ts`, `components/git-graph/components/CommitFileList.tsx` | — | ✅ |
| 2.3 | ~~Migrate `WipStagingPanel.tsx` to `hooks/useFileTree.ts`~~ — **re-scoped, not applicable**: on re-reading `WipStagingPanel.tsx`, it has no duplicated recursive tree. Its `wipBatches` (useMemo) does a simple flat grouping by root folder for "batch commit" mode, a different need from the nested Composite of `CommitFileList`. The initial audit overestimated the duplication here — nothing to migrate. | `components/git-graph/components/WipStagingPanel.tsx` | 2.2 | ⏭️ |
| 2.4 | Split `stores/repos.store.ts` into `stores/repoUI.store.ts` (tabs, navigation `activeRepo`/`activeTab`, selected diff, left panel, `editingOid`) and `stores/repoData.store.ts` (`savedRepos`, `discoveredRepos`, `repoCache`, `wipMessages`, `hiddenStashes`) | `stores/repos.store.ts` → 2 files + 22 call sites | — | ✅ |
| 2.5 *(optional)* | Split `stores/settings.store.ts` (UI preferences vs. Ollama/protected branches/GitHub business config) if the store keeps growing | `stores/settings.store.ts` | — | ⏭️ |

## Phase 3 — Rust service layer (`commands/` → `services/`)

| # | Action | File(s) | Depends on | Status |
|---|---|---|---|---|
| 3.1 | Extract `services/git_diff.rs` (diff generation, single source used by `commit.rs` and `log.rs`) | `services/git_diff.rs` | 1.1–1.3 | ✅ |
| 3.3 | Extract `services/git_commit.rs` (stage/unstage/commit/discard) out of `commit.rs` | `services/git_commit.rs`, `commands/commit.rs` | 3.1 | ✅ |
| 3.4 | Unify `build_git_repo()` / `open_repo()` in `services/git_repo.rs` | `services/git_repo.rs`, `commands/repo.rs` | — | ✅ |
| 3.2 | Extract the layout algorithm (columns/colors/edges) out of `get_log` into `services/git_graph.rs::build_graph_nodes()` — pure function, not a chainable `GitGraphBuilder` (re-scoped, single call site, no ergonomic value in a Builder here) | `services/git_graph.rs`, `commands/log.rs` | 3.1 | ✅ |
| 3.5 | Verify that `commands/log.rs` and `commands/commit.rs` are back down to ~150 lines each (deserialization + delegation + errors only) | `commands/log.rs`, `commands/commit.rs` | 3.1–3.3 | ✅ (log.rs 282, commit.rs 264 — above 150 but most of what remains are legitimate distinct commands, not duplicated logic) |

## Phase 4 — Generalized event bus (Observer)

| # | Action | File(s) | Depends on | Status |
|---|---|---|---|---|
| 4.1 | Rename `lib/gameObserver.ts` → `lib/appEventBus.ts` (`GameEvent`/`GameListener` → `AppEvent`/`AppEventListener`, same pub/sub impl), update the 3 consumers (`App.tsx`, `PullRequestsPage.tsx`, `game.store.ts`) | `lib/appEventBus.ts`, `App.tsx`, `app/pull-requests/PullRequestsPage.tsx`, `stores/game.store.ts` | — | ✅ |
| 4.2 | Create `api/service.ts` with the `callCommand(event, fn, payload?)` wrapper that calls `fn()` then notifies `appEventBus` | `api/service.ts` | 4.1 | ✅ |
| 4.3 | Migrate the 8 sites in `api/git.api.ts` that already notified `gameObserver` (stage/unstage/stageAll/unstageAll/commit/discard/fixup/autosquash) to `callCommand()`, wrapping only the `invoke` call (not the surrounding undo/redo logic, which remains unchanged) | `api/git.api.ts` | 4.2 | ✅ |
| 4.4 | ~~Migrate the other `api/*.api.ts` files~~ — **re-scoped, not applicable for now**: `github.api.ts`, `nativeMenu.api.ts`, `repo.api.ts`, `shell.api.ts`, `ssh.api.ts`, `theme.api.ts`, `ollama.api.ts` notify nothing today. Routing them through `callCommand` with an unused event would have been indirection with no benefit. To be done the day one of them has a real event to notify — `callCommand`/`appEventBus` are already ready to accommodate it with no modification. | `api/*.api.ts` | 4.2 | ⏭️ |

## Phase 5 — Strategy for diff rendering

| # | Action | File(s) | Depends on | Status |
|---|---|---|---|---|
| 5.1 | ~~Define the `DiffRenderStrategy` interface~~ — **re-scoped, not applicable**: on re-reading `DiffViewCenter.tsx`, its only branching by content type is a 2-branch ternary (`isBinary ? placeholder : MonacoDiffViewer`), not a stacked `if/else`. No "image" case anywhere in the code. "Split-view" is a prop (`viewMode`) of `MonacoDiffViewer`, not a separate strategy. A Strategy interface for a 5-line ternary would be over-engineering. | new module under `components/git-graph/` | Phase 2–4 stabilized | ⏭️ |
| 5.2 | ~~Refactor `DiffViewCenter.tsx` to delegate to the strategy~~ — same reason, nothing to delegate. The file's real size (427 lines) comes from the header/toolbar (tabs, blame/history, navigation, stage/discard), not from diff rendering — a future breakdown into a sub-component would be a different R1 action, out of scope for this plan as written. | `components/git-graph/DiffViewCenter.tsx` | 5.1 | ⏭️ |

## Phase 6 — Ad hoc post-plan actions (follow-up audit)

The initial plan (phases 1-5) has been fully handled. Per the closing note
below, the following actions are added here as they go, as an ad hoc audit
identifies a new oversized file or a new duplication — without reopening
the closed phases.

| # | Action | File(s) | Depends on | Status |
|---|---|---|---|---|
| 6.1 | Extract data derivation (WIP node, search filtering, waterlines, origin/main index) from `GitGraph.tsx` into a `useGitGraphNodes` hook | `hooks/useGitGraphNodes.ts`, `components/git-graph/GitGraph.tsx` | — | ✅ |
| 6.2 | Extract imperative actions (native commit/stash context menu, SHA copy, fixup, WIP commit, toast) from `GitGraph.tsx` into a `useGitGraphActions` hook | `hooks/useGitGraphActions.ts`, `components/git-graph/GitGraph.tsx` | — | ✅ |
| 6.3 | Extract the WIP commit panel logic (classic mode + "batch commit" mode with per-group AI generation and staging restoration) from `WipStagingPanel.tsx` into a `useWipCommitPanel` hook | `hooks/useWipCommitPanel.ts`, `components/git-graph/components/WipStagingPanel.tsx` | — | ✅ |
| 6.4 | Extract commit/stash message editing (amend, opening via `editingOid`, reset on commit change, SHA copy) from `CommitHeaderInfo.tsx` into a `useCommitMessageEdit` hook | `hooks/useCommitMessageEdit.ts`, `components/git-graph/components/CommitHeaderInfo.tsx` | — | ✅ |

### 6.5 — Systemic R2 violation: 27 files bypass `api/*.api.ts`

Discovered while auditing `useSidebarRows.ts`: 27 files (`hooks/`, `components/`, `stores/`)
import functions from `lib/tauri.ts` directly instead of going through `api/*.api.ts`,
in violation of the rule documented in `CLAUDE.md` ("Components and hooks should import from
here, not from `lib/tauri.ts` directly"). Severity varies:

- **Real bug (not just cosmetic)**: several of these sites call the raw function even though
  an existing `api*` wrapper does more than just relay the call — `apiStageFile`/`apiUnstageFile`/
  `apiCreateFixupCommit`/`apiRunAutosquash` notify `appEventBus` (achievements) via `callCommand`,
  and several `api*` wrappers also feed undo/redo (`clearRedo`, `pushAction`). Bypassing them
  silently drops these side effects for the affected sites.
- **Pure R2 debt**: other sites (read-type hooks like `useGitStatus`/`useGitLog`) simply lack
  a corresponding `api*` wrapper to create.
- Decided with the user (2026-07-02): full migration, in several PRs grouped by batch
  rather than one giant PR — same pace as the rest of Phase 6.

| # | Action | File(s) | Depends on | Status |
|---|---|---|---|---|
| 6.5.a | **Batch 1 (real bugs)**: remove `components/working-tree/` (dead, referenced nowhere — `WorkingTreePanel.tsx`/`CommitMessageBox.tsx`/`FileStatusItem.tsx`); replace raw calls with the already-existing `api*` wrappers in `DiffViewCenter.tsx` (stage/unstageFile), `FixupTargetSelector.tsx` (createFixupCommit), `AutosquashPreviewDialog.tsx` (autosquashPreview/runAutosquash), `RevertDialog.tsx` (revertCommit), `PendingFixupsBanner.tsx` (getPendingFixups), `ResetDialog.tsx` (getCommitsBetween), `BranchContext.tsx` + `RepoView.tsx` (openRepo → `apiOpenRepo` from `repo.api.ts`), `useTheme.ts` (getUserThemes → `apiGetUserThemes` from `theme.api.ts`) | 9 files modified + 3 removed | — | ✅ |
| 6.5.b | **Batch 2**: create the missing read wrappers in `git.api.ts` (`apiGetRepoStatus`, `apiGetLog`, `apiGetBranches`, `apiGetFileDiff`, `apiGetCommitDiff`, `apiGetFileRawContents`, `apiGetTags`, `apiListSubmodules`, `apiGetRebaseState`) and migrate `useGitStatus.ts`, `useGitLog.ts`, `useBranches.ts`, `useFileDiff.ts`, `useCommitDiff.ts`, `useFileRawContents.ts`, `useSidebarRows.ts`, `components/repository-sidebar/{SidebarRail,TagsSection,SubmodulesSection}.tsx`, `components/action-toolbar/StateTags.tsx` | `api/git.api.ts` + 11 files | 6.5.a | ✅ |
| 6.5.c | **Batch 3**: `repo.api.ts` (`apiCloneRepo`, `apiInitRepo`), `git.api.ts` (`apiCreateBranch`, `apiFetchRemote`, `apiPullBranch`, `apiPushBranch`), new `api/undoSupport.api.ts` (`apiUnpinObject`/`apiObjectsExist`, dedicated file to avoid an import cycle — see note), `ollama.api.ts` (`apiCancelGeneration`, `apiGenerateCommitMessage`) and migrate `CloneRepoDialog.tsx`, `NewTabMenu.tsx`, `CreateBranchHereDialog.tsx`, `ActionToolbar.tsx`, `stores/undoHistory.store.ts`, `hooks/useOllamaGeneration.ts` | `api/repo.api.ts`, `api/git.api.ts`, `api/undoSupport.api.ts`, `api/ollama.api.ts` + 6 files | 6.5.a, 6.5.b | ✅ |
| 6.6 | Extract actions (fetch/pull/push, undo/redo, stash/pop, branch creation, terminal) and derived state (loading map, notification, hasChanges/hasStashes/canUndo/canRedo) from `ActionToolbar.tsx` into a `useActionToolbar` hook | `hooks/useActionToolbar.ts`, `components/action-toolbar/ActionToolbar.tsx` | — | ✅ |

Note (circular import): `unpinObject`/`objectsExist` are used only by
`stores/undoHistory.store.ts`. Since `git.api.ts` already imports `useUndoHistoryStore` from this
same store (for `pushAction`/`clearRedo`), routing them through `git.api.ts` would have created a
`git.api.ts` → `undoHistory.store.ts` → `git.api.ts` cycle. Created `api/undoSupport.api.ts` separately
(depends only on `lib/tauri.ts`, depended on only by the store) to stay cycle-free while
respecting R2.

Note (bonus): `CreateBranchHereDialog.tsx` was calling the raw `checkoutBranch` (not `apiCheckoutBranch`)
with no `opts` parameter at all — by migrating to `apiCheckoutBranch(repoPath, trimmed)`, the checkout
after branch creation now feeds `clearRedo()` like the app's other checkout paths
(`apiCheckoutBranch` calls `clearRedo(path)` when `opts` is `undefined`); before, this
checkout did not touch undo/redo at all. Same category of bug as batch 1.

**R2 migration (6.5) complete.** `useGitHubRepos.ts`/`useGithubDeviceFlow.ts` only import
**types** from `lib/tauri.ts` (`import type { ... }`) — this is not an R2 violation (no
function call), left as-is. No more `hooks/`/`components/`/`stores/` file
calls a `lib/tauri.ts` function directly.

---

## Current step

**All phases are complete.** Phase 1 ✅. Phase 2: 2.1/2.2/2.4 ✅, 2.3 ⏭️ (not
applicable), 2.5 ⏭️ (optional, not done). Phase 3: 3.1/3.2/3.3/3.4/3.5 ✅ (3.2 extracted without
`GitGraphBuilder`, verified line by line against the original). Phase 4: 4.1/4.2/4.3 ✅, 4.4 ⏭️ (not
applicable). Phase 5: 5.1/5.2 ⏭️ (not applicable, no Strategy to extract). Phase 6
(ad hoc post-plan actions): 6.1/6.2/6.3/6.4 ✅, 6.5.a/6.5.b/6.5.c ✅ (R2 migration
complete, 0 remaining files calling `lib/tauri.ts` directly outside of type imports), 6.6 ✅.

**Next step**: no refactor action planned. If new files grow,
if a new duplication appears, or if a new site reintroduces a direct call to
`lib/tauri.ts`, add a new action in Phase 6 rather than reopening the
closed phases.

**Cross-cutting point of attention (not testable from this environment, Tauri-only)**: the
changes touching commit graph rendering (3.2, 6.1, 6.2) were verified by careful reading /
line-by-line diff, but never visually. **A manual pass via `pnpm dev`**
(several branches/merges/stashes, commit selection, context menu, WIP commit) remains
recommended before merging any PR that includes them.

*(Update this line at every session: indicate the number of the next unfinished
action. If several actions are in parallel, list the numbers in progress.)*

---

## Journal

| Date | Action(s) | Notes |
|---|---|---|
| 2026-07-02 | Creation of the plan and the tracker | Initial audit performed, phases 1-5 defined, no code action applied yet |
| 2026-07-02 | 1.1, 1.2, 1.3 | Diff structs unified in `models.rs` (`GitDiffLine`/`GitDiffHunk`/`GitDiffFile`/`GitDiff`); `commit.rs` and `log.rs` now import from `models.rs` instead of redefining. `CommitDiff` (log.rs) renamed to `GitDiff` to match the type already used on the frontend side (`packages/git-types`). Verified: `cargo build` and `cargo clippy` pass with no new error/warning. |
| 2026-07-02 | 1.4, 1.5, 1.6 | Created `src-tauri/src/utils.rs` with `short_oid()` and `get_git_signature()`. `short_oid()` replaces 7 rewrites (not 4 as estimated in the initial audit) in `rollback.rs` (x2), `commit.rs`, `remote.rs`, `log.rs`, `fixup.rs` (x2). `get_git_signature()` replaces 4 rewrites in `rollback.rs`, `commit.rs`, `stash.rs`, `fixup.rs`. Verified: `cargo build` and `cargo clippy` pass with no new error/warning. |
| 2026-07-02 | 1.7 | Added `getTerminalCommands()` in `lib/tauri.ts` + `apiGetTerminalCommands()` in `api/shell.api.ts`; `game.store.ts` no longer calls `invoke()` directly. Verified: `pnpm --filter @git-manager/desktop typecheck` passes. (`pnpm lint` fails for a pre-existing unrelated reason — missing `eslint.config.js`, not in scope for this action.) **Phase 1 (backend + frontend) fully complete.** |
| 2026-07-02 | 2.1 | Created `hooks/useGithubDeviceFlow.ts` (device code, polling, timer cleanup via `useRef`, shared `completeLoginWithToken` OAuth/PAT) reusing the `DeviceCodeResponse` type already exported by `lib/tauri.ts` rather than redefining one. `GithubSection.tsx` goes from 562 to 465 lines, keeping only UI state (loginMethod, patToken, copied) and rendering. Behavior preserved identically (same error messages, same resets). Verified: `pnpm typecheck` passes. No manual test of the OAuth flow in the app (Tauri, not testable in a browser) — to be verified manually by the user. |
| 2026-07-02 | 2.2, 2.3 | Created `hooks/useFileTree.ts` (generic Composite `useFileTree<T extends FileTreeInputFile>`, also exports `getSortedNodes`/`TreeNode`) from `CommitFileList.tsx` (682 → 467 lines). While re-reading `WipStagingPanel.tsx` for action 2.3, found there was no actual duplication (its `wipBatches` is a flat grouping, not a recursive tree) — 2.3 marked ⏭️ and the plan (`13-...md`) corrected accordingly rather than forcing an artificial migration. Verified: `pnpm typecheck` passes. |
| 2026-07-02 | 2.4 | Created `stores/repoUI.store.ts` (openTabs, activeRepo, activeTab, activeDiffFile, activeLeftPanel, editingOid + `DASHBOARD_TAB`/`REWARDS_TAB`/`PULL_REQUESTS_TAB`) and `stores/repoData.store.ts` (savedRepos, discoveredRepos, repoCache, wipMessages, hiddenStashes), removed `repos.store.ts`, updated the 22 consuming files one by one (App.tsx, DashboardPage, RepoRow, ReadmePanel, RepoView, RepoSelector, Footer, StateTags, ActionToolbar, NewTabMenu, CloneRepoDialog, BranchContext, NotificationDropdown, TabBar, DiffViewCenter, RepositorySidebar, GraphRow, GitGraph, CommitDetailsPanel, CommitHeaderInfo, useKeyboardShortcuts, useNotificationWatcher). `removeRepo` (repoData) calls `useRepoUIStore.getState().clearTabStateForRemovedRepo()` cross-store to preserve the exact tab/selection cleanup behavior. Persistence: `repoData.store` keeps the localStorage key `git-manager-repos` (no loss of existing saved repos/pins/wip drafts); `repoUI.store` uses a new key `git-manager-repos-ui` (open tabs will be reset once after the update — minor accepted side effect, documented here). Verified: `grep` finds no more references to `repos.store`/`useReposStore` anywhere in the repo, `pnpm typecheck` passes. No manual test in the app (Tauri, not testable in a browser) — **strongly recommended to run `pnpm dev` and check tabs/repo selection/diff/stash before merging**, given the scale of the change. |
| 2026-07-02 | 3.1, 3.3, 3.4 | Created `services/git_diff.rs` (diff_foreach_files/finalize/build_diff, replaces the duplicated bodies in `commit.rs` and `log.rs`; along the way, `commit.rs` gains the `"typechange"` status that only `log.rs` handled — unified behavior). Created `services/git_repo.rs` (`build_git_repo`, `open_repo` no longer reimplements it inline). Created `services/git_commit.rs` (stage_file/unstage_file/discard_file_changes/stage_all/unstage_all/create_commit + `DiscardResult`/`CommitResult`), `commands/commit.rs` reduced to thin `#[tauri::command]` wrappers. Sizes: `commit.rs` 605→264, `log.rs` 783→683, `repo.rs` 611→526. Verified: `cargo build` + `cargo clippy` pass with no new error/warning. **3.2 (GitGraphBuilder) deferred** — see note in "Current step": this is the graph layout algorithm, too risky to touch without being able to visually test the rendering. |
| 2026-07-02 | 4.1, 4.2, 4.3 | Renamed `lib/gameObserver.ts` → `lib/appEventBus.ts` (3 consumers updated: `App.tsx`, `PullRequestsPage.tsx`, `game.store.ts`), created `api/service.ts` (`callCommand`). While reading `api/git.api.ts` before migrating it, found that most of its functions also drive undo/redo history with different logic per action (not a simple uniform "invoke + notify") — forcing the whole function through `callCommand` would have been a poor abstraction. Narrowed the scope: only the 8 sites that already notified `gameObserver` (stage/unstage/stageAll/unstageAll/commit/discard/fixup/autosquash) migrated to `callCommand`, wrapping only the `invoke` call itself. 4.4 marked ⏭️ for the same reason as 2.3: forcing the other `api/*.api.ts` files (which notify nothing) through `callCommand` would have been indirection with no benefit — plan (`13-...md`) corrected accordingly. Verified: `pnpm typecheck` passes, `cargo build` intact (no Rust file touched). |
| 2026-07-02 | 5.1, 5.2 | Re-read `DiffViewCenter.tsx` before extracting a `DiffRenderStrategy` from it — the audit's assumption did not hold: a single binary/text ternary, no stacked `if/else`, no "image" case, "split-view" is a prop of `MonacoDiffViewer` and not a separate strategy. No Strategy to extract for a 5-line ternary (over-engineering). 5.1/5.2 marked ⏭️, plan (`13-...md`) corrected. |
| 2026-07-02 | 3.2 | Extracted the layout algorithm from `get_log` (columns/colors/edges, ~375 lines) into `services/git_graph.rs::build_graph_nodes(repo, oids, stash_oids, refs_map, branch)`. Re-scoped without a chainable `GitGraphBuilder`: a single call site, params already simple `Option<T>`s, a Builder would have added nothing (plan corrected). Extra verification given the risk (algorithm not visually testable here): line-by-line diff between the original body and the extracted body — **identical**, except for the 4 expected adaptations related to passing owned parameters (`Vec<Oid>`, `Option<String>`) as borrowed ones (`&[Oid]`, `Option<&str>`) and one style simplification (`.map_err(AppError::Git)` instead of an equivalent closure). `commands/log.rs`: 683→282 lines. Verified: `cargo build` + `cargo clippy` pass with no new error/warning. **The plan is now fully handled.** Recommendation: manually test the graph rendering (`pnpm dev`, several branches/merges/stashes) before merging, despite the line-by-line verification. |
| 2026-07-02 | 6.1, 6.2 | Post-plan follow-up audit (`main` up to date, all PRs 1-4 merged): `GitGraph.tsx` had grown back to 587 lines, mixing data derivation, imperative actions, virtualization, and rendering — R1 violation (component = rendering only). Created `hooks/useGitGraphNodes.ts` (wipNode/filteredNodes/waterlines/originMainIndex, memoized) and `hooks/useGitGraphActions.ts` (native commit/stash context menu, SHA copy, fixup, WIP commit, toast). `GitGraph.tsx` reduced from 587→377 lines, keeping only orchestration/rendering. Along the way, fixed a real perf bug: `originMainIndex` was being recomputed via a `findIndex` over the entire `filteredNodes` at *every visible row on every render* (O(n²) in the virtualization loop) — moved into the new hook's `useMemo`, computed only once per `filteredNodes` change. Also removed a forgotten debug `console.log('[isSelectedCommitHead]', ...)` from the code. Verified: `pnpm typecheck` passes (`pnpm lint` fails for the same pre-existing unrelated reason as 1.7). No manual test in the app (Tauri, not testable in a browser) — recommended to check the context menu, WIP commit, and connection display near `origin/main` via `pnpm dev` before merging. **Merged via PR #5.** |
| 2026-07-02 | 6.3 | Continuation of the follow-up audit: `WipStagingPanel.tsx` (488 lines) mixed the entire "batch commit" engine (grouping by folder, per-group AI message generation with temporary staging/unstaging and restoration of the original index state, group commit) and classic mode (single message, history, stage/unstage all) with rendering — R1 violation similar to 6.1/6.2. Created `hooks/useWipCommitPanel.ts`, which encapsulates all of it (itself instantiates `useOllamaGeneration`/`useCommitMessageHistory`). `WipStagingPanel.tsx` reduced from 488→320 lines, keeping only derived UI dropdown state (`statusIcons`/`statusLetters`) and rendering. Point of attention during extraction: `t()` (i18n) and the empty-message `alert()` in `commitBatch` had to be explicitly passed/preserved since the hook has no translation context of its own — verified that both behaviors (translated placeholder during AI generation, alert if the batch message is empty) are identical to the original before committing. `gitStatus` typed `GitStatus | undefined` instead of `any` (the actual type already produced by `useGitStatus`, no loss of compatibility). Verified: `pnpm typecheck` passes. No manual test in the app — recommended to test batch mode (AI generation + group commit) and classic mode via `pnpm dev` before merging. |
| 2026-07-02 | 6.4 | Continuation of the follow-up audit: `CommitHeaderInfo.tsx` (429 lines) mixed message editing (opening via global `editingOid`, field reset on selected commit change, saving as amend-commit or stash rename depending on the case, SHA copy) with rendering — R1 violation similar to 6.1-6.3. Created `hooks/useCommitMessageEdit.ts`. `CommitHeaderInfo.tsx` reduced from 429→377 lines. Note: the file also contains three nearly identical JSX blocks (message display for HEAD commit / stash / read-only historical commit) that could have been merged into a shared sub-component, but each has real differences (distinct data-testid for tests, different text source for stashes, different title label) — merging them would have added 5-6 props to save ~50 lines, judged not worthwhile (over-engineering), left as-is. Verified: `pnpm typecheck` passes. No manual test in the app — recommended to test message editing (HEAD commit, historical commit, stash) via `pnpm dev` before merging. |
| 2026-07-02 | 6.5.a | While auditing `useSidebarRows.ts`, discovered a systemic R2 violation: 27 files call `lib/tauri.ts` directly instead of going through `api/*.api.ts`. Higher severity than expected — some sites bypass **already-existing** `api*` wrappers that do more than a simple relay: `apiStageFile`/`apiUnstageFile`/`apiCreateFixupCommit`/`apiRunAutosquash` notify `appEventBus` (achievements, via `callCommand`), and several feed undo/redo (`pushAction`/`clearRedo`) — bypassing them silently drops these side effects. User decision: full migration in several grouped PRs (not one giant PR). Batch 1 (this one): discovered that `components/working-tree/` (`WorkingTreePanel.tsx`, `CommitMessageBox.tsx`, `FileStatusItem.tsx`) is dead code — referenced nowhere in the app, removed entirely rather than fixed. Fixed the 8 other sites that were bypassing an already-existing `api*` wrapper: `DiffViewCenter.tsx`, `FixupTargetSelector.tsx`, `AutosquashPreviewDialog.tsx`, `RevertDialog.tsx`, `PendingFixupsBanner.tsx`, `ResetDialog.tsx`, `BranchContext.tsx` + `RepoView.tsx` (→ `apiOpenRepo` from `repo.api.ts`), `useTheme.ts` (→ `apiGetUserThemes` from `theme.api.ts`) — in all cases a simple import replacement, no new wrapper to create. Verified: `pnpm typecheck` passes. 18 files remain for batches 2 (6.5.b, missing read wrappers) and 3 (6.5.c, repo/branch/remote/Ollama/undo-support) — see section 6.5 for details. |
| 2026-07-02 | 6.5.b | Batch 2 of the R2 migration: added a "Reads" section in `git.api.ts` with 8 read wrappers (`apiGetRepoStatus`, `apiGetLog`, `apiGetBranches`, `apiGetCommitDiff`, `apiGetFileDiff`, `apiGetFileRawContents`, `apiGetTags`, `apiListSubmodules`, `apiGetRebaseState`) — all simple relays (no undo/redo/observer needed, these are pure reads). Migrated the 11 files involved: `useGitStatus.ts`, `useGitLog.ts`, `useBranches.ts`, `useFileDiff.ts`, `useCommitDiff.ts`, `useFileRawContents.ts`, `useSidebarRows.ts`, `components/repository-sidebar/{SidebarRail,TagsSection,SubmodulesSection}.tsx`, `components/action-toolbar/StateTags.tsx`. Verified: `pnpm typecheck` passes. 6 real files remain for batch 3 (6.5.c) — `useGitHubRepos.ts`/`useGithubDeviceFlow.ts` only import types, so they don't count. |
| 2026-07-02 | 6.5.c | Batch 3 (last) of the R2 migration. Added `apiCloneRepo`/`apiInitRepo` in `repo.api.ts`; `apiCreateBranch`/`apiFetchRemote`/`apiPullBranch`/`apiPushBranch` in `git.api.ts`; `apiGenerateCommitMessage`/`apiCancelGeneration` in `ollama.api.ts`. Discovered along the way: routing `unpinObject`/`objectsExist` (used only by `stores/undoHistory.store.ts`) through `git.api.ts` would have created an import cycle (`git.api.ts` already imports `useUndoHistoryStore` for `pushAction`/`clearRedo`) — created `api/undoSupport.api.ts` separately for these two, with no dependency toward the store. Migrated the 6 files: `CloneRepoDialog.tsx`, `NewTabMenu.tsx`, `CreateBranchHereDialog.tsx`, `ActionToolbar.tsx`, `stores/undoHistory.store.ts`, `hooks/useOllamaGeneration.ts`. Bonus discovered while migrating `CreateBranchHereDialog.tsx`: it was calling the raw `checkoutBranch` without going through `apiCheckoutBranch`, so the checkout after branch creation never touched undo/redo (`clearRedo` never called) — same category of silent bug as batch 1, fixed along the way by the simple import replacement. Verified: `pnpm typecheck` passes, and `grep` confirms 0 remaining `hooks/`/`components/`/`stores/` file importing a function (not a type) from `lib/tauri.ts`. **R2 migration (action 6.5, 3 PRs) complete.** |
| 2026-07-02 | 6.6 | Follow-up audit after the R2 migration: `ActionToolbar.tsx` (327 lines) mixed the same categories as `GitGraph.tsx`/`WipStagingPanel.tsx` before them — imperative actions (fetch/fetchAll/pull/push/undo/redo/stash/pop/create branch/open terminal), per-action loading state, notification toast, derived values (hasChanges/hasStashes/canUndo/canRedo/labels) — with rendering. Created `hooks/useActionToolbar.ts`, a faithful relocation (verified by an independent `architecture-reviewer` agent before opening the PR: no logic difference, just relocation + parameterization by `t`). `ActionToolbar.tsx` reduced from 327→166 lines. Verified: `pnpm typecheck` passes, `architecture-reviewer` review PASS (R1 + R2 + hooks-rules). No manual test in the app — recommended to test fetch/pull/push, undo/redo, stash/pop, branch creation, opening the terminal via `pnpm dev` before merging. |
