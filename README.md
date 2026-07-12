<div align="center">

<img src="apps/desktop/src-tauri/icons/icon.png" alt="Git Manager Logo" width="128" height="128" />

# Git Manager

**Git, finally made beautiful. A modern desktop Git client built with Tauri, React and Rust.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-1.77+-orange)](https://www.rust-lang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-v2-purple)](https://tauri.app/)
[![Platform](https://img.shields.io/badge/Platform-macOS-black)](https://github.com/Tlahey/git-manager)

_100% local — no telemetry, no cloud, no data leaves your machine._

**[✨ Visit the landing page](https://tlahey.github.io/git-manager/)**

<img src="docs/screenshots/app-commit-graph.png" alt="Git Manager — visual commit graph with branches, tags and a WIP row" width="900" />

<sub>Real screenshots, captured automatically from the app by the e2e harness — see <a href="#screenshots">Screenshots</a>.</sub>

</div>

---

## Overview

**git-manager** is a macOS desktop application that gives you a powerful, opinionated interface for everyday Git workflows. Instead of memorizing flags or juggling terminal windows, you get:

- **Visual Git graph** — interactive commit history with branches, tags and diffs
- **AI commit generation** — conventional commit messages from your diff via a local Ollama LLM, streamed live, with message history
- **Working tree** — stage, unstage, commit (including a WIP batch-commit mode with per-group AI messages), push and pull
- **Rollback** — safe revert and reset (soft / mixed / hard) with preview and typed confirmation for hard reset
- **Fixup & Autosquash** — guided `--fixup` + `rebase --autosquash` workflow
- **Stash** — push, pop, apply, drop
- **Branch management** — create, delete, checkout branches (rename not implemented yet)
- **Undo/redo** — safe undo history across git-mutating actions, with pinned refs so undone objects aren't garbage-collected
- **GitHub integration** — device-flow OAuth login, pull request views
- **SSH key management** — generate and manage keys for remote auth
- **Submodules** — list and inspect
- **i18n** — English and French interface

> Interactive rebase (drag-and-drop) and worktree management are planned but not yet implemented — see [Implemented milestones](#implemented-milestones).

---

## Screenshots

| Commit graph | Commit details |
| --- | --- |
| ![Commit graph](docs/screenshots/app-commit-graph.png) | ![Commit details](docs/screenshots/app-commit-details.png) |

These images are **generated from the real app**, not mocked: the `@screenshots`-tagged
e2e scenarios ([apps/e2e/features/marketing-screenshots.feature](apps/e2e/features/marketing-screenshots.feature))
launch the compiled Tauri binary against the scripted `showcase` fixture repository
([tools/git-fixtures/scenarios/showcase.sh](tools/git-fixtures/scenarios/showcase.sh)) and export
PNGs into [docs/screenshots/](docs/screenshots/). Refresh them anytime with:

```bash
pnpm --filter @git-manager/desktop build:e2e   # build the e2e app binary once
pnpm --filter @git-manager/e2e screenshots     # re-capture docs/screenshots/*.png
```

---

## Tech stack

| Layer                | Technology                                                                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Desktop runtime      | [Tauri v2](https://tauri.app/)                                                                                                                                                                         |
| Frontend             | React 18 + Vite + TypeScript (strict)                                                                                                                                                                  |
| UI components        | shadcn/ui + Tailwind CSS (dark mode)                                                                                                                                                                   |
| Git backend          | Rust + [`git2`](https://crates.io/crates/git2) (libgit2 bindings)                                                                                                                                      |
| State management     | [Zustand](https://zustand-demo.pmnd.rs/) (UI/app state) + [SWR](https://swr.vercel.app/) (new data-fetching hooks) + [TanStack Query](https://tanstack.com/query) (older hooks, being migrated to SWR) |
| Internationalisation | [react-i18next](https://react.i18next.com/) (EN / FR)                                                                                                                                                  |
| LLM (commit AI)      | [Ollama](https://ollama.ai) (local — no API key required)                                                                                                                                              |
| Remote auth          | SSH (system agent) + HTTPS (token)                                                                                                                                                                     |
| Monorepo             | pnpm workspaces + [Turborepo](https://turbo.build/)                                                                                                                                                    |

---

## Project structure

```
git-manager/
├── apps/
│   └── desktop/                    # Main Tauri application
│       ├── src-tauri/              # Rust backend
│       │   └── src/
│       │       ├── commands/       # Thin Tauri IPC commands, one file per domain
│       │       │                   #   (repo, log, branch, commit, remote, stash, rollback,
│       │       │                   #   fixup, undo, github, ollama, ssh, submodule, themes)
│       │       ├── services/       # git2 business logic, called from commands/
│       │       │                   #   (git_diff, git_commit, git_repo, git_graph)
│       │       ├── error.rs        # Unified AppError → JSON string
│       │       ├── models.rs       # serde structs mirroring TypeScript types
│       │       ├── utils.rs        # Shared helpers (short_oid, get_git_signature)
│       │       ├── state.rs        # AppState (repos, ollama config, cancellation)
│       │       └── lib.rs          # Builder + invoke_handler registration
│       └── src/                    # React frontend
│           ├── app/                # Pages (dashboard, repo, settings, pull-requests)
│           ├── components/         # Feature components, render-only (logic lives in hooks/)
│           │   └── git-graph/      # GitGraph, GraphRow, CommitPanel, DiffViewer
│           ├── hooks/              # Business-logic + data-fetching hooks (SWR + legacy React Query)
│           ├── api/                # api/*.api.ts — domain-grouped service layer over lib/tauri.ts;
│           │                       # components/hooks/stores call this, never lib/tauri.ts directly
│           ├── lib/
│           │   ├── tauri.ts        # Typed invoke() wrappers for all commands (one per command)
│           │   └── appEventBus.ts  # Cross-cutting event bus (achievements/gamification)
│           └── stores/             # Zustand stores (repoUI, repoData, settings, undoHistory, game)
├── packages/
│   ├── git-types/                  # Shared TypeScript interfaces (DTOs)
│   ├── i18n/                       # react-i18next setup + EN/FR locale files
│   ├── ui/                         # shadcn/ui base components
│   └── config/                     # Shared ESLint + Tailwind + tsconfig
├── docs/
│   ├── README.md                   # Documentation index
│   ├── ROADMAP.md                  # Milestone plan (M0–M7)
│   ├── specs/                      # Feature specs (00–12)
│   └── architecture/               # Architecture refactor plan (13) + tracking (14)
├── CLAUDE.md                       # Architecture/IPC conventions — authoritative for AI coding agents
├── Cargo.toml                      # Rust workspace
├── package.json                    # Root pnpm scripts
├── pnpm-workspace.yaml
└── turbo.json
```

---

## Prerequisites

| Requirement | Version       | Install                          |
| ----------- | ------------- | -------------------------------- |
| macOS       | 13+ (Ventura) | —                                |
| Xcode CLT   | latest        | `xcode-select --install`         |
| Node.js     | 20+           | [nodejs.org](https://nodejs.org) |
| pnpm        | 9+            | `npm i -g pnpm`                  |
| Rust        | 1.77+         | see below                        |
| Tauri CLI   | v2            | `cargo install tauri-cli`        |
| Ollama      | latest        | [ollama.ai](https://ollama.ai)   |

### 1. Xcode Command Line Tools

Required on macOS for the C compiler and linker used by Cargo:

```bash
xcode-select --install
```

### 2. Install Rust via rustup

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Select **option 1** (default install). Once complete, reload your shell environment:

```bash
source "$HOME/.cargo/env"
```

> **Permanent fix:** add the following line to your `~/.zshrc` (or `~/.zshprofile`) so `cargo` is always in your PATH:
>
> ```bash
> export PATH="$HOME/.cargo/bin:$PATH"
> ```

Verify the installation:

```bash
cargo --version   # e.g. cargo 1.81.0
rustc --version   # e.g. rustc 1.81.0
```

Add the macOS targets (required for universal builds):

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
```

### 3. macOS system dependencies (via Homebrew)

```bash
# Required for libgit2 / OpenSSL
brew install pkg-config openssl libssh2
```

---

## Getting started

```bash
# 1. Clone the repository
git clone https://github.com/Tlahey/git-manager.git
cd git-manager

# 2. Install Node.js dependencies
pnpm install

# 3. Start Ollama (for AI commit generation)
ollama serve
ollama pull llama3.2         # recommended general model
# or: ollama pull qwen2.5-coder:7b  (smaller, faster for code diffs)

# 4. Run in development mode (launches the Tauri desktop app)
pnpm dev

# 5. Build for production desktop binary
pnpm build
```

> [!IMPORTANT]
> Since this is a Tauri desktop application that interacts with a Rust backend, it cannot be run or opened in a web browser. Running `pnpm dev` starts the native desktop client window.

---

## Development scripts

All scripts are run from the **repository root**.

| Command          | Description                                            |
| ---------------- | ------------------------------------------------------ |
| `pnpm dev`       | Start Tauri dev server (hot reload React + Rust watch) |
| `pnpm build`     | Build production app bundle                            |
| `pnpm typecheck` | TypeScript check across all packages                   |
| `pnpm lint`      | ESLint across all packages                             |
| `pnpm format`    | Prettier formatting                                    |
| `pnpm clean`     | Remove all build artifacts                             |

### Per-package

```bash
# Typecheck a specific package
pnpm --filter @git-manager/desktop typecheck
pnpm --filter @git-manager/git-types typecheck

# Lint the desktop app
pnpm --filter @git-manager/desktop lint
```

---

## Tauri IPC architecture

The frontend calls Rust commands via `invoke()`, layered through `lib/tauri.ts` → `api/*.api.ts` → `hooks/` → components. All commands return `Result<T, String>` where errors are JSON-encoded `AppError` objects:

```json
{ "code": "REPO_NOT_FOUND", "message": "...", "detail": "..." }
```

> For the full architecture — IPC boundary conventions, the frontend layering rules, and the R1/R2 rules enforced across the codebase — see [CLAUDE.md](CLAUDE.md). It's kept in sync with the actual code and is also the source of truth used by AI coding agents working in this repo.

Long-running operations (currently: Ollama generation) stream progress via Tauri events:

| Event              | Payload  | Description          |
| ------------------ | -------- | -------------------- |
| `ollama:token`     | `string` | Next generated token |
| `ollama:done`      | `void`   | Generation complete  |
| `ollama:error`     | `string` | Error message        |
| `ollama:cancelled` | `void`   | Cancelled by user    |

---

## Ollama setup

The app connects to Ollama at `http://localhost:11434` (configurable in Settings → LLM).

```bash
# Install Ollama (macOS)
brew install ollama

# Start the server
ollama serve

# Pull a model (choose one)
ollama pull llama3.2               # ~2GB — good general model
ollama pull qwen2.5-coder:7b       # ~4.7GB — better for code diffs
ollama pull phi3.5                 # ~2.2GB — fast and lightweight
```

The model is configurable per-project. Temperature and timeout are also adjustable in Settings.

---

## Implemented milestones

| Milestone                | Status         | Description                                                                                                                                                                                                    |
| ------------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 — Foundations         | ✅ Done        | Monorepo setup, Tauri scaffold, packages                                                                                                                                                                       |
| M1 — Git Tree            | ✅ Done        | Virtualised commit graph, branch sidebar, commit diff panel                                                                                                                                                    |
| M2 — Working Tree        | ✅ Done        | Stage/unstage, commit, fetch/pull/push                                                                                                                                                                         |
| M3 — Commit AI           | ✅ Done        | Ollama streaming, settings UI, message history, WIP batch commit                                                                                                                                               |
| M4 — Rollback & Fixup    | ✅ Done        | git revert, reset (soft/mixed/hard), fixup + autosquash                                                                                                                                                        |
| M5 — Interactive Rebase  | ⬜ Planned     | Read-only rebase-state detection done (`get_rebase_state` — idle/in-progress/conflict/edit-pause, for the toolbar's REBASING badge); drag-and-drop rebase UI and the start/abort/continue controls not started |
| M6 — Worktree & Branches | 🔵 In progress | Branch create/delete/checkout done; branch rename and worktree management not started                                                                                                                          |
| M7 — Stash & Polish      | 🔵 In progress | Stash push/pop/apply/drop and keyboard shortcuts done; auto-update not started                                                                                                                                 |

See [docs/ROADMAP.md](docs/ROADMAP.md) for the full plan with detailed tasks and acceptance criteria.

### Not yet wired up (frontend scaffolding exists, backend command doesn't)

These have a typed `invoke()` wrapper already sitting in [`lib/tauri.ts`](apps/desktop/src/lib/tauri.ts) (and, for rebase, a real UI consumer) but no corresponding `#[tauri::command]` — found via a cross-check of every `invoke()` call against `lib.rs`'s registered handler list. Listed here so implementing them is "wire up the two ends," not "start from scratch":

- [ ] **Branch rename** — `renameBranch(path, oldName, newName)` → `rename_branch`. No UI trigger yet either (no rename option in the branch context menu). Spec: [docs/specs/09-branch-management.md](docs/specs/09-branch-management.md); tracked as part of ROADMAP task 6.3.
- [ ] **Worktree management** — `listWorktrees`/`addWorktree`/`removeWorktree` → `list_worktrees`/`add_worktree`/`remove_worktree`. `GitWorktree` DTO already defined ([`models.rs`](apps/desktop/src-tauri/src/models.rs), [`git-types`](packages/git-types/src/index.ts)). No UI consumer yet. Spec: [docs/specs/06-worktree.md](docs/specs/06-worktree.md); ROADMAP tasks 6.1/6.2.
- [ ] **Interactive rebase controls** — `startInteractiveRebase`/`abortRebase`/`continueRebase` → `start_interactive_rebase`/`abort_rebase`/`continue_rebase`. `RebaseStep` DTO already defined for the todo-list shape. The read side (`get_rebase_state`, `RebaseState`) is implemented and live in the toolbar; these three are the write side needed for the drag-and-drop UI. Spec: [docs/specs/07-rebase-interactive.md](docs/specs/07-rebase-interactive.md); ROADMAP tasks 5.1–5.5.
- [ ] **Settings backend sync** — `getSettings`/`updateSettings` → `get_settings`/`update_settings`, plus an `AppSettings` DTO. Currently unused: `stores/settings.store.ts` persists settings entirely client-side (Zustand `persist` → localStorage) and never calls these. Only relevant if/when settings need to sync across machines or be readable from outside the app — not blocking anything today.

---

---

## Feature specifications

Detailed specs for every feature are in [docs/specs/](docs/specs/):

| Spec                                                         | Feature                          |
| ------------------------------------------------------------ | -------------------------------- |
| [00-architecture](docs/specs/00-architecture.md)             | Stack, IPC patterns, conventions |
| [01-dashboard](docs/specs/01-dashboard.md)                   | Multi-repo dashboard             |
| [02-git-tree](docs/specs/02-git-tree.md)                     | Commit graph visualisation       |
| [03-commit-generation](docs/specs/03-commit-generation.md)   | AI commit messages via Ollama    |
| [04-rollback](docs/specs/04-rollback.md)                     | Revert / Reset                   |
| [05-fixup](docs/specs/05-fixup.md)                           | Fixup & autosquash               |
| [06-worktree](docs/specs/06-worktree.md)                     | Git worktree management          |
| [07-rebase-interactive](docs/specs/07-rebase-interactive.md) | Interactive rebase UI            |
| [08-stash](docs/specs/08-stash.md)                           | Stash management                 |
| [09-branch-management](docs/specs/09-branch-management.md)   | Branch operations                |
| [10-settings](docs/specs/10-settings.md)                     | Application settings             |
| [11-pedagogy](docs/specs/11-pedagogy.md)                     | Contextual git education mode    |
| [12-left-sidebar](docs/specs/12-left-sidebar.md)             | Resizable repository sidebar     |

Architecture refactor plan and execution tracking live in [docs/architecture/](docs/architecture/) (specs 13 and 14).

---

## Package overview

| Package              | Name                        | Description                                                                                     |
| -------------------- | --------------------------- | ----------------------------------------------------------------------------------------------- |
| `apps/desktop`       | `@git-manager/desktop`      | Main Tauri + React application                                                                  |
| `apps/landing-page`  | `@git-manager/landing-page` | The [public landing page](https://tlahey.github.io/git-manager/), deployed to GitHub Pages      |
| `apps/e2e`           | `@git-manager/e2e`          | WebdriverIO + Cucumber e2e suite driving the real Tauri app (incl. the `screenshots` capture)   |
| `packages/git-types` | `@git-manager/git-types`    | Shared TypeScript DTOs (mirrors Rust models)                                                    |
| `packages/mascot`    | `@git-manager/mascot`       | The octopus mascot as a shared `<git-mascot>` web component (landing page today, app tomorrow)  |
| `packages/i18n`      | `@git-manager/i18n`         | i18next setup + EN/FR locale files                                                              |
| `packages/ui`        | `@git-manager/ui`           | shadcn/ui base components                                                                       |
| `packages/config`    | `@git-manager/config`       | Shared ESLint, Tailwind, tsconfig                                                               |

---

## Security

- **No telemetry** — zero analytics, no network calls except Ollama (localhost)
- **Credentials stay in Rust** — SSH keys and HTTPS tokens never reach the JavaScript layer
- **Tauri ACL** — strict capability permissions via Tauri v2's permission system
- **Protected branches** — configurable list of branches that block destructive operations
- **Confirmation gates** — hard reset requires typing `RESET`, force-push requires explicit opt-in

---

## Contributing

1. Fork and clone the repository
2. Run `pnpm install` then `pnpm dev`
3. Follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages
4. TypeScript strict mode is enforced — no `any` types
5. Rust code must pass `cargo clippy` and `cargo fmt`
6. Open a PR against `dev` (not `main`)

---

## License

MIT — see [LICENSE](LICENSE)
