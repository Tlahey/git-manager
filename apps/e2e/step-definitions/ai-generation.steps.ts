import { browser, expect, $ } from '@wdio/globals'
import { Given, When, Then, After } from '@wdio/cucumber-framework'
import { startFakeAiServer, type FakeAiServerHandle } from '../support/fakeAiServer.js'

// "When I select the working-tree changes in the graph" is shared — see commit.steps.ts.

let server: FakeAiServerHandle | null = null

After({ tags: '@ai' }, async () => {
  if (server) {
    await server.stop()
    server = null
  }
})

// Seeds `git-manager-settings` directly (same "seed localStorage, then reload" pattern used
// throughout this suite) rather than driving the Settings UI — this scenario is about the
// generation flow itself, not about how the settings get there (see settings.feature for that).
async function seedAiSettingsAndReload(ai: Record<string, unknown>) {
  await browser.execute(
    (key: string, aiJson: string) => {
      const raw = localStorage.getItem(key)
      const parsed = raw ? JSON.parse(raw) : { state: { settings: {} }, version: 0 }
      parsed.state = parsed.state ?? {}
      parsed.state.settings = { ...parsed.state.settings, ai: JSON.parse(aiJson) }
      localStorage.setItem(key, JSON.stringify(parsed))
      window.location.href = `/?e2e=${Date.now()}`
    },
    'git-manager-settings',
    JSON.stringify(ai)
  )
  await browser.waitUntil(async () => (await browser.getTitle()).length > 0, {
    timeout: 10000,
    timeoutMsg: 'The native window reports no title after reload',
  })
}

Given(/^the AI provider is pointed at a fake server$/, async () => {
  server = await startFakeAiServer({ tokens: ['feat: ', 'add ', 'fake', ' thing'] })
  await seedAiSettingsAndReload({
    preset: 'ollama',
    url: server.url,
    model: 'fake-model',
    timeoutSeconds: 10,
  })
})

Given(/^the AI provider is pointed at a fake server that never responds$/, async () => {
  server = await startFakeAiServer({ stall: true })
  await seedAiSettingsAndReload({
    preset: 'ollama',
    url: server.url,
    model: 'fake-model',
    timeoutSeconds: 30,
  })
})

When(/^I click the generate-commit-batches button$/, async () => {
  const button = $('[data-testid="ai-batch-generate-button"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

Then(/^the AI batch dialog proposes a first commit "([^"]*)"$/, async (expected: string) => {
  // The first proposal's editable message is pre-filled from the parsed structured response —
  // proving the real get_ai_context('working') → ai_complete(schema) → parse chain ran end to end.
  const message = $('[data-testid="ai-batch-message-0"]')
  await message.waitForExist({ timeout: 15000 })
  await browser.waitUntil(async () => (await message.getValue()) === expected, {
    timeout: 15000,
    timeoutMsg: `AI batch commit message never became "${expected}"`,
  })
})

When(/^I apply the AI commit batch$/, async () => {
  const button = $('[data-testid="ai-batch-apply"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

When(/^I click the commit-generate button$/, async () => {
  const button = $('[data-testid="commit-generate-button"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

Then(/^the commit message becomes "([^"]*)"$/, async (expected: string) => {
  const input = $('[data-testid="commit-message-input"]')
  await browser.waitUntil(
    async () => (await input.getValue()) === expected,
    { timeout: 15000, timeoutMsg: `commit message never became "${expected}"` }
  )
})

// The fake server runs in this same Node process (unlike the app's own state, which lives inside
// the webview) — its recorded request body is read directly, no browser.execute round-trip needed.
Then(/^the sent prompt's system message contains "([^"]*)"$/, (text: string) => {
  const body = server?.lastRequestBody as
    | { messages?: { role: string; content: string }[] }
    | undefined
  const systemMessage = body?.messages?.find((m) => m.role === 'system')
  expect(systemMessage?.content).toContain(text)
})

Then(/^the sent prompt's user message contains "([^"]*)"$/, (text: string) => {
  const body = server?.lastRequestBody as
    | { messages?: { role: string; content: string }[] }
    | undefined
  const userMessage = body?.messages?.find((m) => m.role === 'user')
  expect(userMessage?.content).toContain(text)
})

Then(/^the generate button shows a stop state$/, async () => {
  const button = $('[data-testid="commit-generate-button"]')
  await browser.waitUntil(
    async () => await button.$('.lucide-square').isExisting(),
    { timeout: 10000, timeoutMsg: 'Generate button never switched to its stop state' }
  )
})

Then(/^the commit message input is enabled again$/, async () => {
  const input = $('[data-testid="commit-message-input"]')
  await browser.waitUntil(async () => input.isEnabled(), {
    timeout: 10000,
    timeoutMsg: 'Commit message input never became enabled again after cancelling',
  })
})
