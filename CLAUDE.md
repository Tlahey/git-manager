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
pnpm --filter @git-manager/desktop test          # Vitest (jsdom + React Testing Library), *.test.ts(x) files
pnpm --filter @git-manager/desktop test:watch    # same, watch mode

pnpm dev:import-repo      # rebuild every dev fixture repo (rebase conflict, fixup chain, stash
                           # stack, detached HEAD, reset/revert history — see below) and launch
                           # the app with them all injected as extra tabs
pnpm fixture:build        # just rebuild the fixture repos on disk without relaunching the app
```

Rust backend (`apps/desktop/src-tauri`): standard `cargo clippy` / `cargo fmt` from that directory; both are required to pass in CI.

Frontend unit tests use Vitest (`apps/desktop/vitest.config.ts`/`vitest.setup.ts`), covering pure logic directly (e.g. `mergeBlockLayout.ts`) and components via React Testing Library with a fake `@monaco-editor/react` (see `components/merge-editor/__tests__/fakeMonacoPane.tsx`) — real Monaco can't run in jsdom. The Rust backend has no test runner wired into CI beyond `cargo clippy`/`cargo fmt`, though some modules (e.g. `git_merge_diff.rs`) have `#[cfg(test)]` unit tests you can run directly with `cargo test` from `apps/desktop/src-tauri`.

To manually test UI against real, awkward git states (paused rebase conflicts, fixup/autosquash chains, stashes, detached HEAD, reset/revert history) instead of just unit tests, run `pnpm dev:import-repo` — it rebuilds a set of scripted repos under `/tmp/git-manager-fixtures/<scenario>/` (see `tools/git-fixtures/`, one script per scenario) and launches the app with all of them injected as extra, non-persisted tabs (never written to `localStorage`, so a plain `pnpm dev` is completely unaffected). `pnpm fixture:build` rebuilds the fixtures on disk alone, e.g. to reset a resolved conflict while `pnpm dev` is already running — re-select the tab afterwards to see the fresh state. See `tools/git-fixtures/README.md` for the full mechanism (why the manifest travels through `VITE_DEV_FIXTURES` rather than a runtime file read, and how `TabBar.tsx`/`devFixtureRepos.store.ts` keep injected repos out of persisted state) and the list of current scenarios.

**This is a Tauri desktop app, not a web app.** It cannot be run or previewed in a regular browser — the frontend depends on Tauri IPC (`invoke`) which only exists inside the Tauri webview. Don't attempt to launch or test it via a browser automation tool; use `pnpm dev` to see it running as a native window.

## Architecture

### IPC boundary (the core pattern)

The frontend never talks to git directly — every git/filesystem/network operation goes through a Tauri `#[tauri::command]` in Rust, invoked from TypeScript.

- Rust commands live in `apps/desktop/src-tauri/src/commands/*.rs`, one file per domain (`repo.rs`, `branch.rs`, `commit.rs`, `remote.rs`, `stash.rs`, `rollback.rs`, `fixup.rs`, `rebase.rs`, `undo.rs`, `github.rs`, `ollama.rs`, `ssh.rs`, `submodule.rs`, `themes.rs`, `log.rs`). A command should stay thin (deserialize input, delegate, map errors, serialize output) and call into `apps/desktop/src-tauri/src/services/*.rs` for real `git2` business logic — the service layer exists for diff generation (`git_diff.rs`), stage/unstage/commit/discard (`git_commit.rs`), repo open/build (`git_repo.rs`), commit-graph layout (`git_graph.rs`), branches/tags/create/checkout (`git_branch.rs`), fetch/pull/push/remote CRUD (`git_remote.rs`), stash push/pop/apply/drop/store (`git_stash.rs`), reset/revert (`git_rollback.rs`), fixup/autosquash (`git_fixup.rs`) and rebase-state detection (`git_rebase.rs` — reads `.git/rebase-merge`/`rebase-apply` directly since libgit2's `open_rebase` doesn't support the interactive/merge backend `git` uses by default; see the module doc comment before changing it). `github.rs`/`ollama.rs`/`ssh.rs`/`undo.rs` intentionally have no service — they're HTTP/shell/filesystem-driven at the command boundary rather than `git2` business logic, so there's nothing to extract yet; `run_autosquash` in `fixup.rs` similarly stays a thin command because it needs `tauri::AppHandle` to shell out (its git2-only preview/grouping logic lives in `git_fixup.rs`). When a command file grows or gains non-trivial `git2` logic, prefer extracting a new `services/*.rs` module over growing the command, following the existing pattern. Shared low-level helpers (SHA shortening, git signature) live in `utils.rs` — reuse them instead of re-deriving. `docs/specs/00-architecture.md` predates this layer and is historical, not ground truth; [docs/architecture/14-architecture-refactor-tracking.md](docs/architecture/14-architecture-refactor-tracking.md) is the living record of what's been extracted and why.
- Every new command must be imported and registered in the `tauri::generate_handler![...]` list in [lib.rs](apps/desktop/src-tauri/src/lib.rs) or it won't be callable from the frontend.
- Commands return `Result<T, String>`. Errors are a single `AppError` enum ([error.rs](apps/desktop/src-tauri/src/error.rs)) that serializes to `{ code, message, detail }` JSON via `impl From<AppError> for String`. Add new error variants there rather than stringly-typed errors in commands.
- Shared mutable state (open repos, Ollama config, generation-cancel flag) lives in `AppState` ([state.rs](apps/desktop/src-tauri/src/state.rs)), injected as `tauri::State<'_, AppState>`.
- Long-running operations (Ollama streaming, etc.) push progress via Tauri events (`app_handle.emit(...)`) rather than blocking the `invoke` call; the frontend `listen()`s for them.
- TypeScript DTOs that mirror the Rust `serde` structs live in `packages/git-types/src/index.ts` — when a command's return shape changes, update both sides.

### Frontend layering

`invoke()` calls are not made ad hoc from components. The layering is:

1. `apps/desktop/src/lib/tauri.ts` — one typed wrapper per Tauri command (`invoke<T>('command_name', {...})`).
2. `apps/desktop/src/api/*.api.ts` — domain-grouped re-exports/composition over `lib/tauri.ts` (e.g. `git.api.ts`, `github.api.ts`, `repo.api.ts`). Components, hooks and stores import from here, never from `lib/tauri.ts` or `invoke()` directly. This is a **hard invariant**, not a style preference: several `api*` wrappers also drive undo/redo (`pushAction`/`clearRedo` in `stores/undoHistory.store.ts`) or notify `lib/appEventBus.ts` (achievements/gamification via `callCommand` in `api/service.ts`) — bypassing the wrapper silently drops that behavior. A repo-wide audit (`docs/architecture/14-architecture-refactor-tracking.md`, action 6.5) found and fixed 27 such bypasses, including real silent bugs (e.g. a raw `checkoutBranch()` call that skipped `clearRedo`). Type-only imports from `lib/tauri.ts` (`import type { ... }`) are fine.
3. `apps/desktop/src/hooks/` — data-fetching hooks wrapping the API layer.

Data fetching is in transition between two libraries — **new hooks should use `useSWR`** (per `.agents/AGENTS.md`); a number of older hooks (`useGitLog`, `useGitStatus`, `useBranches`, `useCommitDiff`, `useFileDiff`, `useFileRawContents`, `useSidebarRows`) still use `@tanstack/react-query` and haven't been migrated. Don't mix the two within one hook.

Before adding non-trivial logic to a component, hook, or store, see [.claude/skills/architecture-guardian/SKILL.md](.claude/skills/architecture-guardian/SKILL.md) for the R1 (one file, one responsibility) / R2 (service/API layer) rules and known anti-patterns to avoid repeating.

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
