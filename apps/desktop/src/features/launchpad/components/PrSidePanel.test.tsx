import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MockPR } from '../../../lib/github/types'

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
  it('renders the PR view inside a right-hand overlay panel', () => {
    render(<PrSidePanel pr={pr()} onClose={vi.fn()} />)
    expect(screen.getByTestId('launchpad-pr-panel')).toBeInTheDocument()
    expect(screen.getByTestId('pr-view-stub')).toBeInTheDocument()
  })

  it('is resizable via a left-edge handle, opening at 65% of the viewport', () => {
    // jsdom defaults window.innerWidth to 1024 → 65% = 666px. Wider than the shared 60% default
    // because this panel can show the files list beside the conversation.
    render(<PrSidePanel pr={pr()} onClose={vi.fn()} />)
    expect(screen.getByTestId('launchpad-pr-resize')).toBeInTheDocument()
    expect(screen.getByTestId('launchpad-pr-panel')).toHaveStyle({ width: '666px' })
  })

  /** The hand-rolled overlay this replaced had no key handling at all: the panel could only be
   * dismissed by clicking, which is what adopting the shared modal surface fixed. */
  it('closes on Escape', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<PrSidePanel pr={pr()} onClose={onClose} />)

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('closes when the PR view asks it to (its own Back button)', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<PrSidePanel pr={pr()} onClose={onClose} />)

    await user.click(screen.getByTestId('pr-view-stub'))

    expect(onClose).toHaveBeenCalledOnce()
  })

  /** `PrDetailCenter` puts its own toolbar in the top-right corner, where the dialog's ✕ lands. */
  it('suppresses the dialog close button so it cannot sit on the PR toolbar', () => {
    render(<PrSidePanel pr={pr()} onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
  })

  /** A modal with no accessible name makes Radix warn, rightly — the visible heading is inside
   * `PrDetailCenter`, so the panel carries a visually hidden one. */
  it('names the modal for a screen reader', () => {
    render(<PrSidePanel pr={pr()} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Pull request' })).toBeInTheDocument()
  })
})
