import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorktreeSnapshot } from '../lib/tauri'
import type { GitBranch, GitStash, RebaseState } from '@git-manager/git-types'
import { useUndoHistoryStore } from '../stores/undoHistory.store'

vi.mock('../lib/tauri', async () => {
  const actual = await vi.importActual<typeof import('../lib/tauri')>('../lib/tauri')
  return {
    ...actual,
    getBranches: vi.fn(),
    createCommit: vi.fn(),
    discardFileChanges: vi.fn(),
    createFixupCommit: vi.fn(),
    runAutosquash: vi.fn(),
    revertCommit: vi.fn(),
    resetToCommit: vi.fn(),
    cherryPickCommit: vi.fn(),
    rebaseOntoCommit: vi.fn(),
    runInteractiveRebase: vi.fn(),
    continueRebase: vi.fn(),
    abortRebase: vi.fn(),
    skipRebase: vi.fn(),
    getRebaseState: vi.fn(),
    stashPush: vi.fn(),
    stashPop: vi.fn(),
    stashApply: vi.fn(),
    stashDrop: vi.fn(),
    stashList: vi.fn(),
    checkoutBranch: vi.fn(),
    deleteBranch: vi.fn(),
    getRemotes: vi.fn(),
    removeRemote: vi.fn(),
    pinObject: vi.fn(),
    snapshotWorktree: vi.fn(),
    snapshotWorktreeAlways: vi.fn(),
    unpinObject: vi.fn(),
    objectsExist: vi.fn(),
  }
})

import * as tauri from '../lib/tauri'
import * as api from './git.api'

const mocked = tauri as unknown as Record<string, ReturnType<typeof vi.fn>>

function headBranch(commitOid: string): GitBranch[] {
  return [
    {
      name: 'main',
      shortName: 'main',
      isHead: true,
      isRemote: false,
      commitOid,
      commitMessage: 'msg',
      commitTimestamp: 0,
      aheadCount: 0,
      behindCount: 0,
    },
  ]
}

function snapshot(suffix = ''): WorktreeSnapshot {
  return {
    indexTreeOid: `idx-${suffix}`,
    workdirTreeOid: `wd-${suffix}`,
    indexRefName: `refs/git-manager/undo/idx${suffix}`,
    workdirRefName: `refs/git-manager/undo/wd${suffix}`,
  }
}

function stash(overrides: Partial<GitStash> = {}): GitStash {
  return {
    index: 0,
    message: 'WIP',
    branch: 'main',
    commitOid: 'stash-oid',
    timestamp: 0,
    filesCount: 1,
    additions: 1,
    deletions: 0,
    ...overrides,
  }
}

function rebaseState(kind: RebaseState['kind']): RebaseState {
  return { kind }
}

let pathCounter = 0
/** Fresh repo path per test so module-level rebase-pending state never leaks across tests. */
function freshPath() {
  return `/repo-${++pathCounter}`
}

beforeEach(() => {
  vi.clearAllMocks()
  useUndoHistoryStore.setState({ byRepo: {} })
  // pinObject calls are always chained with `.catch(() => {})` — needs a real promise by default.
  mocked.pinObject.mockResolvedValue(undefined)
})

function historyOf(path: string) {
  return useUndoHistoryStore.getState().byRepo[path]
}

describe('apiCreateCommit', () => {
  it('pushes a commit undo entry with the pre-commit HEAD and pins the new commit', async () => {
    const path = freshPath()
    mocked.getBranches.mockResolvedValue(headBranch('prev-sha'))
    mocked.createCommit.mockResolvedValue({ oid: 'new-sha', shortOid: 'new-sh' })

    await api.apiCreateCommit(path, 'msg')

    const entry = historyOf(path).stack[0]
    expect(entry).toMatchObject({ type: 'commit', previousOid: 'prev-sha', newOid: 'new-sha' })
    expect(mocked.pinObject).toHaveBeenCalledWith(path, entry.id, 'new-sha')
  })

  it('amend clears redo instead of pushing an entry', async () => {
    const path = freshPath()
    mocked.createCommit.mockResolvedValue({ oid: 'amended-sha', shortOid: 'amended' })

    await api.apiCreateCommit(path, 'msg', true, 'old-sha')

    expect(historyOf(path)).toBeUndefined()
    expect(mocked.getBranches).not.toHaveBeenCalled()
  })
})

describe('apiDiscardFileChanges', () => {
  it('pushes a discard entry and pins the snapshot blob when one was captured', async () => {
    const path = freshPath()
    mocked.discardFileChanges.mockResolvedValue({
      snapshotBlobOid: 'blob-1',
      wasUntracked: false,
      wasStaged: true,
    })

    await api.apiDiscardFileChanges(path, 'file.ts')

    const entry = historyOf(path).stack[0]
    expect(entry).toMatchObject({
      type: 'discard',
      filePath: 'file.ts',
      blobOid: 'blob-1',
      wasStaged: true,
    })
    expect(mocked.pinObject).toHaveBeenCalledWith(path, entry.id, 'blob-1')
  })

  it('clears redo instead when there is no snapshot to restore', async () => {
    const path = freshPath()
    mocked.discardFileChanges.mockResolvedValue({
      snapshotBlobOid: null,
      wasUntracked: true,
      wasStaged: false,
    })

    await api.apiDiscardFileChanges(path, 'file.ts')

    expect(historyOf(path)).toBeUndefined()
  })
})

describe('apiCreateFixupCommit', () => {
  it('pushes a fixup entry pinned to the new commit', async () => {
    const path = freshPath()
    mocked.getBranches.mockResolvedValue(headBranch('prev-sha'))
    mocked.createFixupCommit.mockResolvedValue({ oid: 'fixup-sha', shortOid: 'fixup-s' })

    await api.apiCreateFixupCommit(path, 'target-sha')

    const entry = historyOf(path).stack[0]
    expect(entry).toMatchObject({ type: 'fixup', previousOid: 'prev-sha', newOid: 'fixup-sha' })
    expect(mocked.pinObject).toHaveBeenCalledWith(path, entry.id, 'fixup-sha')
  })
})

describe('apiRunAutosquash', () => {
  it('pushes an autosquash entry pinning both ends when the rebase completes immediately', async () => {
    const path = freshPath()
    mocked.getBranches.mockResolvedValueOnce(headBranch('prev-sha'))
    mocked.runAutosquash.mockResolvedValue(undefined)
    mocked.getRebaseState.mockResolvedValue(rebaseState('idle'))
    mocked.getBranches.mockResolvedValueOnce(headBranch('new-sha'))

    await api.apiRunAutosquash(path)

    const entry = historyOf(path).stack[0]
    expect(entry).toMatchObject({ type: 'autosquash', previousOid: 'prev-sha', newOid: 'new-sha' })
    expect(mocked.pinObject).toHaveBeenCalledWith(path, `${entry.id}-previous`, 'prev-sha')
    expect(mocked.pinObject).toHaveBeenCalledWith(path, `${entry.id}-new`, 'new-sha')
  })

  it('records nothing yet when the rebase pauses on a conflict', async () => {
    const path = freshPath()
    mocked.getBranches.mockResolvedValue(headBranch('prev-sha'))
    mocked.runAutosquash.mockResolvedValue(undefined)
    mocked.getRebaseState.mockResolvedValue(rebaseState('conflict'))

    await api.apiRunAutosquash(path)

    expect(historyOf(path)).toBeUndefined()
    // getBranches was only queried once (for previousOid) — settleRebaseUndo bailed before
    // fetching the post-rebase HEAD because the rebase hasn't settled yet.
    expect(mocked.getBranches).toHaveBeenCalledTimes(1)
  })

  it('finishes recording the entry once a later Continue settles the paused rebase', async () => {
    const path = freshPath()
    mocked.getBranches.mockResolvedValueOnce(headBranch('prev-sha'))
    mocked.runAutosquash.mockResolvedValue(undefined)
    mocked.getRebaseState.mockResolvedValueOnce(rebaseState('conflict'))
    await api.apiRunAutosquash(path)
    expect(historyOf(path)).toBeUndefined()

    mocked.continueRebase.mockResolvedValue(undefined)
    mocked.getRebaseState.mockResolvedValueOnce(rebaseState('idle'))
    mocked.getBranches.mockResolvedValueOnce(headBranch('new-sha'))
    await api.apiRebaseContinue(path)

    const entry = historyOf(path).stack[0]
    expect(entry).toMatchObject({ type: 'autosquash', previousOid: 'prev-sha', newOid: 'new-sha' })
  })
})

describe('apiRunInteractiveRebase', () => {
  it('pushes an interactiveRebase entry when it completes immediately', async () => {
    const path = freshPath()
    mocked.getBranches.mockResolvedValueOnce(headBranch('prev-sha'))
    mocked.runInteractiveRebase.mockResolvedValue(undefined)
    mocked.getRebaseState.mockResolvedValue(rebaseState('idle'))
    mocked.getBranches.mockResolvedValueOnce(headBranch('new-sha'))

    await api.apiRunInteractiveRebase(path, 'base-sha', [])

    const entry = historyOf(path).stack[0]
    expect(entry).toMatchObject({
      type: 'interactiveRebase',
      previousOid: 'prev-sha',
      newOid: 'new-sha',
    })
  })

  it('records nothing yet when it pauses on a conflict', async () => {
    const path = freshPath()
    mocked.getBranches.mockResolvedValue(headBranch('prev-sha'))
    mocked.runInteractiveRebase.mockResolvedValue(undefined)
    mocked.getRebaseState.mockResolvedValue(rebaseState('edit_pause'))

    await api.apiRunInteractiveRebase(path, 'base-sha', [])

    expect(historyOf(path)).toBeUndefined()
  })

  it('finishes recording once a later Skip settles the paused rebase', async () => {
    const path = freshPath()
    mocked.getBranches.mockResolvedValueOnce(headBranch('prev-sha'))
    mocked.runInteractiveRebase.mockResolvedValue(undefined)
    mocked.getRebaseState.mockResolvedValueOnce(rebaseState('conflict'))
    await api.apiRunInteractiveRebase(path, 'base-sha', [])
    expect(historyOf(path)).toBeUndefined()

    mocked.skipRebase.mockResolvedValue(undefined)
    mocked.getRebaseState.mockResolvedValueOnce(rebaseState('idle'))
    mocked.getBranches.mockResolvedValueOnce(headBranch('new-sha'))
    await api.apiRebaseSkip(path)

    const entry = historyOf(path).stack[0]
    expect(entry).toMatchObject({
      type: 'interactiveRebase',
      previousOid: 'prev-sha',
      newOid: 'new-sha',
    })
  })

  it('apiRebaseAbort forgets the pending rebase so a later settle records nothing', async () => {
    const path = freshPath()
    mocked.getBranches.mockResolvedValue(headBranch('prev-sha'))
    mocked.runInteractiveRebase.mockResolvedValue(undefined)
    mocked.getRebaseState.mockResolvedValue(rebaseState('conflict'))
    await api.apiRunInteractiveRebase(path, 'base-sha', [])

    mocked.abortRebase.mockResolvedValue(undefined)
    await api.apiRebaseAbort(path)

    // Even if something later calls continue/skip on a *new* rebase against a stale idle
    // state, there is no leftover pending previousOid to (mis)report an undo entry for.
    mocked.getRebaseState.mockResolvedValueOnce(rebaseState('idle'))
    mocked.continueRebase.mockResolvedValue(undefined)
    await api.apiRebaseContinue(path)

    expect(historyOf(path)).toBeUndefined()
  })
})

describe('clearRedo-only actions', () => {
  async function withPriorRedoTail(path: string) {
    mocked.getBranches.mockResolvedValue(headBranch('prev-sha'))
    mocked.createCommit.mockResolvedValue({ oid: 'sha-1', shortOid: 'sha-1' })
    await api.apiCreateCommit(path, 'first')
    await useUndoHistoryStore.getState().undo(path)
    expect(useUndoHistoryStore.getState().canRedo(path)).toBe(true)
  }

  it('apiRevertCommit clears the redo tail', async () => {
    const path = freshPath()
    await withPriorRedoTail(path)
    mocked.revertCommit.mockResolvedValue(undefined)

    await api.apiRevertCommit(path, 'some-sha')

    expect(useUndoHistoryStore.getState().canRedo(path)).toBe(false)
  })

  it('apiCherryPickCommit clears the redo tail', async () => {
    const path = freshPath()
    await withPriorRedoTail(path)
    mocked.cherryPickCommit.mockResolvedValue(undefined)

    await api.apiCherryPickCommit(path, 'some-sha')

    expect(useUndoHistoryStore.getState().canRedo(path)).toBe(false)
  })

  it('apiRebaseOntoCommit clears the redo tail', async () => {
    const path = freshPath()
    await withPriorRedoTail(path)
    mocked.rebaseOntoCommit.mockResolvedValue(undefined)

    await api.apiRebaseOntoCommit(path, 'some-sha')

    expect(useUndoHistoryStore.getState().canRedo(path)).toBe(false)
  })
})

describe('apiResetToCommit', () => {
  it('pushes a reset entry and pins previous+target separately', async () => {
    const path = freshPath()
    mocked.getBranches.mockResolvedValue(headBranch('prev-sha'))
    mocked.resetToCommit.mockResolvedValue(undefined)

    await api.apiResetToCommit(path, 'target-sha', 'mixed')

    const entry = historyOf(path).stack[0]
    expect(entry).toMatchObject({
      type: 'reset',
      previousOid: 'prev-sha',
      targetOid: 'target-sha',
      mode: 'mixed',
    })
    expect(mocked.pinObject).toHaveBeenCalledWith(path, `${entry.id}-previous`, 'prev-sha')
    expect(mocked.pinObject).toHaveBeenCalledWith(path, `${entry.id}-target`, 'target-sha')
  })

  it('hard reset also snapshots the worktree and pins its refs', async () => {
    const path = freshPath()
    mocked.getBranches.mockResolvedValue(headBranch('prev-sha'))
    mocked.resetToCommit.mockResolvedValue(undefined)
    mocked.snapshotWorktree.mockResolvedValue(snapshot('reset'))

    await api.apiResetToCommit(path, 'target-sha', 'hard')

    const entry = historyOf(path).stack[0]
    expect(entry.pinnedRefs).toEqual(
      expect.arrayContaining(['refs/git-manager/undo/idxreset', 'refs/git-manager/undo/wdreset'])
    )
  })
})

describe('stash actions', () => {
  it('apiStashPush always pushes a stashPush entry', async () => {
    const path = freshPath()
    mocked.stashPush.mockResolvedValue(undefined)

    await api.apiStashPush(path, 'my wip', true)

    expect(historyOf(path).stack[0]).toMatchObject({
      type: 'stashPush',
      message: 'my wip',
      includeUntracked: true,
    })
  })

  it('apiStashPop pushes a stashPop entry pinning the stash commit and pre-pop snapshot', async () => {
    const path = freshPath()
    mocked.stashList.mockResolvedValue([stash({ index: 0, commitOid: 'stash-0' })])
    mocked.snapshotWorktreeAlways.mockResolvedValue(snapshot('pop'))
    mocked.stashPop.mockResolvedValue(undefined)

    await api.apiStashPop(path, 0)

    const entry = historyOf(path).stack[0]
    expect(entry).toMatchObject({ type: 'stashPop', commitOid: 'stash-0' })
    expect(entry.pinnedRefs).toEqual(
      expect.arrayContaining([
        `${entry.id}-stash`,
        'refs/git-manager/undo/idxpop',
        'refs/git-manager/undo/wdpop',
      ])
    )
  })

  it('apiStashPop clears redo when the target index no longer exists', async () => {
    const path = freshPath()
    mocked.stashList.mockResolvedValue([])
    mocked.snapshotWorktreeAlways.mockResolvedValue(snapshot('pop2'))
    mocked.stashPop.mockResolvedValue(undefined)

    await api.apiStashPop(path, 3)

    expect(historyOf(path)).toBeUndefined()
  })

  it('apiStashApply pushes a stashApply entry with the pre-apply snapshot', async () => {
    const path = freshPath()
    mocked.snapshotWorktreeAlways.mockResolvedValue(snapshot('apply'))
    mocked.stashApply.mockResolvedValue(undefined)

    await api.apiStashApply(path, 1)

    expect(historyOf(path).stack[0]).toMatchObject({ type: 'stashApply', index: 1 })
  })

  it('apiStashDrop pushes a stashDrop entry pinning the dropped commit', async () => {
    const path = freshPath()
    mocked.stashList.mockResolvedValue([
      stash({ index: 2, commitOid: 'stash-2', message: 'drop me' }),
    ])
    mocked.stashDrop.mockResolvedValue(undefined)

    await api.apiStashDrop(path, 2)

    const entry = historyOf(path).stack[0]
    expect(entry).toMatchObject({ type: 'stashDrop', commitOid: 'stash-2', message: 'drop me' })
    expect(mocked.pinObject).toHaveBeenCalledWith(path, entry.id, 'stash-2')
  })

  it('apiStashDrop clears redo when the target index no longer exists', async () => {
    const path = freshPath()
    mocked.stashList.mockResolvedValue([])
    mocked.stashDrop.mockResolvedValue(undefined)

    await api.apiStashDrop(path, 5)

    expect(historyOf(path)).toBeUndefined()
  })
})

describe('apiCheckoutBranch', () => {
  it('pushes a checkout entry with the from/to refs when opts are given', async () => {
    const path = freshPath()
    mocked.checkoutBranch.mockResolvedValue(undefined)

    await api.apiCheckoutBranch(path, 'feat', { fromRef: 'main', fromDetached: false })

    expect(historyOf(path).stack[0]).toMatchObject({
      type: 'checkout',
      fromRef: 'main',
      toRef: 'feat',
      force: false,
    })
  })

  it('force checkout snapshots the worktree first and pins it', async () => {
    const path = freshPath()
    mocked.checkoutBranch.mockResolvedValue(undefined)
    mocked.snapshotWorktree.mockResolvedValue(snapshot('co'))

    await api.apiCheckoutBranch(path, 'feat', { fromRef: 'main', fromDetached: false, force: true })

    const entry = historyOf(path).stack[0]
    expect(entry.pinnedRefs).toEqual(
      expect.arrayContaining(['refs/git-manager/undo/idxco', 'refs/git-manager/undo/wdco'])
    )
  })

  it('leaving a detached HEAD pins the detached commit so it survives GC', async () => {
    const path = freshPath()
    mocked.checkoutBranch.mockResolvedValue(undefined)

    await api.apiCheckoutBranch(path, 'main', { fromRef: 'detached-sha', fromDetached: true })

    const entry = historyOf(path).stack[0]
    expect(mocked.pinObject).toHaveBeenCalledWith(path, `${entry.id}-detached`, 'detached-sha')
    expect(entry.pinnedRefs).toContain(`${entry.id}-detached`)
  })

  it('clears redo when called without opts', async () => {
    const path = freshPath()
    mocked.checkoutBranch.mockResolvedValue(undefined)

    await api.apiCheckoutBranch(path, 'feat')

    expect(historyOf(path)).toBeUndefined()
  })
})

describe('apiDeleteBranch', () => {
  it('pins the branch tip before deleting and pushes a deleteBranch entry', async () => {
    const path = freshPath()
    mocked.deleteBranch.mockResolvedValue(undefined)

    await api.apiDeleteBranch(path, 'feat', { targetOid: 'sha-feat', upstream: 'origin/feat' })

    const entry = historyOf(path).stack[0]
    expect(entry).toMatchObject({
      type: 'deleteBranch',
      name: 'feat',
      targetOid: 'sha-feat',
      upstream: 'origin/feat',
    })
    expect(mocked.pinObject).toHaveBeenCalledWith(path, entry.id, 'sha-feat')
  })
})

describe('apiRemoveRemote', () => {
  it('pushes a removeRemote entry with the remote url when it existed', async () => {
    const path = freshPath()
    mocked.getRemotes.mockResolvedValue([{ name: 'origin', url: 'git@x:y.git' }])
    mocked.removeRemote.mockResolvedValue(undefined)

    await api.apiRemoveRemote(path, 'origin')

    expect(historyOf(path).stack[0]).toMatchObject({
      type: 'removeRemote',
      name: 'origin',
      url: 'git@x:y.git',
    })
  })

  it('clears redo when the remote was already gone', async () => {
    const path = freshPath()
    mocked.getRemotes.mockResolvedValue([])
    mocked.removeRemote.mockResolvedValue(undefined)

    await api.apiRemoveRemote(path, 'origin')

    expect(historyOf(path)).toBeUndefined()
  })
})
