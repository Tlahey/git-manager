import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorktreeSnapshot } from './tauri'
import { collectActionOids, executeUndo, executeRedo, type UndoAction } from './undoActions'

vi.mock('./tauri', () => ({
  resetToCommit: vi.fn(),
  discardFileChanges: vi.fn(),
  restoreFileBlob: vi.fn(),
  stageFile: vi.fn(),
  checkoutBranch: vi.fn(),
  restoreWorktreeSnapshot: vi.fn(),
  recreateBranchRef: vi.fn(),
  deleteBranch: vi.fn(),
  addRemote: vi.fn(),
  removeRemote: vi.fn(),
  stashPop: vi.fn(),
  stashPush: vi.fn(),
  stashApply: vi.fn(),
  stashDrop: vi.fn(),
  stashStore: vi.fn(),
  createTag: vi.fn(),
  deleteTag: vi.fn(),
}))

import * as tauri from './tauri'

const REPO = '/repo'
const base = { id: 'a1', label: { key: 'x' }, timestamp: 0, pinnedRefs: [] as string[] }

function snapshot(): WorktreeSnapshot {
  return {
    indexTreeOid: 'idx-oid',
    workdirTreeOid: 'wd-oid',
    indexRefName: 'refs/git-manager/undo/idx',
    workdirRefName: 'refs/git-manager/undo/wd',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('commit', () => {
  const action: UndoAction = { ...base, type: 'commit', previousOid: 'prev', newOid: 'new' }

  it('collects both oids', () => {
    expect(collectActionOids(action)).toEqual(['prev', 'new'])
  })

  it('undo soft-resets to previousOid', async () => {
    await executeUndo(REPO, action)
    expect(tauri.resetToCommit).toHaveBeenCalledWith(REPO, 'prev', 'soft')
  })

  it('redo soft-resets to newOid', async () => {
    await executeRedo(REPO, action)
    expect(tauri.resetToCommit).toHaveBeenCalledWith(REPO, 'new', 'soft')
  })
})

describe('discard', () => {
  it('collects the blob oid', () => {
    const action: UndoAction = {
      ...base,
      type: 'discard',
      filePath: 'f.ts',
      blobOid: 'blob1',
      wasStaged: false,
    }
    expect(collectActionOids(action)).toEqual(['blob1'])
  })

  it('undo restores the blob and re-stages when it was staged', async () => {
    const action: UndoAction = {
      ...base,
      type: 'discard',
      filePath: 'f.ts',
      blobOid: 'blob1',
      wasStaged: true,
    }
    await executeUndo(REPO, action)
    expect(tauri.restoreFileBlob).toHaveBeenCalledWith(REPO, 'f.ts', 'blob1')
    expect(tauri.stageFile).toHaveBeenCalledWith(REPO, 'f.ts')
  })

  it('undo restores the blob without staging when it was unstaged', async () => {
    const action: UndoAction = {
      ...base,
      type: 'discard',
      filePath: 'f.ts',
      blobOid: 'blob1',
      wasStaged: false,
    }
    await executeUndo(REPO, action)
    expect(tauri.restoreFileBlob).toHaveBeenCalledWith(REPO, 'f.ts', 'blob1')
    expect(tauri.stageFile).not.toHaveBeenCalled()
  })

  it('redo re-discards the file', async () => {
    const action: UndoAction = {
      ...base,
      type: 'discard',
      filePath: 'f.ts',
      blobOid: 'blob1',
      wasStaged: false,
    }
    await executeRedo(REPO, action)
    expect(tauri.discardFileChanges).toHaveBeenCalledWith(REPO, 'f.ts')
  })
})

describe('checkout', () => {
  it('collects no oids without a snapshot, snapshot tree oids with one', () => {
    const noSnap: UndoAction = {
      ...base,
      type: 'checkout',
      fromRef: 'main',
      toRef: 'feat',
      force: false,
      snapshot: null,
    }
    expect(collectActionOids(noSnap)).toEqual([])

    const withSnap: UndoAction = {
      ...base,
      type: 'checkout',
      fromRef: 'main',
      toRef: 'feat',
      force: true,
      snapshot: snapshot(),
    }
    expect(collectActionOids(withSnap)).toEqual(['idx-oid', 'wd-oid'])
  })

  it('undo checks out fromRef and restores the snapshot when present', async () => {
    const action: UndoAction = {
      ...base,
      type: 'checkout',
      fromRef: 'main',
      toRef: 'feat',
      force: true,
      snapshot: snapshot(),
    }
    await executeUndo(REPO, action)
    expect(tauri.checkoutBranch).toHaveBeenCalledWith(REPO, 'main', true)
    expect(tauri.restoreWorktreeSnapshot).toHaveBeenCalledWith(REPO, snapshot())
  })

  it('undo skips snapshot restore when there was none', async () => {
    const action: UndoAction = {
      ...base,
      type: 'checkout',
      fromRef: 'main',
      toRef: 'feat',
      force: false,
      snapshot: null,
    }
    await executeUndo(REPO, action)
    expect(tauri.checkoutBranch).toHaveBeenCalledWith(REPO, 'main', false)
    expect(tauri.restoreWorktreeSnapshot).not.toHaveBeenCalled()
  })

  it('redo checks out toRef', async () => {
    const action: UndoAction = {
      ...base,
      type: 'checkout',
      fromRef: 'main',
      toRef: 'feat',
      force: false,
      snapshot: null,
    }
    await executeRedo(REPO, action)
    expect(tauri.checkoutBranch).toHaveBeenCalledWith(REPO, 'feat', false)
  })
})

describe('deleteBranch', () => {
  const action: UndoAction = {
    ...base,
    type: 'deleteBranch',
    name: 'feat',
    targetOid: 'sha1',
    upstream: 'origin/feat',
  }

  it('collects the target oid', () => {
    expect(collectActionOids(action)).toEqual(['sha1'])
  })

  it('undo recreates the branch ref', async () => {
    await executeUndo(REPO, action)
    expect(tauri.recreateBranchRef).toHaveBeenCalledWith(REPO, 'feat', 'sha1', 'origin/feat')
  })

  it('redo force-deletes the branch again', async () => {
    await executeRedo(REPO, action)
    expect(tauri.deleteBranch).toHaveBeenCalledWith(REPO, 'feat', true, false)
  })
})

describe('removeRemote', () => {
  const action: UndoAction = { ...base, type: 'removeRemote', name: 'origin', url: 'git@x:y.git' }

  it('collects no oids', () => {
    expect(collectActionOids(action)).toEqual([])
  })

  it('undo re-adds the remote', async () => {
    await executeUndo(REPO, action)
    expect(tauri.addRemote).toHaveBeenCalledWith(REPO, 'origin', 'git@x:y.git')
  })

  it('redo removes it again', async () => {
    await executeRedo(REPO, action)
    expect(tauri.removeRemote).toHaveBeenCalledWith(REPO, 'origin')
  })
})

describe('reset', () => {
  it('collects previous, target, and snapshot oids', () => {
    const action: UndoAction = {
      ...base,
      type: 'reset',
      previousOid: 'prev',
      targetOid: 'target',
      mode: 'hard',
      snapshot: snapshot(),
    }
    expect(collectActionOids(action)).toEqual(['prev', 'target', 'idx-oid', 'wd-oid'])
  })

  it('undo resets to previousOid in the same mode and restores the snapshot', async () => {
    const action: UndoAction = {
      ...base,
      type: 'reset',
      previousOid: 'prev',
      targetOid: 'target',
      mode: 'hard',
      snapshot: snapshot(),
    }
    await executeUndo(REPO, action)
    expect(tauri.resetToCommit).toHaveBeenCalledWith(REPO, 'prev', 'hard')
    expect(tauri.restoreWorktreeSnapshot).toHaveBeenCalledWith(REPO, snapshot())
  })

  it('redo resets to targetOid without touching the snapshot', async () => {
    const action: UndoAction = {
      ...base,
      type: 'reset',
      previousOid: 'prev',
      targetOid: 'target',
      mode: 'mixed',
      snapshot: snapshot(),
    }
    await executeRedo(REPO, action)
    expect(tauri.resetToCommit).toHaveBeenCalledWith(REPO, 'target', 'mixed')
    expect(tauri.restoreWorktreeSnapshot).not.toHaveBeenCalled()
  })
})

describe('stashPush', () => {
  const action: UndoAction = { ...base, type: 'stashPush', message: 'WIP', includeUntracked: true }

  it('collects no oids', () => {
    expect(collectActionOids(action)).toEqual([])
  })

  it('undo pops the stash it just created', async () => {
    await executeUndo(REPO, action)
    expect(tauri.stashPop).toHaveBeenCalledWith(REPO, 0)
  })

  it('redo re-pushes the same stash', async () => {
    await executeRedo(REPO, action)
    expect(tauri.stashPush).toHaveBeenCalledWith(REPO, 'WIP', true)
  })
})

describe('stashPop', () => {
  const action: UndoAction = {
    ...base,
    type: 'stashPop',
    message: 'WIP',
    commitOid: 'stash1',
    snapshot: snapshot(),
  }

  it('collects the stash commit oid and snapshot oids', () => {
    expect(collectActionOids(action)).toEqual(['stash1', 'idx-oid', 'wd-oid'])
  })

  it('undo restores the pre-pop worktree and re-stores the stash entry', async () => {
    await executeUndo(REPO, action)
    expect(tauri.restoreWorktreeSnapshot).toHaveBeenCalledWith(REPO, snapshot())
    expect(tauri.stashStore).toHaveBeenCalledWith(REPO, 'stash1', 'WIP')
  })

  it('redo pops it again', async () => {
    await executeRedo(REPO, action)
    expect(tauri.stashPop).toHaveBeenCalledWith(REPO, 0)
  })
})

describe('stashApply', () => {
  const action: UndoAction = { ...base, type: 'stashApply', index: 2, snapshot: snapshot() }

  it('collects snapshot oids', () => {
    expect(collectActionOids(action)).toEqual(['idx-oid', 'wd-oid'])
  })

  it('undo restores the pre-apply worktree', async () => {
    await executeUndo(REPO, action)
    expect(tauri.restoreWorktreeSnapshot).toHaveBeenCalledWith(REPO, snapshot())
  })

  it('redo re-applies the same stash index', async () => {
    await executeRedo(REPO, action)
    expect(tauri.stashApply).toHaveBeenCalledWith(REPO, 2)
  })
})

describe('stashDrop', () => {
  const action: UndoAction = { ...base, type: 'stashDrop', message: 'WIP', commitOid: 'stash1' }

  it('collects the stash commit oid', () => {
    expect(collectActionOids(action)).toEqual(['stash1'])
  })

  it('undo re-stores the dropped stash', async () => {
    await executeUndo(REPO, action)
    expect(tauri.stashStore).toHaveBeenCalledWith(REPO, 'stash1', 'WIP')
  })

  it('redo drops it again', async () => {
    await executeRedo(REPO, action)
    expect(tauri.stashDrop).toHaveBeenCalledWith(REPO, 0)
  })
})

describe.each(['fixup', 'autosquash', 'interactiveRebase', 'revert'] as const)('%s', (type) => {
  const action = { ...base, type, previousOid: 'prev', newOid: 'new' } as UndoAction

  it('collects both oids', () => {
    expect(collectActionOids(action)).toEqual(['prev', 'new'])
  })

  it('undo soft-resets to previousOid', async () => {
    await executeUndo(REPO, action)
    expect(tauri.resetToCommit).toHaveBeenCalledWith(REPO, 'prev', 'soft')
  })

  it('redo soft-resets to newOid', async () => {
    await executeRedo(REPO, action)
    expect(tauri.resetToCommit).toHaveBeenCalledWith(REPO, 'new', 'soft')
  })
})

describe('createBranch', () => {
  const action: UndoAction = { ...base, type: 'createBranch', name: 'feat', targetOid: 'sha1' }

  it('collects the target oid', () => {
    expect(collectActionOids(action)).toEqual(['sha1'])
  })

  it('undo force-deletes the created branch', async () => {
    await executeUndo(REPO, action)
    expect(tauri.deleteBranch).toHaveBeenCalledWith(REPO, 'feat', true, false)
  })

  it('redo recreates the branch ref at the same oid', async () => {
    await executeRedo(REPO, action)
    expect(tauri.recreateBranchRef).toHaveBeenCalledWith(REPO, 'feat', 'sha1')
  })
})

describe('createTag', () => {
  const action: UndoAction = {
    ...base,
    type: 'createTag',
    name: 'v1.0',
    targetOid: 'sha1',
    message: 'release',
  }

  it('collects the target oid', () => {
    expect(collectActionOids(action)).toEqual(['sha1'])
  })

  it('undo deletes the created tag', async () => {
    await executeUndo(REPO, action)
    expect(tauri.deleteTag).toHaveBeenCalledWith(REPO, 'v1.0')
  })

  it('redo recreates the tag at the same oid with the same message', async () => {
    await executeRedo(REPO, action)
    expect(tauri.createTag).toHaveBeenCalledWith(REPO, 'v1.0', 'sha1', 'release')
  })
})

describe('deleteTag', () => {
  const action: UndoAction = {
    ...base,
    type: 'deleteTag',
    name: 'v1.0',
    targetOid: 'sha1',
    message: 'release',
  }

  it('collects the target oid', () => {
    expect(collectActionOids(action)).toEqual(['sha1'])
  })

  it('undo recreates the deleted tag at the same oid with its message', async () => {
    await executeUndo(REPO, action)
    expect(tauri.createTag).toHaveBeenCalledWith(REPO, 'v1.0', 'sha1', 'release')
  })

  it('redo deletes the tag again', async () => {
    await executeRedo(REPO, action)
    expect(tauri.deleteTag).toHaveBeenCalledWith(REPO, 'v1.0')
  })
})
