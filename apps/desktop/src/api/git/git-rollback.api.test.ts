import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GitBranch } from '@git-manager/git-types'
import type { WorktreeSnapshot } from '../../lib/tauri'
import { useUndoHistoryStore } from '../../stores/undoHistory.store'

vi.mock('../../lib/tauri', async () => {
  const actual = await vi.importActual<typeof import('../../lib/tauri')>('../../lib/tauri')
  return {
    ...actual,
    getBranches: vi.fn(),
    revertCommit: vi.fn(),
    resetToCommit: vi.fn(),
    pinObject: vi.fn(),
    snapshotWorktree: vi.fn(),
  }
})

import * as tauri from '../../lib/tauri'
import * as api from './git-rollback.api'

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

let pathCounter = 0
/** Fresh repo path per test so module-level undo state never leaks across tests. */
function freshPath() {
  return `/repo-${++pathCounter}`
}

beforeEach(() => {
  vi.clearAllMocks()
  useUndoHistoryStore.setState({ byRepo: {} })
  mocked.pinObject.mockResolvedValue(undefined)
})

function historyOf(path: string) {
  return useUndoHistoryStore.getState().byRepo[path]
}

describe('apiRevertCommit', () => {
  it('pushes a revert entry pinning previous+new HEAD when HEAD moved', async () => {
    const path = freshPath()
    mocked.getBranches.mockResolvedValueOnce(headBranch('prev-sha'))
    mocked.revertCommit.mockResolvedValue('rev-sh')
    mocked.getBranches.mockResolvedValueOnce(headBranch('new-sha'))

    await api.apiRevertCommit(path, 'target-sha')

    const entry = historyOf(path).stack[0]
    expect(entry).toMatchObject({ type: 'revert', previousOid: 'prev-sha', newOid: 'new-sha' })
    expect(mocked.pinObject).toHaveBeenCalledWith(path, `${entry.id}-previous`, 'prev-sha')
    expect(mocked.pinObject).toHaveBeenCalledWith(path, `${entry.id}-new`, 'new-sha')
  })

  it('clears redo instead when HEAD did not move (e.g. nothing to commit)', async () => {
    const path = freshPath()
    mocked.getBranches.mockResolvedValue(headBranch('same-sha'))
    mocked.revertCommit.mockResolvedValue('rev-sh')

    await api.apiRevertCommit(path, 'target-sha')

    expect(historyOf(path)).toBeUndefined()
  })

  it('noCommit clears redo without querying HEAD twice', async () => {
    const path = freshPath()
    mocked.revertCommit.mockResolvedValue('')

    await api.apiRevertCommit(path, 'target-sha', true)

    expect(historyOf(path)).toBeUndefined()
    expect(mocked.getBranches).not.toHaveBeenCalled()
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
