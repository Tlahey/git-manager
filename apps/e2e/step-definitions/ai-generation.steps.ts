import { browser, expect, $ } from '@wdio/globals'
import { Given, When, Then, After } from '@wdio/cucumber-framework'
import { startFakeAiServer, type FakeAiServerHandle } from '../support/fakeAiServer.js'
import { clickViaJs } from '../support/interactions.js'
import { navigateAndSettle } from '../support/navigation.js'

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
//
// Writes straight onto `state`, not `state.settings`: `settings.store.ts`'s persist config
// declares `partialize: (state) => state.settings`, so the *persisted* shape is the settings
// object itself (`state.ai`, `state.language`, …) — a `state.settings.ai` write lands in a key
// nothing reads, and the seed silently never takes effect. Cost a real bug to find: every AI
// call kept landing on the suite-wide fake server (`SUITE_WIDE_FAKE_AI_URL`) instead of this
// scenario's own, which only surfaced once a scenario asserted on the actual request body rather
// than on a response both servers happen to answer identically.
async function seedAiSettingsAndReload(ai: Record<string, unknown>) {
  // Seed, then navigate through WebDriver rather than assigning `window.location.href` inside
  // the same execute (repo.steps.ts's pattern): the in-page assignment either tears the context
  // down before the driver's response is sent (the await then hangs for cucumber's 60s step
  // timeout) or — deferred — fires mid-scenario later. The title check below is also satisfied
  // by the old page, so only a driver-owned navigation guarantees the seeded settings were
  // actually rehydrated before the scenario goes on.
  const origin = await browser.execute(() => window.location.origin)
  await browser.execute(
    (key: string, aiJson: string) => {
      const raw = localStorage.getItem(key)
      const parsed = raw ? JSON.parse(raw) : { state: {}, version: 0 }
      parsed.state = { ...parsed.state, ai: JSON.parse(aiJson) }
      localStorage.setItem(key, JSON.stringify(parsed))
    },
    'git-manager-settings',
    JSON.stringify(ai)
  )
  const stamp = `ai-seed-${Date.now()}`
  await navigateAndSettle(`${origin}/?e2e=${stamp}`, stamp)
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

// Injected click, not the driver's: this button swaps its icon (Sparkles <-> Square) the moment
// generation starts, and the *second* press — the one that cancels — consistently fails the native
// click with a bare "A JavaScript exception occurred when running element/<uuid>/click". The first
// press, against a settled button, is fine. Re-querying the element first was tried and did not
// help, so it is the driver's own click path rather than a stale reference.
When(/^I click the commit-generate button$/, async () => {
  await $('[data-testid="commit-generate-button"]').waitForEnabled({ timeout: 10000 })
  await clickViaJs('commit-generate-button')
})

Then(/^the commit message becomes "([^"]*)"$/, async (expected: string) => {
  const input = $('[data-testid="commit-message-input"]')
  await browser.waitUntil(async () => (await input.getValue()) === expected, {
    timeout: 15000,
    timeoutMsg: `commit message never became "${expected}"`,
  })
})

// The fake server runs in this same Node process (unlike the app's own state, which lives inside
// the webview) — its recorded request body is read directly, no browser.execute round-trip needed.
Then(/^the sent prompt's system message contains "([^"]*)"$/, (text: string) => {
  const body = server?.lastRequestBody as
    { messages?: { role: string; content: string }[] } | undefined
  const systemMessage = body?.messages?.find((m) => m.role === 'system')
  expect(systemMessage?.content).toContain(text)
})

Then(/^the sent prompt's user message contains "([^"]*)"$/, (text: string) => {
  const body = server?.lastRequestBody as
    { messages?: { role: string; content: string }[] } | undefined
  const userMessage = body?.messages?.find((m) => m.role === 'user')
  expect(userMessage?.content).toContain(text)
})

// Re-queries the whole selector on every poll instead of holding the button element and asking it
// for a child: the button re-renders when generation starts (Sparkles -> Square), which detaches
// the captured reference, and the next `button.$(...)` against it raises a bare "A JavaScript
// exception occurred when running element/<uuid>" — a stale-element error that reads like the app
// crashed rather than like the element was replaced.
Then(/^the generate button shows a stop state$/, async () => {
  await browser.waitUntil(
    async () => await $('[data-testid="commit-generate-button"] .lucide-square').isExisting(),
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
