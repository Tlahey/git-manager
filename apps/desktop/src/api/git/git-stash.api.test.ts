import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GitStash } from '@git-manager/git-types'
import type { WorktreeSnapshot } from '../../lib/tauri'
import { useUndoHistoryStore } from '../../stores/undoHistory.store'

vi.mock('../../lib/tauri', async () => {
  const actual = await vi.importActual<typeof import('../../lib/tauri')>('../../lib/tauri')
  return {
    ...actual,
    stashPush: vi.fn(),
    stashPop: vi.fn(),
    stashApply: vi.fn(),
    stashDrop: vi.fn(),
    stashList: vi.fn(),
    pinObject: vi.fn(),
    snapshotWorktreeAlways: vi.fn(),
  }
})

import * as tauri from '../../lib/tauri'
import * as api from './git-stash.api'

const mocked = tauri as unknown as Record<string, ReturnType<typeof vi.fn>>

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
