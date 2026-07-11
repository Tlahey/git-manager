import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/tauri', () => ({ unpinObject: vi.fn(), objectsExist: vi.fn() }))

import * as tauri from '../lib/tauri'
import * as api from './undoSupport.api'

const mocked = tauri as unknown as Record<string, ReturnType<typeof vi.fn>>
const PATH = '/repo/a'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('undoSupport.api pass-throughs', () => {
  it('apiUnpinObject delegates to unpinObject', async () => {
    mocked.unpinObject.mockResolvedValue(undefined)
    await api.apiUnpinObject(PATH, 'refs/git-manager/undo/x')
    expect(mocked.unpinObject).toHaveBeenCalledWith(PATH, 'refs/git-manager/undo/x')
  })

  it('apiObjectsExist delegates to objectsExist and returns its result', async () => {
    mocked.objectsExist.mockResolvedValue([true, false])
    const result = await api.apiObjectsExist(PATH, ['oid1', 'oid2'])
    expect(result).toEqual([true, false])
    expect(mocked.objectsExist).toHaveBeenCalledWith(PATH, ['oid1', 'oid2'])
  })
})
