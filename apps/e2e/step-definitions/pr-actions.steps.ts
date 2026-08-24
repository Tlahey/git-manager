import { expect, $ } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'

/**
 * Interaction steps for `pr-actions.feature` — every `usePrActions` write plus the read-only
 * comments/review-threads panels, driven through the real UI against the fake GitHub server (see
 * `github-mock.steps.ts` for the shared setup and fixture-seeding steps this feature reuses).
 */

const TIMEOUT = 15000

// ─── comments ──────────────────────────────────────────────────────────────────

Then(/^the pull request comments list shows "([^"]*)"$/, async (text: string) => {
  const list = $('[data-testid="pr-comments"]')
  await list.waitForDisplayed({ timeout: TIMEOUT })
  await expect(list).toHaveText(text, { containing: true })
})

When(/^I post the comment "([^"]*)" on the pull request$/, async (text: string) => {
  // MarkdownField defaults to its "rich" mode, which hides the plain textarea this step types
  // into — switch that field to "code" mode first. Scoped to the comment box so it can't hit
  // another field's identically-testid'd tab (the mode tabs aren't per-instance).
  await $('[data-testid="pr-comment-box"] [data-testid="markdown-tab-code"]').click()
  const input = $('[data-testid="pr-comment-input"]')
  await input.waitForDisplayed({ timeout: TIMEOUT })
  await input.setValue(text)
  await $('[data-testid="pr-comment-submit"]').click()
})

// ─── review threads ("code suggestions") ────────────────────────────────────────

Then(
  /^the pull request shows an unresolved code suggestion on "([^"]*)"$/,
  async (path: string) => {
    const section = $('[data-testid="pr-code-suggestions"]')
    await section.waitForDisplayed({ timeout: TIMEOUT })
    await expect(section).toHaveText(path, { containing: true })
  }
)

// ─── formal review ───────────────────────────────────────────────────────────────

When(/^I submit an approving review on the pull request$/, async () => {
  await $('[data-testid="pr-review-toggle"]').click()
  await $('[data-testid="pr-review-composer"]').waitForDisplayed({ timeout: TIMEOUT })
  await $('[data-testid="pr-review-approve"]').click()
})

Then(/^the pull request shows the review as approved$/, async () => {
  await $('[data-testid="pr-checks-review"]').waitForDisplayed({ timeout: TIMEOUT })
})

// ─── merge ─────────────────────────────────────────────────────────────────────

When(/^I merge the pull request$/, async () => {
  await $('[data-testid="pr-merge-button"]').click()
})

Then(/^the pull request is shown as merged$/, async () => {
  await $('[data-testid="pr-merge-button"]').waitForExist({ reverse: true, timeout: TIMEOUT })
})

// ─── close / reopen ──────────────────────────────────────────────────────────────

When(/^I close the pull request$/, async () => {
  await $('[data-testid="pr-close"]').click()
})

When(/^I reopen the pull request$/, async () => {
  await $('[data-testid="pr-reopen"]').click()
})

Then(/^the pull request shows the reopen action$/, async () => {
  await $('[data-testid="pr-reopen"]').waitForDisplayed({ timeout: TIMEOUT })
})

Then(/^the pull request shows the close action$/, async () => {
  await $('[data-testid="pr-close"]').waitForDisplayed({ timeout: TIMEOUT })
})

// ─── draft toggle ────────────────────────────────────────────────────────────────

When(/^I convert the pull request to a draft$/, async () => {
  await $('[data-testid="pr-convert-draft"]').click()
})

When(/^I mark the pull request as ready for review$/, async () => {
  await $('[data-testid="pr-mark-ready"]').click()
})

Then(/^the pull request shows the mark-ready action$/, async () => {
  await $('[data-testid="pr-mark-ready"]').waitForDisplayed({ timeout: TIMEOUT })
})

Then(/^the pull request shows the convert-to-draft action$/, async () => {
  await $('[data-testid="pr-convert-draft"]').waitForDisplayed({ timeout: TIMEOUT })
})

// ─── labels ────────────────────────────────────────────────────────────────────

When(/^I open the pull request's labels editor$/, async () => {
  await $('[data-testid="pr-labels-edit"]').click()
  await $('[data-testid="pr-edit-popover"]').waitForDisplayed({ timeout: TIMEOUT })
})

When(/^I add the label "([^"]*)" to the pull request$/, async (name: string) => {
  await $(`[data-testid="pr-edit-add-${name}"]`).click()
})

When(/^I remove the label "([^"]*)" from the pull request$/, async (name: string) => {
  await $(`[data-testid="pr-edit-remove-${name}"]`).click()
})

Then(/^the pull request shows the label "([^"]*)"$/, async (name: string) => {
  await $(`[data-testid="pr-label-${name}"]`).waitForDisplayed({ timeout: TIMEOUT })
})

Then(/^the pull request no longer shows the label "([^"]*)"$/, async (name: string) => {
  await $(`[data-testid="pr-label-${name}"]`).waitForExist({ reverse: true, timeout: TIMEOUT })
})

// ─── reviewers ─────────────────────────────────────────────────────────────────

When(/^I open the pull request's reviewers editor$/, async () => {
  await $('[data-testid="pr-reviewers-edit"]').click()
  await $('[data-testid="pr-edit-popover"]').waitForDisplayed({ timeout: TIMEOUT })
})

When(/^I request "([^"]*)" as a reviewer on the pull request$/, async (login: string) => {
  await $(`[data-testid="pr-edit-add-${login}"]`).click()
})

When(/^I remove "([^"]*)" as a reviewer on the pull request$/, async (login: string) => {
  await $(`[data-testid="pr-edit-remove-${login}"]`).click()
})

Then(/^the pull request lists "([^"]*)" as a reviewer$/, async (login: string) => {
  await $(`[data-testid="pr-user-${login}"]`).waitForDisplayed({ timeout: TIMEOUT })
})

Then(/^the pull request no longer lists "([^"]*)" as a reviewer$/, async (login: string) => {
  await $(`[data-testid="pr-user-${login}"]`).waitForExist({ reverse: true, timeout: TIMEOUT })
})

// ─── branch update ───────────────────────────────────────────────────────────────

Then(/^the pull request shows it is behind its base branch$/, async () => {
  await $('[data-testid="pr-checks-behind"]').waitForDisplayed({ timeout: TIMEOUT })
})

When(/^I update the pull request's branch$/, async () => {
  await $('[data-testid="pr-update-branch"]').click()
})

Then(/^the pull request no longer shows it is behind its base branch$/, async () => {
  await $('[data-testid="pr-checks-behind"]').waitForExist({ reverse: true, timeout: TIMEOUT })
})
