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

## Covered today (9 features / 55 steps)

| Feature | Area | Setup | Snapshot | Status |
|---|---|---|---|---|
| App launches, React mounts | app shell | — | — | ✅ |
| Tauri command mock: success / reject / restore | IPC | mock | — | ✅ |
| Fixup autosquash grouping | fixup | fixture:fixup-chain | 📷 ✅ (preview groups) | ✅ |
| Rebase conflict panel auto-opens + **snapshot** | rebase | fixture:rebase-conflict | 📷 ✅ (panel layout) | 🟡 (panel shown + snapshotted; resolve/continue not driven) |
| **Merge editor** opens for a conflicted file + **snapshot** | merge | fixture:rebase-conflict | 📷 ✅ (full Monaco editor) | 🟡 (opens + snapshotted; block resolution not driven) |
| **Working-tree staging panel** shows + **snapshot** | commits | fixture:stash-stack | 📷 ✅ (staging panel) | 🟡 (panel shown + snapshotted; stage/commit not driven) |
| Detached HEAD indicator reads "HEAD" | repo state | fixture:detached-head | — | ✅ |
| Sidebar lists stashes | stash | fixture:stash-stack | — | 🟡 (list only; apply/pop/drop todo) |
| Settings screen opens + **snapshot** | settings | keyboard (Mod+,) | 📷 ✅ (general section) | 🟡 (general snapshotted; other sections todo) |

---

## Priority backlog (the domains we actually want next)

### 1. Merge editor  🟡  📷 (opens + snapshotted)
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

### 2. Injected repo fixtures  🟡
Each scripted fixture is a real, awkward git state — the highest-value e2e fuel. Coverage per
fixture:

| Fixture | Exercises | Status |
|---|---|---|
| fixup-chain | fixup grouping / autosquash · **create-fixup from staged change** | 🟡 (autosquash ✅; create-fixup ⬜) |
| rebase-conflict | conflict panel ✅ · **merge editor** ⬜ · continue/skip/abort flow ⬜ | 🟡 |
| detached-head | detached indicator ✅ · checkout-back-to-branch ⬜ | 🟡 |
| stash-stack | list ✅ · **apply / pop / drop / stash message edit** ⬜ | 🟡 |
| rollback-history | **reset (soft/mixed/hard) · revert · undo/redo of those** ⬜ | ⬜ |

### 3. Settings  🟡  📷
`SettingsPage` (opened via `Mod+,` or the dashboard gear — `dashboard-settings-button`). **Done:**
opens on the general section + a layout snapshot of the whole screen. Nav tabs now carry
`settings-tab-<id>` testids and the root `settings-page`. **Todo:** navigate + snapshot the other
sections (appearance, notifications are deterministic; ssh/local_ai/rewards have dynamic content —
mask or assert values instead), and toggle-a-setting-persists. Note the section *content* has no
real testid on its root (the `section-*` ids are test-mock-only) — snapshot the `settings-page`
root or add a per-section testid.

### 4. Commits / working tree  🟡  📷 (staging panel snapshotted)
**Done:** selecting the synthetic WIP node (`graph-row-WIP`) opens the staging panel
(`wip-staging-panel`) + a layout snapshot. Setup: `fixture:stash-stack` (leaves staged +
unstaged changes → a WIP node). **Gotcha handled:** the WIP row's centre is its inline "// WIP"
commit input (stops click propagation), so the step clicks the row's left edge over the graph
node. **Todo:** stage a file · bulk stage (`file-list-bulk-stage`) · type a subject/body and
commit · amend (`commit-amend-*`). The commit-box / file-row testids are still mock-only. Diff
view (`diff-content-area`, `monaco-diff-viewer`) is a further 📷 candidate.

### 5. Undo / redo  ⬜
State-mutating actions push to `undoHistory.store`. **Note:** the toolbar undo/redo buttons'
testids are dead (see blockers), but undo/redo is also bound to **Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z**
(`hooks/useKeyboardShortcuts.ts`) — drive it with `browser.keys([...])`. Setup:
`fixture:rollback-history`. Scenario: perform a reset/commit · Cmd+Z · assert the graph/HEAD
reverted · redo · assert re-applied. High value (undo is easy to break, hard to unit-test across
the real IPC boundary).

---

## Rest of the surface (lower priority / smaller)

| Feature | Area | Setup | Snapshot | Status |
|---|---|---|---|---|
| Commit graph rendering | log/graph | any fixture | 📷 | ⬜ |
| Branches: create / checkout / delete | branch | any fixture | — | ⬜ |
| Tags: create / list | tag | any fixture | — | ⬜ |
| Cherry-pick a commit | cherry-pick | rollback-history | — | ⬜ |
| Interactive rebase (reword/squash/drop) | rebase | fixup-chain | — | ⬜ (child window) |
| Reset (soft/mixed/hard, RESET confirm) | rollback | rollback-history | — | ⬜ |
| Revert a commit | rollback | rollback-history | — | ⬜ |
| Remote: fetch / pull / push | remote | native creds | — | 🚫 (needs a real remote) |
| Clone a repo | repo | native | — | 🚫 (native dialog + network) |
| Scan a folder for repos | repo | native | — | 🚫 (native dialog) |
| Ollama commit-message generation | AI | mock | — | ⬜ (mock the stream) |
| GitHub OAuth device flow | github | mock | — | ⬜ (mock the poll) |
| SSH key generate / read | ssh | seed | — | ⬜ |
| Submodule list | submodule | dedicated fixture | — | ⬜ |
| Worktree add / list / remove | worktree | native path | — | ⬜ |
| Themes | settings | seed | 📷 | ⬜ |
| Rewards / gamification toast | rewards | action-triggered | 📷 | ⬜ |
| Notifications tray/dropdown | notifications | seed | — | ⬜ |

---

## Snapshot strategy

Visual snapshots are already wired (`@wdio/visual-service`, see README "Visual snapshots") and
proven on the fixup preview. **The plan is to make a snapshot the default validation for any
feature whose value is in how it *renders*** — layout, alignment, theming — rather than a single
DOM value:

- **Best snapshot targets** (📷 above): merge editor resolved layout, commit graph, diff view,
  each settings section, themes, the autosquash preview (done).
- **Not snapshot targets**: pure state/logic assertions (detached indicator text, mock call
  counts, stash count) — a DOM/value assertion is clearer and less brittle there.
- **Per-feature recipe**: `await stabiliseForSnapshot()` (shared helper in `support/visual.ts`)
  then `await expect($('[data-testid="…"]')).toMatchElementSnapshot('<tag>', 1)`. Whole-screen:
  `browser.checkScreen('<tag>')`. Tolerance `1` absorbs sub-pixel jitter; real regressions run
  much higher. Used today by the fixup preview and the conflict resolution panel.
- **Watch out for volatile content**: the tolerance that absorbs jitter *also* silently absorbs
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
  by seeding localStorage (see README); features that *need* a native dialog mid-flow are 🚫.
- **Multi-window** (merge / fixup / rebase child windows) needs `switchToWindow` and is heavier;
  Monaco content in those windows is best validated by snapshot, not DOM queries.
- **Real remote / network** (fetch/pull/push, clone, GitHub, Ollama) — mock the IPC command
  (`browser.tauri.mock`) rather than standing up a real server, unless doing an integration run.
- Each feature runs one worker; keep scenarios independent (state is reset by the reload in the
  shared open-repo step, and `restoreAllMocks` in an `After` hook).
