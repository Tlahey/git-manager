<div align="center">

<img src="../apps/desktop/src-tauri/icons/icon.png" alt="Git Manager Logo" width="128" height="128" />

# Git Manager

**Application desktop macOS pour gérer vos dépôts Git avec une interface moderne et des outils puissants.**

</div>

---

## Vue d'ensemble

**git-manager** est une application desktop construite avec [Tauri v2](https://tauri.app/) + React (Vite), offrant :

- 🌲 **Git Tree visualizer** — graphe de commits interactif multi-branches
- 🤖 **Génération de commits** — messages conventionnels générés localement via Ollama
- 🔄 **Rollback / Revert** — annulation sûre avec prévisualisation
- 🔧 **Fixup & Autosquash** — nettoyage d'historique guidé
- 🌿 **Worktree management** — gestion multi-worktrees visuelle
- ♻️ **Rebase interactif** — drag & drop des actions
- 📦 **Stash** — gestion des stashes avec messages
- 🌐 **i18n** — interface en Français et Anglais
- 🔒 **100% local** — aucune donnée ne quitte votre machine

---

## Stack technique

| Couche | Technologie |
|--------|------------|
| Runtime desktop | Tauri v2 |
| Frontend | React 18 + Vite + TypeScript |
| UI Components | shadcn/ui + Tailwind CSS |
| Backend | Rust + `git2` crate (libgit2) |
| State management | Zustand |
| Internationalisation | react-i18next (FR / EN) |
| LLM (commit IA) | Ollama (local) |
| Auth remote | SSH + HTTPS (token) |
| Monorepo | pnpm workspaces + Turborepo |

---

## Structure du monorepo

```
git-manager/
├── apps/
│   └── desktop/                  # Application Tauri principale
│       ├── src-tauri/            # Backend Rust (commands, git2, ollama)
│       │   ├── src/
│       │   │   ├── main.rs
│       │   │   ├── commands/     # Tauri commands exposées au frontend
│       │   │   ├── git/          # Couche git2 (repo, log, branches, diff…)
│       │   │   └── ollama/       # Client Ollama HTTP local
│       │   └── Cargo.toml
│       └── src/                  # Frontend React/Vite
│           ├── app/              # Pages / routing
│           ├── components/       # Composants spécifiques à l'app
│           ├── stores/           # Stores Zustand
│           ├── hooks/            # Hooks React
│           └── lib/              # Tauri IPC wrappers
├── packages/
│   ├── ui/                       # Composants shadcn/ui partagés
│   ├── i18n/                     # Traductions FR/EN + setup react-i18next
│   ├── git-types/                # Interfaces TypeScript partagées
│   └── config/                   # ESLint + Tailwind configs partagés
├── doc/
│   ├── README.md                 # Ce fichier
│   ├── ROADMAP.md                # Plan de développement
│   └── specs/                    # Spécifications détaillées par feature
├── package.json                  # Root package (scripts globaux)
├── pnpm-workspace.yaml
└── turbo.json
```

---

## Prérequis

- **macOS** 13+ (Ventura minimum recommandé)
- **Node.js** 20+
- **pnpm** 9+
- **Rust** 1.77+ (`rustup install stable`)
- **Tauri CLI** v2 (`cargo install tauri-cli`)
- **Ollama** — [ollama.ai](https://ollama.ai) installé et en cours d'exécution

---

## Installation

```bash
# Cloner le dépôt
git clone https://github.com/votre-org/git-manager.git
cd git-manager

# Installer les dépendances
pnpm install

# Lancer en développement (lance l'application desktop native)
pnpm dev

# Construire l'application (génère le binaire desktop)
pnpm build
```

> [!IMPORTANT]
> L'application s'appuie sur un backend Rust via Tauri et ne peut donc pas être lancée dans un simple navigateur web. La commande `pnpm dev` lancera directement la fenêtre de l'application desktop.

---

## Configuration Ollama

L'application se connecte à Ollama sur `http://localhost:11434` par défaut.

```bash
# Installer et démarrer Ollama
brew install ollama
ollama serve

# Télécharger un modèle (recommandé)
ollama pull llama3.2
# ou pour les commits uniquement
ollama pull qwen2.5-coder:7b
```

La configuration de l'URL et du modèle est disponible dans **Settings → LLM**.

---

## Documentation

| Document | Description |
|----------|-------------|
| [ROADMAP](./ROADMAP.md) | Milestones et planning |
| [Architecture](./specs/00-architecture.md) | Stack, patterns, IPC Tauri |
| [Dashboard](./specs/01-dashboard.md) | Gestion multi-repo |
| [Git Tree](./specs/02-git-tree.md) | Visualisation graphe |
| [Génération commits](./specs/03-commit-generation.md) | IA via Ollama |
| [Rollback](./specs/04-rollback.md) | Revert / Reset |
| [Fixup](./specs/05-fixup.md) | Fixup & autosquash |
| [Worktree](./specs/06-worktree.md) | Gestion worktrees |
| [Rebase interactif](./specs/07-rebase-interactive.md) | Rebase UI |
| [Stash](./specs/08-stash.md) | Gestion des stashes |
| [Branches](./specs/09-branch-management.md) | Gestion des branches |
| [Settings](./specs/10-settings.md) | Configuration |

---

## Licence

MIT
