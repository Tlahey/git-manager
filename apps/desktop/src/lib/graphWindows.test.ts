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

import { openRebaseWindow } from './graphWindows'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('openRebaseWindow', () => {
  it('creates a new rebase window when none exists, carrying repo path and base oid in the url', async () => {
    webviewGetByLabel.mockResolvedValue(null)
    await openRebaseWindow('/repo/a', 'base123')
    expect(WebviewWindowCtor).toHaveBeenCalledOnce()
    const [label, opts] = WebviewWindowCtor.mock.calls[0] as [string, { url: string }]
    expect(label).toContain('rebase-')
    expect(opts.url).toContain('window=rebase')
    expect(opts.url).toContain(encodeURIComponent('/repo/a'))
    expect(opts.url).toContain('baseOid=base123')
  })

  it('reuses and focuses an existing window instead of creating a second one', async () => {
    webviewGetByLabel.mockResolvedValue({ show, setFocus })
    await openRebaseWindow('/repo/a', 'base123')
    expect(show).toHaveBeenCalledOnce()
    expect(setFocus).toHaveBeenCalledOnce()
    expect(WebviewWindowCtor).not.toHaveBeenCalled()
  })
})
