<div align="center">

<img src="../apps/desktop/src-tauri/icons/icon.png" alt="Git Manager Logo" width="128" height="128" />

# Git Manager

**macOS desktop application to manage your Git repositories with a modern interface and powerful tools.**

</div>

---

## Overview

**git-manager** is a desktop application built with [Tauri v2](https://tauri.app/) + React (Vite), offering:

- 🌲 **Git Tree visualizer** — interactive multi-branch commit graph
- 🤖 **Commit generation** — AI-written commit messages, local-first (Ollama) or via a configured provider
- 🔄 **Rollback / Revert** — safe undo with preview
- 🔧 **Fixup & Autosquash** — guided history cleanup
- 🌿 **Worktree management** — visual multi-worktree management
- ♻️ **Interactive rebase** — drag & drop actions
- 📦 **Stash** — stash management with messages
- 🌐 **i18n** — interface in French and English
- 🔒 **Local-first** — no telemetry; the only outbound calls are to the AI provider you configure and to GitHub

---

## Tech stack

| Layer                | Technology                              |
| -------------------- | --------------------------------------- |
| Desktop runtime      | Tauri v2                                |
| Frontend             | React 18 + Vite + TypeScript            |
| UI Components        | shadcn/ui + Tailwind CSS                |
| Backend              | Rust + `git2` crate (libgit2)           |
| State management     | Zustand                                 |
| Internationalization | react-i18next (FR / EN)                 |
| LLM (AI commit)      | Ollama, or any OpenAI-compatible server |
| Remote auth          | SSH + HTTPS (token)                     |
| Monorepo             | pnpm workspaces + Turborepo             |

---

## Monorepo structure

```
git-manager/
├── apps/
│   ├── desktop/                    # Main Tauri application
│   │   ├── src-tauri/              # Rust backend
│   │   │   └── src/
│   │   │       ├── commands/       # Thin Tauri IPC commands, one file per domain
│   │   │       │                   #   (repo, log, branch, commit, remote, stash, rollback,
│   │   │       │                   #   fixup, rebase, interactive_rebase, cherry_pick, bisect,
│   │   │       │                   #   blame, conflict, patch, worktree, submodule, undo,
│   │   │       │                   #   github, pr_template, ai, agent, tasks, terminal,
│   │   │       │                   #   activity_log, ssh, themes)
│   │   │       ├── services/       # git2 business logic, called from commands/
│   │   │       │                   #   (git_diff, git_commit, git_repo, git_graph, …)
│   │   │       ├── error.rs        # Unified AppError → JSON string
│   │   │       ├── models.rs       # serde structs mirroring TypeScript types
│   │   │       ├── utils.rs        # Shared helpers (short_oid, get_git_signature)
│   │   │       ├── state.rs        # AppState (open repos, cancellation flag)
│   │   │       └── lib.rs          # Builder + invoke_handler registration
│   │   └── src/                    # React frontend
│   │       ├── app/                # Pages (dashboard, repo, settings, pull-requests)
│   │       ├── components/         # Feature components, render-only (logic lives in hooks/)
│   │       ├── hooks/              # Business-logic + data-fetching hooks (SWR + legacy React Query)
│   │       ├── api/                # api/*.api.ts — domain-grouped service layer over lib/tauri.ts
│   │       ├── lib/                # tauri.ts (typed invoke wrappers), appEventBus.ts
│   │       └── stores/             # Zustand stores (repoUI, repoData, settings, undoHistory, game)
│   ├── landing-page/               # Public landing page (Vite), deployed to GitHub Pages
│   ├── docs/                       # Documentation site (VitePress), one page per @doc scenario
│   └── e2e/                        # WebdriverIO + Cucumber e2e suite (drives the real app)
├── packages/
│   ├── git-types/                  # Shared TypeScript interfaces (DTOs)
│   ├── ai/                         # AI presets, providers and per-feature descriptors
│   ├── mascot/                     # Octopus mascot as a shared <git-mascot> web component
│   ├── i18n/                       # react-i18next setup + EN/FR locale files
│   ├── ui/                         # shadcn/ui base components
│   ├── components/                 # Shared presentational React components
│   ├── editor/                     # Monaco integration: diff/merge + single-pane editors
│   ├── theme/                      # Design tokens + APCA contrast gates
│   ├── storybook-a11y/             # Shared Storybook accessibility setup
│   └── config/                     # Shared Oxlint + Tailwind + tsconfig
├── tools/
│   └── git-fixtures/               # Scripted fixture repos (dev tabs + e2e scenarios)
├── docs/
│   ├── README.md                   # This file
│   ├── screenshots/                # Auto-captured app screenshots (e2e @screenshots)
│   ├── ai/                         # The AI system: one page per feature + a shared overview
│   ├── architecture/               # Architecture refactor plans, audits + execution tracking
│   ├── integrations/               # Third-party setup (GitHub OAuth app + scopes)
│   └── docs-site/                  # Plans for the documentation site itself (apps/docs)
├── CLAUDE.md                       # Architecture/IPC conventions — authoritative
├── package.json                    # Root package (global scripts)
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
- **An AI provider** _(optional, only for the AI features)_ — [Ollama](https://ollama.ai) running
  locally is the default; see "AI provider configuration" below

---

## Installation

```bash
# Clone the repository
git clone https://github.com/Tlahey/git-manager.git
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

## AI provider configuration

AI features (commit message, file grouping, PR description, branch/change explanation, daily summary — see [the AI docs](./ai/README.md)) are optional. The default provider is a
local Ollama at `http://localhost:11434`. The only other entry is a generic **OpenAI-compatible**
preset you point at any server speaking the OpenAI API (LM Studio, vLLM, MLX, OpenAI itself…) —
see `AI_PRESETS` in [`packages/ai`](../packages/ai/src/presets.ts). Provider, URL, API key, model
and timeout are configured in **Settings → AI**; the model list is read from the provider's
`/v1/models` endpoint when the URL is validated. Temperature and prompts are not configurable —
they are owned per feature inside `packages/ai`.

The app checks the provider at startup. If AI is enabled but nothing answers, a warning banner
appears under the tab bar (and a status pill in the footer); clicking either opens **Settings → AI**.

To use the local default:

```bash
# Install and start Ollama
brew install ollama
ollama serve

# Download a model (recommended)
ollama pull llama3.2
# or for commits only
ollama pull qwen2.5-coder:7b
```

---

## Documentation

| Document                                                         | Description                                                                            |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [CLAUDE.md](../CLAUDE.md)                                        | **Authoritative** architecture, IPC boundary and layering rules                        |
| [Documentation site](https://tlahey.github.io/git-manager/docs/) | The user-facing manual — one page per feature, generated from the `@doc` e2e scenarios |
| [Issue tracker](https://github.com/Tlahey/git-manager/issues)    | Remaining work. There is no roadmap file: see the note below                           |
| [AI system](./ai/README.md)                                      | How every AI feature works — shared runtime + one page per feature                     |
| [Architecture refactors](./architecture/README.md)               | Five refactor audits and their execution records (July 2026) — all complete            |
| [GitHub OAuth](./integrations/github-oauth.md)                   | The OAuth app, device flow and token scopes behind the GitHub integration              |
| [Doc site content plan](./docs-site/content-plan.md)             | Which page of the documentation site comes next, and the scenario that proves it       |

### One rule behind this list

**A document that nothing forces to change with the code stops being true.** Every entry above has
a forcing function: the doc site is regenerated from the e2e scenarios, CLAUDE.md is what a PR is
reviewed against, the refactor records describe work that is finished and cannot drift. Three
things were removed on 2026-07-31 for failing that test:

- **`ROADMAP.md`** — an inventory of what had shipped. Its last revision claimed 133 Tauri commands
  when there were 157, credited fetch/pull/push with an HTTPS auth path that was never wired, and
  listed as "not started" a feature that had partly shipped. Its open items became issues
  [#234–#237](https://github.com/Tlahey/git-manager/issues).
- **`specs/archive/`** — the original 2026-07-03 per-feature design docs, written before the
  features existed and never updated. Six warnings scattered across the docs existed purely to tell
  readers not to trust them.
- **`specs/`** — two _accurate_ specs describing invariants worth protecting. They went because
  their content belonged one level down: the module doc comment is the copy you cannot refactor
  past without reading. `auto-fetch.md` was already reproduced almost verbatim in
  `useAutoFetch.ts`'s own header; what only `graph-column-layout.md` carried moved into
  `build_graph_nodes` and `useGitGraphNodes`.

> **Where invariant-shaped rationale goes now: the module doc comment**, beside the code it
> protects — as `git_rebase.rs`, `ai_provider.rs` and `ai_commit_scan.rs` already do. If an
> invariant spans layers, state it once where it is enforced and point at that from the other side.

Everything removed stays in git history: `git show 9381c80:docs/ROADMAP.md`,
`git show 9381c80:docs/specs/` to list the specs.

---

## License

MIT
