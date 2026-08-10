import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const defineTheme = vi.fn()
const setTheme = vi.fn()
vi.mock('monaco-editor', () => ({
  editor: {
    defineTheme: (...args: unknown[]) => defineTheme(...args),
    setTheme: (...args: unknown[]) => setTheme(...args),
  },
}))

import * as monaco from 'monaco-editor'
import { registerAndApplyDynamicTheme, resetDynamicThemeMemo } from './dynamicTheme'

beforeEach(() => {
  defineTheme.mockReset()
  setTheme.mockReset()
  document.documentElement.removeAttribute('style')
  resetDynamicThemeMemo()
})

afterEach(() => {
  document.documentElement.removeAttribute('style')
})

describe('registerAndApplyDynamicTheme', () => {
  it('does nothing when passed a null/undefined monaco instance', () => {
    registerAndApplyDynamicTheme(null)
    registerAndApplyDynamicTheme(undefined)
    expect(defineTheme).not.toHaveBeenCalled()
    expect(setTheme).not.toHaveBeenCalled()
  })

  it('defines and applies a "git-manager-dynamic" theme from the current CSS variables', () => {
    document.documentElement.style.setProperty('--background', '0 0% 100%')
    document.documentElement.style.setProperty('--foreground', '222 84% 5%')

    registerAndApplyDynamicTheme(monaco)

    expect(defineTheme).toHaveBeenCalledTimes(1)
    const [themeName, config] = defineTheme.mock.calls[0]
    expect(themeName).toBe('git-manager-dynamic')
    expect(config.colors['editor.background']).toMatch(/^#[0-9a-f]{6}$/)
    expect(setTheme).toHaveBeenCalledWith('git-manager-dynamic')
  })

  it('picks a light base theme when --background lightness is high', () => {
    document.documentElement.style.setProperty('--background', '0 0% 98%')
    registerAndApplyDynamicTheme(monaco)
    expect(defineTheme.mock.calls[0][1].base).toBe('vs')
  })

  it('picks a dark base theme when --background lightness is low', () => {
    document.documentElement.style.setProperty('--background', '222 84% 5%')
    registerAndApplyDynamicTheme(monaco)
    expect(defineTheme.mock.calls[0][1].base).toBe('vs-dark')
  })

  it('defaults to a dark base theme when --background is not set at all', () => {
    registerAndApplyDynamicTheme(monaco)
    expect(defineTheme.mock.calls[0][1].base).toBe('vs-dark')
  })

  it('falls back to black/white for missing --background/--foreground CSS vars', () => {
    registerAndApplyDynamicTheme(monaco)
    const config = defineTheme.mock.calls[0][1]
    expect(config.colors['editor.background']).toBe('#000000')
    expect(config.colors['editor.foreground']).toBe('#ffffff')
  })

  it('passes through an already-hex CSS variable unchanged', () => {
    document.documentElement.style.setProperty('--primary', '#3b82f6')
    registerAndApplyDynamicTheme(monaco)
    const config = defineTheme.mock.calls[0][1]
    expect(config.colors['editorLink.activeForeground']).toBe('#3b82f6')
  })

  it('logs and swallows errors instead of throwing when defineTheme fails', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    defineTheme.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    expect(() => registerAndApplyDynamicTheme(monaco)).not.toThrow()
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to define or apply dynamic Monaco theme',
      expect.any(Error)
    )
    expect(setTheme).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('skips redefining the theme on a repeat call with unchanged colors, but still re-applies it', () => {
    document.documentElement.style.setProperty('--background', '0 0% 100%')
    registerAndApplyDynamicTheme(monaco)
    registerAndApplyDynamicTheme(monaco)
    expect(defineTheme).toHaveBeenCalledTimes(1)
    expect(setTheme).toHaveBeenCalledTimes(2)
  })

  it('redefines the theme when the resolved colors actually change', () => {
    document.documentElement.style.setProperty('--background', '0 0% 100%')
    registerAndApplyDynamicTheme(monaco)
    document.documentElement.style.setProperty('--background', '222 84% 5%')
    registerAndApplyDynamicTheme(monaco)
    expect(defineTheme).toHaveBeenCalledTimes(2)
  })
})
