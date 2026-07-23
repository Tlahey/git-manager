import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { apiGetAppVersion, apiCheckForUpdate, apiDownloadAndInstallUpdate, apiRelaunchApp } =
  vi.hoisted(() => ({
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

import { useAppUpdaterStore, __resetAppUpdaterHandle } from './appUpdater.store'

const INITIAL = useAppUpdaterStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  __resetAppUpdaterHandle()
  useAppUpdaterStore.setState(INITIAL, true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('appUpdater.store — loadVersion', () => {
  it('stores the bundled version', async () => {
    apiGetAppVersion.mockResolvedValue('1.2.3')
    await useAppUpdaterStore.getState().loadVersion()
    expect(useAppUpdaterStore.getState().currentVersion).toBe('1.2.3')
  })

  it('leaves the version unset when the call fails (outside Tauri)', async () => {
    apiGetAppVersion.mockRejectedValue(new Error('no tauri'))
    await useAppUpdaterStore.getState().loadVersion()
    expect(useAppUpdaterStore.getState().currentVersion).toBeNull()
  })
})

describe('appUpdater.store — checkForUpdate', () => {
  it('marks up-to-date when no update is returned', async () => {
    apiCheckForUpdate.mockResolvedValue(null)
    await useAppUpdaterStore.getState().checkForUpdate()
    expect(useAppUpdaterStore.getState().status).toBe('up-to-date')
  })

  it('exposes an available update', async () => {
    apiCheckForUpdate.mockResolvedValue({ version: '1.4.0', body: 'Bug fixes' })
    await useAppUpdaterStore.getState().checkForUpdate()
    const s = useAppUpdaterStore.getState()
    expect(s.status).toBe('available')
    expect(s.availableVersion).toBe('1.4.0')
    expect(s.releaseNotes).toBe('Bug fixes')
  })

  it('surfaces an error on a failed check', async () => {
    apiCheckForUpdate.mockRejectedValue(new Error('network down'))
    await useAppUpdaterStore.getState().checkForUpdate()
    const s = useAppUpdaterStore.getState()
    expect(s.status).toBe('error')
    expect(s.error).toBe('network down')
  })

  it('stays idle on the silent path when up to date', async () => {
    apiCheckForUpdate.mockResolvedValue(null)
    await useAppUpdaterStore.getState().checkForUpdate({ silent: true })
    expect(useAppUpdaterStore.getState().status).toBe('idle')
  })

  it('stays idle on the silent path when the check errors', async () => {
    apiCheckForUpdate.mockRejectedValue(new Error('offline'))
    await useAppUpdaterStore.getState().checkForUpdate({ silent: true })
    const s = useAppUpdaterStore.getState()
    expect(s.status).toBe('idle')
    expect(s.error).toBeNull()
  })

  it('still surfaces an available update on the silent path', async () => {
    apiCheckForUpdate.mockResolvedValue({ version: '2.0.0', body: null })
    await useAppUpdaterStore.getState().checkForUpdate({ silent: true })
    expect(useAppUpdaterStore.getState().status).toBe('available')
  })
})

describe('appUpdater.store — downloadAndInstall', () => {
  it('does nothing without a prior available update', async () => {
    await useAppUpdaterStore.getState().downloadAndInstall()
    expect(apiDownloadAndInstallUpdate).not.toHaveBeenCalled()
    expect(useAppUpdaterStore.getState().status).toBe('idle')
  })

  it('drives downloading → ready after an update is found', async () => {
    apiCheckForUpdate.mockResolvedValue({ version: '1.4.0', body: null })
    apiDownloadAndInstallUpdate.mockResolvedValue(undefined)
    await useAppUpdaterStore.getState().checkForUpdate()
    await useAppUpdaterStore.getState().downloadAndInstall()
    expect(apiDownloadAndInstallUpdate).toHaveBeenCalledTimes(1)
    expect(useAppUpdaterStore.getState().status).toBe('ready')
  })

  it('reports an error when the install fails', async () => {
    apiCheckForUpdate.mockResolvedValue({ version: '1.4.0', body: null })
    apiDownloadAndInstallUpdate.mockRejectedValue(new Error('disk full'))
    await useAppUpdaterStore.getState().checkForUpdate()
    await useAppUpdaterStore.getState().downloadAndInstall()
    const s = useAppUpdaterStore.getState()
    expect(s.status).toBe('error')
    expect(s.error).toBe('disk full')
  })
})

describe('appUpdater.store — relaunch', () => {
  it('delegates to the relaunch API', async () => {
    apiRelaunchApp.mockResolvedValue(undefined)
    await useAppUpdaterStore.getState().relaunch()
    expect(apiRelaunchApp).toHaveBeenCalledTimes(1)
  })
})
