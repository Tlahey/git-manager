import { describe, it, expect, vi, beforeEach } from 'vitest'

const { openMock } = vi.hoisted(() => ({ openMock: vi.fn() }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: openMock }))

import { pickFolder } from './pickFolder'
import { useE2ePathPickerStore } from '../stores/e2ePathPicker.store'

beforeEach(() => {
  openMock.mockReset()
  useE2ePathPickerStore.setState({ open: false, value: '', resolve: null })
})


describe('pickFolder', () => {
  it('delegates to the native dialog outside of e2e builds', async () => {
    openMock.mockResolvedValue('/Users/me/repo')
    await expect(pickFolder()).resolves.toBe('/Users/me/repo')
    expect(openMock).toHaveBeenCalledWith({ directory: true, multiple: false })
  })

  it('resolves null when the native dialog is cancelled', async () => {
    openMock.mockResolvedValue(null)
    await expect(pickFolder()).resolves.toBeNull()
  })

  it('uses the e2e debug dialog instead of the native one in an e2e build', async () => {
    vi.stubEnv('VITE_E2E', 'true')

    const pending = pickFolder()
    expect(openMock).not.toHaveBeenCalled()
    expect(useE2ePathPickerStore.getState().open).toBe(true)

    useE2ePathPickerStore.getState().setValue('/tmp/git-manager-fixtures/stash-stack')
    useE2ePathPickerStore.getState().confirm()

    await expect(pending).resolves.toBe('/tmp/git-manager-fixtures/stash-stack')
  })
})
