import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { dueDateShortcuts } from '../lib/cardMeta'
import { CardDueDatePicker } from './CardDueDatePicker'

function renderPicker(dueDate?: string) {
  const onSelect = vi.fn()
  render(<CardDueDatePicker dueDate={dueDate} onSelect={onSelect} />)
  return onSelect
}

const [today, tomorrow, nextWeek] = dueDateShortcuts()

describe('CardDueDatePicker', () => {
  /** A date typed into a picker is a calendar lookup for something the app already knows. */
  it('offers today, tomorrow and a week out, each with the date it lands on', () => {
    renderPicker()
    expect(screen.getByTestId('card-due-date-option-today')).toHaveTextContent(today.date)
    expect(screen.getByTestId('card-due-date-option-tomorrow')).toHaveTextContent(tomorrow.date)
    expect(screen.getByTestId('card-due-date-option-nextWeek')).toHaveTextContent(nextWeek.date)
  })

  it('sets the offered date on the first click', async () => {
    const onSelect = renderPicker()
    await userEvent.click(screen.getByTestId('card-due-date-option-tomorrow'))
    expect(onSelect).toHaveBeenCalledWith(tomorrow.date)
  })

  it('ticks the offer the card is already due on', () => {
    renderPicker(today.date)
    expect(screen.getByTestId('card-due-date-option-today').querySelector('svg')).toBeTruthy()
    expect(screen.getByTestId('card-due-date-option-nextWeek').querySelector('svg')).toBeNull()
  })

  /** The three offers cover the common deadlines, not all of them — anything else is still typed. */
  it('takes a date that is none of the three', () => {
    const onSelect = renderPicker()
    fireEvent.change(screen.getByTestId('card-due-date-input'), {
      target: { value: '2031-03-04' },
    })
    expect(onSelect).toHaveBeenCalledWith('2031-03-04')
  })

  /** Clearing is a row here rather than beside the value: a native date input doesn't reliably fire
   * a change when it is emptied, so "no deadline" has to be something one picks. */
  it('clears the deadline with null', async () => {
    const onSelect = renderPicker('2030-01-01')
    await userEvent.click(screen.getByTestId('card-due-date-clear'))
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('offers nothing to clear on a card with no deadline', () => {
    renderPicker()
    expect(screen.queryByTestId('card-due-date-clear')).not.toBeInTheDocument()
  })
})
