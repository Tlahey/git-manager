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

## Covered today (61 feature files / 219 scenarios)

> **This matrix is only as honest as the last full run — and nothing enforces that.** There is no
> CI, so a ✅ here means "passed when someone last ran it", not "passes today". Five feature files
> (`command-palette`, `fixup-autosquash`, `undo-redo`, `merge-editor`, `worktree`) sat at ✅ while
> failing outright on `main`, in every case because the app changed underneath a step and no run
> caught it. Re-run the suite before trusting a row, and see
> [Known blockers / gotchas](#known-blockers--gotchas) for the harness traps those five uncovered.
>
> **Last full run: 2026-08-21 — 61 feature files, 219 scenarios, 0 failing, 9 minutes.** That run
> started red: `remote-push.feature` had gone stale in the eighteen days nobody ran the suite, and
> the reason turned out to be a race in a shared step rather than anything about pushing — see the
> gotcha it earned below.

| Feature                                                                                                    | Area       | Setup                                             | Snapshot                          | Status                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Command palette (⌘K)**: 16 scenarios across settings/commit/stash/ref                                    | palette    | rollback-history · feature-branches · stash-stack | —                                 | ✅ (settings section; reset soft/mixed/hard incl. RESET-confirm gate/revert/create-branch/create-tag (lightweight + annotated)/cherry-pick/create-patch — single commit **and from a multi-commit selection** (`commit-create-patch-selection`) — on a commit; stash drop/apply/pop — each asserted via git on disk) |
| **Interactive rebase editor**: reword / squash / drop, run for real                                        | rebase     | fixture:rollback-history                          | —                                 | ✅ (`interactive-rebase.feature` — real second window on `?window=rebase`, real `run_interactive_rebase`, asserted via `git log`/`rev-list`/file content; see "11. Interactive rebase editor")                                                                                                                       |
| App launches, React mounts                                                                                 | app shell  | —                                                 | —                                 | ✅                                                                                                                                                                                                                                                                                                                   |
| **Interface chrome tour**: tab bar / toolbar / footer, each with a zone-cropped doc capture                | app shell  | fixture:feature-branches                          | 📷 (doc, per-zone)                | ✅ (`interface-overview.feature` — also the reference for the "area screenshot" step)                                                                                                                                                                                                                                |
| Tauri command mock: success / reject / restore, **GitHub poll-token contract (pending/success/expired)**   | IPC        | mock                                              | —                                 | ✅                                                                                                                                                                                                                                                                                                                   |
| Fixup autosquash grouping + **create fixup commit (via ⌘K palette)**                                       | fixup      | fixture:fixup-chain                               | 📷 ✅ (preview groups)            | ✅                                                                                                                                                                                                                                                                                                                   |
| Rebase conflict panel auto-opens + **snapshot** + continue/skip/abort                                      | rebase     | fixture:rebase-conflict                           | 📷 ✅ (panel layout)              | ✅ (panel shown + snapshotted; continue/skip/abort ✅; merge-editor block resolution now driven separately)                                                                                                                                                                                                          |
| **Rebase progress view** (center step rail) + **snapshot** + hide/banner/files toggle                      | rebase     | fixture:rebase-multi-step                         | 📷 ✅ (full step rail)            | ✅ (see "Rebase progress view" below)                                                                                                                                                                                                                                                                                |
| **Merge editor** opens for a conflicted file + **snapshot** + **block resolution**                         | merge      | fixture:rebase-conflict                           | 📷 ✅ (full Monaco editor)        | ✅ (opens + snapshotted; **wand + per-block accept + Apply ✅**, real second window, result asserted via git/file content)                                                                                                                                                                                           |
| **Working-tree staging panel** + **file diff** + **snapshots**                                             | commits    | fixture:stash-stack                               | 📷 ✅ (staging panel + diff view) | ✅                                                                                                                                                                                                                                                                                                                   |
| **Commit staged changes** (write message → Commit → HEAD advances)                                         | commits    | fixture:stash-stack                               | —                                 | ✅                                                                                                                                                                                                                                                                                                                   |
| **Undo / redo a branch checkout** (Cmd+Z / Cmd+Shift+Z)                                                    | undo/redo  | fixture:feature-branches                          | —                                 | ✅                                                                                                                                                                                                                                                                                                                   |
| Detached HEAD indicator reads "HEAD", checkout back to a branch                                            | repo state | fixture:detached-head                             | —                                 | ✅                                                                                                                                                                                                                                                                                                                   |
| **Git bisect**: tools menu → pick bad/good in graph → run to first bad commit                              | bisect     | fixture:bisect-history                            | —                                 | ✅ (setup bar open/cancel; inverted-range rejected + start disabled; full run marks by bug presence and converges on commit 5 — asserted via `.git/BISECT_LOG`; abort clears `.git/BISECT_START`)                                                                                                                    |
| Sidebar lists stashes                                                                                      | stash      | fixture:stash-stack                               | —                                 | ✅ (list ✅; **drop/apply/pop ✅ via ⌘K palette**, each asserted via `git stash list` / a restored file)                                                                                                                                                                                                             |
| Settings screen opens + **snapshot**                                                                       | settings   | keyboard (Mod+,)                                  | 📷 ✅ (general + notifications)   | 🟡 (general & notifications snapshotted; row-height persistence ✅; **ssh key generation ✅ · AI provider test-connection ✅ · rewards toggle ✅ · AI preset dropdown ✅ · GitHub OAuth device code ✅ · application icon ✅**; appearance snapshot skipped on purpose, see below)                                   |
| **AI commit-message generation**: streaming + prompt-wiring + cancel                                       | AI         | fake HTTP server                                  | —                                 | ✅ (see "6. AI commit-message generation" below)                                                                                                                                                                                                                                                                     |
| **Worktree** list / add / remove (incl. dirty-remove force gate) + **AI-agent activity**                   | worktree   | fixture:worktree-repo                             | 📷 (doc)                          | ✅ (see "Worktree management" below; `get_worktree_agent_activity` covered end to end — the step fabricates a Claude transcript in the run's isolated `$HOME`, and the WIP row's agent glyph and working tag are asserted from the real graph)                                                                       |
| **Repo tab views**: switch Graph ↔ Terminal ↔ Settings                                                     | navigation | fixture:feature-branches                          | 📷 (doc)                          | ✅ (see "Repo tab views" below)                                                                                                                                                                                                                                                                                      |
| **Kanban board**: create a board, add/move/archive a card, close a sprint with carry-over                  | board      | fixture:feature-branches                          | 📷 (doc, ×3)                      | ✅ (local backend only — see "Kanban board" below; every write also asserted on disk against the board's own git ref, and the sprint scenario found and now guards a real bug)                                                                                                                                       |
| **Kanban card record**: checklist, comments, side-panel fields, relations, columns, settings, delete, move | board      | fixture:feature-branches                          | —                                 | ✅ (`board-cards.feature`, 11 scenarios, none documented — see "Kanban board" below; three real bugs found, two fixed here and one copy correction; the description's markdown rendering and the ticket search reading it were added 2026-08-21)                                                                     |
| **Kanban card activity**: the History tab's field-by-field entries, a threaded discussion                  | board      | fixture:feature-branches                          | —                                 | ✅ (`board-card-activity.feature`, 2 scenarios — the history read back out of the board's own commits, and a reply asserted both as a thread on screen and as a `parentCommentId` on disk)                                                                                                                           |
| **Kanban card → branch → merge**: create the branch a card is about, its worktree, and the done sweep      | board      | fixture:feature-branches                          | —                                 | ✅ (`board-card-branch.feature`, 3 scenarios — branch and worktree asserted with `git branch`/`git worktree list`, and a real palette merge moving the linked card to Done; two real constraints found, see below)                                                                                                   |
| **Kanban board recovery**: a board its repository lost, offered back by the disaster-recovery mirror       | board      | fixture:feature-branches                          | —                                 | ✅ (`board-recovery.feature` — the fixture is rebuilt mid-scenario, which is the disaster; the mirror under the run's own `$HOME` is read with plain `git` before and the restored ref after)                                                                                                                        |

---

## Not covered today

Audited 2026-08-03, against the full `generate_handler!` command list in `lib.rs` and the app's
`src/app` + `src/components` surface, and again on **2026-08-21** against everything that shipped in
between (the suite had not been touched since #402, while eleven feature PRs had landed — most of
them on the board). Tracked as a checklist in
[#267](https://github.com/Tlahey/git-manager/issues/267) — tick the item there and update the row
here in the same PR that lands a scenario. What the suite does **not** exercise, split by why.
This is the section REPORT.md points at —
REPORT.md itself is regenerated on every run and can only say how the _existing_ scenarios did;
what's missing has to live here, where a human maintains it.

### Real gaps — testable with today's harness, just not written yet

Written down here rather than left implicit: this table read **None** for eighteen days while the
app kept shipping, which is how a coverage matrix goes quietly stale. What the 2026-08-21 pass left
behind, each with what it would take:

| Missing                                                   | What it would take                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A terminal bound to a worktree** (#400)                 | `terminal.feature` covers a shell in the repository on screen; what is untested is the tab-per-worktree binding and the sidebar saying what is running where. Needs `fixture:worktree-repo` rather than `feature-branches`, and a way to read a session's cwd back — `pwd` in the terminal already works, so this is a scenario nobody has written, not a wall. |
| **The markdown editor's formatting toolbar** (#399)       | Every markdown field the suite drives is switched to its raw "code" tab first (`switchToRawMarkdown`), because typing raw markdown is what the assertions are about. The rich mode's toolbar — bold, list, link — is exercised only by its own unit tests.                                                                                                      |
| **Switching the interface language** (#393 added Spanish) | Scenarios seed the language (`Given the app language is English`) rather than picking one in Settings, so the selector itself, and the third locale, are never clicked.                                                                                                                                                                                         |
| **A card's "Create PR"** (#403)                           | Rendered only for a repository with a connected GitHub account (`canUseRemote`), same wall as the GitHub-backed board below.                                                                                                                                                                                                                                    |

Everything else that stood here has been written or moved below with a reason.

> **Closed 2026-08-03.** Tag push/delete, remote-branch delete, merge, fast-forward, local branch
> delete and create-patch were all native-context-menu-only, which WebDriver cannot open. They now
> have command-palette entries (`useRefCommands`, `useCommitCommands`) and scenarios in
> `tags.feature`, `remote-push.feature`, `command-palette.feature` and `merge-branches.feature`
> (merge and fast-forward moved there when they were promoted into the docs), asserted against git itself
> (`ls-remote` for the remote ones, `rev-parse`/`log` for the local ones). Undo/redo breadth closed
> with them: the branch-delete scenario is the ⌘Z coverage for a ref deletion, and
> `detached-head.feature` covers undoing a checkout back into a detached HEAD.

### Blocked by the harness (documented, deliberate)

> **Two rows left this table on 2026-08-03 because their reasons turned out to be stale, not
> because the harness changed.** The **interactive rebase editor** row claimed the flow "opens a
> third real window mid-flow" — but `RebasingCommitWindow` renders entirely from `?window=rebase`
> URL params (main.tsx), so a real second window opened with production's own URL covers
> reword/squash/drop end to end, asserted against `git log` on disk (see "11. Interactive rebase
> editor" below and `interactive-rebase.feature`). The **patch from a multi-commit selection** row
> claimed "the palette has no notion of a selection" — true only until the graph published its
> multi-selection to the store (`selectedCommitOids` in `repoUI.store.ts`), which was a small
> product gap, not a harness wall; the palette now carries `commit-create-patch-selection` and the
> scenario lives in `command-palette.feature`.

| Missing                                                            | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Package updates** (`update_packages`, `check_outdated_packages`) | Updating shells out to the project's real package manager (`services/package_update.rs`): network, minutes, and a mutated `node_modules`/lockfile in the fixture. A suite that runs in seven minutes and touches nothing outside `/tmp` should not do that; the health _scan_ and its counts are covered.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **GitLab / Bitbucket accounts**                                    | Not reachable because they are **not on screen**: both are built and tested but unlisted (`AVAILABLE_PROVIDERS` in `IntegrationSection.tsx`), pending an OAuth application registered on gitlab.com and something in the app that actually reads either account. Their panels, commands and settings shape have unit tests; the e2e scenarios that drove them are in `git log` for when the providers come back.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Running a task** (`run_task_in_terminal`)                        | Launching a task opens an **external** terminal application — out of reach, and not something a test run should spawn. The _listing_ half is covered: the repository's `package.json` scripts reaching the task command's suggestions (`settings-repository.feature`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **The GitHub-backed board** (`features/board`, `source: 'remote'`) | A shared board's cards **are** GitHub issues and its columns are labels, so there is nothing to drive without a connected account and a real repository to file against — the "GitHub" option in the new-board dialog is disabled outright without one (`canUseRemote`). Same wall as the Launchpad issue detail panel. The local backend, which is the whole feature minus its transport, is covered (`board.feature`), and the UI never branches on which backend is behind it beyond picking a `BoardBackend`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Native OS surfaces**                                             | Folder pickers (`scan_repos`), `open_in_editor` / `open_in_terminal` / `reveal_path_in_finder`, real native notifications and system sounds, the auto-updater — WebDriver cannot see or drive any of them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **The notch window's own rendering**                               | Deliberately not painted in e2e (the `__e2eNotificationSurface` seam) — the queue that feeds it is covered by git-hooks.feature; the window itself is the one boundary the suite stops at. Tried anyway, twice, for a documentation capture, and both attempts are recorded in `notifications.feature`: the `notch` handle registers and `switchToWindow` succeeds, but every `execute/sync` against it answers "No window could be found" (the window is `focus: false` / `decorations: false` and never becomes a key window) — and on the run where it failed to open at all, the queue's native fallback raised a **real macOS banner** on the host. Fixing the driver would not help: this provider captures the **webview only**, so the best possible capture is a context-free black rectangle that also shows the 32pt band a real notched Mac hides behind the camera housing. A picture of the card can only come from `packages/notch`'s Storybook harness, which was weighed on 2026-08-04 and declined (a staged image in a pipeline built on test-backed ones). What the notch _is_ and how to choose it is documented from the Settings screen instead. |

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
  which _toggles_ a synthetic row — so clicking it while the CONFLICT row was already selected (the
  normal state during a pause) cleared the selection and closed the conflicted-files panel the click
  was meant to open. Both panels now have explicit per-repo visibility state
  (`stores/rebaseView.store.ts`) and the banner _sets_ them visible.
- **Two harness gotchas** (both cost a debugging round, see rebase.steps.ts):
  1. the whole-app loading scrim (`loading-overlay`, `fixed inset-0 z-9998`) is up while the graph
     reloads its history — i.e. exactly when the banner step runs. WebKit's driver clicks the scrim
     instead of reporting an intercepted click, so the click silently does nothing.
  2. clicking a row _wrapper_ (`graph-row-<oid>`) doesn't reach the row's React `onClick` here; the
     inner cell has to be the target (`conflict-row-banner`), same as bisect.steps.ts does for
     picking commits.

---

## File explorer ✅

The toolbar's view switcher (`repo-view-files`) swapping the graph for `FilesPage` — the tracked
files (`FileTreeSidebar`) in the left panel slot, the current directory in the middle, and a file
search in the toolbar.

- Setup: **`fixture:feature-branches`**. On `main` it tracks exactly one file (`app.txt`;
  `login.txt` only exists on `feature/login`), which is what makes "the filter excluded it"
  distinguishable from "it was never there".
- Covered (`file-explorer.feature`): opening lists the tracked files (`file-row-app.txt`), the Graph
  segment puts the graph back, the tree filter (`file-tree-search-input`, at the top of the panel) narrows the
  tree, and hiding the panel leaves `toolbar-toggle-panel` behind — asserted explicitly,
  since a hide with no way back would make the tree unreachable for the rest of the session.
- Not covered here: that an untracked file stays out of the listing. The invariant is enforced in
  `services/git_files.rs` and tested there, where a repository with one staged and one unstaged file
  is three lines of setup rather than a fixture mutated mid-run.
- No window juggling: the explorer replaces the graph in the main window, unlike the merge editor.

---

## Kanban board ✅ 📷

The third thing the central area can be (`features/board/`), reached from the same toolbar switcher
as the file explorer (`repo-view-board`). **Local backend only** — the GitHub-backed board needs a
connected account and real issues; see the blocked row above for why that one stays out of reach.

- Setup: **`fixture:feature-branches`**, which has nothing to do with boards and does not need to:
  a board is created by the scenario itself, through the UI, because that is the only way one comes
  into being. Every scenario therefore starts from a repository with no board at all — which is
  also the state a first-time user is in.
- Covered (`board.feature`, 5 scenarios, 4 of them `@doc`): creating a board with a card prefix and
  the three default columns; adding a card and moving it between columns from the card's own status
  picker; filling in a card's record (checklist, assignee, priority, discussion) — the one scenario
  here that exists for the documentation as much as for the regression, since the record is what a
  reader looks for and the three others only ever show a card from the outside; closing a sprint
  with carry-over into a successor, then reading the closed one back through "Show closed sprints"
  (read-only banner + frozen sprint report); archiving a card, finding it again through the board
  search, and restoring it from the archive dialog.
- **Every write is also asserted on disk.** A local board is a hidden ref per board
  (`refs/git-manager/board/<id>/state`, see `services/git_board.rs`) carrying one commit per
  mutation, so the steps read it with plain `git`: `for-each-ref` counts the boards,
  `log --format=%s` proves the commit a gesture was supposed to write ("git-manager: create board",
  "git-manager: update board card"), and `show <ref>:cards/<id>.json` proves the card's stored
  `columnId`. A DOM assertion alone could pass on a render the backend never agreed to.
- **Nothing on a board has a stable id**, so no `.feature` file names one: board and card ids are
  generated per write (`generate_id`, seeded on a nanosecond timestamp). `board.steps.ts` resolves
  every testid in the page from what a reader would say instead — a card by its title, a column by
  its header label, a sprint by its name. The column _ids_ happen to be literal (`todo`,
  `in-progress`, `done`), and are still resolved by name so a renamed column costs no step edit.
- **Real bug found, and now guarded.** The sprint scenario failed on its first run with the sprint
  still open: carrying the leftovers out commits on the board being closed as well, so the revision
  read before it was already behind the ref tip and `close_board`'s compare-and-swap refused the
  close — leaving a conflict toast, an open sprint, and its cards already gone to the successor.
  Fixed in `useBoardActions.closeSprint` (re-read the revision from the refetch the carry-over
  forces), with a unit test beside it in `useBoardActions.test.ts`.
- **Two gotchas**, both in board.steps.ts. Radix's `DropdownMenuTrigger` opens on `pointerdown`,
  and this provider's _native_ click does not produce the sequence it wants — even on a plainly
  visible trigger, which is a wider claim than worktree.steps.ts's hover-revealed one, so
  `support/interactions.ts`'s `openMenuViaJs` is now shared rather than copied a second time. And a
  `(\d+)` capture arrives as a **number**, so comparing it to text read out of the DOM with `===`
  is false however identical the two print — which is what an error message reading
  `holds "1", expected "1"` turned out to mean.

### The card record and the board's own shape (`board-cards.feature`) ✅

The second half of the same feature, split into its own file **without a single `@doc` tag**: the
board's documentation page is curated from `board.feature`, and a page is generated per documented
scenario, so widening the tour is a decision someone should take on purpose rather than inherit from
a regression suite. 10 scenarios, all reusing `board.feature`'s own steps for the board-level setup —
Cucumber matches by text across files, so the two share everything down to `support/board.ts`, which
now holds the card/column/ref resolution both need (it was `board.steps.ts`-private before; a second
copy is what the `openMenuViaJs` note above already argued against).

- **Inside the card**: the Definition-of-Done checklist (adding items, ticking one, the `1/2` badge
  on the card's face and the `- [x]` on disk); a comment surviving a close-and-reopen; the blocked
  switch, which shows its required-reason field and writes **nothing** until there is a reason —
  asserted as an absence held for a stretch, since a write that has not been issued yet looks
  exactly like one that never will; and the four side-panel fields (assignee, priority, due date,
  tag) saved one after another, which is also a test of the card's `revision` being refreshed
  between them.
- **Between cards**: declaring "A is blocked by B" and proving on disk that the write landed on
  **B** (`blocks`) with A holding nothing — then removing the relation from A, the side that only
  _derives_ it, and proving B's stored half is what went away. That asymmetry (`lib/cardLinks.ts`)
  is invisible from the DOM alone: both cards render a row either way.
- **Around the cards**: adding a column and flagging it "counts as done"; removing a column that
  still holds a card; renaming the board, its prefix list and its tag palette; the delete
  confirmation's "archive instead" escape hatch and then a real delete; and moving a card to another
  sprint, asserted on **both** boards' refs.
- **Three real bugs, found by these scenarios** — see below. Two are fixed here; the third was a
  piece of copy that described the opposite of what the code does.

#### 1. Removing a column made its cards disappear — fixed

`BoardColumnsArea` only renders a card into a column that exists, so a card left in a removed column
was gone from the board while still on disk: not in the columns, not in the archive dialog (which
lists _archived_ cards, not orphaned ones), not findable by searching, and still holding its
identifier. `update_board_columns` now re-homes such cards into the first remaining column **in the
same commit** as the column change, which is the rule `move_cards_to_board` already applied when a
card arrives on a board without its column — so the invariant "every card sits in a column that
exists" is true of every state the ref ever holds. Rust test beside it
(`removing_a_column_rehomes_the_cards_that_were_in_it`).

#### 2. A card moved to another board was invisible on arrival — fixed

The move scenario failed with the destination board showing three empty columns. It was not the
backend: `get_board` returned the card, and the ref held it. `useBoardCardActions.moveCardToBoard`
revalidated the board _list_ and the _open_ board's cards, but the destination's cards live under
their own SWR key, populated the last time that board was looked at — and nothing ever asked for it
again. Measured with the probe still worth remembering: the board stayed empty for **30 seconds**
after the move, while `browser.tauri.execute` on `get_board` returned the card and a `rAF` probe
fired in 0 ms, which is what ruled out the throttled-webview explanation. `useBoardDetail` now
exposes `revalidateAllDetails`, and the move calls it; unit test in `useBoardCardActions.test.tsx`.

#### 3. The board settings lied about renaming a prefix — copy fixed

`boardSettings.prefixHint` read "Renaming it relabels every card at once — the numbers stay as they
are." A card holds **its own** prefix — that is what lets its identifier survive a move to another
board (`cardMeta.cardIdentifier`) — and `update_board_meta`'s doc comment says so explicitly, as does
its Rust test `editing_the_prefix_list_never_touches_a_cards_own_prefix`. The hint was a leftover
from the single-prefix era, promising a behaviour the storage design deliberately refuses. The
scenario pins the real one (a card stays `GM-1` after the board stops offering `GM`, and the next
card drawn from `OPS` starts its own sequence) and the copy now states it, en and fr.

#### Gotchas paid for here

- **A field that saves on its own has to be waited for on screen, not on disk.** A card's
  `revision` is the _board's_ ref tip, so every write moves it; the next edit is only safe once the
  page has re-read the card. Waiting for the write to land in git is not enough — the refetch is
  fired but not awaited — so each field step waits for the **row** to render its new value, which
  can only happen after the re-read. Four edits in a row otherwise fail on the second with a
  conflict toast.
- **The same applies to the checklist, in the other direction.** `CardDodSection` holds an
  optimistic copy while its write is in flight and drops it the moment the write resolves, so for an
  instant the editor renders the _previous_ checklist again. A step that typed the next item into
  that window built it on the stale string and silently lost the one before. The steps wait for the
  DOM and the stored markdown to agree **and** to contain what the edit was for, so the poll can't
  be satisfied by the state it started in.
- **A dialog opened _from_ the card record reopens it on the way out** (`useBoardDialogs`'s origin
  trail), including after the card it was about has been deleted or moved away — the record flashes
  back for one render until the refetch drops the card. Whether it is still up when the next step
  runs is a race, so the delete and move steps dismiss it explicitly rather than leaving the next
  click to land on a modal.
- **`CardFieldRow` renders a field's open editor _inside_ the row**, so "the row's text changed" is
  true the moment the editor opens and says nothing about the value being saved. Each field's
  settled-check is its own (the assignee's name in the row, `card-priority-high`, a
  `card-meta-tag-*` badge).
- **A toggle needs re-checking after `clickViaJs`.** The doubled-dispatch trap README.md documents
  is invisible on a button and fatal on a checkbox: the blocked switch, a checklist tick and the
  column editor's "counts as done" all flip forward and straight back about half the time. Every
  toggle here goes through a helper that verifies where it landed and re-clicks.

### The card's activity feed (`board-card-activity.feature`) ✅

The two halves of the Activity panel added in #412 and #416, both local-board only: the History tab,
which is `card_history` walking the board's own ref and turning each commit that touched this card
into "field: before → after"; and the Comments tab, where a reply nests under what it answers.

- **The history is asserted as a reading of the ref, not as a feed that exists.** The scenario
  changes one field (priority) and expects the row to read `Priority · Normal → High`, plus the
  `Card created` entry the walk stops on — which is what proves it stops at the card's first commit
  rather than reporting the whole board's history. Switching to Comments then asserts **no** history
  row is left: the tabs are one timeline filtered, and "a comment is not a change" is the only thing
  that distinguishes them.
- **A reply is checked twice, because only one of the two can go wrong quietly.** On screen it must
  be _nested_ (`CardActivityCommentThread`), and on disk the reply must carry the parent's id — the
  nesting is derived from that id on every read, so a reply stored flat would look identical until
  the card is reopened. Both are asserted, and then the record is closed and reopened so the thread
  is rebuilt from storage rather than from the dialog's own state. The flat "All" tab is asserted
  too, where the same reply is annotated (`↳ replying to Test User`) instead of indented.
- **Gotcha**: the nesting is one level out from the row that carries the testid. Each comment sits in
  a wrapper `<li>` (the indent), with `CardActivityCommentRow`'s `card-comment-<id>` `<li>` inside it
  and the replies in a `<ul>` beside that row — so "the parent's row contains the reply's row" is
  false for a perfectly good thread, and the step matches the wrapper's own child list instead.

### From a card to a branch, and back when it merges (`board-card-branch.feature`) ✅

The loop #403 closed, and the one capability a board hosted anywhere else cannot offer: the card's
record creates the branch the card is about, gives it a worktree, and the card moves to its board's
done column on its own when that branch is merged.

- **Every assertion ends in git**: `git branch --list` for the branch, `rev-parse --abbrev-ref HEAD`
  for the checkout that comes with it, `git worktree list --porcelain` for the worktree, and the
  board's ref for the card's own half of the link. A card that says it has a branch and a repository
  that has none is exactly what this section can produce, and only one of those two is in the DOM.
- **The merge scenario drives the two views**: the branch is created from the card, given a commit of
  its own directly on disk (scaffolding — committing is `commit.feature`'s subject, not this one's),
  merged from the **graph** through the ⌘K palette exactly as `merge-branches.feature` does, and the
  card is then read back on the board. Nothing on the board is touched between the two: the sweep is
  `BoardMergeCompletion` listening for `apiMergeBranch`'s event, mounted once in `App`.
- **Two real constraints found here, both pinned by the scenarios:**
  1. **A worktree cannot be created for the branch the repository is standing on** — git refuses a
     second checkout of the same branch (`fatal: 'card/x' is already used by worktree at …`). Since
     creating a card's branch _checks it out_, the section's two buttons sat one above the other in
     the one state the second could never work in: "Create worktree" right after "Create branch"
     always failed, and all the user got was git's own `fatal:` line in a toast.
     **Fixed 2026-08-21**: the section now knows where a branch is checked out
     (`useWorktreeBranches`, re-read as part of the create-branch click, since that click is what
     changes the answer), disables the action and says where the branch is; and
     `createWorktreeForCard` refuses in the same words rather than letting the call reach git, for
     the race between the render and the click. The constraint itself is git's and stays — so the
     scenario asserts the refusal, then does what it asks: moves off the branch and creates the
     worktree, which is also the state a card is in when someone comes back to it days later.
  2. **The board's branch actions didn't invalidate what the graph reads.** `apiCreateAndCheckoutBranch`
     moved HEAD for real, but nothing invalidated the `branches` query — the toolbar kept reading
     `main` ten seconds after the checkout, with `staleTime: 5_000` and no refetch trigger, because
     the graph mounted while the cached data was still fresh. Both scenarios worked around it with a
     reload. **Fixed 2026-08-21**: `refreshAfterHeadMove` (extracted from `useBranchCheckout`, so
     there is one definition of what a moved HEAD invalidates) now runs after the card creates its
     branch, and the card's _checkout_ goes through `useSwitchBranch` like every other branch picker
     — which also gets it the undo entry and the stash prompt it never had. The reloads are gone, and
     each scenario now reads the branch indicator straight after leaving the board: that assertion is
     what would catch the staleness coming back. It matters most in the merge scenario, where the
     palette entry is named after the branch the app believes it is on — a stale toolbar would merge
     in the wrong direction and still pass.

### Recovering a board its repository lost (`board-recovery.feature`) ✅

The disaster-recovery mirror (#417) and the banner that surfaces it (#419). Board refs are local and
never pushed, so a repository that is deleted and cloned again comes back with no boards and no way
to know it ever had any.

- **The disaster is real, not simulated**: the scenario opens the fixture a second time mid-run, and
  `fixture_init` wipes and rebuilds the repository at the same path — which is exactly what a
  delete-and-re-clone leaves behind, since the mirror lives outside it under
  `$HOME/.git-manager/boards/<repo-slug>/<board-id>.git`.
- **Both sides are read with plain `git`**: the mirror's `board.json` off its own bare repo before
  the wipe, and the restored ref after (`git-manager: restore board from backup`), with the banner
  asserted gone once there is nothing left to recover.
- **The row is asserted to be _choosable_, not merely present.** A board is named after a sprint and
  one mirror is kept per lost clone, so "Sprint 12" can be offered several times over with nothing to
  pick by; the scenario checks the card count the row carries beside the name (the date beside it is
  rendered in the machine's locale, so pinning it would pin the run to one).
- **The mirror outlives everything, which is the point and also the trap.** Every board any scenario
  has ever created stays offered for recovery for the rest of the run — a fixture rebuild wipes the
  repository and nothing else. That grew into a nine-line banner over the later board features, and
  it reached the **documented captures**: `doc-card-options` was published with a pile of identical
  "Sprint 12" behind the card. The per-scenario `Before` hook now clears them
  (`support/boardMirrors.ts` — plain filesystem work, so it costs the hook no driver round trip,
  which is what that hook is otherwise careful about), and this scenario still states the
  precondition in its own text rather than inheriting it silently. The slug cannot be recomputed in
  Node (`repo_slug` hashes the path with Rust's `DefaultHasher`), so the directories are matched by
  their `<fixture>-` prefix instead.

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
_resolves_ the conflict (`merge-apply`, `merge-accept-left`/`-right`, keep-ours/keep-theirs) calls
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

| Fixture          | Exercises                                                                                                                                                                                                                                                                                                                                                                                                | Status |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| fixup-chain      | fixup grouping / autosquash ✅ · **create-fixup from staged change ✅** (via ⌘K palette, real second window — see gotchas)                                                                                                                                                                                                                                                                               | ✅     |
| rebase-conflict  | conflict panel ✅ · merge editor open+snapshot ✅ · **continue/skip/abort ✅** (continue resolves the conflict via `git checkout --ours` directly on disk, not the merge editor UI) · **merge editor block resolution ✅** (wand + per-block accept + Apply, real second window — see gotchas)                                                                                                           | ✅     |
| detached-head    | detached indicator ✅ · checkout-back-to-branch ✅                                                                                                                                                                                                                                                                                                                                                       | ✅     |
| feature-branches | branch checkout ✅ · undo/redo of the checkout ✅ · **cherry-pick (via ⌘K palette) ✅**                                                                                                                                                                                                                                                                                                                  | ✅     |
| stash-stack      | list ✅ · WIP staging panel ✅ · stage/unstage individual files ✅ · file diff ✅ · commit ✅ · **drop/apply/pop (via ⌘K palette) ✅**                                                                                                                                                                                                                                                                   | ✅     |
| rollback-history | **reset (soft/mixed/hard incl. RESET-confirm gate), revert, create-branch, create-tag — all via ⌘K palette ✅** · **undo/redo of a reset ✅** · **create-tag's ref badge shown in the graph ✅** · undo/redo of revert/branch/tag 🚫 (not a test gap — `undoActions.ts` has no case for these three actions at all; the app doesn't support undoing them yet, see the "Add undo/redo support" follow-up) | ✅     |
| bisect-history   | **bisect setup bar (open/cancel) ✅** · **inverted good/bad range rejected + start disabled ✅** · **full bisect run: pick bad/good in the graph, mark by bug presence, converge on the first bad commit ✅** (asserted via `.git/BISECT_LOG`) · **abort ✅**                                                                                                                                            | ✅     |

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
and asserts _some_ definitive status renders (`text-destructive` or `text-green-500` class) —
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
used to carry the _same_ testid in both the staged and unstaged zones; added a `bulkStageTestId`
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
  writing anything — the Rust cancellation check only runs _between_ stream chunks
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
— a leftover _fresh_ (same-day) summary makes the morning auto-run skip (so no request is sent) and
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
  exist was never what a folder _picker_ is for.
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

**AI-agent activity, added 2026-08-04** (`get_worktree_agent_activity`). This row used to sit in
"Not covered today" on the grounds that faking a Claude Code session meant writing into the
developer's real `~/.claude/projects/`. That premise was wrong: `useIsolatedHome()` repoints `$HOME`
at `/tmp/git-manager-e2e-home` for the whole run (`support/isolatedAppState.ts`), the app is a child
of that process, and `services/agent_session.rs` resolves the session root from `HOME` before
anything else — so the fixture writes into the run's own scratch home, not anybody's data. The step
(`worktree.steps.ts`) writes a `.jsonl` transcript under the slug the backend will look for, for
**both** spellings of the fixture path (git canonicalizes `/tmp` to `/private/tmp` on macOS, and
only one of them yields the right slug), re-stamps its mtime just before the assertion so the
60-second `working` window cannot age out mid-scenario, and removes only the directories it created.
The `@doc` scenario asserts the agent glyph and the `working` tag on the linked worktree's WIP row
straight from the real graph, and exports `doc-worktree-agent-activity`.

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

- **Real, UI-driven** (`settings.feature`): clicking the OAuth button hits the _real_
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
renders the _exact_ `RenameBranchDialog` the native menu would have opened. That effect requires a
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
  `pendingGraphAction` bridge forwards _any_ such action into the graph's own dialog routing — the
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
  side is a change to `README.md`, and a _later_ main commit (`docs: add readme badges`) touches
  `README.md` again before the fixture's `HEAD` — so reverting v0.1.0 with `-m 2` against the
  fixture's tip hits a real 3-way-merge conflict (the reverse patch's context no longer matches),
  which `repo.revert()` in `git_rollback.rs` correctly refuses to resolve silently. v0.2.0's two
  sides — `rollback.ts`/`rollback.test.ts` on the branch, `README.md`'s "Badges!" line on main —
  are never touched again afterwards, so both mainlines revert cleanly. Verified directly with
  `git revert -m 1` / `-m 2` against a built copy of the fixture before writing the assertions, not
  just inferred from the script.

### 11. Interactive rebase editor (reword / squash / drop) ✅

Sat in "Blocked by the harness" as "`run_interactive_rebase` opens a third real window mid-flow" —
investigated 2026-08-03 and found stale on both halves: `run_interactive_rebase` opens no window
(it's the command the editor _runs_), and the editor (`RebasingCommitWindow`) renders entirely
from URL params — main.tsx routes `?window=rebase&repoPath=…&baseOid=…` to it, exactly like the
merge editor's `?window=merge`. What _is_ true: it cannot borrow the shared main window the way
the merge opens+snapshot scenarios do, because **both** its exit paths (Start Rebasing and Cancel)
call `getCurrentWindow().close()` — the FixupCommitWindow problem, not the merge one. So
`interactive-rebase.feature` opens a **real second `WebviewWindow`** with production's own URL
(the same string `lib/graphWindows.ts`'s `openRebaseWindow` builds, created through the
`withGlobalTauri` global since the production triggers — the ref drag-drop menu and the fixup
flow's hand-off — are a native menu and a third-window chain, neither drivable). Everything past
the open is real: `list_rebase_commits` fills the plan, the toolbar edits it, Start runs the real
`run_interactive_rebase` (`git rebase -i` with the injected todo), and every scenario asserts
against `git log`/`git rev-list`/file content on disk.

- Setup: `fixture:rollback-history` — five linear commits all rewriting `counter.txt`, which
  forces honest plan design: a dropped/squashed step must sit at the tip of the edited range
  (anything replayed on top of a dropped content change would pause on a real conflict), while a
  reword can sit mid-range since it never changes a tree.
- Covered: **reword** a mid-range commit (subject rewritten in place, history length and file
  content untouched); **drop** the tip commit (gone from the log, file content rolled back);
  **squash** the two newest commits with "keep messages" (one commit fewer, both subjects in the
  combined message body, file content from the newer commit) — the last driving the real Radix
  dropdown (`rebase-squash-keep-messages`, a new testid, as are `rebase-reword-save` and
  `rebase-squash-discard-message`).
- **Gotchas found building it** (all in `interactive-rebase.steps.ts`): the plan rows' selected
  styling must be matched as an exact class token — every clickable `StepRailRow` also carries
  `hover:bg-accent/40`, so a substring check for `bg-accent` reads _every_ row as already selected
  and silently turns the select steps into no-ops; multi-select needs a dispatched
  `MouseEvent{metaKey:true}` (WebDriver can't hold a modifier here) with a repair path for the
  toggle collapsing back to one row; and `$`-based waits inside the second window are unreliable
  (the service's focus hook can re-point them at the main window mid-wait), so every in-window
  poll goes through window-ensured `browser.execute` instead.
- **Not covered, deliberately**: drag-reorder of plan rows (HTML5 drag-and-drop, which this
  WebDriver cannot synthesize meaningfully) and the two native entry points above — the editor's
  behaviour is the value; the triggers are one-line `openRebaseWindow` calls with their own unit
  tests.

---

## Rest of the surface (lower priority / smaller)

| Feature                                       | Area          | Setup                       | Snapshot | Status                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------- | ------------- | --------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Commit graph rendering                        | log/graph     | any fixture                 | 📷       | ⬜ (volatile: shas/dates)                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Branches: create / checkout / rename / delete | branch        | any fixture                 | —        | ✅ (checkout via BranchContext; **create-from-commit** via ⌘K palette, asserted with `git log`; **rename** in `branch-rename.feature`; **delete** — local and remote — via the palette's ref commands, including git's refusal to drop an unmerged branch and the ⌘Z that brings a deleted one back)                                                                                                                                             |
| Branches: set upstream                        | branch        | remote-ahead                | —        | ✅ (**dialog path**, driven through the repoUI `pendingGraphAction` store bridge — same technique `ai-commit-recompose.steps.ts` already uses for its own native-menu-only entry, see `branch-upstream.steps.ts` — asserted via `git config branch.<name>.remote`/`.merge`; the "unambiguous default, no dialog" direct-apply path (`resolveDefaultUpstream`) stays behind the native branch context menu and isn't e2e-driven, see notes below) |
| Compare two branches                          | branch        | remote-ahead                | —        | ✅ (**via the `__e2eRepoUIStore.setCompareRefsTarget` bypass** — the triggering "Compare with…" entry is a native context menu, no ⌘K equivalent exists, see gotchas; asserts the real `compare_refs` backend against known per-file differences, a swap reversing per-file add/delete counts, and re-picking a side through the dialog's own `NativeSelect` — see `compare-branches.feature`)                                                   |
| Tags: create / shown in graph                 | tag           | rollback-history · showcase | —        | ✅ (`tags.feature` tells the whole tag story in one place — **create lightweight + annotated via ⌘K palette**, asserted via `git log`/`git cat-file -t`; the graph ref badge and its context-menu marker; published as one doc page)                                                                                                                                                                                                             |
| Cherry-pick a commit                          | cherry-pick   | feature-branches            | —        | ✅ (**via ⌘K palette**, asserted via `git log` — picks a non-conflicting file addition from another branch)                                                                                                                                                                                                                                                                                                                                      |
| Interactive rebase (reword/squash/drop)       | rebase        | rollback-history            | —        | ✅ (`interactive-rebase.feature` — a real second window on `?window=rebase`, each plan asserted via `git log`/`rev-list` and the file content on disk; see "11. Interactive rebase editor" below)                                                                                                                                                                                                                                                |
| Reset (soft/mixed/hard, RESET confirm)        | rollback      | rollback-history            | —        | ✅ (**soft/mixed/hard incl. RESET-confirm gate, via ⌘K palette**, asserted via `git diff`/`git status`)                                                                                                                                                                                                                                                                                                                                          |
| Revert a commit                               | rollback      | rollback-history            | —        | ✅ (**via ⌘K palette**, asserted via `git log` — reverts the tip commit cleanly)                                                                                                                                                                                                                                                                                                                                                                 |
| Revert a MERGE commit (mainline picker)       | rollback      | showcase                    | —        | ✅ (**via ⌘K palette**, both mainlines, asserted via `git log`/file presence — see "10. Merge commit actions" below)                                                                                                                                                                                                                                                                                                                             |
| Compare a merge commit against parent 1/2     | rollback      | showcase                    | —        | 🟡 (dialog + diff content ✅, but only reachable via a direct store dispatch, not the palette — see "10. Merge commit actions" below)                                                                                                                                                                                                                                                                                                            |
| Stash apply / pop / drop                      | stash         | stash-stack                 | —        | ✅ (**drop/apply/pop ✅ via ⌘K palette**, asserted via `git stash list` / a restored file — apply/pop reset the working tree to a clean HEAD first, see gotchas)                                                                                                                                                                                                                                                                                 |
| Remote: fetch / pull / push                   | remote        | remote-ahead/behind         | —        | ✅ (file-based remote fixtures — fetch badge, pull fast-forward, push publish, rejected non-FF push, new-branch upstream; see `remote-fetch-pull.feature` / `remote-push.feature`. Tag push/delete and remote-branch delete covered too, through the palette — see `tags.feature` / the remote-branch scenario in `remote-push.feature`)                                                                                                         |
| Clone a repo                                  | repo          | seeded picker               | —        | ✅ (`open-repo.feature` — clone via the picker against a local path URL; folder open + init covered the same way. Network clones/credentials stay out of reach)                                                                                                                                                                                                                                                                                  |
| Scan a folder for repos                       | repo          | native                      | —        | 🚫 (native dialog)                                                                                                                                                                                                                                                                                                                                                                                                                               |
| AI commit-message generation                  | AI            | fake HTTP server            | —        | ✅ (streaming + prompt-wiring + cancel + settings dropdown — see "AI generation" below)                                                                                                                                                                                                                                                                                                                                                          |
| GitHub OAuth device flow                      | github        | mock + real call            | —        | ✅ (real device-code request + cancel via Settings; poll contract mocked — see "GitHub OAuth" below)                                                                                                                                                                                                                                                                                                                                             |
| SSH key generate / read                       | ssh           | seed                        | —        | ✅ (generate via Settings → ssh, real `ssh-keygen` against a temp dir — see "3. Settings" above)                                                                                                                                                                                                                                                                                                                                                 |
| Submodule list                                | submodule     | dedicated fixture           | —        | ✅ (`fixture:submodule-repo`, a real `git submodule add`; sidebar row asserted via `SidebarRowView.tsx` — see gotchas for the dead-code detour)                                                                                                                                                                                                                                                                                                  |
| Worktree add / list / remove                  | worktree      | dedicated fixture           | —        | ✅ (list/add/remove + dirty-remove force gate — see "Worktree management" below)                                                                                                                                                                                                                                                                                                                                                                 |
| Themes                                        | settings      | seed                        | 📷       | ✅ (select a built-in theme → `data-theme` applies + persists across reload; single-card snapshot avoids the full-grid reproducibility problem — see "3. Settings")                                                                                                                                                                                                                                                                              |
| Rewards / gamification card                   | rewards       | action-triggered            | 📷       | ✅ (first commit unlocks "First Steps", asserted on the reward card reaching the notch queue — the card itself renders in a second window the suite never lets paint, see `support/notchRecording.ts`; game progress reset via localStorage first — see `rewards.feature`)                                                                                                                                                                       |
| Notifications tray/dropdown                   | notifications | seed                        | —        | ✅ (bell → dropdown shows seeded items + unread badge, mark-all-read, clear-all → empty state; seeded via `git-manager-notifications` localStorage, not the real GitHub-diff pipeline)                                                                                                                                                                                                                                                           |

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

- **The suite shares one app window, and a per-scenario reset is NOT the fix — measured, 2026-08-02.**
  Every spec that fails only in a whole-suite run passes on its own, so the obvious cure is to reset
  the volatile view state between scenarios (the `Before` hook already re-seeds settings and graph
  columns, but not the file explorer, solo mode, commit search, timeline, rebase-view dismissals or
  the Launchpad search — and a leftover Launchpad search filters out the very PR the next feature
  asserts on). That was implemented and **reverted**: adding a single extra `browser.execute` per
  scenario — to call an app-side reset — put the driver into a run-long storm of
  `No window could be found`, taking whole features down that had been green. Moving the call from
  the start of the hook to the end (after three executes that had just succeeded) did not help:
  9 failures over 51 files became 17 window errors over 5. The harness cannot absorb an extra
  driver round-trip per scenario, so a working fix has to ride inside a command the hook already
  issues (e.g. folded into `forceLiveSettings`' own `execute`) rather than adding one. Verified
  separately that this was the reset and not the `main.tsx` window guard shipped in the same build:
  with the reset call removed and the same binary, the same specs run with zero window errors.

- **An action taken in one view may leave another reading stale data — and a step there will
  faithfully assert it.** Found 2026-08-21 driving the board's "create a branch for this card":
  the checkout was real (`rev-parse` proved it on disk) but nothing invalidated the `branches` query,
  so the toolbar still named the previous branch ten seconds later, on the graph. Fixed in the app
  rather than worked around in the suite (`lib/repoRefresh.ts`'s `refreshAfterHeadMove`), and
  `board-card-branch.feature` now asserts the branch indicator across the view switch instead of
  reloading around it. The general shape is what to keep: **a view switch is not a refresh**, and
  `staleTime: 5_000` (`lib/queryClient.ts`) means "recently fetched" beats "the world changed"
  whenever the change came from somewhere that didn't invalidate — so a scenario crossing views is
  where this class of bug surfaces, and it surfaces as a step asserting the old value quite happily.

- **A step that starts an action has to wait for it to land, or the next step acts on the old
  state — and the failure is reported against the wrong feature.** The full run of 2026-08-21 had
  exactly one red scenario, `remote-push.feature`'s "Pushing a brand-new branch configures its
  upstream tracking", and it read like a product regression: the branch was created, checked out and
  pushed, and git had configured no upstream for it. It was the shared "I check out the `<branch>`
  branch" step returning as soon as it had clicked the option: the push that followed ran while HEAD
  was still `main`, so it published `main` — the probe added to that assertion says it plainly
  (`HEAD: feature/tracked`, `main … [origin/main]`, and no `feature/tracked` on the remote). The step
  now polls the branch indicator before returning. Two lessons kept here: **an IPC-backed action is
  not done when the click is dispatched**, and an assertion about git should print what git holds —
  "it never tracked" cannot tell "the push failed" apart from "the push went somewhere else".

- **State kept outside the fixture outlives the fixture.** `fixture_init` wipes the repository and
  nothing else, so anything the app wrote under the run's `$HOME` — the board mirrors under
  `~/.git-manager/boards/`, and any worktree at the `<repo>.worktrees/` sibling path — is still there
  for the next scenario and the next run. That is what makes board recovery testable at all, and it
  is also why a scenario asserting on such state has to clear it first (`board-recovery.steps.ts`),
  and why one that creates a worktree has to remove the destination before asking git for it (a
  leftover directory makes `git worktree add` fail, so the scenario would pass exactly once per
  machine).

- **A step can "find" a control that changed shape under it.** Three of the five silently-broken
  feature files broke this way, all invisible to a testid-existence check:
  - **⌘P is not ⌘K.** `useKeyboardShortcuts` opens the _same_ palette dialog in two modes — ⌘K
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
    `worktree-add-branch-select` testid on its _trigger button_, so `selectByAttribute('value', …)`
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
  the tauri service runs a window-state script in a `beforeCommand` hook — _before every single
  command_ — so anything issued between the assignment and the new document committing runs that
  script against a tearing-down document, which reliably takes the **whole app process** down. That
  surfaces as ECONNREFUSED in some later scenario, nowhere near the cause, and (once the process
  comes back) as an app rehydrated from whatever repo an earlier run last flushed to `localStorage`.
  Even a `getUrl` poll in a `waitUntil` was enough to trigger it. `browser.url()` avoids the whole
  class: the driver owns the navigation and waits for it, so there is no window to send commands
  into. Every in-place navigation in this suite now goes through it (`repo.steps.ts`'s fixture open,
  `merge.steps.ts`'s merge-route step and its `@merge` After hook).
- **`repo-view` being displayed does not mean you're on the repo you just seeded.** The
  fixture-open step seeds `localStorage` and reloads, but `[data-testid="repo-view"]` is equally
  displayed by the document being navigated _away_ from, so the wait can be satisfied before the
  reload lands. A scenario that opens a second fixture on top of the Background's one (the palette
  feature's cherry-pick and stash scenarios) could therefore keep running against the first — and
  since the assertion steps read the repo path back _out of the app_, they'd faithfully shell out to
  `git -C <the-wrong-fixture>` and fail with a baffling "unknown revision". Two fixes, both worth
  keeping: the step now verifies the live store landed on the requested repo (repairing it in place
  via `openTab`/`setActiveRepo` rather than reloading again, which would just re-enter the race), and
  git assertions take their path from `support/activeRepo.ts` — recorded on the Node side when the
  fixture is built — instead of asking the app. **Steps that still read `git-manager-repos-ui` out of
  the app carry the same latent bug**: `rewards`, `tag-menu`, `rebase`, `bisect`, `working-tree`,
  `commit`, `blame-history`.
- **In a real second window, re-assert the window before _every_ interaction.** The same
  `beforeCommand` focus hook follows the OS's active window, so once focus returns to the main app
  window — which it does on its own, e.g. after the merge editor's auto-merge IPC round trip — the
  driver silently switches with it and every later query runs against the main window's document.
  The symptom is not "wrong window" but "the merge editor's buttons vanished": `$$` comes back empty
  with _no_ `merge-*` testid in the document. `merge.steps.ts`'s `ensureMergeWindow()` switches
  unconditionally before each interaction (checking the current handle first is itself a command, so
  "already on it" is never a safe conclusion), and the accept-right loop does its find-and-click
  inside a **single** injected script — split across round-trips, the element gets found in one
  window and read in another (`getElementAttribute` receiving an undefined elementId).
- **Visual snapshots are self-baselining and only meaningful on a re-run.** `apps/e2e/__visual__/`
  is gitignored and `autoSaveBaseline` is on (it's `!process.env.CI`, and there is no CI), so the
  **first** run on any machine writes the baselines and every 📷 assertion passes vacuously; only a
  second run compares anything. That made a whole class of bug self-perpetuating: a snapshot taken
  while a full-viewport cover was up got _saved as the baseline_, and every later run then mismatched
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
  that's also how the card draws its _selected_ state, so suppressing it in CSS erased real chrome
  and made this flakier rather than less. And a scenario must
  **set the state it snapshots** instead of inheriting it. The theme-card scenario used to rely on
  the _previous_ scenario leaving `dark` selected — order-dependent, and racy anyway against the
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
  palette command yet): create-branch/tag from a _multi-selection_ and drag-reorder in the rebase
  editor (the editor itself — reword/squash/drop and running the plan — is now covered, see
  `interactive-rebase.feature`; only its native _triggers_, the ref drag-drop menu and the fixup
  hand-off, stay out of reach). Patch from a multi-selection got a real palette command instead
  (`commit-create-patch-selection`, fed by the graph's `selectedCommitOids` store mirror — see
  command-palette.feature). Other non-menu entry
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
  directly with _no_ dialog when exactly one `origin/<branch>` exists — that branch of
  `onSetUpstream` lives entirely inside the native-menu closure in `useGitGraphActions.ts`/
  `useSidebarBranchMenu.ts` and is never reached without a real menu click, so it stays untested by
  e2e (unit-tested instead, see `branchUpstream.test.ts`). The dialog path e2e drives calls the
  identical `apiSetBranchUpstream` → `set_branch_upstream` backend command either way, which is what
  actually needed proving (the command didn't exist before this feature).
- **"Compare `<branch>` with…"** (graph branch pill / sidebar branch row) is a fourth
  shape: it has no ⌘K equivalent at all (it's about a _pair_ of refs, not a commit/stash action the
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
  be clicked at all. The question this investigation actually answered was narrower: _could the
  confirmation dialog it opens (`DeleteRemoteBranchDialog.tsx`) still be reached by bypassing the
  menu and writing state directly, the way `ai-commit-recompose.steps.ts` already does for
  `recompose` (`window.__e2eRepoUIStore.getState().setPendingGraphAction({ kind: 'recompose', ... })`,
  which `GitGraph.tsx` forwards into its own dialog)?_ The answer is no, and not by omission:
  - The pending state each hook owns (`pendingDeleteRemoteBranch` / `setPendingDeleteRemoteBranch`,
    rendered as two separate `<DeleteRemoteBranchDialog>` instances — one in `GitGraph.tsx`, one in
    `RepoView.tsx`) is **plain `useState`**, not a field on any Zustand store, so
    `window.__e2eRepoUIStore` (or any other `__e2e*Store`, per `main.tsx`'s exposure list) simply
    cannot reach it — confirmed by reading both hooks end to end, not by grepping for its absence.
  - Unlike `recompose`, it is also **not** one of the `GraphCommitAction` kinds `repoUI.store.ts`'s
    `pendingGraphAction` carries, and that is a deliberate exclusion the code already documents, not
    a gap: `graphContextMenus.ts`'s doc comment on `PendingDeleteRemoteBranch` says plainly "unlike
    the graph's other menu-triggered dialogs, this one needs no clicked-commit node to exist in the
    loaded graph page … so it stays outside that shared union." Every kind that _is_ in the union
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
  `FixupCommitWindow`'s buttons (Commit _and_ Cancel) call `getCurrentWindow().close()`, and
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
  issuing _any_ further command while it's still the session's "current" window throws `"no such
window"` — switch to a different, still-alive window **immediately** after triggering a
  self-close, before polling `getWindowHandles()` again. For a window you're done with and don't
  need to interact with further, `browser.closeWindow()` (the native WebDriver command) proved more
  reliable than clicking an in-app close/cancel button that does the same thing — one less
  real-window DOM interaction to hit the click quirk above. `RebasingCommitWindow` (opened as a
  third window by the fixup flow, to squash the new commit into place) is closed this way rather
  than driving its interactive-rebase UI, which is covered separately in its own real second
  window (`interactive-rebase.feature` — see "11. Interactive rebase editor"). **The merge editor's
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
  hasn't appeared _yet_ (React hasn't re-rendered with `isAutoMerging: true` at the moment of the
  check), `reverse: true` reports "not there" immediately and the wait becomes a no-op. A plain
  `browser.pause(1000)` after opening the window and after each wand click proved simpler and
  reliable for this fixture's size — paired with the existing `browser.waitUntil` poll for the
  accept-right buttons themselves as a second safety net.
- **Real remote / network** (fetch/pull/push, clone, GitHub, Ollama) — mock the IPC command
  (`browser.tauri.mock`) rather than standing up a real server, unless doing an integration run.
- **Check a component is actually mounted before adding testids to it** — the sidebar's submodule
  section has _two_ implementations: `SubmodulesSection.tsx` (dead code, only referenced from its
  own test file) and the real one, `SidebarRowView.tsx`'s `case 'submodule':` branch (fed by
  `useSidebarRows.ts`), which is what the app actually renders. Adding testids to the dead one first
  produced a confusing partial result — the section _header_ worked (it's rendered generically by
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
  first fixture script to call `git worktree add`; the linked worktree goes at a _sibling_ path
  (`$FIXTURES_ROOT/worktree-repo-linked`), not a subdirectory of the fixture itself, since git
  refuses/complains about nesting a worktree inside the repo it's linked to. The dirty-remove e2e
  scenario writes directly to a file inside that sibling path _before_ reloading the app (not
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
