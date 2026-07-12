# Spec 00 — Architecture

## Goal

Define the overall technical structure of the application: stack, code organization, communication patterns between the React frontend and the Rust backend (Tauri IPC), and development conventions.

---

## Overall stack

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
│                  File system                 │
│            Git repos (SSH/HTTPS auth)               │
│            Ollama (localhost:11434)                  │
└─────────────────────────────────────────────────────┘
```

---

## Monorepo: packages

| Package              | Role                                       |
| -------------------- | ------------------------------------------ |
| `apps/desktop`       | Main Tauri application                     |
| `packages/ui`        | shadcn/ui components + Radix primitives    |
| `packages/i18n`      | FR/EN dictionaries + `useTranslation` hook |
| `packages/git-types` | Shared TypeScript types (IPC DTOs)         |
| `packages/config`    | Shared ESLint config + Tailwind preset     |

---

## Tauri IPC communication

### Invoke (synchronous commands)

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

Long-running operations (rebase, Ollama generation) use Tauri events to send progressive updates:

```rust
app_handle.emit("ollama:token", payload).unwrap();
```

```typescript
import { listen } from '@tauri-apps/api/event'
await listen<string>('ollama:token', (event) => {
  setMessage((prev) => prev + event.payload)
})
```

---

## Rust backend organization

```
src-tauri/src/
├── main.rs                 # Entry point, Tauri setup, command registry
├── state.rs                # AppState (open repos, config)
├── error.rs                # Unified AppError type, impl Into<String>
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
│   ├── repo.rs             # git2::Repository wrapper
│   ├── log.rs              # History traversal
│   ├── diff.rs             # Diff generation
│   └── graph.rs            # Graph computation (lines, columns)
└── ollama/
    ├── mod.rs
    └── client.rs           # reqwest HTTP client to Ollama
```

---

## React frontend organization

```
apps/desktop/src/
├── main.tsx                # React entry point
├── App.tsx                 # Router + providers
├── app/
│   ├── dashboard/          # Multi-repo dashboard page
│   ├── repo/               # Repo view (git tree, working tree)
│   └── settings/           # Settings page
├── components/
│   ├── git-graph/          # Git graph component
│   ├── commit-panel/       # Commit detail panel
│   ├── working-tree/       # Modified / staged files
│   └── layout/             # Shell, sidebar, tabs
├── stores/
│   ├── repos.store.ts      # List of repos, active repo
│   ├── ui.store.ts         # UI state (sidebar, tabs, theme)
│   └── settings.store.ts   # Persisted configuration
├── hooks/
│   ├── useGitLog.ts        # TanStack Query + invoke get_log
│   ├── useGitStatus.ts
│   └── useOllama.ts        # Ollama streaming hook
└── lib/
    ├── tauri.ts            # Typed wrappers around invoke()
    └── utils.ts
```

---

## IPC typing — `packages/git-types`

All data types exchanged between Rust and TypeScript are defined here. Rust structs must have a `serde::Serialize` derivation that matches the TypeScript type exactly.

```typescript
// packages/git-types/src/index.ts

export interface GitRepo {
  path: string
  name: string
  head: string // HEAD branch name
  isDetached: boolean
  isDirty: boolean
}

export interface GitCommit {
  oid: string // full SHA-1
  shortOid: string // 7 characters
  message: string
  author: GitSignature
  committer: GitSignature
  parentOids: string[]
  timestamp: number // Unix timestamp
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

## Error handling

### Rust

All commands return `Result<T, String>` where `String` contains a structured JSON error message:

```json
{ "code": "REPO_NOT_FOUND", "message": "...", "detail": "..." }
```

### TypeScript

A `useCommand` hook wraps `invoke` with unified error handling:

```typescript
const { data, error, isLoading } = useCommand('get_log', { repoPath, limit: 100 })
```

---

## Internationalization

- **Library**: `react-i18next` + `i18next`
- **Namespaces**: `common`, `git`, `dashboard`, `settings`, `errors`
- **Languages**: `fr` (default), `en`
- **Storage**: `packages/i18n/locales/{fr,en}/{namespace}.json`
- **Detection**: macOS system language on first launch, changeable in Settings

---

## Persistence

Configuration is persisted via `tauri-plugin-store` in `~/.config/git-manager/config.json`:

- List of added repos
- Ollama configuration (URL, model)
- UI preferences (language, theme, sidebar)
- Automatic scan paths

---

## Security

- SSH/HTTPS credentials never transit through JavaScript — handled exclusively within the Rust process
- Tauri IPC calls use the Tauri v2 permission system (ACL)
- No outbound network calls except to Ollama on localhost (configurable, confirmed by the user)
- No telemetry

---

## Conventions

- **Commits**: Conventional Commits (`feat:`, `fix:`, `chore:`, etc.)
- **Branches**: `main` (stable), `dev` (integration), `feat/*`, `fix/*`
- **TypeScript**: strict mode enabled, no `any`
- **Rust**: clippy + rustfmt mandatory in CI
- **Naming**: camelCase TS, snake_case Rust, kebab-case files
