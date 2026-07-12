import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { browser, expect, $ } from '@wdio/globals'
import { Given, When, Then } from '@wdio/cucumber-framework'
import '@wdio/native-types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_ROOT = '/tmp/git-manager-fixtures'
const SCENARIOS_DIR = join(__dirname, '../../../tools/git-fixtures/scenarios')

Given(/^the "([^"]*)" fixture repository is built and opened$/, async (fixtureName: string) => {
  // Rebuild the real, disposable repo fresh (see tools/git-fixtures/scenarios/<name>.sh) —
  // a real repo can't hide a libgit2 bug the way a mocked git backend could.
  execFileSync('bash', [join(SCENARIOS_DIR, `${fixtureName}.sh`)], { stdio: 'inherit' })
  const repoPath = join(FIXTURE_ROOT, fixtureName)

  // Opening a repo normally goes through a native OS folder picker (outside the webview, and
  // not interceptable here — see README.md "Driving UI state without a real native dialog").
  // Instead seed the same zustand/persist localStorage key the app writes to, then reload —
  // from here on every render, query and IPC call is the real thing (RepoView's own mount
  // effect calls the real open_repo, the banner a real get_pending_fixups, etc.).
  await browser.execute(
    (key: string, value: string) => localStorage.setItem(key, value),
    'git-manager-repos-ui',
    JSON.stringify({
      state: { openTabs: [repoPath], activeRepo: repoPath, activeTab: repoPath },
      version: 0,
    })
  )
  await browser.execute(() => window.location.reload())

  await $('[data-testid="pending-fixups-banner"]').waitForDisplayed({ timeout: 10000 })
})

Then(/^the pending fixups banner reports (\d+) fixups$/, async (count: string | number) => {
  const banner = $('[data-testid="pending-fixups-banner"]')
  await banner.waitForDisplayed({ timeout: 10000 })
  // Cucumber can hand a numeric capture back as a number; toContain on a string needs a string.
  expect(await banner.getText()).toContain(String(count))
})

When(/^I open the autosquash preview$/, async () => {
  await $('[data-testid="autosquash-button"]').click()
  await $('[data-testid="autosquash-preview-dialog"]').waitForDisplayed()
  const groups = $('[data-testid="autosquash-preview-groups"]')
  await browser.waitUntil(async () => (await groups.getText()).length > 0, {
    timeout: 10000,
    timeoutMsg: 'The autosquash preview stayed empty',
  })
})

Then(/^the preview groups the commit "([^"]*)"$/, async (subject: string) => {
  const groups = $('[data-testid="autosquash-preview-groups"]')
  expect(await groups.getText()).toContain(subject)
})

Then(/^the preview does not show the commit "([^"]*)"$/, async (subject: string) => {
  const groups = $('[data-testid="autosquash-preview-groups"]')
  expect(await groups.getText()).not.toContain(subject)
})

Then(/^the preview matches the visual snapshot "([^"]*)"$/, async (tag: string) => {
  // Stabilise fonts + kill animations before capturing (see README.md "Visual snapshots") so
  // two renders of the same state don't drift by a fraction of a percent from rendering jitter.
  await browser.execute(async () => {
    await document.fonts.ready
  })
  await browser.execute(() => {
    if (document.getElementById('wdio-vrt-stabilise')) return
    const style = document.createElement('style')
    style.id = 'wdio-vrt-stabilise'
    style.textContent =
      '*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }'
    document.head.appendChild(style)
  })

  const groups = $('[data-testid="autosquash-preview-groups"]')
  await expect(groups).toMatchElementSnapshot(tag, 1)
})
