import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

beforeEach(() => {
  vi.resetModules()
})
afterEach(() => {
  vi.doUnmock('@tauri-apps/plugin-shell')
  vi.restoreAllMocks()
})

describe('openUrl', () => {
  it('hands the URL to the shell plugin so it opens outside the webview', async () => {
    const open = vi.fn().mockResolvedValue(undefined)
    vi.doMock('@tauri-apps/plugin-shell', () => ({ open }))
    const { openUrl } = await import('./openUrl')

    await openUrl('https://example.test/releases')

    expect(open).toHaveBeenCalledWith('https://example.test/releases')
  })

  /** Outside Tauri (tests, Storybook) the plugin import fails; the link must still work. */
  it('falls back to window.open when the plugin is unavailable', async () => {
    vi.doMock('@tauri-apps/plugin-shell', () => {
      throw new Error('not in a Tauri webview')
    })
    const windowOpen = vi.spyOn(window, 'open').mockReturnValue(null)
    const { openUrl } = await import('./openUrl')

    await openUrl('https://example.test/releases')

    expect(windowOpen).toHaveBeenCalledWith('https://example.test/releases', '_blank')
  })
})
