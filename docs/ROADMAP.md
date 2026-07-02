# ROADMAP — git-manager

> Iterative development plan. Each milestone delivers independent functional value.

---

## Statuses

| Icon | Meaning |
|-------|--------------|
| ⬜ | Not started |
| 🔵 | In progress |
| ✅ | Done |
| 🚧 | Blocked / known bug |

---

## M0 — Foundations (Phase 0 + 1)

> **Goal**: Working monorepo, a Tauri application that launches, display of a minimal Git repo.

| # | Task | Status |
|---|-------|--------|
| 0.1 | Documentation (README, ROADMAP, 11 specs) | ✅ |
| 0.2 | pnpm + Turborepo monorepo | ✅ |
| 0.3 | `packages/config` — shared ESLint + Tailwind + tsconfig | ✅ |
| 0.4 | `packages/git-types` — TypeScript interfaces | ✅ |
| 0.5 | `packages/i18n` — react-i18next FR/EN | ✅ |
| 0.6 | `packages/ui` — shadcn/ui base components | ✅ |
| 0.7 | `apps/desktop` — Tauri v2 + Vite + React 18 | ✅ |
| 0.8 | Basic Tauri commands: `open_repo`, `get_status`, `scan_repos` | ✅ |
| 0.9 | `pnpm dev` scripts (full Tauri) / `pnpm dev:frontend` (Vite only) | ✅ |

**Validation criterion**: `pnpm dev` compiles and launches the desktop app. ✅ (Rust build OK, Vite build OK)

> **⚠️ Known bug**: Opening a repo/folder via the file picker doesn't work. To be fixed in M0-fix before validating M1.

---

## M1 — Git Tree / MVP

> **Goal**: Complete visualization of Git history with branches, tags, and commit detail.

| # | Task | Status |
|---|-------|--------|
| 1.1 | Tauri command `get_log` — paginated history + graph layout | ✅ |
| 1.2 | Tauri command `get_branches` + `get_tags` + ahead/behind | ✅ |
| 1.3 | Tauri command `get_commit_diff` + `get_commit_file` | ✅ |
| 1.4 | Multi-repo dashboard (list + manual add + scan) | ✅ |
| 1.5 | Repo view — branches/tags sidebar + tabs | ✅ |
| 1.6 | Git Graph — virtualized, colored columns, connections | ✅ |
| 1.7 | Commit detail panel — diff hunks, author, message | ✅ |
| 1.8 | RefLabels — colored HEAD/branches/tags/remotes badges | ✅ |
| 1.9 | Filters: branch, author, date, message | ✅ |
| 1.10 | Fix graph width — per-row SVG (no more cropping on messages) | ✅ |
| 1.11 | Resizable commit panel (drag handle, min 250 / max 700 px) | ✅ |

**Validation criterion**: complete git graph of a repo, click on a commit → diff visible. 🔵 (depends on the repo-opening fix)

---

## M2 — Basic operations

> **Goal**: Stage/unstage, manual commit, push/pull/fetch.

| # | Task | Status |
|---|-------|--------|
| 2.1 | "Working Tree" view — staged/unstaged/untracked files | ✅ |
| 2.2 | Stage / Unstage individual files + stage all | ✅ |
| 2.3 | Diff preview of files (staged and unstaged) | ✅ |
| 2.4 | Manual commit (message + optional amend) | ✅ |
| 2.5 | Fetch / Pull (fast-forward) / Push with SSH auth | ✅ |
| 2.6 | Branches sidebar with ahead/behind + Fetch/Pull/Push buttons | ✅ |
| 2.7 | Working tree status polling (3s) | ✅ |
| 2.8 | Merge conflict handling (visualization) | ⬜ |

**Validation criterion**: complete commit from A to Z from within the application. ✅

---

## M3 — AI commit generation + Settings

> **Goal**: Commit message generation via Ollama + configuration interface.

| # | Task | Status |
|---|-------|--------|
| 3.1 | Ollama Rust client — streaming `/api/generate` | ✅ |
| 3.2 | `useOllamaGeneration` hook — token accumulation + cancellation | ✅ |
| 3.3 | `CommitMessageBox` — Generate button + streaming display | ✅ |
| 3.4 | `useCommitMessageHistory` — last 10 messages (session) | ✅ |
| 3.5 | History dropdown in `CommitMessageBox` | ✅ |
| 3.6 | `SettingsPage` — LLM / Git / Appearance / Language / Advanced sections | ✅ |
| 3.7 | Ollama connection test from Settings | ✅ |
| 3.8 | Settings auto-save via Zustand | ✅ |

**Validation criterion**: streaming generation < 10s, settings persisted. ✅

---

## M4 — Rollback & Fixup

> **Goal**: Safe undo operations with preview and protection.

| # | Task | Status |
|---|-------|--------|
| 4.1 | `revert_commit` Rust — creates an undo commit | ✅ |
| 4.2 | `reset_to_commit` Rust — soft / mixed / hard | ✅ |
| 4.3 | `get_commits_between` Rust — preview of affected commits | ✅ |
| 4.4 | `RevertDialog` — modal with "stage only" option | ✅ |
| 4.5 | `ResetDialog` — soft/mixed/hard + `RESET` confirmation for hard | ✅ |
| 4.6 | Revert + Reset actions in `CommitPanel` | ✅ |
| 4.7 | `create_fixup_commit` Rust | ✅ |
| 4.8 | `get_pending_fixups` + `autosquash_preview` + `run_autosquash` Rust | ✅ |
| 4.9 | `FixupTargetSelector` — target commit selector | ✅ |
| 4.10 | `AutosquashPreviewDialog` — grouped preview before squash | ✅ |
| 4.11 | `PendingFixupsBanner` — banner at the top of the graph | ✅ |
| 4.12 | Main branch protection (configurable in Settings) | ✅ |

**Validation criterion**: rollback + fixup + autosquash from the UI. ✅

---

## M0-fix — Priority fixes 🚧

> Blocking bugs to fix before validating M1 in production.

| # | Task | Status |
|---|-------|--------|
| F.1 | **Opening a repo/folder via the file picker** — Tauri dialog doesn't trigger the opening | 🚧 |
| F.2 | **GitHub authentication via OAuth provider** — replace name/email with GitHub OAuth login (token) | ⬜ |

> **Note F.2**: Remote authentication must use an OAuth provider (GitHub App or Personal Access Token via secure Tauri storage), not a plaintext name/email. To be implemented in `commands/remote.rs` with `tauri-plugin-store` for the token, and a login flow via `open()` to `github.com/login/oauth`.

---

## M5 — Interactive rebase

> **Goal**: Interactive rebase with a drag & drop interface.

| # | Task | Status |
|---|-------|--------|
| 5.1 | Parsing the `git-rebase-todo` | ⬜ |
| 5.2 | Drag & drop list UI (pick/squash/reword/drop/edit/fixup) | ⬜ |
| 5.3 | Running the rebase with pause handling (conflict, edit) | ⬜ |
| 5.4 | Preview of the result before execution | ⬜ |
| 5.5 | Abort / Continue / Skip | ⬜ |

**Validation criterion**: complete interactive rebase from the UI without going through the terminal.

---

## M5-UI — Complete Left Sidebar (RepositorySidebar)

> **Goal**: Rich, resizable left sidebar, inspired by GitKraken. See full spec: `docs/specs/12-left-sidebar.md`.

| # | Task | Status |
|---|-------|--------|
| 12.1 | Types `GitSubmodule`, `PullRequest`, `PrState`, `PrCiStatus` | ✅ |
| 12.2 | Rust command `list_submodules` (git2) | ✅ |
| 12.3 | Tauri registration + `listSubmodules` wrapper | ✅ |
| 12.4 | `useSidebarResize` hook (drag, collapse, localStorage) | ✅ |
| 12.5 | `useGroupedBranches` hook (prefixes, threshold ≥2) | ✅ |
| 12.6 | `usePullRequests` hook (GitHub REST API, SSH/HTTPS URL parsing) | ✅ |
| 12.7 | Atomic components (`SectionHeader`, `BranchItem`, `BranchFolder`, `PullRequestItem`) | ✅ |
| 12.8 | `LocalBranchesSection` section (branches grouped by prefix) | ✅ |
| 12.9 | `RemotesSection` section (grouped by remote) | ✅ |
| 12.10 | `PullRequestsSection` section (My PRs / All PRs + non-GitHub fallback) | ✅ |
| 12.11 | `TagsSection` section | ✅ |
| 12.12 | `SubmodulesSection` section | ✅ |
| 12.13 | `SidebarResizeHandle` + `RepositorySidebar` (main container) | ✅ |
| 12.14 | Integration into `RepoView.tsx` | ✅ |
| 12.15 | Hover-expand effect on long branch/tag/PR names | ✅ |
| 12.16 | Collapse/expand button with CSS transition | ✅ |
| 12.17 | `pnpm typecheck` verification | ⬜ |
| 12.18 | `cargo build` verification | ⬜ |
| 12.19 | Branch context menu (checkout/delete/rename/merge) | ⬜ |
| 12.20 | "Create branch" modal from the + button | ⬜ |
| 12.21 | GitHub token in Settings for private repos | ⬜ |
| 12.22 | Tauri capability for `https://api.github.com` | ⬜ |

**Validation criterion**: sidebar displayed with resize/collapse, grouped branches, GitHub PRs visible.

---

## M5-UI-B — Global Top TabBar

> **Goal**: Global Chrome-style tab bar, persistent above all views.

| # | Task | Status |
|---|-------|--------|
| 13.1 | Store: `activeTab`, `setActiveTab`, `DASHBOARD_TAB`/`PULL_REQUESTS_TAB` constants, `activeRepo` sync | ✅ |
| 13.2 | Home tab (Dashboard) pinned, first, non-closable | ✅ |
| 13.3 | Pull Requests tab (cross-repo view) pinned, second | ✅ |
| 13.4 | Closable repo tabs (Chrome style) | ✅ |
| 13.5 | `+` button with menu (Open / Clone / Create) | ✅ |
| 13.6 | Rust command `clone_repo` (git2 + SSH auth) + wrapper | ✅ |
| 13.7 | Rust command `init_repo` (git2) + wrapper | ✅ |
| 13.8 | `CloneRepoDialog` (URL + parent folder) | ✅ |
| 13.9 | Settings gear icon at the far right | ✅ |
| 13.10 | `App.tsx` refactor (routing by `activeTab`) + removal of `RepoView`'s internal bar | ✅ |
| 13.11 | `PullRequestsPage` (cross-repo view, initial content) | ✅ |
| 13.12 | View-specific tabs (git graph, terminal, settings, kanban) | ⬜ |

**Validation criterion**: persistent TabBar, pinned Home/PR tabs, openable/closable repos, working `+` button (open/clone/create).

---

## M6 — Worktree & Branch management

> **Goal**: Visual management of worktrees and branches.

| # | Task | Status |
|---|-------|--------|
| 6.1 | List of worktrees with status | ⬜ |
| 6.2 | Create / delete / switch a worktree | ⬜ |
| 6.3 | Create / delete / rename a branch | ⬜ |
| 6.4 | Merge (fast-forward / no-ff) with preview | ⬜ |
| 6.5 | Compare branches — visual diff | ⬜ |

---

## M7 — Stash & Polishing

> **Goal**: Stash management + UX polish.

| # | Task | Status |
|---|-------|--------|
| 7.1 | Stash push with message | ⬜ |
| 7.2 | List of stashes with diff preview | ⬜ |
| 7.3 | Stash pop / apply / drop | ⬜ |
| 7.4 | Global keyboard shortcuts | ⬜ |
| 7.5 | System notifications (Tauri) | ⬜ |
| 7.6 | Dark / light mode toggle | ⬜ |
| 7.7 | Auto-update (Tauri updater) | ⬜ |

---

## M8 — Pedagogy & Learning mode

> **Goal**: Make git-manager an application that educates the user. Every action can be accompanied by equivalent git commands, contextual explanations, and a local LLM to decode everything.

| # | Task | Status |
|---|-------|--------|
| 8.1 | `GitCommandEvent` Rust — struct + emission in each command | ⬜ |
| 8.2 | `useConsoleStore` Zustand (session) + `useGitConsole` hook | ⬜ |
| 8.3 | `<GitConsolePanel>` — collapsible panel, terminal style | ⬜ |
| 8.4 | `<ActionTooltip>` — enriched tooltip with risk + command | ⬜ |
| 8.5 | `action-tooltips.json` FR/EN — ~20 actions covered | ⬜ |
| 8.6 | `<CommandPreview>` — injection into existing destructive modals | ⬜ |
| 8.7 | `<GitTerm>` — inline glossary component | ⬜ |
| 8.8 | `git-glossary.json` FR/EN — ~35 terms | ⬜ |
| 8.9 | `<PostActionToast>` — enriched toast with collapsed commands | ⬜ |
| 8.10 | `useActionGuard` hook + `<ActionGuardPanel>` — learning mode | ⬜ |
| 8.11 | `actionExplainMap.ts` — FR/EN educational content per action | ⬜ |
| 8.12 | `useActionJournalStore` Zustand (session) | ⬜ |
| 8.13 | `<ActionJournalPanel>` — session history + markdown rendering | ⬜ |
| 8.14 | LLM explanation in the Journal via `useOllamaGeneration` | ⬜ |
| 8.15 | `LearningSettings.tsx` — new section in SettingsPage | ⬜ |

**Validation criterion**: git console visible, journal with working Ollama explanation, beginner learning mode active on reset --hard.

---

## Backlog (post-M8)

- GitHub / GitLab integration (PRs, Issues as overlay)
- Interactive cherry-pick
- Blame / Annotate
- Visual Git hooks
- Activity report export
- OpenAI / Anthropic support in addition to Ollama
- VSCode extension (embedded panel)

---

## Dependencies between milestones

```
M0 → M0-fix → M1 → M2 → M3
                         ↘ M4 → M5
                         ↘ M6
                         ↘ M7
                         ↘ M8  (depends on M3 for the LLM Journal)
```

M3, M4, M5, M6, M7, M8 can be developed in parallel after M2. M8 only requires M3 for the Journal + LLM feature.

---

## M0 — Foundations (Phase 0 + 1)

> **Goal**: Working monorepo, a Tauri application that launches, display of a minimal Git repo.

| # | Task | Status |
|---|-------|--------|
| 0.1 | Documentation (README, ROADMAP, specs) | 🔵 |
| 0.2 | pnpm + Turborepo monorepo | ⬜ |
| 0.3 | `packages/config` — shared ESLint + Tailwind | ⬜ |
| 0.4 | `packages/git-types` — TypeScript interfaces | ⬜ |
| 0.5 | `packages/i18n` — react-i18next FR/EN | ⬜ |
| 0.6 | `packages/ui` — shadcn/ui base | ⬜ |
| 0.7 | `apps/desktop` — Tauri v2 + Vite + React | ⬜ |
| 0.8 | Basic Tauri commands: `open_repo`, `get_status` | ⬜ |

**Validation criterion**: `pnpm dev` launches the app, we can open a Git folder and see its status.

---

## M1 — Git Tree / MVP (Phase 2 + 3)

> **Goal**: Complete visualization of Git history with branches, tags, and commit detail.

| # | Task | Status |
|---|-------|--------|
| 1.1 | Tauri command `get_log` — paginated history | ⬜ |
| 1.2 | Tauri command `get_branches` + `get_tags` | ⬜ |
| 1.3 | Tauri command `get_remotes` | ⬜ |
| 1.4 | Tauri command `get_diff` — diff of a commit | ⬜ |
| 1.5 | Multi-repo dashboard (list + manual add + scan) | ⬜ |
| 1.6 | Repo view — branches/tags sidebar + tabs | ⬜ |
| 1.7 | Git Graph — tree visualization (react-gitgraph) | ⬜ |
| 1.8 | Commit detail panel — diff, author, message | ⬜ |
| 1.9 | Filters: branch, author, date, message | ⬜ |
| 1.10 | SSH + HTTPS support for `fetch` / remote status | ⬜ |

**Validation criterion**: we see the complete git graph of a repo, we can click on a commit and see its diff.

---

## M2 — Basic operations (Phase 4a)

> **Goal**: Stage/unstage, manual commit, push/pull/fetch.

| # | Task | Status |
|---|-------|--------|
| 2.1 | "Working Tree" view — modified, staged, untracked files | ⬜ |
| 2.2 | Stage / Unstage of files and hunks | ⬜ |
| 2.3 | Manual commit (message + options) | ⬜ |
| 2.4 | Push / Pull / Fetch with conflict handling | ⬜ |
| 2.5 | Merge conflict handling (visualization) | ⬜ |

**Validation criterion**: we can make a complete commit from A to Z from within the application.

---

## M3 — AI commit generation (Phase 4b)

> **Goal**: Commit message generation from the diff via Ollama.

| # | Task | Status |
|---|-------|--------|
| 3.1 | Ollama client (Rust) — HTTP call to `/api/generate` | ⬜ |
| 3.2 | Prompt engineering diff → conventional commit | ⬜ |
| 3.3 | UI: "Generate" button, editable result | ⬜ |
| 3.4 | Streaming support (token-by-token response) | ⬜ |
| 3.5 | Model configuration in Settings | ⬜ |
| 3.6 | History of generated messages (session) | ⬜ |

**Validation criterion**: selected diff → click "Generate" → conventional commit message displayed in < 10s with local Ollama.

---

## M4 — Rollback & Fixup (Phase 4c)

> **Goal**: Safe undo operations with preview and protection.

| # | Task | Status |
|---|-------|--------|
| 4.1 | Rollback — `git revert` with preview | ⬜ |
| 4.2 | Reset soft / mixed / hard with confirmation | ⬜ |
| 4.3 | Fixup — `git commit --fixup` target selector | ⬜ |
| 4.4 | Autosquash — `git rebase --autosquash` | ⬜ |
| 4.5 | Main branch protection (configurable) | ⬜ |

**Validation criterion**: rollback + fixup of a commit with confirmation and visual feedback in the graph.

---

## M5 — Interactive rebase (Phase 4d)

> **Goal**: Interactive rebase with a drag & drop interface.

| # | Task | Status |
|---|-------|--------|
| 5.1 | Parsing the `git-rebase-todo` | ⬜ |
| 5.2 | Drag & drop list UI (pick/squash/reword/drop/edit/fixup) | ⬜ |
| 5.3 | Running the rebase with pause handling (conflict, edit) | ⬜ |
| 5.4 | Preview of the result before execution | ⬜ |
| 5.5 | Abort / Continue / Skip | ⬜ |

**Validation criterion**: complete interactive rebase from the UI without going through the terminal.

---

## M6 — Worktree & Branch management (Phase 4e)

> **Goal**: Visual management of worktrees and branches.

| # | Task | Status |
|---|-------|--------|
| 6.1 | List of worktrees with status | ⬜ |
| 6.2 | Create / delete / switch a worktree | ⬜ |
| 6.3 | Create / delete / rename a branch | ⬜ |
| 6.4 | Merge (fast-forward / no-ff) with preview | ⬜ |
| 6.5 | Compare branches — visual diff | ⬜ |

---

## M7 — Stash & Polishing (Phase 4f)

> **Goal**: Stash management + UX polish.

| # | Task | Status |
|---|-------|--------|
| 7.1 | Stash push with message | ⬜ |
| 7.2 | List of stashes with diff preview | ⬜ |
| 7.3 | Stash pop / apply / drop | ⬜ |
| 7.4 | Global keyboard shortcuts | ⬜ |
| 7.5 | System notifications (Tauri) | ⬜ |
| 7.6 | Dark / light mode toggle | ⬜ |
| 7.7 | Auto-update (Tauri updater) | ⬜ |

---

## M8 — Pedagogy & Learning mode (Phase 5)

> **Goal**: Make git-manager an application that educates the user. Real-time git console, contextual explanations, session journal with LLM explanation.

| # | Task | Status |
|---|-------|--------|
| 8.1 | `GitCommandEvent` Rust — struct + emission in each command | ⬜ |
| 8.2 | `useConsoleStore` Zustand (session) + `useGitConsole` hook | ⬜ |
| 8.3 | `<GitConsolePanel>` — collapsible panel, terminal style | ⬜ |
| 8.4 | `<ActionTooltip>` — enriched tooltip with risk + command | ⬜ |
| 8.5 | `action-tooltips.json` FR/EN — ~20 actions covered | ⬜ |
| 8.6 | `<CommandPreview>` — injection into existing destructive modals | ⬜ |
| 8.7 | `<GitTerm>` — inline glossary component | ⬜ |
| 8.8 | `git-glossary.json` FR/EN — ~35 terms | ⬜ |
| 8.9 | `<PostActionToast>` — enriched toast with collapsed commands | ⬜ |
| 8.10 | `useActionGuard` hook + `<ActionGuardPanel>` — learning mode | ⬜ |
| 8.11 | `actionExplainMap.ts` — FR/EN educational content per action | ⬜ |
| 8.12 | `useActionJournalStore` Zustand (session) | ⬜ |
| 8.13 | `<ActionJournalPanel>` — session history + markdown rendering | ⬜ |
| 8.14 | LLM explanation in the Journal via `useOllamaGeneration` | ⬜ |
| 8.15 | `LearningSettings.tsx` — new section in SettingsPage | ⬜ |

**Validation criterion**: git console visible, journal with working Ollama explanation, beginner learning mode active on reset --hard.

---

## Backlog (post-M8)

- GitHub / GitLab integration (PRs, Issues as overlay)
- Interactive cherry-pick
- Blame / Annotate
- Visual Git hooks
- Activity report export
- OpenAI / Anthropic support in addition to Ollama
- VSCode extension (embedded panel)

---

## Dependencies between milestones

```
M0 → M1 → M2 → M3
               ↘ M4 → M5
               ↘ M6
               ↘ M7
               ↘ M8  (depends on M3 for the LLM Journal)
```

M3, M4, M5, M6, M7, M8 can be developed in parallel after M2. M8 only requires M3 for the Journal + LLM feature.
