import { browser, expect, $ } from '@wdio/globals'
import { Given, When, Then } from '@wdio/cucumber-framework'

// Seeds the notification.store persist key directly (same "seed localStorage, then reload" pattern
// as repo.steps.ts's fixture-open step) rather than driving the real GitHub-diff pipeline
// (useNotificationWatcher comparing live/mock PR snapshots) — that path exists to *detect* changes
// over time and isn't a reliable, fixture-controllable way to produce a specific notification list
// on demand. One unread + one read notification covers the unread-count badge and the "already
// seen" row styling without needing more.
Given(/^the notification tray is seeded with sample notifications$/, async () => {
  const now = Date.now()
  const seeded = {
    state: {
      notifications: [
        {
          id: 1001,
          type: 'pr_merged',
          repo: 'git-manager',
          prNumber: 501,
          prTitle: 'feat: e2e seeded merged PR',
          prId: 'e2e-seed-pr-merged',
          author: 'e2e-bot',
          createdAt: now - 60_000,
          read: false,
          targetTab: 'prs',
        },
        {
          id: 1002,
          type: 'review_requested',
          repo: 'git-manager',
          prNumber: 502,
          prTitle: 'fix: e2e seeded review request',
          prId: 'e2e-seed-pr-review',
          author: 'e2e-bot',
          createdAt: now - 120_000,
          read: true,
          targetTab: 'waiting',
        },
      ],
      previousPRs: {},
    },
    version: 0,
  }

  await browser.execute(
    (key: string, value: string) => {
      localStorage.setItem(key, value)
      window.location.href = `/?e2e=${Date.now()}`
    },
    'git-manager-notifications',
    JSON.stringify(seeded)
  )
  await $('[data-testid="notification-bell-button"]').waitForDisplayed({ timeout: 15000 })
})

When(/^I open the notification tray$/, async () => {
  const bell = $('[data-testid="notification-bell-button"]')
  await bell.waitForDisplayed({ timeout: 10000 })
  await bell.click()
  await $('[data-testid="notification-dropdown"]').waitForDisplayed({ timeout: 10000 })
})

Then(/^the notification tray shows (\d+) notifications?$/, async (count: string | number) => {
  const dropdown = $('[data-testid="notification-dropdown"]')
  await dropdown.waitForDisplayed({ timeout: 10000 })
  const items = await dropdown.$$('[data-testid^="notification-item-"]')
  expect(items.length).toBe(Number(count))
})

Then(/^the notification unread badge reads "(\d+)"$/, async (count: string | number) => {
  const badge = $('[data-testid="notification-unread-badge"]')
  await badge.waitForDisplayed({ timeout: 10000 })
  // Cucumber can hand a numeric capture back as a number, not a string — see fixup.steps.ts's
  // pending-fixups-banner step for the same gotcha.
  expect(await badge.getText()).toBe(String(count))
})

Then(/^the notification unread badge is not shown$/, async () => {
  await $('[data-testid="notification-unread-badge"]').waitForExist({
    reverse: true,
    timeout: 10000,
  })
})

When(/^I mark all notifications as read$/, async () => {
  const button = $('[data-testid="notification-mark-all-read"]')
  await button.waitForDisplayed({ timeout: 10000 })
  await button.click()
})

When(/^I clear all notifications$/, async () => {
  const button = $('[data-testid="notification-clear-all"]')
  await button.waitForDisplayed({ timeout: 10000 })
  await button.click()
})

Then(/^the notification tray is empty$/, async () => {
  await $('[data-testid="notification-empty-state"]').waitForDisplayed({ timeout: 10000 })
})
