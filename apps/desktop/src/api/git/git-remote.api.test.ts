import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useUndoHistoryStore } from '../../stores/undoHistory.store'

vi.mock('../../lib/tauri', async () => {
  const actual = await vi.importActual<typeof import('../../lib/tauri')>('../../lib/tauri')
  return {
    ...actual,
    getRemotes: vi.fn(),
    removeRemote: vi.fn(),
  }
})

import * as tauri from '../../lib/tauri'
import * as api from './git-remote.api'

const mocked = tauri as unknown as Record<string, ReturnType<typeof vi.fn>>

let pathCounter = 0
/** Fresh repo path per test so module-level undo state never leaks across tests. */
function freshPath() {
  return `/repo-${++pathCounter}`
}

beforeEach(() => {
  vi.clearAllMocks()
  useUndoHistoryStore.setState({ byRepo: {} })
})

function historyOf(path: string) {
  return useUndoHistoryStore.getState().byRepo[path]
}

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
