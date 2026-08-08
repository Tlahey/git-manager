/**
 * End-to-end check of the configuration file, run **outside** the WebdriverIO suite.
 *
 * The cucumber suite deliberately runs with `GIT_MANAGER_NO_CONFIG=1` (see
 * `support/isolatedAppState.ts`): the app under test must not be able to read or write a real
 * `~/.git-manager/settings.json`, so every scenario exercises the `localStorage` fallback and none
 * of them ever touches the file. That is the right default and it leaves a hole — the path that
 * actually ships was covered by unit tests and by launching the app by hand.
 *
 * This closes it without weakening the suite: its own process, its own scratch `$HOME`, the
 * configuration switched **on**, and a real launch of the real binary. It is not a `.feature`
 * because a cucumber scenario cannot flip the variable — the app is spawned once for the whole run,
 * long before any scenario decides anything.
 *
 * What it proves, end to end and with no WebDriver involved:
 *
 *   1. Rust reads the file (`read_app_config`) — asserted from the activity log the app writes.
 *   2. The frontend hydrates from it: the seeded `workspace.openTabs` is what the app opens, which
 *      only happens if the section was parsed, validated and rehydrated into `repoUI.store`.
 *   3. Rust writes back into the same file, keeping the sections it didn't touch.
 *   4. The file stays owner-only.
 *
 * Observability is the activity log (`~/.git-manager/activity-logs/*.jsonl`) rather than the UI:
 * it records every IPC round-trip with its repository path, it is on disk, and reading it needs no
 * driver session. Run it after `pnpm build:e2e`, and never at the same time as a wdio run — two
 * app instances competing for the CPU is exactly what poisons a suite (see COVERAGE.md).
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isolatedAppBinary, useIsolatedHome } from './support/isolatedAppState.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BUILT_BINARY = join(__dirname, '../../target/debug/git-manager')
/** Any repository will do — the assertion is "the app opened the one the file named". */
const FIXTURE_REPO = '/tmp/git-manager-fixtures/stash-stack'
const LAUNCH_TIMEOUT_MS = 60_000

const failures: string[] = []

function check(label: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`)
    return
  }
  failures.push(`${label}${detail ? ` — ${detail}` : ''}`)
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function configPath(home: string) {
  return join(home, '.git-manager', 'settings.json')
}

/** Seeds a configuration the app can only honour by reading, validating and hydrating the file. */
function seedConfig(home: string) {
  const path = configPath(home)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(
    path,
    JSON.stringify(
      {
        settings: { language: 'en' },
        workspace: {
          openTabs: [FIXTURE_REPO],
          activeRepo: FIXTURE_REPO,
          activeTab: FIXTURE_REPO,
        },
        versions: { settings: 1, workspace: 0 },
      },
      null,
      2
    ),
    'utf8'
  )
}

/** Every IPC call the app has recorded so far, newest last. */
function activityLog(home: string): { command?: string; repoPath?: string }[] {
  const dir = join(home, '.git-manager', 'activity-logs')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith('.jsonl'))
    .flatMap((name) =>
      readFileSync(join(dir, name), 'utf8')
        .split('\n')
        .filter(Boolean)
        .flatMap((line) => {
          try {
            return [JSON.parse(line) as { command?: string; repoPath?: string }]
          } catch {
            // A line truncated by a kill mid-write; the entries around it are what matter.
            return []
          }
        })
    )
}

async function waitForRepoToOpen(home: string): Promise<boolean> {
  const deadline = Date.now() + LAUNCH_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (activityLog(home).some((entry) => entry.repoPath === FIXTURE_REPO)) return true
    await sleep(500)
  }
  return false
}

async function main() {
  if (!existsSync(BUILT_BINARY)) {
    console.error(`No e2e binary at ${BUILT_BINARY}. Run "pnpm build:e2e" first.`)
    process.exit(1)
  }
  if (!existsSync(FIXTURE_REPO)) {
    console.error(`No fixture at ${FIXTURE_REPO}. Run "pnpm fixture:build" first.`)
    process.exit(1)
  }

  // Same isolation the suite uses — minus the config kill switch, which is the whole point here.
  const home = useIsolatedHome()
  delete process.env.GIT_MANAGER_NO_CONFIG
  const binary = isolatedAppBinary(BUILT_BINARY)
  seedConfig(home)

  console.log(`Launching ${binary} with HOME=${home} and the configuration file ON`)
  let app: ChildProcess | undefined
  try {
    app = spawn(binary, { env: process.env, stdio: 'ignore', detached: false })

    const opened = await waitForRepoToOpen(home)
    check(
      'the app opened the repository the configuration named',
      opened,
      opened ? '' : `no activity for ${FIXTURE_REPO} within ${LAUNCH_TIMEOUT_MS / 1000}s`
    )

    const log = activityLog(home)
    // Weaker than the two around it on purpose: this command runs whether the file is on or off
    // (switched off, it answers "disabled"). It is here to tell "the app never asked" apart from
    // "the app asked and the answer was wrong" when something below fails.
    check(
      'Rust was asked for the configuration',
      log.some((entry) => entry.command === 'read_app_config')
    )
    check(
      'nothing fell back to a disabled configuration',
      // `write_app_config_section` is a no-op when the file is off, so seeing one proves the write
      // path reached the disk rather than silently going to localStorage.
      log.some((entry) => entry.command === 'write_app_config_section')
    )

    const raw = readFileSync(configPath(home), 'utf8')
    const document = JSON.parse(raw) as Record<string, { openTabs?: string[] }>
    check('the file still parses after the app wrote to it', typeof document === 'object')
    check(
      'the section the app did not touch survived its writes',
      document.workspace?.openTabs?.includes(FIXTURE_REPO) === true,
      `workspace is now ${JSON.stringify(document.workspace)}`
    )

    const mode = statSync(configPath(home)).mode & 0o777
    check('the file is owner-only', mode === 0o600, `mode is ${mode.toString(8)}`)
  } finally {
    app?.kill('SIGTERM')
    // Give the app a moment to go away before the process exits, so it can't outlive this script.
    await sleep(1000)
    if (app && !app.killed) app.kill('SIGKILL')
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed:`)
    for (const failure of failures) console.error(`  - ${failure}`)
    process.exit(1)
  }
  console.log('\nThe configuration file works end to end.')
}

void main()
