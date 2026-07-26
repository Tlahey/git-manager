import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { GitRepoSummary } from '@git-manager/git-types'
import { RepoRowStatus } from './RepoRowStatus'

function summary(overrides: Partial<GitRepoSummary> = {}): GitRepoSummary {
  return {
    path: '/repo/a',
    name: 'a',
    head: 'main',
    isDetached: false,
    stagedCount: 0,
    unstagedCount: 0,
    untrackedCount: 0,
    conflictedCount: 0,
    aheadCount: 0,
    behindCount: 0,
    ...overrides,
  }
}

function renderStatus(props: Partial<React.ComponentProps<typeof RepoRowStatus>> = {}) {
  return render(
    <RepoRowStatus summary={summary()} isLoading={false} hasError={false} {...props} />
  )
}

describe('RepoRowStatus', () => {
  it('shows a spinner while loading', () => {
    renderStatus({ isLoading: true, summary: undefined })
    expect(screen.getByTestId('repo-row-status-loading')).toHaveTextContent('Loading')
    expect(screen.queryByTestId('repo-row-status')).toBeNull()
  })

  it('shows an invalid-repository badge on error', () => {
    renderStatus({ hasError: true, summary: undefined })
    expect(screen.getByTestId('repo-row-status-error')).toHaveTextContent('Invalid repository')
  })

  it('prefers the loading state over the error state', () => {
    renderStatus({ isLoading: true, hasError: true, summary: undefined })
    expect(screen.getByTestId('repo-row-status-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('repo-row-status-error')).toBeNull()
  })

  it('renders nothing when there is no summary and nothing to report', () => {
    const { container } = renderStatus({ summary: undefined })
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the checked-out branch', () => {
    renderStatus({ summary: summary({ head: 'feat/long-branch-name' }) })
    expect(screen.getByText('feat/long-branch-name')).toBeInTheDocument()
  })

  it('collapses a clean repo to a single check mark', () => {
    renderStatus()
    expect(screen.getByTestId('repo-row-clean')).toBeInTheDocument()
    expect(screen.queryByTestId('repo-row-staged')).toBeNull()
  })

  it('renders each non-zero counter with its prefix', () => {
    renderStatus({
      summary: summary({
        conflictedCount: 1,
        stagedCount: 50,
        unstagedCount: 3,
        untrackedCount: 4,
      }),
    })
    expect(screen.getByTestId('repo-row-conflicted')).toHaveTextContent('!1')
    expect(screen.getByTestId('repo-row-staged')).toHaveTextContent('+50')
    expect(screen.getByTestId('repo-row-unstaged')).toHaveTextContent('~3')
    expect(screen.getByTestId('repo-row-untracked')).toHaveTextContent('?4')
    expect(screen.queryByTestId('repo-row-clean')).toBeNull()
  })

  it('omits counters that are zero', () => {
    renderStatus({ summary: summary({ stagedCount: 2 }) })
    expect(screen.getByTestId('repo-row-staged')).toBeInTheDocument()
    expect(screen.queryByTestId('repo-row-unstaged')).toBeNull()
    expect(screen.queryByTestId('repo-row-untracked')).toBeNull()
    expect(screen.queryByTestId('repo-row-conflicted')).toBeNull()
  })

  it('shows the ahead/behind pair only when the branch has diverged', () => {
    renderStatus()
    expect(screen.queryByTestId('repo-row-sync')).toBeNull()

    renderStatus({ summary: summary({ aheadCount: 5, behindCount: 6 }) })
    expect(screen.getByTestId('repo-row-sync')).toHaveTextContent('↑5')
    expect(screen.getByTestId('repo-row-sync')).toHaveTextContent('↓6')
  })

  it('shows only the ahead side when the branch is merely ahead', () => {
    renderStatus({ summary: summary({ aheadCount: 2 }) })
    const sync = screen.getByTestId('repo-row-sync')
    expect(sync).toHaveTextContent('↑2')
    expect(sync).not.toHaveTextContent('↓')
  })

  it('keeps the clean check mark when the only difference is ahead/behind', () => {
    renderStatus({ summary: summary({ behindCount: 5 }) })
    expect(screen.getByTestId('repo-row-clean')).toBeInTheDocument()
  })
})
