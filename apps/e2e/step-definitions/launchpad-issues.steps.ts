import { $, expect } from '@wdio/globals'
import { Then, When } from '@wdio/cucumber-framework'

Then(
  /^the "([^"]*)" launchpad tab shows the issue "([^"]*)"$/,
  async (tabId: string, issueId: string) => {
    await expect($(`[data-testid="launchpad-tab-${tabId}"]`)).toHaveElementClass('border-primary')
    await $(`[data-testid="issue-row-${issueId}"]`).waitForDisplayed({ timeout: 10000 })
  }
)

Then(
  /^the "([^"]*)" launchpad tab does not show the issue "([^"]*)"$/,
  async (tabId: string, issueId: string) => {
    await expect($(`[data-testid="launchpad-tab-${tabId}"]`)).toHaveElementClass('border-primary')
    await expect($(`[data-testid="issue-row-${issueId}"]`)).not.toBeExisting()
  }
)

// `IssueRow`'s real id for a GitHub-fetched (as opposed to demo-fixture) issue is
// `gh-issue-<number>-<owner>/<repo>` (`rawToMockIssue`, github-issues.api.ts) — computed here
// rather than asked for directly, so the step reads like the number/repo a scenario already named.
When(/^I open the issue "(\d+)" in "([^"]*)"$/, async (issueNumber: string, ownerRepo: string) => {
  const id = `gh-issue-${issueNumber}-${ownerRepo}`
  await $(`[data-testid="issue-open-in-app-${id}"]`).click()
  await $('[data-testid="launchpad-issue-panel"]').waitForDisplayed({ timeout: 10000 })
})

// `issue-title` renders "<title> #<number>" (IssueTitle.tsx), so this checks containment rather
// than an exact match — same shape as the PR files panel's own containment check.
Then(/^the issue detail panel shows the title "([^"]*)"$/, async (title: string) => {
  const heading = $('[data-testid="issue-title"]')
  await heading.waitForDisplayed({ timeout: 15000 })
  await expect(heading).toHaveText(title, { containing: true })
})

Then(/^the issue meta sidebar is shown$/, async () => {
  await $('[data-testid="issue-meta-sidebar"]').waitForDisplayed({ timeout: 15000 })
})
