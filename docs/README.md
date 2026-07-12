<div align="center">

<img src="../apps/desktop/src-tauri/icons/icon.png" alt="Git Manager Logo" width="128" height="128" />

# Git Manager

**macOS desktop application to manage your Git repositories with a modern interface and powerful tools.**

</div>

---

## Overview

**git-manager** is a desktop application built with [Tauri v2](https://tauri.app/) + React (Vite), offering:

- 🌲 **Git Tree visualizer** — interactive multi-branch commit graph
- 🤖 **Commit generation** — conventional messages generated locally via Ollama
- 🔄 **Rollback / Revert** — safe undo with preview
- 🔧 **Fixup & Autosquash** — guided history cleanup
- 🌿 **Worktree management** — visual multi-worktree management
- ♻️ **Interactive rebase** — drag & drop actions
- 📦 **Stash** — stash management with messages
- 🌐 **i18n** — interface in French and English
- 🔒 **100% local** — no data leaves your machine

---

## Tech stack

| Layer                | Technology                    |
| -------------------- | ----------------------------- |
| Desktop runtime      | Tauri v2                      |
| Frontend             | React 18 + Vite + TypeScript  |
| UI Components        | shadcn/ui + Tailwind CSS      |
| Backend              | Rust + `git2` crate (libgit2) |
| State management     | Zustand                       |
| Internationalization | react-i18next (FR / EN)       |
| LLM (AI commit)      | Ollama (local)                |
| Remote auth          | SSH + HTTPS (token)           |
| Monorepo             | pnpm workspaces + Turborepo   |

---

## Monorepo structure

```
git-manager/
├── apps/
│   └── desktop/                  # Main Tauri application
│       ├── src-tauri/            # Rust backend (commands, git2, ollama)
│       │   ├── src/
│       │   │   ├── main.rs
│       │   │   ├── commands/     # Tauri commands exposed to the frontend
│       │   │   ├── git/          # git2 layer (repo, log, branches, diff…)
│       │   │   └── ollama/       # Local Ollama HTTP client
│       │   └── Cargo.toml
│       └── src/                  # React/Vite frontend
│           ├── app/              # Pages / routing
│           ├── components/       # App-specific components
│           ├── stores/           # Zustand stores
│           ├── hooks/            # React hooks
│           └── lib/              # Tauri IPC wrappers
├── packages/
│   ├── ui/                       # Shared shadcn/ui components
│   ├── i18n/                     # FR/EN translations + react-i18next setup
│   ├── git-types/                # Shared TypeScript interfaces
│   └── config/                   # Shared ESLint + Tailwind configs
├── docs/
│   ├── README.md                 # This file
│   ├── ROADMAP.md                # Development plan
│   ├── specs/                    # Detailed specifications per feature
│   └── architecture/             # Architecture refactor plan + execution tracking
├── package.json                  # Root package (global scripts)
├── pnpm-workspace.yaml
└── turbo.json
```

---

## Prerequisites

- **macOS** 13+ (Ventura minimum recommended)
- **Node.js** 20+
- **pnpm** 9+
- **Rust** 1.77+ (`rustup install stable`)
- **Tauri CLI** v2 (`cargo install tauri-cli`)
- **Ollama** — [ollama.ai](https://ollama.ai) installed and running

---

## Installation

```bash
# Clone the repository
git clone https://github.com/votre-org/git-manager.git
cd git-manager

# Install dependencies
pnpm install

# Run in development (launches the native desktop application)
pnpm dev

# Build the application (generates the desktop binary)
pnpm build
```

> [!IMPORTANT]
> The application relies on a Rust backend via Tauri and therefore cannot be launched in a regular web browser. The `pnpm dev` command will launch the desktop application window directly.

---

## Ollama configuration

The application connects to Ollama at `http://localhost:11434` by default.

```bash
# Install and start Ollama
brew install ollama
ollama serve

# Download a model (recommended)
ollama pull llama3.2
# or for commits only
ollama pull qwen2.5-coder:7b
```

The URL and model configuration is available in **Settings → LLM**.

---

## Documentation

| Document                                               | Description                   |
| ------------------------------------------------------ | ----------------------------- |
| [ROADMAP](./ROADMAP.md)                                | Milestones and planning       |
| [Architecture](./specs/00-architecture.md)             | Stack, patterns, Tauri IPC    |
| [Dashboard](./specs/01-dashboard.md)                   | Multi-repo management         |
| [Git Tree](./specs/02-git-tree.md)                     | Graph visualization           |
| [Commit generation](./specs/03-commit-generation.md)   | AI via Ollama                 |
| [Rollback](./specs/04-rollback.md)                     | Revert / Reset                |
| [Fixup](./specs/05-fixup.md)                           | Fixup & autosquash            |
| [Worktree](./specs/06-worktree.md)                     | Worktree management           |
| [Interactive rebase](./specs/07-rebase-interactive.md) | Rebase UI                     |
| [Stash](./specs/08-stash.md)                           | Stash management              |
| [Branches](./specs/09-branch-management.md)            | Branch management             |
| [Settings](./specs/10-settings.md)                     | Configuration                 |
| [Pedagogy](./specs/11-pedagogy.md)                     | Contextual git education mode |
| [Left Sidebar](./specs/12-left-sidebar.md)             | Resizable repository sidebar  |

---

## License

MIT
