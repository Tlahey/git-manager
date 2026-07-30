import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }))

import {
  persistActivityEntry,
  flushActivityLog,
  parseActivityLogEntries,
  readPersistedActivityLog,
} from './activityLogPersistence'
import type { ActivityLogEntry } from '../stores/activityLog.store'

function entry(command: string): ActivityLogEntry {
  return { id: command, timestamp: 1, command, durationMs: 1, status: 'ok' }
}

function enterTauri() {
  ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}
}

beforeEach(() => {
  mockInvoke.mockReset()
  mockInvoke.mockResolvedValue(undefined)
  vi.useFakeTimers()
})

afterEach(async () => {
  await flushActivityLog() // drain module-level queue/timer between tests
  vi.useRealTimers()
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
})

describe('activityLogPersistence', () => {
  it('does nothing outside a Tauri window', async () => {
    persistActivityEntry(entry('get_log'))
    await vi.runAllTimersAsync()
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('batches queued entries into a single append call inside Tauri', async () => {
    enterTauri()
    persistActivityEntry(entry('pull'))
    persistActivityEntry(entry('push'))
    expect(mockInvoke).not.toHaveBeenCalled() // still buffered
    await vi.runAllTimersAsync()
    expect(mockInvoke).toHaveBeenCalledTimes(1)
    const [command, args] = mockInvoke.mock.calls[0]
    expect(command).toBe('append_activity_log')
    expect((args as { entries: ActivityLogEntry[] }).entries.map((e) => e.command)).toEqual([
      'pull',
      'push',
    ])
  })

  it('flushActivityLog sends the queue immediately', async () => {
    enterTauri()
    persistActivityEntry(entry('commit'))
    await flushActivityLog()
    expect(mockInvoke).toHaveBeenCalledTimes(1)
  })

  it('swallows backend failures', async () => {
    enterTauri()
    mockInvoke.mockRejectedValue('disk full')
    persistActivityEntry(entry('fetch'))
    await expect(flushActivityLog()).resolves.toBeUndefined()
  })
})

describe('readPersistedActivityLog', () => {
  it('asks the backend for the requested number of lines and validates the answer', async () => {
    enterTauri()
    mockInvoke.mockResolvedValue([
      { id: 'a', timestamp: 9, command: 'push_branch', durationMs: 80, status: 'ok' },
      { id: 'b', command: 'broken' },
    ])

    const entries = await readPersistedActivityLog(1200)

    expect(mockInvoke).toHaveBeenCalledWith('read_activity_log', { maxEntries: 1200 })
    expect(entries.map((e) => e.command)).toEqual(['push_branch'])
  })

  it('reads through the RAW invoke, so looking at the log does not append to it', async () => {
    // The journal window polls; going through the instrumented wrapper would add one entry per poll
    // and eventually crowd the real actions out of the lines the pool reads.
    enterTauri()
    mockInvoke.mockResolvedValue([])
    await readPersistedActivityLog(10)

    expect(mockInvoke).toHaveBeenCalledTimes(1)
    expect(mockInvoke.mock.calls[0][0]).toBe('read_activity_log')
  })

  it('has no log to read outside a Tauri window', async () => {
    await expect(readPersistedActivityLog(10)).resolves.toEqual([])
    expect(mockInvoke).not.toHaveBeenCalled()
  })
})

describe('parseActivityLogEntries', () => {
  it('keeps well-formed entries', () => {
    const parsed = parseActivityLogEntries([
      { id: 'a', timestamp: 10, command: 'stage_file', durationMs: 3, status: 'ok' },
    ])
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toMatchObject({ id: 'a', command: 'stage_file', durationMs: 3 })
  })

  it('drops entries missing what makes them usable', () => {
    // The log is a week deep, so it can hold lines written by an older version of the app.
    expect(
      parseActivityLogEntries([
        { id: 'a', timestamp: 1, status: 'ok' }, // no command
        { id: 'b', command: 'push_branch', status: 'ok' }, // no timestamp
        { timestamp: 1, command: 'push_branch', status: 'ok' }, // no id
        { id: 'c', timestamp: 1, command: 'push_branch', status: 'weird' }, // unknown status
        null,
        'nope',
      ])
    ).toEqual([])
  })

  it('defaults the one field callers do arithmetic on', () => {
    const parsed = parseActivityLogEntries([
      { id: 'a', timestamp: 1, command: 'stage_all', status: 'ok' },
    ])
    expect(parsed[0]?.durationMs).toBe(0)
  })

  it('returns nothing for a non-array payload', () => {
    expect(parseActivityLogEntries(undefined)).toEqual([])
    expect(parseActivityLogEntries({ entries: [] })).toEqual([])
  })
})
