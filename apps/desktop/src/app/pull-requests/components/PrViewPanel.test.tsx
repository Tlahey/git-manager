import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { MockPR } from '../types'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { PrViewPanel } from './PrViewPanel'

function pr(overrides: Partial<MockPR> = {}): MockPR {
  return {
    id: '1',
    number: 42,
    title: 'Add feature X',
    repo: 'git-manager',
    repoUrl: 'https://github.com/owner/git-manager',
    fullName: 'owner/git-manager',
    url: 'https://github.com/owner/git-manager/pull/42',
    status: 'open',
    ciStatus: null,
    author: 'octocat',
    authorAvatar: 'https://x/a.png',
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

beforeEach(() => {
  // A fresh PR always starts on its conversation with the files panel shown.
  useRepoUIStore.setState({ activePrFile: null, prFilesVisible: true })
})

describe('PrViewPanel', () => {
  it('shows the interactive PR detail view and the changed-files panel', () => {
    render(<PrViewPanel pr={pr()} onClose={vi.fn()} />)
    expect(screen.getByTestId('launchpad-pr-view')).toBeInTheDocument()
    expect(screen.getByTestId('pr-detail-center')).toBeInTheDocument()
    expect(screen.getByTestId('pr-files-panel')).toBeInTheDocument()
  })

  it('returns to the list via the top-left Back button', () => {
    const onClose = vi.fn()
    render(<PrViewPanel pr={pr()} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('pr-detail-back'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('hides the files panel when the shared toggle is off', () => {
    useRepoUIStore.setState({ prFilesVisible: false })
    render(<PrViewPanel pr={pr()} onClose={vi.fn()} />)
    expect(screen.queryByTestId('pr-files-panel')).not.toBeInTheDocument()
  })

  it('resets any stale file selection so the PR opens on its conversation', () => {
    useRepoUIStore.setState({ activePrFile: 'src/leftover.ts' })
    render(<PrViewPanel pr={pr()} onClose={vi.fn()} />)
    expect(useRepoUIStore.getState().activePrFile).toBeNull()
    expect(screen.getByTestId('pr-detail-center')).toBeInTheDocument()
  })
})
