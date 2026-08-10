import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmptyState, NoResults } from './EmptyState'

describe('EmptyState', () => {
  it('shows the icon, heading and explanation', () => {
    render(
      <EmptyState
        icon={<span data-testid="icon" />}
        title="Nothing followed yet"
        description="Follow a pull request to see it here."
      />
    )

    expect(screen.getByTestId('icon')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Nothing followed yet' })).toBeInTheDocument()
    expect(screen.getByText('Follow a pull request to see it here.')).toBeInTheDocument()
  })

  it('renders and wires an action when one is given', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(
      <EmptyState
        icon={<span />}
        title="Nothing yet"
        description="…"
        action={<button onClick={onClick}>Add one</button>}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Add one' }))

    expect(onClick).toHaveBeenCalledOnce()
  })

  /** The gap under the description exists to separate it from a button; with no button it would be
   * a stray 16px at the bottom of the block. */
  it('only spaces the description away from an action that exists', () => {
    const { rerender } = render(<EmptyState icon={<span />} title="T" description="D" />)
    expect(screen.getByText('D')).not.toHaveClass('mb-4')

    rerender(<EmptyState icon={<span />} title="T" description="D" action={<button>Go</button>} />)
    expect(screen.getByText('D')).toHaveClass('mb-4')
  })
})

describe('NoResults', () => {
  it('shows the icon and the message', () => {
    render(<NoResults icon={<span data-testid="icon" />} message="No pull requests match" />)

    expect(screen.getByTestId('icon')).toBeInTheDocument()
    expect(screen.getByText('No pull requests match')).toBeInTheDocument()
  })

  /** Deliberately not an `EmptyState`: a filter that matched nothing is undone by the filter, not
   * by a button here, so there is no heading to shout with and nothing to press. */
  it('offers no heading and no action', () => {
    render(<NoResults icon={<span />} message="No match" />)

    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('accepts any node as its icon, including an emoji', () => {
    render(<NoResults icon={<span>🔍</span>} message="No match" />)

    expect(screen.getByText('🔍')).toBeInTheDocument()
  })
})
