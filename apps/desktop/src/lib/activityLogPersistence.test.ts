import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }))

import { persistActivityEntry, flushActivityLog } from './activityLogPersistence'
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
