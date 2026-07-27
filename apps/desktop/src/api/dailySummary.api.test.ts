import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/tauri', () => ({
  saveDailySummary: vi.fn(),
  listDailySummaries: vi.fn(),
  deleteDailySummary: vi.fn(),
  openDailySummariesDir: vi.fn(),
}))

import * as tauri from '../lib/tauri'
import * as api from './dailySummary.api'

const mocked = tauri as unknown as Record<string, ReturnType<typeof vi.fn>>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('dailySummary.api pass-throughs', () => {
  it('apiSaveDailySummary forwards every argument and returns the written path', async () => {
    mocked.saveDailySummary.mockResolvedValue('/archive/a/2026-07-27.md')
    const written = await api.apiSaveDailySummary('/repo/a', '2026-07-27', '# md', true)
    expect(mocked.saveDailySummary).toHaveBeenCalledWith('/repo/a', '2026-07-27', '# md', true)
    expect(written).toBe('/archive/a/2026-07-27.md')
  })

  it('apiListDailySummaries delegates to listDailySummaries', async () => {
    mocked.listDailySummaries.mockResolvedValue([])
    expect(await api.apiListDailySummaries()).toEqual([])
    expect(mocked.listDailySummaries).toHaveBeenCalledOnce()
  })

  it('apiDeleteDailySummary delegates with the file path', async () => {
    mocked.deleteDailySummary.mockResolvedValue(undefined)
    await api.apiDeleteDailySummary('/archive/a/2026-07-27.md')
    expect(mocked.deleteDailySummary).toHaveBeenCalledWith('/archive/a/2026-07-27.md')
  })

  it('apiOpenDailySummariesDir delegates to openDailySummariesDir', async () => {
    mocked.openDailySummariesDir.mockResolvedValue(undefined)
    await api.apiOpenDailySummariesDir()
    expect(mocked.openDailySummariesDir).toHaveBeenCalledOnce()
  })

  it('propagates a backend error rather than swallowing it', async () => {
    mocked.deleteDailySummary.mockRejectedValue(new Error('outside the archive'))
    await expect(api.apiDeleteDailySummary('/etc/passwd')).rejects.toThrow()
  })
})
