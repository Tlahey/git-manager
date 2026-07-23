import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { LocalWipEntry } from '../../../hooks/useLocalWipRepos'

const { useLocalWipRepos } = vi.hoisted(() => ({ useLocalWipRepos: vi.fn() }))
vi.mock('../../../hooks/useLocalWipRepos', () => ({ useLocalWipRepos }))

import { WipTab } from './WipTab'
import { useRepoUIStore } from '../../../stores/repoUI.store'

function entry(overrides: Partial<LocalWipEntry> = {}): LocalWipEntry {
  return {
    repoPath: '/repo',
    worktreePath: '/repo',
    repoName: 'repo',
    branch: 'main',
    isMainWorktree: true,
    totalChanges: 3,
    added: 1,
    modified: 1,
    deleted: 1,
    conflicted: 0,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useRepoUIStore.setState({ openTabs: [], activeTab: 'pull-requests', activeRepo: null })
})

describe('WipTab', () => {
  it('shows an empty state when nothing is dirty', () => {
    useLocalWipRepos.mockReturnValue({ entries: [], loading: false })
    render(<WipTab />)
    expect(screen.getByText('No uncommitted work')).toBeInTheDocument()
  })

  it('labels the main worktree "WIP on <repo>" and a branch worktree "WIP on <branch>"', () => {
    useLocalWipRepos.mockReturnValue({
      entries: [
        entry({ worktreePath: '/repo', repoName: 'my-repo', branch: 'main', isMainWorktree: true }),
        entry({
          worktreePath: '/repo-feat',
          repoName: 'my-repo',
          branch: 'feature-x',
          isMainWorktree: false,
        }),
      ],
      loading: false,
    })
    render(<WipTab />)
    expect(screen.getByText('WIP on my-repo')).toBeInTheDocument()
    expect(screen.getByText('WIP on feature-x')).toBeInTheDocument()
    // The branch tag (exact text) is rendered alongside its repo name.
    expect(screen.getByText('feature-x')).toBeInTheDocument()
    // Each row carries a leading "WIP" tag.
    expect(screen.getAllByText('WIP')).toHaveLength(2)
  })

  it('shows a conflicts badge when there are conflicts', () => {
    useLocalWipRepos.mockReturnValue({ entries: [entry({ conflicted: 2 })], loading: false })
    render(<WipTab />)
    expect(screen.getByText('2 conflicts')).toBeInTheDocument()
  })

  it('opens the worktree tab when the open button is clicked', async () => {
    useLocalWipRepos.mockReturnValue({
      entries: [entry({ worktreePath: '/repo-feat' })],
      loading: false,
    })
    const user = userEvent.setup()
    render(<WipTab />)
    await user.click(screen.getByTestId('wip-open-/repo-feat'))
    expect(useRepoUIStore.getState().activeTab).toBe('/repo-feat')
    expect(useRepoUIStore.getState().openTabs).toContain('/repo-feat')
  })

  it('filters by name via the search box', async () => {
    useLocalWipRepos.mockReturnValue({
      entries: [
        entry({ worktreePath: '/a', repoName: 'alpha', isMainWorktree: true }),
        entry({ worktreePath: '/b', repoName: 'beta', isMainWorktree: true }),
      ],
      loading: false,
    })
    const user = userEvent.setup()
    render(<WipTab />)
    await user.type(screen.getByPlaceholderText('Search…'), 'alph')
    expect(screen.getByText('WIP on alpha')).toBeInTheDocument()
    expect(screen.queryByText('WIP on beta')).not.toBeInTheDocument()
  })

  it('shows a no-match empty state when the search matches nothing', async () => {
    useLocalWipRepos.mockReturnValue({
      entries: [entry({ repoName: 'alpha', isMainWorktree: true })],
      loading: false,
    })
    const user = userEvent.setup()
    render(<WipTab />)
    await user.type(screen.getByPlaceholderText('Search…'), 'zzz')
    expect(
      screen.getByText('No repositories match your search or filters.')
    ).toBeInTheDocument()
  })
})
