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

import { BisectPanel } from './BisectPanel'

function state(overrides: Partial<BisectState> = {}): BisectState {
  return {
    active: true,
    badTerm: 'bad',
    goodTerm: 'good',
    badOid: 'bad1111',
    goodOids: ['good1111'],
    skippedOids: [],
    currentOid: 'cur1111abc',
    currentSummary: 'Migrate cache to Redis',
    currentAuthor: 'Alice',
    stepsRemaining: 2,
    revsRemaining: 4,
    ...overrides,
  }
}

describe('BisectPanel', () => {
  beforeEach(() => {
    mark.mockClear()
    reset.mockClear()
    bisect = undefined
  })

  it('renders nothing when inactive', () => {
    bisect = state({ active: false })
    const { container } = render(<BisectPanel repoPath="/repo" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the commit under test with its progress and recap', () => {
    bisect = state()
    render(<BisectPanel repoPath="/repo" />)
    expect(screen.getByTestId('bisect-panel')).toBeInTheDocument()
    expect(screen.getByText('Commit under test')).toBeInTheDocument()
    expect(screen.getByText('Migrate cache to Redis')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText(/2 steps left/)).toBeInTheDocument()
    // Recap chips for known good / bad commits.
    expect(screen.getByText('bad1111'.slice(0, 7))).toBeInTheDocument()
    expect(screen.getByText('good111')).toBeInTheDocument()
  })

  it('marks the commit and reset label reads Abort while running', async () => {
    bisect = state()
    const user = userEvent.setup()
    render(<BisectPanel repoPath="/repo" />)
    await user.click(screen.getByTestId('bisect-panel-bad'))
    expect(mark).toHaveBeenCalledWith('bad')
    expect(screen.getByTestId('bisect-panel-reset')).toHaveTextContent('Abort')
  })

  it('hides the test controls and shows Finish once resolved', () => {
    bisect = state({ firstBadOid: 'cur1111abc' })
    render(<BisectPanel repoPath="/repo" />)
    expect(screen.queryByTestId('bisect-panel-good')).not.toBeInTheDocument()
    expect(screen.getByTestId('bisect-panel-reset')).toHaveTextContent('Finish')
  })
})
