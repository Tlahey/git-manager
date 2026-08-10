import { describe, it, expect, vi, beforeEach } from 'vitest'

const defineTheme = vi.fn()
vi.mock('monaco-editor', () => ({
  editor: {
    defineTheme: (...args: unknown[]) => defineTheme(...args),
  },
}))

import { monacoThemes, registerMonacoThemes } from './themes'

beforeEach(() => {
  defineTheme.mockReset()
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
