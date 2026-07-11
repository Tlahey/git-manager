import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/tauri', () => ({ getUserThemes: vi.fn() }))

import * as tauri from '../lib/tauri'
import * as api from './theme.api'

const mocked = tauri as unknown as Record<string, ReturnType<typeof vi.fn>>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('theme.api pass-throughs', () => {
  it('apiGetUserThemes delegates to getUserThemes', async () => {
    mocked.getUserThemes.mockResolvedValue([{ id: 'custom-1' }])
    expect(await api.apiGetUserThemes()).toEqual([{ id: 'custom-1' }])
    expect(mocked.getUserThemes).toHaveBeenCalledOnce()
  })
})
