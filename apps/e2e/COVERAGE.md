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

## Covered today (6 features / 35 steps)

| Feature | Area | Setup | Snapshot | Status |
|---|---|---|---|---|
| App launches, React mounts | app shell | — | — | ✅ |
| Tauri command mock: success / reject / restore | IPC | mock | — | ✅ |
| Fixup autosquash grouping | fixup | fixture:fixup-chain | 📷 ✅ (preview groups) | ✅ |
| Rebase conflict panel auto-opens + **snapshot** | rebase | fixture:rebase-conflict | 📷 ✅ (panel layout) | 🟡 (panel shown + snapshotted; resolve/continue not driven) |
| Detached HEAD indicator reads "HEAD" | repo state | fixture:detached-head | — | ✅ |
| Sidebar lists stashes | stash | fixture:stash-stack | — | 🟡 (list only; apply/pop/drop todo) |

---

## Priority backlog (the domains we actually want next)

### 1. Merge editor  ⬜  📷
The three-way merge editor (`components/merge-editor/ConflictMergeWindow.tsx`) opens in a
**separate Tauri window** (`?window=merge`) and renders with **Monaco**. Two consequences for e2e:
- Multi-window: the test must `getWindowHandles()` / `switchToWindow()` to reach it (the
  tauri-service supports this — seen in run logs).
- Monaco's content is largely canvas/virtualised, so **DOM assertions are brittle → visual
  snapshot is the realistic validation** here. Existing testids: `three-way-merge-editor`,
  `merge-accept-left`, `merge-accept-right`, `merge-apply`, `merge-auto-merge-button`,
  `merge-cancel`, `dialog-continue-merge`, `dialog-discard-and-apply`.
- Setup: `fixture:rebase-conflict` (the paused rebase exposes a conflicted file), then open the
  file's merge window. The fixture's file "covers every merge-editor block kind twice" — ideal
  for a layout snapshot.
- Scenarios to write: window opens for a conflicted file · accept-left / accept-right updates a
  block · auto-merge resolves the trivial blocks · **snapshot of the resolved layout**.

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

### 3. Settings  ⬜  📷
`SettingsPage` (opened via the dashboard gear or keyboard shortcut). Sections each have a real
testid: `section-general`, `section-appearance`(`ui_customization`), `section-integrations`,
`section-local_ai`, `section-ssh`, `section-notifications`, `section-rewards`,
`section-external_tools`, `section-debug`. Scenarios: open settings · navigate each section ·
toggle a setting and confirm it persists (localStorage) · **snapshot of each section's layout**.
Good snapshot target — mostly static, deterministic panels.

### 4. Commits / working tree  ⬜  📷
Staging + commit flow. Testids: `wip-staging-panel`, `file-list-bulk-stage`,
`commit-subject-input`, `commit-body-textarea`, `commit-subject-counter`, `commit-amend-form`,
`commit-amend-submit`, `commit-amend-cancel`. Setup: a fixture with a dirty tree (stash-stack
leaves staged + unstaged changes; or a new dedicated fixture). Scenarios: stage a file · bulk
stage · type a subject/body and commit · amend the last commit · discard a change. Diff view
(`diff-content-area`, `diff-view-center`, `monaco-diff-viewer`) is a 📷 candidate.

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
