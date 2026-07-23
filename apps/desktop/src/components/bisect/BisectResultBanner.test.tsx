import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BisectState } from '@git-manager/git-types'

const reset = vi.fn()
const setPendingGraphSelection = vi.fn()
let bisect: BisectState | undefined

vi.mock('../../hooks/useBisectState', () => ({
  useBisectState: () => ({ data: bisect }),
}))
vi.mock('../../hooks/useBisectActions', () => ({
  useBisectActions: () => ({ mark: vi.fn(), reset, pending: false }),
}))
vi.mock('../../stores/repoUI.store', () => ({
  useRepoUIStore: { getState: () => ({ setPendingGraphSelection }) },
}))

import { BisectResultBanner } from './BisectResultBanner'

function state(overrides: Partial<BisectState> = {}): BisectState {
  return {
    active: true,
    badTerm: 'bad',
    goodTerm: 'good',
    goodOids: [],
    skippedOids: [],
    firstBadOid: '2b6c931dead',
    firstBadSummary: 'Introduce the bug',
    ...overrides,
  }
}

describe('BisectResultBanner', () => {
  beforeEach(() => {
    reset.mockClear()
    setPendingGraphSelection.mockClear()
    bisect = undefined
  })

  it('renders nothing while the search is still running', () => {
    bisect = state({ firstBadOid: undefined })
    const { container } = render(<BisectResultBanner repoPath="/repo" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the first bad commit once found', () => {
    bisect = state()
    render(<BisectResultBanner repoPath="/repo" />)
    expect(screen.getByText('First bad commit found')).toBeInTheDocument()
    expect(screen.getByText('2b6c931')).toBeInTheDocument()
    expect(screen.getByText(/Introduce the bug/)).toBeInTheDocument()
  })

  it('selects the culprit in the graph and finishes the session', async () => {
    bisect = state()
    const user = userEvent.setup()
    render(<BisectResultBanner repoPath="/repo" />)

    await user.click(screen.getByTestId('bisect-view-commit-button'))
    expect(setPendingGraphSelection).toHaveBeenCalledWith('2b6c931dead')

    await user.click(screen.getByTestId('bisect-finish-button'))
    expect(reset).toHaveBeenCalled()
  })
})
