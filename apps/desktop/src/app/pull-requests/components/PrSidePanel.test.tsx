import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
  it('renders the PR view inside a resizable panel with a drag handle', () => {
    render(<PrSidePanel pr={pr()} onClose={vi.fn()} />)
    expect(screen.getByTestId('launchpad-pr-panel-resize')).toBeInTheDocument()
    expect(screen.getByTestId('launchpad-pr-panel')).toBeInTheDocument()
    expect(screen.getByTestId('pr-view-stub')).toBeInTheDocument()
  })

  it('opens at 60% of the viewport width (min 50%)', () => {
    // jsdom defaults window.innerWidth to 1024 → 60% = 614px.
    render(<PrSidePanel pr={pr()} onClose={vi.fn()} />)
    expect(screen.getByTestId('launchpad-pr-panel')).toHaveStyle({ width: '614px' })
  })
})
