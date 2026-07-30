import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { E2eFolderPickerDialog } from './E2eFolderPickerDialog'
import { useE2eFolderPickerStore } from '../stores/e2eFolderPicker.store'

beforeEach(() => {
  useE2eFolderPickerStore.setState({ open: false, value: '', resolve: null })
})

describe('E2eFolderPickerDialog', () => {
  it('is not shown until a request opens it', () => {
    render(<E2eFolderPickerDialog />)
    expect(screen.queryByTestId('e2e-folder-picker-dialog')).not.toBeInTheDocument()
  })

  it('resolves the pending request with the typed path on Choose', async () => {
    const user = userEvent.setup()
    render(<E2eFolderPickerDialog />)

    const pending = useE2eFolderPickerStore.getState().request()
    expect(await screen.findByTestId('e2e-folder-picker-dialog')).toBeInTheDocument()

    await user.type(
      screen.getByTestId('e2e-folder-picker-input'),
      '/tmp/git-manager-fixtures/stash-stack'
    )
    await user.click(screen.getByTestId('e2e-folder-picker-confirm'))

    await expect(pending).resolves.toBe('/tmp/git-manager-fixtures/stash-stack')
    expect(screen.queryByTestId('e2e-folder-picker-dialog')).not.toBeInTheDocument()
  })

  it('resolves null on Cancel', async () => {
    const user = userEvent.setup()
    render(<E2eFolderPickerDialog />)

    const pending = useE2eFolderPickerStore.getState().request()
    await user.click(await screen.findByTestId('e2e-folder-picker-cancel'))

    await expect(pending).resolves.toBeNull()
  })

  it('disables Choose until a path is typed', async () => {
    render(<E2eFolderPickerDialog />)
    useE2eFolderPickerStore.getState().request()

    expect(await screen.findByTestId('e2e-folder-picker-confirm')).toBeDisabled()
  })
})
