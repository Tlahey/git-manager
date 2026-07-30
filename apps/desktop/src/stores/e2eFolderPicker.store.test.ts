import { describe, it, expect, beforeEach } from 'vitest'
import { useE2eFolderPickerStore } from './e2eFolderPicker.store'

beforeEach(() => {
  useE2eFolderPickerStore.setState({ open: false, value: '', resolve: null })
})

describe('e2eFolderPicker store', () => {
  it('request opens the dialog and resolves once confirmed', async () => {
    const pending = useE2eFolderPickerStore.getState().request()
    expect(useE2eFolderPickerStore.getState().open).toBe(true)

    useE2eFolderPickerStore.getState().setValue('/tmp/git-manager-fixtures/stash-stack')
    useE2eFolderPickerStore.getState().confirm()

    await expect(pending).resolves.toBe('/tmp/git-manager-fixtures/stash-stack')
    expect(useE2eFolderPickerStore.getState().open).toBe(false)
  })

  it('confirm with a blank value resolves null', async () => {
    const pending = useE2eFolderPickerStore.getState().request()
    useE2eFolderPickerStore.getState().confirm()
    await expect(pending).resolves.toBeNull()
  })

  it('cancel resolves null and closes the dialog', async () => {
    const pending = useE2eFolderPickerStore.getState().request()
    useE2eFolderPickerStore.getState().setValue('/some/path')
    useE2eFolderPickerStore.getState().cancel()

    await expect(pending).resolves.toBeNull()
    expect(useE2eFolderPickerStore.getState().open).toBe(false)
    expect(useE2eFolderPickerStore.getState().value).toBe('')
  })

  it('each request only resolves once, even if a stale confirm somehow fires again', async () => {
    const pending = useE2eFolderPickerStore.getState().request()
    useE2eFolderPickerStore.getState().setValue('/a')
    useE2eFolderPickerStore.getState().confirm()
    await expect(pending).resolves.toBe('/a')

    // A second confirm with no open request is a no-op, not a crash.
    expect(() => useE2eFolderPickerStore.getState().confirm()).not.toThrow()
  })
})
