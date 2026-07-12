import { browser, expect } from '@wdio/globals'
import { Given, When, Then, After } from '@wdio/cucumber-framework'
import '@wdio/native-types'

// Shared across the steps of a single scenario (Cucumber runs a feature file's scenarios
// sequentially in one worker session).
let ollamaMock: Awaited<ReturnType<typeof browser.tauri.mock>> | null = null
let lastStatus: unknown
let lastError: string | null = null

const FAKE_MODEL = 'totally-fake-mock-model-xyz'
const FAKE_VERSION = 'v99.99.99-mock'
const OLLAMA_URL = 'http://localhost:11434'

// Tear mocks down between scenarios so a mock set in one doesn't leak into the next. Harmless
// for other features (restoring when nothing is mocked is a no-op).
After(async () => {
  await browser.tauri.restoreAllMocks()
  ollamaMock = null
  lastStatus = undefined
  lastError = null
})

Given(/^the "([^"]*)" command is mocked to return "unavailable"$/, async (command: string) => {
  ollamaMock = await browser.tauri.mock(command)
  await ollamaMock.mockResolvedValue({ connected: false, models: [], version: null })
})

Given(
  /^the "([^"]*)" command is mocked to reject with "([^"]*)"$/,
  async (command: string, message: string) => {
    ollamaMock = await browser.tauri.mock(command)
    await ollamaMock.mockRejectedValue(new Error(message))
  }
)

Given(/^the "([^"]*)" command is mocked with a fake value$/, async (command: string) => {
  ollamaMock = await browser.tauri.mock(command)
  await ollamaMock.mockResolvedValue({ connected: true, models: [FAKE_MODEL], version: FAKE_VERSION })
})

When(/^all mocks are restored$/, async () => {
  await browser.tauri.restoreAllMocks()
})

When(/^the Ollama status is checked through the test bridge$/, async () => {
  // Catch inside the browser context and return a discriminated result: a rejected mock throws
  // in-page, and letting that propagate across the WebDriver boundary mangles the message.
  const outcome = (await browser.tauri.execute(async ({ core }) => {
    try {
      const value = await core.invoke('check_ollama_status', { url: 'http://localhost:11434' })
      return { ok: true, value }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })) as { ok: boolean; value?: unknown; error?: string }

  if (outcome.ok) {
    lastStatus = outcome.value
    lastError = null
  } else {
    lastStatus = undefined
    lastError = outcome.error ?? 'unknown'
  }
})

Then(/^the reported status is "unavailable"$/, () => {
  expect(lastStatus).toEqual({ connected: false, models: [], version: null })
})

// Param is required even though unused: Cucumber rejects a step whose function arity doesn't
// match the regex's capture-group count.
Then(/^the "([^"]*)" command was called once$/, (_command: string) => {
  expect(ollamaMock).not.toBeNull()
  expect(ollamaMock).toHaveBeenCalledTimes(1)
  expect(ollamaMock).toHaveBeenCalledWith({ url: OLLAMA_URL })
})

Then(/^the error "([^"]*)" is returned$/, (expectedError: string) => {
  expect(lastError).toBe(expectedError)
})

Then(/^the fake value does not appear in the result$/, () => {
  const status = lastStatus as { models: string[]; version: string | null }
  expect(status.models).not.toContain(FAKE_MODEL)
  expect(status.version).not.toBe(FAKE_VERSION)
})
