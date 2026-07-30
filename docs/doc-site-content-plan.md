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
      - 🚫 blocked/not achievable — architecturally unreachable from e2e today (a direct `fetch()`
        bypassing Tauri's mockable `invoke()`, or a native-OS-only entry point) — not a TODO, a
        documented limit. Note *why*, and whether it's a permanent limit or an infra gap that would
        unblock it (see "Pull requests inside the graph" for the latter kind).

This file was last swept end-to-end on 2026-07-30 against `apps/e2e/features/*.feature` (26 files)
and `packages/ai`'s 13 shipped feature descriptors (`docs/ai/README.md`'s table). Every row marked
🆕 below has no scenario yet — it is backlog, not a claim that the page exists.

---

## Section: Getting started

### Page: Opening a repository (`open-repo.feature`) — 🆕 write it

- **Sub-part — Three ways in**
  - Must show: the New Tab page's three entry points (open an existing folder, clone a remote URL,
    `git init` a new one), and that a repo already open in another tab is focused instead of
    duplicated.
  - e2e: `open-repo.feature → "Opening a folder that is already a git repository"` — 🆕 write it
- **Sub-part — Jump back into recent work**
  - Must show: the recent-repos list on the New Tab page, and that picking one opens it straight into
    its last state.
  - e2e: `open-repo.feature → "Picking a recent repository reopens it"` — 🆕 write it

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

### Page: The repository sidebar (`sidebar-navigation.feature`) — 🆕 write it

- **Sub-part — Find a branch fast**
  - Must show: the search box filters the branch/tag/stash/worktree tree live; "solo mode" (the
    focus toggle) narrows the graph to just the searched branch; clearing the search restores the
    full tree.
  - e2e: `sidebar-navigation.feature → "Searching the sidebar filters and can solo a branch"` — 🆕
    write it
- **Sub-part — Keep your important branches at the top**
  - Must show: pinning/unpinning a branch from its row moves it into (or out of) the pinned group at
    the top of the tree, and the pin survives a reload.
  - e2e: `sidebar-navigation.feature → "Pinning a branch keeps it pinned across a reload"` — 🆕 write
    it

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

### Page: Rebase conflicts (`rebase-conflict.feature`) — ✅ done

- **Sub-part — A paused rebase surfaces itself**
  - Must show: a paused rebase auto-opens the conflict resolution panel (you don't go hunting for
    it); the panel offers continue, skip, or abort.
  - e2e: `rebase-conflict.feature → "A paused rebase auto-opens the conflict resolution panel"` — ✅ tagged

### Page: Rebase progress (`rebase-progress.feature`) — ✅ done

- **Sub-part — See where you are in a multi-step rebase**
  - Must show: the step rail (replayed / paused / still ahead); the graph banner that brings the
    progress view back after it's hidden; continuing advances to the next step.
  - e2e: `rebase-progress.feature → "A paused rebase takes over the content view with its step rail"` — ✅ tagged

### Page: Fixup & autosquash (`fixup-autosquash.feature`) — ✅ done

- **Sub-part — Clean up history before pushing**
  - Must show: the pending-fixups banner when `fixup!` commits exist; the autosquash preview
    grouping each fixup with its target; running it rewrites history in one action.
  - e2e: `fixup-autosquash.feature → "The preview groups the two fixup!/target pairs"` — ✅ tagged

---

## Section: Branches, stashes & worktrees

### Page: Stashing changes (`stash-stack.feature`) — ✅ done

- **Sub-part — Find and restore a stash**
  - Must show: stashes listed in the sidebar; applying/popping/dropping a stash from the command
    palette (there's no separate "stash panel").
  - e2e: `stash-stack.feature → "The sidebar lists the stashed changes"` — ✅ tagged
  - e2e (apply/drop): `command-palette.feature → "Applying a stash via the palette keeps it but restores its changes"` — ✅ tagged (renders on the
    Command palette page, not this one — see "How a page maps to this plan" above)

### Page: Worktrees (`worktree.feature`) — ✅ done

- **Sub-part — Work across branches at once**
  - Must show: linked worktrees listed in the sidebar; adding one from a branch; removing one
    (and that a dirty worktree requires an explicit force).
  - e2e: `worktree.feature → "Adding a new worktree"` — ✅ tagged

### Page: Submodules (`submodule.feature`) — ✅ done

- **Sub-part — See a repo's submodules**
  - Must show: real git submodules listed in their own sidebar section.
  - e2e: `submodule.feature → "The sidebar lists a real git submodule"` — ✅ tagged

### Page: Detached HEAD (`detached-head.feature`) — ✅ done

- **Sub-part — Know when you're not on a branch**
  - Must show: the toolbar reading "HEAD" instead of a branch name while detached; checking out a
    branch returns to the normal state.
  - e2e: `detached-head.feature → "The toolbar shows HEAD instead of a branch name"` — ✅ tagged

### Page: Undo / redo (`undo-redo.feature`) — ✅ done

- **Sub-part — Move HEAD back and forth without fear**
  - Must show: ⌘Z undoes a branch checkout or reset, ⌘⇧Z redoes it; the branch indicator / HEAD
    commit reflects each step.
  - e2e: `undo-redo.feature → "Undoing a checkout returns to the previous branch and redo re-applies it"` — ✅ tagged

---

## Section: Syncing with remotes — ✅ done

E2e coverage exists for fetch/pull, push, and toolbar branch creation, backed by two new fixtures
(`remote-behind`, `remote-ahead`) that clone a real bare "origin" repo — the first case of any
fixture in this repo exercising a genuine local git remote. Building it required adding
`data-testid`s to the toolbar's Fetch/Pull/Push/Branch buttons (none existed before) and fixing
`ToolbarButton` (`packages/components`), which silently dropped a `data-testid` prop passed to it
— dead on the 4 pre-existing call sites (Undo/Redo/Timeline/Stash) until this PR.

Three things surfaced while building this were out of scope to fix inline — filed as their own
issues rather than worked around silently:
- [#194](https://github.com/Tlahey/git-manager/issues/194) (fixed): a rejected push's toast showed
  raw backend error JSON (`{"code":"GIT_ERROR",...}`) instead of a readable message — a systemic
  pattern (~50 call sites), not push-specific. Fixed by unwrapping `AppError`'s JSON into a plain
  message at the `invoke()` chokepoint (`lib/tauri.ts`); the toast is now a real English sentence,
  though still relays some libgit2 wording (`class=Reference (4); code=NotFastForward (-11)`) — not
  a further blocker for this page, just not maximally polished.
- [#195](https://github.com/Tlahey/git-manager/issues/195) (fixed): pushing a brand-new local
  branch never configured upstream tracking, so its ahead/behind indicator never lit up. Fixed in
  `git_remote.rs`'s `push()`. Not screenshot-able either way — a freshly-pushed, up-to-date branch
  shows the same empty ahead/behind badge whether or not an upstream is configured — so it's
  covered by a plain (untagged) e2e scenario reading `branch.<name>.remote`/`.merge` from git config
  directly, in `remote-push.feature`.
- Branch **deletion** and **tag creation** have no toolbar entry point at all — both are
  native-macOS-menu-only (see `tag-context-menu.feature`'s own note on that being unscriptable) or
  command-palette-only (already covered). Not a bug, just outside what "the toolbar" can mean for
  those two operations.

### Page: Fetch & pull (`remote-fetch-pull.feature`) — ✅ done

- **Sub-part — Bring your branch up to date**
  - Must show: fetch vs. pull from the toolbar, what changes in the graph/sidebar afterward.
  - e2e: `remote-fetch-pull.feature → "Pulling brings your branch up to date"` — ✅ tagged

### Page: Push (`remote-push.feature`) — ✅ done

- **Sub-part — Publish your commits**
  - Must show: pushing from the toolbar, what a rejected (non-fast-forward) push looks like.
  - e2e: `remote-push.feature → "Pushing publishes your commits to the remote"` — ✅ tagged (the
    clean fast-forward case)
  - e2e: `remote-push.feature → "A rejected push reports the conflict instead of silently
    failing"` — ✅ tagged, now that [#194](https://github.com/Tlahey/git-manager/issues/194) is fixed
  - Upstream tracking on a fresh push: not screenshot-able (see note above) — proven by the plain
    e2e scenario `remote-push.feature → "Pushing a brand-new branch configures its upstream
    tracking"` instead, now that [#195](https://github.com/Tlahey/git-manager/issues/195) is fixed.

### Page: Branches & tags (`branch-create.feature`) — ✅ done (toolbar scope only)

- **Sub-part — Create, checkout**
  - Must show: creating a branch from the toolbar, checking it out.
  - e2e: `branch-create.feature → "Creating a branch from the toolbar and checking it out"` — ✅
    tagged
- **Sub-part — Delete, and the same for tags** — 🚫 not achievable from the toolbar: branch
  deletion and tag creation are native-macOS-menu-only or command-palette-only (already covered in
  `command-palette.feature`). Nothing to write here.

---

## Section: Tools — patches & package health

Both pages live behind the toolbar's Tools (wrench) menu (`ToolsMenu.tsx`), alongside the bisect
entry already documented above — see "Scope notes" at the end of this file for why the menu itself
doesn't get a page.

### Page: Patch workflows (`patch-workspace.feature`) — 🆕 write it

- **Sub-part — Create a patch from your working tree**
  - Must show: opening Tools → Patch → Create, moving files into the patch's staged zone (reusing
    the same two-zone list as WIP staging), and saving the result as a `.patch` file.
  - e2e: `patch-workspace.feature → "Creating a patch from the working tree"` — 🆕 write it
- **Sub-part — Apply an external patch**
  - Must show: opening Tools → Patch → Apply, picking a `.patch`/`.diff` file, previewing the files
    it touches and their diffs, and applying it to the working tree.
  - e2e: `patch-workspace.feature → "Applying an external patch file"` — 🆕 write it
- **Sub-part — Patch a single dependency**
  - Must show: opening Tools → Patch → Dependency, picking a package under `node_modules`, and
    committing a patch limited to that one dependency.
  - e2e: `patch-workspace.feature → "Patching a single node_modules dependency"` — 🆕 write it

### Page: Package health checks (`package-health.feature`) — 🆕 write it

- **Sub-part — Run a health check on your dependencies**
  - Must show: Tools → Health Check (only enabled in a repo with a package manifest), the report's
    package/dependency counts and per-check pass/fail badges.
  - e2e: `package-health.feature → "Running a health check reports package and dependency counts"` —
    🆕 write it
- **Sub-part — Assess an upgrade before taking it**
  - Must show: opening the pending-updates list, expanding one to fetch its real changelog, and the
    AI-backed risk badge (low/medium/high) that cross-references the release notes against this
    repo's own import sites — labelled advisory, never a merge gate.
  - e2e: `package-health.feature → "An outdated package's upgrade risk is shown with its changelog"`
    — 🆕 write it — see [docs/ai/README.md](../docs/ai/README.md) for why this one AI feature isn't
    listed under "AI features" below: it's package-health-specific, not general-purpose.

---

## Section: AI features

`docs/ai/README.md` lists 13 shipped feature descriptors; only 2 of them (commit message + file
grouping, both in `ai-generation.feature`, plus daily summary) have doc-site coverage today. The
pages below close that gap — each row names the descriptor it renders so the mapping to
`docs/ai/*.md` stays traceable. All of them are driveable against the fake AI test server the way
`ai-generation.feature`/`daily-summary.feature` already are — no real model required.

Both of the already-done pages below were blocked on [#192](https://github.com/Tlahey/git-manager/issues/192) (the fake
AI test server was missing a response case for the `commit_message` schema — fixed by adding it).
Tagging `daily-summary.feature` also surfaced a second, separate issue: its only fixture
(`stash-stack`) has a single commit dated at fixture-build time ("today"), while the feature's
default window is the *previous working day* — so the fixture never had anything in the window
regardless of the schema fix. A brand-new `daily-summary` fixture
(`tools/git-fixtures/scenarios/daily-summary.sh`) computes that target day in bash (mirroring
`previousWorkingDayKey()`'s Monday/Sunday special cases) and back-dates its commit to land inside
it — with a second, much-older baseline commit first, since a lone root commit is its own diff
range base (`base_oid == head_oid`) and would otherwise report an empty day despite having a real
commit in the window.

### Page: AI commit messages (`ai-generation.feature`) — ✅ done

- **Sub-part — Draft a commit message from staged changes**
  - Must show: generating a commit message summarizes every staged file before composing one from
    all of them; the same button cancels a stuck generation.
  - e2e: `ai-generation.feature → "Generating a commit message summarizes every staged file, then drafts one from all of them"` — ✅ tagged
    (the prompt-content assertions that used to live on this scenario — and a stale one asserting a
    removed "Suggested scope:" line from before the map/reduce refactor — now live on their own
    plain scenario, `"Generating a commit message sends the map-then-compose prompt"`, keeping the
    doc-tagged scenario's visible steps user-facing only)
- **Sub-part — Split changes into a commit plan**
  - Must show: generating grouped commit batches proposes a reviewable plan; accepting it applies
    the commits as proposed.
  - e2e: `ai-generation.feature → "Generating commit batches proposes a reviewable plan and applies the accepted commits"` — ✅ tagged

### Page: Daily summary (`daily-summary.feature`) — ✅ done

- **Sub-part — A morning briefing per project**
  - Must show: opening the launchpad auto-generates a briefing for a project with none yet;
    with auto-generation off, it's produced on demand instead.
  - e2e: `daily-summary.feature → "Opening the launchpad auto-generates the morning briefing for an open project"` — ✅ tagged
  - Note: this scenario's wording ("the launchpad") predates the Pull Requests hub also being
    called "Launchpad" in the app's footer — see the Dashboard section below, and the scope note at
    the end of this file, before renaming either.

### Page: Recomposing a commit message (`ai-commit-recompose.feature`) — 🆕 write it

- **Sub-part — Rewrite a past commit's message from what it actually changed**
  - Must show: right-click a commit → *Rewrite this commit's message (LLM)*; the generated message
    shown for review before it's applied; applying it rewrites history (same caveats as any other
    message-only rewrite — descendant SHAs change).
  - e2e: `ai-commit-recompose.feature → "Recomposing a commit's message from its diff"` — 🆕 write it
  - Descriptor: `commit-recompose.md`

### Page: Explaining what changed (`ai-explanation.feature`) — 🆕 write it

Three of the four sub-parts below share one instruction and one temperature, discriminated by scope
(`packages/ai`'s `summaryExplanationFeature`, per [CLAUDE.md](../CLAUDE.md)); the fourth
(`change-explanation.md`) is a related-but-separate descriptor for a single pending file. Grouped on
one page because a reader who finds one "Explain (LLM)" entry point has effectively found all four.

- **Sub-part — Explain one commit, beyond its message**
  - Must show: right-click a commit → *Explain this commit (LLM)*; the right panel's streamed
    explanation, remembered so reopening the panel doesn't regenerate it.
  - e2e: `ai-explanation.feature → "Explaining a single commit"` — 🆕 write it
  - Descriptor: `commit-explanation.md`
- **Sub-part — Explain a whole branch**
  - Must show: right-click a branch (or a commit) → *Explain branch changes (LLM)*; the explanation
    is remembered per branch.
  - e2e: `ai-explanation.feature → "Explaining a branch's changes"` — 🆕 write it
  - Descriptor: `branch-explanation.md`
- **Sub-part — Explain everything you haven't committed yet**
  - Must show: right-click the WIP row → *Explain working changes (LLM)*; the summary covers every
    uncommitted file, not just the one you have open.
  - e2e: `ai-explanation.feature → "Explaining all uncommitted changes"` — 🆕 write it
  - Descriptor: `working-explanation.md`
- **Sub-part — Explain one file's pending diff**
  - Must show: the *Explain* button above the diff editor on a working-copy file; the explanation is
    read against the file's own content, not just the patch.
  - e2e: `ai-explanation.feature → "Explaining one file's pending diff"` — 🆕 write it
  - Descriptor: `change-explanation.md`

### Page: AI code review (`ai-code-review.feature`) — 🆕 write it

- **Sub-part — Get a second opinion on your working changes**
  - Must show: right-click the WIP row → *Review changes (LLM)*; the right panel's review flags
    what deserves a second look — this is the one AI feature the app explicitly lets have an
    opinion (every explanation feature above is told not to).
  - e2e: `ai-code-review.feature → "Reviewing the working changes"` — 🆕 write it
- **Sub-part — Review a whole branch before opening a PR**
  - Must show: right-click a branch/commit → *Review branch changes (LLM)*, same panel, range-diff
    input instead of the working tree.
  - e2e: `ai-code-review.feature → "Reviewing a branch's range diff"` — 🆕 write it
  - Descriptor: `code-review.md`

### Page: Drafting a PR description (`ai-pr-description.feature`) — 🆕 write it

- **Sub-part — Fill the PR body from your branch's commits**
  - Must show: opening the PR create form for a branch, generating fills the description from that
    branch's per-file summaries and commit list, and the field stays editable afterward — this is
    the one generation feature that fills a template meant to be published, unlike the explanations.
  - e2e: `ai-pr-description.feature → "Generating a PR description from a branch's commits"` — 🆕
    write it — only needs the form open and the Generate button clicked, not an actual PR
    submission; submitting is a GitHub mutation, out of scope the same way Launchpad's PR/issue
    mutations are (see that section).
  - Descriptor: `pr-description.md`

### Page: Semantic commit search (`ai-commit-search.feature`) — 🆕 write it

- **Sub-part — Ask a question, get an answer read from real commits**
  - Must show: opening the panel from the AI menu (or ⇧⌘F), asking something like "has the button
    component changed recently?", and an answer citing the specific commits it came from — the
    point being this finds commits by what they *did*, not what they were *named*.
  - e2e: `ai-commit-search.feature → "Answering a question from the commit history"` — 🆕 write it
  - **Sub-note — the two scan modes**: quick mode narrows by commit message then by file before
    reading any diff; full mode reads every file of every commit in the window. Worth a second,
    untagged (non-`@doc`) regression scenario rather than a second doc subsection — the visible
    result (a cited answer) looks the same either way.
  - Descriptor: `commit-search.md`

### Page: Summary search (`ai-summary-search.feature`) — 🆕 write it

- **Sub-part — Ask your own archive of daily briefings**
  - Must show: the question box on the Dashboard's Summaries tab; an answer that cites which
    archived days it rests on.
  - e2e: `ai-summary-search.feature → "Answering a question from archived daily briefings"` — 🆕
    write it
  - Descriptor: `summary-search.md`. Depends on the Dashboard section below for the Summaries tab
    it lives in.

### Page: Behind the scenes — the Action Journal (`action-journal.feature`) — 🆕 write it

- **Sub-part — Learn what git-manager actually ran**
  - Must show: opening the journal (footer 🎓 button, or the command palette), picking a recent
    action (e.g. "Commit the staged changes"), and the plain-English explanation of the git
    command(s) it ran — the one AI feature about the app's own behaviour, not the repository's
    contents, so it needs no git data at all.
  - e2e: `action-journal.feature → "Explaining the commands behind a recent action"` — 🆕 write it
  - Descriptor: `action-explanation.md`. Distinct from the Activity Log page (Workflow tools
    section below), which is the same underlying log read by a debugger instead of a learner — see
    the scope note at the end of this file.

---

## Section: The Dashboard

### Page: Your projects at a glance (`dashboard.feature`) — 🆕 write it

- **Sub-part — Organize the repos you work in**
  - Must show: project sections/cards, pinning a project, and that opening a card's project focuses
    (or opens) its tab; the right pane per project toggles between its README and its AI daily
    briefing.
  - e2e: `dashboard.feature → "Pinning a project keeps it at the top of the dashboard"` — 🆕 write it
  - The AI briefing itself is already covered by `daily-summary.feature` above — this page is the
    dashboard shell around it (sections, cards, pinning, scanning), not the briefing's content.
  - Naming note: this page and `daily-summary.feature`'s existing wording both call this screen "the
    launchpad" (footer button: `footer.dashboard` labelled "Dashboard"). The **Launchpad** section
    below is a different screen — the Pull Requests hub, labelled "Launchpad" in the same footer
    (`footer.launchpad`). Resolve the naming collision (rename one of the two in code/i18n, or in
    this plan) before both pages ship, rather than publishing two "Launchpad" pages.

---

## Section: The Launchpad — pull requests & issues

The Launchpad (`PullRequestsPage.tsx`, footer "Launchpad" button) has zero e2e or doc coverage today
despite being one of the largest pages in the app. The key fact that makes it tractable: `useGitHubData()`
falls back to deterministic mock data (`apps/desktop/src/app/pull-requests/mockData.ts`) whenever no
GitHub account is configured, so every *read* surface below (KPIs, tabs, heatmap, PR/issue lists and
detail panels) is fully drivable with **no GitHub OAuth and no live token** — the same posture as
every other fixture in this suite. What isn't drivable: anything that calls `api.github.com` directly
from the frontend (`apps/desktop/src/api/github.api.ts` — merging a PR, posting a comment/review,
setting draft status, creating/updating an issue) bypasses Tauri's `invoke()` entirely, so it's
outside `command-mocking.feature`'s mocking mechanism too. Those actions are marked 🚫 below rather
than 🆕 — viewing is in scope, mutating a real GitHub repo from a test is not.

### Page: Your pull requests (`launchpad-prs.feature`) — 🆕 write it

- **Sub-part — See what needs your attention**
  - Must show: the KPI bar; the My PRs / WIP / Waiting-for-review tabs; that each is a live filter
    over the same underlying PR list, not a separate fetch.
  - e2e: `launchpad-prs.feature → "The tabs split PRs into mine, in progress, and waiting on me"` —
    🆕 write it
- **Sub-part — Open a PR without leaving the app**
  - Must show: selecting a PR row opens its side panel (description, checks, review status);
    reading it is fully covered by mock data.
  - e2e: `launchpad-prs.feature → "Selecting a PR opens its detail panel"` — 🆕 write it
  - 🚫 out of scope: merging, commenting, requesting review, or toggling draft status — these call
    `api.github.com` directly from the frontend, unreachable from Tauri's mock bridge.

### Page: Follow, snooze & save views (`launchpad-organize.feature`) — 🆕 write it

- **Sub-part — Follow a PR you don't own**
  - Must show: the Follow dialog, and that a followed PR appears in its own tab afterward.
  - e2e: `launchpad-organize.feature → "Following a PR adds it to the Followed tab"` — 🆕 write it
- **Sub-part — Snooze a PR until later**
  - Must show: snoozing a PR from its row moves it to the Snoozed tab until the snooze expires.
  - e2e: `launchpad-organize.feature → "Snoozing a PR moves it to the Snoozed tab"` — 🆕 write it
- **Sub-part — Save a filtered view**
  - Must show: building a filter in the filter editor, saving it as a custom view, and that the
    view persists (reload keeps it).
  - e2e: `launchpad-organize.feature → "Saving a custom filtered view persists it across a reload"`
    — 🆕 write it

### Page: Issue triage (`launchpad-issues.feature`) — 🆕 write it

- **Sub-part — Browse and open issues from the Launchpad**
  - Must show: the Issues tab's list, opening an issue's side panel.
  - e2e: `launchpad-issues.feature → "Selecting an issue opens its detail panel"` — 🆕 write it
  - 🚫 out of scope: changing issue state, editing, or creating an issue — same direct-`fetch()`
    limitation as PR mutations above.

### Page: Your contribution activity (`launchpad-commit-stats.feature`) — 🆕 write it

- **Sub-part — See your commit activity as a heatmap**
  - Must show: the Commit Stats tab's year heatmap and summary numbers, backed by mock contribution
    data when no token is configured.
  - e2e: `launchpad-commit-stats.feature → "The commit stats tab shows a year of activity"` — 🆕
    write it

### Page: Pull requests inside the graph (`pr-graph.feature`) — 🚫 blocked (see note)

A second, separate PR surface lives in `apps/desktop/src/components/git-graph/pr/` (~35 files:
`PrCreateCenter`, `PrDetailCenter`, `PrMergeButton`, `PrReviewComposer`, `PrChecksBox`, …) — this is
the center-pane takeover for *your current branch's* PR (create one, or view/merge/review the one
that already exists), as opposed to the Launchpad's browse-everything list above. It does not share
the Launchpad's mock-data escape hatch: `usePrDetail` (`apps/desktop/src/hooks/usePrDetail.ts`) only
fires its fetch when a real `token` is present — no `hasToken`-false fallback the way
`useGitHubData` has one. So, unlike every Launchpad page above:

- **Sub-part — Publish your branch as a pull request**
  - Must show: opening the create form for the current branch, base-branch picker, the AI-generated
    description (already covered by `ai-pr-description.feature` above) filling the body, publishing.
  - e2e: `pr-graph.feature → "Publishing a branch as a pull request"` — 🚫 blocked: the form itself
    renders without a token, but `createPullRequest` is a direct `fetch()` to `api.github.com`
    (`api/github.api.ts`), the same limitation as every other Launchpad mutation above.
- **Sub-part — View, merge or review a PR without leaving the graph**
  - Must show: `PrDetailCenter`'s description/checks/comments/merge button for the branch's own PR.
  - e2e: `pr-graph.feature → "Viewing the current branch's pull request in the graph"` — 🚫 blocked:
    `usePrDetail` needs a live token to fetch at all, so even *reading* this page (not just
    mutating) is unreachable from a deterministic e2e run today. Giving `usePrDetail` the same
    mock-fallback pattern `useGitHubData` already has would unblock the read-only half of this page
    without needing real network access — worth raising as its own follow-up rather than working
    around it silently here.

---

## Section: Rewards & progress

Achievements are driven by a 27-entry catalog (`apps/desktop/src/stores/achievements.json`) reacting
to real app events (`appEventBus` → `game.store.ts`) — nothing here needs GitHub or a fixture beyond
what the triggering action already needs (e.g. committing, for the first-commit achievement already
covered below).

### Page: Achievements (`rewards.feature`) — ✴️ tag it (existing scenario) + 🆕 (new sub-part)

- **Sub-part — Unlock an achievement**
  - Must show: performing a tracked action (e.g. your first commit) pops a trophy toast naming the
    achievement.
  - e2e: `rewards.feature → "Making your first commit unlocks the \"Premier Pas\" achievement"` —
    ✴️ tag it (scenario exists, untagged; needs `@doc` + description + screenshot step, and
    `Given the app language is English` per the doc pipeline's convention)
- **Sub-part — Browse your trophy cabinet**
  - Must show: the Launchpad's Rewards tab — level/rank, trophy counts by tier (bronze/silver/
    gold/platinum), and the filterable achievement grid (locked vs. unlocked).
  - e2e: `rewards.feature → "The Rewards tab shows unlocked and locked achievements"` — 🆕 write it

---

## Section: Workflow tools

### Page: Command palette (`command-palette.feature`) — ✅ done

- **Sub-part — Run any action without the menus**
  - Must show: ⌘K opens it; it offers global actions and commit-scoped actions (reset, revert,
    branch, tag, cherry-pick) for whatever commit is selected.
  - e2e: `command-palette.feature → "Resetting to an earlier commit from the palette"` — ✅ tagged

### Page: Settings (`settings.feature`)

`SettingsPage.tsx` has more surface than the one already-tagged sub-part below shows: a top-level
**Global vs. Repository** split (`Scope = 'general' | 'local'`), eleven global sections, a settings
search box, and two more scenarios already sitting untagged in the feature file. The Global/Repository
override *mechanic* itself is meaty enough to get its own page — see "Repository-specific settings"
below.

- **Sub-part — Configure the app**
  - Must show: the sections available (general, AI, notifications, SSH, appearance/themes); that
    settings persist across a reload.
  - e2e: `settings.feature → "Selecting a built-in theme applies it and persists across a reload"` — ✅ tagged
- **Sub-part — Connect a GitHub account**
  - Must show: Settings → Integrations → GitHub, starting the OAuth device flow, the device code +
    activation link shown, and that it can be cancelled mid-flow — this is what makes the Launchpad
    section above meaningful with real data instead of the mock fallback.
  - e2e: `settings.feature → "Starting the GitHub OAuth device flow shows a real device code, and it
    can be cancelled"` — ✴️ tag it (scenario exists, untagged; drivable today since
    `github_device_code`/`github_poll_token` are real Tauri commands `command-mocking.feature`
    already knows how to mock)
- **Sub-part — Generate an SSH key pair**
  - Must show: Settings → SSH → the key generator, picking a path, and that it writes a real key
    pair to disk (not a placeholder).
  - e2e: `settings.feature → "Generating a new SSH key pair writes real key files to disk"` — ✴️ tag
    it (scenario exists, untagged)
- **Sub-part — Find a setting by name**
  - Must show: the search box in the settings side panel filtering both section labels and their
    localized keyword synonyms (e.g. typing "terminal" or "couleur" surfaces Appearance).
  - e2e: `settings.feature → "Searching settings filters the side panel to matching sections"` — 🆕
    write it
- **Sub-part — Support the project**
  - Must show: Settings → Support, the sponsor button, and that it opens
    `github.com/sponsors/Tlahey` in the system browser rather than in-app.
  - e2e: `settings.feature → "The support tab links to GitHub Sponsors"` — 🆕 write it
- **Sub-part — Read what changed in this version**
  - Must show: Settings → Changelog, entries per release, PR references linkified. Distinct from the
    Activity Log and the Action Journal below — this one is the app's own release notes, not a log
    of anything the user did.
  - e2e: `settings.feature → "The changelog tab lists recent release entries"` — 🆕 write it

### Page: Repository-specific settings (`settings-repository.feature`) — 🆕 write it

The Repository (Local) scope only appears once a repo is open, labelled with that repo's own name
rather than "Local". `gitflow`, `worktree` and `run` are repo-only; `appearance` and `ai_commit`
*mirror* a matching Global page, so the same value can be set globally and then overridden per repo.

- **Sub-part — Set repo-only defaults (GitFlow, worktree, tasks)**
  - Must show: Settings → Repository → GitFlow (protected branches, default branch name, target
    branches for PRs), Worktree (default files copied into a new worktree), and Tasks (the run-task
    list and its default) — none of these has a global counterpart.
  - e2e: `settings-repository.feature → "Setting a repository's protected branches"` — 🆕 write it
- **Sub-part — Override a global setting for just this repository**
  - Must show: overriding the per-repo theme (or AI commit style) shows an "(overridden)" badge on
    the *global* page for that same field, so editing it there doesn't look like it silently did
    nothing; "reset to default" clears the override and the repo falls back to the global value.
  - e2e: `settings-repository.feature → "Overriding the per-repo theme shows as overridden on the
    global Appearance page"` — 🆕 write it

### Page: Notifications (`notifications.feature`) — ✅ done

- **Sub-part — Track PR activity from the bell**
  - Must show: the bell's unread count and notification list; marking all read; clearing them.
  - e2e: `notifications.feature → "Opening the bell shows the seeded notifications and unread count"` — ✅ tagged, now
    that [#193](https://github.com/Tlahey/git-manager/issues/193) is fixed (the dev-only "DEV MODE"
    badge and test-trigger buttons no longer leak into the `vite build --mode e2e` binary). The
    screenshot still shows the "Simulate Change" panel — that one is intentional, unrelated
    production UI shown to any GitHub-disconnected user, not a leftover dev artifact; every fixture
    in this suite is GitHub-disconnected since none of it drives real OAuth.

### Page: The Activity log (`activity-log.feature`) — 🆕 write it

- **Sub-part — Trace what the app actually did**
  - Must show: opening the Activity Logs takeover, filtering by repo/scope/error-only, and a
    selected row's raw command + args/error detail — this is a debugging trace aimed at whoever is
    chasing a bug, distinct from the Action Journal (AI features section above), which reframes the
    same underlying log for a reader who wants to learn rather than debug.
  - e2e: `activity-log.feature → "Filtering the activity log to errors only"` — 🆕 write it

---

## Scope notes: the menu, panels & the editor

Cross-cutting UI chrome that shows up on almost every page above — called out explicitly so nobody
re-derives the same scope decision twice, and so a "the menu isn't documented" report isn't filed
against something intentionally out of scope.

- **The native macOS app menu bar**: there isn't one beyond a tray icon (Show/Quit) —
  `apps/desktop/src-tauri/src/lib.rs` builds only that, no `Menu::new`-style app menu bar exists to
  document.
- **The in-app Tools menu** (`ToolsMenu.tsx`, toolbar wrench icon): not a page of its own — it's
  three entry points, each already given its own page above (bisect → "Git bisect"; Patch → "Patch
  workflows"; Health Check → "Package health checks"). Once those three pages exist, the menu itself
  needs no separate scenario.
- **The AI menu** (`AiMenu.tsx`, toolbar sparkle icon): same treatment — an entry point into
  "Semantic commit search" and the Dashboard's Summaries tab, not a page of its own.
- **Panels**: the repository sidebar gets its own page above ("The repository sidebar") since it has
  behavior beyond being a list (search, solo mode, pinning). The commit details panel and the
  diff/content center pane do **not** get standalone pages — they're exercised as part of every page
  that already opens them (`commit-graph.feature`, `working-tree.feature`, `blame-history.feature`,
  etc.), and a dedicated "the details panel" page would just re-narrate those. The AI right panels
  (explanation × 4, code review, commit search) and the Patch/Package-health panels each get their
  own page above precisely because their *content* is the feature, not their shell.
- **The editor (Monaco)**: exactly two distinct capabilities exist and both are already documented —
  the three-way merge editor (`merge-editor.feature`) and the blame-annotated file viewer
  (`blame-history.feature`, via `BlameFileViewer` → `MonacoFileViewer`). There is no separate
  plain-file browser (`MonacoFileViewer` has no other caller) and no line-level in-editor staging
  anywhere in the app — don't plan a page for either; there's nothing to show.

---

## Explicitly out of scope

Regression/infrastructure-only feature files with no end-user "how do I…" content of their own:
`app-launch.feature`, `command-mocking.feature`, `tag-context-menu.feature`,
`marketing-screenshots.feature` (exports README/landing-page screenshots against the "showcase"
fixture — not a doc-site scenario).
