import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/tauri', () => ({ setAppIcon: vi.fn() }))

import * as tauri from '../lib/tauri'
import * as api from './appIcon.api'

const mocked = tauri as unknown as Record<string, ReturnType<typeof vi.fn>>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('appIcon.api pass-throughs', () => {
  it('apiSetAppIcon forwards iconName to setAppIcon', async () => {
    mocked.setAppIcon.mockResolvedValue(undefined)
    await api.apiSetAppIcon('neon')
    expect(mocked.setAppIcon).toHaveBeenCalledWith('neon')
  })

  it('apiSetAppIcon propagates rejection when Tauri command fails', async () => {
    mocked.setAppIcon.mockRejectedValue(new Error('Unknown icon'))
    await expect(api.apiSetAppIcon('3d')).rejects.toThrow('Unknown icon')
  })
})
