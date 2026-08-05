import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GitBranch, RebaseState } from '@git-manager/git-types'
import { useUndoHistoryStore, type UndoAction } from '../../stores/undoHistory.store'
import {
  runActivity,
  resetActivitySessions,
  openActivitySession,
  getActiveSession,
} from '../../lib/activityCorrelation'

vi.mock('../../lib/tauri', async () => {
  const actual = await vi.importActual<typeof import('../../lib/tauri')>('../../lib/tauri')
  return {
    ...actual,
    getBranches: vi.fn(),
    getRebaseState: vi.fn(),
    pinObject: vi.fn(),
  }
})

import * as tauri from '../../lib/tauri'
import { pushAction, clearRedo, settleRebase, pendingRebasePreviousOid } from './gitApiShared'

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

function makeAction(overrides: Partial<UndoAction> = {}): UndoAction {
  return {
    id: 'a1',
    label: { key: 'undoRedo.commit' },
    timestamp: 0,
    pinnedRefs: [],
    type: 'commit',
    previousOid: 'prev',
    newOid: 'next',
    ...overrides,
  } as UndoAction
}

let pathCounter = 0
/** Fresh repo path per test so module-level undo/session/pending-rebase state never leaks. */
function freshPath() {
  return `/repo-${++pathCounter}`
}

beforeEach(() => {
  vi.clearAllMocks()
  useUndoHistoryStore.setState({ byRepo: {} })
  resetActivitySessions()
  pendingRebasePreviousOid.clear()
})

function historyOf(path: string) {
  return useUndoHistoryStore.getState().byRepo[path]
}

/** Gives `path` a redo tail (two pushed actions, pointer rewound by one) without exercising the
 * real undo() flow — which would call executeUndo and pull in a whole other set of IPC mocks. */
function withRedoTail(path: string) {
  useUndoHistoryStore.getState().push(path, makeAction({ id: 'a1' }))
  useUndoHistoryStore.getState().push(path, makeAction({ id: 'a2' }))
  useUndoHistoryStore.setState((state) => ({
    byRepo: { ...state.byRepo, [path]: { ...state.byRepo[path], pointer: 1 } },
  }))
}

describe('pushAction', () => {
  it('appends the given action to the repo undo history', () => {
    const path = freshPath()
    const action = makeAction()

    pushAction(path, action)

    expect(historyOf(path).stack).toEqual([action])
  })

  it('leaves correlationId unset when no activity is in scope', () => {
    const path = freshPath()

    pushAction(path, makeAction())

    expect(historyOf(path).stack[0].correlationId).toBeUndefined()
  })

  it('stamps the active correlation id when pushed inside runActivity', async () => {
    const path = freshPath()

    await runActivity('git.test', async () => {
      pushAction(path, makeAction())
    })

    expect(historyOf(path).stack[0].correlationId).toBeTruthy()
  })

  it('tags every action pushed during the same gesture with one shared correlation id', async () => {
    const path = freshPath()

    await runActivity('git.test', async () => {
      pushAction(path, makeAction({ id: 'a1' }))
      pushAction(path, makeAction({ id: 'a2' }))
    })

    const stack = historyOf(path).stack
    expect(stack[0].correlationId).toBe(stack[1].correlationId)
  })

  it('drops any existing redo tail, like any push onto an undo stack', () => {
    const path = freshPath()
    withRedoTail(path)
    expect(useUndoHistoryStore.getState().canRedo(path)).toBe(true)

    pushAction(path, makeAction({ id: 'a3' }))

    expect(useUndoHistoryStore.getState().canRedo(path)).toBe(false)
    expect(historyOf(path).stack.map((a) => a.id)).toEqual(['a1', 'a3'])
  })
})

describe('clearRedo', () => {
  it('drops a pending redo tail', () => {
    const path = freshPath()
    withRedoTail(path)
    expect(useUndoHistoryStore.getState().canRedo(path)).toBe(true)

    clearRedo(path)

    expect(useUndoHistoryStore.getState().canRedo(path)).toBe(false)
    expect(historyOf(path).stack.map((a) => a.id)).toEqual(['a1'])
  })

  it('is a no-op when there is nothing to clear (pointer already at the top)', () => {
    const path = freshPath()
    pushAction(path, makeAction())

    expect(() => clearRedo(path)).not.toThrow()
    expect(historyOf(path).stack).toHaveLength(1)
  })

  it('is a no-op for a repo with no history at all', () => {
    const path = freshPath()

    expect(() => clearRedo(path)).not.toThrow()
    expect(historyOf(path)).toBeUndefined()
  })
})

describe('settleRebase', () => {
  it('still rebasing: leaves the session open and the pending entry untouched', async () => {
    const path = freshPath()
    openActivitySession(path, 'rebase')
    pendingRebasePreviousOid.set(path, { previousOid: 'prev-sha', kind: 'interactiveRebase' })
    mocked.getRebaseState.mockResolvedValue(rebaseState('conflict'))

    await settleRebase(path)

    expect(getActiveSession(path, 'continue_rebase')).not.toBeNull()
    expect(pendingRebasePreviousOid.get(path)).toEqual({
      previousOid: 'prev-sha',
      kind: 'interactiveRebase',
    })
    expect(historyOf(path)).toBeUndefined()
    expect(mocked.getBranches).not.toHaveBeenCalled()
  })

  it('no pending rebase: closes the session, touches neither push nor redo', async () => {
    const path = freshPath()
    openActivitySession(path, 'rebase')
    withRedoTail(path) // proves clearRedo is NOT reached on this branch
    mocked.getRebaseState.mockResolvedValue(rebaseState('idle'))

    await settleRebase(path)

    expect(getActiveSession(path, 'continue_rebase')).toBeNull()
    expect(useUndoHistoryStore.getState().canRedo(path)).toBe(true)
    expect(historyOf(path).stack.map((a) => a.id)).toEqual(['a1', 'a2'])
  })

  it('a rebase_state lookup failure is treated as idle (not still-rebasing)', async () => {
    const path = freshPath()
    openActivitySession(path, 'rebase')
    mocked.getRebaseState.mockRejectedValue(new Error('no repo'))

    await settleRebase(path)

    expect(getActiveSession(path, 'continue_rebase')).toBeNull()
  })

  it('oid changed: pushes an undo entry pinning both ends and forgets the pending entry', async () => {
    const path = freshPath()
    pendingRebasePreviousOid.set(path, { previousOid: 'prev-sha', kind: 'interactiveRebase' })
    mocked.getRebaseState.mockResolvedValue(rebaseState('idle'))
    mocked.getBranches.mockResolvedValue(headBranch('new-sha'))
    mocked.pinObject.mockResolvedValue(undefined)

    await settleRebase(path)

    const entry = historyOf(path).stack[0]
    expect(entry).toMatchObject({
      type: 'interactiveRebase',
      previousOid: 'prev-sha',
      newOid: 'new-sha',
      label: { key: 'undoRedo.interactiveRebase' },
    })
    expect(entry.pinnedRefs).toEqual([`${entry.id}-previous`, `${entry.id}-new`])
    expect(mocked.pinObject).toHaveBeenCalledWith(path, `${entry.id}-previous`, 'prev-sha')
    expect(mocked.pinObject).toHaveBeenCalledWith(path, `${entry.id}-new`, 'new-sha')
    expect(pendingRebasePreviousOid.has(path)).toBe(false)
  })

  it('oid changed: labels an autosquash entry distinctly from an interactive rebase', async () => {
    const path = freshPath()
    pendingRebasePreviousOid.set(path, { previousOid: 'prev-sha', kind: 'autosquash' })
    mocked.getRebaseState.mockResolvedValue(rebaseState('idle'))
    mocked.getBranches.mockResolvedValue(headBranch('new-sha'))
    mocked.pinObject.mockResolvedValue(undefined)

    await settleRebase(path)

    expect(historyOf(path).stack[0]).toMatchObject({
      type: 'autosquash',
      label: { key: 'undoRedo.autosquash' },
    })
  })

  it('oid unchanged: clears the redo tail instead of pushing an entry', async () => {
    const path = freshPath()
    withRedoTail(path)
    pendingRebasePreviousOid.set(path, { previousOid: 'same-sha', kind: 'interactiveRebase' })
    mocked.getRebaseState.mockResolvedValue(rebaseState('idle'))
    mocked.getBranches.mockResolvedValue(headBranch('same-sha'))

    await settleRebase(path)

    expect(useUndoHistoryStore.getState().canRedo(path)).toBe(false)
    expect(historyOf(path).stack.map((a) => a.id)).toEqual(['a1'])
    expect(mocked.pinObject).not.toHaveBeenCalled()
    expect(pendingRebasePreviousOid.has(path)).toBe(false)
  })

  it('oid unchanged: also covers a rebase whose previousOid was never captured', async () => {
    const path = freshPath()
    withRedoTail(path)
    pendingRebasePreviousOid.set(path, { previousOid: null, kind: 'interactiveRebase' })
    mocked.getRebaseState.mockResolvedValue(rebaseState('idle'))

    await settleRebase(path)

    expect(useUndoHistoryStore.getState().canRedo(path)).toBe(false)
    expect(mocked.getBranches).not.toHaveBeenCalled()
    expect(pendingRebasePreviousOid.has(path)).toBe(false)
  })

  it('closes the activity session once settled, regardless of branch', async () => {
    const path = freshPath()
    openActivitySession(path, 'rebase')
    pendingRebasePreviousOid.set(path, { previousOid: 'prev-sha', kind: 'interactiveRebase' })
    mocked.getRebaseState.mockResolvedValue(rebaseState('idle'))
    mocked.getBranches.mockResolvedValue(headBranch('new-sha'))
    mocked.pinObject.mockResolvedValue(undefined)

    await settleRebase(path)

    expect(getActiveSession(path, 'continue_rebase')).toBeNull()
  })

  it('scopes pending state and history to their own repository', async () => {
    const path = freshPath()
    const other = freshPath()
    pendingRebasePreviousOid.set(path, { previousOid: 'prev-sha', kind: 'interactiveRebase' })
    mocked.getRebaseState.mockResolvedValue(rebaseState('idle'))
    mocked.getBranches.mockResolvedValue(headBranch('new-sha'))
    mocked.pinObject.mockResolvedValue(undefined)

    await settleRebase(path)

    expect(historyOf(other)).toBeUndefined()
    expect(pendingRebasePreviousOid.has(other)).toBe(false)
  })
})
