# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`git-manager` is a macOS desktop Git client: Tauri v2 (Rust backend) + React/Vite (TypeScript frontend), in a pnpm + Turborepo monorepo. 100% local — no telemetry, no cloud calls except to a local Ollama instance for AI commit message generation.

## Commands

All run from the repo root.

```bash
pnpm dev                  # Start Tauri dev server (hot reload React + Rust watch) — launches the native app window
pnpm build                # Production build
pnpm typecheck            # TypeScript check across all packages (turbo)
pnpm lint                 # ESLint across all packages (turbo)
pnpm format                # Prettier write across ts/tsx/json/md
pnpm clean                # Remove build artifacts

# Per-package
pnpm --filter @git-manager/desktop typecheck
pnpm --filter @git-manager/desktop lint
```

Rust backend (`apps/desktop/src-tauri`): standard `cargo clippy` / `cargo fmt` from that directory; both are required to pass in CI.

There is no test suite in this repo currently (no `*.test.*` files, no CI test runner configured).

**This is a Tauri desktop app, not a web app.** It cannot be run or previewed in a regular browser — the frontend depends on Tauri IPC (`invoke`) which only exists inside the Tauri webview. Don't attempt to launch or test it via a browser automation tool; use `pnpm dev` to see it running as a native window.

## Architecture

### IPC boundary (the core pattern)

The frontend never talks to git directly — every git/filesystem/network operation goes through a Tauri `#[tauri::command]` in Rust, invoked from TypeScript.

- Rust commands live in `apps/desktop/src-tauri/src/commands/*.rs`, one file per domain (`repo.rs`, `branch.rs`, `commit.rs`, `remote.rs`, `stash.rs`, `rollback.rs`, `fixup.rs`, `undo.rs`, `github.rs`, `ollama.rs`, `ssh.rs`, `submodule.rs`, `themes.rs`, `log.rs`). Each command talks to `git2` (libgit2 bindings) directly — there is no separate `git/` abstraction layer despite what `doc/specs/00-architecture.md` describes; treat that spec as aspirational/historical, not ground truth.
- Every new command must be imported and registered in the `tauri::generate_handler![...]` list in [lib.rs](apps/desktop/src-tauri/src/lib.rs) or it won't be callable from the frontend.
- Commands return `Result<T, String>`. Errors are a single `AppError` enum ([error.rs](apps/desktop/src-tauri/src/error.rs)) that serializes to `{ code, message, detail }` JSON via `impl From<AppError> for String`. Add new error variants there rather than stringly-typed errors in commands.
- Shared mutable state (open repos, Ollama config, generation-cancel flag) lives in `AppState` ([state.rs](apps/desktop/src-tauri/src/state.rs)), injected as `tauri::State<'_, AppState>`.
- Long-running operations (Ollama streaming, etc.) push progress via Tauri events (`app_handle.emit(...)`) rather than blocking the `invoke` call; the frontend `listen()`s for them.
- TypeScript DTOs that mirror the Rust `serde` structs live in `packages/git-types/src/index.ts` — when a command's return shape changes, update both sides.

### Frontend layering

`invoke()` calls are not made ad hoc from components. The layering is:

1. `apps/desktop/src/lib/tauri.ts` — one typed wrapper per Tauri command (`invoke<T>('command_name', {...})`).
2. `apps/desktop/src/api/*.api.ts` — domain-grouped re-exports/composition over `lib/tauri.ts` (e.g. `git.api.ts`, `github.api.ts`, `repo.api.ts`). Components and hooks should import from here, not from `lib/tauri.ts` directly.
3. `apps/desktop/src/hooks/` — data-fetching hooks wrapping the API layer.

Data fetching is in transition between two libraries — **new hooks should use `useSWR`** (per `.agents/AGENTS.md`); a number of older hooks (`useGitLog`, `useGitStatus`, `useBranches`, `useCommitDiff`, `useFileDiff`, `useFileRawContents`, `useSidebarRows`) still use `@tanstack/react-query` and haven't been migrated. Don't mix the two within one hook.

### Frontend organization rules (from `.agents/AGENTS.md`)

- **1 feature = 1 component**: don't nest large sub-components (rows, cards, sections) inside a parent page file.
- Split logical child components into a local `components/` folder next to the page (e.g. `app/dashboard/components/`).
- All Tauri IPC / HTTP calls go through `src/api/*.api.ts` files named by domain — never invoke `invoke()` or `fetch()` directly inside a component.
- Add `data-testid` attributes to interactive/structural elements (buttons, rows, panels) to ease debugging — no test framework currently consumes these, but the convention is followed throughout the codebase.
- Do not attempt to browser-test this app (see note above) — it's Tauri-only.

### Monorepo packages

| Package | Purpose |
|---|---|
| `apps/desktop` | The Tauri app (Rust backend in `src-tauri/`, React frontend in `src/`) |
| `packages/git-types` | Shared TypeScript DTOs mirroring the Rust `serde` structs used over IPC |
| `packages/i18n` | `react-i18next` setup + `en`/`fr` locale JSON (namespaces: `common`, `git`, `dashboard`, `settings`, `errors`) |
| `packages/ui` | shadcn/ui + Radix primitive components, Tailwind-based |
| `packages/config` | Shared ESLint config, Tailwind preset, base `tsconfig.json` |

### State management

Zustand stores in `apps/desktop/src/stores/` hold client-side UI/app state (open repos, settings, undo history, pinned branches, notifications, etc.) — separate from server-state hooks (SWR/React Query), which own anything sourced from a Tauri command.

### Security-relevant conventions

- SSH keys and HTTPS tokens are handled only in Rust — never pass credentials into the JS layer.
- Protected branches and destructive-action confirmations (hard reset requires typing `RESET`, force-push is explicit opt-in) are enforced patterns to preserve when touching rollback/reset/push commands ([rollback.rs](apps/desktop/src-tauri/src/commands/rollback.rs), [remote.rs](apps/desktop/src-tauri/src/commands/remote.rs)).
- No outbound network calls other than to Ollama at `http://localhost:11434` (configurable) and GitHub OAuth device flow ([github.rs](apps/desktop/src-tauri/src/commands/github.rs)).

### Conventions

- Conventional Commits (`feat:`, `fix:`, `chore:`, ...) for commit messages.
- TypeScript strict mode, no `any`.
- Naming: camelCase in TS, snake_case in Rust, kebab-case filenames.
- PRs target `dev`, not `main` (per README; note the current default branch in this checkout is `main`).
