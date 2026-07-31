import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { BisectState } from '@git-manager/git-types'

let bisect: BisectState | undefined

vi.mock('../../hooks/useBisectState', () => ({
  useBisectState: () => ({ data: bisect }),
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
    bisect = undefined
  })

  it('renders nothing when inactive', () => {
    bisect = state({ active: false })
    const { container } = render(<BisectPanel repoPath="/repo" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the commit under test with its progress and recap, but no action buttons', () => {
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
    // The good/bad/skip/abort actions live only in the top banner now.
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('hides the commit-under-test section once resolved, keeping the recap', () => {
    bisect = state({ firstBadOid: 'cur1111abc' })
    render(<BisectPanel repoPath="/repo" />)
    expect(screen.queryByText('Commit under test')).not.toBeInTheDocument()
    expect(screen.getByText('bad1111'.slice(0, 7))).toBeInTheDocument()
    expect(screen.getByText('good111')).toBeInTheDocument()
  })
})
