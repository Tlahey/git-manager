import { $, $$, expect } from '@wdio/globals'
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
