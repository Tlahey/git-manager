import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/tauri', () => ({
  getMergeTargetStatus: vi.fn(),
}))

import * as tauri from '../lib/tauri'
import * as api from './mergeTarget.api'

const mocked = tauri as unknown as Record<string, ReturnType<typeof vi.fn>>
const PATH = '/repo/a'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('mergeTarget.api', () => {
  it('apiGetMergeTargetStatus delegates to getMergeTargetStatus with the candidate list', async () => {
    mocked.getMergeTargetStatus.mockResolvedValue({ target: 'origin/main' })

    const result = await api.apiGetMergeTargetStatus(PATH, ['origin/main', 'origin/master'])

    expect(mocked.getMergeTargetStatus).toHaveBeenCalledWith(PATH, [
      'origin/main',
      'origin/master',
    ])
    expect(result).toEqual({ target: 'origin/main' })
  })
})
