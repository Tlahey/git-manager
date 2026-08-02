import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getActiveSession, resetActivitySessions } from '../../lib/activityCorrelation'

vi.mock('../../lib/tauri', async () => {
  const actual = await vi.importActual<typeof import('../../lib/tauri')>('../../lib/tauri')
  return {
    ...actual,
    bisectStart: vi.fn(),
    bisectMark: vi.fn(),
    bisectReset: vi.fn(),
  }
})

import * as tauri from '../../lib/tauri'
import * as api from './git-bisect.api'

const mocked = tauri as unknown as Record<string, ReturnType<typeof vi.fn>>

let pathCounter = 0
/** Fresh repo path per test so module-level activity-session state never leaks across tests. */
function freshPath() {
  return `/repo-${++pathCounter}`
}

beforeEach(() => {
  vi.clearAllMocks()
  resetActivitySessions()
})

/** Whether a multi-step-operation session is open for `path`, probed through a command that joins it. */
function sessionFor(path: string, command: string) {
  return getActiveSession(path, command)
}

describe('activity-log sessions for bisect', () => {
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
