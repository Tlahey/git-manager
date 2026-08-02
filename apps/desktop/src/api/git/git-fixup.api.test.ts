import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GitBranch, RebaseState } from '@git-manager/git-types'
import { useUndoHistoryStore } from '../../stores/undoHistory.store'
import { resetActivitySessions } from '../../lib/activityCorrelation'

vi.mock('../../lib/tauri', async () => {
  const actual = await vi.importActual<typeof import('../../lib/tauri')>('../../lib/tauri')
  return {
    ...actual,
    getBranches: vi.fn(),
    createFixupCommit: vi.fn(),
    runAutosquash: vi.fn(),
    continueRebase: vi.fn(),
    getRebaseState: vi.fn(),
    pinObject: vi.fn(),
  }
})

import * as tauri from '../../lib/tauri'
import * as api from './git-fixup.api'
// The paused-autosquash-then-Continue interaction below is a genuine cross-domain case: the
// pending rebase it settles is only ever finished from the rebase domain's own continue/skip.
import { apiRebaseContinue } from '../git.api'

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

function rebaseState(kind: RebaseState['kind']): RebaseState {
  return { kind, steps: [] }
}

let pathCounter = 0
/** Fresh repo path per test so module-level rebase-pending state never leaks across tests. */
function freshPath() {
  return `/repo-${++pathCounter}`
}

beforeEach(() => {
  vi.clearAllMocks()
  useUndoHistoryStore.setState({ byRepo: {} })
  mocked.pinObject.mockResolvedValue(undefined)
  // `settleRebase` asks git whether the rebase is over on every step; default to "it is", so a
  // test that isn't about pausing needn't say so.
  mocked.getRebaseState.mockResolvedValue(rebaseState('idle'))
  resetActivitySessions()
})

function historyOf(path: string) {
  return useUndoHistoryStore.getState().byRepo[path]
}

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
    // getBranches was only queried once (for previousOid) — settleRebase bailed before
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
    await apiRebaseContinue(path)

    const entry = historyOf(path).stack[0]
    expect(entry).toMatchObject({ type: 'autosquash', previousOid: 'prev-sha', newOid: 'new-sha' })
  })
})
