import { symlinkSync, rmSync as rmFile, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { homedir } from 'node:os'

/** Scratch home the whole run lives in, next to the git fixtures. */
const E2E_HOME = '/tmp/git-manager-e2e-home'

/** The process name {@link isolatedAppBinary} runs the suite under — see its own doc comment for
 *  why WebKit keys its on-disk store off this rather than `$HOME` or the bundle identifier. */
const ISOLATED_PROCESS_NAME = 'git-manager-e2e'

/**
 * The real, developer-machine home directory, captured at module load — before
 * {@link useIsolatedHome} can overwrite `$HOME` for the rest of the run.
 *
 * `os.homedir()` itself reads `$HOME` on POSIX, so calling it *after* `useIsolatedHome()` (as
 * {@link clearIsolatedWebKitStore} originally did) silently resolves the scratch home instead —
 * the function then finds nothing to delete under it and does nothing, no error, no isolation.
 * A module-level constant makes that mistake impossible to reintroduce by only reordering two
 * calls in `wdio.conf.ts`.
 */
const REAL_HOME = homedir()

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
 * Clears WebKit's own on-disk store for the isolated e2e process, before it can carry state from
 * one run into the next.
 *
 * {@link useIsolatedHome} resets `$HOME` and {@link isolatedAppBinary} runs the suite under a
 * renamed process so it never touches the developer's real `~/Library/WebKit/git-manager` — but
 * WebKit resolves that directory from the real macOS user profile, ignoring the `$HOME` env
 * override, so wiping the scratch home does nothing for the isolated process's *own* store at
 * `~/Library/WebKit/git-manager-e2e` (and its sibling in `~/Library/Caches`). Confirmed on disk:
 * both survive across separate `wdio run` invocations, so a persisted boolean setting toggled in
 * one run is still whatever that run left it as when the next one starts — which showed up as an
 * alternating pass/fail on a settings checkbox assertion, because each run's own "turn it off"
 * click was relative to the previous run's leftover value rather than a real default.
 *
 * Deletes only a path whose final segment is exactly {@link ISOLATED_PROCESS_NAME}, so a typo or a
 * future refactor here can't reach for the developer's own `git-manager` (no `-e2e` suffix)
 * entries sitting right next to these.
 */
export function clearIsolatedWebKitStore(): void {
  for (const dir of [join(REAL_HOME, 'Library', 'WebKit'), join(REAL_HOME, 'Library', 'Caches')]) {
    const target = join(dir, ISOLATED_PROCESS_NAME)
    if (basename(target) !== ISOLATED_PROCESS_NAME) continue
    rmSync(target, { recursive: true, force: true })
  }
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
 * Turns the OS keychain off for the run: with `GIT_MANAGER_NO_KEYCHAIN` set, every credential the
 * app stores goes into a process-local map that dies with it (see
 * `src-tauri/src/services/credential_store.rs`).
 *
 * The same reasoning as {@link disableAppConfigFile}, applied to the one piece of state that is
 * *not* under the scratch `$HOME`: the login keychain is per-user, not per-home, so isolating `HOME`
 * does nothing for it. Without this a scenario that connects a GitHub account would write into the
 * **developer's own keychain** — and it would not even take a deliberate sign-in, since the app
 * migrates any token it finds in a seeded `localStorage` snapshot on the next load.
 *
 * A test run must not be able to touch, overwrite or leave anything in the credentials a person
 * actually uses. Inherited by the app because it is spawned as a child of this process.
 */
export function disableKeychain(): void {
  process.env.GIT_MANAGER_NO_KEYCHAIN = '1'
}

/**
 * Points every GitHub API call the app makes at a local fake server instead of the real
 * `api.github.com` — the e2e-only redirect `services/github_api.rs`'s `e2e_redirect` performs after
 * its own `guard_url` has validated the frontend's request, so this changes nothing about *what* the
 * app asks for, only where the answer comes from. See
 * `docs/architecture/2026-08-e2e-github-api-mock-mode.md` for why this is a Rust-side env var rather
 * than a repointable setting the way the AI provider URL is.
 *
 * Must be set before the app process is spawned, same as {@link disableKeychain} — the app reads it
 * per-request, but only ever inherits it from the environment it was launched in.
 */
export function redirectGithubApi(url: string): void {
  process.env.GIT_MANAGER_GITHUB_API_BASE_URL = url
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
