import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GitBranch, RebaseState } from '@git-manager/git-types'
import { useUndoHistoryStore } from '../stores/undoHistory.store'
import { getActiveSession, resetActivitySessions } from '../lib/activityCorrelation'

vi.mock('../lib/tauri', async () => {
  const actual = await vi.importActual<typeof import('../lib/tauri')>('../lib/tauri')
  return {
    ...actual,
    getBranches: vi.fn(),
    createCommit: vi.fn(),
    // Not exercised directly here (see git-rollback.api.test.ts) — but the undo store's real
    // executeUndo() calls it to reverse a 'commit'-type entry, which `clearRedo-only actions`'
    // withPriorRedoTail() triggers via a real .undo() call.
    resetToCommit: vi.fn(),
    cherryPickCommit: vi.fn(),
    rebaseOntoCommit: vi.fn(),
    runInteractiveRebase: vi.fn(),
    continueRebase: vi.fn(),
    abortRebase: vi.fn(),
    skipRebase: vi.fn(),
    getRebaseState: vi.fn(),
    bisectStart: vi.fn(),
    bisectMark: vi.fn(),
    bisectReset: vi.fn(),
    getRemotes: vi.fn(),
    removeRemote: vi.fn(),
    pinObject: vi.fn(),
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
  // pinObject calls are always chained with `.catch(() => {})` — needs a real promise by default.
  mocked.pinObject.mockResolvedValue(undefined)
  // `settleRebase` asks git whether the rebase is over on every step; default to "it is", so a test
  // that isn't about pausing needn't say so.
  mocked.getRebaseState.mockResolvedValue(rebaseState('idle'))
  resetActivitySessions()
})

function historyOf(path: string) {
  return useUndoHistoryStore.getState().byRepo[path]
}

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

/** Whether a multi-step-operation session is open for `path`, probed through a command that joins it. */
function sessionFor(path: string, command: string) {
  return getActiveSession(path, command)
}

describe('activity-log sessions for multi-step operations', () => {
  it('opens a rebase session and closes it once the rebase lands', async () => {
    const path = freshPath()
    mocked.rebaseOntoCommit.mockResolvedValue(undefined)
    mocked.getRebaseState.mockResolvedValue(rebaseState('idle'))

    await api.apiRebaseOntoCommit(path, 'some-sha')

    expect(sessionFor(path, 'continue_rebase')).toBeNull()
  })

  it('holds the session open while the rebase is paused, so the conflict work joins it', async () => {
    // This is the whole point: the steps that settle a conflict happen minutes later, as separate
    // user actions, and have to land in the same journal block.
    const path = freshPath()
    mocked.rebaseOntoCommit.mockResolvedValue(undefined)
    mocked.getRebaseState.mockResolvedValue(rebaseState('conflict'))

    await api.apiRebaseOntoCommit(path, 'some-sha')

    const open = sessionFor(path, 'continue_rebase')
    expect(open?.label).toBe('git.rebase')
    // Resolving and staging join it; an unrelated push does not.
    expect(sessionFor(path, 'resolve_conflict')?.id).toBe(open?.id)
    expect(sessionFor(path, 'stage_file')?.id).toBe(open?.id)
    expect(sessionFor(path, 'push_branch')).toBeNull()
  })

  it('closes the session on the continue that finally lands the rebase', async () => {
    const path = freshPath()
    mocked.rebaseOntoCommit.mockResolvedValue(undefined)
    mocked.continueRebase.mockResolvedValue(undefined)
    mocked.getRebaseState.mockResolvedValue(rebaseState('conflict'))
    await api.apiRebaseOntoCommit(path, 'some-sha')

    // Still paused after the first continue: the block stays open.
    await api.apiRebaseContinue(path)
    const stillOpen = sessionFor(path, 'continue_rebase')
    expect(stillOpen).not.toBeNull()

    mocked.getRebaseState.mockResolvedValue(rebaseState('idle'))
    await api.apiRebaseContinue(path)

    expect(sessionFor(path, 'continue_rebase')).toBeNull()
  })

  it('keeps one id across the whole rebase, pauses included', async () => {
    const path = freshPath()
    mocked.rebaseOntoCommit.mockResolvedValue(undefined)
    mocked.continueRebase.mockResolvedValue(undefined)
    mocked.getRebaseState.mockResolvedValue(rebaseState('conflict'))

    await api.apiRebaseOntoCommit(path, 'some-sha')
    const started = sessionFor(path, 'continue_rebase')?.id
    await api.apiRebaseContinue(path)

    expect(sessionFor(path, 'continue_rebase')?.id).toBe(started)
  })

  it('closes the session on abort, even when the abort itself fails', async () => {
    // A session left open on a failed abort is the case that would swallow everything done next.
    const path = freshPath()
    mocked.rebaseOntoCommit.mockResolvedValue(undefined)
    mocked.getRebaseState.mockResolvedValue(rebaseState('conflict'))
    await api.apiRebaseOntoCommit(path, 'some-sha')
    mocked.abortRebase.mockRejectedValue(new Error('cannot abort'))

    await expect(api.apiRebaseAbort(path)).rejects.toThrow()

    expect(sessionFor(path, 'continue_rebase')).toBeNull()
  })

  it('starts a session on a continue that has none to join', async () => {
    // The app was restarted mid-rebase, or the rebase was started from a terminal.
    const path = freshPath()
    mocked.continueRebase.mockResolvedValue(undefined)
    mocked.getRebaseState.mockResolvedValue(rebaseState('conflict'))

    await api.apiRebaseContinue(path)

    expect(sessionFor(path, 'continue_rebase')?.label).toBe('git.rebase')
  })

  it('scopes a session to its own repository', async () => {
    const path = freshPath()
    const other = freshPath()
    mocked.rebaseOntoCommit.mockResolvedValue(undefined)
    mocked.getRebaseState.mockResolvedValue(rebaseState('conflict'))

    await api.apiRebaseOntoCommit(path, 'some-sha')

    expect(sessionFor(other, 'continue_rebase')).toBeNull()
  })

  it('spans a bisect from start to reset', async () => {
    const path = freshPath()
    mocked.bisectStart.mockResolvedValue(undefined)
    mocked.bisectMark.mockResolvedValue(undefined)
    mocked.bisectReset.mockResolvedValue(undefined)

    await api.apiBisectStart(path, 'HEAD', 'v1')
    const started = sessionFor(path, 'bisect_mark')
    expect(started?.label).toBe('git.bisect')

    // git keeps a bisect alive even after the first bad commit is found, so marking never closes it.
    await api.apiBisectMark(path, 'good')
    expect(sessionFor(path, 'bisect_mark')?.id).toBe(started?.id)

    await api.apiBisectReset(path)
    expect(sessionFor(path, 'bisect_mark')).toBeNull()
  })

  it('does not pull staging into a bisect', async () => {
    const path = freshPath()
    mocked.bisectStart.mockResolvedValue(undefined)

    await api.apiBisectStart(path, 'HEAD', 'v1')

    expect(sessionFor(path, 'stage_file')).toBeNull()
  })
})
