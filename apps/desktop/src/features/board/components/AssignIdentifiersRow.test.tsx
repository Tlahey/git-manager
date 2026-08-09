import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AssignIdentifiersRow } from './AssignIdentifiersRow'

describe('AssignIdentifiersRow', () => {
  /** A board whose cards all have identifiers is a board with no problem to describe. */
  it('renders nothing when every card is numbered', () => {
    const { container } = render(
      <AssignIdentifiersRow count={0} prefix="GM" onAssign={vi.fn()} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('says how many cards have no identifier, and what they would be called', () => {
    render(<AssignIdentifiersRow count={3} prefix="GM" onAssign={vi.fn()} />)
    expect(screen.getByTestId('board-settings-assign-identifiers')).toHaveTextContent(
      '3 cards have no identifier'
    )
    expect(screen.getByTestId('board-settings-assign-identifiers-run')).toHaveTextContent(
      'Number them GM-1, GM-2…'
    )
  })

  it('numbers them from the prefix on screen', async () => {
    const onAssign = vi.fn().mockResolvedValue(3)
    render(<AssignIdentifiersRow count={3} prefix="OPS" onAssign={onAssign} />)

    await userEvent.click(screen.getByTestId('board-settings-assign-identifiers-run'))
    expect(onAssign).toHaveBeenCalledWith('OPS')
  })

  /** The write is reported by the action layer; the row's only job is to stop spinning and stay
   * usable rather than leave an unhandled rejection behind. */
  it('recovers from a failed write', async () => {
    const onAssign = vi.fn().mockRejectedValue(new Error('nope'))
    render(<AssignIdentifiersRow count={1} prefix="GM" onAssign={onAssign} />)

    await userEvent.click(screen.getByTestId('board-settings-assign-identifiers-run'))
    await waitFor(() =>
      expect(screen.getByTestId('board-settings-assign-identifiers-run')).toBeEnabled()
    )
  })

  it('cannot be pressed while the board is saving', () => {
    render(<AssignIdentifiersRow count={1} prefix="GM" onAssign={vi.fn()} disabled />)
    expect(screen.getByTestId('board-settings-assign-identifiers-run')).toBeDisabled()
  })
})
