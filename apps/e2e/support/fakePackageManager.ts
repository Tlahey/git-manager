import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Scratch bin directory prepended to `PATH`, next to the isolated `$HOME`. */
const FAKE_BIN_DIR = '/tmp/git-manager-e2e-fake-bin'

/**
 * The state a scenario's fixture seeds: what `pnpm outdated` reports, keyed the same way pnpm's
 * own recursive (`-r`) JSON is (workspace package path → dependency name → versions) — see
 * `package_outdated.rs`'s `parse_outdated_json` for the shape this must match.
 */
export interface FakeOutdatedState {
  [workspacePackage: string]: {
    [dependencyName: string]: {
      current: string
      wanted: string
      latest: string
      isDeprecated?: boolean
    }
  }
}

/**
 * Installs a fake `pnpm` on `PATH`, ahead of any real one, so the package-updates page and its AI
 * upgrade-risk report are testable without a real npm-registry call.
 *
 * `check_outdated`/`update_packages` (`package_outdated.rs`/`package_update.rs`) shell out to the
 * repo's own package manager by bare name — deliberately, per those modules' own doc comments, so
 * the app makes no outbound network call of its own. `browser.tauri.mock` cannot help here (it only
 * intercepts commands invoked through the test bridge, never a real click's own `invoke()` — see
 * README.md's mocking section) — the same reasoning `fakeAiServer.ts` follows for the AI provider,
 * applied to a subprocess instead of an HTTP endpoint.
 *
 * The fake `pnpm` is a tiny Node script (Node is guaranteed present — pnpm itself needs it) that
 * keeps its answer in a `.e2e-fake-outdated.json` file inside the repo it's asked about, written by
 * the fixture script that wants deterministic drift. `outdated` echoes that file back as pnpm's own
 * JSON shape; `update` mutates it in place (bumping `current` to `wanted` or `latest`), so a
 * following re-scan — which the real "Updates" page always does after a successful update — shows
 * the row actually change, the same way a real `pnpm update` would.
 *
 * Installed once for the whole run (`onPrepare`, alongside `useIsolatedHome`) since `PATH` is only
 * read once, at the shared app process's launch.
 */
export function installFakePackageManager(): string {
  rmSync(FAKE_BIN_DIR, { recursive: true, force: true })
  mkdirSync(FAKE_BIN_DIR, { recursive: true })

  const scriptPath = join(FAKE_BIN_DIR, 'pnpm')
  writeFileSync(
    scriptPath,
    `#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')

const args = process.argv.slice(2)
const command = args[0]
const statePath = path.join(process.cwd(), '.e2e-fake-outdated.json')

function readState() {
  return fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {}
}

if (command === 'outdated') {
  // Real pnpm never re-lists a dependency once it has caught up to \`latest\` — only the entries
  // still behind are reported. Echoing the whole state file unfiltered kept a just-updated
  // package showing as outdated forever, since \`update\` only bumps \`current\` in place rather
  // than removing the entry.
  const state = readState()
  const outdated = {}
  for (const [workspacePackage, deps] of Object.entries(state)) {
    const stillOutdated = Object.fromEntries(
      Object.entries(deps).filter(([, versions]) => versions.current !== versions.latest)
    )
    if (Object.keys(stillOutdated).length > 0) outdated[workspacePackage] = stillOutdated
  }
  process.stdout.write(JSON.stringify(outdated))
  // Real pnpm/npm exit non-zero *because* something is outdated — the caller reads stdout, not
  // the exit code, for the "ok" case (see check_outdated's own comment on this).
  process.exit(Object.keys(outdated).length > 0 ? 1 : 0)
} else if (command === 'update') {
  const toLatest = args.includes('--latest')
  const names = args.slice(1).filter((a) => !a.startsWith('-'))
  const state = readState()
  for (const deps of Object.values(state)) {
    for (const name of names) {
      if (deps[name]) {
        deps[name].current = toLatest ? deps[name].latest : deps[name].wanted
      }
    }
  }
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2))
  process.stdout.write(\`updated \${names.join(', ')}\\n\`)
  process.exit(0)
} else {
  process.exit(0)
}
`,
    'utf8'
  )
  chmodSync(scriptPath, 0o755)
  return FAKE_BIN_DIR
}

/** Overwrites the fixture's fake-outdated state — same file the installed `pnpm` reads/writes. */
export function seedFakeOutdated(repoPath: string, state: FakeOutdatedState): void {
  writeFileSync(join(repoPath, '.e2e-fake-outdated.json'), JSON.stringify(state, null, 2), 'utf8')
}
