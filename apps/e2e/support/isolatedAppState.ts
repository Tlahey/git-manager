import { symlinkSync, rmSync as rmFile, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Scratch home the whole run lives in, next to the git fixtures. */
const E2E_HOME = '/tmp/git-manager-e2e-home'

/**
 * Gives the run its own `$HOME`, so everything the Rust side keys off it is isolated and starts
 * empty: `~/.git-manager/` — the activity log, the AI logs, the archived daily summaries, the user
 * themes (`commands/themes.rs` and friends read `HOME` before falling back to `home_dir()`).
 *
 * Without it the suite both inherits and corrupts the developer's real state. It was `action-journal`
 * that made this concrete: it asserts "exactly one filtered action row" and found three, because
 * every previous run's entries were still in `~/.git-manager/activity-logs`.
 *
 * Safe for git: the fixture scripts write `user.name`/`user.email` into each repo's *local* config
 * (`tools/git-fixtures/lib.sh`), never `--global`, so no fixture commit needs a reachable
 * `~/.gitconfig`. The app is spawned as a child of this process, so the variable is inherited.
 */
export function useIsolatedHome(): string {
  rmSync(E2E_HOME, { recursive: true, force: true })
  mkdirSync(E2E_HOME, { recursive: true })
  process.env.HOME = E2E_HOME
  return E2E_HOME
}

/**
 * Turns the app's configuration file off for the run: with `GIT_MANAGER_NO_CONFIG` set, nothing
 * reads or writes `~/.git-manager/settings.json` and every persisted store falls back to the
 * webview's `localStorage` (see `lib/appConfig/`).
 *
 * Belt to {@link useIsolatedHome}'s braces, and not redundant with it. The scratch `$HOME` says
 * *where* the config would be; this says the app under test has no configuration file at all — so a
 * scenario cannot leave one behind, a change to how `$HOME` is resolved cannot quietly point a run
 * at the developer's real config, and the suite's own state stays where it has always been. Every
 * seed in `support/settings.ts` and `support/scenarioBaseline.ts` writes `localStorage` for exactly
 * that reason; flipping this variable off would strand all of them.
 *
 * Inherited by the app because it is spawned as a child of this process — same mechanism as `HOME`.
 */
export function disableAppConfigFile(): void {
  process.env.GIT_MANAGER_NO_CONFIG = '1'
}

/**
 * Runs the suite against a copy of the built binary under a different name, and returns its path.
 *
 * This is what isolates **localStorage** — every persisted zustand slice: the theme, saved
 * repositories, pinned branches, undo history, notifications, and `git-manager-game-store`, which
 * holds the rewards XP and unlocked trophies.
 *
 * `$HOME` alone does not do it. WebKit's per-app store sits at `~/Library/WebKit/<app>`, and for a
 * `--no-bundle` debug binary — which is what `build:e2e` produces — `<app>` is the *process name*,
 * not the bundle identifier (the neighbouring entries in that directory are bundle ids like
 * `com.raycast.macos`; git-manager's is plainly `git-manager`). Overriding `identifier` in
 * `tauri.e2e.conf.json` would therefore change nothing here, and renaming the cargo artifact means
 * fighting the build config. Copying the binary is the whole trick: run it as `git-manager-e2e` and
 * WebKit hands it `~/Library/WebKit/git-manager-e2e` instead of the developer's real store.
 *
 * Consequence worth knowing: a run no longer writes into a real install, and no longer reads one —
 * so the same suite behaves the same on a fresh machine as on a developer's, which it did not
 * before.
 */
export function isolatedAppBinary(builtBinaryPath: string): string {
  const isolated = join(dirname(builtBinaryPath), 'git-manager-e2e')
  // A symlink, not a copy: a renamed *copy* of the binary is a new, unsigned file, and macOS
  // re-verifies it from scratch on every launch — which made the whole suite roughly three times
  // slower and turned ordinary "click, then wait for the dialog" steps into timeouts. The symlink
  // keeps the original file (and its signature) while still presenting `git-manager-e2e` as the
  // process name, which is all WebKit keys its store off.
  rmFile(isolated, { force: true })
  symlinkSync(builtBinaryPath, isolated)
  return isolated
}
