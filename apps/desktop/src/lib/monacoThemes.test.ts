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
import { monacoThemes, registerMonacoThemes, registerAndApplyDynamicTheme } from './monacoThemes'

beforeEach(() => {
  defineTheme.mockReset()
  setTheme.mockReset()
  document.documentElement.removeAttribute('style')
})

afterEach(() => {
  document.documentElement.removeAttribute('style')
})

describe('monacoThemes data', () => {
  it('defines a non-empty set of themes, each with a valid base and populated colors', () => {
    const names = Object.keys(monacoThemes)
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) {
      const theme = monacoThemes[name]
      expect(['vs', 'vs-dark', 'hc-black', 'hc-light']).toContain(theme.base)
      expect(theme.inherit).toBe(true)
      expect(Object.keys(theme.colors).length).toBeGreaterThan(0)
    }
  })
})

describe('registerMonacoThemes', () => {
  it('registers every theme in monacoThemes with monaco.editor.defineTheme', () => {
    registerMonacoThemes()
    expect(defineTheme).toHaveBeenCalledTimes(Object.keys(monacoThemes).length)
    for (const [name, config] of Object.entries(monacoThemes)) {
      expect(defineTheme).toHaveBeenCalledWith(name, config)
    }
  })

  it('swallows errors from an already-defined theme instead of throwing', () => {
    defineTheme.mockImplementationOnce(() => {
      throw new Error('already defined')
    })
    expect(() => registerMonacoThemes()).not.toThrow()
    expect(defineTheme).toHaveBeenCalledTimes(Object.keys(monacoThemes).length)
  })
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
})
