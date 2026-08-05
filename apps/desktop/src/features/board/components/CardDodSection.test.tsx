import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CardDodSection } from './CardDodSection'

function renderSection(props: Partial<React.ComponentProps<typeof CardDodSection>> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined)
  render(<CardDodSection dod="" onSave={onSave} {...props} />)
  return onSave
}

describe('CardDodSection', () => {
  it('says there is no checklist when the card has none', () => {
    renderSection()
    expect(screen.getByTestId('card-dod-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('card-dod-progress')).not.toBeInTheDocument()
  })

  it('shows one row per item, with its label', () => {
    renderSection({ dod: '- [x] Tests pass\n- [ ] Reviewed' })
    expect(screen.getByTestId('card-dod-text-0')).toHaveValue('Tests pass')
    expect(screen.getByTestId('card-dod-text-1')).toHaveValue('Reviewed')
    expect(screen.getByTestId('card-dod-progress')).toHaveTextContent('1/2')
  })

  it('never shows raw markdown — the user edits rows, not a document', () => {
    renderSection({ dod: '- [ ] One' })
    expect(screen.queryByDisplayValue('- [ ] One')).not.toBeInTheDocument()
  })

  it('ticks an item', async () => {
    const onSave = renderSection({ dod: '- [ ] One\n- [ ] Two' })
    await userEvent.click(screen.getByTestId('card-dod-check-0'))
    expect(onSave).toHaveBeenCalledWith('- [x] One\n- [ ] Two')
  })

  it('unticks an item', async () => {
    const onSave = renderSection({ dod: '- [x] One' })
    await userEvent.click(screen.getByTestId('card-dod-check-0'))
    expect(onSave).toHaveBeenCalledWith('- [ ] One')
  })

  it('renames an item on blur', () => {
    const onSave = renderSection({ dod: '- [ ] One' })
    const input = screen.getByTestId('card-dod-text-0')
    fireEvent.change(input, { target: { value: 'One revised' } })
    fireEvent.blur(input)
    expect(onSave).toHaveBeenCalledWith('- [ ] One revised')
  })

  it('writes nothing when a label is left unchanged', () => {
    const onSave = renderSection({ dod: '- [ ] One' })
    fireEvent.blur(screen.getByTestId('card-dod-text-0'))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('removes an item', async () => {
    const onSave = renderSection({ dod: '- [ ] One\n- [ ] Two' })
    await userEvent.click(screen.getByTestId('card-dod-remove-0'))
    expect(onSave).toHaveBeenCalledWith('- [ ] Two')
  })

  it('adds an item on Enter and clears the field', async () => {
    const onSave = renderSection({ dod: '- [ ] One' })
    const input = screen.getByTestId('card-dod-add-input')
    await userEvent.type(input, 'Two{Enter}')

    expect(onSave).toHaveBeenCalledWith('- [ ] One\n- [ ] Two')
    expect(input).toHaveValue('')
  })

  it('adds the first item to an empty checklist', async () => {
    const onSave = renderSection()
    await userEvent.type(screen.getByTestId('card-dod-add-input'), 'First{Enter}')
    expect(onSave).toHaveBeenCalledWith('- [ ] First')
  })

  /** Without the optimistic copy the tick would spring back until the write settled. */
  it('shows the tick immediately, before the save resolves', async () => {
    let resolve = () => {}
    const onSave = vi.fn(() => new Promise<void>((r) => (resolve = r)))
    render(<CardDodSection dod="- [ ] One" onSave={onSave} />)

    await userEvent.click(screen.getByTestId('card-dod-check-0'))
    expect(screen.getByTestId('card-dod-progress')).toHaveTextContent('1/1')
    resolve()
  })

  /** Items are addressed by line number, so prose in the document has to survive editing it. */
  it('keeps a closing note when an item is added', async () => {
    const onSave = renderSection({ dod: '- [ ] One\n\nAsk Ada before shipping.' })
    await userEvent.type(screen.getByTestId('card-dod-add-input'), 'Two{Enter}')
    expect(onSave).toHaveBeenCalledWith('- [ ] One\n- [ ] Two\n\nAsk Ada before shipping.')
  })

  it('is read-only on a closed sprint', () => {
    renderSection({ dod: '- [ ] One', readOnly: true })
    expect(screen.getByTestId('card-dod-check-0')).toBeDisabled()
    expect(screen.queryByTestId('card-dod-add-input')).not.toBeInTheDocument()
    expect(screen.queryByTestId('card-dod-remove-0')).not.toBeInTheDocument()
  })
})
