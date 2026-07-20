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
pnpm lint                 # Oxlint across all packages (turbo)
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

- Rust commands live in `apps/desktop/src-tauri/src/commands/*.rs`, one file per domain (`repo.rs`, `branch.rs`, `commit.rs`, `remote.rs`, `stash.rs`, `rollback.rs`, `fixup.rs`, `rebase.rs`, `undo.rs`, `github.rs`, `ai.rs`, `ssh.rs`, `submodule.rs`, `themes.rs`, `log.rs`). A command should stay thin (deserialize input, delegate, map errors, serialize output) and call into `apps/desktop/src-tauri/src/services/*.rs` for real `git2` business logic — the service layer exists for diff generation (`git_diff.rs`), stage/unstage/commit/discard (`git_commit.rs`), repo open/build (`git_repo.rs`), commit-graph layout (`git_graph.rs`), branches/tags/create/checkout (`git_branch.rs`), fetch/pull/push/remote CRUD (`git_remote.rs`), stash push/pop/apply/drop/store (`git_stash.rs`), reset/revert (`git_rollback.rs`), fixup/autosquash (`git_fixup.rs`), rebase-state detection (`git_rebase.rs` — reads `.git/rebase-merge`/`rebase-apply` directly since libgit2's `open_rebase` doesn't support the interactive/merge backend `git` uses by default; see the module doc comment before changing it), AI git-context gathering (`ai_context.rs` — snapshots the staged/working diff + changed files for a feature's prompt, plus the repo's own commit convention via `ai_convention.rs` (a commitlint config / `package.json` `commitlint` key / git `commit.template`) and a sample of recent non-merge commit subjects, so features can make the model match the project's actual commit style — which may be free-form, not Conventional Commits), and AI provider dispatch (`ai_provider.rs`'s `AiProvider` trait — a *dumb transport* that relays a prebuilt system/user prompt via `generate` (streaming) or `complete` (one-shot); `ai_openai_compatible.rs`, `ai_anthropic.rs`, `ai_registry.rs` — one implementation per wire *protocol*, not per user-facing preset, so e.g. Ollama/LM Studio/OpenAI share `ai_openai_compatible.rs`). The backend owns **no** AI instructions or prompt-building — those live per-feature in `packages/ai`; the generic `ai_generate_stream`/`ai_complete`/`get_ai_context` commands mean a new AI feature needs no Rust change unless it needs new git data. `github.rs`/`ssh.rs`/`undo.rs` intentionally have no service — they're HTTP/shell/filesystem-driven at the command boundary rather than `git2` business logic, so there's nothing to extract yet; `run_autosquash` in `fixup.rs` similarly stays a thin command because it needs `tauri::AppHandle` to shell out (its git2-only preview/grouping logic lives in `git_fixup.rs`). When a command file grows or gains non-trivial `git2` logic, prefer extracting a new `services/*.rs` module over growing the command, following the existing pattern. Shared low-level helpers (SHA shortening, git signature) live in `utils.rs` — reuse them instead of re-deriving. `docs/specs/00-architecture.md` predates this layer and is historical, not ground truth; [docs/architecture/14-architecture-refactor-tracking.md](docs/architecture/14-architecture-refactor-tracking.md) is the living record of what's been extracted and why.
- Every new command must be imported and registered in the `tauri::generate_handler![...]` list in [lib.rs](apps/desktop/src-tauri/src/lib.rs) or it won't be callable from the frontend.
- Commands return `Result<T, String>`. Errors are a single `AppError` enum ([error.rs](apps/desktop/src-tauri/src/error.rs)) that serializes to `{ code, message, detail }` JSON via `impl From<AppError> for String`. Add new error variants there rather than stringly-typed errors in commands.
- Shared mutable state (open repos, generation-cancel flag) lives in `AppState` ([state.rs](apps/desktop/src-tauri/src/state.rs)), injected as `tauri::State<'_, AppState>` — AI provider config (URL, model, API key, temperature, prompt customization) is passed as a per-call command argument instead, built fresh from `settings.ai` on every call, not synced into `AppState` ahead of time (a prior version did that and the sync was never actually wired, so every setting but `model` was silently ignored).
- Long-running operations (AI generation streaming, etc.) push progress via Tauri events (`app_handle.emit(...)`) rather than blocking the `invoke` call; the frontend `listen()`s for them.
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

### UI components: consume-first (do not re-invent primitives)

**Before writing any UI, reach for the shared component libraries — do not hand-roll it.**

- **Import from `@git-manager/ui` first** (low-level primitives) and **`@git-manager/components`** (composed, still domain-agnostic building blocks). `packages/ui/src/index.ts` is the source-of-truth inventory — read it before styling anything. It already ships `Button`, `Badge`/`NumberBadge`, `Chip`, `Tag`, `Alert`, `Card`, `Input`, `Textarea`, `NativeSelect`, `Select`, `Checkbox`, `Switch`, `RadioGroup`, `Label`, `Skeleton`, `Spinner`, `Kbd`, `Progress`, `Avatar`, `Dialog`, `Popover`, `Tooltip` (+ `useImperativeTooltip`), `DropdownMenu`, `ContextMenu`, `Command`, `ScrollArea`, `Separator`, `toast`/`Toaster`, and `cn`.
- **Do not re-implement a primitive with raw Tailwind** (an ad-hoc `<button className="...">`, a bespoke tooltip, a custom badge/pill, a `title=` attribute used as a tooltip, etc.). The shared components are **accessibility-audited** — APCA contrast gates enforced by `@git-manager/theme`, correct ARIA roles, keyboard/focus support. Re-rolling one silently drops those guarantees and forks the design system. If a shared component looks like it's _almost_ right, extend it (a new variant/prop) rather than cloning it locally.
- **If a genuinely new primitive is needed, build it _in the package_, never inline in the app.** Add it to `packages/ui` (primitive) or `packages/components` (composed), **validate every case** — all variants/states, accessibility (contrast + ARIA + keyboard), and a co-located `*.test.tsx` — export it via the package `index.ts`, then consume it from `apps/desktop`. A one-off styled element inside a feature component is the anti-pattern this rule exists to prevent.
- See the **`reusable-components`** skill for the placement decision (`ui` vs `components` vs stays in `apps/desktop`) and **`architecture-guardian`** for splitting.

### Internationalization (i18n): never hardcode user-facing text

**Every user-visible string MUST come from `@git-manager/i18n` via `t()` — never write a literal in JSX text or in a `title=`/`aria-label`/`placeholder`/`label` attribute.** This is a hard invariant: the app ships `en` and `fr` and a hardcoded string is simply untranslatable (and invisible to the parity check below).

- Use `const { t } = useTranslation('<namespace>')` and reference keys by name. Namespaces: `common`, `git`, `dashboard`, `settings`, `errors`, `launchpad` (the Pull Requests / Launchpad feature). `defaultNS` is `common`; cross-reference another namespace with a prefix, e.g. `t('git:actions.close')`.
- **Add each key to BOTH `packages/i18n/locales/en/<ns>.json` and `.../fr/<ns>.json`** — en↔fr key parity is enforced and must stay at 0 mismatches (flatten both files and diff the key sets). Never add a key to only one locale.
- **Module-level label maps** (e.g. `const STATUS_LABELS = { open: 'Open' }`) can't call `t()` — store an i18n **key** instead (`{ open: 'status.open' }`) and resolve with `t(map[x])` inside the component.
- **Tests run against real English copy.** `vitest.setup.ts` calls `initI18n('en')`, so `t()` returns the actual English string (interpolation included) — assert the **real visible text** (`getByText('Login with GitHub')`), never a raw key. This keeps tests meaningful: they catch wrong/blank copy and verify injected content (counts, dates, names). To test another locale, use `renderWithLanguage(ui, 'fr')` from [apps/desktop/src/test/i18n.tsx](apps/desktop/src/test/i18n.tsx); it resets to English after each test.
  - **Do NOT** add `vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (k) => k }) }))`. That old pattern (still present in ~87 legacy test files, pre-global-provider) makes `t` return the key, defeating content assertions — remove it and switch to real-text assertions when you touch such a file.
- **Intentionally left untranslated** (do not wrap these in `t()`): proper nouns (Git Manager, GitHub, Launchpad, theme names), git jargon kept in English in toolbars (Push/Pull/Fetch/Commit/Stash/Squash/SHA, `ours`/`theirs`), macOS system sound names, and example placeholder values (URLs, branch names like `main`).

### Monorepo packages

| Package              | Purpose                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| `apps/desktop`       | The Tauri app (Rust backend in `src-tauri/`, React frontend in `src/`)                                         |
| `packages/git-types` | Shared TypeScript DTOs mirroring the Rust `serde` structs used over IPC                                        |
| `packages/ai`        | The app's AI brain: `AiPresetId`/`AiProtocol` + `AI_PRESETS` registry, the connection-only `AiConnectionConfig` (persisted in Settings — no instructions/temperature there), and the **feature runtime** (`AiFeature` descriptors under `features/`, each owning its instruction + temperature + prompt-building, and — for completion features — an optional JSON `schema` for structured output; `createStreamingService`/`createCompletionService` turn one into a typed "service per feature"). Two shipped features: `commitMessageFeature` (streaming, one commit's message) and `fileGroupingFeature` (completion + JSON schema → `ProposedCommit[]`, splitting all working changes into a reviewable commit plan). Add a new AI capability here, not in Rust. |
| `packages/i18n`      | `react-i18next` setup + `en`/`fr` locale JSON (namespaces: `common`, `git`, `dashboard`, `settings`, `errors`, `launchpad`) — all user-facing text goes through here, never hardcoded (see i18n rules above) |
| `packages/ui`        | shadcn/ui + Radix primitive components, Tailwind-based (accessibility-audited — consume before hand-rolling)   |
| `packages/components` | Composed, domain-agnostic presentational building blocks one level up from `ui` (`SplitButton`, `StepRailRow`, `useFileTree`…) — no IPC/store/domain types                                                    |
| `packages/config`    | Shared Oxlint config, Tailwind preset, base `tsconfig.json`                                                    |

### State management

Zustand stores in `apps/desktop/src/stores/` hold client-side UI/app state (open repos, settings, undo history, pinned branches, notifications, etc.) — separate from server-state hooks (SWR/React Query), which own anything sourced from a Tauri command.

### Security-relevant conventions

- SSH keys and HTTPS tokens are handled only in Rust — never pass credentials into the JS layer.
- Protected branches and destructive-action confirmations (hard reset requires typing `RESET`, force-push is explicit opt-in) are enforced patterns to preserve when touching rollback/reset/push commands ([rollback.rs](apps/desktop/src-tauri/src/commands/rollback.rs), [remote.rs](apps/desktop/src-tauri/src/commands/remote.rs)).
- No outbound network calls other than to the configured AI provider (Ollama at `http://localhost:11434` by default — see `packages/ai`'s `AI_PRESETS` for the other presets listed in Settings, only Ollama is actually implemented today) and GitHub OAuth device flow ([github.rs](apps/desktop/src-tauri/src/commands/github.rs)).

### Conventions

- Conventional Commits (`feat:`, `fix:`, `chore:`, ...) for commit messages.
- TypeScript strict mode, no `any`.
- Naming: camelCase in TS, snake_case in Rust, kebab-case filenames.
- PRs target `dev`, not `main` (per README; note the current default branch in this checkout is `main`).
