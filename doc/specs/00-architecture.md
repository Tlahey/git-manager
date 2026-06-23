# Spec 00 — Architecture

## Objectif

Définir la structure technique globale de l'application : stack, organisation du code, patterns de communication entre le frontend React et le backend Rust (Tauri IPC), et conventions de développement.

---

## Stack globale

```
┌─────────────────────────────────────────────────────┐
│                    macOS (WebView)                   │
│  ┌───────────────────────────────────────────────┐  │
│  │           React (Vite) — Frontend             │  │
│  │  Zustand │ react-i18next │ shadcn/ui           │  │
│  │  TanStack Query (data fetching IPC)            │  │
│  └────────────────────┬──────────────────────────┘  │
│                       │ Tauri IPC (invoke / events)  │
│  ┌────────────────────▼──────────────────────────┐  │
│  │              Rust — Backend                   │  │
│  │  git2 (libgit2) │ tokio │ serde_json          │  │
│  │  reqwest (Ollama HTTP) │ tauri-plugin-*        │  │
│  └───────────────────────────────────────────────┘  │
│                  Système de fichiers                 │
│            Git repos (SSH/HTTPS auth)               │
│            Ollama (localhost:11434)                  │
└─────────────────────────────────────────────────────┘
```

---

## Monorepo : packages

| Package | Rôle |
|---------|------|
| `apps/desktop` | Application principale Tauri |
| `packages/ui` | Composants shadcn/ui + primitives Radix |
| `packages/i18n` | Dictionnaires FR/EN + hook `useTranslation` |
| `packages/git-types` | Types TypeScript partagés (DTOs IPC) |
| `packages/config` | ESLint config + Tailwind preset partagés |

---

## Communication Tauri IPC

### Invoke (commandes synchrones)

```typescript
// Frontend
import { invoke } from '@tauri-apps/api/core'
import type { GitRepo } from '@git-manager/git-types'

const repo = await invoke<GitRepo>('open_repo', { path: '/path/to/repo' })
```

```rust
// Backend (src-tauri/src/commands/)
#[tauri::command]
async fn open_repo(path: String, state: tauri::State<'_, AppState>) -> Result<GitRepo, String> {
    // ...
}
```

### Events (streaming / async)

Les opérations longues (rebase, génération Ollama) utilisent les events Tauri pour envoyer des updates progressives :

```rust
app_handle.emit("ollama:token", payload).unwrap();
```

```typescript
import { listen } from '@tauri-apps/api/event'
await listen<string>('ollama:token', (event) => {
  setMessage(prev => prev + event.payload)
})
```

---

## Organisation du backend Rust

```
src-tauri/src/
├── main.rs                 # Point d'entrée, setup Tauri, registre des commands
├── state.rs                # AppState (repos ouverts, config)
├── error.rs                # Type AppError unifié, impl Into<String>
├── commands/
│   ├── mod.rs
│   ├── repo.rs             # open_repo, get_status, get_log, get_diff
│   ├── branch.rs           # get_branches, create_branch, delete_branch, checkout
│   ├── commit.rs           # commit, amend, fixup
│   ├── remote.rs           # fetch, push, pull
│   ├── rebase.rs           # start_rebase, continue_rebase, abort_rebase
│   ├── stash.rs            # stash_push, stash_pop, stash_list
│   ├── worktree.rs         # list_worktrees, add_worktree, remove_worktree
│   └── ollama.rs           # generate_commit_message (streaming)
├── git/
│   ├── mod.rs
│   ├── repo.rs             # Wrapper git2::Repository
│   ├── log.rs              # Parcours de l'historique
│   ├── diff.rs             # Génération de diffs
│   └── graph.rs            # Calcul du graphe (lignes, colonnes)
└── ollama/
    ├── mod.rs
    └── client.rs           # Client HTTP reqwest vers Ollama
```

---

## Organisation du frontend React

```
apps/desktop/src/
├── main.tsx                # Entrée React
├── App.tsx                 # Router + providers
├── app/
│   ├── dashboard/          # Page dashboard multi-repo
│   ├── repo/               # Vue repo (git tree, working tree)
│   └── settings/           # Page paramètres
├── components/
│   ├── git-graph/          # Composant graphe git
│   ├── commit-panel/       # Panneau détail commit
│   ├── working-tree/       # Fichiers modifiés / staged
│   └── layout/             # Shell, sidebar, tabs
├── stores/
│   ├── repos.store.ts      # Liste des repos, repo actif
│   ├── ui.store.ts         # État UI (sidebar, onglets, thème)
│   └── settings.store.ts   # Configuration persistée
├── hooks/
│   ├── useGitLog.ts        # TanStack Query + invoke get_log
│   ├── useGitStatus.ts
│   └── useOllama.ts        # Hook streaming Ollama
└── lib/
    ├── tauri.ts            # Wrappers typés autour de invoke()
    └── utils.ts
```

---

## Typage IPC — `packages/git-types`

Tous les types de données échangés entre Rust et TypeScript sont définis ici. Les structs Rust doivent avoir une dérivation `serde::Serialize` qui correspond exactement au type TypeScript.

```typescript
// packages/git-types/src/index.ts

export interface GitRepo {
  path: string
  name: string
  head: string        // nom de la branche HEAD
  isDetached: boolean
  isDirty: boolean
}

export interface GitCommit {
  oid: string         // SHA-1 complet
  shortOid: string    // 7 caractères
  message: string
  author: GitSignature
  committer: GitSignature
  parentOids: string[]
  timestamp: number   // Unix timestamp
}

export interface GitSignature {
  name: string
  email: string
}

export interface GitBranch {
  name: string
  shortName: string
  isHead: boolean
  isRemote: boolean
  upstream?: string
  commitOid: string
}

export interface GitStatus {
  staged: GitStatusEntry[]
  unstaged: GitStatusEntry[]
  untracked: string[]
  conflicted: string[]
}

export interface GitStatusEntry {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  oldPath?: string
}
```

---

## Gestion d'erreurs

### Rust
Toutes les commands retournent `Result<T, String>` où `String` contient un message d'erreur structuré JSON :
```json
{ "code": "REPO_NOT_FOUND", "message": "...", "detail": "..." }
```

### TypeScript
Un hook `useCommand` encapsule `invoke` avec gestion d'erreur unifiée :
```typescript
const { data, error, isLoading } = useCommand('get_log', { repoPath, limit: 100 })
```

---

## Internationalisation

- **Library** : `react-i18next` + `i18next`
- **Namespaces** : `common`, `git`, `dashboard`, `settings`, `errors`
- **Langues** : `fr` (défaut), `en`
- **Stockage** : `packages/i18n/locales/{fr,en}/{namespace}.json`
- **Détection** : langue système macOS au premier lancement, modifiable dans Settings

---

## Persistance

La configuration est persistée via `tauri-plugin-store` dans `~/.config/git-manager/config.json` :
- Liste des repos ajoutés
- Configuration Ollama (URL, modèle)
- Préférences UI (langue, thème, sidebar)
- Chemins de scan automatique

---

## Sécurité

- Les credentials SSH/HTTPS ne transitent jamais côté JavaScript — manipulation exclusivement dans le process Rust
- Les appels Tauri IPC utilisent le système de permissions Tauri v2 (ACL)
- Pas d'appel réseau sortant sauf vers Ollama localhost (configurable, confirmé par l'utilisateur)
- Pas de telemetrie

---

## Conventions

- **Commits** : Conventional Commits (`feat:`, `fix:`, `chore:`, etc.)
- **Branches** : `main` (stable), `dev` (intégration), `feat/*`, `fix/*`
- **TypeScript** : strict mode activé, pas de `any`
- **Rust** : clippy + rustfmt obligatoires en CI
- **Nommage** : camelCase TS, snake_case Rust, kebab-case fichiers
