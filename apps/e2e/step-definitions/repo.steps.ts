import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { browser, $ } from '@wdio/globals'
import { Given } from '@wdio/cucumber-framework'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_ROOT = '/tmp/git-manager-fixtures'
const SCENARIOS_DIR = join(__dirname, '../../../tools/git-fixtures/scenarios')

// Generic "open a fixture repo" step, reused across features. Opening a repo normally goes
// through a native OS folder picker (outside the webview, and not interceptable here — see
// README.md "Driving UI state without a real native dialog"). Instead we build the real,
// disposable fixture fresh, seed the same zustand/persist localStorage key the app writes to,
// then reload — from here on every render, query and IPC call is the real thing.
Given(/^the "([^"]*)" fixture repository is opened$/, async (fixtureName: string) => {
  execFileSync('bash', [join(SCENARIOS_DIR, `${fixtureName}.sh`)], { stdio: 'inherit' })
  const repoPath = join(FIXTURE_ROOT, fixtureName)

  await browser.execute(
    (key: string, value: string) => localStorage.setItem(key, value),
    'git-manager-repos-ui',
    JSON.stringify({
      state: { openTabs: [repoPath], activeRepo: repoPath, activeTab: repoPath },
      version: 0,
    })
  )
  await browser.execute(() => window.location.reload())

  // RepoView's root renders for any opened repo — a fixture-agnostic "repo view is loaded"
  // signal, unlike the fixup banner which only exists for the fixup-chain fixture.
  await $('[data-testid="repo-view"]').waitForDisplayed({ timeout: 15000 })
})
