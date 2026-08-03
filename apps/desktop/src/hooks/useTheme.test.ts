import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../api/theme.api', () => ({
  apiGetUserThemes: vi.fn(),
  apiSetWindowVibrancy: vi.fn(),
}))
// Only resolveSystemTheme is stubbed (it reads matchMedia); vibrancyForTheme is a
// pure lookup over the real registry, so the vibrancy tests below assert the
// materials the shipped themes actually declare rather than a fixture.
vi.mock('../lib/themes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/themes')>()),
  resolveSystemTheme: vi.fn(),
}))

import { apiGetUserThemes, apiSetWindowVibrancy } from '../api/theme.api'
import { resolveSystemTheme } from '../lib/themes'
import { useSettingsStore } from '../stores/settings.store'
import { useRepoUIStore } from '../stores/repoUI.store'
import { useTheme } from './useTheme'

const mockedGetUserThemes = apiGetUserThemes as unknown as ReturnType<typeof vi.fn>
const mockedSetVibrancy = apiSetWindowVibrancy as unknown as ReturnType<typeof vi.fn>
const mockedResolveSystemTheme = resolveSystemTheme as unknown as ReturnType<typeof vi.fn>
const DEFAULT_SETTINGS = useSettingsStore.getState().settings

function setThemeSetting(theme: string) {
  useSettingsStore.setState({
    settings: { ...DEFAULT_SETTINGS, appearance: { ...DEFAULT_SETTINGS.appearance, theme } },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS })
  useRepoUIStore.setState({ activeRepo: null })
  mockedGetUserThemes.mockResolvedValue([])
  mockedSetVibrancy.mockResolvedValue(undefined)
  mockedResolveSystemTheme.mockReturnValue('dark')
  document.documentElement.removeAttribute('data-theme')
  document.head.querySelectorAll('[id^="user-theme-"]').forEach((el) => el.remove())
  // jsdom has no native matchMedia — default stub for tests that don't care about its listener
  // wiring; tests specifically about that wiring install their own tracked stub instead.
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ addEventListener: vi.fn(), removeEventListener: vi.fn() })
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useTheme — applying the theme attribute', () => {
  it('applies a concrete theme id directly to <html data-theme>', () => {
    setThemeSetting('dracula')
    renderHook(() => useTheme())
    expect(document.documentElement.dataset.theme).toBe('dracula')
  })

  it('resolves "system" via resolveSystemTheme', () => {
    setThemeSetting('system')
    mockedResolveSystemTheme.mockReturnValue('light')
    renderHook(() => useTheme())
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('re-applies when the theme setting changes', () => {
    setThemeSetting('dark')
    const { rerender } = renderHook(() => useTheme())
    expect(document.documentElement.dataset.theme).toBe('dark')

    setThemeSetting('light')
    rerender()
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('listens for OS color-scheme changes while on "system" and re-resolves on change', () => {
    setThemeSetting('system')
    const listeners: Array<() => void> = []
    const mq = {
      addEventListener: vi.fn((_: string, handler: () => void) => listeners.push(handler)),
      removeEventListener: vi.fn(),
    }
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mq))

    renderHook(() => useTheme())
    expect(mq.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))

    mockedResolveSystemTheme.mockReturnValue('light')
    listeners[0]()
    expect(document.documentElement.dataset.theme).toBe('light')

    vi.unstubAllGlobals()
  })

  it('removes the media-query listener when switching away from "system"', () => {
    setThemeSetting('system')
    const mq = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mq))

    const { rerender } = renderHook(() => useTheme())
    setThemeSetting('dark')
    rerender()

    expect(mq.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    vi.unstubAllGlobals()
  })
})

// The native window material has to track the theme in BOTH directions. Only ever
// applying it would leave the window transparent under an opaque theme — the whole
// app see-through — so switching away must actively clear it.
describe('useTheme — native window material', () => {
  it('requests the material a translucent theme declares', () => {
    setThemeSetting('glass')
    renderHook(() => useTheme())
    expect(mockedSetVibrancy).toHaveBeenCalledWith('under-window', 'light')
  })

  it('clears the material for an opaque theme', () => {
    setThemeSetting('dracula')
    renderHook(() => useTheme())
    expect(mockedSetVibrancy).toHaveBeenCalledWith('none', 'system')
  })

  it('clears the material when switching from a translucent theme to an opaque one', () => {
    setThemeSetting('glass')
    const { rerender } = renderHook(() => useTheme())
    expect(mockedSetVibrancy).toHaveBeenLastCalledWith('under-window', 'light')

    setThemeSetting('light')
    rerender()
    expect(mockedSetVibrancy).toHaveBeenLastCalledWith('none', 'system')
  })

  it('resolves "system" before deciding the material', () => {
    setThemeSetting('system')
    mockedResolveSystemTheme.mockReturnValue('light')
    renderHook(() => useTheme())
    // 'system' itself declares no material; what matters is the theme it resolves to.
    expect(mockedSetVibrancy).toHaveBeenCalledWith('none', 'system')
  })

  it('still applies the theme attribute when the native call rejects', () => {
    mockedSetVibrancy.mockRejectedValue(new Error('no such window'))
    setThemeSetting('glass')
    renderHook(() => useTheme())
    expect(document.documentElement.dataset.theme).toBe('glass')
  })
})

describe('useTheme — repo-aware theme resolution', () => {
  it("applies the active repo's theme override over the global theme", () => {
    setThemeSetting('dark')
    useSettingsStore.getState().setRepoSetting('/repo', 'theme', 'dracula')
    useRepoUIStore.setState({ activeRepo: '/repo' })
    renderHook(() => useTheme())
    expect(document.documentElement.dataset.theme).toBe('dracula')
  })

  it('falls back to the global theme for an active repo with no theme override', () => {
    setThemeSetting('light')
    useSettingsStore.getState().setRepoSetting('/repo', 'protectedBranches', ['main'])
    useRepoUIStore.setState({ activeRepo: '/repo' })
    renderHook(() => useTheme())
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('honors an explicit repoPathOverride (separate windows) regardless of the active repo', () => {
    setThemeSetting('dark')
    useSettingsStore.getState().setRepoSetting('/win-repo', 'theme', 'nord')
    useRepoUIStore.setState({ activeRepo: null })
    renderHook(() => useTheme('/win-repo'))
    expect(document.documentElement.dataset.theme).toBe('nord')
  })

  it('re-applies when the active repo changes to one with a different theme override', () => {
    setThemeSetting('dark')
    useSettingsStore.getState().setRepoSetting('/a', 'theme', 'light')
    useSettingsStore.getState().setRepoSetting('/b', 'theme', 'nord')
    useRepoUIStore.setState({ activeRepo: '/a' })
    const { rerender } = renderHook(() => useTheme())
    expect(document.documentElement.dataset.theme).toBe('light')

    useRepoUIStore.setState({ activeRepo: '/b' })
    rerender()
    expect(document.documentElement.dataset.theme).toBe('nord')
  })
})

describe('useTheme — loading user themes', () => {
  it('injects a <style> tag per user theme on mount', async () => {
    mockedGetUserThemes.mockResolvedValue([{ id: 'custom-1', name: 'Custom', css: '--foo: bar;' }])
    renderHook(() => useTheme())

    await waitFor(() => expect(document.getElementById('user-theme-custom-1')).not.toBeNull())
    expect(document.getElementById('user-theme-custom-1')?.textContent).toBe('--foo: bar;')
  })

  it('removes previously injected user-theme styles before injecting the fresh set', async () => {
    const stale = document.createElement('style')
    stale.id = 'user-theme-stale'
    document.head.appendChild(stale)

    mockedGetUserThemes.mockResolvedValue([{ id: 'fresh', name: 'Fresh', css: '' }])
    renderHook(() => useTheme())

    await waitFor(() => expect(document.getElementById('user-theme-fresh')).not.toBeNull())
    expect(document.getElementById('user-theme-stale')).toBeNull()
  })

  it('does not throw when apiGetUserThemes rejects (e.g. outside Tauri)', async () => {
    mockedGetUserThemes.mockRejectedValue(new Error('not available'))
    expect(() => renderHook(() => useTheme())).not.toThrow()
    await waitFor(() => expect(mockedGetUserThemes).toHaveBeenCalled())
  })
})
