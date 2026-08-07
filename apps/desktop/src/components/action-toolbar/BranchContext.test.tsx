import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { GitBranch, GitRepo, GitWorktree } from '@git-manager/git-types'

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
import { useStashDialogStore } from '../../stores/stashDialog.store'

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


describe('BranchContext — visibility/label', () => {
  it('renders nothing without an active repo', () => {
    const { container } = render(<BranchContext />, { wrapper })
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the HEAD branch name as the label', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useBranchesMock.mockReturnValue({ data: [branch('main', { isHead: true })] })
    render(<BranchContext />, { wrapper })
    expect(screen.getByTestId('branch-context-label')).toHaveTextContent('main')
  })

  it('falls back to the cached repo head when no branch is marked HEAD', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useRepoDataStore.setState({ repoCache: { '/repo': repo({ head: 'develop' }) } })
    render(<BranchContext />, { wrapper })
    expect(screen.getByTestId('branch-context-label')).toHaveTextContent('develop')
  })

  it('truncates the sha for a detached HEAD', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useRepoDataStore.setState({
      repoCache: { '/repo': repo({ isDetached: true, head: 'abcdefabcdefabcdef' }) },
    })
    render(<BranchContext />, { wrapper })
    expect(screen.getByTestId('branch-context-label')).toHaveTextContent('abcdefabcd')
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
    await user.click(screen.getByTestId('branch-context-trigger'))
    expect(screen.getByText('feature-x')).toBeInTheDocument()
    expect(screen.queryByText('origin/main')).not.toBeInTheDocument()
  })

  it('filters branches by the search query', async () => {
    const user = userEvent.setup()
    render(<BranchContext />, { wrapper })
    await user.click(screen.getByTestId('branch-context-trigger'))
    // Both the trigger label and the "main" list row match this text before filtering.
    expect(screen.getAllByText('main')).toHaveLength(2)

    await user.type(screen.getByPlaceholderText('Checkout'), 'feat')
    expect(screen.getByText('feature-x')).toBeInTheDocument()
    // Only the trigger's own label remains — the "main" list row was filtered out.
    expect(screen.getAllByText('main')).toHaveLength(1)
  })
})

describe('BranchContext — checkout', () => {
  beforeEach(() => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useRepoDataStore.setState({ repoCache: { '/repo': repo({ head: 'main' }) } })
    useStashDialogStore.getState().closeDialog()
    useBranchesMock.mockReturnValue({
      data: [branch('main', { isHead: true }), branch('feature-x')],
    })
  })

  it('checks out the clicked branch from the current HEAD', async () => {
    mockedCheckout.mockResolvedValue(undefined)
    mockedOpenRepo.mockResolvedValue(repo({ head: 'feature-x' }))
    const user = userEvent.setup()
    render(<BranchContext />, { wrapper })
    await user.click(screen.getByTestId('branch-context-trigger'))
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
    await user.click(screen.getByTestId('branch-context-trigger'))
    await user.click(screen.getByText('feature-x'))
    await waitFor(() => expect(screen.queryByPlaceholderText('Checkout')).not.toBeInTheDocument())
  })

  it('opens the stash dialog when uncommitted changes block the checkout', async () => {
    mockedCheckout.mockRejectedValue(new Error('Git error: 1 conflict prevents checkout'))
    const user = userEvent.setup()
    render(<BranchContext />, { wrapper })
    await user.click(screen.getByTestId('branch-context-trigger'))
    await user.click(screen.getByText('feature-x'))

    await waitFor(() => {
      expect(useStashDialogStore.getState().isOpen).toBe(true)
      expect(useStashDialogStore.getState().reason).toBe('checkout')
      expect(useStashDialogStore.getState().targetRef).toBe('feature-x')
    })
    // The popover stays open: nothing was switched yet.
    expect(screen.getByPlaceholderText('Checkout')).toBeInTheDocument()
  })

  it('leaves the stash dialog closed when the checkout fails for another reason', async () => {
    mockedCheckout.mockRejectedValue(new Error('Branch not found: feature-x'))
    const user = userEvent.setup()
    render(<BranchContext />, { wrapper })
    await user.click(screen.getByTestId('branch-context-trigger'))
    await user.click(screen.getByText('feature-x'))

    await waitFor(() => expect(mockedCheckout).toHaveBeenCalled())
    expect(useStashDialogStore.getState().isOpen).toBe(false)
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
    await user.click(screen.getByTestId('branch-context-trigger'))

    const current = await screen.findByTestId('branch-context-current')
    expect(current).toHaveTextContent('main')
    expect(current.querySelector('.lucide-git-branch')).toBeTruthy()

    const worktreeOption = await screen.findByTestId('workspace-option-/wt/other')
    expect(worktreeOption).toHaveTextContent('feature-y')
    expect(worktreeOption.querySelector('.lucide-layers')).toBeTruthy()

    const branchOption = screen.getByTestId('branch-option-feature-x')
    expect(branchOption.querySelector('.lucide-git-branch')).toBeTruthy()
  })

  it('shows only the worktree when a branch and a worktree share the same name', async () => {
    // feature-shared exists both as a local branch and as a linked worktree.
    useBranchesMock.mockReturnValue({
      data: [branch('main', { isHead: true }), branch('feature-x'), branch('feature-shared')],
    })
    mockedListWorktrees.mockResolvedValue([
      worktree({ path: '/repo', branch: 'main', isMain: true }),
      worktree({ path: '/wt/shared', branch: 'feature-shared', isMain: false }),
    ])
    const user = userEvent.setup()
    render(<BranchContext />, { wrapper })
    await user.click(screen.getByTestId('branch-context-trigger'))

    // The worktree row is shown; the duplicate branch row is not.
    expect(await screen.findByTestId('workspace-option-/wt/shared')).toBeInTheDocument()
    expect(screen.queryByTestId('branch-option-feature-shared')).not.toBeInTheDocument()
    // Branches without a matching worktree are still listed.
    expect(screen.getByTestId('branch-option-feature-x')).toBeInTheDocument()
  })

  it('excludes the main worktree from the workspace list', async () => {
    const user = userEvent.setup()
    render(<BranchContext />, { wrapper })
    await user.click(screen.getByTestId('branch-context-trigger'))
    await screen.findByTestId('workspace-option-/wt/other')
    expect(screen.queryByTestId('workspace-option-/repo')).not.toBeInTheDocument()
  })

  it('filters both worktrees and branches by the search query', async () => {
    const user = userEvent.setup()
    render(<BranchContext />, { wrapper })
    await user.click(screen.getByTestId('branch-context-trigger'))
    await screen.findByTestId('workspace-option-/wt/other')

    await user.type(screen.getByPlaceholderText('Checkout'), 'feature-y')
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
    await user.click(screen.getByTestId('branch-context-trigger'))
    await user.click(await screen.findByTestId('workspace-option-/wt/other'))

    expect(useRepoUIStore.getState().activeWorkspacePath).toBe('/wt/other')
    expect(mockedCheckout).not.toHaveBeenCalled()
  })

  it('closes the popover and clears the search query after entering a workspace', async () => {
    const user = userEvent.setup()
    render(<BranchContext />, { wrapper })
    await user.click(screen.getByTestId('branch-context-trigger'))
    await user.click(await screen.findByTestId('workspace-option-/wt/other'))

    await waitFor(() => expect(screen.queryByPlaceholderText('Checkout')).not.toBeInTheDocument())
  })

  it('shows "workspace" as the caption label and the X button once a workspace is active', async () => {
    useRepoUIStore.setState({ activeWorkspacePath: '/wt/other' })
    render(<BranchContext />, { wrapper })
    expect(screen.getByText('workspace')).toBeInTheDocument()
    expect(screen.getByTestId('workspace-exit-button')).toBeInTheDocument()
  })

  it('shows "branch" as the caption label and no X button when not in a workspace', () => {
    render(<BranchContext />, { wrapper })
    expect(screen.getByText('branch')).toBeInTheDocument()
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
    expect(screen.queryByPlaceholderText('Checkout')).not.toBeInTheDocument()
  })

  it('picking a branch from the list also exits workspace mode', async () => {
    mockedCheckout.mockResolvedValue(undefined)
    mockedOpenRepo.mockResolvedValue(repo())
    const user = userEvent.setup()
    render(<BranchContext />, { wrapper })
    await user.click(await screen.findByTestId('branch-context-trigger'))
    await user.click(await screen.findByTestId('branch-option-main'))

    expect(mockedCheckout).toHaveBeenCalledWith('/repo', 'main', expect.anything())
    await waitFor(() => expect(useRepoUIStore.getState().activeWorkspacePath).toBeNull())
  })
})
