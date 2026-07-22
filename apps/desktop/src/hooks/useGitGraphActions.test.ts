import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { GitGraphNode, GitStatus } from '@git-manager/git-types'
import { normalizeMenuSpec, type MenuSpecNode } from '../lib/nativeMenuSpec'

const invalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries }) }))

const swrMutate = vi.fn()
vi.mock('swr', () => ({ mutate: (...a: unknown[]) => swrMutate(...a) }))

const dialogOpen = vi.fn()
const dialogSave = vi.fn()
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...a: unknown[]) => dialogOpen(...a),
  save: (...a: unknown[]) => dialogSave(...a),
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
vi.mock('../api/nativeMenu.api', () => ({
  showNativeMenu: (...a: unknown[]) => showNativeMenu(...a),
}))

vi.mock('../api/git.api', () => ({
  apiStashApply: vi.fn(),
  apiStashPop: vi.fn(),
  apiStashDrop: vi.fn(),
  apiStashPush: vi.fn(),
  apiCreateCommit: vi.fn(),
  apiStageAll: vi.fn(),
  apiUnstageAll: vi.fn(),
  apiCopyCommitSha: vi.fn(),
  apiCheckoutBranch: vi.fn(),
  apiCherryPickCommit: vi.fn(),
  apiRebaseOntoCommit: vi.fn(),
  apiGetCommitWebUrl: vi.fn(),
  apiGetBranchWebUrl: vi.fn(),
  apiCreatePatch: vi.fn(),
  apiCreateCommitsPatch: vi.fn(),
  apiPullBranch: vi.fn(),
  apiPushBranch: vi.fn(),
  apiFastForwardBranch: vi.fn(),
  apiMergeBranch: vi.fn(),
  apiDeleteBranch: vi.fn(),
  apiCreateTag: vi.fn(),
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
import { usePinnedBranchesStore } from '../stores/pinned-branches.store'
import { useGitGraphActions } from './useGitGraphActions'

const mocked = gitApi as unknown as Record<string, ReturnType<typeof vi.fn>>
const mockedAddWorktree = apiAddWorktree as unknown as ReturnType<typeof vi.fn>

const t = (key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}:${JSON.stringify(opts)}` : key
const REPO = '/repo'

// ── Spec inspection helpers ──────────────────────────────────────────────────
// The commit menu is declarative: `openMenuAt` hands `showNativeMenu` a MenuSpecEntry[] built by
// `buildCommitMenuSpec`. Tests normalize the last spec and address items by their (fake-`t`)
// text — `key` alone, or `key:{"json":"params"}` for interpolated labels, hence startsWith.

type ItemNode = Extract<MenuSpecNode, { kind: 'item' }>
type SubmenuNode = Extract<MenuSpecNode, { kind: 'submenu' }>

function lastSpec(): MenuSpecNode[] {
  const calls = showNativeMenu.mock.calls
  expect(calls.length).toBeGreaterThan(0)
  return normalizeMenuSpec(calls[calls.length - 1][0])
}

function flatten(nodes: MenuSpecNode[]): MenuSpecNode[] {
  return nodes.flatMap((n) =>
    n.kind === 'submenu' ? [n, ...flatten(normalizeMenuSpec(n.items))] : [n]
  )
}

function findItem(textPrefix: string, nodes: MenuSpecNode[] = lastSpec()): ItemNode | undefined {
  return flatten(nodes).find(
    (n): n is ItemNode => n.kind === 'item' && n.text.startsWith(textPrefix)
  )
}

function getItem(textPrefix: string, nodes: MenuSpecNode[] = lastSpec()): ItemNode {
  const item = findItem(textPrefix, nodes)
  expect(item, `menu item "${textPrefix}"`).toBeDefined()
  return item as ItemNode
}

function getSubmenu(textPrefix: string, nodes: MenuSpecNode[] = lastSpec()): SubmenuNode {
  const sub = nodes.find(
    (n): n is SubmenuNode => n.kind === 'submenu' && n.text.startsWith(textPrefix)
  )
  expect(sub, `submenu "${textPrefix}"`).toBeDefined()
  return sub as SubmenuNode
}

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
    setPrimaryOid: vi.fn(),
    selectSingle: vi.fn(),
    hiddenStashes: [] as string[],
    toggleStashVisibility: vi.fn(),
    status: status(),
    currentBranch: 'main',
    isDetached: false,
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
  usePinnedBranchesStore.setState({ overrides: {} })
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
  // clearAllMocks() also wipes .mockResolvedValue()-configured implementations, so these need
  // to be re-armed every test rather than configured once at module scope.
  showNativeMenu.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useGitGraphActions — simple commit actions', () => {
  it('the copy-sha item copies the clicked commit sha and toasts', async () => {
    mocked.apiCopyCommitSha.mockResolvedValue(undefined)
    const { result } = renderHook(() => useGitGraphActions(baseParams()))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    await act(async () => getItem('gitTree.contextMenu.copySha').action!())
    expect(mocked.apiCopyCommitSha).toHaveBeenCalledWith('a')
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
    const { result } = renderHook(() =>
      useGitGraphActions(baseParams({ status: status({ staged: [] }) }))
    )
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

describe('useGitGraphActions — openMenuAt: WIP row', () => {
  it('opens the WIP menu with the stash and stage/unstage items', async () => {
    const { result } = renderHook(() =>
      useGitGraphActions(
        baseParams({
          status: status({
            staged: [{ path: 's.ts' } as never],
            untracked: [{ path: 'u.ts' } as never],
          }),
        })
      )
    )
    await act(async () => result.current.openMenuAt(clickEvent(), 'WIP'))
    expect(getItem('gitTree.wipMenu.stash')).toBeDefined()
    expect(getItem('gitTree.wipMenu.stageAll').enabled).toBe(true)
    expect(getItem('gitTree.wipMenu.unstageAll').enabled).toBe(true)
  })

  it('disables stage/unstage when there is nothing to act on', async () => {
    const { result } = renderHook(() => useGitGraphActions(baseParams({ status: status() })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'WIP'))
    expect(getItem('gitTree.wipMenu.stageAll').enabled).toBe(false)
    expect(getItem('gitTree.wipMenu.unstageAll').enabled).toBe(false)
  })

  it('the stash items push a stash, refresh the stash list, and toast', async () => {
    mocked.apiStashPush.mockResolvedValue(undefined)
    const { result } = renderHook(() => useGitGraphActions(baseParams()))
    await act(async () => result.current.openMenuAt(clickEvent(), 'WIP'))
    await act(async () => getItem('gitTree.wipMenu.stash').action!())
    expect(mocked.apiStashPush).toHaveBeenCalledWith(REPO, undefined, false)
    await act(async () => getItem('gitTree.wipMenu.stashIncludeUntracked').action!())
    expect(mocked.apiStashPush).toHaveBeenCalledWith(REPO, undefined, true)
    expect(swrMutate).toHaveBeenCalledWith(['git-stashes', REPO])
    expect(toastSuccess).toHaveBeenCalledWith('gitTree.wipMenu.stashed')
  })

  it('the stage/unstage items act on the whole working tree', async () => {
    mocked.apiStageAll.mockResolvedValue(undefined)
    mocked.apiUnstageAll.mockResolvedValue(undefined)
    const { result } = renderHook(() =>
      useGitGraphActions(
        baseParams({
          status: status({
            staged: [{ path: 's.ts' } as never],
            unstaged: [{ path: 'm.ts' } as never],
          }),
        })
      )
    )
    await act(async () => result.current.openMenuAt(clickEvent(), 'WIP'))
    await act(async () => getItem('gitTree.wipMenu.stageAll').action!())
    expect(mocked.apiStageAll).toHaveBeenCalledWith(REPO)
    await act(async () => getItem('gitTree.wipMenu.unstageAll').action!())
    expect(mocked.apiUnstageAll).toHaveBeenCalledWith(REPO)
  })

  it('shows no menu for the CONFLICT row and a worktree WIP row', async () => {
    const { result } = renderHook(() => useGitGraphActions(baseParams()))
    await act(async () => result.current.openMenuAt(clickEvent(), 'CONFLICT'))
    await act(async () => result.current.openMenuAt(clickEvent(), 'WIP:/some/worktree'))
    expect(showNativeMenu).not.toHaveBeenCalled()
  })
})

describe('useGitGraphActions — openMenuAt: stash rows', () => {
  const stashNode = commitNode('stash-1', {
    refs: [{ name: 'refs/stash@{1}', shortName: 'stash@{1}', type: 'stash', commitOid: 'stash-1' }],
  })

  it('opens the stash menu, labelled Show when the stash is hidden', async () => {
    const selectSingle = vi.fn()
    const { result } = renderHook(() =>
      useGitGraphActions(
        baseParams({ nodes: [stashNode], selectSingle, hiddenStashes: ['stash-1'] })
      )
    )
    await act(async () => result.current.openMenuAt(clickEvent(), 'stash-1'))

    expect(selectSingle).toHaveBeenCalledWith('stash-1')
    expect(getItem('gitTree.stashMenu.show')).toBeDefined()
    expect(findItem('gitTree.stashMenu.hide')).toBeUndefined()
  })

  it('the apply item applies the parsed stash index and refreshes', async () => {
    mocked.apiStashApply.mockResolvedValue(undefined)
    const { result } = renderHook(() => useGitGraphActions(baseParams({ nodes: [stashNode] })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'stash-1'))
    await act(async () => getItem('gitTree.stashMenu.apply').action!())

    expect(mocked.apiStashApply).toHaveBeenCalledWith(REPO, 1)
    expect(swrMutate).toHaveBeenCalledWith(['git-stashes', REPO])
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['git-log', REPO] })
  })

  it('the pop item pops the stash', async () => {
    mocked.apiStashPop.mockResolvedValue(undefined)
    const { result } = renderHook(() => useGitGraphActions(baseParams({ nodes: [stashNode] })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'stash-1'))
    await act(async () => getItem('gitTree.stashMenu.pop').action!())
    expect(mocked.apiStashPop).toHaveBeenCalledWith(REPO, 1)
  })

  it('the delete item drops the stash', async () => {
    mocked.apiStashDrop.mockResolvedValue(undefined)
    const { result } = renderHook(() => useGitGraphActions(baseParams({ nodes: [stashNode] })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'stash-1'))
    await act(async () => getItem('gitTree.stashMenu.delete').action!())
    expect(mocked.apiStashDrop).toHaveBeenCalledWith(REPO, 1)
  })

  it('the edit-message item selects the row and opens the rename field (real interop)', async () => {
    const selectSingle = vi.fn()
    const { result } = renderHook(() =>
      useGitGraphActions(baseParams({ nodes: [stashNode], selectSingle }))
    )
    await act(async () => result.current.openMenuAt(clickEvent(), 'stash-1'))
    act(() => getItem('gitTree.stashMenu.editMessage').action!())

    expect(selectSingle).toHaveBeenCalledWith('stash-1')
    expect(useRepoUIStore.getState().editingOid).toBe('stash-1')
  })

  it('the show/hide item toggles stash visibility', async () => {
    const toggleStashVisibility = vi.fn()
    const { result } = renderHook(() =>
      useGitGraphActions(baseParams({ nodes: [stashNode], toggleStashVisibility }))
    )
    await act(async () => result.current.openMenuAt(clickEvent(), 'stash-1'))
    act(() => getItem('gitTree.stashMenu.hide').action!())
    expect(toggleStashVisibility).toHaveBeenCalledWith(REPO, 'stash-1')
  })

  it('logs and swallows an error from the stash action itself', async () => {
    mocked.apiStashApply.mockRejectedValue(new Error('apply failed'))
    const { result } = renderHook(() => useGitGraphActions(baseParams({ nodes: [stashNode] })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'stash-1'))
    await act(async () => getItem('gitTree.stashMenu.apply').action!())
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('apply failed'))
  })
})

describe('useGitGraphActions — openMenuAt: regular commit rows', () => {
  it('selects the single clicked commit as target when it was not already selected', async () => {
    const selectSingle = vi.fn()
    const { result } = renderHook(() =>
      useGitGraphActions(baseParams({ selectSingle, selected: new Set() }))
    )
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    expect(selectSingle).toHaveBeenCalledWith('a')
    // Single selection: the single-commit layout (not the multi one).
    expect(findItem('gitTree.contextMenu.cherryPickMany')).toBeUndefined()
    expect(getItem('gitTree.contextMenu.checkout')).toBeDefined()
  })

  it('uses the full multi-selection as targets when the clicked oid is already selected', async () => {
    const setPrimaryOid = vi.fn()
    const { result } = renderHook(() =>
      useGitGraphActions(baseParams({ selected: new Set(['a', 'b']), setPrimaryOid }))
    )
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    expect(setPrimaryOid).toHaveBeenCalledWith('a')
    // Multi-select: the dedicated multi layout, carrying the selection count.
    expect(getItem('gitTree.contextMenu.cherryPickMany').text).toContain('"count":2')
  })

  it('onCreateBranch sets a pending "branch" action', async () => {
    const { result } = renderHook(() => useGitGraphActions(baseParams()))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    act(() => getItem('gitTree.contextMenu.createBranch').action!())
    expect(result.current.pendingAction).toEqual({ kind: 'branch' })
  })

  it('onReset sets a pending "reset" action with the chosen mode', async () => {
    const { result } = renderHook(() => useGitGraphActions(baseParams()))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    const reset = getSubmenu('gitTree.contextMenu.resetSubmenu')
    act(() => getItem('gitTree.contextMenu.resetHard', normalizeMenuSpec(reset.items)).action!())
    expect(result.current.pendingAction).toEqual({ kind: 'reset', mode: 'hard' })
  })

  it('titles the reset submenu with the current branch', async () => {
    const { result } = renderHook(() => useGitGraphActions(baseParams({ currentBranch: 'dev' })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    expect(getSubmenu('gitTree.contextMenu.resetSubmenu').text).toContain('"branch":"dev"')
  })

  it('onRevert sets the matching pending action', async () => {
    const { result } = renderHook(() => useGitGraphActions(baseParams()))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))

    act(() => getItem('gitTree.contextMenu.revert').action!())
    expect(result.current.pendingAction).toEqual({ kind: 'revert' })
  })

  it('onCreateTag/onCreateAnnotatedTag start an inline tag draft on the clicked commit', async () => {
    const { result } = renderHook(() => useGitGraphActions(baseParams()))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))

    act(() => getItem('gitTree.contextMenu.createTag').action!())
    expect(result.current.tagDraft).toEqual({ oid: 'a', annotated: false })
    act(() => getItem('gitTree.contextMenu.createAnnotatedTag').action!())
    expect(result.current.tagDraft).toEqual({ oid: 'a', annotated: true })
  })

  it('submitTagDraft creates the tag (annotated → empty message) then clears the draft', async () => {
    mocked.apiCreateTag.mockResolvedValue(undefined)
    const { result } = renderHook(() => useGitGraphActions(baseParams()))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))

    act(() => getItem('gitTree.contextMenu.createAnnotatedTag').action!())
    await act(async () => result.current.submitTagDraft('  v1.2.0  '))

    expect(mocked.apiCreateTag).toHaveBeenCalledWith(REPO, 'v1.2.0', 'a', '')
    expect(result.current.tagDraft).toBeNull()
  })

  it('submitTagDraft passes no message for a lightweight tag', async () => {
    mocked.apiCreateTag.mockResolvedValue(undefined)
    const { result } = renderHook(() => useGitGraphActions(baseParams()))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))

    act(() => getItem('gitTree.contextMenu.createTag').action!())
    await act(async () => result.current.submitTagDraft('v1'))

    expect(mocked.apiCreateTag).toHaveBeenCalledWith(REPO, 'v1', 'a', undefined)
  })

  it('cancelTagDraft clears the draft without creating a tag', async () => {
    const { result } = renderHook(() => useGitGraphActions(baseParams()))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))

    act(() => getItem('gitTree.contextMenu.createTag').action!())
    act(() => result.current.cancelTagDraft())

    expect(result.current.tagDraft).toBeNull()
    expect(mocked.apiCreateTag).not.toHaveBeenCalled()
  })

  it('no longer offers the retired rebase-onto/undo/fixup/compare items', async () => {
    const { result } = renderHook(() => useGitGraphActions(baseParams()))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    expect(findItem('gitTree.contextMenu.rebaseOnto')).toBeUndefined()
    expect(findItem('gitTree.contextMenu.undoCommit')).toBeUndefined()
    expect(findItem('gitTree.contextMenu.fixup')).toBeUndefined()
    expect(findItem('gitTree.contextMenu.compareToWorkdir')).toBeUndefined()
  })

  it('onCheckout checks out the clicked commit', async () => {
    mocked.apiCheckoutBranch.mockResolvedValue(undefined)
    const { result } = renderHook(() => useGitGraphActions(baseParams()))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    await act(async () => getItem('gitTree.contextMenu.checkout').action!())
    expect(mocked.apiCheckoutBranch).toHaveBeenCalledWith(REPO, 'a')
  })

  it('onCherryPick delegates to the cherry-pick handler', async () => {
    mocked.apiCherryPickCommit.mockResolvedValue(undefined)
    const { result } = renderHook(() => useGitGraphActions(baseParams()))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    await act(async () => getItem('gitTree.contextMenu.cherryPick').action!())
    expect(mocked.apiCherryPickCommit).toHaveBeenCalledWith(REPO, 'a')
    expect(toastSuccess).toHaveBeenCalledWith('gitTree.contextMenu.cherryPicked')
  })
})

describe('useGitGraphActions — per-branch submenus', () => {
  const withBranches = commitNode('a', {
    refs: [
      { name: 'refs/heads/feat', shortName: 'feat', type: 'branch', commitOid: 'a' },
      { name: 'refs/heads/main', shortName: 'main', type: 'branch', commitOid: 'a' },
    ],
  })
  const withRemote = commitNode('a', {
    refs: [
      { name: 'refs/remotes/origin/main', shortName: 'origin/main', type: 'remote', commitOid: 'a' },
    ],
  })

  it('builds one submenu per branch sitting on the clicked commit', async () => {
    const { result } = renderHook(() => useGitGraphActions(baseParams({ nodes: [withBranches] })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    expect(getSubmenu('feat')).toBeDefined()
    expect(getSubmenu('main')).toBeDefined()
  })

  it('enables pull/push only on the current branch; others get the relationship actions', async () => {
    const { result } = renderHook(() => useGitGraphActions(baseParams({ nodes: [withBranches] })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))

    const main = normalizeMenuSpec(getSubmenu('main').items) // current branch
    expect(getItem('gitTree.branchMenu.pull', main).enabled).toBe(true)
    expect(findItem('gitTree.branchMenu.mergeInto', main)).toBeUndefined()
    expect(findItem('gitTree.branchMenu.delete', main)).toBeUndefined()

    const feat = normalizeMenuSpec(getSubmenu('feat').items)
    expect(getItem('gitTree.branchMenu.pull', feat).enabled).toBe(false)
    expect(findItem('gitTree.branchMenu.fastForward', feat)).toBeDefined()
    expect(findItem('gitTree.branchMenu.mergeInto', feat)).toBeDefined()
    expect(findItem('gitTree.branchMenu.rebaseOnto', feat)).toBeDefined()
    expect(findItem('gitTree.branchMenu.delete', feat)).toBeDefined()
  })

  it('onPull / onPush act on the current branch', async () => {
    mocked.apiPullBranch.mockResolvedValue(undefined)
    mocked.apiPushBranch.mockResolvedValue(undefined)
    const { result } = renderHook(() => useGitGraphActions(baseParams({ nodes: [withBranches] })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    const main = normalizeMenuSpec(getSubmenu('main').items)
    await act(async () => getItem('gitTree.branchMenu.pull', main).action!())
    expect(mocked.apiPullBranch).toHaveBeenCalledWith(REPO)
    await act(async () => getItem('gitTree.branchMenu.push', main).action!())
    expect(mocked.apiPushBranch).toHaveBeenCalledWith(REPO)
  })

  it('onMergeInto merges the branch into the current branch', async () => {
    mocked.apiMergeBranch.mockResolvedValue(undefined)
    const { result } = renderHook(() => useGitGraphActions(baseParams({ nodes: [withBranches] })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    const feat = normalizeMenuSpec(getSubmenu('feat').items)
    await act(async () => getItem('gitTree.branchMenu.mergeInto', feat).action!())
    expect(mocked.apiMergeBranch).toHaveBeenCalledWith(REPO, 'feat', 'main')
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['branches', REPO] })
  })

  it('onFastForward fast-forwards the current branch to the target branch', async () => {
    mocked.apiFastForwardBranch.mockResolvedValue(undefined)
    const { result } = renderHook(() => useGitGraphActions(baseParams({ nodes: [withBranches] })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    const feat = normalizeMenuSpec(getSubmenu('feat').items)
    await act(async () => getItem('gitTree.branchMenu.fastForward', feat).action!())
    expect(mocked.apiFastForwardBranch).toHaveBeenCalledWith(REPO, 'feat', 'main')
  })

  it('onDeleteBranch deletes the branch pinned to its commit', async () => {
    mocked.apiDeleteBranch.mockResolvedValue(undefined)
    const { result } = renderHook(() => useGitGraphActions(baseParams({ nodes: [withBranches] })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    const feat = normalizeMenuSpec(getSubmenu('feat').items)
    await act(async () => getItem('gitTree.branchMenu.delete', feat).action!())
    expect(mocked.apiDeleteBranch).toHaveBeenCalledWith(REPO, 'feat', { targetOid: 'a' })
  })

  it('onCopyBranchName copies the branch name', async () => {
    const { result } = renderHook(() => useGitGraphActions(baseParams({ nodes: [withBranches] })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    const feat = normalizeMenuSpec(getSubmenu('feat').items)
    await act(async () => getItem('gitTree.branchMenu.copyName', feat).action!())
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('feat')
    expect(toastSuccess).toHaveBeenCalledWith('gitTree.branchMenu.nameCopied')
  })

  it('onPinToLeft pins the branch in the pinned-branches store (real interop)', async () => {
    const { result } = renderHook(() => useGitGraphActions(baseParams({ nodes: [withBranches] })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    const feat = normalizeMenuSpec(getSubmenu('feat').items)
    act(() => getItem('gitTree.branchMenu.pinToLeft', feat).action!())
    expect(usePinnedBranchesStore.getState().overrides[REPO]).toEqual({ feat: true })
    expect(toastSuccess).toHaveBeenCalledWith(expect.stringContaining('branchMenu.pinned'))
  })

  it('a single remote branch flattens inline: branch-link copy works, Delete stays disabled', async () => {
    mocked.apiGetBranchWebUrl.mockResolvedValue('https://github.com/o/r/tree/main')
    const { result } = renderHook(() => useGitGraphActions(baseParams({ nodes: [withRemote] })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    // Single branch ⇒ no submenu — the branch items sit at the top level of the commit menu.
    expect(lastSpec().some((n) => n.kind === 'submenu' && n.text === 'origin/main')).toBe(false)
    expect(getItem('gitTree.branchMenu.delete').enabled).toBe(false)
    await act(async () => getItem('gitTree.branchMenu.copyBranchLink').action!())
    expect(mocked.apiGetBranchWebUrl).toHaveBeenCalledWith(REPO, 'main')
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://github.com/o/r/tree/main')
  })

  it('a local main tip exposes "Copy link to branch" wired to its remote counterpart', async () => {
    mocked.apiGetBranchWebUrl.mockResolvedValue('https://github.com/o/r/tree/main')
    const mainTip = commitNode('a', {
      refs: [
        { name: 'refs/heads/main', shortName: 'main', type: 'branch', commitOid: 'a' },
        { name: 'refs/remotes/origin/main', shortName: 'origin/main', type: 'remote', commitOid: 'a' },
      ],
    })
    const { result } = renderHook(() =>
      useGitGraphActions(baseParams({ nodes: [mainTip], currentBranch: 'feat' }))
    )
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    // Flattened to local main (no submenu), with the main-only branch link.
    expect(lastSpec().some((n) => n.kind === 'submenu' && n.text === 'main')).toBe(false)
    const link = getItem('gitTree.branchMenu.copyBranchLink')
    expect(link.text).toContain('origin/main')
    await act(async () => link.action!())
    expect(mocked.apiGetBranchWebUrl).toHaveBeenCalledWith(REPO, 'main')
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://github.com/o/r/tree/main')
  })

  it('a single local branch flattens inline and Rename opens the rename dialog', async () => {
    const oneBranch = commitNode('a', {
      refs: [{ name: 'refs/heads/feat', shortName: 'feat', type: 'branch', commitOid: 'a' }],
    })
    const { result } = renderHook(() => useGitGraphActions(baseParams({ nodes: [oneBranch] })))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    expect(lastSpec().some((n) => n.kind === 'submenu' && n.text === 'feat')).toBe(false)
    act(() => getItem('gitTree.branchMenu.rename').action!())
    expect(result.current.pendingAction).toEqual({ kind: 'renameBranch', branch: 'feat' })
  })

  it('builds no branch submenu for a multi-selection', async () => {
    const { result } = renderHook(() =>
      useGitGraphActions(baseParams({ nodes: [withBranches], selected: new Set(['a', 'b']) }))
    )
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    expect(lastSpec().some((n) => n.kind === 'submenu' && n.text === 'feat')).toBe(false)
  })

  it('a non-tip commit on the current branch flattens to the current-branch menu', async () => {
    // Tip node carries `main`; the clicked ancestor `old` carries no ref of its own.
    const tip = commitNode('tip', {
      refs: [{ name: 'refs/heads/main', shortName: 'main', type: 'branch', commitOid: 'tip' }],
    })
    const old = commitNode('old')
    const { result } = renderHook(() =>
      useGitGraphActions(baseParams({ nodes: [tip, old], currentBranch: 'main' }))
    )
    await act(async () => result.current.openMenuAt(clickEvent(), 'old'))
    expect(lastSpec().some((n) => n.kind === 'submenu' && n.text === 'main')).toBe(false)
    // Current-branch actions surface, keyed to the current branch, on a commit with no label.
    expect(getItem('gitTree.branchMenu.pull').enabled).toBe(true)
    expect(findItem('gitTree.branchMenu.rename')).toBeDefined()
    // Reset still targets the clicked commit (commit-scoped).
    const reset = getSubmenu('gitTree.contextMenu.resetSubmenu')
    act(() => getItem('gitTree.contextMenu.resetSoft', normalizeMenuSpec(reset.items)).action!())
    expect(result.current.pendingAction).toEqual({ kind: 'reset', mode: 'soft' })
  })

  it('keeps the bare no-branch menu when a label-less commit is not on any loaded branch', async () => {
    // No node carries the current branch tip ⇒ no current-branch ref ⇒ the plain commit menu.
    const { result } = renderHook(() =>
      useGitGraphActions(baseParams({ nodes: [commitNode('a')], currentBranch: 'main' }))
    )
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    expect(findItem('gitTree.branchMenu.pull')).toBeUndefined()
    expect(getItem('gitTree.contextMenu.copySha')).toBeDefined()
  })
})

describe('useGitGraphActions — openMenuAt: multi-selection', () => {
  // newest-first order in the graph: [c, b, a] ⇒ oldest-first is [a, b, c].
  const nodes = [commitNode('c'), commitNode('b'), commitNode('a')]

  function multi(over: Partial<Parameters<typeof useGitGraphActions>[0]> = {}) {
    return baseParams({ nodes, selected: new Set(['a', 'b', 'c']), ...over })
  }

  it('opens the multi-selection menu (no branch submenu, no single-only header)', async () => {
    const { result } = renderHook(() => useGitGraphActions(multi()))
    await act(async () => result.current.openMenuAt(clickEvent(), 'b'))
    expect(lastSpec().some((n) => n.kind === 'header')).toBe(false)
    expect(getItem('gitTree.contextMenu.cherryPickMany').text).toContain('"count":3')
  })

  it('cherry-picks every selected commit oldest→newest', async () => {
    mocked.apiCherryPickCommit.mockResolvedValue(undefined)
    const { result } = renderHook(() => useGitGraphActions(multi()))
    await act(async () => result.current.openMenuAt(clickEvent(), 'b'))
    await act(async () => getItem('gitTree.contextMenu.cherryPickMany').action!())
    expect(mocked.apiCherryPickCommit.mock.calls.map((c) => c[1])).toEqual(['a', 'b', 'c'])
    expect(toastSuccess).toHaveBeenCalledWith('gitTree.contextMenu.cherryPicked')
  })

  it('writes a single patch spanning the selection (oldest→newest) to the chosen path', async () => {
    dialogSave.mockResolvedValue('/dest/range.patch')
    mocked.apiCreateCommitsPatch.mockResolvedValue(undefined)
    const { result } = renderHook(() => useGitGraphActions(multi()))
    await act(async () => result.current.openMenuAt(clickEvent(), 'b'))
    await act(async () => getItem('gitTree.contextMenu.createPatchMany').action!())
    expect(mocked.apiCreateCommitsPatch).toHaveBeenCalledWith(REPO, ['a', 'b', 'c'], '/dest/range.patch')
  })

  it('rebases the current branch onto the primary (right-clicked) commit', async () => {
    mocked.apiRebaseOntoCommit.mockResolvedValue(undefined)
    const { result } = renderHook(() => useGitGraphActions(multi()))
    await act(async () => result.current.openMenuAt(clickEvent(), 'b'))
    await act(async () => getItem('gitTree.contextMenu.rebaseOntoCommit').action!())
    expect(mocked.apiRebaseOntoCommit).toHaveBeenCalledWith(REPO, 'b')
  })

  it('routes reset and compare to the primary commit dialogs', async () => {
    const { result } = renderHook(() => useGitGraphActions(multi()))
    await act(async () => result.current.openMenuAt(clickEvent(), 'b'))
    act(() => getItem('gitTree.contextMenu.compareToWorkdir').action!())
    expect(result.current.pendingAction).toEqual({ kind: 'compare' })
    const reset = getSubmenu('gitTree.contextMenu.resetSubmenu')
    act(() => getItem('gitTree.contextMenu.resetHard', normalizeMenuSpec(reset.items)).action!())
    expect(result.current.pendingAction).toEqual({ kind: 'reset', mode: 'hard' })
  })
})

describe('useGitGraphActions — dialogs', () => {
  it('the worktree item cancels quietly when the user closes the picker', async () => {
    dialogOpen.mockResolvedValue(null)
    const { result } = renderHook(() => useGitGraphActions(baseParams()))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    await act(async () => getItem('gitTree.contextMenu.createWorktree').action!())
    expect(mockedAddWorktree).not.toHaveBeenCalled()
  })

  it('the worktree item adds the worktree at the chosen path', async () => {
    dialogOpen.mockResolvedValue('/dest')
    mockedAddWorktree.mockResolvedValue(undefined)
    const { result } = renderHook(() => useGitGraphActions(baseParams()))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    await act(async () => getItem('gitTree.contextMenu.createWorktree').action!())
    expect(mockedAddWorktree).toHaveBeenCalledWith(REPO, 'a', '/dest')
    expect(toastSuccess).toHaveBeenCalledWith('gitTree.contextMenu.worktreeCreated')
  })

  it('the patch item cancels quietly without a destination', async () => {
    dialogSave.mockResolvedValue(null)
    const { result } = renderHook(() => useGitGraphActions(baseParams()))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    await act(async () => getItem('gitTree.contextMenu.createPatch').action!())
    expect(mocked.apiCreatePatch).not.toHaveBeenCalled()
  })

  it('the patch item writes the patch to the chosen destination', async () => {
    dialogSave.mockResolvedValue('/dest/patch.patch')
    mocked.apiCreatePatch.mockResolvedValue(undefined)
    const { result } = renderHook(() => useGitGraphActions(baseParams()))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    await act(async () => getItem('gitTree.contextMenu.createPatch').action!())
    expect(mocked.apiCreatePatch).toHaveBeenCalledWith(REPO, 'a', '/dest/patch.patch')
  })
})

describe('useGitGraphActions — copy web link', () => {
  it('toasts an error when there is no remote link', async () => {
    mocked.apiGetCommitWebUrl.mockResolvedValue(null)
    const { result } = renderHook(() => useGitGraphActions(baseParams()))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    await act(async () => getItem('gitTree.contextMenu.copyLink').action!())
    expect(toastError).toHaveBeenCalledWith('gitTree.contextMenu.noRemoteLink')
  })

  it('copies the commit web URL to the clipboard', async () => {
    mocked.apiGetCommitWebUrl.mockResolvedValue('https://github.com/org/repo/commit/a')
    const { result } = renderHook(() => useGitGraphActions(baseParams()))
    await act(async () => result.current.openMenuAt(clickEvent(), 'a'))
    await act(async () => getItem('gitTree.contextMenu.copyLink').action!())
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'https://github.com/org/repo/commit/a'
    )
    expect(toastSuccess).toHaveBeenCalledWith('gitTree.contextMenu.linkCopied')
  })
})

describe('useGitGraphActions — fixup window', () => {
  // The fixup item left the context menu; the window remains reachable through the command
  // palette bridge, which calls `openFixupWindow` directly.
  it('focuses an existing fixup window instead of creating a new one', async () => {
    const show = vi.fn().mockResolvedValue(undefined)
    const setFocus = vi.fn().mockResolvedValue(undefined)
    webviewGetByLabel.mockResolvedValue({ show, setFocus })

    const { result } = renderHook(() => useGitGraphActions(baseParams()))
    await act(async () => result.current.openFixupWindow('a'))
    await waitFor(() => expect(show).toHaveBeenCalledOnce())

    expect(setFocus).toHaveBeenCalledOnce()
    expect(WebviewWindowCtor).not.toHaveBeenCalled()
  })

  it('creates a new fixup window when none exists yet', async () => {
    webviewGetByLabel.mockResolvedValue(null)

    const { result } = renderHook(() => useGitGraphActions(baseParams()))
    await act(async () => result.current.openFixupWindow('a'))
    await waitFor(() => expect(WebviewWindowCtor).toHaveBeenCalledOnce())
  })
})
