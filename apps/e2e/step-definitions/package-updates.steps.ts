import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { browser, expect, $, $$ } from '@wdio/globals'
import { Given, When, Then } from '@wdio/cucumber-framework'
import { getActiveRepoPath } from '../support/activeRepo'
import { seedFakeOutdated } from '../support/fakePackageManager'

/**
 * Steps for the package-updates page and its AI upgrade-risk report
 * (`features/package-health-updates.feature`) — the one part of the health tool that reaches the
 * network and can change the repo, so it lives on its own destination rather than the offline
 * overview `package-health.steps.ts` covers.
 *
 * Deterministic without a real npm-registry call via the fake `pnpm` `support/fakePackageManager.ts`
 * installs on `PATH` for the whole run (see its own doc comment for why `browser.tauri.mock` can't
 * help here) — this file only has to seed what that fake reports for one scenario.
 */

Given(/^the repository has outdated dependencies ready for the updates demo$/, () => {
  const repoPath = getActiveRepoPath()
  // A real import site: `scan_package_usage` (the upgrade-risk report's "usage" half) walks
  // source files on disk, so the AI risk demo needs one that actually exists — the package
  // manifests alone (which the package-health fixture already has) aren't enough.
  mkdirSync(join(repoPath, 'packages/ui/src'), { recursive: true })
  writeFileSync(
    join(repoPath, 'packages/ui/src/index.ts'),
    "import chalk from 'chalk'\n\nexport const paint = () => chalk.green('ok')\n"
  )
  seedFakeOutdated(repoPath, {
    'packages/ui': {
      // In range: `wanted` already reaches `latest`, so a plain update leaves nothing more to do.
      'left-pad': { current: '1.3.0', wanted: '1.3.1', latest: '1.3.1', isDeprecated: true },
      // Major only: `wanted` stays at `current`, so only the "latest" jump is offered.
      chalk: { current: '4.1.0', wanted: '4.1.0', latest: '5.3.0' },
    },
  })
})

When(/^I open the package updates page$/, async () => {
  await $('[data-testid="health-check-updates"]').waitForDisplayed({ timeout: 10000 })
  await $('[data-testid="health-check-updates"]').click()
  await $('[data-testid="package-updates-page"]').waitForDisplayed({ timeout: 10000 })
})

/** A row is matched by the package name it displays — `package-update-row` repeats once more
 *  than one package is outdated, same reasoning as this suite's other per-name row lookups. */
async function findRowByPackage(name: string) {
  return browser.waitUntil(
    async () => {
      const rows = await $$('[data-testid="package-update-row"]')
      for (const row of rows) {
        if ((await row.getText()).includes(name)) return row
      }
      return false
    },
    { timeout: 20000, timeoutMsg: `no outdated-package row mentions "${name}"` }
  )
}

Then(/^the updates page lists "([^"]*)" as outdated$/, async (name: string) => {
  await findRowByPackage(name)
})

When(/^I update "([^"]*)" to the in-range version$/, async (name: string) => {
  const row = await findRowByPackage(name)
  const button = row.$('[data-testid="update-in-range"]')
  await button.waitForClickable({ timeout: 10000 })
  await button.click()
})

Then(/^the updates page no longer lists "([^"]*)"$/, async (name: string) => {
  await browser.waitUntil(
    async () => {
      const rows = await $$('[data-testid="package-update-row"]')
      for (const row of rows) {
        if ((await row.getText()).includes(name)) return false
      }
      return true
    },
    { timeout: 20000, timeoutMsg: `a row for "${name}" is still listed` }
  )
})

When(/^I view the release notes for "([^"]*)"$/, async (name: string) => {
  const row = await findRowByPackage(name)
  const button = row.$('[data-testid="toggle-changelog"]')
  await button.waitForClickable({ timeout: 10000 })
  await button.click()
  await $('[data-testid="package-changelog-panel"]').waitForDisplayed({ timeout: 10000 })
})

When(/^I run the upgrade risk report$/, async () => {
  const button = $('[data-testid="upgrade-risk-run"]')
  await button.waitForClickable({ timeout: 10000 })
  await button.click()
  // No timeout on this call by design (see `upgradeRiskFeature`'s own comment) — the fake AI
  // server answers instantly, but the scan phase ahead of it is a real filesystem walk.
  await $('[data-testid="upgrade-risk-result"]').waitForDisplayed({ timeout: 20000 })
})

Then(/^the upgrade risk report names the affected file "([^"]*)"$/, async (path: string) => {
  await expect($('[data-testid="upgrade-risk-where"]')).toHaveText(path, { containing: true })
})
