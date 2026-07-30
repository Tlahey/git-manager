# Documentation site content plan

The blueprint for what the documentation site ([`apps/docs`](../apps/docs)) should contain,
section by section, page by page. It exists so adding a page is a checklist, not a judgment call:
pick the next unstarted row, tag the scenario, write the prose, capture the screenshot.

This is a **structure document, not prose**. It states what each page must contain and which e2e
scenario proves it — the actual explanations live in the `.feature` files themselves (see
[`apps/docs/README.md`](../apps/docs/README.md) for that pipeline). Update this file whenever the
plan changes: a page's scope changes, a section gets reordered, new coverage is needed. It is
expected to evolve — keep it in sync with [`apps/docs/docs.config.ts`](../apps/docs/docs.config.ts)
(which turns "Section" below into an actual sidebar group) and with issue
[#189](https://github.com/Tlahey/git-manager/issues/189) (which tracks doing the work below).

## How a page maps to this plan

The generator makes one page per `.feature` file and one `##` subsection per `@doc`-tagged
scenario in it (see `renderDocPage.ts`). So:

- **Section** = a sidebar group in `docs.config.ts`.
- **Page** = one `.feature` file, placed in a Section.
- **Sub-part** = one scenario in that file, tagged `@doc` (and `@screenshots` if it exports a
  picture) — becomes one `##` subsection of the page.

## Page template

Every row below follows this shape:

- **Page** — the `.feature` file and its doc title.
  - **Sub-part** — the scenario (existing or new).
    - **Must show**: the minimum a reader needs to walk away with — 3–5 bullets, not prose.
    - **e2e**: `file.feature → "Scenario name"` and its status:
      - ✅ tagged — already `@doc`, page exists.
      - ✴️ tag it — the scenario exists, only needs `@doc` (+ description + screenshot step).
      - 🆕 write it — no scenario exists yet; write the e2e coverage first.

---

## Section: Reading your repository

### Page: The commit graph (`commit-graph.feature`) — ✅ done

- **Sub-part — Read your history at a glance**
  - Must show: one row per commit, lanes for concurrent branches, avatar/subject/SHA/date per
    row, branch/tag pills, the working-tree row as the topmost entry.
  - e2e: `commit-graph.feature → "Read your history at a glance"` — ✅ tagged
- **Sub-part — Inspect a single commit**
  - Must show: selecting a row opens the details panel (message, author, committer, parents,
    files); clicking a file shows that commit's diff; right-click opens commit actions.
  - e2e: `commit-graph.feature → "Inspect a single commit"` — ✅ tagged

### Page: File blame and history (`blame-history.feature`) — ✅ done

- **Sub-part — See who changed what, line by line**
  - Must show: switching a file's diff to File view, enabling blame mode, the avatar + commit
    name annotation per line, and that it's read from real `git blame`, not a guess.
  - e2e: `blame-history.feature → "The File view shows blame avatars in the gutter"` — ✅ tagged
- **Sub-part — Browse a file's older versions**
  - Must show: opening file history from the diff view, the version list, selecting an older
    version to see its diff.
  - e2e: `blame-history.feature → "Selecting a history version shows that version in the diff"` — ✅ tagged

### Page: Git bisect (`bisect.feature`) — ✅ done

- **Sub-part — Find the commit that broke something**
  - Must show: starting a bisect from the tools menu by picking a good/bad commit range in the
    graph, marking each step good/bad, and landing on the culprit commit without leaving the app.
  - e2e: `bisect.feature → "Running a bisect converges on the first bad commit"` — ✅ tagged

---

## Section: Making changes

### Page: Working tree staging (`working-tree.feature`) — ✅ done

- **Sub-part — Decide what goes into the next commit**
  - Must show: the working-tree row swaps in the staging panel; staged vs. unstaged groups;
    moving a file (or the whole group) between them is reversible and doesn't touch disk.
  - e2e: `working-tree.feature → "Decide what goes into the next commit"` — ✅ tagged
- **Sub-part — Read a file's diff before you stage it**
  - Must show: clicking a file in either group opens its diff; review before staging.
  - e2e: `working-tree.feature → "Read a file's diff before you stage it"` — ✅ tagged

### Page: Committing (`commit.feature`) — ✅ done

- **Sub-part — Write the commit**
  - Must show: writing a message for the staged changes and confirming records a new HEAD commit
    the graph immediately reflects.
  - e2e: `commit.feature → "Committing the staged changes records a new HEAD commit"` — ✅ tagged

---

## Section: When Git gets in the way

### Page: Three-way merge editor (`merge-editor.feature`) — ✅ done

- **Sub-part — Resolve a conflict block by block**
  - Must show: opening a conflicted file from the graph's conflict panel; "Apply non-conflicting
    changes" for the parts only one side touched; picking a side (or typing the answer) for real
    conflicts; the apply button stays disabled until every block has an outcome.
  - e2e: `merge-editor.feature → "Resolve a conflicted file block by block"` — ✅ tagged

### Page: Rebase conflicts (`rebase-conflict.feature`) — ✴️ tag it

- **Sub-part — A paused rebase surfaces itself**
  - Must show: a paused rebase auto-opens the conflict resolution panel (you don't go hunting for
    it); the panel offers continue, skip, or abort.
  - e2e: `rebase-conflict.feature → "A paused rebase auto-opens the conflict resolution panel"` — ✴️ tag it

### Page: Rebase progress (`rebase-progress.feature`) — ✴️ tag it

- **Sub-part — See where you are in a multi-step rebase**
  - Must show: the step rail (replayed / paused / still ahead); the graph banner that brings the
    progress view back after it's hidden; continuing advances to the next step.
  - e2e: `rebase-progress.feature → "A paused rebase takes over the content view with its step rail"` — ✴️ tag it

### Page: Fixup & autosquash (`fixup-autosquash.feature`) — ✴️ tag it

- **Sub-part — Clean up history before pushing**
  - Must show: the pending-fixups banner when `fixup!` commits exist; the autosquash preview
    grouping each fixup with its target; running it rewrites history in one action.
  - e2e: `fixup-autosquash.feature → "The preview groups the two fixup!/target pairs"` — ✴️ tag it

---

## Section: Branches, stashes & worktrees

### Page: Stashing changes (`stash-stack.feature`) — ✴️ tag it

- **Sub-part — Find and restore a stash**
  - Must show: stashes listed in the sidebar; applying/popping/dropping a stash from the command
    palette (there's no separate "stash panel").
  - e2e: `stash-stack.feature → "The sidebar lists the stashed changes"` — ✴️ tag it
  - e2e (apply/drop, already written, unused so far): `command-palette.feature → "Applying a stash via the palette keeps it but restores its changes"` — ✴️ tag it

### Page: Worktrees (`worktree.feature`) — ✴️ tag it

- **Sub-part — Work across branches at once**
  - Must show: linked worktrees listed in the sidebar; adding one from a branch; removing one
    (and that a dirty worktree requires an explicit force).
  - e2e: `worktree.feature → "Adding a new worktree"` — ✴️ tag it

### Page: Submodules (`submodule.feature`) — ✴️ tag it

- **Sub-part — See a repo's submodules**
  - Must show: real git submodules listed in their own sidebar section.
  - e2e: `submodule.feature → "The sidebar lists a real git submodule"` — ✴️ tag it

### Page: Detached HEAD (`detached-head.feature`) — ✴️ tag it

- **Sub-part — Know when you're not on a branch**
  - Must show: the toolbar reading "HEAD" instead of a branch name while detached; checking out a
    branch returns to the normal state.
  - e2e: `detached-head.feature → "The toolbar shows HEAD instead of a branch name"` — ✴️ tag it

### Page: Undo / redo (`undo-redo.feature`) — ✴️ tag it

- **Sub-part — Move HEAD back and forth without fear**
  - Must show: ⌘Z undoes a branch checkout or reset, ⌘⇧Z redoes it; the branch indicator / HEAD
    commit reflects each step.
  - e2e: `undo-redo.feature → "Undoing a checkout returns to the previous branch and redo re-applies it"` — ✴️ tag it

---

## Section: Syncing with remotes

Every page in this section is 🆕: **no e2e scenario exists yet** for push, pull, fetch, remote
management, or branch/tag creation outside the command palette. Write the coverage before tagging
anything.

### Page: Fetch & pull — 🆕 write it

- **Sub-part — Bring your branch up to date**
  - Must show: fetch vs. pull from the toolbar, what changes in the graph/sidebar afterward.
  - e2e: 🆕 write it (no feature file covers remote fetch/pull today)

### Page: Push — 🆕 write it

- **Sub-part — Publish your commits**
  - Must show: pushing from the toolbar, upstream tracking being set for a new branch, what a
    rejected (non-fast-forward) push looks like.
  - e2e: 🆕 write it

### Page: Branches & tags — 🆕 write it

- **Sub-part — Create, checkout, delete**
  - Must show: creating a branch (from the toolbar, not just the palette), checking one out,
    deleting one, and the same for tags (lightweight vs. annotated).
  - e2e: 🆕 write it (the palette-driven creation in `command-palette.feature` is a secondary
    entry point, not this page's primary path)

---

## Section: AI features

### Page: AI commit messages (`ai-generation.feature`) — ✴️ tag it

- **Sub-part — Draft a commit message from staged changes**
  - Must show: generating a message streams in live; a generation can be cancelled cleanly.
  - e2e: `ai-generation.feature → "Generating a commit message streams the response and sends the package instruction"` — ✴️ tag it
- **Sub-part — Split changes into a commit plan**
  - Must show: generating grouped commit batches proposes a reviewable plan; accepting it applies
    the commits as proposed.
  - e2e: `ai-generation.feature → "Generating commit batches proposes a reviewable plan and applies the accepted commits"` — ✴️ tag it

### Page: Daily summary (`daily-summary.feature`) — ✴️ tag it

- **Sub-part — A morning briefing per project**
  - Must show: opening the launchpad auto-generates a briefing for a project with none yet;
    with auto-generation off, it's produced on demand instead.
  - e2e: `daily-summary.feature → "Opening the launchpad auto-generates the morning briefing for an open project"` — ✴️ tag it

---

## Section: Workflow tools

### Page: Command palette (`command-palette.feature`) — ✴️ tag it

- **Sub-part — Run any action without the menus**
  - Must show: ⌘K opens it; it offers global actions and commit-scoped actions (reset, revert,
    branch, tag, cherry-pick) for whatever commit is selected.
  - e2e: `command-palette.feature → "Resetting to an earlier commit from the palette"` — ✴️ tag it

### Page: Settings (`settings.feature`) — ✴️ tag it

- **Sub-part — Configure the app**
  - Must show: the sections available (general, AI, notifications, SSH, appearance/themes); that
    settings persist across a reload.
  - e2e: `settings.feature → "Selecting a built-in theme applies it and persists across a reload"` — ✴️ tag it

### Page: Notifications (`notifications.feature`) — ✴️ tag it

- **Sub-part — Track PR activity from the bell**
  - Must show: the bell's unread count and notification list; marking all read; clearing them.
  - e2e: `notifications.feature → "Opening the bell shows the seeded notifications and unread count"` — ✴️ tag it

---

## Explicitly out of scope

Regression/infrastructure-only feature files with no end-user "how do I…" content of their own:
`app-launch.feature`, `command-mocking.feature`, `tag-context-menu.feature`. `rewards.feature`
(achievement toasts) is a maybe — fun but marginal, left for a human call when the rest of this
plan is done.
