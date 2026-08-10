import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { LocalWipEntry } from '../hooks/useLocalWipRepos'

const { useLocalWipRepos } = vi.hoisted(() => ({ useLocalWipRepos: vi.fn() }))
vi.mock('../hooks/useLocalWipRepos', () => ({ useLocalWipRepos }))

import { WipTab } from './WipTab'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { useLaunchpadControlsStore } from '../stores/launchpadControls.store'

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
  // The Launchpad-wide search persists across the app, so a test that sets it would otherwise
  // silently narrow every test after it in this file.
  useLaunchpadControlsStore.setState({ search: '' })
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

  /** The button used to carry its label as visible text. Now that it is an icon — matching the PR
   * and issue rows — the name has to come from `aria-label`, or it is a button announced as
   * nothing at all. */
  it('keeps the open action named once it is only an icon', () => {
    useLocalWipRepos.mockReturnValue({ entries: [entry()], loading: false })
    render(<WipTab />)
    expect(screen.getByRole('button', { name: 'Open repo' })).toBeInTheDocument()
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

  /**
   * The Launchpad-wide box above the tab bar says it filters every list tab. This one ignored it —
   * typing a query there left every worktree on screen while the other tabs narrowed, which is how
   * it was reported.
   */
  describe('Launchpad-wide search', () => {
    it('narrows the list like the tab own box does', () => {
      useLocalWipRepos.mockReturnValue({
        entries: [
          entry({ worktreePath: '/a', repoName: 'alpha', isMainWorktree: true }),
          entry({ worktreePath: '/b', repoName: 'beta', isMainWorktree: true }),
        ],
        loading: false,
      })
      useLaunchpadControlsStore.setState({ search: 'alph' })
      render(<WipTab />)

      expect(screen.getByText('WIP on alpha')).toBeInTheDocument()
      expect(screen.queryByText('WIP on beta')).not.toBeInTheDocument()
    })

    /** A main worktree's row is labelled with the *repository* name, so matching on the branch is
     * the case where the query hits something the row does not spell out. */
    it('matches the branch as well as the repository name', () => {
      useLocalWipRepos.mockReturnValue({
        entries: [
          entry({ worktreePath: '/a', repoName: 'alpha', branch: 'solo-mode' }),
          entry({ worktreePath: '/b', repoName: 'beta', branch: 'main' }),
        ],
        loading: false,
      })
      useLaunchpadControlsStore.setState({ search: 'solo' })
      render(<WipTab />)

      expect(screen.getByText('WIP on alpha')).toBeInTheDocument()
      expect(screen.queryByText('WIP on beta')).not.toBeInTheDocument()
    })

    it('and the tab own box both apply, so neither can widen the other', async () => {
      useLocalWipRepos.mockReturnValue({
        entries: [
          entry({ worktreePath: '/a', repoName: 'alpha', isMainWorktree: true }),
          entry({ worktreePath: '/b', repoName: 'beta', isMainWorktree: true }),
        ],
        loading: false,
      })
      useLaunchpadControlsStore.setState({ search: 'alph' })
      const user = userEvent.setup()
      render(<WipTab />)
      await user.type(screen.getByPlaceholderText('Search…'), 'beta')

      expect(screen.queryByText('WIP on alpha')).not.toBeInTheDocument()
      expect(screen.queryByText('WIP on beta')).not.toBeInTheDocument()
    })
  })

  it('shows a no-match empty state when the search matches nothing', async () => {
    useLocalWipRepos.mockReturnValue({
      entries: [entry({ repoName: 'alpha', isMainWorktree: true })],
      loading: false,
    })
    const user = userEvent.setup()
    render(<WipTab />)
    await user.type(screen.getByPlaceholderText('Search…'), 'zzz')
    expect(screen.getByText('No repositories match your search or filters.')).toBeInTheDocument()
  })
})
