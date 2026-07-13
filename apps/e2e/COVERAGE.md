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

## Covered today (18 feature files / ~160 steps, 7 visual snapshots)

| Feature                                                            | Area       | Setup                    | Snapshot                          | Status                                                      |
| ------------------------------------------------------------------ | ---------- | ------------------------ | --------------------------------- | ----------------------------------------------------------- |
| **Command palette (⌘K)**: 11 scenarios across settings/commit/stash | palette    | rollback-history · feature-branches · stash-stack | — | ✅ (settings section; reset soft/mixed/hard incl. RESET-confirm gate/revert/create-branch/create-tag (lightweight + annotated)/cherry-pick on a commit; stash drop/apply/pop — each asserted via git on disk) |
| App launches, React mounts                                         | app shell  | —                        | —                                 | ✅                                                          |
| Tauri command mock: success / reject / restore                     | IPC        | mock                     | —                                 | ✅                                                          |
| Fixup autosquash grouping + **create fixup commit (via ⌘K palette)** | fixup      | fixture:fixup-chain      | 📷 ✅ (preview groups)            | ✅                                                          |
| Rebase conflict panel auto-opens + **snapshot** + continue/skip/abort | rebase     | fixture:rebase-conflict  | 📷 ✅ (panel layout)              | ✅ (panel shown + snapshotted; continue/skip/abort ✅; merge-editor block resolution now driven separately) |
| **Merge editor** opens for a conflicted file + **snapshot** + **block resolution** | merge      | fixture:rebase-conflict  | 📷 ✅ (full Monaco editor)        | ✅ (opens + snapshotted; **wand + per-block accept + Apply ✅**, real second window, result asserted via git/file content) |
| **Working-tree staging panel** + **file diff** + **snapshots**     | commits    | fixture:stash-stack      | 📷 ✅ (staging panel + diff view) | ✅                                                          |
| **Commit staged changes** (write message → Commit → HEAD advances) | commits    | fixture:stash-stack      | —                                 | ✅                                                          |
| **Undo / redo a branch checkout** (Cmd+Z / Cmd+Shift+Z)            | undo/redo  | fixture:feature-branches | —                                 | ✅                                                          |
| Detached HEAD indicator reads "HEAD", checkout back to a branch                                                          | repo state | fixture:detached-head    | —                                 | ✅                                                          |
| Sidebar lists stashes                                              | stash      | fixture:stash-stack      | —                                 | ✅ (list ✅; **drop/apply/pop ✅ via ⌘K palette**, each asserted via `git stash list` / a restored file) |
| Settings screen opens + **snapshot**                               | settings   | keyboard (Mod+,)         | 📷 ✅ (general + notifications)   | 🟡 (general & notifications snapshotted; row-height persistence ✅; **ssh key generation ✅ · AI provider test-connection ✅ · rewards toggle ✅ · AI preset dropdown ✅**; appearance snapshot skipped on purpose, see below) |
| **AI commit-message generation**: streaming + prompt-wiring + cancel | AI         | fake HTTP server         | —                                 | ✅ (see "6. AI commit-message generation" below)            |
| **Worktree** list / add / remove (incl. dirty-remove force gate)  | worktree   | fixture:worktree-repo    | —                                 | ✅ (see "Worktree management" below)                        |

---

## Priority backlog (the domains we actually want next)

### 1. Merge editor ✅ 📷 (opens + snapshotted + block resolution)

The three-way merge editor (`components/merge-editor/ConflictMergeWindow.tsx`) normally opens in a
**separate Tauri window** (`?window=merge`) and renders with **Monaco**. **Opens + snapshot:**
rather than driving the native second window, that scenario navigates the current window straight
to the merge route (`/?window=merge&repoPath=…&filePath=…`) — main.tsx renders
`ConflictMergeWindow` from those URL params, independent of the store — waits for
`merge-auto-merge-button` (appears once `get_merge_view` resolves), and **snapshots the whole
Monaco editor** (`merge-editor-window`). Verified stable across multiple runs with a 1.5s Monaco
settle + `stabiliseForSnapshot`.

- Setup: `fixture:rebase-conflict` — the conflicted `dependency-manifest.txt` "covers every
  merge-editor block kind twice", ideal for a layout snapshot.
- **Gotcha handled**: the embedded provider shares one app window across features (run
  sequentially), so this feature resets the URL to `/` in an `After({ tags: '@merge' })` hook —
  otherwise every feature after it inherits `?window=merge`. See merge.steps.ts.

**Block resolution: done** — unlike the opens/snapshot scenario above, every action that actually
*resolves* the conflict (`merge-apply`, `merge-accept-left`/`-right`, keep-ours/keep-theirs) calls
`getCurrentWindow().close()`, so reusing the shared main window here would kill the rest of the
test run (see the multi-window gotcha below). This scenario instead opens a **real second
`WebviewWindow`** the same way production does — clicking the conflicted file row in
`ConflictResolutionPanel` (`file-tree-file-<path>`, `onSelectFile` → repoUI's `conflictFilePath` →
GitGraph's `WebviewWindow`-open effect) — then: clicks the auto-merge wand
(`merge-auto-merge-button`, the real testid; already existed, contrary to an earlier note here
claiming these were mock-only), which resolves only the **modification** blocks (both sides) per
`git_merge_diff.rs`'s `auto_merge_non_conflicting` (deletions/additions are deliberately left
pending, see its doc comment and the `auto_merge_skips_deletions_and_additions` Rust test); then
queries every still-actionable `merge-connector-accept-right-*` button (the real per-block gutter
buttons in `MergeConnectorOverlay.tsx`) — after the wand this is exactly the 2 real conflicts plus
the 2 ours-only deletion/addition blocks the wand left pending — and clicks each via injected JS;
then clicks `merge-apply` (enabled once `pendingCount === 0`), which writes the center buffer to
disk and stages it (`git_conflict.rs::resolve_conflict`) and closes the window. Result asserted by
reading the fixture repo **off disk**: the file is staged and no longer conflicted
(`git status --porcelain` / `git diff --cached --name-only`), wand-resolved modifications and
manually-accepted blocks show the expected content, and the untouched theirs-only deletion/addition
(never touched — only the right gap was driven) keep their documented default (kept / absent).

### 2. Injected repo fixtures 🟡

Each scripted fixture is a real, awkward git state — the highest-value e2e fuel. Coverage per
fixture:

| Fixture          | Exercises                                                                                       | Status                              |
| ---------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------- |
| fixup-chain      | fixup grouping / autosquash ✅ · **create-fixup from staged change ✅** (via ⌘K palette, real second window — see gotchas) | ✅ |
| rebase-conflict  | conflict panel ✅ · merge editor open+snapshot ✅ · **continue/skip/abort ✅** (continue resolves the conflict via `git checkout --ours` directly on disk, not the merge editor UI) · **merge editor block resolution ✅** (wand + per-block accept + Apply, real second window — see gotchas) | ✅ |
| detached-head    | detached indicator ✅ · checkout-back-to-branch ✅                                              | ✅                                  |
| feature-branches | branch checkout ✅ · undo/redo of the checkout ✅ · **cherry-pick (via ⌘K palette) ✅**         | ✅                                  |
| stash-stack      | list ✅ · WIP staging panel ✅ · stage/unstage individual files ✅ · file diff ✅ · commit ✅ · **drop/apply/pop (via ⌘K palette) ✅** | ✅                                  |
| rollback-history | **reset (soft/mixed/hard incl. RESET-confirm gate), revert, create-branch, create-tag — all via ⌘K palette ✅** · **undo/redo of a reset ✅** · **create-tag's ref badge shown in the graph ✅** · undo/redo of revert/branch/tag 🚫 (not a test gap — `undoActions.ts` has no case for these three actions at all; the app doesn't support undoing them yet, see the "Add undo/redo support" follow-up) | ✅ |

### 3. Settings 🟡 📷

`SettingsPage` (opened via `Mod+,` or the dashboard gear — `dashboard-settings-button`). **Done:**
opens on the general section + a layout snapshot of the whole screen; **notifications section
snapshotted** too (fully deterministic — pure boolean toggles, no dates/network); **row-height
setting (`ui_customization` tab) persists across a reload** — driven directly via its
`row-height-radio-<value>` label/radio rather than a snapshot, verified functionally. Nav tabs
carry `settings-tab-<id>` testids and the root `settings-page`. **Skipped on purpose:** a
full-screen snapshot of **appearance** — its theme grid depends on unlocked achievements + custom
themes dropped into `~/.git-manager/themes/` on the machine running the test, neither controlled
by the fixture system, so it isn't reproducible across machines.

**ssh/local_ai/rewards: done** — none of the three had any `data-testid` before this (small,
targeted additions, not just e2e files): `ssh-generator-toggle`/`ssh-generate-path-input`/
`ssh-generate-button`/`ssh-generated-pubkey` on `SshSection.tsx`, `ollama-test-connection-button`/
`ollama-connection-status` on `LlmSection.tsx`, `rewards-toggle` on `RewardsSection.tsx` (which
already had a root testid). **SSH:** opens the generator, points the path at a fresh `mkdtemp()`
directory (never the user's real `~/.ssh` — `generate_ssh_key` shells out to the real `ssh-keygen`
and creates parent dirs itself, so a pre-existing file at the destination would make it prompt
interactively to overwrite and hang the test), clicks generate, and asserts both the UI shows the
generated public key **and** a real key pair exists on disk. **Ollama:** clicks "Test Connection"
and asserts *some* definitive status renders (`text-destructive` or `text-green-500` class) —
**not** which one: mocking the IPC command doesn't reach a real UI click (see
command-mocking.feature's own note on that limitation), and asserting a specific outcome here is
genuinely flaky across machines, not just theoretically — a real local Ollama server (very
plausible on a dev box, since that's what the app's own AI commit-message feature talks to) made
this scenario fail on the very first run when it assumed "disconnected". **Rewards:** toggles the
gamification checkbox and asserts it persists across a reload, same pattern as row-height. **Not
reset afterward** — like row-height, these three settings values (ssh key paths, rewards enabled)
stay changed for the rest of the suite run; no other current scenario reads them, so this is a
known, accepted gotcha rather than a bug.

**Themes: done** — rather than snapshotting the whole grid (unreproducible, see above), selects a
specific always-unlocked built-in theme (`theme-card-<id>`, changed from a translated-label-derived
testid to the raw theme `id` — this app defaults to French, so the old testid was locale-fragile;
updated `AppearanceSection.test.tsx`'s 6 assertions to match), asserts it's actually applied by
reading `document.documentElement.dataset.theme` (`useTheme.ts`'s real DOM effect, not just that the
setting persisted) and that it survives a reload, then **switches back to "dark"** (the app's
default) at the end — unlike ssh/rewards above, leaving a non-default theme active would bleed into
every other visual snapshot in the suite, not just this feature's own. A single theme card's own
swatch (always "dark", never achievement-gated) is snapshotted instead of the full grid.

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
**Stage/unstage individual files: done** — each row's hover +/- button (`button[title="Stage"]`/
`[title="Unstage"]`, hardcoded plain strings in `CommitFileList.tsx`, not run through i18n — locale-
independent unlike the bulk button) drives the real `apiStageFile`/`apiUnstageFile`, asserted via
`git diff --cached --name-only` off disk. **Bulk stage/unstage-all: done** — `file-list-bulk-stage`
used to carry the *same* testid in both the staged and unstaged zones; added a `bulkStageTestId`
prop to `CommitFileList` (defaults to `file-list-bulk-stage`, preserving existing unit tests) so
`CommitDetailsPanel` can give the staged zone's unstage-all button its own testid
(`file-list-bulk-unstage`) — a small, targeted source change (not just e2e files) rather than
relying on the locale-dependent title text or DOM order. **Todo:** amend (`commit-amend-*` are
still mock-only).

### 5. Undo / redo ✅ (checkout, reset, commit)

State-mutating actions push to `undoHistory.store`. **Done:** the `undo-redo.feature` drives a
real **branch checkout** through the toolbar's `BranchContext` selector (new
`branch-option-<name>` testid), then **Cmd+Z / Cmd+Shift+Z** — bound globally in
`hooks/useKeyboardShortcuts.ts`, driven with `browser.keys([META, 'z'])` /
`browser.keys([META, SHIFT, 'z'])` — and asserts HEAD moves `main → feature/login → main →
feature/login` via the shared `branch-context-label` indicator (now polled, since undo/redo are
async). This sidesteps the dead toolbar-button testids (see blockers) entirely. Setup: the new
`fixture:feature-branches` (HEAD on a **named** branch so the indicator resolves to a branch name,
not a detached sha). **Also done:** a **reset (mixed)** via the ⌘K palette on
`fixture:rollback-history`, then Cmd+Z/Cmd+Shift+Z, asserting the HEAD subject reverts and
re-applies (`undoActions.ts`'s `reset` case replays `resetToCommit` with `previousOid`/`targetOid`
at the original mode). **Also done:** a **commit** via the WIP panel on `fixture:stash-stack`
(`commit.feature`), then Cmd+Z/Cmd+Shift+Z, asserting HEAD reverts to the prior tip subject and
re-applies (`undoActions.ts`'s `commit` case soft-resets to `previousOid`/`newOid`). None of these
needed new step definitions — each is pure composition of steps already written for the
underlying action + the generic `undo-redo.steps.ts` chords.

### 6. AI commit-message generation ✅

Requested as "just add e2e coverage for Ollama commit-message generation," but investigating first
found the feature wasn't actually complete: the streaming pipeline (Rust HTTP streaming, Tauri
events, the WIP panel's "Generate" button) worked, but `settings.ollama.systemPrompt`/
`includeRepoContext`/`autoDetectScope` changed React state that nothing downstream ever read, and
even `url`/`temperature`/`timeoutSeconds` were silently ignored (the backend read from an
`AppState` field that was set once to a hardcoded default and never updated — no
`update_ollama_config` command existed anywhere). Fixed the wiring **and** rebuilt the backend as a
provider-agnostic architecture per the user's explicit ask, so LM Studio/OpenAI/Anthropic/MLX can
be added later without reworking today's code:

- **`packages/ai`** (new package): `AiPresetId` (the user-facing choice) is kept separate from
  `AiProtocol` (the actual wire format) — `AI_PRESETS` maps `ollama`/`lmstudio`/`openai`/`mlx` to
  the shared `openai-compatible` protocol (Ollama has spoken the OpenAI Chat Completions API at
  `/v1/chat/completions` + `/v1/models` since v0.1.14) and `anthropic` to its own
  `anthropic-messages` protocol. Only `ollama` is `implemented: true` today.
- **Rust** (`services/ai_provider.rs`'s `AiProvider` trait, `ai_openai_compatible.rs`,
  `ai_anthropic.rs` stub, `ai_registry.rs`, `commands/ai.rs` replacing `commands/ollama.rs`):
  `state.rs`'s dead `OllamaConfig`/`ollama_config` removed entirely — every AI setting is now
  passed as a per-call command argument instead of synced global state, which is what let the old
  sync-bug happen in the first place. Prompt-building (system prompt override, repo-context prefix,
  scope detection from the diff's changed paths — mirrors the existing "group by first path
  segment" heuristic already shipped for batch-commit grouping in `useWipCommitPanel.ts`) lives
  once in `ai_provider.rs`, shared by every protocol implementation.
- **Frontend**: `useOllamaGeneration.ts`→`useAiGeneration.ts`, `ollama.api.ts`→`ai.api.ts`,
  `LlmSection.tsx`→`AiSection.tsx` (adds a provider `<select>` sourced from `AI_PRESETS`, disabled
  for non-implemented presets), `settings.ollama`→`settings.ai` (renamed now per explicit
  instruction — existing users' saved Ollama config resets to defaults, accepted tradeoff).
- **e2e**: a fake OpenAI-compatible HTTP server (`support/fakeAiServer.ts`, plain Node `http`, no
  new dependency) — `Settings → local_ai`'s `url` just points at it, exactly like a user pointing
  Ollama's preset at a different host. Not `browser.tauri.mock` (doesn't reach a real UI click, see
  command-mocking.feature's own note). `ai-generation.feature`: (1) generates a message, asserting
  both the streamed UI result **and**, by reading the fake server's recorded request body directly
  (same Node process, no `browser.execute` needed), that the sent prompt actually contains the
  custom system prompt, repo name/branch, and detected scope — proving the wiring, not just that
  generation "did something"; (2) cancels a stuck generation. **Gotcha**: the stalled-server variant
  must still send periodic SSE keep-alive comment lines (`: keep-alive`) rather than truly never
  writing anything — the Rust cancellation check only runs *between* stream chunks
  (`while let Some(chunk) = stream.next().await`), so a connection with zero bytes ever sent would
  leave that await stuck forever with the cancel flag never observed, no matter what the frontend
  does. `settings.feature` gained a scenario asserting the preset dropdown shows Ollama enabled and
  Anthropic disabled/"coming soon"; `command-mocking.feature`/`mocking.steps.ts` updated for the
  renamed `check_ai_status` command and its new `{config: {protocol, url}}` argument shape.

### 7. Worktree management ✅

Requested as "e2e coverage for worktree add/list/remove," but investigating first found the Rust
backend (`add_worktree`/`list_worktrees`/`remove_worktree`, already registered and working) had
**no UI at all** for listing or removing a worktree — `apiListWorktrees`/`apiRemoveWorktree` had zero
call sites anywhere in the frontend. "Add" was only reachable via a right-click on a commit
(`useGitGraphActions.ts`'s `handleCreateWorktree`), using a native OS folder-picker dialog — which
was also the wrong control semantically, since `add_worktree`'s destination must **not** already
exist (a picker is for choosing something that does). Built the missing UI so the feature is both
usable and e2e-coverable, rather than documenting it as blocked like Clone/Scan:

- A new **Worktrees** sidebar section (`useSidebarRows.ts` + `SidebarRowView.tsx`'s `case
  'worktree':`), mirroring the existing (live) Submodules pattern — one row per non-main worktree,
  branch + path + short oid, a lock glyph when relevant. Unlike Submodules/Tags/Stashes, this
  section is always shown (even with zero worktrees), since it's the one section whose header
  carries an "add" action (`worktree-add-button`) that must stay reachable.
- **`AddWorktreeDialog.tsx`** (new): a branch `<select>` + a plain text path input — deliberately
  not a native picker, both because WebDriver can't drive one and because a path that must not yet
  exist was never what a folder *picker* is for.
- **`RemoveWorktreeDialog.tsx`** (new): a hover-revealed trash icon on each row (not a native
  context menu — this repo's own docs note those can't be driven by WebDriver) opens a confirm
  dialog. `git_worktree.rs`'s `is_dirty` was hardcoded `false` and never actually computed — fixed
  by opening each non-main worktree with git2 and checking real status — so the dialog can warn and
  gate removal behind an explicit "force remove" checkbox when the worktree has uncommitted
  changes, one tier lighter than hard-reset's typed-`RESET` gate (smaller blast radius: one
  worktree's directory, not rewriting history). Locked worktrees are a hard block for now (git
  needs `--force` twice to remove a locked+dirty one; `remove_worktree` only ever sends one).
- **e2e**: new `fixture:worktree-repo` (first fixture to use `git worktree add`, at a sibling path
  outside the fixture's own directory — git refuses nesting one inside the repo it's linked to).
  `worktree.feature`: list, add (via a fresh `mkdtempSync` path, same pattern as the SSH
  key-generator scenario), remove, and a dirty-remove scenario that writes an uncommitted change to
  the linked worktree's tracked file directly on disk, reloads, and asserts the force-checkbox gate
  before removal succeeds.

---

## Rest of the surface (lower priority / smaller)

| Feature                                 | Area          | Setup             | Snapshot | Status                                                                               |
| --------------------------------------- | ------------- | ----------------- | -------- | ------------------------------------------------------------------------------------ |
| Commit graph rendering                  | log/graph     | any fixture       | 📷       | ⬜ (volatile: shas/dates)                                                            |
| Branches: create / checkout / delete    | branch        | any fixture       | —        | 🟡 (checkout ✅ via BranchContext; **create-from-commit ✅ via ⌘K palette**, asserted via `git log`; delete still native) |
| Tags: create / shown in graph            | tag           | any fixture       | —        | ✅ (**create (lightweight + annotated) via ⌘K palette**, asserted via `git log`/`git cat-file -t`; **ref badge shown in the graph row ✅**, `ref-label-tag-<name>` testid added to `RefLabel.tsx`) |
| Cherry-pick a commit                    | cherry-pick   | feature-branches  | —        | ✅ (**via ⌘K palette**, asserted via `git log` — picks a non-conflicting file addition from another branch) |
| Interactive rebase (reword/squash/drop) | rebase        | fixup-chain       | —        | 🚫 (native commit menu + child window)                                               |
| Reset (soft/mixed/hard, RESET confirm)  | rollback      | rollback-history  | —        | ✅ (**soft/mixed/hard incl. RESET-confirm gate, via ⌘K palette**, asserted via `git diff`/`git status`) |
| Revert a commit                         | rollback      | rollback-history  | —        | ✅ (**via ⌘K palette**, asserted via `git log` — reverts the tip commit cleanly)     |
| Stash apply / pop / drop                | stash         | stash-stack       | —        | ✅ (**drop/apply/pop ✅ via ⌘K palette**, asserted via `git stash list` / a restored file — apply/pop reset the working tree to a clean HEAD first, see gotchas) |
| Remote: fetch / pull / push             | remote        | native creds      | —        | 🚫 (needs a real remote)                                                             |
| Clone a repo                            | repo          | native            | —        | 🚫 (native dialog + network)                                                         |
| Scan a folder for repos                 | repo          | native            | —        | 🚫 (native dialog)                                                                   |
| AI commit-message generation            | AI            | fake HTTP server  | —        | ✅ (streaming + prompt-wiring + cancel + settings dropdown — see "AI generation" below) |
| GitHub OAuth device flow                | github        | mock              | —        | ⬜ (mock the poll)                                                                   |
| SSH key generate / read                 | ssh           | seed              | —        | ✅ (generate via Settings → ssh, real `ssh-keygen` against a temp dir — see "3. Settings" above) |
| Submodule list                          | submodule     | dedicated fixture | —        | ✅ (`fixture:submodule-repo`, a real `git submodule add`; sidebar row asserted via `SidebarRowView.tsx` — see gotchas for the dead-code detour) |
| Worktree add / list / remove            | worktree      | dedicated fixture | —        | ✅ (list/add/remove + dirty-remove force gate — see "Worktree management" below)     |
| Themes                                  | settings      | seed              | 📷       | ✅ (select a built-in theme → `data-theme` applies + persists across reload; single-card snapshot avoids the full-grid reproducibility problem — see "3. Settings") |
| Rewards / gamification toast            | rewards       | action-triggered  | 📷       | ✅ (first commit unlocks "Premier Pas", asserted via `trophy-toast`; game progress reset via localStorage first — see `rewards.feature`) |
| Notifications tray/dropdown             | notifications | seed              | —        | ✅ (bell → dropdown shows seeded items + unread badge, mark-all-read, clear-all → empty state; seeded via `git-manager-notifications` localStorage, not the real GitHub-diff pipeline) |

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
  (`showStashNativeContextMenu`) are real OS menus WebDriver can't open. **The ⌘K command palette
  (`components/command-palette/`) is now the canonical non-native entry point** for both: dialog
  actions (reset/revert/create-branch/create-tag) dispatch through the store's `pendingGraphAction`
  bridge into the same web dialogs (`reset-dialog`, `revert-dialog`, `tag-dialog`,
  `create-branch-dialog`); no-dialog actions (cherry-pick, copy-sha, stash apply/pop/drop) call the
  API layer directly from `useCommitCommands.ts`/`useStashCommands.ts`, mirroring
  `useGitGraphActions.ts`'s native-menu handlers exactly (same calls, same `mutate`/
  `invalidateQueries` follow-up). All are now e2e-drivable (see command-palette.feature). A third
  shape exists for `fixup`: no in-page dialog to route through, so `pendingGraphAction: { kind:
  'fixup' }` instead calls `openFixupWindow` (now exported from `useGitGraphActions.ts`) directly,
  opening a **real second `WebviewWindow`** — see the multi-window gotcha below for why this one
  couldn't reuse the merge/rebase editors' navigate-in-place trick. Still native-menu-only (no
  palette command yet): interactive rebase, create-branch/tag from a *multi-selection*,
  drag-reorder in the rebase editor. Other non-menu entry points: branch checkout via
  `BranchContext` (undo-redo.feature), commit via the WIP panel buttons (commit.feature), undo/redo
  via keyboard.
- **Multi-window: prefer navigate-in-place; when a real second window is unavoidable, expect
  WebKit click quirks.** The merge and rebase editors (`merge.steps.ts`) sidestep multi-window
  entirely by navigating the shared main window straight to `?window=merge`/`?window=rebase` —
  cheap and safe, since neither of those routes call `getCurrentWindow().close()` on the actions
  the tests drive. **`fixup-autosquash.feature`'s create-fixup scenario couldn't do that**: both of
  `FixupCommitWindow`'s buttons (Commit *and* Cancel) call `getCurrentWindow().close()`, and
  reusing the shared window would close the one and only window for the rest of the test run. So
  it opens a **real** second `WebviewWindow` via the palette's `commit-fixup` command and uses
  `browser.getWindowHandles()`/`switchToWindow()` — WebdriverIO commands that hadn't been used
  anywhere else in this suite before. Two real bugs surfaced getting this to work (see
  `fixup.steps.ts`'s `clickViaJs` helper and the `I confirm the fixup commit` step for the fixes):
  (1) WebdriverIO's native `element.click()` throws `"A JavaScript exception occurred"` against
  elements in these real secondary windows even when the element is confirmed enabled/displayed —
  dispatching the click via injected JS (`browser.execute(() => el.click())`) instead works
  reliably; (2) once a window closes itself via app-initiated JS (`getCurrentWindow().close()`,
  not a WebDriver-initiated close), that browsing context's WebDriver handle goes stale, and
  issuing *any* further command while it's still the session's "current" window throws `"no such
  window"` — switch to a different, still-alive window **immediately** after triggering a
  self-close, before polling `getWindowHandles()` again. For a window you're done with and don't
  need to interact with further, `browser.closeWindow()` (the native WebDriver command) proved more
  reliable than clicking an in-app close/cancel button that does the same thing — one less
  real-window DOM interaction to hit the click quirk above. `RebasingCommitWindow` (opened as a
  third window by the fixup flow, to squash the new commit into place) is closed this way rather
  than driving its interactive-rebase UI, which is separate, still-🚫 work. **The merge editor's
  block-resolution scenario hits the same tradeoff**: opening the file via `ConflictResolutionPanel`
  (matching production, unlike the navigate-in-place "opens + snapshot" scenario above) gives a
  real second window, since `merge-apply`/`merge-accept-left`/`-right`/keep-ours/keep-theirs all
  self-close too — same `clickViaJs` + switch-to-main-immediately pattern (`merge.steps.ts`). One
  extra timing gotcha surfaced here: both `handleApplyNonConflicting` (the wand) and the connector
  overlay's initial geometry are asynchronous — `handleApplyNonConflicting` awaits a real backend
  IPC round-trip, and `MergeConnectorOverlay`'s accept/reject buttons don't exist until
  `ConflictResolver`'s own post-mount recompute (scheduled up to 250ms after all three Monaco panes
  report ready) has run — so querying for `merge-connector-accept-*` buttons immediately after
  opening the window or clicking the wand can transiently find zero elements. A first fix attempt
  waited for the wand button's spinner `<svg class="animate-spin">` to disappear
  (`waitForExist({reverse: true})`) instead of a plain pause, but that's itself racy: if the spinner
  hasn't appeared *yet* (React hasn't re-rendered with `isAutoMerging: true` at the moment of the
  check), `reverse: true` reports "not there" immediately and the wait becomes a no-op. A plain
  `browser.pause(1000)` after opening the window and after each wand click proved simpler and
  reliable for this fixture's size — paired with the existing `browser.waitUntil` poll for the
  accept-right buttons themselves as a second safety net.
- **Real remote / network** (fetch/pull/push, clone, GitHub, Ollama) — mock the IPC command
  (`browser.tauri.mock`) rather than standing up a real server, unless doing an integration run.
- **Check a component is actually mounted before adding testids to it** — the sidebar's submodule
  section has *two* implementations: `SubmodulesSection.tsx` (dead code, only referenced from its
  own test file) and the real one, `SidebarRowView.tsx`'s `case 'submodule':` branch (fed by
  `useSidebarRows.ts`), which is what the app actually renders. Adding testids to the dead one first
  produced a confusing partial result — the section *header* worked (it's rendered generically by
  `SidebarRowView.tsx` itself via `testId={`sidebar-section-${row.sectionKey}`}`, unrelated to
  `SubmodulesSection.tsx`), showing the correct count, but the item rows never appeared, because
  they're rendered by the OTHER, real component. `grep -rn "<ComponentName"` for actual JSX usage
  (not just filename matches) would have caught this immediately.
- Each feature runs one worker; keep scenarios independent (state is reset by the reload in the
  shared open-repo step, and `restoreAllMocks` in an `After` hook).
- **Don't click a commit row's geometric center to select it** — `author`/`date`/`sha` are hidden
  by default (`columns.ts` `defaultVisible: false`); only `refs`/`graph`/`message` show, and `graph`
  defaults to 200px wide. A normal-width row's center lands inside `graph` (the avatar/connector
  swimlane), not over `message` text — confirmed by `elementFromPoint` plus a live store read
  landing on the wrong commit every time (see `command-palette.steps.ts`'s "select commit" step and
  its git-blame for the full diagnosis trail). Click the `message` cell's subject text instead
  (`row.$('span*=<subject>')`) — unambiguous and always visible. The WIP row has its own, older
  workaround (click the row's left edge) for the same underlying reason (its center is the inline
  `// WIP` input).
- **`window.__e2eRepoUIStore`** (main.tsx, `VITE_E2E`-gated, dead-code-eliminated otherwise) exposes
  the live `repoUI` Zustand store for direct state reads (`getState().selectedCommitOid`, etc.) —
  reach for this over inferring state from a DOM attribute when a test needs to assert something
  that isn't already surfaced in the UI; a DOM read can't tell "React state never changed" apart
  from "hasn't re-rendered yet".
- **Rebase "Continue" is tested without the merge editor** — `rebase-conflict.feature`'s continue
  scenario resolves `dependency-manifest.txt`'s conflict via `git checkout --ours` + `git add`
  directly on the fixture repo (not through the merge editor's block-accept UI), then reloads the
  page so the app's stale `conflicted-files`/`git-status` queries pick up the new state before
  clicking Continue. This deliberately scopes the test to "does Continue call `git rebase
  --continue` and complete the rebase" — merge-editor block resolution (`merge-accept-left`/
  `-right`/auto-merge) is separate, still-🟡 work (see "1. Merge editor" above); driving it wasn't
  the goal here. Skip only offers a click while `noneResolved` (`ConflictResolutionPanel`'s own
  gate — nothing staged yet); this fixture rebases a single commit, so skipping it completes the
  whole rebase immediately rather than moving to a next paused step.
- **Stash apply/pop can fail silently against `fixture:stash-stack`'s leftover changes** — the
  fixture deliberately leaves `config.yml` staged + `IN_PROGRESS.md` untracked on top of both
  stashes (for the stash-list/staging scenarios), but that same leftover diff conflicts with
  `stash@{0}`'s own `config.yml` change: `git stash apply`/`pop` errors out, and the palette
  command only `toast.error`s it — no exception reaches the e2e harness, so the failure surfaces
  much later as "stash count/file never changed" rather than a clear conflict message. Any
  scenario driving apply/pop needs a clean working tree first — see the `Given the working tree
  starts clean` step (`git reset --hard HEAD && git clean -fd` directly on the fixture repo,
  bypassing the UI) in `command-palette.steps.ts`.
- **A linked worktree must live outside its own fixture's directory** — `worktree-repo.sh` is the
  first fixture script to call `git worktree add`; the linked worktree goes at a *sibling* path
  (`$FIXTURES_ROOT/worktree-repo-linked`), not a subdirectory of the fixture itself, since git
  refuses/complains about nesting a worktree inside the repo it's linked to. The dirty-remove e2e
  scenario writes directly to a file inside that sibling path *before* reloading the app (not
  after) — `list_worktrees`' React Query cache is wiped by the reload itself, so the timing only
  matters relative to the write, not to any manual cache invalidation.
- **`opacity-0 group-hover:opacity-100` elements fail `waitForDisplayed`/`.click()` on the embedded
  WebKit provider** — the Worktrees section's "add" button (`SectionHeader`'s hover-revealed
  `action` slot) and each row's hover-only remove button are invisible until hovered in production,
  by design. This provider's `isDisplayed()` follows the classic Selenium visibility algorithm,
  which — unlike `display`/`visibility` — treats `opacity: 0` as **not displayed**, so a real click
  attempt on them times out even though the element is genuinely in the DOM and would be
  click-through in a real browser. `worktree.steps.ts`'s `clickViaJs` helper (`waitForExist` +
  `browser.execute(() => el.click())`) works around it — the same "bypass WebDriver's own click
  entirely" technique `fixup.steps.ts`'s `clickViaJs` already uses for real-second-window quirks,
  just for a different underlying cause. Any future hover-revealed control (this suite doesn't have
  many — the stash row's visibility toggle is the only other one, and it isn't e2e-driven yet)
  should assume the same fix is needed rather than a plain `.click()`.
