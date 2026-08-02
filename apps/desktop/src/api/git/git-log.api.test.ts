import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GitBranch } from '@git-manager/git-types'
import { useUndoHistoryStore } from '../../stores/undoHistory.store'

vi.mock('../../lib/tauri', async () => {
  const actual = await vi.importActual<typeof import('../../lib/tauri')>('../../lib/tauri')
  return {
    ...actual,
    getBranches: vi.fn(),
    createCommit: vi.fn(),
    // The undo store's real executeUndo() calls this to reverse a 'commit'-type entry, which the
    // test below triggers via a real .undo() call to build a prior redo tail.
    resetToCommit: vi.fn(),
    cherryPickCommit: vi.fn(),
  }
})

import * as tauri from '../../lib/tauri'
import * as api from './git-log.api'
// apiCreateCommit builds the prior redo tail this cherry-pick clears — a genuine cross-domain
// setup, not a layering bypass.
import { apiCreateCommit } from '../git.api'

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
})

describe('apiCherryPickCommit', () => {
  it('clears the redo tail', async () => {
    const path = freshPath()
    mocked.getBranches.mockResolvedValue(headBranch('prev-sha'))
    mocked.createCommit.mockResolvedValue({ oid: 'sha-1', shortOid: 'sha-1' })
    await apiCreateCommit(path, 'first')
    await useUndoHistoryStore.getState().undo(path)
    expect(useUndoHistoryStore.getState().canRedo(path)).toBe(true)

    mocked.cherryPickCommit.mockResolvedValue(undefined)

    await api.apiCherryPickCommit(path, 'some-sha')

    expect(useUndoHistoryStore.getState().canRedo(path)).toBe(false)
  })
})
