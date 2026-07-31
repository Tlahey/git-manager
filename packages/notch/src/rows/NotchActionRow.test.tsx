import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotchActionRow } from './NotchActionRow'
import { NOTCH_ROW, withRule } from '../notchGeometry'

describe('NotchActionRow', () => {
  it('reports the id of the button that was pressed', async () => {
    const onAction = vi.fn()
    render(
      <NotchActionRow
        actions={[
          { id: 'open', label: 'Open in app', variant: 'primary' },
          { id: 'github', label: 'GitHub' },
        ]}
        onAction={onAction}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: 'GitHub' }))
    expect(onAction).toHaveBeenCalledWith('github')
  })

  it('does not let a button press also activate the card underneath it', async () => {
    // The card is clickable as a whole; without stopPropagation a press on "Open" would fire the
    // button's action *and* the card's, which are not always the same thing.
    const onAction = vi.fn()
    const onCardClick = vi.fn()
    render(
      <div onClick={onCardClick}>
        <NotchActionRow actions={[{ id: 'open', label: 'Open' }]} onAction={onAction} />
      </div>
    )
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(onAction).toHaveBeenCalledWith('open')
    expect(onCardClick).not.toHaveBeenCalled()
  })

  it('shows the badge when there is one', () => {
    render(<NotchActionRow actions={[]} badge="#231" onAction={vi.fn()} />)
    expect(screen.getByTestId('notch-badge')).toHaveTextContent('#231')
  })

  it('renders a bare row when there is neither button nor badge', () => {
    render(<NotchActionRow actions={[]} onAction={vi.fn()} />)
    expect(screen.getByTestId('notch-action-row')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('notch-badge')).not.toBeInTheDocument()
  })

  it('sizes itself to the geometry, hairline included', () => {
    render(<NotchActionRow actions={[]} onAction={vi.fn()} />)
    expect(screen.getByTestId('notch-action-row')).toHaveStyle({
      height: `${withRule(NOTCH_ROW.actions)}px`,
    })
  })
})
