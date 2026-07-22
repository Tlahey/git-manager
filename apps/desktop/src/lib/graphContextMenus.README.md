# Commit-graph context menus

This document is the single source of truth for **what appears when you right-click in the commit
graph** and under which conditions. The rules themselves live in
[`graphContextMenus.ts`](./graphContextMenus.ts) (pure, unit-tested builders) — this README is the
human-readable map of them, plus a report of the gaps still open.

## Architecture (3 layers)

Menus are **data**, not imperative Tauri calls. This keeps every "what shows / in which order /
under which condition" decision in one pure, testable place.

| Layer | File | Responsibility |
| --- | --- | --- |
| **Spec** | [`nativeMenuSpec.ts`](./nativeMenuSpec.ts) | The vocabulary: `menuItem` / `menuSubmenu` / `menuSeparator` / `menuHeader`, plus `normalizeMenuSpec` (drops falsy entries, prunes empty submenus, collapses/trims separators). |
| **Config** | [`graphContextMenus.ts`](./graphContextMenus.ts) | The rules: pure builders returning `MenuSpecEntry[]` from a context object. **This is where menu content is decided.** |
| **Render** | [`../api/nativeMenu.api.ts`](../api/nativeMenu.api.ts) `showNativeMenu(spec)` | Turns a spec into a native macOS menu (icons, dark/disabled tinting, popup). No content logic. |

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

| Target | Menu | Built by |
| --- | --- | --- |
| A **tag badge** | Tag menu | `useTagContextMenu` → `showTagNativeContextMenu` |
| A **stash** commit row | Stash menu | `useGitGraphActions.openMenuAt` → `showStashNativeContextMenu` |
| The local **WIP** row (uncommitted changes) | WIP menu | `buildWipMenuSpec` |
| Any other **commit** row | Commit menu (3 layouts, below) | `buildCommitMenuSpec` |
| A **`WIP:<path>`** (other worktree) or the **CONFLICT** row | _no menu_ | — |
| A **ref badge dropped onto another** | Ref-drop menu | `useRefDrop` → `showRefDropNativeContextMenu` |

> A tag badge and a stash row are matched _before_ the commit menu. Right-clicking the **row** of a
> tag-only commit (not the badge) falls through to the commit menu.

## The commit menu — three layouts

`buildCommitMenuSpec` picks a layout from the refs on the clicked commit and the selection. A
**local branch and its remote-tracking counterpart** (`main` + `origin/main`) count as **one logical
branch** (`soleLogicalBranch`), so a *pushed* branch tip does not split into two.

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
[pr/explain]   Push <current> and start a pull request to <b> (remote only) / Explain branch changes
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

| Item | Rule |
| --- | --- |
| **Pull / Push** | Enabled only when the branch **is the current branch** (backend pulls/pushes HEAD only). Always shown on a local branch. |
| **Set upstream** | Always **disabled** (placeholder — no backend). |
| **Fast-forward / Merge / Rebase** | Shown only when the branch is **not** current **and** HEAD is not detached. |
| **Checkout `<branch>`** | Graph submenu/flat: **remote** branches only (checks out its commit → detached); local branches offer only "Checkout this commit". Sidebar menu: shown for **both** (a local branch switches HEAD by name). |
| **Open worktree from `<branch>`** | Always shown (opens from the branch tip). |
| **Push … start a pull request** | Shown only for a **remote** branch with a current branch. |
| **Explain branch changes** | Always **disabled** (placeholder — no AI feature yet). |
| **Rename `<branch>`** | Local branches only. |
| **Delete `<branch>`** | Hidden on the **current** branch; **disabled** on **remote** branches (no confirm flow yet); enabled on other local branches. |
| **Copy link to branch** | Shown for a **remote** branch, or for the local **`main`/`master`** (→ `origin/<name>`). Not shown for other local branches. |
| **Solo** | Always **disabled** (placeholder — no branch-filter integration). |

The **`main`/`master`** branch is the only local branch that gets **Copy link to branch**
(`isMainBranchName`). Deletion of the current branch is never offered.

## WIP row menu (local uncommitted changes)
```
Stash changes / Stash changes (include untracked) | Stage all changes / Unstage all changes |
Explain working changes (Preview)
```
Only the **local** WIP row has a menu. Stage/unstage are enabled from the working-tree state
(`hasUnstaged` / `hasStaged`); "Explain working changes" is a **disabled placeholder** (no AI
feature yet). Committing is **not** in the menu — it stays on the row's inline input, and **"Discard
all changes" lives on the side panel, not here**. Other synthetic rows (`WIP:<path>` for another
worktree, and the CONFLICT row) have **no** menu.

## All menus are declarative

Every graph/sidebar menu is now composed by a pure `build*MenuSpec` builder in
`graphContextMenus.ts` and rendered by the single `showNativeMenu(spec)` — no bespoke
`show*NativeContextMenu` functions remain.

- **Commit / multi-commit / single-branch / branch submenu** — see above.
- **WIP** (`buildWipMenuSpec`), **Stash** (`buildStashMenuSpec`, reused by the graph and the sidebar
  stash rows).
- **Tag menu** (`buildTagMenuSpec`, `useTagContextMenu`): Merge / Rebase / Interactive rebase (vs
  current branch) · Checkout · Create worktree · Create branch · Cherry-pick · Reset ▸ · Revert ·
  Delete locally · Delete from origin (real `git push origin :refs/tags/<name>`) · Copy tag name ·
  Copy link to tag · Annotate.
- **Ref-drop menu** (`buildRefDropMenuSpec`, `useRefDrop` — drag a badge onto another): Fast-forward
  / Merge / Rebase / Interactive rebase · Push · Reset ▸ · Start a pull request.
- **Sidebar branch menu** (`buildBranchMenuSpec`, `useSidebarBranchMenu`): reuses the **same** branch
  sections as the graph, so the two stay in sync. Rename opens `RenameBranchDialog`.

---

# Report: menus / items that may be missing

Ranked roughly by user impact.

### Known-disabled placeholders (backend/feature missing)
1. **Set upstream** — needs a backend command to set a branch's upstream.
2. **Explain branch changes** / **Explain working changes** — need AI features in `packages/ai`
   (branch-diff and working-diff → summary).
3. **Solo** — needs to drive a graph branch-filter (isolate one branch's commits).
4. **Delete a remote branch** — disabled; needs the confirm flow + `push :refs/heads/<name>` backend
   (mirror of the remote-tag deletion already shipped).

### Real functional gaps
5. **Merge-commit–specific items** — `isMergeCommit` is threaded through the context but unused. No
   "Revert merge (-m 1/2)", no "compare against parent 1/2". Reverting a merge currently uses the
   plain revert path, which can fail on merges.
6. **`WIP:<path>` (other worktree) row** — no menu. Could offer "Open worktree", "Stash there", etc.
7. **CONFLICT row** — no menu. Abort/continue a paused rebase lives elsewhere; a right-click shortcut
   could help.
8. **Tag menu** has no "Push tag" and no "Copy commit SHA" (Copy tag name / Copy link only).

### Nice-to-have
9. **Copy link to branch for any pushed branch** — currently restricted to `main`/`master`; could
   extend to any local branch that has a remote-tracking counterpart on the commit.

### Done since the first report
- Multi-commit actions (cherry-pick / patch of a selection) — **implemented** (layout #4).
- "Discard all changes" on WIP — intentionally lives on the **side panel** (confirmed).
- Stash + branch-sidebar menus **internationalised** and **migrated** to the declarative layer.
- Tag / ref-drop / stash migrated to `showNativeMenu` — no bespoke menu functions remain.
- Sidebar branch menu now **reuses the shared branch config** (was "Delete branch" only).
- "Checkout a local branch (switch)" — now offered in the **sidebar** branch menu.
- "Compare to working directory" — back in the **multi-selection** menu.
