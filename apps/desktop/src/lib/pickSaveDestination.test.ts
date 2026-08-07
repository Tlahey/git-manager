import { describe, it, expect, vi, beforeEach } from 'vitest'

const { saveMock } = vi.hoisted(() => ({ saveMock: vi.fn() }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: saveMock }))

import { pickSaveDestination } from './pickSaveDestination'
import { useE2ePathPickerStore } from '../stores/e2ePathPicker.store'

beforeEach(() => {
  saveMock.mockReset()
  useE2ePathPickerStore.setState({ open: false, value: '', resolve: null })
})


describe('pickSaveDestination', () => {
  it('delegates to the native dialog outside of e2e builds', async () => {
    saveMock.mockResolvedValue('/tmp/changes.patch')
    await expect(pickSaveDestination('changes.patch')).resolves.toBe('/tmp/changes.patch')
    expect(saveMock).toHaveBeenCalledWith({ defaultPath: 'changes.patch' })
  })

  it('resolves null when the native dialog is cancelled', async () => {
    saveMock.mockResolvedValue(null)
    await expect(pickSaveDestination('changes.patch')).resolves.toBeNull()
  })

  it('uses the e2e debug dialog instead of the native one in an e2e build', async () => {
    vi.stubEnv('VITE_E2E', 'true')

    const pending = pickSaveDestination('changes.patch')
    expect(saveMock).not.toHaveBeenCalled()
    expect(useE2ePathPickerStore.getState().open).toBe(true)

    useE2ePathPickerStore.getState().setValue('/tmp/changes.patch')
    useE2ePathPickerStore.getState().confirm()

    await expect(pending).resolves.toBe('/tmp/changes.patch')
  })
})
