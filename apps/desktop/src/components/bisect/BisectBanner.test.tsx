import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BisectState } from '@git-manager/git-types'

const mark = vi.fn()
const reset = vi.fn()
let bisect: BisectState | undefined

vi.mock('../../hooks/useBisectState', () => ({
  useBisectState: () => ({ data: bisect }),
}))
vi.mock('../../hooks/useBisectActions', () => ({
  useBisectActions: () => ({ mark, reset, pending: false }),
}))

import { BisectBanner } from './BisectBanner'

function baseState(overrides: Partial<BisectState> = {}): BisectState {
  return {
    active: true,
    badTerm: 'bad',
    goodTerm: 'good',
    goodOids: [],
    skippedOids: [],
    currentOid: 'a3f9c1dabc',
    currentSummary: 'Migrate cache to Redis',
    stepsRemaining: 3,
    revsRemaining: 6,
    ...overrides,
  }
}

describe('BisectBanner', () => {
  beforeEach(() => {
    mark.mockClear()
    reset.mockClear()
    bisect = undefined
  })

  it('renders nothing when no bisect is active', () => {
    bisect = baseState({ active: false })
    const { container } = render(<BisectBanner repoPath="/repo" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing once the search has resolved', () => {
    bisect = baseState({ firstBadOid: 'a3f9c1dabc' })
    const { container } = render(<BisectBanner repoPath="/repo" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the commit under test, progress and validation buttons', () => {
    bisect = baseState()
    render(<BisectBanner repoPath="/repo" />)
    expect(screen.getByText('Bisecting')).toBeInTheDocument()
    expect(screen.getByText(/a3f9c1d/)).toBeInTheDocument()
    expect(screen.getByText(/Migrate cache to Redis/)).toBeInTheDocument()
    expect(screen.getByText(/3 steps left/)).toBeInTheDocument()
    expect(screen.getByTestId('bisect-good-button')).toBeInTheDocument()
    expect(screen.getByTestId('bisect-bad-button')).toBeInTheDocument()
    expect(screen.getByTestId('bisect-skip-button')).toBeInTheDocument()
    expect(screen.getByTestId('bisect-abort-button')).toBeInTheDocument()
  })

  it('marks the current commit good/bad/skip and aborts', async () => {
    bisect = baseState()
    const user = userEvent.setup()
    render(<BisectBanner repoPath="/repo" />)

    await user.click(screen.getByTestId('bisect-good-button'))
    expect(mark).toHaveBeenCalledWith('good')

    await user.click(screen.getByTestId('bisect-bad-button'))
    expect(mark).toHaveBeenCalledWith('bad')

    await user.click(screen.getByTestId('bisect-skip-button'))
    expect(mark).toHaveBeenCalledWith('skip')

    await user.click(screen.getByTestId('bisect-abort-button'))
    expect(reset).toHaveBeenCalled()
  })
})
