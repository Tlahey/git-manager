# ROADMAP — git-manager

> **How to read this file.** The "Where things stand" section below is written against the
> actual code and is the part to trust. The milestone tables at the bottom are the _original_
> July 2026 plan, kept for the record — their checkmarks were never maintained and are wrong in
> both directions. When you finish a feature, update "Where things stand", not the old tables.
>
> Authoritative technical documentation lives in [CLAUDE.md](../CLAUDE.md). The per-feature
> design specs were archived to [`docs/specs/archive/`](./specs/archive/README.md) — they no
> longer describe the code.

---

## Where things stand

The backend registers **133 Tauri commands** across
[`commands/`](../apps/desktop/src-tauri/src/commands/), backed by
[`services/`](../apps/desktop/src-tauri/src/services/).

### Shipped

| Area           | Notes                                                                                                                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundations    | pnpm + Turborepo monorepo, Tauri v2 + Vite + React, `packages/{ai,components,config,editor,git-types,i18n,mascot,storybook-a11y,theme,ui}`                                                               |
| Git tree       | Virtualised commit graph, branch/tag sidebar, ref labels, filters, commit diff panel                                                                                                                     |
| Working tree   | Stage/unstage, commit, amend, discard, fetch/pull/push with SSH + HTTPS auth                                                                                                                             |
| Multi-repo     | Dashboard, scan, clone, init, Chrome-style tab bar with pinned Home / Pull Requests tabs                                                                                                                 |
| AI             | Streaming commit-message generation and AI file grouping via `packages/ai`; multi-provider transport (`ai_openai_compatible.rs`, `ai_anthropic.rs`) — no longer Ollama-only                              |
| Rollback       | `revert`, `reset` soft/mixed/hard with `RESET` confirmation, protected-branch enforcement                                                                                                                |
| Fixup          | `commit --fixup`, pending-fixups banner, autosquash preview and execution                                                                                                                                |
| Rebase         | State detection (`get_rebase_state`), `rebase_onto_commit`, continue / skip / abort, and interactive rebase via `list_rebase_commits` + `run_interactive_rebase` with the `components/rebase-editor/` UI |
| Stash          | push / pop / apply / drop / store, plus the stash-on-blocked-checkout prompt                                                                                                                             |
| Branches       | create / delete / checkout / merge                                                                                                                                                                       |
| Worktrees      | `list_worktrees`, `add_worktree`, `remove_worktree`, `prune_worktrees`, `gone_upstream_branches`, default-files setting                                                                                  |
| Conflicts      | Conflict detection plus the Monaco three-pane merge resolver in `packages/editor`                                                                                                                        |
| Cherry-pick    | `commands/cherry_pick.rs` + `services/git_cherry_pick.rs`                                                                                                                                                |
| Bisect         | `commands/bisect.rs` + `services/git_bisect.rs`, with a setup banner and stash dialog                                                                                                                    |
| Blame          | `commands/blame.rs` + `services/git_blame.rs`                                                                                                                                                            |
| Patches        | `commands/patch.rs`, `services/git_patch.rs`, `services/dependency_patch.rs`                                                                                                                             |
| GitHub         | OAuth device flow, cross-repo pull-request view, PR templates                                                                                                                                            |
| Terminal       | Integrated PTY (`commands/terminal.rs`, `services/terminal_pty.rs`)                                                                                                                                      |
| Agents & tasks | `commands/agent.rs`, `commands/tasks.rs`, `services/agent_session.rs`, activity log                                                                                                                      |
| Submodules     | `list_submodules` + sidebar section                                                                                                                                                                      |
| Polish         | Global keyboard shortcuts, themes, undo/redo history, auto-update (`api/updater.api.ts`), i18n EN/FR                                                                                                     |

### Not wired up (dead frontend wrapper, no backend command)

Typed `invoke()` wrappers sit in [`lib/tauri.ts`](../apps/desktop/src/lib/tauri.ts) with no
matching `#[tauri::command]`. Either implement the backend or delete the wrapper:

- [ ] **Branch rename** — `renameBranch` → `rename_branch`. No UI trigger either (no rename entry
      in the branch context menu).
- [ ] **Settings backend sync** — `getSettings` / `updateSettings` → `get_settings` /
      `update_settings`, plus an `AppSettings` DTO. `stores/settings.store.ts` persists entirely
      client-side (Zustand `persist` → localStorage) and never calls these. Only useful if
      settings ever need to be readable from outside the app.

### Not started

- [ ] **Compare branches** — visual diff between two arbitrary branches. Only
      `compare_commit_to_workdir` exists today (a commit against the working tree).
- [ ] **Pedagogy / learning mode** — the whole M8 block below: git console panel, action
      tooltips with risk levels, inline glossary, session journal with LLM explanation,
      learning-mode guard on destructive actions. Nothing of it exists yet; the original design
      is in [`specs/archive/11-pedagogy.md`](./specs/archive/11-pedagogy.md).
- [ ] **View-specific tabs** — git graph / terminal / settings / kanban as tabs within a repo.

### Ideas

- GitLab integration alongside GitHub
- Visual git hooks
- Activity report export
- VSCode extension (embedded panel)

---

## Historical milestone plan (July 2026)

> [!NOTE]
> Kept for the record only. These tables were written at the start of the project and their
> statuses were never maintained — several milestones marked ⬜ have since shipped in full
> (interactive rebase, worktrees, stash, cherry-pick, blame), and the file previously contained
> two conflicting copies of the same plan. Use "Where things stand" above instead.

| Icon | Meaning        |
| ---- | -------------- |
| ⬜   | Not started    |
| 🔵   | Partially done |
| ✅   | Done           |
| ➖   | Dropped / moot |

### M0 — Foundations

| #   | Task                                                              | Status |
| --- | ----------------------------------------------------------------- | ------ |
| 0.1 | Documentation (README, ROADMAP, specs)                            | ✅     |
| 0.2 | pnpm + Turborepo monorepo                                         | ✅     |
| 0.3 | `packages/config` — shared lint + Tailwind + tsconfig             | ✅     |
| 0.4 | `packages/git-types` — TypeScript interfaces                      | ✅     |
| 0.5 | `packages/i18n` — react-i18next FR/EN                             | ✅     |
| 0.6 | `packages/ui` — shadcn/ui base components                         | ✅     |
| 0.7 | `apps/desktop` — Tauri v2 + Vite + React 18                       | ✅     |
| 0.8 | Basic Tauri commands: `open_repo`, `get_status`, `scan_repos`     | ✅     |
| 0.9 | `pnpm dev` scripts (full Tauri) / `pnpm dev:frontend` (Vite only) | ✅     |

### M1 — Git Tree / MVP

| #    | Task                                                         | Status |
| ---- | ------------------------------------------------------------ | ------ |
| 1.1  | Tauri command `get_log` — paginated history + graph layout   | ✅     |
| 1.2  | Tauri command `get_branches` + `get_tags` + ahead/behind     | ✅     |
| 1.3  | Tauri command `get_commit_diff` + `get_commit_file`          | ✅     |
| 1.4  | Multi-repo dashboard (list + manual add + scan)              | ✅     |
| 1.5  | Repo view — branches/tags sidebar + tabs                     | ✅     |
| 1.6  | Git Graph — virtualized, colored columns, connections        | ✅     |
| 1.7  | Commit detail panel — diff hunks, author, message            | ✅     |
| 1.8  | RefLabels — colored HEAD/branches/tags/remotes badges        | ✅     |
| 1.9  | Filters: branch, author, date, message                       | ✅     |
| 1.10 | Fix graph width — per-row SVG (no more cropping on messages) | ✅     |
| 1.11 | Resizable commit panel (drag handle, min 250 / max 700 px)   | ✅     |

### M2 — Basic operations

| #   | Task                                                         | Status |
| --- | ------------------------------------------------------------ | ------ |
| 2.1 | "Working Tree" view — staged/unstaged/untracked files        | ✅     |
| 2.2 | Stage / Unstage individual files + stage all                 | ✅     |
| 2.3 | Diff preview of files (staged and unstaged)                  | ✅     |
| 2.4 | Manual commit (message + optional amend)                     | ✅     |
| 2.5 | Fetch / Pull (fast-forward) / Push with SSH auth             | ✅     |
| 2.6 | Branches sidebar with ahead/behind + Fetch/Pull/Push buttons | ✅     |
| 2.7 | Working tree status polling (3s)                             | ✅     |
| 2.8 | Merge conflict handling (visualization)                      | ✅     |

### M3 — AI commit generation + Settings

| #   | Task                                                                   | Status |
| --- | ---------------------------------------------------------------------- | ------ |
| 3.1 | Ollama Rust client — streaming `/api/generate`                         | ✅     |
| 3.2 | Generation hook — token accumulation + cancellation                    | ✅     |
| 3.3 | `CommitMessageBox` — Generate button + streaming display               | ✅     |
| 3.4 | Commit message history — last 10 messages (session)                    | ✅     |
| 3.5 | History dropdown in `CommitMessageBox`                                 | ✅     |
| 3.6 | `SettingsPage` — LLM / Git / Appearance / Language / Advanced sections | ✅     |
| 3.7 | AI provider connection test from Settings                              | ✅     |
| 3.8 | Settings auto-save via Zustand                                         | ✅     |

### M4 — Rollback & Fixup

| #    | Task                                                                | Status |
| ---- | ------------------------------------------------------------------- | ------ |
| 4.1  | `revert_commit` Rust — creates an undo commit                       | ✅     |
| 4.2  | `reset_to_commit` Rust — soft / mixed / hard                        | ✅     |
| 4.3  | `get_commits_between` Rust — preview of affected commits            | ✅     |
| 4.4  | `RevertDialog` — modal with "stage only" option                     | ✅     |
| 4.5  | `ResetDialog` — soft/mixed/hard + `RESET` confirmation for hard     | ✅     |
| 4.6  | Revert + Reset actions in `CommitPanel`                             | ✅     |
| 4.7  | `create_fixup_commit` Rust                                          | ✅     |
| 4.8  | `get_pending_fixups` + `autosquash_preview` + `run_autosquash` Rust | ✅     |
| 4.9  | `FixupTargetSelector` — target commit selector                      | ✅     |
| 4.10 | `AutosquashPreviewDialog` — grouped preview before squash           | ✅     |
| 4.11 | `PendingFixupsBanner` — banner at the top of the graph              | ✅     |
| 4.12 | Main branch protection (configurable in Settings)                   | ✅     |

### M5 — Interactive rebase

| #   | Task                                                    | Status |
| --- | ------------------------------------------------------- | ------ |
| 5.1 | Parsing the rebase todo                                 | ✅     |
| 5.2 | Rebase plan UI (pick/squash/reword/drop/edit/fixup)     | ✅     |
| 5.3 | Running the rebase with pause handling (conflict, edit) | ✅     |
| 5.4 | Preview of the result before execution                  | ✅     |
| 5.5 | Abort / Continue / Skip                                 | ✅     |

### M5-UI — Left Sidebar (RepositorySidebar)

| #     | Task                                                                                     | Status |
| ----- | ---------------------------------------------------------------------------------------- | ------ |
| 12.1  | Types `GitSubmodule`, `PullRequest`, `PrState`, `PrCiStatus`                             | ✅     |
| 12.2  | Rust command `list_submodules` (git2)                                                    | ✅     |
| 12.3  | Tauri registration + `listSubmodules` wrapper                                            | ✅     |
| 12.4  | `useSidebarResize` hook (drag, collapse, localStorage)                                   | ✅     |
| 12.5  | `useGroupedBranches` hook (prefixes, threshold ≥2)                                       | ✅     |
| 12.6  | `usePullRequests` hook (GitHub REST API, SSH/HTTPS URL parsing)                          | ✅     |
| 12.7  | Atomic components (`SectionHeader`, `BranchItem`, `BranchFolder`, `PullRequestItem`)     | ✅     |
| 12.8  | `LocalBranchesSection` section (branches grouped by prefix)                              | ✅     |
| 12.9  | `RemotesSection` section (grouped by remote)                                             | ✅     |
| 12.10 | `PullRequestsSection` section (My PRs / All PRs + non-GitHub fallback)                   | ✅     |
| 12.11 | `TagsSection` section                                                                    | ✅     |
| 12.12 | Submodules section                                                                       | ✅     |
| 12.13 | `SidebarResizeHandle` + `RepositorySidebar` (main container)                             | ✅     |
| 12.14 | Integration into `RepoView.tsx`                                                          | ✅     |
| 12.15 | Hover-expand effect on long branch/tag/PR names                                          | ✅     |
| 12.16 | Collapse/expand button with CSS transition                                               | ✅     |
| 12.19 | Branch context menu — checkout/delete/merge shipped, rename still missing                | 🔵     |
| 12.20 | "Create branch" dialog (`BranchButton`, `CreateBranchHereDialog`)                        | ✅     |
| 12.21 | GitHub auth in Settings (`GithubSection`, OAuth device flow rather than a raw token)     | ✅     |
| 12.22 | Tauri capability for `https://api.github.com` — not needed, GitHub calls go through Rust | ➖     |

### M5-UI-B — Global Top TabBar

| #     | Task                                                                                                 | Status |
| ----- | ---------------------------------------------------------------------------------------------------- | ------ |
| 13.1  | Store: `activeTab`, `setActiveTab`, `DASHBOARD_TAB`/`PULL_REQUESTS_TAB` constants, `activeRepo` sync | ✅     |
| 13.2  | Home tab (Dashboard) pinned, first, non-closable                                                     | ✅     |
| 13.3  | Pull Requests tab (cross-repo view) pinned, second                                                   | ✅     |
| 13.4  | Closable repo tabs (Chrome style)                                                                    | ✅     |
| 13.5  | `+` button with menu (Open / Clone / Create)                                                         | ✅     |
| 13.6  | Rust command `clone_repo` (git2 + SSH auth) + wrapper                                                | ✅     |
| 13.7  | Rust command `init_repo` (git2) + wrapper                                                            | ✅     |
| 13.8  | `CloneRepoDialog` (URL + parent folder)                                                              | ✅     |
| 13.9  | Settings gear icon at the far right                                                                  | ✅     |
| 13.10 | `App.tsx` refactor (routing by `activeTab`)                                                          | ✅     |
| 13.11 | `PullRequestsPage` (cross-repo view)                                                                 | ✅     |
| 13.12 | View-specific tabs (git graph, terminal, settings, kanban)                                           | ⬜     |

### M6 — Worktree & Branch management

| #   | Task                                                                     | Status |
| --- | ------------------------------------------------------------------------ | ------ |
| 6.1 | List of worktrees with status                                            | ✅     |
| 6.2 | Create / delete / switch a worktree                                      | ✅     |
| 6.3 | Create / delete / rename a branch                                        | 🔵     |
| 6.4 | Merge (fast-forward / no-ff) with preview                                | ✅     |
| 6.5 | Compare branches — visual diff (only `compare_commit_to_workdir` exists) | 🔵     |

### M7 — Stash & Polishing

| #   | Task                              | Status |
| --- | --------------------------------- | ------ |
| 7.1 | Stash push with message           | ✅     |
| 7.2 | List of stashes with diff preview | ✅     |
| 7.3 | Stash pop / apply / drop          | ✅     |
| 7.4 | Global keyboard shortcuts         | ✅     |
| 7.5 | System notifications (Tauri)      | ✅     |
| 7.6 | Dark / light mode toggle          | ✅     |
| 7.7 | Auto-update (Tauri updater)       | ✅     |

### M8 — Pedagogy & Learning mode

> Nothing in this milestone has been started. Original design:
> [`specs/archive/11-pedagogy.md`](./specs/archive/11-pedagogy.md).

| #    | Task                                                            | Status |
| ---- | --------------------------------------------------------------- | ------ |
| 8.1  | `GitCommandEvent` Rust — struct + emission in each command      | ⬜     |
| 8.2  | `useConsoleStore` Zustand (session) + `useGitConsole` hook      | ⬜     |
| 8.3  | `<GitConsolePanel>` — collapsible panel, terminal style         | ⬜     |
| 8.4  | `<ActionTooltip>` — enriched tooltip with risk + command        | ⬜     |
| 8.5  | `action-tooltips.json` FR/EN — ~20 actions covered              | ⬜     |
| 8.6  | `<CommandPreview>` — injection into existing destructive modals | ⬜     |
| 8.7  | `<GitTerm>` — inline glossary component                         | ⬜     |
| 8.8  | `git-glossary.json` FR/EN — ~35 terms                           | ⬜     |
| 8.9  | `<PostActionToast>` — enriched toast with collapsed commands    | ⬜     |
| 8.10 | `useActionGuard` hook + `<ActionGuardPanel>` — learning mode    | ⬜     |
| 8.11 | `actionExplainMap.ts` — FR/EN educational content per action    | ⬜     |
| 8.12 | `useActionJournalStore` Zustand (session)                       | ⬜     |
| 8.13 | `<ActionJournalPanel>` — session history + markdown rendering   | ⬜     |
| 8.14 | LLM explanation in the Journal                                  | ⬜     |
| 8.15 | `LearningSettings.tsx` — new section in SettingsPage            | ⬜     |
