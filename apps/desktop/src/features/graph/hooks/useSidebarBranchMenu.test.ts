import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { GitBranch, GitRepo } from '@git-manager/git-types'
import { normalizeMenuSpec, type MenuSpecNode } from '../../../lib/nativeMenuSpec'

const invalidateQueries = vi.fn()
const useQueryMock = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries }),
  useQuery: () => useQueryMock(),
}))

const dialogOpen = vi.fn()
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...a: unknown[]) => dialogOpen(...a),
}))

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('@git-manager/ui', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}))

const showNativeMenu = vi.fn().mockResolvedValue(undefined)
vi.mock('../../../api/nativeMenu.api', () => ({
  showNativeMenu: (...a: unknown[]) => showNativeMenu(...a),
}))

vi.mock('../../../api/git.api', () => ({
  apiPullBranch: vi.fn(),
  apiPushBranch: vi.fn(),
  apiFastForwardBranch: vi.fn(),
  apiMergeBranch: vi.fn(),
  apiRebaseOntoCommit: vi.fn(),
  apiCherryPickCommit: vi.fn(),
  apiDeleteBranch: vi.fn(),
  apiCopyCommitSha: vi.fn(),
  apiGetCommitWebUrl: vi.fn(),
  apiGetBranchWebUrl: vi.fn(),
  apiSetBranchUpstream: vi.fn(),
}))
vi.mock('../../../api/worktree.api', () => ({ apiAddWorktree: vi.fn() }))

const aiEnabledMock = vi.fn()
vi.mock('../../../hooks/useAiEnabled', () => ({ useAiEnabled: () => aiEnabledMock() }))

const checkoutBranchWithStashPrompt = vi.fn()
const checkoutRemoteBranchAsLocal = vi.fn()
vi.mock('../../../hooks/useBranchCheckout', () => ({
  useBranchCheckout: () => ({
    checkoutBranchWithStashPrompt: (...a: unknown[]) => checkoutBranchWithStashPrompt(...a),
    checkoutRemoteBranchAsLocal: (...a: unknown[]) => checkoutRemoteBranchAsLocal(...a),
  }),
}))

const effectiveSettingsMock = vi.fn()
vi.mock('../../../hooks/useEffectiveRepoSettings', () => ({
  useEffectiveRepoSettings: () => effectiveSettingsMock(),
}))

import * as gitApi from '../../../api/git.api'
import { apiAddWorktree } from '../../../api/worktree.api'
import { useSidebarBranchMenu } from './useSidebarBranchMenu'
import { useRepoDataStore } from '../../../stores/repoData.store'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { usePinnedBranchesStore } from '../../../stores/pinned-branches.store'
import { useSoloModeStore } from '../../../stores/soloMode.store'

const mocked = gitApi as unknown as Record<string, ReturnType<typeof vi.fn>>
const mockedAddWorktree = apiAddWorktree as unknown as ReturnType<typeof vi.fn>

const REPO = '/repo'

/**
 * Mirrors the real backend shape (`services/git_branch.rs`): a LOCAL branch's `name` is bare (equal
 * to `shortName`), never `refs/heads/`-prefixed — `branchToRef` in the hook under test reads `name`
 * directly for a local ref, so a fixture using the wrong shape would silently pass tests that a real
 * repo would fail.
 */
function localBranch(shortName: string, overrides: Partial<GitBranch> = {}): GitBranch {
  return {
    name: shortName,
    shortName,
    isHead: false,
    isRemote: false,
    commitOid: `oid-${shortName}`,
    commitMessage: 'msg',
    commitTimestamp: 0,
    aheadCount: 0,
    behindCount: 0,
    ...overrides,
  }
}

/** A remote branch's `name` is remote-qualified (`origin/feat`); `shortName` has the prefix stripped. */
function remoteBranch(shortName: string, overrides: Partial<GitBranch> = {}): GitBranch {
  return {
    name: `origin/${shortName}`,
    shortName,
    isHead: false,
    isRemote: true,
    commitOid: `oid-${shortName}`,
    commitMessage: 'msg',
    commitTimestamp: 0,
    aheadCount: 0,
    behindCount: 0,
    ...overrides,
  }
}

function setRepo(head = 'main', isDetached = false) {
  const repo: GitRepo = { path: REPO, name: 'repo', head, isDetached, isDirty: false, remotes: [] }
  useRepoDataStore.setState({ repoCache: { [REPO]: repo }, hiddenBranches: {} })
}

const clickEvent = () => ({ preventDefault: vi.fn() }) as unknown as React.MouseEvent

type ItemNode = Extract<MenuSpecNode, { kind: 'item' }>
type SubmenuNode = Extract<MenuSpecNode, { kind: 'submenu' }>

const findItem = (nodes: MenuSpecNode[], text: string): ItemNode | undefined =>
  nodes.find((n): n is ItemNode => n.kind === 'item' && n.text === text)

function getItem(nodes: MenuSpecNode[], text: string): ItemNode {
  const found = findItem(nodes, text)
  expect(found, `menu item "${text}"`).toBeDefined()
  return found as ItemNode
}

function getSubmenu(nodes: MenuSpecNode[], text: string): SubmenuNode {
  const found = nodes.find((n): n is SubmenuNode => n.kind === 'submenu' && n.text === text)
  expect(found, `submenu "${text}"`).toBeDefined()
  return found as SubmenuNode
}

/** Opens the sidebar branch menu for `branch` and returns the hook result plus the normalized spec
 *  handed to `showNativeMenu`. */
function openMenu(branch: GitBranch, repoPath = REPO) {
  const { result } = renderHook(() => useSidebarBranchMenu(repoPath))
  act(() => result.current.openBranchMenu(clickEvent(), branch))
  return { result, spec: normalizeMenuSpec(showNativeMenu.mock.calls.at(-1)![0]) }
}

beforeEach(() => {
  vi.clearAllMocks()
  setRepo()
  useRepoUIStore.setState({
    aiPanelTarget: null,
    compareRefsTarget: null,
    pendingGraphSelection: null,
    pendingGraphAction: null,
    pendingRemoteBranchDelete: null,
    prCreateOpen: false,
    prCreatePrefill: null,
  })
  usePinnedBranchesStore.setState({ overrides: {} })
  useSoloModeStore.setState({ active: false, soloed: new Set() })
  useQueryMock.mockReturnValue({ data: [] })
  aiEnabledMock.mockReturnValue(true)
  effectiveSettingsMock.mockReturnValue({ targetBranches: ['origin/main'] })
  checkoutBranchWithStashPrompt.mockResolvedValue(true)
  showNativeMenu.mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  })
})

describe('useSidebarBranchMenu — opening the menu', () => {
  it('suppresses the native context menu and selects the branch tip', () => {
    const e = clickEvent()
    const { result } = renderHook(() => useSidebarBranchMenu(REPO))
    act(() => result.current.openBranchMenu(e, localBranch('feat')))

    expect(e.preventDefault).toHaveBeenCalled()
    // The commit-scoped dialogs (create branch, reset, revert, tags...) act on the graph's
    // selected commit, so the branch tip must be selected before any of them can be picked.
    expect(useRepoUIStore.getState().pendingGraphSelection).toBe('oid-feat')
  })
})

describe('useSidebarBranchMenu — delete branch (destructive)', () => {
  it('deletes a local branch, pinning its tip first, and refreshes the views', async () => {
    mocked.apiDeleteBranch.mockResolvedValue(undefined)
    const { spec } = openMenu(localBranch('feat', { upstream: 'origin/feat' }))

    await act(async () => getItem(spec, 'Delete feat').action!())

    expect(mocked.apiDeleteBranch).toHaveBeenCalledWith(REPO, 'feat', {
      targetOid: 'oid-feat',
      upstream: 'origin/feat',
    })
    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['branches', REPO] })
    )
    expect(toastSuccess).toHaveBeenCalledWith('Branch feat deleted')
  })

  it('reports a failed local branch delete', async () => {
    mocked.apiDeleteBranch.mockRejectedValue(new Error('branch is checked out elsewhere'))
    const { spec } = openMenu(localBranch('feat'))

    await act(async () => getItem(spec, 'Delete feat').action!())

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        expect.stringContaining('branch is checked out elsewhere')
      )
    )
  })

  it('never offers to delete the currently checked-out branch', () => {
    setRepo('main')
    const { spec } = openMenu(localBranch('main'))
    expect(findItem(spec, 'Delete main')).toBeUndefined()
  })

  it('routes a remote branch delete through the confirmation dialog instead of deleting outright', () => {
    const { spec } = openMenu(remoteBranch('feat'))
    act(() => getItem(spec, 'Delete origin/feat').action!())

    expect(mocked.apiDeleteBranch).not.toHaveBeenCalled()
    // On the shared store, not local hook state — the dialog must survive the graph unmounting.
    expect(useRepoUIStore.getState().pendingRemoteBranchDelete).toEqual({
      remote: 'origin',
      branchName: 'feat',
    })
  })
})

describe('useSidebarBranchMenu — cherry-pick (destructive)', () => {
  it('cherry-picks the branch tip commit and refreshes', async () => {
    mocked.apiCherryPickCommit.mockResolvedValue(undefined)
    const { spec } = openMenu(localBranch('feat'))

    await act(async () => getItem(spec, 'Cherry-pick this commit').action!())

    expect(mocked.apiCherryPickCommit).toHaveBeenCalledWith(REPO, 'oid-feat')
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Commit cherry-picked'))
  })

  it('reports a failed cherry-pick', async () => {
    mocked.apiCherryPickCommit.mockRejectedValue(new Error('conflict applying patch'))
    const { spec } = openMenu(localBranch('feat'))

    await act(async () => getItem(spec, 'Cherry-pick this commit').action!())

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(expect.stringContaining('conflict applying patch'))
    )
  })
})

describe('useSidebarBranchMenu — rebase onto branch (destructive, rewrites HEAD)', () => {
  it('rebases the current branch onto the target branch tip', async () => {
    mocked.apiRebaseOntoCommit.mockResolvedValue(undefined)
    const { spec } = openMenu(localBranch('feat'))

    await act(async () => getItem(spec, 'Rebase main onto feat').action!())

    expect(mocked.apiRebaseOntoCommit).toHaveBeenCalledWith(REPO, 'oid-feat')
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Rebased main onto feat'))
  })

  it('reports a failed rebase', async () => {
    mocked.apiRebaseOntoCommit.mockRejectedValue(new Error('rebase conflict'))
    const { spec } = openMenu(localBranch('feat'))

    await act(async () => getItem(spec, 'Rebase main onto feat').action!())

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(expect.stringContaining('rebase conflict'))
    )
  })

  it('offers no relationship actions against the currently checked-out branch', () => {
    setRepo('main')
    const { spec } = openMenu(localBranch('main'))
    expect(findItem(spec, 'Rebase main onto main')).toBeUndefined()
    expect(findItem(spec, 'Merge main into main')).toBeUndefined()
  })
})

describe('useSidebarBranchMenu — merge into current branch (destructive)', () => {
  it('merges the target branch into the current branch', async () => {
    mocked.apiMergeBranch.mockResolvedValue(undefined)
    const { spec } = openMenu(localBranch('feat'))

    await act(async () => getItem(spec, 'Merge feat into main').action!())

    expect(mocked.apiMergeBranch).toHaveBeenCalledWith(REPO, 'feat', 'main')
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Merged feat into main'))
  })

  it('reports a failed merge', async () => {
    mocked.apiMergeBranch.mockRejectedValue(new Error('merge conflict'))
    const { spec } = openMenu(localBranch('feat'))

    await act(async () => getItem(spec, 'Merge feat into main').action!())

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(expect.stringContaining('merge conflict'))
    )
  })
})

describe('useSidebarBranchMenu — fast-forward (destructive, moves the branch ref)', () => {
  it('fast-forwards the current branch up to the target branch', async () => {
    mocked.apiFastForwardBranch.mockResolvedValue(undefined)
    const { spec } = openMenu(localBranch('feat'))

    await act(async () => getItem(spec, 'Fast-forward main to feat').action!())

    expect(mocked.apiFastForwardBranch).toHaveBeenCalledWith(REPO, 'feat', 'main')
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Fast-forwarded main to feat'))
  })

  it('reports a failed fast-forward (e.g. not an ancestor)', async () => {
    mocked.apiFastForwardBranch.mockRejectedValue(new Error('not a fast-forward'))
    const { spec } = openMenu(localBranch('feat'))

    await act(async () => getItem(spec, 'Fast-forward main to feat').action!())

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(expect.stringContaining('not a fast-forward'))
    )
  })
})

describe('useSidebarBranchMenu — reset / revert (destructive, staged not executed)', () => {
  // The hook only STAGES these as a pending graph action (`pendingGraphAction`); the confirming
  // dialog and the real, irreversible git call live downstream (see CLAUDE.md's protected-branch /
  // "type RESET" conventions) — this hook must never call a reset/revert API directly.
  it('stages a hard-reset pending action from the branch tip via the nested Reset submenu', () => {
    const { spec } = openMenu(localBranch('feat'))
    const resetItems = normalizeMenuSpec(getSubmenu(spec, 'Reset main to this commit').items)

    act(() => getItem(resetItems, 'Hard - discard all changes').action!())

    expect(useRepoUIStore.getState().pendingGraphAction).toEqual({ kind: 'reset', mode: 'hard' })
  })

  it('stages soft and mixed reset modes too', () => {
    const { spec } = openMenu(localBranch('feat'))
    const resetItems = normalizeMenuSpec(getSubmenu(spec, 'Reset main to this commit').items)

    act(() => getItem(resetItems, 'Soft - keep all changes').action!())
    expect(useRepoUIStore.getState().pendingGraphAction).toEqual({ kind: 'reset', mode: 'soft' })

    act(() => getItem(resetItems, 'Mixed - keep working copy but reset index').action!())
    expect(useRepoUIStore.getState().pendingGraphAction).toEqual({ kind: 'reset', mode: 'mixed' })
  })

  it('stages a revert pending action from the branch tip', () => {
    const { spec } = openMenu(localBranch('feat'))
    act(() => getItem(spec, 'Revert this commit').action!())
    expect(useRepoUIStore.getState().pendingGraphAction).toEqual({ kind: 'revert' })
  })
})

describe('useSidebarBranchMenu — pull / push / set upstream', () => {
  it('pulls and pushes the current trunk branch', async () => {
    mocked.apiPullBranch.mockResolvedValue(undefined)
    mocked.apiPushBranch.mockResolvedValue(undefined)
    const { spec } = openMenu(localBranch('main'))

    await act(async () => getItem(spec, 'Pull (fast-forward if possible)').action!())
    expect(mocked.apiPullBranch).toHaveBeenCalledWith(REPO)
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Pulled main'))

    await act(async () => getItem(spec, 'Push').action!())
    expect(mocked.apiPushBranch).toHaveBeenCalledWith(REPO)
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Pushed main'))
  })

  it('offers no pull/push on a non-trunk branch row', () => {
    const { spec } = openMenu(localBranch('feat'))
    expect(findItem(spec, 'Pull (fast-forward if possible)')).toBeUndefined()
    expect(findItem(spec, 'Push')).toBeUndefined()
  })

  it('applies an unambiguous default upstream directly, with no picker dialog', async () => {
    mocked.apiSetBranchUpstream.mockResolvedValue(undefined)
    useQueryMock.mockReturnValue({ data: [remoteBranch('feat')] })
    const { spec, result } = openMenu(localBranch('feat'))

    await act(async () => getItem(spec, 'Set upstream').action!())

    expect(mocked.apiSetBranchUpstream).toHaveBeenCalledWith(REPO, 'feat', 'origin/feat')
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('feat now tracks origin/feat'))
    expect(result.current.setUpstreamTarget).toBeNull()
  })

  it('opens the upstream picker dialog when no default is unambiguous', () => {
    useQueryMock.mockReturnValue({ data: [] })
    const { spec, result } = openMenu(localBranch('feat'))

    act(() => getItem(spec, 'Set upstream').action!())

    expect(mocked.apiSetBranchUpstream).not.toHaveBeenCalled()
    expect(result.current.setUpstreamTarget).toBe('feat')
  })
})

describe('useSidebarBranchMenu — checkout', () => {
  it('checks out a local branch by name through the shared stash-prompt flow', async () => {
    const { spec } = openMenu(localBranch('feat'))
    await act(async () => getItem(spec, 'Checkout feat').action!())
    expect(checkoutBranchWithStashPrompt).toHaveBeenCalledWith(REPO, 'feat')
  })

  // A remote ref goes through the local-branch flow, never through the plain checkout: handing
  // `origin/feat` to the latter would resolve the *local* `feat`, and its tip commit oid — what
  // this used to do — detaches HEAD.
  it('checks out a remote branch through its local counterpart, not its tip commit oid', async () => {
    const { spec } = openMenu(remoteBranch('feat'))
    await act(async () => getItem(spec, 'Checkout origin/feat').action!())
    expect(checkoutRemoteBranchAsLocal).toHaveBeenCalledWith(REPO, 'origin/feat')
    expect(checkoutBranchWithStashPrompt).not.toHaveBeenCalled()
  })

  it('never offers to checkout the currently checked-out branch', () => {
    setRepo('main')
    const { spec } = openMenu(localBranch('main'))
    expect(findItem(spec, 'Checkout main')).toBeUndefined()
  })
})

describe('useSidebarBranchMenu — AI branch explanation / review', () => {
  it('opens the branch explanation panel against the resolved base', () => {
    useQueryMock.mockReturnValue({ data: [localBranch('main'), remoteBranch('main')] })
    const { spec } = openMenu(localBranch('feat'))

    act(() => getItem(spec, 'Explain branch changes (LLM)').action!())

    expect(useRepoUIStore.getState().aiPanelTarget).toEqual({
      kind: 'branch',
      branch: 'feat',
      baseRef: 'origin/main',
    })
  })

  // The sidebar's branch row menu deliberately offers no "Review branch changes" item — only the
  // graph's own branch menu does (see `graphContextMenus.ts`'s `buildSidebarBranchMenuSpec`, and
  // `4b724da9`, the commit that split the sidebar spec out and stated this explicitly). The sidebar
  // reaches the review panel a different way instead, via a PR row's own menu (`useSidebarPrMenu`).
  it('never offers to review branch changes from a branch row (graph-only item)', () => {
    const { spec } = openMenu(localBranch('feat'))
    expect(findItem(spec, 'Review branch changes (LLM)')).toBeUndefined()
  })

  it('refuses to explain a branch with no resolvable base', () => {
    useQueryMock.mockReturnValue({ data: [] })
    const { spec } = openMenu(localBranch('feat'))

    act(() => getItem(spec, 'Explain branch changes (LLM)').action!())

    expect(useRepoUIStore.getState().aiPanelTarget).toBeNull()
    expect(toastError).toHaveBeenCalledWith('No base branch found to compare feat against.')
  })

  it('disables the AI branch actions while AI is off', () => {
    aiEnabledMock.mockReturnValue(false)
    const { spec } = openMenu(localBranch('feat'))
    expect(getItem(spec, 'Explain branch changes (LLM)').enabled).toBe(false)
  })
})

describe('useSidebarBranchMenu — worktree from branch tip', () => {
  it('creates a worktree from the branch tip at the chosen destination', async () => {
    dialogOpen.mockResolvedValue('/dest')
    mockedAddWorktree.mockResolvedValue(undefined)
    const { spec } = openMenu(localBranch('feat'))

    await act(async () => getItem(spec, 'Open worktree from feat').action!())

    expect(mockedAddWorktree).toHaveBeenCalledWith(REPO, 'oid-feat', '/dest')
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Worktree created'))
  })

  it('cancels quietly when the destination picker is dismissed', async () => {
    dialogOpen.mockResolvedValue(null)
    const { spec } = openMenu(localBranch('feat'))

    await act(async () => getItem(spec, 'Open worktree from feat').action!())

    expect(mockedAddWorktree).not.toHaveBeenCalled()
  })
})

describe('useSidebarBranchMenu — copy actions', () => {
  // `buildSidebarBranchMenuSpec`'s hand-spelled copy section deliberately omits a "Create patch"
  // item — "a row's menu carries the four copies and not the patch, which belongs to a commit the
  // user pointed at in the graph" (see that builder's comment, and `4b724da9`) — so this hook wires
  // no `onCreatePatch` handler at all (the field is optional on `CommitCopyActions` for exactly
  // this reason).
  it('never offers to create a patch from a branch row (graph-only item)', () => {
    const { spec } = openMenu(localBranch('feat'))
    expect(findItem(spec, 'Create patch from commit…')).toBeUndefined()
  })

  it('copies the branch tip sha', async () => {
    mocked.apiCopyCommitSha.mockResolvedValue(undefined)
    const { spec } = openMenu(localBranch('feat'))

    await act(async () => getItem(spec, 'Copy commit sha').action!())

    expect(mocked.apiCopyCommitSha).toHaveBeenCalledWith('oid-feat')
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('SHA copied to clipboard'))
  })

  it('copies the commit web link', async () => {
    mocked.apiGetCommitWebUrl.mockResolvedValue('https://github.com/org/repo/commit/oid-feat')
    const { spec } = openMenu(localBranch('feat'))

    await act(async () => getItem(spec, 'Copy link to this commit on remote: origin').action!())

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'https://github.com/org/repo/commit/oid-feat'
    )
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Link copied to clipboard'))
  })

  it('reports no remote link for the commit', async () => {
    mocked.apiGetCommitWebUrl.mockResolvedValue(null)
    const { spec } = openMenu(localBranch('feat'))

    await act(async () => getItem(spec, 'Copy link to this commit on remote: origin').action!())

    expect(toastError).toHaveBeenCalledWith('No GitHub remote configured for this repository')
  })

  it('copies the branch name', async () => {
    const { spec } = openMenu(localBranch('feat'))

    await act(async () => getItem(spec, 'Copy branch name').action!())

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('feat')
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith('Branch name copied to clipboard')
    )
  })

  it("copies the trunk branch's link via its conventional remote counterpart", async () => {
    mocked.apiGetBranchWebUrl.mockResolvedValue('https://github.com/o/r/tree/main')
    const { spec } = openMenu(localBranch('main'))

    await act(async () => getItem(spec, 'Copy link to branch: origin/main').action!())

    expect(mocked.apiGetBranchWebUrl).toHaveBeenCalledWith(REPO, 'main')
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://github.com/o/r/tree/main')
  })

  it("copies a remote branch's own link", async () => {
    mocked.apiGetBranchWebUrl.mockResolvedValue('https://github.com/o/r/tree/feat')
    const { spec } = openMenu(remoteBranch('feat'))

    await act(async () => getItem(spec, 'Copy link to branch: origin/feat').action!())

    // The remote prefix is stripped before asking the backend for the branch's own page.
    expect(mocked.apiGetBranchWebUrl).toHaveBeenCalledWith(REPO, 'feat')
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://github.com/o/r/tree/feat')
  })
})

describe('useSidebarBranchMenu — pin / solo / rename / hide', () => {
  it('pins the branch to the left panel', async () => {
    const { spec } = openMenu(localBranch('feat'))
    await act(async () => getItem(spec, 'Pin to left').action!())
    expect(usePinnedBranchesStore.getState().overrides[REPO]).toEqual({ feat: true })
  })

  it('isolates the branch in solo mode', () => {
    const { spec } = openMenu(localBranch('feat'))
    act(() => getItem(spec, 'Solo').action!())
    expect(useSoloModeStore.getState().active).toBe(true)
    expect(useSoloModeStore.getState().soloed).toEqual(new Set(['feat']))
  })

  it('opens the rename dialog target for a local branch', () => {
    const { spec, result } = openMenu(localBranch('feat'))
    act(() => getItem(spec, 'Rename feat').action!())
    expect(result.current.renameTarget).toBe('feat')
  })

  it('never offers Rename on a remote branch row', () => {
    const { spec } = openMenu(remoteBranch('feat'))
    expect(findItem(spec, 'Rename origin/feat')).toBeUndefined()
  })

  it('toggles the branch badge hidden, then shown, in the graph', () => {
    const { spec } = openMenu(localBranch('feat'))
    act(() => getItem(spec, 'Hide the branch').action!())
    expect(useRepoDataStore.getState().hiddenBranches[REPO]).toEqual(['feat'])

    const { spec: reopened } = openMenu(localBranch('feat'))
    expect(findItem(reopened, 'Hide the branch')).toBeUndefined()
    expect(getItem(reopened, 'Show the branch')).toBeDefined()
  })
})

describe('useSidebarBranchMenu — compare / start PR', () => {
  it('opens the branch comparison dialog against the current branch', () => {
    const { spec } = openMenu(localBranch('feat'))
    act(() => getItem(spec, 'Compare feat with…').action!())
    expect(useRepoUIStore.getState().compareRefsTarget).toEqual({
      baseRef: 'feat',
      headRef: 'main',
    })
  })

  it('opens the PR-create view with the current branch as head and this branch as base', () => {
    const { spec } = openMenu(localBranch('feat'))
    act(() => getItem(spec, 'Push main and start a pull request to feat').action!())
    expect(useRepoUIStore.getState().prCreatePrefill).toEqual({ head: 'main', base: 'feat' })
  })

  it('offers "compare against working directory" only on a remote branch row', () => {
    const { spec: localSpec } = openMenu(localBranch('feat'))
    expect(findItem(localSpec, 'Compare commit against working directory')).toBeUndefined()

    const { spec: remoteSpec } = openMenu(remoteBranch('feat'))
    act(() => getItem(remoteSpec, 'Compare commit against working directory').action!())
    expect(useRepoUIStore.getState().pendingGraphAction).toEqual({ kind: 'compare' })
  })
})

describe('useSidebarBranchMenu — branch/tag creation bridge (branch tip)', () => {
  it('stages a pending "create branch" action from the branch tip', () => {
    const { spec } = openMenu(localBranch('feat'))
    act(() => getItem(spec, 'Create branch here').action!())
    expect(useRepoUIStore.getState().pendingGraphAction).toEqual({ kind: 'branch' })
  })

  it('stages lightweight and annotated tag drafts from the branch tip', () => {
    const { spec } = openMenu(localBranch('feat'))

    act(() => getItem(spec, 'Create tag here').action!())
    expect(useRepoUIStore.getState().pendingGraphAction).toEqual({ kind: 'tag', annotated: false })

    act(() => getItem(spec, 'Create annotated tag here…').action!())
    expect(useRepoUIStore.getState().pendingGraphAction).toEqual({ kind: 'tag', annotated: true })
  })
})
