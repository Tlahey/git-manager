import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { openMock } = vi.hoisted(() => ({ openMock: vi.fn() }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: openMock }))

import { pickFile } from './pickFile'
import { useE2ePathPickerStore } from '../stores/e2ePathPicker.store'

beforeEach(() => {
  openMock.mockReset()
  useE2ePathPickerStore.setState({ open: false, value: '', resolve: null })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('pickFile', () => {
  it('delegates to the native dialog outside of e2e builds', async () => {
    openMock.mockResolvedValue('/tmp/changes.patch')
    const filters = [{ name: 'Patch', extensions: ['patch', 'diff'] }]
    await expect(pickFile({ filters })).resolves.toBe('/tmp/changes.patch')
    expect(openMock).toHaveBeenCalledWith({ multiple: false, filters })
  })

  it('resolves null when the native dialog is cancelled', async () => {
    openMock.mockResolvedValue(null)
    await expect(pickFile()).resolves.toBeNull()
  })

  it('uses the e2e debug dialog instead of the native one in an e2e build', async () => {
    vi.stubEnv('VITE_E2E', 'true')

    const pending = pickFile()
    expect(openMock).not.toHaveBeenCalled()
    expect(useE2ePathPickerStore.getState().open).toBe(true)

    useE2ePathPickerStore.getState().setValue('/tmp/changes.patch')
    useE2ePathPickerStore.getState().confirm()

    await expect(pending).resolves.toBe('/tmp/changes.patch')
  })
})
