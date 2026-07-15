import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitBranch, GitRepo } from '@git-manager/git-types'

const { apiOpenRepo } = vi.hoisted(() => ({ apiOpenRepo: vi.fn() }))
vi.mock('../../api/repo.api', () => ({ apiOpenRepo }))

const { apiDeleteBranch } = vi.hoisted(() => ({ apiDeleteBranch: vi.fn() }))
vi.mock('../../api/git.api', () => ({ apiDeleteBranch }))

const { showBranchNativeContextMenu } = vi.hoisted(() => ({ showBranchNativeContextMenu: vi.fn() }))
vi.mock('../../api/nativeMenu.api', () => ({ showBranchNativeContextMenu }))

const { invalidateQueries } = vi.hoisted(() => ({ invalidateQueries: vi.fn() }))
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return { ...actual, useQueryClient: () => ({ invalidateQueries }) }
})

vi.mock('../../components/git-graph/GitGraph', () => ({
  GitGraph: (props: { repoPath: string; branch?: string; searchQuery: string }) => (
    <div data-testid="fake-git-graph">
      <span data-testid="graph-repo-path">{props.repoPath}</span>
      <span data-testid="graph-branch">{props.branch ?? ''}</span>
      <span data-testid="graph-search">{props.searchQuery}</span>
    </div>
  ),
}))

vi.mock('../../components/action-toolbar', () => ({
  ActionToolbar: (props: { searchQuery: string; onSearchChange: (v: string) => void }) => (
    <div data-testid="fake-action-toolbar">
      <input
        data-testid="toolbar-search-input"
        value={props.searchQuery}
        onChange={(e) => props.onSearchChange(e.target.value)}
      />
    </div>
  ),
}))

vi.mock('../../components/repository-sidebar', () => ({
  RepositorySidebar: (props: {
    repoPath: string
    remoteUrls?: string[]
    selectedBranch: string | null
    onSelectBranch: (name: string | null) => void
    currentUser?: string
    githubToken?: string
    onContextMenu?: (e: React.MouseEvent, branch: GitBranch) => void
    onOpenPr?: (pr: { headRef: string; number: number }) => void
  }) => (
    <div data-testid="fake-sidebar">
      <span data-testid="sidebar-remotes">{(props.remoteUrls ?? []).join(',')}</span>
      <span data-testid="sidebar-selected">{props.selectedBranch ?? ''}</span>
      <span data-testid="sidebar-user">{props.currentUser ?? ''}</span>
      <span data-testid="sidebar-token">{props.githubToken ?? ''}</span>
      <button onClick={() => props.onSelectBranch('feature-x')}>select-feature-x</button>
      <button onClick={() => props.onSelectBranch(null)}>select-none</button>
      <button onClick={() => props.onOpenPr?.({ headRef: 'pr-branch', number: 42 })}>open-pr</button>
      <button
        onClick={(e) =>
          props.onContextMenu?.(e, {
            name: 'local-branch',
            shortName: 'local-branch',
            isHead: false,
            isRemote: false,
            commitOid: 'sha123',
            commitMessage: 'msg',
            commitTimestamp: 0,
            aheadCount: 0,
            behindCount: 0,
          })
        }
      >
        context-menu-local
      </button>
      <button
        onClick={(e) =>
          props.onContextMenu?.(e, {
            name: 'origin/main',
            shortName: 'origin/main',
            isHead: false,
            isRemote: true,
            commitOid: 'sha456',
            commitMessage: 'msg',
            commitTimestamp: 0,
            aheadCount: 0,
            behindCount: 0,
          })
        }
      >
        context-menu-remote
      </button>
    </div>
  ),
}))

vi.mock('../../components/fixup/PendingFixupsBanner', () => ({
  PendingFixupsBanner: (props: { repoPath: string }) => (
    <div data-testid="fake-pending-fixups-banner">{props.repoPath}</div>
  ),
}))

import { RepoView } from './RepoView'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useSettingsStore } from '../../stores/settings.store'
import { useUndoHistoryStore } from '../../stores/undoHistory.store'

const INITIAL_REPO_UI = useRepoUIStore.getState()
const INITIAL_REPO_DATA = useRepoDataStore.getState()
const INITIAL_SETTINGS = useSettingsStore.getState()

function repo(overrides: Partial<GitRepo> = {}): GitRepo {
  return {
    path: '/repo',
    name: 'repo',
    head: 'main',
    isDetached: false,
    isDirty: false,
    remotes: [],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useRepoUIStore.setState(INITIAL_REPO_UI, true)
  useRepoDataStore.setState(INITIAL_REPO_DATA, true)
  useSettingsStore.setState(INITIAL_SETTINGS, true)
  apiOpenRepo.mockResolvedValue(repo())
  vi.spyOn(useUndoHistoryStore.getState(), 'validateAndPrune').mockResolvedValue(undefined)
})

describe('RepoView — no active repo', () => {
  it('renders nothing when there is no active repo', () => {
    useRepoUIStore.setState({ activeRepo: null })
    const { container } = render(<RepoView />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('RepoView — opening the active repo', () => {
  it('opens the repo on mount when not cached, and prunes stale undo history', async () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    render(<RepoView />)
    await waitFor(() => expect(apiOpenRepo).toHaveBeenCalledWith('/repo'))
    await waitFor(() => expect(useRepoDataStore.getState().repoCache['/repo']).toBeDefined())
    expect(useUndoHistoryStore.getState().validateAndPrune).toHaveBeenCalledWith('/repo')
  })

  it('does not re-open the repo if it is already cached', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useRepoDataStore.setState({ repoCache: { '/repo': repo() } })
    render(<RepoView />)
    expect(apiOpenRepo).not.toHaveBeenCalled()
  })

  it('silently ignores an open-repo failure', async () => {
    apiOpenRepo.mockRejectedValue(new Error('not a git repo'))
    useRepoUIStore.setState({ activeRepo: '/broken' })
    render(<RepoView />)
    await waitFor(() => expect(apiOpenRepo).toHaveBeenCalled())
    expect(useRepoDataStore.getState().repoCache['/broken']).toBeUndefined()
  })
})

describe('RepoView — prop wiring', () => {
  it('passes repoPath and remotes down to the sidebar and graph', async () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useRepoDataStore.setState({ repoCache: { '/repo': repo({ remotes: ['origin', 'upstream'] }) } })
    render(<RepoView />)
    expect(screen.getByTestId('graph-repo-path')).toHaveTextContent('/repo')
    expect(screen.getByTestId('sidebar-remotes')).toHaveTextContent('origin,upstream')
  })

  it('defaults remoteUrls to an empty list when the repo is not cached yet', () => {
    apiOpenRepo.mockReturnValue(new Promise(() => {})) // never resolves
    useRepoUIStore.setState({ activeRepo: '/repo' })
    render(<RepoView />)
    expect(screen.getByTestId('sidebar-remotes')).toHaveTextContent('')
  })

  it('passes the active GitHub account user/token to the sidebar', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useSettingsStore.setState({
      settings: {
        ...INITIAL_SETTINGS.settings,
        github: {
          accounts: [
            {
              id: 'acc-1',
              token: 'tok-123',
              user: { login: 'octocat', name: null, email: null, avatarUrl: '' },
            },
          ],
          activeAccountId: 'acc-1',
        },
      },
    })
    render(<RepoView />)
    expect(screen.getByTestId('sidebar-user')).toHaveTextContent('octocat')
    expect(screen.getByTestId('sidebar-token')).toHaveTextContent('tok-123')
  })

  it('leaves user/token empty when there is no active GitHub account', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    render(<RepoView />)
    expect(screen.getByTestId('sidebar-user')).toHaveTextContent('')
    expect(screen.getByTestId('sidebar-token')).toHaveTextContent('')
  })
})

describe('RepoView — branch selection threading', () => {
  it('threads selectedBranch from the sidebar into the graph', async () => {
    const user = userEvent.setup()
    useRepoUIStore.setState({ activeRepo: '/repo' })
    render(<RepoView />)
    await user.click(screen.getByText('select-feature-x'))
    expect(screen.getByTestId('graph-branch')).toHaveTextContent('feature-x')
    expect(screen.getByTestId('sidebar-selected')).toHaveTextContent('feature-x')
  })

  it('sets selectedBranch from onOpenPr using the PR headRef and opens the in-app PR view', async () => {
    const user = userEvent.setup()
    useRepoUIStore.setState({ activeRepo: '/repo', activePrNumber: null })
    render(<RepoView />)
    await user.click(screen.getByText('open-pr'))
    expect(screen.getByTestId('graph-branch')).toHaveTextContent('pr-branch')
    expect(useRepoUIStore.getState().activePrNumber).toBe(42)
  })
})

describe('RepoView — search query threading', () => {
  it('threads the toolbar search query into the graph', async () => {
    const user = userEvent.setup()
    useRepoUIStore.setState({ activeRepo: '/repo' })
    render(<RepoView />)
    await user.type(screen.getByTestId('toolbar-search-input'), 'fix bug')
    expect(screen.getByTestId('graph-search')).toHaveTextContent('fix bug')
  })
})

describe('RepoView — branch context menu', () => {
  it('ignores context menu on a remote branch', async () => {
    const user = userEvent.setup()
    useRepoUIStore.setState({ activeRepo: '/repo' })
    render(<RepoView />)
    await user.click(screen.getByText('context-menu-remote'))
    expect(showBranchNativeContextMenu).not.toHaveBeenCalled()
  })

  it('opens the native menu for a local branch with isHead and onDelete', async () => {
    const user = userEvent.setup()
    useRepoUIStore.setState({ activeRepo: '/repo' })
    render(<RepoView />)
    await user.click(screen.getByText('context-menu-local'))
    expect(showBranchNativeContextMenu).toHaveBeenCalledWith(
      expect.objectContaining({ isHead: false, onDelete: expect.any(Function) })
    )
  })

  it('deletes the branch and invalidates the branches query when confirmed', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    apiDeleteBranch.mockResolvedValue(undefined)
    useRepoUIStore.setState({ activeRepo: '/repo' })
    render(<RepoView />)
    await user.click(screen.getByText('context-menu-local'))
    const { onDelete } = showBranchNativeContextMenu.mock.calls[0][0]
    await act(async () => {
      await onDelete()
    })
    expect(apiDeleteBranch).toHaveBeenCalledWith('/repo', 'local-branch', {
      targetOid: 'sha123',
      upstream: undefined,
    })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['branches', '/repo'] })
    confirmSpy.mockRestore()
  })

  it('does not delete the branch when the confirm dialog is declined', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    useRepoUIStore.setState({ activeRepo: '/repo' })
    render(<RepoView />)
    await user.click(screen.getByText('context-menu-local'))
    const { onDelete } = showBranchNativeContextMenu.mock.calls[0][0]
    await act(async () => {
      await onDelete()
    })
    expect(apiDeleteBranch).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('shows an alert when branch deletion fails', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    apiDeleteBranch.mockRejectedValue(new Error('branch is checked out'))
    useRepoUIStore.setState({ activeRepo: '/repo' })
    render(<RepoView />)
    await user.click(screen.getByText('context-menu-local'))
    const { onDelete } = showBranchNativeContextMenu.mock.calls[0][0]
    await act(async () => {
      await onDelete()
    })
    expect(alertSpy).toHaveBeenCalledWith('Error: branch is checked out')
    alertSpy.mockRestore()
  })
})
