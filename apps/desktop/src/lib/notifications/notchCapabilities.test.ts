import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The notch's window controls, checked against the Tauri capability file rather than a mock.
 *
 * This test exists because of a bug no other test in this repository could have caught. `setSize`
 * and `hide` on a `WebviewWindow` are `core:window` IPC commands, and Tauri's ACL denies any that a
 * capability does not name — `core:window:default` grants only getters. Neither was listed, so both
 * rejected at runtime while every unit test passed: `notchWindow.test.ts` and `tauriNotchHost.test.ts`
 * mock the window object, and a mock is granted everything.
 *
 * What that cost is the whole point. The notch keeps *one* window and navigates it per card,
 * because creating a webview activates the entire application on macOS and a card is by definition
 * raised while the user is elsewhere. `setSize` was the first call of that reuse path: it rejected,
 * the path fell back to creating a window, and every single card yanked the app in front of
 * whatever the user was doing — the exact bug the parked window was built to remove, silently
 * reintroduced by a missing line of JSON. `hide` failing meant the card was never taken off screen
 * either.
 *
 * So the rule is: **every `core:*` command the notch calls has to be named here and in the
 * capability file.** Reading the real file is the only way to state it — anything mocked would
 * agree with itself.
 */
const CAPABILITIES = resolve(process.cwd(), 'src-tauri/capabilities/default.json')

/** Command → where the notch calls it, so a failure says what breaks rather than just what is missing. */
const REQUIRED: Array<{ permission: string; usedBy: string }> = [
  {
    permission: 'core:window:allow-set-size',
    usedBy:
      'notchWindow.ts (sizing the parked window per card) and tauriNotchHost.ts (resizeNotchWindow)',
  },
  {
    permission: 'core:window:allow-set-position',
    usedBy: 'notchWindow.ts, placing the parked window before its card arrives',
  },
  {
    permission: 'core:window:allow-hide',
    usedBy: 'tauriNotchHost.ts (a card leaving) and notchWindow.ts (closeNotchWindow parking it)',
  },
  {
    permission: 'core:window:allow-close',
    usedBy: 'notchWindow.ts, clearing a window that cannot be reused before opening another',
  },
  {
    permission: 'core:window:allow-show',
    usedBy: 'NotchWindow.tsx, bringing the main window forward when a card is clicked',
  },
  {
    permission: 'core:window:allow-set-focus',
    usedBy: 'NotchWindow.tsx, focusing the main window when a card is clicked',
  },
  {
    permission: 'core:webview:allow-create-webview-window',
    usedBy: 'notchWindow.ts, creating the one parked window at startup',
  },
]

describe('the notch’s Tauri capabilities', () => {
  const granted: string[] = JSON.parse(readFileSync(CAPABILITIES, 'utf8')).permissions

  it.each(REQUIRED)('grants $permission', ({ permission, usedBy }) => {
    expect(granted, `${permission} is denied at runtime, breaking: ${usedBy}`).toContain(permission)
  })

  it('applies to every window, not only the main one', () => {
    // The notch card runs in its own webview and calls `hide`/`setSize` on itself, so a capability
    // scoped to the main window would leave exactly those calls denied.
    const capability = JSON.parse(readFileSync(CAPABILITIES, 'utf8'))
    expect(capability.windows).toContain('*')
  })
})
