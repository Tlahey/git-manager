import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/tauri', () => ({
  openActivityLogsDir: vi.fn().mockResolvedValue(undefined),
  openAiLogsDir: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../lib/activityLogPersistence', () => ({ readPersistedActivityLog: vi.fn() }))

import { openActivityLogsDir, openAiLogsDir } from '../lib/tauri'
import { readPersistedActivityLog } from '../lib/activityLogPersistence'
import { apiOpenActivityLogsDir, apiOpenAiLogsDir, apiReadActivityLog } from './activityLog.api'

const mockedRead = readPersistedActivityLog as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('activityLog.api', () => {
  it('reveals each log directory through its own command', async () => {
    await apiOpenActivityLogsDir()
    await apiOpenAiLogsDir()
    expect(openActivityLogsDir).toHaveBeenCalledTimes(1)
    expect(openAiLogsDir).toHaveBeenCalledTimes(1)
  })

  it('forwards the read budget and returns the validated entries', async () => {
    const entries = [
      { id: 'a', timestamp: 5, command: 'stage_file', durationMs: 2, status: 'ok' as const },
    ]
    mockedRead.mockResolvedValue(entries)

    await expect(apiReadActivityLog(1500)).resolves.toEqual(entries)
    expect(mockedRead).toHaveBeenCalledWith(1500)
  })

  it('reads through the unlogged path, so looking at the log does not fill it', async () => {
    // The one call in the app that must not be recorded: routed through
    // `activityLogPersistence.ts`'s raw invoke rather than the instrumented wrapper in `lib/tauri.ts`.
    mockedRead.mockResolvedValue([])
    await apiReadActivityLog(10)

    expect(Object.keys(await import('../lib/tauri'))).not.toContain('readActivityLog')
  })
})
