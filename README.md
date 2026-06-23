<div align="center">

# git-manager

**A modern desktop Git client built with Tauri, React and Rust**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-1.77+-orange)](https://www.rust-lang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-v2-purple)](https://tauri.app/)

*100% local — no telemetry, no cloud, no data leaves your machine.*

</div>

---

## Overview

**git-manager** is a macOS desktop application that gives you a powerful, opinionated interface for everyday Git workflows. Instead of memorizing flags or juggling terminal windows, you get:

- **Visual Git graph** — interactive commit history with branches, tags and diffs
- **AI commit generation** — conventional commit messages from your diff via a local Ollama LLM
- **Working tree** — stage, unstage, commit, push and pull from a single panel
- **Rollback** — safe revert and reset (soft / mixed / hard) with preview
- **Fixup & Autosquash** — guided `--fixup` + `rebase --autosquash` workflow
- **Interactive Rebase** — drag-and-drop reorder, squash, drop with live preview
- **Worktree management** — create, open and remove worktrees visually
- **Stash** — push, pop, apply, drop with diff preview
- **Branch management** — create, rename, merge and compare branches
- **i18n** — English and French interface

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Desktop runtime | [Tauri v2](https://tauri.app/) |
| Frontend | React 18 + Vite + TypeScript (strict) |
| UI components | shadcn/ui + Tailwind CSS (dark mode) |
| Git backend | Rust + [`git2`](https://crates.io/crates/git2) (libgit2 bindings) |
| State management | [Zustand](https://zustand-demo.pmnd.rs/) + [TanStack Query](https://tanstack.com/query) |
| Internationalisation | [react-i18next](https://react.i18next.com/) (EN / FR) |
| LLM (commit AI) | [Ollama](https://ollama.ai) (local — no API key required) |
| Remote auth | SSH (system agent) + HTTPS (token) |
| Monorepo | pnpm workspaces + [Turborepo](https://turbo.build/) |

---

## Project structure

```
git-manager/
├── apps/
│   └── desktop/                    # Main Tauri application
│       ├── src-tauri/              # Rust backend
│       │   └── src/
│       │       ├── commands/       # Tauri IPC commands (repo, log, branch, commit, remote, ollama)
│       │       ├── error.rs        # Unified AppError → JSON string
│       │       ├── models.rs       # serde structs mirroring TypeScript types
│       │       ├── state.rs        # AppState (repos, ollama config, cancellation)
│       │       └── lib.rs          # Builder + invoke_handler registration
│       └── src/                    # React frontend
│           ├── app/                # Pages (dashboard, repo, settings)
│           ├── components/         # Feature components
│           │   ├── git-graph/      # GitGraph, GraphRow, CommitPanel, DiffViewer
│           │   └── working-tree/   # WorkingTreePanel, FileStatusItem, CommitMessageBox
│           ├── hooks/              # TanStack Query hooks + useOllamaGeneration
│           ├── lib/tauri.ts        # Typed invoke() wrappers for all commands
│           └── stores/             # Zustand stores (repos, settings)
├── packages/
│   ├── git-types/                  # Shared TypeScript interfaces (DTOs)
│   ├── i18n/                       # react-i18next setup + EN/FR locale files
│   ├── ui/                         # shadcn/ui base components
│   └── config/                     # Shared ESLint + Tailwind + tsconfig
├── doc/
│   ├── README.md                   # Documentation index
│   ├── ROADMAP.md                  # Milestone plan (M0–M7)
│   └── specs/                      # Feature specifications (11 files)
├── Cargo.toml                      # Rust workspace
├── package.json                    # Root pnpm scripts
├── pnpm-workspace.yaml
└── turbo.json
```

---

## Prerequisites

| Requirement | Version | Install |
|-------------|---------|---------|
| macOS | 13+ (Ventura) | — |
| Xcode CLT | latest | `xcode-select --install` |
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| pnpm | 9+ | `npm i -g pnpm` |
| Rust | 1.77+ | see below |
| Tauri CLI | v2 | `cargo install tauri-cli` |
| Ollama | latest | [ollama.ai](https://ollama.ai) |

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
git clone https://github.com/your-org/git-manager.git
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

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start Tauri dev server (hot reload React + Rust watch) |
| `pnpm build` | Build production app bundle |
| `pnpm typecheck` | TypeScript check across all packages |
| `pnpm lint` | ESLint across all packages |
| `pnpm format` | Prettier formatting |
| `pnpm clean` | Remove all build artifacts |

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

The frontend calls Rust commands via `invoke()`. All commands return `Result<T, String>` where errors are JSON-encoded `AppError` objects:

```json
{ "code": "REPO_NOT_FOUND", "message": "...", "detail": "..." }
```

Long-running operations (Ollama generation, rebase) stream progress via Tauri events:

| Event | Payload | Description |
|-------|---------|-------------|
| `ollama:token` | `string` | Next generated token |
| `ollama:done` | `void` | Generation complete |
| `ollama:error` | `string` | Error message |
| `ollama:cancelled` | `void` | Cancelled by user |

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

| Milestone | Status | Description |
|-----------|--------|-------------|
| M0 — Foundations | ✅ Done | Monorepo setup, Tauri scaffold, packages |
| M1 — Git Tree | ✅ Done | Virtualised commit graph, branch sidebar, commit diff panel |
| M2 — Working Tree | ✅ Done | Stage/unstage, commit, fetch/pull/push |
| M3 — Commit AI | 🔵 In progress | Ollama streaming, settings UI, message history |
| M4 — Rollback & Fixup | ⬜ Planned | git revert, reset (soft/mixed/hard), fixup + autosquash |
| M5 — Interactive Rebase | ⬜ Planned | Drag-and-drop rebase UI |
| M6 — Worktree & Branches | ⬜ Planned | Worktree management, branch operations |
| M7 — Stash & Polish | ⬜ Planned | Stash, keyboard shortcuts, auto-update |

See [doc/ROADMAP.md](doc/ROADMAP.md) for the full plan with detailed tasks and acceptance criteria.

---

## Feature specifications

Detailed specs for every feature are in [doc/specs/](doc/specs/):

| Spec | Feature |
|------|---------|
| [00-architecture](doc/specs/00-architecture.md) | Stack, IPC patterns, conventions |
| [01-dashboard](doc/specs/01-dashboard.md) | Multi-repo dashboard |
| [02-git-tree](doc/specs/02-git-tree.md) | Commit graph visualisation |
| [03-commit-generation](doc/specs/03-commit-generation.md) | AI commit messages via Ollama |
| [04-rollback](doc/specs/04-rollback.md) | Revert / Reset |
| [05-fixup](doc/specs/05-fixup.md) | Fixup & autosquash |
| [06-worktree](doc/specs/06-worktree.md) | Git worktree management |
| [07-rebase-interactive](doc/specs/07-rebase-interactive.md) | Interactive rebase UI |
| [08-stash](doc/specs/08-stash.md) | Stash management |
| [09-branch-management](doc/specs/09-branch-management.md) | Branch operations |
| [10-settings](doc/specs/10-settings.md) | Application settings |

---

## Package overview

| Package | Name | Description |
|---------|------|-------------|
| `apps/desktop` | `@git-manager/desktop` | Main Tauri + React application |
| `packages/git-types` | `@git-manager/git-types` | Shared TypeScript DTOs (mirrors Rust models) |
| `packages/i18n` | `@git-manager/i18n` | i18next setup + EN/FR locale files |
| `packages/ui` | `@git-manager/ui` | shadcn/ui base components |
| `packages/config` | `@git-manager/config` | Shared ESLint, Tailwind, tsconfig |

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
