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

## Covered today (23 feature files / ~490 steps, 8 visual snapshots)

> **This matrix is only as honest as the last full run — and nothing enforces that.** There is no
> CI, so a ✅ here means "passed when someone last ran it", not "passes today". Five feature files
> (`command-palette`, `fixup-autosquash`, `undo-redo`, `merge-editor`, `worktree`) sat at ✅ while
> failing outright on `main`, in every case because the app changed underneath a step and no run
> caught it. Re-run the suite before trusting a row, and see
> [Known blockers / gotchas](#known-blockers--gotchas) for the harness traps those five uncovered.

| Feature                                                            | Area       | Setup                    | Snapshot                          | Status                                                      |
| ------------------------------------------------------------------ | ---------- | ------------------------ | --------------------------------- | ----------------------------------------------------------- |
| **Command palette (⌘K)**: 12 scenarios across settings/commit/stash | palette    | rollback-history · feature-branches · stash-stack | — | ✅ (settings section; reset soft/mixed/hard incl. RESET-confirm gate/revert/create-branch/create-tag (lightweight + annotated)/cherry-pick on a commit; stash drop/apply/pop — each asserted via git on disk) |
| App launches, React mounts                                         | app shell  | —                        | —                                 | ✅                                                          |
| Tauri command mock: success / reject / restore, **GitHub poll-token contract (pending/success/expired)** | IPC | mock | — | ✅ |
| Fixup autosquash grouping + **create fixup commit (via ⌘K palette)** | fixup      | fixture:fixup-chain      | 📷 ✅ (preview groups)            | ✅                                                          |
| Rebase conflict panel auto-opens + **snapshot** + continue/skip/abort | rebase     | fixture:rebase-conflict  | 📷 ✅ (panel layout)              | ✅ (panel shown + snapshotted; continue/skip/abort ✅; merge-editor block resolution now driven separately) |
| **Rebase progress view** (center step rail) + **snapshot** + hide/banner/files toggle | rebase | fixture:rebase-multi-step | 📷 ✅ (full step rail) | ✅ (see "Rebase progress view" below) |
| **Merge editor** opens for a conflicted file + **snapshot** + **block resolution** | merge      | fixture:rebase-conflict  | 📷 ✅ (full Monaco editor)        | ✅ (opens + snapshotted; **wand + per-block accept + Apply ✅**, real second window, result asserted via git/file content) |
| **Working-tree staging panel** + **file diff** + **snapshots**     | commits    | fixture:stash-stack      | 📷 ✅ (staging panel + diff view) | ✅                                                          |
| **Commit staged changes** (write message → Commit → HEAD advances) | commits    | fixture:stash-stack      | —                                 | ✅                                                          |
| **Undo / redo a branch checkout** (Cmd+Z / Cmd+Shift+Z)            | undo/redo  | fixture:feature-branches | —                                 | ✅                                                          |
| Detached HEAD indicator reads "HEAD", checkout back to a branch                                                          | repo state | fixture:detached-head    | —                                 | ✅                                                          |
| **Git bisect**: tools menu → pick bad/good in graph → run to first bad commit | bisect     | fixture:bisect-history   | —                                 | ✅ (setup bar open/cancel; inverted-range rejected + start disabled; full run marks by bug presence and converges on commit 5 — asserted via `.git/BISECT_LOG`; abort clears `.git/BISECT_START`) |
| Sidebar lists stashes                                              | stash      | fixture:stash-stack      | —                                 | ✅ (list ✅; **drop/apply/pop ✅ via ⌘K palette**, each asserted via `git stash list` / a restored file) |
| Settings screen opens + **snapshot**                               | settings   | keyboard (Mod+,)         | 📷 ✅ (general + notifications)   | 🟡 (general & notifications snapshotted; row-height persistence ✅; **ssh key generation ✅ · AI provider test-connection ✅ · rewards toggle ✅ · AI preset dropdown ✅ · GitHub OAuth device code ✅**; appearance snapshot skipped on purpose, see below) |
| **AI commit-message generation**: streaming + prompt-wiring + cancel | AI         | fake HTTP server         | —                                 | ✅ (see "6. AI commit-message generation" below)            |
| **Worktree** list / add / remove (incl. dirty-remove force gate)  | worktree   | fixture:worktree-repo    | —                                 | ✅ (see "Worktree management" below)                        |

---

## Rebase progress view ✅ 📷

The center step rail (`components/rebase-progress/RebaseProgressCenter.tsx`) that takes the content
view over for as long as a rebase runs: the whole todo list, oldest first, each command marked
replayed / stopped-here / not-yet, with the base commit anchoring the top.

- Setup: **`fixture:rebase-multi-step`** — a 6-step plan that pauses **twice** (step 2 on
  `settings.conf`, then step 4 on `CHANGELOG.md`), with a `squash` and a `drop` still ahead. The
  older `rebase-conflict` fixture only ever has one step, so it can't exercise a rail at all.
- Covered: the view claiming the center (and the graph being gone); the counter and
  `branch → onto` readout; per-step `data-progress` marking; the paused step's caption; hide →
  graph returns still bannered by the CONFLICT row → clicking that banner brings the view back;
  the files-panel toggle; continue **advancing the rail** from step 2 to step 4; abort restoring
  the graph (asserted against `git log` on disk); and a full-rail visual snapshot.
- **Regression guarded**: clicking the banner used to run through the graph's row-select handler,
  which *toggles* a synthetic row — so clicking it while the CONFLICT row was already selected (the
  normal state during a pause) cleared the selection and closed the conflicted-files panel the click
  was meant to open. Both panels now have explicit per-repo visibility state
  (`stores/rebaseView.store.ts`) and the banner *sets* them visible.
- **Two harness gotchas** (both cost a debugging round, see rebase.steps.ts):
  1. the whole-app loading scrim (`loading-overlay`, `fixed inset-0 z-9998`) is up while the graph
     reloads its history — i.e. exactly when the banner step runs. WebKit's driver clicks the scrim
     instead of reporting an intercepted click, so the click silently does nothing.
  2. clicking a row *wrapper* (`graph-row-<oid>`) doesn't reach the row's React `onClick` here; the
     inner cell has to be the target (`conflict-row-banner`), same as bisect.steps.ts does for
     picking commits.

---

## Priority backlog (the domains we actually want next)

### 1. Merge editor ✅ 📷 (opens + snapshotted + block resolution)

The three-way merge editor (`components/merge-editor/ConflictMergeWindow.tsx`) normally opens in a
**separate Tauri window** (`?window=merge`) and renders with **Monaco**. **Opens + snapshot:**
rather than driving the native second window, that scenario navigates the current window straight
to the merge route (`/?window=merge&repoPath=…&filePath=…`) — main.tsx renders
`ConflictMergeWindow` from those URL params, independent of the store — waits for
`merge-auto-merge-button` (appears once `get_merge_view` resolves), and **snapshots the whole
Monaco editor** (`merge-editor-window`) after a 1.5s Monaco settle + `stabiliseForSnapshot`. See
the visual-baseline caveat under [Known blockers / gotchas](#known-blockers--gotchas) before
reading much into a green snapshot assertion.

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
| bisect-history   | **bisect setup bar (open/cancel) ✅** · **inverted good/bad range rejected + start disabled ✅** · **full bisect run: pick bad/good in the graph, mark by bug presence, converge on the first bad commit ✅** (asserted via `.git/BISECT_LOG`) · **abort ✅** | ✅ |

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

### 6b. AI daily summary (launchpad briefing) ✅

`daily-summary.feature`/`daily-summary.steps.ts` cover the per-project "yesterday / today" briefing
shown in the launchpad, reusing the same fake-server harness (its `stream: false` completion branch
now forks on `response_format.json_schema.name` — `daily_summary` returns a
`{ headline, yesterday, today }` object, `commit_plan` the existing `{ commits: [...] }`). Three
scenarios: (1) opening the launchpad **auto-generates** the morning briefing for an open project —
asserts the rendered headline/bullets **and**, via the recorded request body, that the daily-summary
instruction + `Repository: <name>` context were actually sent (real `get_ai_activity` →
`ai_complete(schema)` → parse chain); (2) with `dailySummary.autoGenerate` off, the panel opens on
its empty state and the briefing is produced on demand; (3) with `dailySummary.enabled` off the
`repo-summary-button` never renders. **Gotcha**: the briefings persist in
`git-manager-daily-summaries` localStorage, which survives across scenarios in the shared app window
— a leftover *fresh* (same-day) summary makes the morning auto-run skip (so no request is sent) and
breaks the "empty state" scenario, so a Background step (`no daily briefing has been generated yet`)
clears that key and reloads before each scenario. The dashboard tab has no testid, so the
"open the launchpad dashboard" step switches to it via the e2e-exposed `__e2eRepoUIStore`
(`setActiveTab('dashboard')`) rather than a click.

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

### 8. GitHub OAuth device flow ✅

Unlike the AI/Worktree gaps, the feature itself was already fully built and working
(`github_device_code`/`github_poll_token`/`github_get_user`, `useGithubDeviceFlow.ts`,
`GithubSection.tsx` — including a PAT-token login path alongside OAuth, and a multi-account list).
The only real gap was e2e coverage itself, plus `GithubSection.tsx` having **zero** `data-testid`
attributes anywhere (added: `github-login-oauth-button`/`github-login-pat-button`,
`github-device-flow-card`/`-user-code`/`-verification-link`/`-cancel-button`, `github-pat-input`/
`-submit-button`, `github-back-to-choice-button`, `github-error-message`,
`github-account-item-<id>`/`-switch-<id>`/`-remove-<id>`).

The flow itself splits into two genuinely different testing tiers, same distinction the AI
test-connection button already established:

- **Real, UI-driven** (`settings.feature`): clicking the OAuth button hits the *real*
  `github_device_code` endpoint (`github.com/login/device/code`) — this needs no auth and always
  succeeds, so asserting the real `user_code`/`verification_uri` shape is safe and deterministic,
  not machine-dependent. The scenario stops there and cancels — completing the flow needs a human
  to authorize the code on github.com, which isn't automatable.
- **Mocked, via the test bridge** (`command-mocking.feature`): `github_poll_token` is what
  `useGithubDeviceFlow.ts` calls in a loop while waiting — its `authorization_pending`/success/
  `expired_token` outcomes are exercised through `browser.tauri.execute` (not a real click, per the
  documented mock limitation), the same pattern as the existing `check_ai_status` scenarios. Its
  response shape stays snake_case on the wire (`DeviceCodeResponse`/`PollTokenResponse` in
  `github.rs` have no `#[serde(rename_all = "camelCase")]`, unlike their sibling commands) — the
  mocked payloads match that exactly.

### 9. Branch rename ✅

`RenameBranchDialog.tsx` is only reachable from a native macOS context menu — the graph's commit
menu (`useGitGraphActions.ts`'s `onRenameBranch`) and the sidebar's branch menu
(`useSidebarBranchMenu.ts`), both real OS menus WebDriver can't open (see the "Native context
menus" gotcha below). Rather than faking a menu click, `branch-rename.feature` dispatches straight
into the `pendingGraphAction` store bridge (`repoUI.store.ts`) the same way the ⌘K palette's own
dialog-based commands (reset/revert/create-branch/tag) do:
`window.__e2eRepoUIStore.getState().setPendingGraphAction({ kind: 'renameBranch', branch })` —
`GitGraph.tsx`'s own effect picks it up and forwards it into `GitGraphOverlayManager`, which
renders the *exact* `RenameBranchDialog` the native menu would have opened. That effect requires a
commit already selected in the graph (`primaryOid`) — the dialog resolves its target node from
`nodes`, not from the action payload — so each scenario selects one first via the shared "I select
the `<ref>` commit in the graph" step. From the dialog opening onward everything driven is real:
typing the new name, clicking confirm, the real `rename_branch` Tauri command, and the branch
actually moving.

- Setup: `fixture:feature-branches` (`main` + `feature/login`).
- **Renaming a branch updates it on disk**: renames `feature/login` → `feature/authentication`,
  asserted via `git branch --list` on both names (the old one gone, the new one present).
- **Protected-branch guard**: `git_branch.rs`'s `rename_branch` refuses `main`/`master`
  (`is_protected_branch_name`) before touching anything. Renaming `main` → `renamed-main` is
  asserted to leave an inline error in the still-open dialog (`.text-destructive`, no dedicated
  testid on the message itself) and `main` untouched on disk.
- **Not covered** (out of scope for this pass, both native-menu-only): the sidebar branch menu's
  own rename entry point (`RepoView.tsx`'s separate `renameTarget` local state, not routed through
  the store bridge — a second, un-e2e-tested way to reach the same dialog) and delete (see the
  table above).

### 10. Merge commit actions (revert with mainline, compare against parent) ✅🟡

`merge-commit-actions.feature` (`@mergecommit`), covering the feature added for #130: a merge
commit has no single "before" state, so `git revert -m` refuses to run without being told which
parent is the mainline, and the commit-details diff panel always shows the first-parent reading.
Both new entries — "Revert merge" and "Compare against parent 1/2" — live on the commit's native
right-click menu, which this suite cannot drive (`tag-menu.steps.ts`'s comment). Investigating
found the two land very differently once that's ruled out:

- **Revert: fully reachable, no bypass needed.** `useCommitCommands.ts`'s `commit-revert` ⌘K
  command dispatches the exact same `pendingGraphAction: { kind: 'revert' }` the palette already
  used for a plain commit (`command-palette.feature`'s existing revert scenario) — it carries no
  merge-specific branch at all. `RevertDialog` decides on its own whether to show the mainline
  `RadioGroup` (`isMerge = parents.length > 1`), and `GitGraphOverlayManager` always resolves
  `parents` from the selected node's `parentOids` regardless of which action opened it. So
  selecting a merge commit and running "Revert" from ⌘K reaches the real mainline picker with zero
  test-only wiring — the same path a human using the palette would take. Covered: both mainlines,
  each asserted by reading the fixture **off disk** after confirming — the expected side's files
  are gone/present and the other side's content is untouched (not just "a new commit exists").
- **Compare against parent: reachable, but only via a direct store dispatch, not the palette.**
  `compareParent` is a real `GraphCommitAction` variant (`repoUI.store.ts`) and `GitGraph.tsx`'s
  `pendingGraphAction` bridge forwards *any* such action into the graph's own dialog routing — the
  same generic mechanism the palette's dialog commands use. But `useCommitCommands.ts` (the ⌘K
  command list) has no `commit-compare-parent-1`/`-2` entries wired to it: grepping the frontend
  confirms `compareParent` is only ever set from `useGitGraphActions.ts`'s native-menu handler
  (`onCompareToParent`). So unlike revert, there is currently no non-native **UI** path to this
  action — only the native menu (blocked) or writing the store field directly. These scenarios do
  the latter, through the same e2e-exposed `__e2eRepoUIStore` hook `blame-history.steps.ts`
  already uses for `setActiveDiffFile`: `store.getState().setPendingGraphAction({ kind:
  'compareParent', parentNumber })`. This exercises the real `GitGraphOverlayManager` routing,
  `CompareToParentDialog`, `DiffFilesPanel` and the backend's `get_commit_diff` with a
  merge-specific `parentIndex` — everything except the one native menu click that would normally
  trigger it. **Honest gap**: if a future change removed the palette's generic
  `pendingGraphAction` bridge (or `compareParent` specifically) without anyone wiring a command to
  it, this suite would keep passing — it doesn't prove a user can reach the dialog today, only that
  the dialog and its data are correct once reached. Adding `commit-compare-parent-1`/`-2` commands
  to `useCommitCommands.ts` would close this gap and let these scenarios drive it through the
  palette like revert does; that's a small, separate frontend change, not an e2e-only fix, so it
  wasn't made here.
- **Fixture and commit choice**: `showcase` (`tools/git-fixtures/scenarios/showcase.sh`) has two
  real `git merge --no-ff` commits, tagged `v0.1.0` ("Merge branch 'feat/ai-commit'") and `v0.2.0`
  ("Merge branch 'feat/rollback'"). These scenarios use **v0.2.0**, not v0.1.0: v0.1.0's mainline
  side is a change to `README.md`, and a *later* main commit (`docs: add readme badges`) touches
  `README.md` again before the fixture's `HEAD` — so reverting v0.1.0 with `-m 2` against the
  fixture's tip hits a real 3-way-merge conflict (the reverse patch's context no longer matches),
  which `repo.revert()` in `git_rollback.rs` correctly refuses to resolve silently. v0.2.0's two
  sides — `rollback.ts`/`rollback.test.ts` on the branch, `README.md`'s "Badges!" line on main —
  are never touched again afterwards, so both mainlines revert cleanly. Verified directly with
  `git revert -m 1` / `-m 2` against a built copy of the fixture before writing the assertions, not
  just inferred from the script.

---

## Rest of the surface (lower priority / smaller)

| Feature                                 | Area          | Setup             | Snapshot | Status                                                                               |
| --------------------------------------- | ------------- | ----------------- | -------- | ------------------------------------------------------------------------------------ |
| Commit graph rendering                  | log/graph     | any fixture       | 📷       | ⬜ (volatile: shas/dates)                                                            |
| Branches: create / checkout / rename / delete | branch  | any fixture       | —        | 🟡 (checkout ✅ via BranchContext; **create-from-commit ✅ via ⌘K palette**, asserted via `git log`; **rename ✅** (`branch-rename.feature`, see below); delete still native — investigated for the remote-delete confirmation flow specifically and confirmed genuinely blocked, not just unattempted; see "Known blockers / gotchas" below) |
| Branches: set upstream                  | branch        | remote-ahead      | —        | ✅ (**dialog path**, driven through the repoUI `pendingGraphAction` store bridge — same technique `ai-commit-recompose.steps.ts` already uses for its own native-menu-only entry, see `branch-upstream.steps.ts` — asserted via `git config branch.<name>.remote`/`.merge`; the "unambiguous default, no dialog" direct-apply path (`resolveDefaultUpstream`) stays behind the native branch context menu and isn't e2e-driven, see notes below) |
| Compare two branches                    | branch        | remote-ahead      | —        | ✅ (**via the `__e2eRepoUIStore.setCompareRefsTarget` bypass** — the triggering "Compare with…" entry is a native context menu, no ⌘K equivalent exists, see gotchas; asserts the real `compare_refs` backend against known per-file differences, a swap reversing per-file add/delete counts, and re-picking a side through the dialog's own `NativeSelect` — see `compare-branches.feature`) |
| Tags: create / shown in graph            | tag           | any fixture       | —        | ✅ (**create (lightweight + annotated) via ⌘K palette**, asserted via `git log`/`git cat-file -t`; **ref badge shown in the graph row ✅**, `ref-label-tag-<name>` testid added to `RefLabel.tsx`) |
| Cherry-pick a commit                    | cherry-pick   | feature-branches  | —        | ✅ (**via ⌘K palette**, asserted via `git log` — picks a non-conflicting file addition from another branch) |
| Interactive rebase (reword/squash/drop) | rebase        | fixup-chain       | —        | 🚫 (native commit menu + child window)                                               |
| Reset (soft/mixed/hard, RESET confirm)  | rollback      | rollback-history  | —        | ✅ (**soft/mixed/hard incl. RESET-confirm gate, via ⌘K palette**, asserted via `git diff`/`git status`) |
| Revert a commit                         | rollback      | rollback-history  | —        | ✅ (**via ⌘K palette**, asserted via `git log` — reverts the tip commit cleanly)     |
| Revert a MERGE commit (mainline picker) | rollback      | showcase          | —        | ✅ (**via ⌘K palette**, both mainlines, asserted via `git log`/file presence — see "10. Merge commit actions" below) |
| Compare a merge commit against parent 1/2 | rollback    | showcase          | —        | 🟡 (dialog + diff content ✅, but only reachable via a direct store dispatch, not the palette — see "10. Merge commit actions" below) |
| Stash apply / pop / drop                | stash         | stash-stack       | —        | ✅ (**drop/apply/pop ✅ via ⌘K palette**, asserted via `git stash list` / a restored file — apply/pop reset the working tree to a clean HEAD first, see gotchas) |
| Remote: fetch / pull / push             | remote        | native creds      | —        | 🚫 (needs a real remote)                                                             |
| Clone a repo                            | repo          | native            | —        | 🚫 (native dialog + network)                                                         |
| Scan a folder for repos                 | repo          | native            | —        | 🚫 (native dialog)                                                                   |
| AI commit-message generation            | AI            | fake HTTP server  | —        | ✅ (streaming + prompt-wiring + cancel + settings dropdown — see "AI generation" below) |
| GitHub OAuth device flow                | github        | mock + real call  | —        | ✅ (real device-code request + cancel via Settings; poll contract mocked — see "GitHub OAuth" below) |
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

- **A step can "find" a control that changed shape under it.** Three of the five silently-broken
  feature files broke this way, all invisible to a testid-existence check:
  - **⌘P is not ⌘K.** `useKeyboardShortcuts` opens the *same* palette dialog in two modes — ⌘K
    (`toggle('all')`, the actions palette) and ⌘P (`toggle('files')`, file search). In `files` mode
    `CommandPalette` renders only the lookup/files groups, so no `command-item-*` for
    commit/stash/settings actions and no `[cmdk-group-heading]` exists at all. `command-palette-input`
    appears in **both** modes, which is why an "I open the command palette" step switched to ⌘P still
    looked like it worked and only failed 11 steps later, across three feature files
    (`command-palette`, `fixup-autosquash`, `undo-redo`).
  - **Tag creation is no longer a dialog.** `TagDialog.tsx` was deleted in favour of
    `TagCreationInput` — a bare input rendered inside the drafted commit row's refs cell
    (`tag-creation-inline-input`; the `bar` variant only appears when the refs column is hidden).
    There's no name-then-confirm dialog and no confirm button: Enter submits, and annotated tags go
    through the same input with an empty message.
  - **The worktree branch picker is no longer a `<select>`.** `BranchCombobox` kept the
    `worktree-add-branch-select` testid on its *trigger button*, so `selectByAttribute('value', …)`
    kept finding the control and failing only on the option. Click the trigger, then the
    `worktree-add-branch-option-<branch>` item.
- **Radix dropdown triggers open on `pointerdown`, not `click`.** The worktree row's remove action
  moved behind a per-row "⋮" menu (`worktree-actions-button-<path>` → `worktree-remove-<path>`).
  A synthetic `el.click()` — which is what the `clickViaJs` helper does, and what the hover-revealed
  `opacity-0` workaround below forces you into — dispatches only a click event, so the menu never
  opens and the item never renders. Dispatch a real `pointerdown`/`pointerup`/`click` sequence with
  `button: 0` instead (`worktree.steps.ts`'s `openMenuViaJs`).
- **Navigate with `browser.url()`, never by assigning `window.location.href` inside `execute`.**
  The assignment tears the document down while the driver is still completing that same call, so the
  navigation can simply be lost (see `repo.steps.ts`). It's worse than a lost navigation, though:
  the tauri service runs a window-state script in a `beforeCommand` hook — *before every single
  command* — so anything issued between the assignment and the new document committing runs that
  script against a tearing-down document, which reliably takes the **whole app process** down. That
  surfaces as ECONNREFUSED in some later scenario, nowhere near the cause, and (once the process
  comes back) as an app rehydrated from whatever repo an earlier run last flushed to `localStorage`.
  Even a `getUrl` poll in a `waitUntil` was enough to trigger it. `browser.url()` avoids the whole
  class: the driver owns the navigation and waits for it, so there is no window to send commands
  into. Every in-place navigation in this suite now goes through it (`repo.steps.ts`'s fixture open,
  `merge.steps.ts`'s merge-route step and its `@merge` After hook).
- **`repo-view` being displayed does not mean you're on the repo you just seeded.** The
  fixture-open step seeds `localStorage` and reloads, but `[data-testid="repo-view"]` is equally
  displayed by the document being navigated *away* from, so the wait can be satisfied before the
  reload lands. A scenario that opens a second fixture on top of the Background's one (the palette
  feature's cherry-pick and stash scenarios) could therefore keep running against the first — and
  since the assertion steps read the repo path back *out of the app*, they'd faithfully shell out to
  `git -C <the-wrong-fixture>` and fail with a baffling "unknown revision". Two fixes, both worth
  keeping: the step now verifies the live store landed on the requested repo (repairing it in place
  via `openTab`/`setActiveRepo` rather than reloading again, which would just re-enter the race), and
  git assertions take their path from `support/activeRepo.ts` — recorded on the Node side when the
  fixture is built — instead of asking the app. **Steps that still read `git-manager-repos-ui` out of
  the app carry the same latent bug**: `rewards`, `tag-menu`, `rebase`, `bisect`, `working-tree`,
  `commit`, `blame-history`.
- **In a real second window, re-assert the window before *every* interaction.** The same
  `beforeCommand` focus hook follows the OS's active window, so once focus returns to the main app
  window — which it does on its own, e.g. after the merge editor's auto-merge IPC round trip — the
  driver silently switches with it and every later query runs against the main window's document.
  The symptom is not "wrong window" but "the merge editor's buttons vanished": `$$` comes back empty
  with *no* `merge-*` testid in the document. `merge.steps.ts`'s `ensureMergeWindow()` switches
  unconditionally before each interaction (checking the current handle first is itself a command, so
  "already on it" is never a safe conclusion), and the accept-right loop does its find-and-click
  inside a **single** injected script — split across round-trips, the element gets found in one
  window and read in another (`getElementAttribute` receiving an undefined elementId).
- **Visual snapshots are self-baselining and only meaningful on a re-run.** `apps/e2e/__visual__/`
  is gitignored and `autoSaveBaseline` is on (it's `!process.env.CI`, and there is no CI), so the
  **first** run on any machine writes the baselines and every 📷 assertion passes vacuously; only a
  second run compares anything. That made a whole class of bug self-perpetuating: a snapshot taken
  while a full-viewport cover was up got *saved as the baseline*, and every later run then mismatched
  against it forever (merge-editor at 6%, autosquash-preview at 14%, theme-card-dark at 98%). Two
  covers do this — `#app-splash`, the static startup splash `index.html` paints before React boots,
  which every in-place navigation puts back up, and `LoadingOverlay`'s global scrim — and
  `stabiliseForSnapshot()` now waits both out before capturing. If snapshots start failing
  wholesale, suspect a poisoned baseline first: delete `__visual__/` and re-run twice.
- **On a small element, the 1% snapshot threshold is one border.** `theme-card-dark` is a 330×186
  card; its "this theme is active" ring is ~3% of the capture, and a focus ring is the same order.
  So a small-element snapshot has effectively no tolerance for state that varies between runs, which
  makes two things mandatory rather than nice-to-have: `stabiliseForSnapshot()` **blurs** the active
  element (a step that clicks the element it then photographs leaves it focused, and whether
  `:focus-visible` paints depends on how the driver's click was classified) — blurring, not a
  blanket `box-shadow: none` on `:focus`, because Tailwind's `ring-*` compiles to `box-shadow` and
  that's also how the card draws its *selected* state, so suppressing it in CSS erased real chrome
  and made this flakier rather than less. And a scenario must
  **set the state it snapshots** instead of inheriting it. The theme-card scenario used to rely on
  the *previous* scenario leaving `dark` selected — order-dependent, and racy anyway against the
  persisted settings rehydrating after its own reload; it now selects the theme itself first.
- **The first load of an app session is several times slower than the rest.** A `@merge` run that
  takes 14s warm took 45s cold, and 15s waits that never came close warm timed out cold. Waits
  around the merge route (splash, connector overlay) are set to 30s for that reason — they only cost
  time when something is genuinely stuck.
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
  bridge into the same web dialogs (`reset-dialog`, `revert-dialog`, `create-branch-dialog`, and the inline
  `tag-creation-inline-input`); no-dialog actions (cherry-pick, copy-sha, stash apply/pop/drop) call the
  API layer directly from `useCommitCommands.ts`/`useStashCommands.ts`, mirroring
  `useGitGraphActions.ts`'s native-menu handlers exactly (same calls, same `mutate`/
  `invalidateQueries` follow-up). All are now e2e-drivable (see command-palette.feature). A third
  shape exists for `fixup`: no in-page dialog to route through, so `pendingGraphAction: { kind:
  'fixup' }` instead calls `openFixupWindow` (now exported from `useGitGraphActions.ts`) directly,
  opening a **real second `WebviewWindow`** — see the multi-window gotcha below for why this one
  couldn't reuse the merge/rebase editors' navigate-in-place trick. Still native-menu-only (no
  palette command yet): interactive rebase, create-branch/tag from a *multi-selection*,
  drag-reorder in the rebase editor, **branch delete (local and remote)**. Other non-menu entry
  points: branch checkout via `BranchContext` (undo-redo.feature), commit via the WIP panel buttons
  (commit.feature), undo/redo via keyboard.
- **Branch-scoped dialog actions (rename, set upstream, …) have no command-palette entry at all** —
  neither the graph's branch submenu nor the sidebar's branch row menu routes through it (the ⌘K
  palette only offers commit/stash actions today, see `useCommitCommands.ts`/`useStashCommands.ts`).
  But the
  native handler for these still only calls `setPendingGraphAction({ kind: 'renameBranch' | ... })`
  on the repoUI store the same way the palette's commit-scoped actions do — `ai-commit-recompose.
  steps.ts` proved the pattern first for its own native-menu-only entry (`recompose`), and
  `branch-upstream.steps.ts` reuses it for **Set upstream**: `window.__e2eRepoUIStore.getState()
  .setPendingGraphAction(...)` after selecting any commit (`GitGraph.tsx`'s bridge effect requires
  a non-null `primaryOid`, unrelated to which branch the action targets), which opens the real
  `SetUpstreamDialog` exactly as a menu click would. **Not covered by this**: the "unambiguous
  default" shortcut (`resolveDefaultUpstream` in `lib/branchUpstream.ts`) that applies the upstream
  directly with *no* dialog when exactly one `origin/<branch>` exists — that branch of
  `onSetUpstream` lives entirely inside the native-menu closure in `useGitGraphActions.ts`/
  `useSidebarBranchMenu.ts` and is never reached without a real menu click, so it stays untested by
  e2e (unit-tested instead, see `branchUpstream.test.ts`). The dialog path e2e drives calls the
  identical `apiSetBranchUpstream` → `set_branch_upstream` backend command either way, which is what
  actually needed proving (the command didn't exist before this feature).
- **"Compare `<branch>` with…"** (graph branch pill / sidebar branch row) is a fourth
  shape: it has no ⌘K equivalent at all (it's about a *pair* of refs, not a commit/stash action the
  palette's `pendingGraphAction` bridge is shaped for), so `compare-branches.feature` instead jumps
  straight to `RepoView`'s mounted `CompareBranchesDialog` via
  `__e2eRepoUIStore.getState().setCompareRefsTarget({ baseRef, headRef })` — the same "seed the
  live store, skip the trigger" technique blame-history.steps.ts's `setActiveDiffFile` already uses
  for a different native surface. Everything past that call is real: the real `compare_refs`
  backend, the dialog's own `NativeSelect`s for re-picking either side, and its swap button.
- **Remote branch delete: investigated specifically, confirmed genuinely not e2e-testable today —
  not just "nobody wrote it yet".** Both entry points (the graph's per-commit branch menu in
  `useGitGraphActions.ts` and the sidebar's branch-row menu in `useSidebarBranchMenu.ts`) are real
  native context menus (see the bullet above), so the Delete item on a remote ref (`origin/x`) can't
  be clicked at all. The question this investigation actually answered was narrower: *could the
  confirmation dialog it opens (`DeleteRemoteBranchDialog.tsx`) still be reached by bypassing the
  menu and writing state directly, the way `ai-commit-recompose.steps.ts` already does for
  `recompose` (`window.__e2eRepoUIStore.getState().setPendingGraphAction({ kind: 'recompose', ... })`,
  which `GitGraph.tsx` forwards into its own dialog)?* The answer is no, and not by omission:
  - The pending state each hook owns (`pendingDeleteRemoteBranch` / `setPendingDeleteRemoteBranch`,
    rendered as two separate `<DeleteRemoteBranchDialog>` instances — one in `GitGraph.tsx`, one in
    `RepoView.tsx`) is **plain `useState`**, not a field on any Zustand store, so
    `window.__e2eRepoUIStore` (or any other `__e2e*Store`, per `main.tsx`'s exposure list) simply
    cannot reach it — confirmed by reading both hooks end to end, not by grepping for its absence.
  - Unlike `recompose`, it is also **not** one of the `GraphCommitAction` kinds `repoUI.store.ts`'s
    `pendingGraphAction` carries, and that is a deliberate exclusion the code already documents, not
    a gap: `graphContextMenus.ts`'s doc comment on `PendingDeleteRemoteBranch` says plainly "unlike
    the graph's other menu-triggered dialogs, this one needs no clicked-commit node to exist in the
    loaded graph page … so it stays outside that shared union." Every kind that *is* in the union
    flows through `GitGraph.tsx`'s `pendingGraphAction` effect — gated on `pendingGraphAction &&
    primaryOid` — and, for the dialog-based kinds, a second gate in `GitGraphOverlayManager` that
    requires the oid to resolve to a **loaded graph node** before rendering anything. A remote
    branch's tip commit is not guaranteed to be inside the graph's loaded window (a remote-only
    branch outside `initialGraphCommits` is a completely normal case, and is exactly the kind of
    branch someone would want to delete from the sidebar without ever loading its commit locally) —
    so routing delete-remote-branch through that gate the way `recompose` does would silently
    no-op the dialog for precisely the branches most likely to need it. The exclusion prevents a
    real bug; it isn't an oversight to "fix" for testability.
  - Also checked and ruled out: no ⌘K command-palette entry exists for this action either, unlike
    reset/revert/create-branch/create-tag (`grep -rn "deleteRemoteBranch\|DeleteRemoteBranchDialog"
    apps/desktop/src` finds only the two menu hooks, the dialog component, and their own unit tests
    — no `useCommitCommands.ts`/`useStashCommands.ts` wiring).
  - Bridging it anyway would mean either forcing tests (and, if ever added, a real palette command)
    to select an unrelated commit first just to satisfy a gate the dialog doesn't need, or
    restructuring `GitGraph.tsx`'s shared bridge so one new kind skips a gate every other bridged
    action relies on — past "trivial", and in tension with the documented reason the original author
    kept this one out.
  - **Conclusion**: native-context-menu-only with no e2e bypass in the current harness, same class
    of gap as interactive rebase — a real architectural wall, not a missing test. The dialog and the
    backend `delete_remote_branch` command it drives (`services/git_remote.rs`,
    `commands/remote.rs`) are covered at the unit/component level instead
    (`DeleteRemoteBranchDialog.test.tsx`, `RepoView.test.tsx`, `useGitGraphActions.test.ts`,
    `useSidebarBranchMenu` via `graphContextMenus.test.ts`, `git.api.test.ts`).
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
