import { describe, it, expect, vi, afterEach } from 'vitest'
import { BUILTIN_THEMES, getBuiltinTheme, resolveSystemTheme } from './themes'

describe('BUILTIN_THEMES', () => {
  it('has unique, non-empty ids', () => {
    const ids = BUILTIN_THEMES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBeGreaterThan(0)
  })

  it('the "system" pseudo-theme has null colors', () => {
    expect(BUILTIN_THEMES.find((t) => t.id === 'system')?.colors).toBeNull()
  })

  it('every non-system theme declares a full color set', () => {
    for (const theme of BUILTIN_THEMES) {
      if (theme.id === 'system') continue
      expect(theme.colors).toMatchObject({
        bg: expect.stringMatching(/^#[0-9a-f]{6}$/),
        fg: expect.stringMatching(/^#[0-9a-f]{6}$/),
        primary: expect.stringMatching(/^#[0-9a-f]{6}$/),
        accent: expect.stringMatching(/^#[0-9a-f]{6}$/),
      })
    }
  })
})

describe('getBuiltinTheme', () => {
  it('finds a theme by id', () => {
    expect(getBuiltinTheme('dracula')?.labelKey).toBe('settings.appearance.theme.dracula')
  })

  it('returns undefined for an unknown id', () => {
    expect(getBuiltinTheme('does-not-exist')).toBeUndefined()
  })
})

describe('resolveSystemTheme', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns "dark" when the OS prefers dark', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    expect(resolveSystemTheme()).toBe('dark')
  })

  it('returns "light" when the OS does not prefer dark', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    expect(resolveSystemTheme()).toBe('light')
  })

  it('queries the dark-color-scheme media feature', () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: false })
    vi.stubGlobal('matchMedia', matchMedia)
    resolveSystemTheme()
    expect(matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)')
  })
})
