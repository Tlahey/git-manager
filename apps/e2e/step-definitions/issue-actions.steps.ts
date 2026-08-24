import { $ } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'
import { openMenuViaJs } from '../support/interactions'

/**
 * Interaction steps for `issue-actions.feature` — `useIssueEdit`, `useIssueActions`'s close/reopen,
 * the shared `PrEditPopover` reused for issue labels/assignees, and `CreateIssueDialog`. Setup
 * (fixture repo, GitHub remote, connected account, seeded issue/label/assignable-user fixtures) and
 * opening the issue detail panel are shared steps from `github-mock.steps.ts`/`launchpad-issues.steps.ts`.
 */

const TIMEOUT = 15000

// ─── title ─────────────────────────────────────────────────────────────────────

When(/^I rename the issue to "([^"]*)"$/, async (title: string) => {
  await $('[data-testid="issue-title"]').click()
  const input = $('[data-testid="issue-title-input"]')
  await input.waitForDisplayed({ timeout: TIMEOUT })
  await input.setValue(title)
  await $('[data-testid="issue-title-save"]').click()
})

// ─── status ────────────────────────────────────────────────────────────────────

// The status trigger is a `DropdownMenuTrigger`, which Radix opens on `pointerdown` rather than
// `click` — a plain driver click leaves it shut and the item below times out. See
// `support/interactions.ts`'s `openMenuViaJs` doc comment.
When(/^I close the issue$/, async () => {
  await openMenuViaJs('issue-status-edit')
  await $('[data-testid="issue-status-closed"]').click()
})

When(/^I reopen the issue$/, async () => {
  await openMenuViaJs('issue-status-edit')
  await $('[data-testid="issue-status-open"]').click()
})

Then(/^the issue is shown as closed$/, async () => {
  const status = $('[data-testid="issue-status"]')
  await status.waitForDisplayed({ timeout: TIMEOUT })
  await status.waitUntil(async () => (await status.getText()).includes('Closed'), {
    timeout: TIMEOUT,
  })
})

Then(/^the issue is shown as open$/, async () => {
  const status = $('[data-testid="issue-status"]')
  await status.waitForDisplayed({ timeout: TIMEOUT })
  await status.waitUntil(async () => (await status.getText()).includes('Open'), {
    timeout: TIMEOUT,
  })
})

// ─── labels ────────────────────────────────────────────────────────────────────

When(/^I open the issue's labels editor$/, async () => {
  await $('[data-testid="issue-labels-edit"]').click()
  await $('[data-testid="pr-edit-popover"]').waitForDisplayed({ timeout: TIMEOUT })
})

When(/^I add the label "([^"]*)" to the issue$/, async (name: string) => {
  await $(`[data-testid="pr-edit-add-${name}"]`).click()
})

When(/^I remove the label "([^"]*)" from the issue$/, async (name: string) => {
  await $(`[data-testid="pr-edit-remove-${name}"]`).click()
})

Then(/^the issue shows the label "([^"]*)"$/, async (name: string) => {
  await $(`[data-testid="issue-label-${name}"]`).waitForDisplayed({ timeout: TIMEOUT })
})

Then(/^the issue no longer shows the label "([^"]*)"$/, async (name: string) => {
  await $(`[data-testid="issue-label-${name}"]`).waitForExist({ reverse: true, timeout: TIMEOUT })
})

// ─── assignees ─────────────────────────────────────────────────────────────────

When(/^I open the issue's assignees editor$/, async () => {
  await $('[data-testid="issue-assignees-edit"]').click()
  await $('[data-testid="pr-edit-popover"]').waitForDisplayed({ timeout: TIMEOUT })
})

When(/^I assign "([^"]*)" to the issue$/, async (login: string) => {
  await $(`[data-testid="pr-edit-add-${login}"]`).click()
})

When(/^I unassign "([^"]*)" from the issue$/, async (login: string) => {
  await $(`[data-testid="pr-edit-remove-${login}"]`).click()
})

Then(/^the issue lists "([^"]*)" as an assignee$/, async (login: string) => {
  await $(`[data-testid="pr-user-${login}"]`).waitForDisplayed({ timeout: TIMEOUT })
})

Then(/^the issue no longer lists "([^"]*)" as an assignee$/, async (login: string) => {
  await $(`[data-testid="pr-user-${login}"]`).waitForExist({ reverse: true, timeout: TIMEOUT })
})

// ─── filing a new issue from the graph sidebar ────────────────────────────────────

When(/^I open the create-issue dialog$/, async () => {
  await $('[data-testid="issue-create-button"]').click()
  await $('[data-testid="issue-create-dialog"]').waitForDisplayed({ timeout: TIMEOUT })
})

When(/^I fill in the new issue title "([^"]*)"$/, async (title: string) => {
  await $('[data-testid="issue-create-title-input"]').setValue(title)
})

When(/^I submit the new issue$/, async () => {
  await $('[data-testid="issue-create-confirm-button"]').click()
})

Then(/^the create-issue dialog is closed$/, async () => {
  await $('[data-testid="issue-create-dialog"]').waitForExist({ reverse: true, timeout: TIMEOUT })
})
