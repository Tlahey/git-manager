import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const apiSetAppIcon = vi.fn()
vi.mock('../api/appIcon.api', () => ({
  apiSetAppIcon: (icon: string) => apiSetAppIcon(icon),
}))

import { useSettingsStore } from '../stores/settings.store'
import { useAppIcon } from './useAppIcon'

const DEFAULT_SETTINGS = useSettingsStore.getState().settings

beforeEach(() => {
  vi.clearAllMocks()
  apiSetAppIcon.mockResolvedValue(undefined)
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS } })
})

describe('useAppIcon', () => {
  it('does not re-apply on mount — Rust already applied the persisted icon before the window', () => {
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        appearance: { ...DEFAULT_SETTINGS.appearance, appIcon: 'neon' },
      },
    })

    renderHook(() => useAppIcon())

    expect(apiSetAppIcon).not.toHaveBeenCalled()
  })

  it('applies the icon when settings.appearance.appIcon changes', async () => {
    renderHook(() => useAppIcon())

    act(() => {
      useSettingsStore.getState().updateSettings({
        appearance: { ...DEFAULT_SETTINGS.appearance, appIcon: '3d' },
      })
    })

    await vi.waitFor(() => {
      expect(apiSetAppIcon).toHaveBeenCalledWith('3d')
    })
    expect(apiSetAppIcon).toHaveBeenCalledTimes(1)
  })

  it('ignores a settings update that leaves the icon alone', () => {
    renderHook(() => useAppIcon())

    act(() => {
      useSettingsStore.getState().updateSettings({
        appearance: { ...DEFAULT_SETTINGS.appearance, fontSize: 15 },
      })
    })

    expect(apiSetAppIcon).not.toHaveBeenCalled()
  })

  it('handles apiSetAppIcon rejections gracefully without throwing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    apiSetAppIcon.mockRejectedValue(new Error('Tauri not running'))

    renderHook(() => useAppIcon())

    act(() => {
      useSettingsStore.getState().updateSettings({
        appearance: { ...DEFAULT_SETTINGS.appearance, appIcon: 'line' },
      })
    })

    await vi.waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith('Failed to apply application icon:', expect.any(Error))
    })

    warnSpy.mockRestore()
  })
})
