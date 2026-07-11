import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { GitGraphNode, GitStatus } from '@git-manager/git-types'

const invalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries }) }))

const swrMutate = vi.fn()
vi.mock('swr', () => ({ mutate: (...a: unknown[]) => swrMutate(...a) }))

const dialogOpen = vi.fn()
const dialogSave = vi.fn()
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: (...a: unknown[]) => dialogOpen(...a), save: (...a: unknown[]) => dialogSave(...a) }))

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('@git-manager/ui', () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) } }))

const showCommitNativeContextMenu = vi.fn().mockResolvedValue(undefined)
const showStashNativeContextMenu = vi.fn().mockResolvedValue(undefined)
vi.mock('../api/nativeMenu.api', () => ({
  showCommitNativeContextMenu: (...a: unknown[]) => showCommitNativeContextMenu(...a),
  showStashNativeContextMenu: (...a: unknown[]) => showStashNativeContextMenu(...a),
}))

vi.mock('../api/git.api', () => ({
  apiStashApply: vi.fn(),
  apiStashPop: vi.fn(),
  apiStashDrop: vi.fn(),
  apiCreateCommit: vi.fn(),
  apiStageAll: vi.fn(),
  apiCopyCommitSha: vi.fn(),
  apiCheckoutBranch: vi.fn(),
  apiCherryPickCommit: vi.fn(),
  apiRebaseOntoCommit: vi.fn(),
  apiGetCommitWebUrl: vi.fn(),
  apiCreatePatch: vi.fn(),
  apiIsCommitOnCurrentBranch: vi.fn(),
}))
vi.mock('../api/worktree.api', () => ({ apiAddWorktree: vi.fn() }))

const webviewGetByLabel = vi.fn()
const WebviewWindowCtor = vi.fn()
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: Object.assign(
    function (this: unknown, ...args: unknown[]) {
      WebviewWindowCtor(...args)
    },
    { getByLabel: (...a: unknown[]) => webviewGetByLabel(...a) }
  ),
}))

import * as gitApi from '../api/git.api'
import { apiAddWorktree } from '../api/worktree.api'
import { useRepoUIStore } from '../stores/repoUI.store'
import { useGitGraphActions } from './useGitGraphActions'

const mocked = gitApi as unknown as Record<string, ReturnType<typeof vi.fn>>
const mockedAddWorktree = apiAddWorktree as unknown as ReturnType<typeof vi.fn>

const t = (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key)
const REPO = '/repo'

function commitNode(oid: string, overrides: Partial<GitGraphNode> = {}): GitGraphNode {
  return {
    commit: {
      oid,
      shortOid: oid.slice(0, 7),
      message: 'msg',
      subject: 'subject',
      body: '',
      author: { name: 'a', email: 'a@x.com', timestamp: 0 },
      committer: { name: 'a', email: 'a@x.com', timestamp: 0 },
      parentOids: [],
    },
    column: 0,
    color: '#000',
    connections: [],
    refs: [],
    ...overrides,
  } as GitGraphNode
}

function status(overrides: Partial<GitStatus> = {}): GitStatus {
  return { staged: [], unstaged: [], untracked: [], conflicted: [], ...overrides } as GitStatus
}

function baseParams(overrides: Partial<Parameters<typeof useGitGraphActions>[0]> = {}) {
  return {
    repoPath: REPO,
    nodes: [commitNode('a')],
    selected: new Set<string>(),
    primaryOid: 'a',
    setPrimaryOid: vi.fn(),
    selectSingle: vi.fn(),
    hiddenStashes: [] as string[],
    toggleStashVisibility: vi.fn(),
    status: status(),
    isRebasePaused: false,
    t,
    ...overrides,
  }
}

function clickEvent() {
  return { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as React.MouseEvent
}

beforeEach(() => {
  vi.clearAllMocks()
  useRepoUIStore.setState({ editingOid: null })
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
  // clearAllMocks() also wipes .mockResolvedValue()-configured implementations, so these need
  // to be re-armed every test rather than configured once at module scope.
  showCommitNativeContextMenu.mockResolvedValue(undefined)
  showStashNativeContextMenu.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useGitGraphActions — simple commit actions', () => {
  it('handleCopySha copies the primary oid and toasts', async () => {
    mocked.apiCopyCommitSha.mockResolvedValue(undefined)
    const { result } = renderHook(() => useGitGraphActions(baseParams({ primaryOid: 'abc' })))
    // handleCommitWip is exposed; handleCopySha is internal to openMenuAt's onCopySha callback,
    // exercised indirectly below — but it's also reachable for direct assertion via the menu path.
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    const menuOpts = showCommitNativeContextMenu.mock.calls[0][0]
    await act(async () => menuOpts.onCopySha())
    expect(mocked.apiCopyCommitSha).toHaveBeenCalledWith('abc')
    expect(toastSuccess).toHaveBeenCalledWith('gitTree.contextMenu.shaCopied')
  })

  it('handleCommitWip does nothing for a blank message', async () => {
    const { result } = renderHook(() => useGitGraphActions(baseParams()))
    await act(async () => result.current.handleCommitWip('   '))
    expect(mocked.apiCreateCommit).not.toHaveBeenCalled()
  })

  it('handleCommitWip stages everything first when nothing is staged yet', async () => {
    mocked.apiStageAll.mockResolvedValue(undefined)
    mocked.apiCreateCommit.mockResolvedValue({ oid: 'new' })
    const { result } = renderHook(() => useGitGraphActions(baseParams({ status: status({ staged: [] }) })))
    await act(async () => result.current.handleCommitWip('Add feature'))

    expect(mocked.apiStageAll).toHaveBeenCalledWith(REPO)
    expect(mocked.apiCreateCommit).toHaveBeenCalledWith(REPO, 'Add feature')
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['git-status', REPO] })
  })

  it('handleCommitWip skips staging when there are already staged files', async () => {
    mocked.apiCreateCommit.mockResolvedValue({ oid: 'new' })
    const { result } = renderHook(() =>
      useGitGraphActions(baseParams({ status: status({ staged: [{ path: 'a.ts' } as never] }) }))
    )
    await act(async () => result.current.handleCommitWip('Add feature'))
    expect(mocked.apiStageAll).not.toHaveBeenCalled()
  })

  it('handleCommitWip toasts an error on failure', async () => {
    mocked.apiCreateCommit.mockRejectedValue(new Error('commit failed'))
    const { result } = renderHook(() =>
      useGitGraphActions(baseParams({ status: status({ staged: [{ path: 'a.ts' } as never] }) }))
    )
    await act(async () => result.current.handleCommitWip('Add feature'))
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('commit failed'))
  })
})

describe('useGitGraphActions — openMenuAt: ignores WIP row', () => {
  it('does nothing for the synthetic WIP oid', async () => {
    const { result } = renderHook(() => useGitGraphActions(baseParams()))
    await act(async () => result.current.openMenuAt(clickEvent(), 'WIP'))
    expect(showCommitNativeContextMenu).not.toHaveBeenCalled()
    expect(showStashNativeContextMenu).not.toHaveBeenCalled()
  })
})

describe('useGitGraphActions — openMenuAt: stash rows', () => {
  const stashNode = commitNode('stash-1', {
    refs: [{ name: 'refs/stash@{1}', shortName: 'stash@{1}', type: 'stash', commitOid: 'stash-1' }],
  })

  it('opens the stash menu with the parsed index and isHidden flag', async () => {
    const selectSingle = vi.fn()
    const { result } = renderHook(() =>
      useGitGraphActions(baseParams({ nodes: [stashNode], selectSingle, hiddenStashes: ['stash-1'] }))
    )
    await act(async () => result.current.openMenuAt(clickEvent(), 'stash-1'))

    expect(selectSingle).toHaveBeenCalledWith('stash-1')
    expect(showStashNativeContextMenu).toHaveBeenCalledWith(expect.objectContaining({ isHidden: true }))
  })

  it('onApply applies the stash and refreshes', async () => {
    mocked.apiStashApply.mockResolvedValue(undefined)
    const { result } = renderHook(() => useGitGraphActions(baseParams({ nodes: [stashNode] })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'stash-1'))
    const opts = showStashNativeContextMenu.mock.calls[0][0]
    await act(async () => opts.onApply())

    expect(mocked.apiStashApply).toHaveBeenCalledWith(REPO, 1)
    expect(swrMutate).toHaveBeenCalledWith(['git-stashes', REPO])
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['git-log', REPO] })
  })

  it('onPop pops the stash', async () => {
    mocked.apiStashPop.mockResolvedValue(undefined)
    const { result } = renderHook(() => useGitGraphActions(baseParams({ nodes: [stashNode] })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'stash-1'))
    const opts = showStashNativeContextMenu.mock.calls[0][0]
    await act(async () => opts.onPop())
    expect(mocked.apiStashPop).toHaveBeenCalledWith(REPO, 1)
  })

  it('onDelete drops the stash', async () => {
    mocked.apiStashDrop.mockResolvedValue(undefined)
    const { result } = renderHook(() => useGitGraphActions(baseParams({ nodes: [stashNode] })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'stash-1'))
    const opts = showStashNativeContextMenu.mock.calls[0][0]
    await act(async () => opts.onDelete())
    expect(mocked.apiStashDrop).toHaveBeenCalledWith(REPO, 1)
  })

  it('onEditMessage selects the row and opens the rename field via repoUI.store (real interop)', async () => {
    const selectSingle = vi.fn()
    const { result } = renderHook(() => useGitGraphActions(baseParams({ nodes: [stashNode], selectSingle })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'stash-1'))
    const opts = showStashNativeContextMenu.mock.calls[0][0]
    act(() => opts.onEditMessage())

    expect(selectSingle).toHaveBeenCalledWith('stash-1')
    expect(useRepoUIStore.getState().editingOid).toBe('stash-1')
  })

  it('onToggleVisibility calls toggleStashVisibility with the repo path and oid', async () => {
    const toggleStashVisibility = vi.fn()
    const { result } = renderHook(() => useGitGraphActions(baseParams({ nodes: [stashNode], toggleStashVisibility })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'stash-1'))
    const opts = showStashNativeContextMenu.mock.calls[0][0]
    act(() => opts.onToggleVisibility())
    expect(toggleStashVisibility).toHaveBeenCalledWith(REPO, 'stash-1')
  })

  it('logs and swallows an error from the stash action itself', async () => {
    mocked.apiStashApply.mockRejectedValue(new Error('apply failed'))
    const { result } = renderHook(() => useGitGraphActions(baseParams({ nodes: [stashNode] })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'stash-1'))
    const opts = showStashNativeContextMenu.mock.calls[0][0]
    await act(async () => opts.onApply())
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('apply failed'))
  })
})

describe('useGitGraphActions — openMenuAt: regular commit rows', () => {
  it('selects the single clicked commit as target when it was not already selected', async () => {
    const selectSingle = vi.fn()
    mocked.apiIsCommitOnCurrentBranch.mockResolvedValue(true)
    const { result } = renderHook(() => useGitGraphActions(baseParams({ selectSingle, selected: new Set() })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    expect(selectSingle).toHaveBeenCalledWith('a')
    expect(showCommitNativeContextMenu).toHaveBeenCalledWith(expect.objectContaining({ isSingle: true, targetCount: 1 }))
  })

  it('uses the full multi-selection as targets when the clicked oid is already selected', async () => {
    const setPrimaryOid = vi.fn()
    mocked.apiIsCommitOnCurrentBranch.mockResolvedValue(true)
    const { result } = renderHook(() =>
      useGitGraphActions(baseParams({ selected: new Set(['a', 'b']), setPrimaryOid, primaryOid: 'a' }))
    )
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    expect(setPrimaryOid).toHaveBeenCalledWith('a')
    expect(showCommitNativeContextMenu).toHaveBeenCalledWith(expect.objectContaining({ isSingle: false, targetCount: 2 }))
  })

  it('enables fixup only for a single, non-rebase-paused commit with working changes that is on the current branch', async () => {
    mocked.apiIsCommitOnCurrentBranch.mockResolvedValue(true)
    const { result } = renderHook(() =>
      useGitGraphActions(baseParams({ status: status({ unstaged: [{ path: 'a.ts' } as never] }) }))
    )
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    expect(showCommitNativeContextMenu).toHaveBeenCalledWith(expect.objectContaining({ fixupEnabled: true }))
  })

  it('disables fixup when a rebase is paused', async () => {
    mocked.apiIsCommitOnCurrentBranch.mockResolvedValue(true)
    const { result } = renderHook(() =>
      useGitGraphActions(baseParams({ status: status({ unstaged: [{ path: 'a.ts' } as never] }), isRebasePaused: true }))
    )
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    expect(showCommitNativeContextMenu).toHaveBeenCalledWith(expect.objectContaining({ fixupEnabled: false }))
  })

  it('disables fixup when there are no working-tree changes', async () => {
    mocked.apiIsCommitOnCurrentBranch.mockResolvedValue(true)
    const { result } = renderHook(() => useGitGraphActions(baseParams({ status: status() })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    expect(showCommitNativeContextMenu).toHaveBeenCalledWith(expect.objectContaining({ fixupEnabled: false }))
  })

  it('enables undoCommit only for the tip (index 0) commit with a parent', async () => {
    mocked.apiIsCommitOnCurrentBranch.mockResolvedValue(true)
    const tip = commitNode('a', { commit: { ...commitNode('a').commit, parentOids: ['parent-1'] } })
    const parent = commitNode('parent-1')
    const { result } = renderHook(() => useGitGraphActions(baseParams({ nodes: [tip, parent] })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    expect(showCommitNativeContextMenu).toHaveBeenCalledWith(expect.objectContaining({ undoCommitEnabled: true }))
  })

  it('disables undoCommit for a commit that is not the tip', async () => {
    mocked.apiIsCommitOnCurrentBranch.mockResolvedValue(true)
    const tip = commitNode('a')
    const notTip = commitNode('b', { commit: { ...commitNode('b').commit, parentOids: ['a'] } })
    const { result } = renderHook(() => useGitGraphActions(baseParams({ nodes: [tip, notTip] })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'b'))
    expect(showCommitNativeContextMenu).toHaveBeenCalledWith(expect.objectContaining({ undoCommitEnabled: false }))
  })

  it('onCreateBranch sets a pending "branch" action', async () => {
    mocked.apiIsCommitOnCurrentBranch.mockResolvedValue(true)
    const { result } = renderHook(() => useGitGraphActions(baseParams()))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    const opts = showCommitNativeContextMenu.mock.calls[0][0]
    act(() => opts.onCreateBranch())
    expect(result.current.pendingAction).toEqual({ kind: 'branch' })
  })

  it('onReset sets a pending "reset" action with the chosen mode', async () => {
    mocked.apiIsCommitOnCurrentBranch.mockResolvedValue(true)
    const { result } = renderHook(() => useGitGraphActions(baseParams()))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    const opts = showCommitNativeContextMenu.mock.calls[0][0]
    act(() => opts.onReset('hard'))
    expect(result.current.pendingAction).toEqual({ kind: 'reset', mode: 'hard' })
  })

  it('onUndoCommit sets a pending reset to the parent commit', async () => {
    mocked.apiIsCommitOnCurrentBranch.mockResolvedValue(true)
    const tip = commitNode('a', { commit: { ...commitNode('a').commit, parentOids: ['parent-1'] } })
    const parent = commitNode('parent-1', { commit: { ...commitNode('parent-1').commit, subject: 'parent subject' } })
    const { result } = renderHook(() => useGitGraphActions(baseParams({ nodes: [tip, parent] })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    const opts = showCommitNativeContextMenu.mock.calls[0][0]
    act(() => opts.onUndoCommit())
    expect(result.current.pendingAction).toEqual({ kind: 'reset', mode: 'mixed', targetOid: 'parent-1', targetSubject: 'parent subject' })
  })

  it('onRevert/onCompareToWorkdir/onCreateTag/onCreateAnnotatedTag set the matching pending action', async () => {
    mocked.apiIsCommitOnCurrentBranch.mockResolvedValue(true)
    const { result } = renderHook(() => useGitGraphActions(baseParams()))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    const opts = showCommitNativeContextMenu.mock.calls[0][0]

    act(() => opts.onRevert())
    expect(result.current.pendingAction).toEqual({ kind: 'revert' })
    act(() => opts.onCompareToWorkdir())
    expect(result.current.pendingAction).toEqual({ kind: 'compare' })
    act(() => opts.onCreateTag())
    expect(result.current.pendingAction).toEqual({ kind: 'tag', annotated: false })
    act(() => opts.onCreateAnnotatedTag())
    expect(result.current.pendingAction).toEqual({ kind: 'tag', annotated: true })
  })

  it('onCheckout delegates to the checkout handler', async () => {
    mocked.apiIsCommitOnCurrentBranch.mockResolvedValue(true)
    mocked.apiCheckoutBranch.mockResolvedValue(undefined)
    const { result } = renderHook(() => useGitGraphActions(baseParams({ primaryOid: 'a' })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    const opts = showCommitNativeContextMenu.mock.calls[0][0]
    await act(async () => opts.onCheckout())
    expect(mocked.apiCheckoutBranch).toHaveBeenCalledWith(REPO, 'a')
  })

  it('onCherryPick delegates to the cherry-pick handler', async () => {
    mocked.apiIsCommitOnCurrentBranch.mockResolvedValue(true)
    mocked.apiCherryPickCommit.mockResolvedValue(undefined)
    const { result } = renderHook(() => useGitGraphActions(baseParams({ primaryOid: 'a' })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    const opts = showCommitNativeContextMenu.mock.calls[0][0]
    await act(async () => opts.onCherryPick())
    expect(mocked.apiCherryPickCommit).toHaveBeenCalledWith(REPO, 'a')
    expect(toastSuccess).toHaveBeenCalledWith('gitTree.contextMenu.cherryPicked')
  })
})

describe('useGitGraphActions — dialogs', () => {
  it('handleCreateWorktree cancels quietly when the user closes the picker', async () => {
    mocked.apiIsCommitOnCurrentBranch.mockResolvedValue(true)
    dialogOpen.mockResolvedValue(null)
    const { result } = renderHook(() => useGitGraphActions(baseParams({ primaryOid: 'a' })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    const opts = showCommitNativeContextMenu.mock.calls[0][0]
    await act(async () => opts.onCreateWorktree())
    expect(mockedAddWorktree).not.toHaveBeenCalled()
  })

  it('handleCreateWorktree adds the worktree at the chosen path', async () => {
    mocked.apiIsCommitOnCurrentBranch.mockResolvedValue(true)
    dialogOpen.mockResolvedValue('/dest')
    mockedAddWorktree.mockResolvedValue(undefined)
    const { result } = renderHook(() => useGitGraphActions(baseParams({ primaryOid: 'a' })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    const opts = showCommitNativeContextMenu.mock.calls[0][0]
    await act(async () => opts.onCreateWorktree())
    expect(mockedAddWorktree).toHaveBeenCalledWith(REPO, 'a', '/dest')
    expect(toastSuccess).toHaveBeenCalledWith('gitTree.contextMenu.worktreeCreated')
  })

  it('handleCreatePatch cancels quietly without a destination', async () => {
    mocked.apiIsCommitOnCurrentBranch.mockResolvedValue(true)
    dialogSave.mockResolvedValue(null)
    const { result } = renderHook(() => useGitGraphActions(baseParams({ primaryOid: 'a' })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    const opts = showCommitNativeContextMenu.mock.calls[0][0]
    await act(async () => opts.onCreatePatch())
    expect(mocked.apiCreatePatch).not.toHaveBeenCalled()
  })

  it('handleCreatePatch writes the patch to the chosen destination', async () => {
    mocked.apiIsCommitOnCurrentBranch.mockResolvedValue(true)
    dialogSave.mockResolvedValue('/dest/patch.patch')
    mocked.apiCreatePatch.mockResolvedValue(undefined)
    const { result } = renderHook(() => useGitGraphActions(baseParams({ primaryOid: 'a' })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    const opts = showCommitNativeContextMenu.mock.calls[0][0]
    await act(async () => opts.onCreatePatch())
    expect(mocked.apiCreatePatch).toHaveBeenCalledWith(REPO, 'a', '/dest/patch.patch')
  })
})

describe('useGitGraphActions — copy web link', () => {
  it('toasts an error when there is no remote link', async () => {
    mocked.apiIsCommitOnCurrentBranch.mockResolvedValue(true)
    mocked.apiGetCommitWebUrl.mockResolvedValue(null)
    const { result } = renderHook(() => useGitGraphActions(baseParams({ primaryOid: 'a' })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    const opts = showCommitNativeContextMenu.mock.calls[0][0]
    await act(async () => opts.onCopyLink())
    expect(toastError).toHaveBeenCalledWith('gitTree.contextMenu.noRemoteLink')
  })

  it('copies the commit web URL to the clipboard', async () => {
    mocked.apiIsCommitOnCurrentBranch.mockResolvedValue(true)
    mocked.apiGetCommitWebUrl.mockResolvedValue('https://github.com/org/repo/commit/a')
    const { result } = renderHook(() => useGitGraphActions(baseParams({ primaryOid: 'a' })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    const opts = showCommitNativeContextMenu.mock.calls[0][0]
    await act(async () => opts.onCopyLink())
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://github.com/org/repo/commit/a')
    expect(toastSuccess).toHaveBeenCalledWith('gitTree.contextMenu.linkCopied')
  })
})

describe('useGitGraphActions — fixup window', () => {
  it('focuses an existing fixup window instead of creating a new one', async () => {
    mocked.apiIsCommitOnCurrentBranch.mockResolvedValue(true)
    const show = vi.fn().mockResolvedValue(undefined)
    const setFocus = vi.fn().mockResolvedValue(undefined)
    webviewGetByLabel.mockResolvedValue({ show, setFocus })

    const { result } = renderHook(() => useGitGraphActions(baseParams({ primaryOid: 'a' })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    const opts = showCommitNativeContextMenu.mock.calls[0][0]
    await act(async () => opts.onFixup())
    await waitFor(() => expect(show).toHaveBeenCalledOnce())

    expect(setFocus).toHaveBeenCalledOnce()
    expect(WebviewWindowCtor).not.toHaveBeenCalled()
  })

  it('creates a new fixup window when none exists yet', async () => {
    mocked.apiIsCommitOnCurrentBranch.mockResolvedValue(true)
    webviewGetByLabel.mockResolvedValue(null)

    const { result } = renderHook(() => useGitGraphActions(baseParams({ primaryOid: 'a' })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    const opts = showCommitNativeContextMenu.mock.calls[0][0]
    await act(async () => opts.onFixup())
    await waitFor(() => expect(WebviewWindowCtor).toHaveBeenCalledOnce())
  })
})
