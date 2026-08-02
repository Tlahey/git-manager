import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useConflictMergeWindow } from './useConflictMergeWindow'

const { webviewGetByLabel, WebviewWindowCtor } = vi.hoisted(() => ({
  webviewGetByLabel: vi.fn(),
  WebviewWindowCtor: vi.fn(),
}))
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: Object.assign(
    function (this: unknown, ...args: unknown[]) {
      WebviewWindowCtor(...args)
    },
    { getByLabel: (...a: unknown[]) => webviewGetByLabel(...a) }
  ),
}))

beforeEach(() => {
  vi.clearAllMocks()
  webviewGetByLabel.mockResolvedValue(null)
})

describe('useConflictMergeWindow', () => {
  it('does nothing while there is no active conflict file', () => {
    renderHook(() => useConflictMergeWindow('/repo', null, vi.fn()))
    expect(WebviewWindowCtor).not.toHaveBeenCalled()
  })

  it('opens a new merge window for the active conflict file path and clears it', async () => {
    const setConflictFilePath = vi.fn()
    renderHook(() => useConflictMergeWindow('/repo', 'src/a.ts', setConflictFilePath))

    await waitFor(() => expect(WebviewWindowCtor).toHaveBeenCalledOnce())
    expect(WebviewWindowCtor).toHaveBeenCalledWith(
      expect.stringContaining('merge-'),
      expect.objectContaining({ title: 'Merge Revision for src/a.ts' })
    )
    await waitFor(() => expect(setConflictFilePath).toHaveBeenCalledWith(null))
  })

  it('reuses an existing merge window instead of creating a new one', async () => {
    const existing = {
      show: vi.fn().mockResolvedValue(undefined),
      setFocus: vi.fn().mockResolvedValue(undefined),
    }
    webviewGetByLabel.mockResolvedValue(existing)

    renderHook(() => useConflictMergeWindow('/repo', 'src/a.ts', vi.fn()))

    await waitFor(() => expect(existing.show).toHaveBeenCalledOnce())
    expect(existing.setFocus).toHaveBeenCalledOnce()
    expect(WebviewWindowCtor).not.toHaveBeenCalled()
  })
})
