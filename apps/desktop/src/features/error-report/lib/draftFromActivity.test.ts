import { describe, it, expect } from 'vitest'
import { draftFromActivityEntry, parseActivityError } from './draftFromActivity'
import type { ActivityLogEntry } from '../../../stores/activityLog.store'
import type { ActivityBlock } from '../../../lib/groupActivityLog'

function entry(overrides: Partial<ActivityLogEntry> = {}): ActivityLogEntry {
  return {
    id: '1',
    timestamp: 1_700_000_000_000,
    command: 'git_push',
    durationMs: 40,
    status: 'error',
    ...overrides,
  }
}

describe('parseActivityError', () => {
  it('recovers the code from the raw AppError payload the log stores', () => {
    const raw = JSON.stringify({ code: 'GIT_ERROR', message: 'cannot lock ref', detail: null })
    expect(parseActivityError(raw)).toEqual({
      code: 'GIT_ERROR',
      message: 'cannot lock ref',
      detail: undefined,
    })
  })

  it('keeps a hook failure’s own output, which is the useful half of it', () => {
    const raw = JSON.stringify({
      code: 'HOOK_FAILED',
      message: 'The pre-commit hook stopped the operation',
      detail: 'eslint: 3 problems',
    })
    expect(parseActivityError(raw).detail).toBe('eslint: 3 problems')
  })

  it('falls back to the bare string for a rejection that never reached the backend', () => {
    expect(parseActivityError('TypeError: x is not a function')).toEqual({
      message: 'TypeError: x is not a function',
    })
  })
})

describe('draftFromActivityEntry', () => {
  it('carries the whole correlated action as context, not just the failing line', () => {
    const failing = entry({
      error: JSON.stringify({ code: 'GIT_ERROR', message: 'boom' }),
      correlationId: 'c1',
      repoPath: '/repo',
    })
    const block: ActivityBlock = {
      id: 'c1',
      label: 'git.pull',
      entries: [failing, entry({ id: '2', command: 'git_fetch', status: 'ok' })],
      startTimestamp: 1,
      totalDurationMs: 60,
    }

    const draft = draftFromActivityEntry(failing, block)

    expect(draft).toMatchObject({
      kind: 'operation',
      code: 'GIT_ERROR',
      message: 'boom',
      command: 'git_push',
      correlationLabel: 'git.pull',
      repoPath: '/repo',
    })
    expect(draft.context).toHaveLength(2)
  })

  it('still produces a usable draft with no block, using the entry as its own context', () => {
    const failing = entry({ error: JSON.stringify({ code: 'UNKNOWN', message: 'boom' }) })
    const draft = draftFromActivityEntry(failing, undefined)
    expect(draft.context).toEqual([failing])
    expect(draft.correlationLabel).toBeUndefined()
  })

  it('does not invent a message for an entry with no error recorded', () => {
    expect(draftFromActivityEntry(entry({ error: undefined }), undefined).message).toBe(
      'Unknown error'
    )
  })
})
