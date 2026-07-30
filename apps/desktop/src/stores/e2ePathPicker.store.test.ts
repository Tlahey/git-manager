import { describe, it, expect, beforeEach } from 'vitest'
import { useE2ePathPickerStore } from './e2ePathPicker.store'

beforeEach(() => {
  useE2ePathPickerStore.setState({ open: false, value: '', resolve: null })
})

describe('e2ePathPicker store', () => {
  it('request opens the dialog and resolves once confirmed', async () => {
    const pending = useE2ePathPickerStore.getState().request()
    expect(useE2ePathPickerStore.getState().open).toBe(true)

    useE2ePathPickerStore.getState().setValue('/tmp/git-manager-fixtures/stash-stack')
    useE2ePathPickerStore.getState().confirm()

    await expect(pending).resolves.toBe('/tmp/git-manager-fixtures/stash-stack')
    expect(useE2ePathPickerStore.getState().open).toBe(false)
  })

  it('confirm with a blank value resolves null', async () => {
    const pending = useE2ePathPickerStore.getState().request()
    useE2ePathPickerStore.getState().confirm()
    await expect(pending).resolves.toBeNull()
  })

  it('cancel resolves null and closes the dialog', async () => {
    const pending = useE2ePathPickerStore.getState().request()
    useE2ePathPickerStore.getState().setValue('/some/path')
    useE2ePathPickerStore.getState().cancel()

    await expect(pending).resolves.toBeNull()
    expect(useE2ePathPickerStore.getState().open).toBe(false)
    expect(useE2ePathPickerStore.getState().value).toBe('')
  })

  it('each request only resolves once, even if a stale confirm somehow fires again', async () => {
    const pending = useE2ePathPickerStore.getState().request()
    useE2ePathPickerStore.getState().setValue('/a')
    useE2ePathPickerStore.getState().confirm()
    await expect(pending).resolves.toBe('/a')

    // A second confirm with no open request is a no-op, not a crash.
    expect(() => useE2ePathPickerStore.getState().confirm()).not.toThrow()
  })
})
