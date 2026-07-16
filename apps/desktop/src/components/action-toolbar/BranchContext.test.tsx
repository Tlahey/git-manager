import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { GitBranch, GitRepo, GitWorktree } from '@git-manager/git-types'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const useBranchesMock = vi.fn()
vi.mock('../../hooks/useBranches', () => ({ useBranches: () => useBranchesMock() }))

vi.mock('../../api/git.api', () => ({ apiCheckoutBranch: vi.fn() }))
vi.mock('../../api/repo.api', () => ({ apiOpenRepo: vi.fn() }))
vi.mock('../../api/worktree.api', () => ({ apiListWorktrees: vi.fn() }))

import { apiCheckoutBranch } from '../../api/git.api'
import { apiOpenRepo } from '../../api/repo.api'
import { apiListWorktrees } from '../../api/worktree.api'
import { BranchContext } from './BranchContext'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'

const mockedCheckout = apiCheckoutBranch as unknown as ReturnType<typeof vi.fn>
const mockedOpenRepo = apiOpenRepo as unknown as ReturnType<typeof vi.fn>
const mockedListWorktrees = apiListWorktrees as unknown as ReturnType<typeof vi.fn>

function branch(shortName: string, overrides: Partial<GitBranch> = {}): GitBranch {
  return {
    name: `refs/heads/${shortName}`,
    shortName,
    isHead: false,
    isRemote: false,
    commitOid: 'oid',
    commitMessage: 'msg',
    commitTimestamp: 0,
    aheadCount: 0,
    behindCount: 0,
    ...overrides,
  }
}

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

function worktree(overrides: Partial<GitWorktree> = {}): GitWorktree {
  return {
    path: '/repo',
    branch: 'main',
    commitOid: 'oid',
    isMain: true,
    isLocked: false,
    isDirty: false,
    isPrunable: false,
    ...overrides,
  }
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
  useRepoUIStore.setState({ activeRepo: null, activeWorkspacePath: null })
  useRepoDataStore.setState({ repoCache: {} })
  useBranchesMock.mockReturnValue({ data: [] })
  mockedListWorktrees.mockResolvedValue([])
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('BranchContext — visibility/label', () => {
  it('renders nothing without an active repo', () => {
    const { container } = render(<BranchContext />, { wrapper })
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the HEAD branch name as the label', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useBranchesMock.mockReturnValue({ data: [branch('main', { isHead: true })] })
    render(<BranchContext />, { wrapper })
    expect(screen.getByTitle('main')).toBeInTheDocument()
  })

  it('falls back to the cached repo head when no branch is marked HEAD', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useRepoDataStore.setState({ repoCache: { '/repo': repo({ head: 'develop' }) } })
    render(<BranchContext />, { wrapper })
    expect(screen.getByTitle('develop')).toBeInTheDocument()
  })

  it('truncates the sha for a detached HEAD', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useRepoDataStore.setState({
      repoCache: { '/repo': repo({ isDetached: true, head: 'abcdefabcdefabcdef' }) },
    })
    render(<BranchContext />, { wrapper })
    expect(screen.getByTitle('abcdefabcd')).toBeInTheDocument()
  })
})

describe('BranchContext — branch list & filtering', () => {
  beforeEach(() => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useBranchesMock.mockReturnValue({
      data: [
        branch('main', { isHead: true }),
        branch('feature-x'),
        branch('origin/main', { isRemote: true }),
      ],
    })
  })

  it('lists only local branches', async () => {
    const user = userEvent.setup()
    render(<BranchContext />, { wrapper })
    await user.click(screen.getByTitle('main'))
    expect(screen.getByText('feature-x')).toBeInTheDocument()
    expect(screen.queryByText('origin/main')).not.toBeInTheDocument()
  })

  it('filters branches by the search query', async () => {
    const user = userEvent.setup()
    render(<BranchContext />, { wrapper })
    await user.click(screen.getByTitle('main'))
    // Both the trigger label and the "main" list row match this text before filtering.
    expect(screen.getAllByText('main')).toHaveLength(2)

    await user.type(screen.getByPlaceholderText('branch.checkout'), 'feat')
    expect(screen.getByText('feature-x')).toBeInTheDocument()
    // Only the trigger's own label remains — the "main" list row was filtered out.
    expect(screen.getAllByText('main')).toHaveLength(1)
  })
})

describe('BranchContext — checkout', () => {
  beforeEach(() => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useRepoDataStore.setState({ repoCache: { '/repo': repo({ head: 'main' }) } })
    useBranchesMock.mockReturnValue({
      data: [branch('main', { isHead: true }), branch('feature-x')],
    })
  })

  it('checks out the clicked branch from the current HEAD', async () => {
    mockedCheckout.mockResolvedValue(undefined)
    mockedOpenRepo.mockResolvedValue(repo({ head: 'feature-x' }))
    const user = userEvent.setup()
    render(<BranchContext />, { wrapper })
    await user.click(screen.getByTitle('main'))
    await user.click(screen.getByText('feature-x'))

    expect(mockedCheckout).toHaveBeenCalledWith('/repo', 'feature-x', {
      fromRef: 'main',
      fromDetached: false,
    })
    await waitFor(() => expect(mockedOpenRepo).toHaveBeenCalledWith('/repo'))
  })

  it('closes the popover and clears the search query on success', async () => {
    mockedCheckout.mockResolvedValue(undefined)
    mockedOpenRepo.mockResolvedValue(repo())
    const user = userEvent.setup()
    render(<BranchContext />, { wrapper })
    await user.click(screen.getByTitle('main'))
    await user.click(screen.getByText('feature-x'))
    await waitFor(() =>
      expect(screen.queryByPlaceholderText('branch.checkout')).not.toBeInTheDocument()
    )
  })

  it('shows an error banner when checkout fails, without closing the popover', async () => {
    mockedCheckout.mockRejectedValue(new Error('checkout conflict'))
    const user = userEvent.setup()
    render(<BranchContext />, { wrapper })
    await user.click(screen.getByTitle('main'))
    await user.click(screen.getByText('feature-x'))

    expect(await screen.findByText(/checkout conflict/)).toBeInTheDocument()
    expect(screen.getByPlaceholderText('branch.checkout')).toBeInTheDocument()
  })

  it('auto-dismisses the error banner after 3 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockedCheckout.mockRejectedValue(new Error('checkout conflict'))
    const user = userEvent.setup({ delay: null })
    render(<BranchContext />, { wrapper })
    await user.click(screen.getByTitle('main'))
    await user.click(screen.getByText('feature-x'))
    await vi.waitFor(() => expect(screen.getByText(/checkout conflict/)).toBeInTheDocument())

    vi.advanceTimersByTime(3000)
    await vi.waitFor(() => expect(screen.queryByText(/checkout conflict/)).not.toBeInTheDocument())
    vi.useRealTimers()
  })
})

describe('BranchContext — merged worktree/branch list', () => {
  beforeEach(() => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useBranchesMock.mockReturnValue({
      data: [branch('main', { isHead: true }), branch('feature-x')],
    })
    mockedListWorktrees.mockResolvedValue([
      worktree({ path: '/repo', branch: 'main', isMain: true }),
      worktree({ path: '/wt/other', branch: 'feature-y', isMain: false }),
    ])
  })

  it('lists the pinned current branch, then worktrees (Layers icon), then other branches (GitBranch icon)', async () => {
    const user = userEvent.setup()
    render(<BranchContext />, { wrapper })
    await user.click(screen.getByTitle('main'))

    const current = await screen.findByTestId('branch-context-current')
    expect(current).toHaveTextContent('main')
    expect(current.querySelector('.lucide-git-branch')).toBeTruthy()

    const worktreeOption = await screen.findByTestId('workspace-option-/wt/other')
    expect(worktreeOption).toHaveTextContent('feature-y')
    expect(worktreeOption.querySelector('.lucide-layers')).toBeTruthy()

    const branchOption = screen.getByTestId('branch-option-feature-x')
    expect(branchOption.querySelector('.lucide-git-branch')).toBeTruthy()
  })

  it('excludes the main worktree from the workspace list', async () => {
    const user = userEvent.setup()
    render(<BranchContext />, { wrapper })
    await user.click(screen.getByTitle('main'))
    await screen.findByTestId('workspace-option-/wt/other')
    expect(screen.queryByTestId('workspace-option-/repo')).not.toBeInTheDocument()
  })

  it('filters both worktrees and branches by the search query', async () => {
    const user = userEvent.setup()
    render(<BranchContext />, { wrapper })
    await user.click(screen.getByTitle('main'))
    await screen.findByTestId('workspace-option-/wt/other')

    await user.type(screen.getByPlaceholderText('branch.checkout'), 'feature-y')
    expect(screen.getByTestId('workspace-option-/wt/other')).toBeInTheDocument()
    expect(screen.queryByTestId('branch-option-feature-x')).not.toBeInTheDocument()
  })
})

describe('BranchContext — entering a workspace', () => {
  beforeEach(() => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useBranchesMock.mockReturnValue({ data: [branch('main', { isHead: true })] })
    mockedListWorktrees.mockResolvedValue([
      worktree({ path: '/repo', branch: 'main', isMain: true }),
      worktree({ path: '/wt/other', branch: 'feature-y', isMain: false }),
    ])
  })

  it('clicking a worktree sets activeWorkspacePath without checking out anything', async () => {
    const user = userEvent.setup()
    render(<BranchContext />, { wrapper })
    await user.click(screen.getByTitle('main'))
    await user.click(await screen.findByTestId('workspace-option-/wt/other'))

    expect(useRepoUIStore.getState().activeWorkspacePath).toBe('/wt/other')
    expect(mockedCheckout).not.toHaveBeenCalled()
  })

  it('closes the popover and clears the search query after entering a workspace', async () => {
    const user = userEvent.setup()
    render(<BranchContext />, { wrapper })
    await user.click(screen.getByTitle('main'))
    await user.click(await screen.findByTestId('workspace-option-/wt/other'))

    await waitFor(() =>
      expect(screen.queryByPlaceholderText('branch.checkout')).not.toBeInTheDocument()
    )
  })

  it('shows "workspace" as the caption label and the X button once a workspace is active', async () => {
    useRepoUIStore.setState({ activeWorkspacePath: '/wt/other' })
    render(<BranchContext />, { wrapper })
    expect(screen.getByText('toolbar.workspaceLabel')).toBeInTheDocument()
    expect(screen.getByTestId('workspace-exit-button')).toBeInTheDocument()
  })

  it('shows "branch" as the caption label and no X button when not in a workspace', () => {
    render(<BranchContext />, { wrapper })
    expect(screen.getByText('toolbar.branchLabel')).toBeInTheDocument()
    expect(screen.queryByTestId('workspace-exit-button')).not.toBeInTheDocument()
  })
})

describe('BranchContext — exiting a workspace', () => {
  beforeEach(() => {
    useRepoUIStore.setState({ activeRepo: '/repo', activeWorkspacePath: '/wt/other' })
    useBranchesMock.mockReturnValue({ data: [branch('main', { isHead: true })] })
    mockedListWorktrees.mockResolvedValue([
      worktree({ path: '/repo', branch: 'main', isMain: true }),
      worktree({ path: '/wt/other', branch: 'feature-y', isMain: false }),
    ])
  })

  it('the X button clears activeWorkspacePath without opening the popover', async () => {
    const user = userEvent.setup()
    render(<BranchContext />, { wrapper })
    await user.click(screen.getByTestId('workspace-exit-button'))

    expect(useRepoUIStore.getState().activeWorkspacePath).toBeNull()
    expect(screen.queryByPlaceholderText('branch.checkout')).not.toBeInTheDocument()
  })

  it('picking a branch from the list also exits workspace mode', async () => {
    mockedCheckout.mockResolvedValue(undefined)
    mockedOpenRepo.mockResolvedValue(repo())
    const user = userEvent.setup()
    render(<BranchContext />, { wrapper })
    await user.click(await screen.findByTitle('feature-y'))
    await user.click(await screen.findByTestId('branch-option-main'))

    expect(mockedCheckout).toHaveBeenCalledWith('/repo', 'main', expect.anything())
    await waitFor(() => expect(useRepoUIStore.getState().activeWorkspacePath).toBeNull())
  })
})
