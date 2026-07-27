import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/tauri', () => ({ getUserThemes: vi.fn(), setWindowVibrancy: vi.fn() }))

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

  it('apiSetWindowVibrancy forwards the requested material', async () => {
    mocked.setWindowVibrancy.mockResolvedValue(undefined)
    await api.apiSetWindowVibrancy('sidebar', 'light')
    expect(mocked.setWindowVibrancy).toHaveBeenCalledWith('sidebar', 'light')
  })

  // The effect is decoration and is unavailable off macOS / in browser dev mode.
  // A rejection here must not surface: the caller applies the theme regardless.
  it('apiSetWindowVibrancy swallows a rejection from the native side', async () => {
    mocked.setWindowVibrancy.mockRejectedValue(new Error('unsupported platform'))
    await expect(api.apiSetWindowVibrancy('none', 'system')).resolves.toBeUndefined()
  })
})
