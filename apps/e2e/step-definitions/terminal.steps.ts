import { $, browser, expect } from '@wdio/globals'
import { Then, When } from '@wdio/cucumber-framework'
import { getActiveRepoPath } from '../support/activeRepo'

// The integrated terminal, end to end: a real PTY spawned by `terminal_open`, keystrokes routed
// through xterm's `onData` → `terminal_write`, and the process's own output coming back over the
// `terminal:output:<id>` event to be rendered. Nothing here is mocked — the assertions read what
// the shell actually printed.

When(/^I open the integrated terminal$/, async () => {
  const button = $('[data-testid="toolbar-terminal-button-primary"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

When(/^I close the integrated terminal$/, async () => {
  const button = $('[data-testid="terminal-close"]')
  await button.waitForClickable({ timeout: 10000 })
  await button.click()
})

Then(/^the terminal panel is shown$/, async () => {
  await $('[data-testid="terminal-panel"]').waitForDisplayed({ timeout: 15000 })
  // The panel's chrome renders before the PTY exists; the xterm viewport is what proves a session
  // was actually opened.
  await $('[data-testid="xterm-view"]').waitForDisplayed({ timeout: 15000 })
})

Then(/^the terminal panel is no longer shown$/, async () => {
  await $('[data-testid="terminal-panel"]').waitForExist({ reverse: true, timeout: 10000 })
})

/** Everything xterm has rendered, rows joined — the same text a user reads on screen. */
function terminalText(): Promise<string> {
  return browser.execute(() => {
    const rows = document.querySelector('[data-testid="xterm-view"] .xterm-rows')
    return rows?.textContent ?? ''
  })
}

/**
 * Sends the command through the app's own `terminal_write` command over the wdio IPC bridge.
 *
 * Not the first choice, and the boundary is worth stating: synthetic keystrokes are unusable on
 * this driver — `browser.keys` delivers every character **twice** (measured: "git rev-parse
 * --abbrev-ref" arrived as "Rreeff ... sabbbbSee"), the same double-delivery README.md documents
 * for clicks — and neither a synthetic paste event (WebKit strips its `clipboardData`) nor
 * xterm's own `paste()` reached the PTY. So this stops one layer short of xterm's `onData`
 * binding and drives the same command that binding calls. Everything below it is real: the Rust
 * command, the PTY, the shell, and the output event coming back to be rendered — which is what
 * the assertions read.
 *
 * The trailing newline is what runs the command, exactly as pressing Enter would.
 */
When(/^I run "([^"]*)" in the terminal$/, async (command: string) => {
  // A command sent before the shell is ready is swallowed by the PTY — wait for a prompt first.
  await browser.waitUntil(async () => (await terminalText()).trim().length > 0, {
    timeout: 15000,
    timeoutMsg: 'the shell never produced a prompt',
  })
  // The panel names each session's tab `terminal-tab-<id>`, and that id is the PTY session id.
  const tabId = await browser.execute(() => {
    const tab = document.querySelector('[data-testid^="terminal-tab-"]')
    return tab?.getAttribute('data-testid')?.replace('terminal-tab-', '') ?? null
  })
  if (!tabId) throw new Error('no terminal tab found to send input to')
  await browser.tauri.execute(
    ({ core }, id: string, data: string) => core.invoke('terminal_write', { id, data }),
    tabId,
    `${command}\n`
  )
})

Then(/^the terminal output contains "([^"]*)"$/, async (expected: string) => {
  await browser.waitUntil(async () => (await terminalText()).includes(expected), {
    timeout: 15000,
    timeoutMsg: `the terminal never printed "${expected}" (saw: ${await terminalText()})`,
  })
})

/**
 * The point of the "starts in the repository" scenario: `pwd` has to print the repo the app has
 * open. Compared on the basename — macOS resolves /tmp through /private/tmp, so the fixture path
 * the test knows and the path the shell prints differ by that prefix alone.
 */
Then(/^the terminal output contains the repository path$/, async () => {
  const repoName = getActiveRepoPath().split('/').filter(Boolean).pop()!
  await browser.waitUntil(async () => (await terminalText()).includes(repoName), {
    timeout: 15000,
    timeoutMsg: `the terminal never printed a path containing "${repoName}"`,
  })
  expect(repoName.length).toBeGreaterThan(0)
})
