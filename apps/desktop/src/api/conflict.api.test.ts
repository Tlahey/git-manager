import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/tauri', () => ({
  listConflictedFiles: vi.fn(),
  getMergeView: vi.fn(),
  autoMergeConflictView: vi.fn(),
  resolveConflict: vi.fn(),
  resolveConflictBinary: vi.fn(),
}))

import * as tauri from '../lib/tauri'
import * as api from './conflict.api'

const mocked = tauri as unknown as Record<string, ReturnType<typeof vi.fn>>
const PATH = '/repo/a'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('conflict.api pass-throughs', () => {
  it('apiListConflictedFiles delegates to listConflictedFiles', async () => {
    mocked.listConflictedFiles.mockResolvedValue(['a.ts'])
    expect(await api.apiListConflictedFiles(PATH)).toEqual(['a.ts'])
    expect(mocked.listConflictedFiles).toHaveBeenCalledWith(PATH)
  })

  it('apiGetMergeView delegates to getMergeView', async () => {
    const view = { blocks: [] }
    mocked.getMergeView.mockResolvedValue(view)
    expect(await api.apiGetMergeView(PATH, 'a.ts')).toBe(view)
    expect(mocked.getMergeView).toHaveBeenCalledWith(PATH, 'a.ts')
  })

  it('apiAutoMergeConflictView delegates to autoMergeConflictView', async () => {
    mocked.autoMergeConflictView.mockResolvedValue('merged text')
    expect(await api.apiAutoMergeConflictView(PATH, 'a.ts')).toBe('merged text')
    expect(mocked.autoMergeConflictView).toHaveBeenCalledWith(PATH, 'a.ts')
  })

  it('apiResolveConflict delegates to resolveConflict with the resolved content', async () => {
    mocked.resolveConflict.mockResolvedValue(undefined)
    await api.apiResolveConflict(PATH, 'a.ts', 'resolved content')
    expect(mocked.resolveConflict).toHaveBeenCalledWith(PATH, 'a.ts', 'resolved content')
  })

  it('apiResolveConflictBinary delegates to resolveConflictBinary with the chosen side', async () => {
    mocked.resolveConflictBinary.mockResolvedValue(undefined)
    await api.apiResolveConflictBinary(PATH, 'image.png', 'theirs')
    expect(mocked.resolveConflictBinary).toHaveBeenCalledWith(PATH, 'image.png', 'theirs')
  })
})
