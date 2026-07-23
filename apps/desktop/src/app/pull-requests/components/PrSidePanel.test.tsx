import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MockPR } from '../types'

vi.mock('./PrViewPanel', () => ({
  PrViewPanel: ({ onClose }: { onClose: () => void }) => (
    <button data-testid="pr-view-stub" onClick={onClose}>
      pr view
    </button>
  ),
}))

import { PrSidePanel } from './PrSidePanel'

function pr(overrides: Partial<MockPR> = {}): MockPR {
  return {
    id: 'pr-1',
    number: 1,
    title: 'A PR',
    repo: 'repo',
    repoUrl: 'https://github.com/me/repo',
    fullName: 'me/repo',
    url: 'https://github.com/me/repo/pull/1',
    status: 'open',
    ciStatus: null,
    author: 'me',
    authorAvatar: '',
    collaborators: [],
    filesChanged: 0,
    additions: 0,
    deletions: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    reviewStatus: 'pending',
    isDraft: false,
    labels: [],
    comments: 0,
    ...overrides,
  }
}

describe('PrSidePanel', () => {
  it('renders the PR view inside a right-hand overlay panel with a backdrop', () => {
    render(<PrSidePanel pr={pr()} onClose={vi.fn()} />)
    expect(screen.getByTestId('launchpad-pr-panel-overlay')).toBeInTheDocument()
    expect(screen.getByTestId('launchpad-pr-panel-backdrop')).toBeInTheDocument()
    expect(screen.getByTestId('launchpad-pr-panel')).toBeInTheDocument()
    expect(screen.getByTestId('pr-view-stub')).toBeInTheDocument()
  })

  it('is resizable via a left-edge handle, opening at 65% of the viewport', () => {
    // jsdom defaults window.innerWidth to 1024 → 65% = 666px.
    render(<PrSidePanel pr={pr()} onClose={vi.fn()} />)
    expect(screen.getByTestId('launchpad-pr-panel-resize')).toBeInTheDocument()
    expect(screen.getByTestId('launchpad-pr-panel')).toHaveStyle({ width: '666px' })
  })

  it('closes when the backdrop is clicked', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<PrSidePanel pr={pr()} onClose={onClose} />)
    await user.click(screen.getByTestId('launchpad-pr-panel-backdrop'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
