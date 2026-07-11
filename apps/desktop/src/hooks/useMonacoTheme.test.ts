import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const { config } = vi.hoisted(() => ({ config: vi.fn() }))
vi.mock('@monaco-editor/react', () => ({ loader: { config } }))

const registerAndApplyDynamicTheme = vi.fn()
vi.mock('../lib/monacoThemes', () => ({ registerAndApplyDynamicTheme: (...args: unknown[]) => registerAndApplyDynamicTheme(...args) }))

import { useSettingsStore } from '../stores/settings.store'
import { useMonacoTheme } from './useMonacoTheme'
import * as monaco from 'monaco-editor'

const DEFAULT_SETTINGS = useSettingsStore.getState().settings
// Captured before any test's beforeEach clears mock call history — `loader.config(...)` is a
// module-level side effect that only fires once, at import time.
const configCallsOnImport = [...config.mock.calls]

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS })
})

describe('useMonacoTheme', () => {
  it('configures the @monaco-editor/react loader with the local monaco instance on import', () => {
    expect(configCallsOnImport).toEqual([[{ monaco }]])
  })

  it('registers and applies the dynamic theme after mounting (next animation frame)', async () => {
    renderHook(() => useMonacoTheme())
    await vi.waitFor(() => expect(registerAndApplyDynamicTheme).toHaveBeenCalledWith(monaco))
  })

  it('re-registers the theme when the appearance theme setting changes', async () => {
    const { rerender } = renderHook(() => useMonacoTheme())
    await vi.waitFor(() => expect(registerAndApplyDynamicTheme).toHaveBeenCalledTimes(1))

    useSettingsStore.getState().updateSettings({ appearance: { ...DEFAULT_SETTINGS.appearance, theme: 'light' } })
    rerender()

    await vi.waitFor(() => expect(registerAndApplyDynamicTheme).toHaveBeenCalledTimes(2))
  })

  it('cancels the pending animation frame on unmount', () => {
    const cancelSpy = vi.spyOn(globalThis, 'cancelAnimationFrame')
    const { unmount } = renderHook(() => useMonacoTheme())
    unmount()
    expect(cancelSpy).toHaveBeenCalled()
  })
})
