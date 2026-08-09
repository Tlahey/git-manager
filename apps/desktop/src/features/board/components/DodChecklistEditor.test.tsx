import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DodChecklistEditor } from './DodChecklistEditor'

function renderEditor(props: Partial<React.ComponentProps<typeof DodChecklistEditor>> = {}) {
  const onChange = vi.fn()
  render(<DodChecklistEditor value="" onChange={onChange} {...props} />)
  return onChange
}

describe('DodChecklistEditor', () => {
  it('lists the markdown checklist as its items', () => {
    renderEditor({ value: '- [x] Tests pass\n- [ ] Reviewed' })

    expect(screen.getByTestId('card-dod-text-0')).toHaveValue('Tests pass')
    expect(screen.getByTestId('card-dod-text-1')).toHaveValue('Reviewed')
    expect(screen.getByTestId('card-dod-check-0')).toBeChecked()
  })

  it('removes the item whose bin is clicked, leaving the rest', async () => {
    const onChange = renderEditor({ value: '- [ ] One\n- [ ] Two' })

    await userEvent.click(screen.getByTestId('card-dod-remove-0'))
    expect(onChange).toHaveBeenCalledWith('- [ ] Two')
  })

  it('adds the typed item on Enter', async () => {
    const onChange = renderEditor({ value: '- [ ] One' })

    await userEvent.type(screen.getByTestId('card-dod-add-input'), 'Two{Enter}')
    expect(onChange).toHaveBeenCalledWith('- [ ] One\n- [ ] Two')
  })

  /**
   * The `+` is a button, not decoration beside the field: it is the only affordance a user who never
   * guessed the draft row was typable can see.
   */
  it('adds the typed item from the + button', async () => {
    const onChange = renderEditor({ value: '- [ ] One' })

    await userEvent.type(screen.getByTestId('card-dod-add-input'), 'Two')
    await userEvent.click(screen.getByTestId('card-dod-add-button'))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('- [ ] One\n- [ ] Two')
  })

  /** The click must not commit through the blur *and* through itself — the second add would append
   * the same sentence twice, or an empty one. */
  it('adds it once, and leaves the caret in the field to type the next', async () => {
    const onChange = renderEditor({ value: '' })

    await userEvent.type(screen.getByTestId('card-dod-add-input'), 'One')
    await userEvent.click(screen.getByTestId('card-dod-add-button'))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('card-dod-add-input')).toHaveFocus()
  })

  it('adds nothing from an empty draft', async () => {
    const onChange = renderEditor({ value: '- [ ] One' })

    await userEvent.click(screen.getByTestId('card-dod-add-button'))
    expect(onChange).not.toHaveBeenCalled()
  })

  /** A template has no state to tick — only items to list. */
  it('hides the tick boxes when asked, keeping the rows editable', () => {
    renderEditor({ value: '- [ ] One', hideChecks: true })

    expect(screen.queryByTestId('card-dod-check-0')).not.toBeInTheDocument()
    expect(screen.getByTestId('card-dod-text-0')).toHaveValue('One')
    expect(screen.getByTestId('card-dod-remove-0')).toBeInTheDocument()
  })

  it('offers no way to change the list when disabled', () => {
    renderEditor({ value: '- [ ] One', disabled: true })

    expect(screen.queryByTestId('card-dod-add-input')).not.toBeInTheDocument()
    expect(screen.queryByTestId('card-dod-add-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('card-dod-remove-0')).not.toBeInTheDocument()
    expect(screen.getByText('One')).toBeInTheDocument()
  })
})
