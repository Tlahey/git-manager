# Archived specs — original design documents

These 13 documents were all written on **2026-07-03**, in a single batch, _before_ the
corresponding features were implemented. None of them was ever updated afterwards: the only
later commit touching them was a repo-wide Prettier run on 2026-07-12.

They are kept for the record — they show what the app was originally meant to be — but they
are **not** documentation of the current code, and should not be used to answer "how does
this work today?".

## Known drift

The gap runs in both directions:

- **They describe things that do not exist.** `start_interactive_rebase`,
  `get_rebase_commits`, `skip_rebase_commit`, `get_revert_diff`, `stash_clear`, `stash_show`,
  `rename_branch`, `lock_worktree`, `compare_branches`, `get_ahead_behind` are all named as
  Tauri commands but none of them is registered. Component trees (e.g. spec 07's
  `RebasePanel.tsx` / `RebaseStepList.tsx` / `RebasePreview.tsx`) do not match the real files
  (`components/rebase-editor/`). The i18n snippets are written as hardcoded French strings,
  which is the opposite of the project's actual i18n convention.
- **They miss most of what shipped.** Bisect, blame, cherry-pick, the conflict resolver, the
  integrated terminal/PTY, agents and agent sessions, tasks, PR templates, the activity log
  and the patch/dependency-patch features have no spec at all. The AI stack was reworked into
  `packages/ai` (per-feature descriptors, multi-provider transport) and all Monaco work into
  `packages/editor`, neither of which is reflected here.

The app registers 133 Tauri commands today, against the handful these specs describe.

## Where the real documentation lives

| Source                                                                                                            | What it covers                                           |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| [CLAUDE.md](../../../CLAUDE.md)                                                                                   | Authoritative architecture, IPC boundary, layering rules |
| [docs/architecture/14-architecture-refactor-tracking.md](../../architecture/14-architecture-refactor-tracking.md) | Living record of what has been extracted and why         |
| [docs/ROADMAP.md](../../ROADMAP.md)                                                                               | Feature status                                           |

## Contents

| Spec                                                | Original subject              |
| --------------------------------------------------- | ----------------------------- |
| [00-architecture](./00-architecture.md)             | Stack, patterns, Tauri IPC    |
| [01-dashboard](./01-dashboard.md)                   | Multi-repo management         |
| [02-git-tree](./02-git-tree.md)                     | Graph visualization           |
| [03-commit-generation](./03-commit-generation.md)   | AI commit messages via Ollama |
| [04-rollback](./04-rollback.md)                     | Revert / reset                |
| [05-fixup](./05-fixup.md)                           | Fixup & autosquash            |
| [06-worktree](./06-worktree.md)                     | Worktree management           |
| [07-rebase-interactive](./07-rebase-interactive.md) | Interactive rebase UI         |
| [08-stash](./08-stash.md)                           | Stash management              |
| [09-branch-management](./09-branch-management.md)   | Branch management             |
| [10-settings](./10-settings.md)                     | Configuration                 |
| [11-pedagogy](./11-pedagogy.md)                     | Contextual git education mode |
| [12-left-sidebar](./12-left-sidebar.md)             | Resizable repository sidebar  |
