import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { pickPath } from './pickPath'
import { useE2ePathPickerStore } from '../stores/e2ePathPicker.store'

beforeEach(() => {
  useE2ePathPickerStore.setState({ open: false, value: '', resolve: null })
})


describe('pickPath', () => {
  it('runs the real picker outside of e2e builds', async () => {
    const real = vi.fn().mockResolvedValue('/real/path')
    await expect(pickPath(real)).resolves.toBe('/real/path')
    expect(real).toHaveBeenCalled()
  })

  it('routes to the e2e debug dialog instead of the real picker in an e2e build', async () => {
    vi.stubEnv('VITE_E2E', 'true')
    const real = vi.fn()

    const pending = pickPath(real)
    expect(real).not.toHaveBeenCalled()
    expect(useE2ePathPickerStore.getState().open).toBe(true)

    useE2ePathPickerStore.getState().setValue('/debug/path')
    useE2ePathPickerStore.getState().confirm()

    await expect(pending).resolves.toBe('/debug/path')
  })
})
