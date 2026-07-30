import { describe, it, expect, vi, beforeEach } from 'vitest'

const webviewGetByLabel = vi.fn()
const WebviewWindowCtor = vi.fn()
const show = vi.fn()
const setFocus = vi.fn()
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: Object.assign(
    function (this: unknown, ...args: unknown[]) {
      WebviewWindowCtor(...args)
    },
    { getByLabel: (...a: unknown[]) => webviewGetByLabel(...a) }
  ),
}))

import { openActionJournalWindow } from './actionJournalWindow'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('openActionJournalWindow', () => {
  it('opens the journal window on the route main.tsx dispatches on', async () => {
    webviewGetByLabel.mockResolvedValue(null)
    await openActionJournalWindow()

    expect(WebviewWindowCtor).toHaveBeenCalledOnce()
    const [label, opts] = WebviewWindowCtor.mock.calls[0] as [string, { url: string }]
    expect(label).toBe('action-journal')
    expect(opts.url).toBe('/?window=actions')
  })

  it('carries no repository parameter — the journal is app-wide', async () => {
    webviewGetByLabel.mockResolvedValue(null)
    await openActionJournalWindow()

    const [, opts] = WebviewWindowCtor.mock.calls[0] as [string, { url: string }]
    expect(opts.url).not.toContain('repoPath')
  })

  it('focuses the window already open instead of stacking a second one', async () => {
    webviewGetByLabel.mockResolvedValue({ show, setFocus })
    await openActionJournalWindow()

    expect(show).toHaveBeenCalledOnce()
    expect(setFocus).toHaveBeenCalledOnce()
    expect(WebviewWindowCtor).not.toHaveBeenCalled()
  })
})
