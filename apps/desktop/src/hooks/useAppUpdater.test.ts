import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

const {
  apiGetAppVersion,
  apiCheckForUpdate,
  apiDownloadAndInstallUpdate,
  apiRelaunchApp,
} = vi.hoisted(() => ({
  apiGetAppVersion: vi.fn(),
  apiCheckForUpdate: vi.fn(),
  apiDownloadAndInstallUpdate: vi.fn(),
  apiRelaunchApp: vi.fn(),
}))

vi.mock('../api/updater.api', () => ({
  apiGetAppVersion,
  apiCheckForUpdate,
  apiDownloadAndInstallUpdate,
  apiRelaunchApp,
}))

import { useAppUpdater } from './useAppUpdater'

beforeEach(() => {
  vi.clearAllMocks()
  apiGetAppVersion.mockResolvedValue('1.0.0')
})

describe('useAppUpdater', () => {
  it('loads the current app version on mount', async () => {
    const { result } = renderHook(() => useAppUpdater())
    await waitFor(() => expect(result.current.currentVersion).toBe('1.0.0'))
    expect(result.current.status).toBe('idle')
  })

  it('reports up-to-date when the endpoint has no update', async () => {
    apiCheckForUpdate.mockResolvedValue(null)
    const { result } = renderHook(() => useAppUpdater())

    await act(async () => {
      await result.current.checkForUpdate()
    })

    expect(result.current.status).toBe('up-to-date')
    expect(result.current.availableVersion).toBeNull()
  })

  it('exposes the available version and notes when an update is found', async () => {
    apiCheckForUpdate.mockResolvedValue({ version: '1.1.0', body: 'Bug fixes' })
    const { result } = renderHook(() => useAppUpdater())

    await act(async () => {
      await result.current.checkForUpdate()
    })

    expect(result.current.status).toBe('available')
    expect(result.current.availableVersion).toBe('1.1.0')
    expect(result.current.releaseNotes).toBe('Bug fixes')
  })

  it('sets an error status when the check fails', async () => {
    apiCheckForUpdate.mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useAppUpdater())

    await act(async () => {
      await result.current.checkForUpdate()
    })

    expect(result.current.status).toBe('error')
    expect(result.current.error).toBe('network down')
  })

  it('downloads, installs, and moves to ready after finding an update', async () => {
    const update = { version: '1.1.0', body: null }
    apiCheckForUpdate.mockResolvedValue(update)
    apiDownloadAndInstallUpdate.mockImplementation(async (_u, onProgress) => {
      onProgress({ downloadedBytes: 50, contentLength: 100 })
    })
    const { result } = renderHook(() => useAppUpdater())

    await act(async () => {
      await result.current.checkForUpdate()
    })
    await act(async () => {
      await result.current.downloadAndInstall()
    })

    expect(apiDownloadAndInstallUpdate).toHaveBeenCalledWith(update, expect.any(Function))
    expect(result.current.status).toBe('ready')
    expect(result.current.progress).toEqual({ downloadedBytes: 50, contentLength: 100 })
  })

  it('does nothing when downloadAndInstall is called without a checked update', async () => {
    const { result } = renderHook(() => useAppUpdater())

    await act(async () => {
      await result.current.downloadAndInstall()
    })

    expect(apiDownloadAndInstallUpdate).not.toHaveBeenCalled()
    expect(result.current.status).toBe('idle')
  })

  it('relaunches the app via the process plugin', async () => {
    const { result } = renderHook(() => useAppUpdater())
    await act(async () => {
      await result.current.relaunch()
    })
    expect(apiRelaunchApp).toHaveBeenCalled()
  })
})
