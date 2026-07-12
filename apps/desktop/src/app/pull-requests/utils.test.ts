import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { timeAgo, openUrl } from './utils'

describe('timeAgo', () => {
  const NOW = new Date('2024-06-15T12:00:00.000Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats seconds for very recent dates', () => {
    expect(timeAgo(new Date(NOW.getTime() - 30_000))).toBe('30s ago')
  })

  it('formats minutes once past 60 seconds', () => {
    expect(timeAgo(new Date(NOW.getTime() - 5 * 60_000))).toBe('5m ago')
  })

  it('formats hours once past 60 minutes', () => {
    expect(timeAgo(new Date(NOW.getTime() - 3 * 3_600_000))).toBe('3h ago')
  })

  it('formats days once past 24 hours', () => {
    expect(timeAgo(new Date(NOW.getTime() - 5 * 86_400_000))).toBe('5d ago')
  })

  it('formats months once past 30 days', () => {
    expect(timeAgo(new Date(NOW.getTime() - 90 * 86_400_000))).toBe('3mo ago')
  })

  it('formats a date at exactly the boundary as the next larger unit', () => {
    expect(timeAgo(new Date(NOW.getTime() - 60_000))).toBe('1m ago')
    expect(timeAgo(new Date(NOW.getTime() - 3_600_000))).toBe('1h ago')
    expect(timeAgo(new Date(NOW.getTime() - 86_400_000))).toBe('1d ago')
  })
})

describe('openUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('opens the URL via the Tauri shell plugin when available', async () => {
    const open = vi.fn().mockResolvedValue(undefined)
    vi.doMock('@tauri-apps/plugin-shell', () => ({ open }))
    const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null)

    const { openUrl: openUrlFresh } = await import('./utils')
    await openUrlFresh('https://example.com')

    expect(open).toHaveBeenCalledWith('https://example.com')
    expect(windowOpen).not.toHaveBeenCalled()
  })

  it('falls back to window.open when the Tauri shell plugin is unavailable', async () => {
    vi.doMock('@tauri-apps/plugin-shell', () => {
      throw new Error('not available outside Tauri')
    })
    const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null)

    const { openUrl: openUrlFresh } = await import('./utils')
    await openUrlFresh('https://example.com')

    expect(windowOpen).toHaveBeenCalledWith('https://example.com', '_blank')
  })

  it('falls back to window.open when open() itself rejects', async () => {
    vi.doMock('@tauri-apps/plugin-shell', () => ({
      open: vi.fn().mockRejectedValue(new Error('denied')),
    }))
    const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null)

    const { openUrl: openUrlFresh } = await import('./utils')
    await openUrlFresh('https://example.com')

    expect(windowOpen).toHaveBeenCalledWith('https://example.com', '_blank')
  })

  it('is exported and callable directly from the module under test', () => {
    expect(typeof openUrl).toBe('function')
  })
})
