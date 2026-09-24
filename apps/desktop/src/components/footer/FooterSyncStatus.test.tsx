import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { GitBranch } from '@git-manager/git-types'

const useBranchesMock = vi.fn()
vi.mock('../../hooks/useBranches', () => ({
  useBranches: (path: string) => useBranchesMock(path),
}))

import { FooterSyncStatus } from './FooterSyncStatus'

function branch(overrides: Partial<GitBranch> = {}): GitBranch {
  return {
    name: 'main',
    shortName: 'main',
    isHead: true,
    isRemote: false,
    upstream: 'origin/main',
    commitOid: 'abc',
    commitMessage: 'msg',
    commitTimestamp: 0,
    aheadCount: 0,
    behindCount: 0,
    ...overrides,
  }
}

beforeEach(() => {
  useBranchesMock.mockReset()
})

describe('FooterSyncStatus', () => {
  it('queries the branches of the given repo', () => {
    useBranchesMock.mockReturnValue({ data: undefined })
    render(<FooterSyncStatus repoPath="/repo/a" />)
    expect(useBranchesMock).toHaveBeenCalledWith('/repo/a')
  })

  it('renders nothing while branches are loading', () => {
    useBranchesMock.mockReturnValue({ data: undefined })
    const { container } = render(<FooterSyncStatus repoPath="/repo" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when no local branch is checked out (detached HEAD)', () => {
    useBranchesMock.mockReturnValue({
      data: [
        branch({ isHead: false }),
        branch({ name: 'origin/main', isRemote: true, isHead: true, aheadCount: 4 }),
      ],
    })
    const { container } = render(<FooterSyncStatus repoPath="/repo" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the counts to pull (↓) and to push (↑) of the checked-out branch', () => {
    useBranchesMock.mockReturnValue({
      data: [
        branch({ name: 'other', isHead: false, aheadCount: 9, behindCount: 9 }),
        branch({ aheadCount: 3, behindCount: 2 }),
      ],
    })
    render(<FooterSyncStatus repoPath="/repo" />)
    expect(screen.getByTestId('footer-sync-behind')).toHaveTextContent('2')
    expect(screen.getByTestId('footer-sync-ahead')).toHaveTextContent('3')
    expect(screen.getByText('2 commit(s) to pull')).toBeInTheDocument()
    expect(screen.getByText('3 commit(s) to push')).toBeInTheDocument()
    expect(screen.getByTestId('footer-sync-behind')).toHaveClass('text-foreground')
    expect(screen.getByTestId('footer-sync-ahead')).toHaveClass('text-foreground')
  })

  it('keeps both counters, muted, when the branch is in sync', () => {
    useBranchesMock.mockReturnValue({ data: [branch()] })
    render(<FooterSyncStatus repoPath="/repo" />)
    expect(screen.getByTestId('footer-sync-behind')).toHaveTextContent('0')
    expect(screen.getByTestId('footer-sync-ahead')).toHaveTextContent('0')
    expect(screen.getByTestId('footer-sync-behind')).toHaveClass('text-muted-foreground')
    expect(screen.getByTestId('footer-sync-ahead')).toHaveClass('text-muted-foreground')
  })

  it('says the branch is not published when it has no upstream, instead of 0 / 0', () => {
    useBranchesMock.mockReturnValue({ data: [branch({ upstream: undefined })] })
    render(<FooterSyncStatus repoPath="/repo" />)
    expect(screen.getByTestId('footer-sync-no-upstream')).toHaveTextContent('Not published')
    expect(screen.queryByTestId('footer-sync-status')).not.toBeInTheDocument()
  })
})
