import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CardChoiceList } from './CardChoiceList'

const OPTIONS = [
  { value: 'high', label: 'High', icon: <span data-testid="glyph-high" /> },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
]

function renderList(value = 'normal') {
  const onSelect = vi.fn()
  render(
    <CardChoiceList
      options={OPTIONS}
      value={value}
      onSelect={onSelect}
      testIdPrefix="choice"
      ariaLabel="Priority"
    />
  )
  return onSelect
}

describe('CardChoiceList', () => {
  it('lists every value, in the order it was given', () => {
    renderList()
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'High',
      'Normal',
      'Low',
    ])
  })

  it('sets the field on the first click', async () => {
    const onSelect = renderList()
    await userEvent.click(screen.getByTestId('choice-low'))
    expect(onSelect).toHaveBeenCalledWith('low')
  })

  /** The list is a read-out as well as a choice: picking is made against the current value rather
   * than blind. */
  it('marks the value the card holds, and only it', () => {
    renderList('high')
    expect(screen.getByTestId('choice-high')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('choice-low')).toHaveAttribute('aria-selected', 'false')
  })

  /** The glyph is how the value is recognised on the board — it has to travel into the list, which
   * is what a native `<select>` cannot do. */
  it('carries each value’s own mark', () => {
    renderList()
    expect(screen.getByTestId('choice-high')).toContainElement(screen.getByTestId('glyph-high'))
  })
})
