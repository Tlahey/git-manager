import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CardPrefixPicker } from './CardPrefixPicker'

function renderPicker(prefixes: string[], value = '') {
  const onChange = vi.fn()
  render(<CardPrefixPicker prefixes={prefixes} value={value} onChange={onChange} />)
  return onChange
}

describe('CardPrefixPicker', () => {
  it('offers every prefix the board lists', () => {
    renderPicker(['GM', 'BUG'], 'GM')
    expect(screen.getByRole('option', { name: 'GM' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'BUG' })).toBeInTheDocument()
  })

  /** A card without an identifier is a deliberate choice on a board that has sequences, not a form
   * left half-filled — so it is a real option rather than an empty field. */
  it('keeps "no identifier" as an explicit choice', async () => {
    const onChange = renderPicker(['GM'], 'GM')
    await userEvent.selectOptions(screen.getByTestId('card-prefix-select'), '')
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('reports a newly typed prefix uppercased', async () => {
    const onChange = renderPicker(['GM'], 'GM')
    await userEvent.click(screen.getByTestId('card-prefix-add'))
    await userEvent.type(screen.getByTestId('card-prefix-new-input'), 'ops')
    await userEvent.click(screen.getByTestId('card-prefix-new-confirm'))
    expect(onChange).toHaveBeenCalledWith('OPS')
  })

  it('takes Enter as confirmation', async () => {
    const onChange = renderPicker([])
    await userEvent.click(screen.getByTestId('card-prefix-add'))
    await userEvent.type(screen.getByTestId('card-prefix-new-input'), 'ops{Enter}')
    expect(onChange).toHaveBeenCalledWith('OPS')
  })

  it('reports nothing when the new prefix is abandoned', async () => {
    const onChange = renderPicker(['GM'], 'GM')
    await userEvent.click(screen.getByTestId('card-prefix-add'))
    await userEvent.type(screen.getByTestId('card-prefix-new-input'), 'ops')
    await userEvent.click(screen.getByTestId('card-prefix-new-cancel'))

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByTestId('card-prefix-select')).toBeInTheDocument()
  })

  /** The board's list won't hold it until the card is written, so the picker has to carry it in the
   * meantime or the selection would render as blank. */
  it('shows a prefix the board does not list yet', () => {
    renderPicker(['GM'], 'OPS')
    expect(screen.getByTestId('card-prefix-select')).toHaveValue('OPS')
  })
})
