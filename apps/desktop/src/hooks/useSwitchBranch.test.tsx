import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { GitRepo } from '@git-manager/git-types'

vi.mock('../api/git.api', () => ({
  apiCheckoutBranch: vi.fn(),
  apiCreateBranch: vi.fn(),
  apiGetBranches: vi.fn(),
  apiSetBranchUpstream: vi.fn(),
  apiStashPush: vi.fn(),
}))
vi.mock('../api/repo.api', () => ({ apiOpenRepo: vi.fn(), apiGetRepoSummary: vi.fn() }))

import {
  apiCheckoutBranch,
  apiCreateBranch,
  apiGetBranches,
  apiSetBranchUpstream,
} from '../api/git.api'
import { apiOpenRepo, apiGetRepoSummary } from '../api/repo.api'
import { useSwitchBranch } from './useSwitchBranch'
import { useRepoDataStore } from '../stores/repoData.store'
import { useRepoUIStore } from '../stores/repoUI.store'
import { useStashDialogStore } from '../stores/stashDialog.store'

const mockedCheckout = apiCheckoutBranch as unknown as ReturnType<typeof vi.fn>
const mockedCreateBranch = apiCreateBranch as unknown as ReturnType<typeof vi.fn>
const mockedGetBranches = apiGetBranches as unknown as ReturnType<typeof vi.fn>
const mockedSetUpstream = apiSetBranchUpstream as unknown as ReturnType<typeof vi.fn>
const mockedOpenRepo = apiOpenRepo as unknown as ReturnType<typeof vi.fn>
const mockedRepoSummary = apiGetRepoSummary as unknown as ReturnType<typeof vi.fn>

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

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

/** The tab is a *linked worktree* whose owning repository is `/repo`. */
function tabOnLinkedWorktree() {
  useRepoUIStore.setState({ activeRepo: '/wt/other', activeWorkspacePath: null, openTabs: [] })
  useRepoDataStore.setState({
    repoCache: {
      '/wt/other': repo({ path: '/wt/other', head: 'feature-y', mainWorktreePath: '/repo' }),
    },
  })
}

/** The tab is an ordinary repository, which owns itself. */
function tabOnPlainRepo() {
  useRepoUIStore.setState({ activeRepo: '/repo', activeWorkspacePath: null, openTabs: ['/repo'] })
  useRepoDataStore.setState({ repoCache: { '/repo': repo({ mainWorktreePath: '/repo' }) } })
}

beforeEach(() => {
  vi.clearAllMocks()
  useRepoUIStore.setState({ activeRepo: null, activeWorkspacePath: null, openTabs: [] })
  useRepoDataStore.setState({ repoCache: {} })
  useStashDialogStore.getState().closeDialog()
  mockedRepoSummary.mockResolvedValue({ head: 'main', isDetached: false })
  mockedOpenRepo.mockResolvedValue(repo())
  mockedCheckout.mockResolvedValue(undefined)
})

describe('useSwitchBranch — where the switch lands', () => {
  it('checks out on the base project when the tab is a linked worktree', async () => {
    tabOnLinkedWorktree()
    const { result } = renderHook(() => useSwitchBranch(), { wrapper })

    await expect(result.current.switchBranch('feature-x')).resolves.toBe(true)

    expect(mockedCheckout).toHaveBeenCalledWith('/repo', 'feature-x', {
      fromRef: 'main',
      fromDetached: false,
    })
    // The undo entry's starting point is the base project's HEAD, not the worktree's.
    expect(mockedRepoSummary).toHaveBeenCalledWith('/repo')
  })

  it('checks out on the tab itself when it is an ordinary repository', async () => {
    tabOnPlainRepo()
    const { result } = renderHook(() => useSwitchBranch(), { wrapper })

    await expect(result.current.switchBranch('feature-x')).resolves.toBe(true)

    expect(mockedCheckout).toHaveBeenCalledWith('/repo', 'feature-x', {
      fromRef: 'main',
      fromDetached: false,
    })
  })

  it('falls back to the tab path while the repo cache is still empty', async () => {
    useRepoUIStore.setState({ activeRepo: '/wt/other' })
    const { result } = renderHook(() => useSwitchBranch(), { wrapper })

    await result.current.switchBranch('feature-x')

    // "We can't tell yet, so don't reroute" — better than switching a repository we haven't read.
    expect(mockedCheckout).toHaveBeenCalledWith('/wt/other', 'feature-x', expect.anything())
  })

  it('does nothing without an active repo', async () => {
    const { result } = renderHook(() => useSwitchBranch(), { wrapper })

    await expect(result.current.switchBranch('feature-x')).resolves.toBe(false)
    expect(mockedCheckout).not.toHaveBeenCalled()
  })
})

describe('useSwitchBranch — bringing the view back', () => {
  it('opens the base project as the active tab once the switch lands', async () => {
    tabOnLinkedWorktree()
    const { result } = renderHook(() => useSwitchBranch(), { wrapper })

    await result.current.switchBranch('feature-x')

    await waitFor(() => expect(useRepoUIStore.getState().activeRepo).toBe('/repo'))
    expect(useRepoUIStore.getState().openTabs).toContain('/repo')
  })

  it('leaves the tab alone when the checkout is refused', async () => {
    tabOnLinkedWorktree()
    mockedCheckout.mockRejectedValue(new Error('Branch not found: feature-x'))
    const { result } = renderHook(() => useSwitchBranch(), { wrapper })

    await expect(result.current.switchBranch('feature-x')).resolves.toBe(false)

    expect(useRepoUIStore.getState().activeRepo).toBe('/wt/other')
    expect(useRepoUIStore.getState().openTabs).not.toContain('/repo')
  })

  it('exits workspace mode without touching the tab when the base project is the tab', async () => {
    tabOnPlainRepo()
    useRepoUIStore.setState({ activeWorkspacePath: '/wt/other' })
    const { result } = renderHook(() => useSwitchBranch(), { wrapper })

    await result.current.switchBranch('feature-x')

    await waitFor(() => expect(useRepoUIStore.getState().activeWorkspacePath).toBeNull())
    expect(useRepoUIStore.getState().openTabs).toEqual(['/repo'])
  })
})

describe('useSwitchBranch — failures and remotes', () => {
  it('still switches when the base project summary cannot be read', async () => {
    tabOnLinkedWorktree()
    mockedRepoSummary.mockRejectedValue(new Error('repository not found'))
    const { result } = renderHook(() => useSwitchBranch(), { wrapper })

    await expect(result.current.switchBranch('feature-x')).resolves.toBe(true)
    // Only the undo entry's starting point is lost; the switch itself goes through.
    expect(mockedCheckout).toHaveBeenCalledWith('/repo', 'feature-x', undefined)
  })

  it('hands a blocked checkout to the shared stash dialog, scoped to the base project', async () => {
    tabOnLinkedWorktree()
    mockedCheckout.mockRejectedValue(new Error('Git error: 1 conflict prevents checkout'))
    const { result } = renderHook(() => useSwitchBranch(), { wrapper })

    await expect(result.current.switchBranch('feature-x')).resolves.toBe(false)

    expect(useStashDialogStore.getState().isOpen).toBe(true)
    expect(useStashDialogStore.getState().repoPath).toBe('/repo')
    expect(useStashDialogStore.getState().targetRef).toBe('feature-x')
  })

  it('creates the local branch of a remote ref on the base project, then switches to it', async () => {
    tabOnLinkedWorktree()
    // No local `feature-x` yet, so the tracking branch has to be created first.
    mockedGetBranches.mockResolvedValue([])
    mockedCreateBranch.mockResolvedValue(undefined)
    mockedSetUpstream.mockResolvedValue(undefined)
    const { result } = renderHook(() => useSwitchBranch(), { wrapper })

    await expect(result.current.switchRemoteBranch('origin/feature-x')).resolves.toBe(true)

    expect(mockedCreateBranch).toHaveBeenCalledWith('/repo', 'feature-x', 'origin/feature-x')
    expect(mockedSetUpstream).toHaveBeenCalledWith('/repo', 'feature-x', 'origin/feature-x')
    expect(mockedCheckout).toHaveBeenCalledWith('/repo', 'feature-x', expect.anything())
    await waitFor(() => expect(useRepoUIStore.getState().activeRepo).toBe('/repo'))
  })
})
