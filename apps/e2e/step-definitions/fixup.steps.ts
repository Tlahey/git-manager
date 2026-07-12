import { browser, expect, $ } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'
import '@wdio/native-types'

// The "Given the … fixture repository is opened" step is shared — see repo.steps.ts.

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
