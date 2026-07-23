import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
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
  // Simulate a previously-expanded files panel so the collapse-on-open behaviour is observable.
  useRepoUIStore.setState({ activePrFile: null, prFilesVisible: true })
})

describe('PrViewPanel', () => {
  it('opens on the conversation with the files panel collapsed by default', () => {
    render(<PrViewPanel pr={pr()} onClose={vi.fn()} />)
    expect(screen.getByTestId('launchpad-pr-view')).toBeInTheDocument()
    expect(screen.getByTestId('pr-detail-center')).toBeInTheDocument()
    expect(screen.queryByTestId('pr-files-panel')).not.toBeInTheDocument()
    expect(useRepoUIStore.getState().prFilesVisible).toBe(false)
  })

  it('returns to the list via the top-left Back button', () => {
    const onClose = vi.fn()
    render(<PrViewPanel pr={pr()} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('pr-detail-back'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows the files panel and its resize handle once toggled on', () => {
    render(<PrViewPanel pr={pr()} onClose={vi.fn()} />)
    expect(screen.queryByTestId('pr-files-panel')).not.toBeInTheDocument()
    act(() => useRepoUIStore.getState().togglePrFiles())
    expect(screen.getByTestId('pr-files-panel')).toBeInTheDocument()
    expect(screen.getByTestId('launchpad-pr-files-resize')).toBeInTheDocument()
  })

  it('restores the previous files visibility when it unmounts', () => {
    const { unmount } = render(<PrViewPanel pr={pr()} onClose={vi.fn()} />)
    expect(useRepoUIStore.getState().prFilesVisible).toBe(false)
    unmount()
    expect(useRepoUIStore.getState().prFilesVisible).toBe(true)
  })

  it('resets any stale file selection so the PR opens on its conversation', () => {
    useRepoUIStore.setState({ activePrFile: 'src/leftover.ts' })
    render(<PrViewPanel pr={pr()} onClose={vi.fn()} />)
    expect(useRepoUIStore.getState().activePrFile).toBeNull()
    expect(screen.getByTestId('pr-detail-center')).toBeInTheDocument()
  })
})
