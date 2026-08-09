import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CardPrefixPicker } from './CardPrefixPicker'

/** Controlled by a host, as in the dialog: typing only works if the value comes back down. */
function Harness({
  prefixes,
  initial,
  onChange,
}: {
  prefixes: string[]
  initial: string
  onChange: (prefix: string) => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <CardPrefixPicker
      prefixes={prefixes}
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

function renderPicker(prefixes: string[], value = '') {
  const onChange = vi.fn()
  render(<Harness prefixes={prefixes} initial={value} onChange={onChange} />)
  return onChange
}

describe('CardPrefixPicker', () => {
  it('offers every prefix the board lists', async () => {
    renderPicker(['GM', 'BUG'], 'GM')
    await userEvent.click(screen.getByTestId('card-prefix-input'))
    expect(screen.getByRole('option', { name: 'GM' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'BUG' })).toBeInTheDocument()
  })

  it('reports the prefix that was picked from the list', async () => {
    const onChange = renderPicker(['GM', 'BUG'], 'GM')
    await userEvent.click(screen.getByTestId('card-prefix-input'))
    await userEvent.click(screen.getByTestId('card-prefix-option-BUG'))
    expect(onChange).toHaveBeenCalledWith('BUG')
  })

  /** Typing is what starts a sequence — there is no separate "add a prefix" mode to enter. */
  it('reports a typed prefix uppercased, without confirming anything', async () => {
    const onChange = renderPicker(['GM'], '')
    await userEvent.type(screen.getByTestId('card-prefix-input'), 'ops')
    expect(onChange).toHaveBeenLastCalledWith('OPS')
  })

  it('says a typed prefix the board does not list starts a new sequence', async () => {
    renderPicker(['GM'], 'OPS')
    await userEvent.click(screen.getByTestId('card-prefix-input'))
    expect(screen.getByText('"OPS" starts a new sequence')).toBeInTheDocument()
  })

  /** A card always gets an identifier now, so there is nothing here that means "none". */
  it('offers no way to pick "no identifier"', async () => {
    renderPicker(['GM'], 'GM')
    await userEvent.click(screen.getByTestId('card-prefix-input'))
    expect(screen.queryByText('No identifier')).not.toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(1)
  })

  /** The board's list won't hold it until the card is written — the field holds it in the meantime,
   * and the list stays the board's so the value can still be told apart from what already exists. */
  it('holds a prefix the board does not list yet without adding it to the list', async () => {
    renderPicker(['GM'], 'OPS')
    expect(screen.getByTestId('card-prefix-input')).toHaveValue('OPS')
    await userEvent.click(screen.getByTestId('card-prefix-input'))
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['GM'])
  })

  it('tells a board with no sequence yet what to do', async () => {
    renderPicker([], '')
    await userEvent.click(screen.getByTestId('card-prefix-input'))
    expect(screen.getByText('Type a prefix to start a sequence')).toBeInTheDocument()
  })
})
