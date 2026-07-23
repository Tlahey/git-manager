import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.doUnmock('@tauri-apps/api/app')
  vi.doUnmock('@tauri-apps/plugin-updater')
  vi.doUnmock('@tauri-apps/plugin-process')
})

describe('apiGetAppVersion', () => {
  it('returns the bundled app version', async () => {
    vi.doMock('@tauri-apps/api/app', () => ({ getVersion: vi.fn().mockResolvedValue('1.2.3') }))
    const { apiGetAppVersion } = await import('./updater.api')
    expect(await apiGetAppVersion()).toBe('1.2.3')
  })
})

describe('apiCheckForUpdate', () => {
  it('returns the update descriptor from the plugin', async () => {
    const update = { version: '1.3.0', currentVersion: '1.2.3' }
    const check = vi.fn().mockResolvedValue(update)
    vi.doMock('@tauri-apps/plugin-updater', () => ({ check }))
    const { apiCheckForUpdate } = await import('./updater.api')
    expect(await apiCheckForUpdate()).toBe(update)
  })

  it('returns null when already up to date', async () => {
    const check = vi.fn().mockResolvedValue(null)
    vi.doMock('@tauri-apps/plugin-updater', () => ({ check }))
    const { apiCheckForUpdate } = await import('./updater.api')
    expect(await apiCheckForUpdate()).toBeNull()
  })

  it('logs a successful check to the activity journal', async () => {
    const check = vi.fn().mockResolvedValue(null)
    vi.doMock('@tauri-apps/plugin-updater', () => ({ check }))
    const { apiCheckForUpdate } = await import('./updater.api')
    const { useActivityLogStore } = await import('../stores/activityLog.store')
    await apiCheckForUpdate()
    const entry = useActivityLogStore.getState().entries[0]
    expect(entry).toMatchObject({ command: 'updater.check', status: 'ok' })
  })

  it('logs a failed check to the activity journal and rethrows', async () => {
    const check = vi.fn().mockRejectedValue(new Error('Could not fetch a valid release JSON'))
    vi.doMock('@tauri-apps/plugin-updater', () => ({ check }))
    const { apiCheckForUpdate } = await import('./updater.api')
    const { useActivityLogStore } = await import('../stores/activityLog.store')
    await expect(apiCheckForUpdate()).rejects.toThrow()
    const entry = useActivityLogStore.getState().entries[0]
    expect(entry).toMatchObject({ command: 'updater.check', status: 'error' })
    expect(entry.error).toContain('Could not fetch a valid release JSON')
  })
})

describe('apiDownloadAndInstallUpdate', () => {
  it('reports progress across the Started/Progress/Finished lifecycle', async () => {
    const downloadAndInstall = vi.fn(async (cb: (e: unknown) => void) => {
      cb({ event: 'Started', data: { contentLength: 100 } })
      cb({ event: 'Progress', data: { chunkLength: 40 } })
      cb({ event: 'Progress', data: { chunkLength: 60 } })
      cb({ event: 'Finished' })
    })
    const { apiDownloadAndInstallUpdate } = await import('./updater.api')
    const onProgress = vi.fn()

    await apiDownloadAndInstallUpdate(
      { downloadAndInstall } as unknown as Parameters<typeof apiDownloadAndInstallUpdate>[0],
      onProgress
    )

    expect(onProgress).toHaveBeenNthCalledWith(1, { downloadedBytes: 0, contentLength: 100 })
    expect(onProgress).toHaveBeenNthCalledWith(2, { downloadedBytes: 40, contentLength: 100 })
    expect(onProgress).toHaveBeenNthCalledWith(3, { downloadedBytes: 100, contentLength: 100 })
    expect(onProgress).toHaveBeenNthCalledWith(4, { downloadedBytes: 100, contentLength: 100 })
  })
})

describe('apiRelaunchApp', () => {
  it('relaunches the app via the process plugin', async () => {
    const relaunch = vi.fn().mockResolvedValue(undefined)
    vi.doMock('@tauri-apps/plugin-process', () => ({ relaunch }))
    const { apiRelaunchApp } = await import('./updater.api')
    await apiRelaunchApp()
    expect(relaunch).toHaveBeenCalled()
  })
})
