import { describe, it, expect, vi, beforeEach } from 'vitest'

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

import { useUpdaterStore } from './updater.store'

const INITIAL = useUpdaterStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  useUpdaterStore.setState(INITIAL, true)
})

describe('useUpdaterStore — loadCurrentVersion', () => {
  it('stores the resolved app version', async () => {
    apiGetAppVersion.mockResolvedValue('1.0.0')
    await useUpdaterStore.getState().loadCurrentVersion()
    expect(useUpdaterStore.getState().currentVersion).toBe('1.0.0')
  })

  it('leaves the version unset when the call fails (e.g. outside Tauri)', async () => {
    apiGetAppVersion.mockRejectedValue(new Error('no tauri runtime'))
    await useUpdaterStore.getState().loadCurrentVersion()
    expect(useUpdaterStore.getState().currentVersion).toBeNull()
  })
})

describe('useUpdaterStore — checkForUpdate', () => {
  it('reports up-to-date when the endpoint has no update', async () => {
    apiCheckForUpdate.mockResolvedValue(null)
    await useUpdaterStore.getState().checkForUpdate()
    expect(useUpdaterStore.getState().status).toBe('up-to-date')
    expect(useUpdaterStore.getState().availableVersion).toBeNull()
  })

  it('exposes the available version and notes when an update is found', async () => {
    apiCheckForUpdate.mockResolvedValue({ version: '1.1.0', body: 'Bug fixes' })
    await useUpdaterStore.getState().checkForUpdate()
    const state = useUpdaterStore.getState()
    expect(state.status).toBe('available')
    expect(state.availableVersion).toBe('1.1.0')
    expect(state.releaseNotes).toBe('Bug fixes')
  })

  it('sets an error status on an explicit (non-silent) check failure', async () => {
    apiCheckForUpdate.mockRejectedValue(new Error('network down'))
    await useUpdaterStore.getState().checkForUpdate()
    expect(useUpdaterStore.getState().status).toBe('error')
    expect(useUpdaterStore.getState().error).toBe('network down')
  })

  it('falls back to idle (no error surfaced) on a silent check failure', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    apiCheckForUpdate.mockRejectedValue(new Error('network down'))
    await useUpdaterStore.getState().checkForUpdate({ silent: true })
    expect(useUpdaterStore.getState().status).toBe('idle')
    expect(useUpdaterStore.getState().error).toBeNull()
    expect(warnSpy).toHaveBeenCalled()
  })
})

describe('useUpdaterStore — downloadAndInstall', () => {
  it('downloads, installs, and moves to ready after finding an update', async () => {
    const update = { version: '1.1.0', body: null }
    apiCheckForUpdate.mockResolvedValue(update)
    apiDownloadAndInstallUpdate.mockImplementation(async (_u, onProgress) => {
      onProgress({ downloadedBytes: 50, contentLength: 100 })
    })

    await useUpdaterStore.getState().checkForUpdate()
    await useUpdaterStore.getState().downloadAndInstall()

    expect(apiDownloadAndInstallUpdate).toHaveBeenCalledWith(update, expect.any(Function))
    expect(useUpdaterStore.getState().status).toBe('ready')
    expect(useUpdaterStore.getState().progress).toEqual({ downloadedBytes: 50, contentLength: 100 })
  })

  it('does nothing when called without a checked update', async () => {
    await useUpdaterStore.getState().downloadAndInstall()
    expect(apiDownloadAndInstallUpdate).not.toHaveBeenCalled()
    expect(useUpdaterStore.getState().status).toBe('idle')
  })

  it('sets an error status when the download fails', async () => {
    apiCheckForUpdate.mockResolvedValue({ version: '1.1.0', body: null })
    apiDownloadAndInstallUpdate.mockRejectedValue(new Error('disk full'))

    await useUpdaterStore.getState().checkForUpdate()
    await useUpdaterStore.getState().downloadAndInstall()

    expect(useUpdaterStore.getState().status).toBe('error')
    expect(useUpdaterStore.getState().error).toBe('disk full')
  })
})

describe('useUpdaterStore — relaunch', () => {
  it('relaunches the app via the process plugin', async () => {
    await useUpdaterStore.getState().relaunch()
    expect(apiRelaunchApp).toHaveBeenCalled()
  })
})
