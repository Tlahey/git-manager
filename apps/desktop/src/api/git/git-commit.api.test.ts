import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GitBranch } from '@git-manager/git-types'
import { useUndoHistoryStore } from '../../stores/undoHistory.store'

vi.mock('../../lib/tauri', async () => {
  const actual = await vi.importActual<typeof import('../../lib/tauri')>('../../lib/tauri')
  return {
    ...actual,
    getBranches: vi.fn(),
    createCommit: vi.fn(),
    discardFileChanges: vi.fn(),
    pinObject: vi.fn(),
  }
})

import * as tauri from '../../lib/tauri'
import * as api from './git-commit.api'

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

let pathCounter = 0
/** Fresh repo path per test so module-level undo state never leaks across tests. */
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
