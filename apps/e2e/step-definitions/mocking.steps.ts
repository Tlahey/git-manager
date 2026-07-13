import { browser, expect } from '@wdio/globals'
import { Given, When, Then, After } from '@wdio/cucumber-framework'
import '@wdio/native-types'

// Shared across the steps of a single scenario (Cucumber runs a feature file's scenarios
// sequentially in one worker session).
let aiStatusMock: Awaited<ReturnType<typeof browser.tauri.mock>> | null = null
let lastStatus: unknown
let lastError: string | null = null

const FAKE_MODEL = 'totally-fake-mock-model-xyz'
const FAKE_VERSION = 'v99.99.99-mock'
const AI_CHECK_CONFIG = { protocol: 'openai-compatible', url: 'http://localhost:11434' }

let githubPollMock: Awaited<ReturnType<typeof browser.tauri.mock>> | null = null
let lastGithubPollResult: unknown
const FAKE_GITHUB_TOKEN = 'gho_totally_fake_mock_token'

// Tear mocks down between scenarios so a mock set in one doesn't leak into the next. Harmless
// for other features (restoring when nothing is mocked is a no-op).
After(async () => {
  await browser.tauri.restoreAllMocks()
  aiStatusMock = null
  lastStatus = undefined
  lastError = null
  githubPollMock = null
  lastGithubPollResult = undefined
})

Given(/^the "([^"]*)" command is mocked to return "unavailable"$/, async (command: string) => {
  aiStatusMock = await browser.tauri.mock(command)
  await aiStatusMock.mockResolvedValue({ connected: false, models: [], version: null })
})

Given(
  /^the "([^"]*)" command is mocked to reject with "([^"]*)"$/,
  async (command: string, message: string) => {
    aiStatusMock = await browser.tauri.mock(command)
    await aiStatusMock.mockRejectedValue(new Error(message))
  }
)

Given(/^the "([^"]*)" command is mocked with a fake value$/, async (command: string) => {
  aiStatusMock = await browser.tauri.mock(command)
  await aiStatusMock.mockResolvedValue({
    connected: true,
    models: [FAKE_MODEL],
    version: FAKE_VERSION,
  })
})

When(/^all mocks are restored$/, async () => {
  await browser.tauri.restoreAllMocks()
})

When(/^the AI provider status is checked through the test bridge$/, async (): Promise<void> => {
  // Catch inside the browser context and return a discriminated result: a rejected mock throws
  // in-page, and letting that propagate across the WebDriver boundary mangles the message.
  const outcome = (await browser.tauri.execute(async ({ core }, config: typeof AI_CHECK_CONFIG) => {
    try {
      const value = await core.invoke('check_ai_status', { config })
      return { ok: true, value }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }, AI_CHECK_CONFIG)) as { ok: boolean; value?: unknown; error?: string }

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
  expect(aiStatusMock).not.toBeNull()
  expect(aiStatusMock).toHaveBeenCalledTimes(1)
  expect(aiStatusMock).toHaveBeenCalledWith({ config: AI_CHECK_CONFIG })
})

Then(/^the error "([^"]*)" is returned$/, (expectedError: string) => {
  expect(lastError).toBe(expectedError)
})

Then(/^the fake value does not appear in the result$/, () => {
  const status = lastStatus as { models: string[]; version: string | null }
  expect(status.models).not.toContain(FAKE_MODEL)
  expect(status.version).not.toBe(FAKE_VERSION)
})

// github_poll_token's response shape stays snake_case on the wire (DeviceCodeResponse/
// PollTokenResponse in github.rs have no #[serde(rename_all = "camelCase")], unlike the rest of
// this command's sibling responses) — mocked values below match that exactly.

Given(
  /^the "([^"]*)" command is mocked to return authorization pending$/,
  async (command: string) => {
    githubPollMock = await browser.tauri.mock(command)
    await githubPollMock.mockResolvedValue({
      access_token: null,
      error: 'authorization_pending',
      error_description: null,
    })
  }
)

Given(/^the "([^"]*)" command is mocked to return an access token$/, async (command: string) => {
  githubPollMock = await browser.tauri.mock(command)
  await githubPollMock.mockResolvedValue({
    access_token: FAKE_GITHUB_TOKEN,
    error: null,
    error_description: null,
  })
})

Given(
  /^the "([^"]*)" command is mocked to return an expired device code$/,
  async (command: string) => {
    githubPollMock = await browser.tauri.mock(command)
    await githubPollMock.mockResolvedValue({
      access_token: null,
      error: 'expired_token',
      error_description: 'The device_code has expired.',
    })
  }
)

When(/^the GitHub token poll is checked through the test bridge$/, async () => {
  const outcome = (await browser.tauri.execute(async ({ core }, deviceCode: string) => {
    try {
      const value = await core.invoke('github_poll_token', { deviceCode })
      return { ok: true, value }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }, 'fake-device-code')) as { ok: boolean; value?: unknown; error?: string }

  lastGithubPollResult = outcome.ok ? outcome.value : undefined
})

Then(/^the poll result shows authorization pending$/, () => {
  expect(lastGithubPollResult).toEqual({
    access_token: null,
    error: 'authorization_pending',
    error_description: null,
  })
})

Then(/^the poll result contains an access token$/, () => {
  expect((lastGithubPollResult as { access_token: string | null }).access_token).toBe(
    FAKE_GITHUB_TOKEN
  )
})

Then(/^the poll result shows an expired device code$/, () => {
  expect((lastGithubPollResult as { error: string | null }).error).toBe('expired_token')
})
