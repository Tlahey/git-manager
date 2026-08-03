# Commit-graph context menus

This document is the single source of truth for **what appears when you right-click in the commit
graph** and under which conditions. The rules themselves live in
[`graphContextMenus.ts`](./graphContextMenus.ts) (pure, unit-tested builders) — this README is the
human-readable map of them, plus a report of the gaps still open.

## Architecture (3 layers)

Menus are **data**, not imperative Tauri calls. This keeps every "what shows / in which order /
under which condition" decision in one pure, testable place.

| Layer      | File                                                                          | Responsibility                                                                                                                                                                  |
| ---------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Spec**   | [`nativeMenuSpec.ts`](./nativeMenuSpec.ts)                                    | The vocabulary: `menuItem` / `menuSubmenu` / `menuSeparator` / `menuHeader`, plus `normalizeMenuSpec` (drops falsy entries, prunes empty submenus, collapses/trims separators). |
| **Config** | [`graphContextMenus.ts`](./graphContextMenus.ts)                              | The rules: pure builders returning `MenuSpecEntry[]` from a context object. **This is where menu content is decided.**                                                          |
| **Render** | [`../api/nativeMenu.api.ts`](../api/nativeMenu.api.ts) `showNativeMenu(spec)` | Turns a spec into a native macOS menu (icons, dark/disabled tinting, popup). No content logic.                                                                                  |

Wiring (context → builder → render) is done in the hooks:
[`useGitGraphActions.ts`](../hooks/useGitGraphActions.ts) (commit + WIP + stash) and
[`useTagContextMenu.ts`](../hooks/useTagContextMenu.ts) (tag badge).

**Conventions**

- Conditional items read as `condition && menuItem(...)`; normalization removes the falsy ones so a
  dropped section never leaves a dangling separator.
- Every label is an i18n key (`gitTree.contextMenu.*`, `gitTree.branchMenu.*`, `gitTree.wipMenu.*`),
  resolved with interpolation _before_ reaching the render layer (which has no i18n context).
- Items shipped **visible but disabled** are planned features with no backend yet — they keep the
  menu shape stable so wiring one later is a one-line `enabled`/`action` change.

## What you right-click → which menu

| Target                                           | Menu                           | Built by                                                       |
| ------------------------------------------------ | ------------------------------ | -------------------------------------------------------------- |
| A **tag badge**                                  | Tag menu                       | `useTagContextMenu` → `showTagNativeContextMenu`               |
| A **stash** commit row                           | Stash menu                     | `useGitGraphActions.openMenuAt` → `showStashNativeContextMenu` |
| The local **WIP** row (uncommitted changes)      | WIP menu                       | `buildWipMenuSpec`                                             |
| Any other **commit** row                         | Commit menu (3 layouts, below) | `buildCommitMenuSpec`                                          |
| A **`WIP:<path>`** row (another linked worktree) | Other-worktree menu            | `buildOtherWorktreeMenuSpec`                                   |
| The **CONFLICT** row (a paused rebase/merge)     | Conflict menu                  | `buildConflictMenuSpec`                                        |
| A **ref badge dropped onto another**             | Ref-drop menu                  | `useRefDrop` → `showRefDropNativeContextMenu`                  |

> A tag badge and a stash row are matched _before_ the commit menu. Right-clicking the **row** of a
> tag-only commit (not the badge) falls through to the commit menu.

## The commit menu — three layouts

`buildCommitMenuSpec` picks a layout from the refs on the clicked commit and the selection. A
**local branch and its remote-tracking counterpart** (`main` + `origin/main`) count as **one logical
branch** (`soleLogicalBranch`), so a _pushed_ branch tip does not split into two.

### 1. No branch → bare commit menu

When the commit carries no branch label **and** there is no current-branch fallback (see below):

```
Checkout this commit | Create worktree | Create branch / Cherry-pick / Reset ▸ / Revert |
Copy SHA / Copy link / Create patch | Create tag / Create annotated tag
```

### 2. One (logical) branch → flat inline menu

The single branch's actions are **flattened** into the commit menu (no submenu),
`buildFlatSingleBranchMenuSpec`, in this order:

```
[sync]         Pull / Push / Set upstream
[relationship] Fast-forward <current> to <b> / Merge <b> into <current> / Rebase <current> onto <b>
               Open worktree from <b> / Checkout this commit
               Create worktree from this commit
[core]         Create branch here / Cherry-pick / Reset <current> to this commit ▸ / Revert
[pr/explain]   Push <current> and start a pull request to <b> (remote only) /
               Explain branch changes (LLM) / Review branch changes (LLM)
[destructive]  Rename <b> (local only) / Delete <b>
[copy]         Copy branch name / Copy commit sha / Copy link to branch (remote or main) /
               Copy link to this commit / Create patch
[tail]         Pin to left / Solo
               Create tag here / Create annotated tag here
```

**Current-branch fallback (key rule):** a commit that carries no label but sits **on the current
branch** (an ancestor of HEAD that isn't a tip) still uses this flat layout, keyed to the current
branch. The current branch is passed in as `currentBranchRef` (pointing at its own tip). This is why
an ordinary history commit exposes the branch actions instead of the bare menu. Requires a
non-detached HEAD whose tip is in the loaded page.

### 3. Several branches → one submenu per branch

Between the core and the tag section, one `▸ <branch>` submenu per branch/remote ref, each with the
same sections as the flat layout. The commit's copy/patch actions live inside each submenu.

### 4. Multi-selection → dedicated flat menu (`buildMultiCommitMenuSpec`)

When more than one commit is selected, a distinct layout (no branch sections, no "N selected"
header). Commit-scoped actions target the **primary** (right-clicked) commit; cherry-pick and patch
span the **whole selection**:

```
Checkout this commit | Create worktree | Create branch here / Cherry-pick N commits /
Rebase <current> onto this commit / Reset <current> to this commit ▸ / Revert |
Copy SHA / Copy link / Create patch from commits | Compare commit against working directory |
Create tag / Create annotated tag
```

"Cherry-pick N commits" applies the selection oldest→newest; "Create patch from commits" writes one
`git am`-compatible file spanning the selection (backend `create_commits_patch`).

## Enable / disable & variant rules

| Item                                                               | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pull / Push**                                                    | Enabled only when the branch **is the current branch** (backend pulls/pushes HEAD only). Always shown on a local branch — in the sidebar, only on the **trunk** row (see below), since both act on HEAD regardless of which row was clicked.                                                                                                                                                                                                                      |
| **Set upstream**                                                   | Always **enabled** on a local branch — unlike pull/push it writes metadata (`branch.<name>.remote`/`.merge`) on the branch actually clicked, not on HEAD, so the sidebar offers it on **every** local branch row, not just the trunk. An unambiguous `origin/<name>` match (see `resolveDefaultUpstream` in `lib/branchUpstream.ts`) is applied immediately; otherwise `SetUpstreamDialog` opens and lists every remote-tracking branch in the repo to pick from. |
| **Fast-forward / Merge / Rebase**                                  | Shown only when the branch is **not** current **and** HEAD is not detached.                                                                                                                                                                                                                                                                                                                                                                                       |
| **Checkout `<branch>`**                                            | Graph submenu/flat: **remote** branches only (checks out its commit → detached); local branches offer only "Checkout this commit". Sidebar menu: shown for **both** (a local branch switches HEAD by name).                                                                                                                                                                                                                                                       |
| **Open worktree from `<branch>`**                                  | Always shown (opens from the branch tip).                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Push … start a pull request**                                    | Shown only for a **remote** branch with a current branch.                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Explain branch changes (LLM)** / **Review branch changes (LLM)** | Shown only when the clicked commit **actually carries that branch** (`isOnClickedCommit`) — on the current-branch fallback below, "the branch" would be whichever one is checked out, not what was pointed at. Disabled when the AI master switch is off, never hidden, so the capability stays discoverable.                                                                                                                                                     |
| **Rename `<branch>`**                                              | Local branches only.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Delete `<branch>`**                                              | Hidden on the **current** branch; enabled on both local and **remote** branches. A local delete runs straight away (undo/redo covers it); a remote delete opens `DeleteRemoteBranchDialog` first (real `git push <remote> :refs/heads/<name>`).                                                                                                                                                                                                                   |
| **Copy link to branch**                                            | Shown for a **remote** branch, or for a **local** branch whose remote-tracking counterpart is present on the commit (→ that ref's name). Local **`main`/`master`** additionally falls back to `origin/<name>` even without one actually on the commit. Not shown for a local branch that has never been pushed.                                                                                                                                                   |
| **Solo**                                                           | Always enabled. Isolates the branch in the graph via `useSoloModeStore` (`onSolo` → `enable([shortName])`), from both this menu and the sidebar's.                                                                                                                                                                                                                                                                                                                |

Any local branch that has been pushed (its remote-tracking ref sits on the same commit) gets
**Copy link to branch**; `main`/`master` are the only ones that get it even without an actual
remote ref present, via the `origin/<name>` fallback. Deletion of the current branch is never
offered.

## WIP row menu (local uncommitted changes)

```
Stash changes / Stash changes (include untracked) | Stage all changes / Unstage all changes |
Explain working changes (LLM) / Review changes (LLM)
```

Only the **local** WIP row has this menu. Stage/unstage are enabled from the working-tree state
(`hasUnstaged` / `hasStaged`). The two AI items sit together with no separator — they answer the two
halves of one moment ("what am I in the middle of?" then "is it alright to commit?") — and both
disable for the same two reasons: a **clean tree** (nothing to read) or the **AI master switch off**.
Committing is **not** in the menu — it stays on the row's inline input, and **"Discard
all changes" lives on the side panel, not here**.

## Other-worktree WIP row menu (`WIP:<path>`)

```
Open worktree | Stash changes there / Stash changes there (include untracked) | Reveal in Finder
```

A linked worktree's own uncommitted changes get a smaller menu than the local WIP row's, because
every action here targets the OTHER worktree's path, never the active repo. **Open worktree**
switches the graph/sidebar's view onto it (`activeWorkspacePath`) — the same thing the row's own
"Open Worktree" button and the sidebar's worktree row do, so there is exactly one meaning of "open" a
worktree in the app. **Stash there** pushes a stash in that worktree's working tree (the stash
commands take an explicit `path` rather than reading the active repo from `AppState`, so this is
safe); since `refs/stash` is shared across a repository's worktrees, the new entry also shows up back
in the active repo's own graph. Stage/unstage and the AI summary/review are deliberately **not**
offered — they read the _active_ repo's working tree today, and offering them here without an
explicit-path variant of each would either act on the wrong repo or need new commands.

## CONFLICT row menu (paused rebase/merge)

```
Continue | Skip | ─ | Abort
```

A shortcut to the same actions the conflict-resolution panel offers elsewhere, gated on the same
state (`buildConflictMenuSpec`): **Continue** is enabled once every conflict is resolved
(`status.conflicted` empty), **Skip** while nothing has been resolved yet, and **Abort** is always
available.

## All menus are declarative

Every graph/sidebar menu is now composed by a pure `build*MenuSpec` builder in
`graphContextMenus.ts` and rendered by the single `showNativeMenu(spec)` — no bespoke
`show*NativeContextMenu` functions remain.

- **Commit / multi-commit / single-branch / branch submenu** — see above.
- **WIP** (`buildWipMenuSpec`), **other-worktree WIP** (`buildOtherWorktreeMenuSpec`), **CONFLICT**
  (`buildConflictMenuSpec`), **Stash** (`buildStashMenuSpec`, reused by the graph and the sidebar
  stash rows).
- **Tag menu** (`buildTagMenuSpec`, `useTagContextMenu`): Push tag · Merge / Rebase / Interactive
  rebase (vs current branch) · Checkout · Create worktree · Create branch · Cherry-pick · Reset ▸ ·
  Revert · Delete locally · Delete from origin (real `git push origin :refs/tags/<name>`) · Copy tag
  name · Copy commit SHA · Copy link to tag · Annotate.
- **Ref-drop menu** (`buildRefDropMenuSpec`, `useRefDrop` — drag a badge onto another): Fast-forward
  / Merge / Rebase / Interactive rebase · Push · Reset ▸ · Start a pull request.
- **Sidebar branch menu** (`buildBranchMenuSpec`, `useSidebarBranchMenu`): reuses the **same** branch
  sections as the graph, so the two stay in sync. Rename opens `RenameBranchDialog`; a remote
  Delete opens `DeleteRemoteBranchDialog`.

---

# Report: menus / items that may be missing

Ranked roughly by user impact.

### Known-disabled placeholders (backend/feature missing)

1. ~~**Set upstream**~~ — **shipped**: `set_branch_upstream` command + `SetUpstreamDialog`.
2. ~~**Explain branch changes** / **Explain working changes**~~ — **shipped**, along with their
   _Review_ counterparts. See [docs/ai](../../../../docs/ai/README.md).
3. ~~**Delete a remote branch**~~ — **shipped**: `DeleteRemoteBranchDialog` confirms, then
   `delete_remote_branch` pushes `:refs/heads/<name>` (mirror of the remote-tag deletion).

### Real functional gaps

None currently open — see "Done since the first report" below.

### Done since the first report

- **Copy link to branch for any pushed branch** — no longer restricted to `main`/`master`; any
  local branch with a remote-tracking counterpart present on the commit now shows the item too.
- Multi-commit actions (cherry-pick / patch of a selection) — **implemented** (layout #4).
- "Discard all changes" on WIP — intentionally lives on the **side panel** (confirmed).
- Stash + branch-sidebar menus **internationalised** and **migrated** to the declarative layer.
- Tag / ref-drop / stash migrated to `showNativeMenu` — no bespoke menu functions remain.
- Tag menu gained **Push tag** and **Copy commit SHA** (issue #133).
- Sidebar branch menu now **reuses the shared branch config** (was "Delete branch" only).
- "Checkout a local branch (switch)" — now offered in the **sidebar** branch menu.
- "Compare to working directory" — back in the **multi-selection** menu.
- **`WIP:<path>` (other worktree) row** — now has a menu (`buildOtherWorktreeMenuSpec`): Open
  worktree / Stash there / Reveal in Finder.
- **CONFLICT row** — now has a menu (`buildConflictMenuSpec`, issue #132): Continue / Skip / Abort.
- **Merge-commit–specific items** — `isMergeCommit` now relabels the revert entry ("Revert this
  merge commit" — the dialog then asks which parent is the mainline, i.e. `git revert -m`) and adds
  "Compare against parent 1/2" (issue #130). The octopus case is deliberately partial: the compare
  entries stop at the second parent, while the revert picker lists every parent, because `-m` has to
  name the real one.
