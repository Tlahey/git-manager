# E2E coverage matrix

Living map of what the WebdriverIO/Cucumber suite (`apps/e2e`) covers versus the app's real
feature surface, so we can see at a glance what's still untested and plan the next batch. Update
the **Status** column when you add a feature. See [README.md](./README.md) for how the harness
works.

## Legend

**Status** — ✅ covered · 🟡 partial (some scenarios) · ⬜ todo · 🚫 blocked (see notes)
**Snapshot** — 📷 = good visual-snapshot candidate (layout/rendering worth guarding);
`toMatchElementSnapshot` / `toMatchScreenSnapshot`, see [Snapshot strategy](#snapshot-strategy).
**Setup** — how a scenario gets the app into the right state. `fixture:<name>` = one of the
scripted repos under `tools/git-fixtures/scenarios/` opened via the shared
`Given the "<name>" fixture repository is opened` step. `mock` = `browser.tauri.mock`. `seed` =
localStorage seed. `native` = needs a real OS dialog/window (see blockers).

---

## Covered today (11 features / 72 steps, 6 visual snapshots)

| Feature                                                            | Area       | Setup                    | Snapshot                          | Status                                                      |
| ------------------------------------------------------------------ | ---------- | ------------------------ | --------------------------------- | ----------------------------------------------------------- |
| App launches, React mounts                                         | app shell  | —                        | —                                 | ✅                                                          |
| Tauri command mock: success / reject / restore                     | IPC        | mock                     | —                                 | ✅                                                          |
| Fixup autosquash grouping                                          | fixup      | fixture:fixup-chain      | 📷 ✅ (preview groups)            | ✅                                                          |
| Rebase conflict panel auto-opens + **snapshot**                    | rebase     | fixture:rebase-conflict  | 📷 ✅ (panel layout)              | 🟡 (panel shown + snapshotted; resolve/continue not driven) |
| **Merge editor** opens for a conflicted file + **snapshot**        | merge      | fixture:rebase-conflict  | 📷 ✅ (full Monaco editor)        | 🟡 (opens + snapshotted; block resolution not driven)       |
| **Working-tree staging panel** + **file diff** + **snapshots**     | commits    | fixture:stash-stack      | 📷 ✅ (staging panel + diff view) | ✅                                                          |
| **Commit staged changes** (write message → Commit → HEAD advances) | commits    | fixture:stash-stack      | —                                 | ✅                                                          |
| **Undo / redo a branch checkout** (Cmd+Z / Cmd+Shift+Z)            | undo/redo  | fixture:feature-branches | —                                 | ✅                                                          |
| Detached HEAD indicator reads "HEAD"                               | repo state | fixture:detached-head    | —                                 | ✅                                                          |
| Sidebar lists stashes                                              | stash      | fixture:stash-stack      | —                                 | 🟡 (list only; apply/pop/drop blocked — native menu)        |
| Settings screen opens + **snapshot**                               | settings   | keyboard (Mod+,)         | 📷 ✅ (general section)           | 🟡 (general snapshotted; other sections todo)               |

---

## Priority backlog (the domains we actually want next)

### 1. Merge editor 🟡 📷 (opens + snapshotted)

The three-way merge editor (`components/merge-editor/ConflictMergeWindow.tsx`) normally opens in a
**separate Tauri window** (`?window=merge`) and renders with **Monaco**. **Done:** rather than
driving the native second window, the test navigates the current window straight to the merge
route (`/?window=merge&repoPath=…&filePath=…`) — main.tsx renders `ConflictMergeWindow` from those
URL params, independent of the store — waits for `merge-auto-merge-button` (appears once
`get_merge_view` resolves), and **snapshots the whole Monaco editor** (`merge-editor-window`).
Verified stable across multiple runs with a 1.5s Monaco settle + `stabiliseForSnapshot`.

- Setup: `fixture:rebase-conflict` — the conflicted `dependency-manifest.txt` "covers every
  merge-editor block kind twice", ideal for a layout snapshot.
- **Gotcha handled**: the embedded provider shares one app window across features (run
  sequentially), so this feature resets the URL to `/` in an `After({ tags: '@merge' })` hook —
  otherwise every feature after it inherits `?window=merge`. See merge.steps.ts.
- **Todo:** drive block resolution (`merge-accept-left`/`-right`, `merge-apply`, auto-merge) and
  assert the result; those testids are mock-only today and would need adding to the real panes.

### 2. Injected repo fixtures 🟡

Each scripted fixture is a real, awkward git state — the highest-value e2e fuel. Coverage per
fixture:

| Fixture          | Exercises                                                                                       | Status                              |
| ---------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------- |
| fixup-chain      | fixup grouping / autosquash · **create-fixup from staged change**                               | 🟡 (autosquash ✅; create-fixup ⬜) |
| rebase-conflict  | conflict panel ✅ · merge editor ✅ · continue/skip/abort flow ⬜                               | 🟡                                  |
| detached-head    | detached indicator ✅ · checkout-back-to-branch ⬜                                              | 🟡                                  |
| feature-branches | branch checkout ✅ · **undo/redo of the checkout** ✅                                           | ✅                                  |
| stash-stack      | list ✅ · WIP staging panel ✅ · file diff ✅ · **commit** ✅ · apply/pop/drop 🚫 (native menu) | ✅                                  |
| rollback-history | **reset (soft/mixed/hard) · revert · undo/redo of those** ⬜                                    | ⬜                                  |

### 3. Settings 🟡 📷

`SettingsPage` (opened via `Mod+,` or the dashboard gear — `dashboard-settings-button`). **Done:**
opens on the general section + a layout snapshot of the whole screen. Nav tabs now carry
`settings-tab-<id>` testids and the root `settings-page`. **Todo:** navigate + snapshot the other
sections (appearance, notifications are deterministic; ssh/local_ai/rewards have dynamic content —
mask or assert values instead), and toggle-a-setting-persists. Note the section _content_ has no
real testid on its root (the `section-*` ids are test-mock-only) — snapshot the `settings-page`
root or add a per-section testid.

### 4. Commits / working tree 🟡 📷 (staging panel snapshotted)

**Done:** selecting the synthetic WIP node (`graph-row-WIP`) opens the staging panel
(`wip-staging-panel`) + a layout snapshot. Setup: `fixture:stash-stack` (leaves `config.yml`
staged → a WIP node). **Gotcha handled:** the WIP row's centre is its inline "// WIP" commit input
(stops click propagation), so the step clicks the row's left edge over the graph node. **Commit:
done** — `commit.feature` types into the message box (`commit-message-input`, new real testid),
clicks Commit (`commit-button`, new real testid → real `apiCreateCommit`), and asserts HEAD
advanced by reading the fixture repo's `git log -1` **off disk** (the wdio worker is Node, like the
fixture-build step) rather than a volatile UI value — robust to the panel unmounting once the tree
goes clean. **Diff view: done** — clicking a file row (`file-tree-file-<path>`, a real testid)
shows the diff (`diff-content-area`) and it's snapshotted (`wip-file-diff`), verified stable.
**Todo:** stage/unstage individual files · bulk stage (`file-list-bulk-stage`) · amend
(`commit-amend-*` are still mock-only).

### 5. Undo / redo ✅ (checkout) · ⬜ (reset/commit)

State-mutating actions push to `undoHistory.store`. **Done:** the `undo-redo.feature` drives a
real **branch checkout** through the toolbar's `BranchContext` selector (new
`branch-option-<name>` testid), then **Cmd+Z / Cmd+Shift+Z** — bound globally in
`hooks/useKeyboardShortcuts.ts`, driven with `browser.keys([META, 'z'])` /
`browser.keys([META, SHIFT, 'z'])` — and asserts HEAD moves `main → feature/login → main →
feature/login` via the shared `branch-context-label` indicator (now polled, since undo/redo are
async). This sidesteps the dead toolbar-button testids (see blockers) entirely. Setup: the new
`fixture:feature-branches` (HEAD on a **named** branch so the indicator resolves to a branch name,
not a detached sha). **Todo:** cover the other undoable actions — a reset or commit then Cmd+Z on
`fixture:rollback-history`, asserting the graph/HEAD reverts and redo re-applies.

---

## Rest of the surface (lower priority / smaller)

| Feature                                 | Area          | Setup             | Snapshot | Status                                                                               |
| --------------------------------------- | ------------- | ----------------- | -------- | ------------------------------------------------------------------------------------ |
| Commit graph rendering                  | log/graph     | any fixture       | 📷       | ⬜ (volatile: shas/dates)                                                            |
| Branches: create / checkout / delete    | branch        | any fixture       | —        | 🟡 (checkout ✅ via BranchContext; create/delete are behind the native commit menu)  |
| Tags: create / list                     | tag           | any fixture       | —        | 🚫 (create is behind the native commit context menu)                                 |
| Cherry-pick a commit                    | cherry-pick   | rollback-history  | —        | 🚫 (native commit context menu)                                                      |
| Interactive rebase (reword/squash/drop) | rebase        | fixup-chain       | —        | 🚫 (native commit menu + child window)                                               |
| Reset (soft/mixed/hard, RESET confirm)  | rollback      | rollback-history  | —        | 🚫 (ResetDialog is web+drivable, but only opens from the native commit context menu) |
| Revert a commit                         | rollback      | rollback-history  | —        | 🚫 (native commit context menu)                                                      |
| Remote: fetch / pull / push             | remote        | native creds      | —        | 🚫 (needs a real remote)                                                             |
| Clone a repo                            | repo          | native            | —        | 🚫 (native dialog + network)                                                         |
| Scan a folder for repos                 | repo          | native            | —        | 🚫 (native dialog)                                                                   |
| Ollama commit-message generation        | AI            | mock              | —        | ⬜ (mock the stream)                                                                 |
| GitHub OAuth device flow                | github        | mock              | —        | ⬜ (mock the poll)                                                                   |
| SSH key generate / read                 | ssh           | seed              | —        | ⬜                                                                                   |
| Submodule list                          | submodule     | dedicated fixture | —        | ⬜                                                                                   |
| Worktree add / list / remove            | worktree      | native path       | —        | ⬜                                                                                   |
| Themes                                  | settings      | seed              | 📷       | ⬜                                                                                   |
| Rewards / gamification toast            | rewards       | action-triggered  | 📷       | ⬜                                                                                   |
| Notifications tray/dropdown             | notifications | seed              | —        | ⬜                                                                                   |

---

## Snapshot strategy

Visual snapshots are already wired (`@wdio/visual-service`, see README "Visual snapshots") and
proven on the fixup preview. **The plan is to make a snapshot the default validation for any
feature whose value is in how it _renders_** — layout, alignment, theming — rather than a single
DOM value:

- **Best snapshot targets** (📷 above): merge editor resolved layout, commit graph, diff view,
  each settings section, themes, the autosquash preview (done).
- **Not snapshot targets**: pure state/logic assertions (detached indicator text, mock call
  counts, stash count) — a DOM/value assertion is clearer and less brittle there.
- **Per-feature recipe**: `await stabiliseForSnapshot()` (shared helper in `support/visual.ts`)
  then `await expect($('[data-testid="…"]')).toMatchElementSnapshot('<tag>', 1)`. Whole-screen:
  `browser.checkScreen('<tag>')`. Tolerance `1` absorbs sub-pixel jitter; real regressions run
  much higher. Used today by the fixup preview and the conflict resolution panel.
- **Watch out for volatile content**: the tolerance that absorbs jitter _also_ silently absorbs
  small volatile text — short commit OIDs, timestamps (a few chars are a tiny pixel fraction of a
  large element). The fixup preview snapshots a region that includes `fixup! <short-oid>` and
  passes only because those 7 chars stay under 1% of the box; that's robust-by-proportion, not by
  design. Prefer regions with no volatile content (the conflict panel: file names + subjects, no
  shas), or mask it with the visual service's `hideElements` / `removeElements`. Verify a new
  snapshot's stability by running it twice with the fixture rebuilt in between.
- **Baselines** live in `apps/e2e/__visual__/<platform>/<arch>/<provider>/` — gitignored until a
  CI runner owns a canonical per-OS baseline (then commit them so PRs get an explicit visual diff).

---

## Known blockers / gotchas

- **Dead toolbar testids** — `ActionToolbar` passes `data-testid` to `ToolbarButton`, which
  doesn't forward it, so `toolbar-undo-button` / `toolbar-redo-button` / `toolbar-stash-button` /
  `toolbar-terminal-button` never reach the DOM. Use keyboard shortcuts or other selectors until
  that's fixed (flagged separately).
- **Native dialogs can't be driven** — folder pickers, clone, scan. Worked around for "open repo"
  by seeding localStorage (see README); features that _need_ a native dialog mid-flow are 🚫.
- **Native context menus gate most commit/stash actions** — the graph's right-click commit menu
  (`showCommitNativeContextMenu` in `api/nativeMenu.api.ts`) and the stash right-click menu
  (`showStashNativeContextMenu`) are real OS menus WebDriver can't open. That blocks _every_ action
  reachable only through them from e2e: reset, revert, cherry-pick, interactive rebase, create
  tag/branch-from-commit, and stash apply/pop/drop — even when the follow-up UI is web and drivable
  (e.g. `ResetDialog` is a plain React dialog, but nothing web-driveable opens it). Prefer actions
  with a non-menu entry point: branch checkout via `BranchContext` (undo-redo.feature), commit via
  the WIP panel buttons (commit.feature), undo/redo via keyboard.
- **Multi-window** (merge / fixup / rebase child windows) needs `switchToWindow` and is heavier;
  Monaco content in those windows is best validated by snapshot, not DOM queries.
- **Real remote / network** (fetch/pull/push, clone, GitHub, Ollama) — mock the IPC command
  (`browser.tauri.mock`) rather than standing up a real server, unless doing an integration run.
- Each feature runs one worker; keep scenarios independent (state is reset by the reload in the
  shared open-repo step, and `restoreAllMocks` in an `After` hook).
