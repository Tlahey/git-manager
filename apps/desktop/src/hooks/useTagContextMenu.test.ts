import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { GitRef } from '@git-manager/git-types'
import { normalizeMenuSpec, type MenuSpecNode } from '../lib/nativeMenuSpec'

const invalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries }) }))

const dialogOpen = vi.fn()
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: (...a: unknown[]) => dialogOpen(...a) }))

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
  apiCheckoutBranch: vi.fn().mockResolvedValue(undefined),
  apiCherryPickCommit: vi.fn().mockResolvedValue('newoid'),
  apiMergeBranch: vi.fn().mockResolvedValue(undefined),
  apiRebaseOntoCommit: vi.fn().mockResolvedValue(undefined),
  apiDeleteTag: vi.fn().mockResolvedValue(undefined),
  apiGetTagWebUrl: vi.fn().mockResolvedValue('https://github.com/o/r/releases/tag/v1'),
}))
vi.mock('../api/worktree.api', () => ({ apiAddWorktree: vi.fn().mockResolvedValue(undefined) }))

const openRebaseWindow = vi.fn().mockResolvedValue(undefined)
vi.mock('../lib/graphWindows', () => ({
  openRebaseWindow: (...a: unknown[]) => openRebaseWindow(...a),
}))

import * as gitApi from '../api/git.api'
import { useTagContextMenu } from './useTagContextMenu'

const mocked = gitApi as unknown as Record<string, ReturnType<typeof vi.fn>>

const t = (key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}:${JSON.stringify(opts)}` : key
const REPO = '/repo'

const TAG: GitRef = { name: 'refs/tags/v1', shortName: 'v1', type: 'tag', commitOid: 'abc1234def' }

function fakeEvent() {
  return { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as React.MouseEvent
}

function setup(params: Partial<Parameters<typeof useTagContextMenu>[0]> = {}) {
  const selectCommit = vi.fn()
  const setPendingCommitAction = vi.fn()
  const view = renderHook(() =>
    useTagContextMenu({
      repoPath: REPO,
      currentBranch: 'main',
      isDetached: false,
      selectCommit,
      setPendingCommitAction,
      t,
      ...params,
    })
  )
  return { ...view, selectCommit, setPendingCommitAction }
}

// The tag menu is a declarative spec handed to showNativeMenu; `t` is faked to return keys, so
// address items by their key prefix and read `enabled` / fire `action`.
type ItemNode = Extract<MenuSpecNode, { kind: 'item' }>
function lastSpec(): MenuSpecNode[] {
  const calls = showNativeMenu.mock.calls
  return normalizeMenuSpec(calls[calls.length - 1][0])
}
function flatten(nodes: MenuSpecNode[]): MenuSpecNode[] {
  return nodes.flatMap((n) =>
    n.kind === 'submenu' ? [n, ...flatten(normalizeMenuSpec(n.items))] : [n]
  )
}
function getItem(prefix: string): ItemNode {
  const found = flatten(lastSpec()).find(
    (n): n is ItemNode => n.kind === 'item' && n.text.startsWith(prefix)
  )
  expect(found, `menu item "${prefix}"`).toBeDefined()
  return found as ItemNode
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
})

describe('useTagContextMenu', () => {
  it('selects the tag commit and pops the native menu on openTagMenu', () => {
    const { result, selectCommit } = setup()
    const e = fakeEvent()
    act(() => result.current.openTagMenu(e, TAG))
    expect(e.preventDefault).toHaveBeenCalled()
    expect(e.stopPropagation).toHaveBeenCalled()
    expect(selectCommit).toHaveBeenCalledWith(TAG.commitOid)
    expect(showNativeMenu).toHaveBeenCalledOnce()
  })

  it('disables the relationship actions when HEAD is detached', () => {
    const { result } = setup({ currentBranch: null, isDetached: true })
    act(() => result.current.openTagMenu(fakeEvent(), TAG))
    expect(getItem('gitTree.tagMenu.merge').enabled).toBe(false)
  })

  it('routes commit dialog actions through setPendingCommitAction', () => {
    const { result, setPendingCommitAction } = setup()
    act(() => result.current.openTagMenu(fakeEvent(), TAG))
    act(() => getItem('gitTree.contextMenu.createBranch').action!())
    act(() => getItem('gitTree.contextMenu.revert').action!())
    expect(setPendingCommitAction).toHaveBeenCalledWith({ kind: 'branch' })
    expect(setPendingCommitAction).toHaveBeenCalledWith({ kind: 'revert' })
  })

  it('merges the tag into the current branch', async () => {
    const { result } = setup()
    act(() => result.current.openTagMenu(fakeEvent(), TAG))
    await act(async () => getItem('gitTree.tagMenu.merge').action!())
    await waitFor(() => expect(mocked.apiMergeBranch).toHaveBeenCalledWith(REPO, 'v1', 'main'))
  })

  it('rebases the current branch onto the tag commit', async () => {
    const { result } = setup()
    act(() => result.current.openTagMenu(fakeEvent(), TAG))
    await act(async () => getItem('gitTree.tagMenu.rebase').action!())
    await waitFor(() =>
      expect(mocked.apiRebaseOntoCommit).toHaveBeenCalledWith(REPO, TAG.commitOid)
    )
  })

  it('deletes the tag locally with its commit oid for undo pinning', async () => {
    const { result } = setup()
    act(() => result.current.openTagMenu(fakeEvent(), TAG))
    await act(async () => getItem('gitTree.tagMenu.deleteLocal').action!())
    await waitFor(() =>
      expect(mocked.apiDeleteTag).toHaveBeenCalledWith(REPO, 'v1', { targetOid: TAG.commitOid })
    )
  })

  it('opens the remote-delete confirmation via pendingTagAction', () => {
    const { result } = setup()
    act(() => result.current.openTagMenu(fakeEvent(), TAG))
    act(() => getItem('gitTree.tagMenu.deleteRemote').action!())
    expect(result.current.pendingTagAction).toEqual({
      kind: 'deleteRemote',
      tagName: 'v1',
      oid: TAG.commitOid,
      remote: 'origin',
    })
  })

  it('opens the annotate dialog via pendingTagAction', () => {
    const { result } = setup()
    act(() => result.current.openTagMenu(fakeEvent(), TAG))
    act(() => getItem('gitTree.tagMenu.annotate').action!())
    expect(result.current.pendingTagAction).toMatchObject({ kind: 'annotate', tagName: 'v1' })
  })

  it('copies the tag name to the clipboard', async () => {
    const { result } = setup()
    act(() => result.current.openTagMenu(fakeEvent(), TAG))
    await act(async () => getItem('gitTree.tagMenu.copyName').action!())
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('v1'))
  })

  it('copies the tag web link, warning when no remote URL is available', async () => {
    mocked.apiGetTagWebUrl.mockResolvedValueOnce(null)
    const { result } = setup()
    act(() => result.current.openTagMenu(fakeEvent(), TAG))
    await act(async () => getItem('gitTree.tagMenu.copyLink').action!())
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
  })
})
