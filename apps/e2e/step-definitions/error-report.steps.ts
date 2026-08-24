import { $, $$, browser, expect } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'

When(/^I open the activity logs from the report button$/, async () => {
  await $('[data-testid="footer-report-problem-button"]').click()
  await $('[data-testid="activity-logs-page"]').waitForDisplayed({ timeout: 10000 })
})

Then(/^the activity log shows only failed operations$/, async () => {
  const rows = await $$('[data-testid="activity-log-row"]')
  // The button's whole job: it lands on the failures, so the reporter picks one rather than the
  // app guessing which error they meant.
  await expect(rows.length).toBeGreaterThan(0)
  for (const row of rows) {
    await expect(row).toHaveAttribute('data-status', 'error')
  }
})

When(/^I report the selected activity log entry$/, async () => {
  const button = $('[data-testid="activity-detail-report"]')
  await button.waitForDisplayed({ timeout: 10000 })
  await button.click()
  await $('[data-testid="error-report-dialog"]').waitForDisplayed({ timeout: 10000 })
})

Then(/^the report dialog shows what will be sent$/, async () => {
  const preview = $('[data-testid="error-report-preview"]')
  await preview.waitForDisplayed({ timeout: 10000 })
  // The fingerprint marker is the first line of every report, and the duplicate search looks for
  // it — if it is missing from the preview it is missing from what gets posted.
  await expect(preview).toHaveText('gm-fp:', { containing: true })
  await expect(preview).toHaveText('### Error', { containing: true })
  await expect($('[data-testid="error-report-description"]')).toBeDisplayed()
})

Then(/^the report dialog hides the repository path$/, async () => {
  const preview = $('[data-testid="error-report-preview"]')
  const body = await preview.getText()
  // The fixtures live under /tmp/git-manager-fixtures/<scenario>; nothing of that shape may
  // survive into a body destined for a public tracker.
  await expect(body).not.toContain('/tmp/git-manager-fixtures')
  await expect(body).toContain('<repo:')
})

When(/^I describe the report as "([^"]*)"$/, async (description: string) => {
  await $('[data-testid="error-report-description"]').setValue(description)
})

When(/^I submit the error report$/, async () => {
  const button = $('[data-testid="error-report-submit"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

Then(/^the error report shows a created issue link$/, async () => {
  await $('[data-testid="error-report-view-issue"]').waitForDisplayed({ timeout: 15000 })
})

// `apiFindReportedIssue` is keyed on the same fingerprint the first report's body was stamped
// with — this is the duplicate-detection half of the feature's two "load-bearing" mechanisms
// (see the feature README), proven by actually reproducing the same failure twice rather than
// hand-seeding a fixture issue with a guessed marker.
Then(/^the error report shows a duplicate of the previously filed issue$/, async () => {
  await $('[data-testid="error-report-duplicate"]').waitForDisplayed({ timeout: 15000 })
})

// Flips `window.__e2eCrashStore` (exposed by `main.tsx`, only in an e2e build), which makes
// `E2ECrashTrigger` throw on its next render — the only way to deliberately reach
// `AppErrorBoundary`'s fallback from outside the app. See E2ECrashTrigger.tsx / git-manager#439.
When(/^I force a render crash$/, async () => {
  await browser.execute(() => {
    const store = (
      window as unknown as { __e2eCrashStore?: { getState: () => { trigger: () => void } } }
    ).__e2eCrashStore
    if (!store) throw new Error('__e2eCrashStore is not exposed on window')
    store.getState().trigger()
  })
})

Then(/^the crash screen is shown$/, async () => {
  await $('[data-testid="app-error-boundary"]').waitForDisplayed({ timeout: 10000 })
})

When(/^I click the crash screen's report button$/, async () => {
  const button = $('[data-testid="app-crash-report"]')
  await button.waitForDisplayed({ timeout: 10000 })
  await button.click()
  await $('[data-testid="error-report-dialog"]').waitForDisplayed({ timeout: 10000 })
})

// The crash draft carries the last activity log entries as context, but no `correlationLabel` —
// unlike every entry the log-based flow reports, which always names the action it came from. That
// absence is what makes this mount path distinguishable from the one `error-report.feature`'s
// other scenarios already cover.
Then(/^the report dialog has no correlated activity block$/, async () => {
  const preview = $('[data-testid="error-report-preview"]')
  const body = await preview.getText()
  await expect(body).not.toContain('action:')
})
