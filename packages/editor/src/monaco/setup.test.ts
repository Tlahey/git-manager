import { describe, it, expect, vi } from 'vitest'

const { config } = vi.hoisted(() => ({ config: vi.fn() }))
vi.mock('@monaco-editor/react', () => ({
  loader: { config },
  DiffEditor: () => null,
  default: () => null,
}))
// Mock `monaco-editor` at the test level too: the package aliases bare `monaco-editor` imports to
// `.storybook/vitest.setup.ts`, which self-mocks `@monaco-editor/react` — importing it here would
// clobber the loader mock above. Mocking `monaco-editor` short-circuits that alias entirely.
vi.mock('monaco-editor', () => ({ editor: {}, languages: {}, default: {} }))

import * as monaco from 'monaco-editor'
import { languageForFilePath, MonacoEditor, MonacoDiffEditor } from './setup'

describe('module-level side effect', () => {
  it('configures the @monaco-editor/react loader with the local monaco instance once on import', () => {
    expect(config).toHaveBeenCalledWith({ monaco })
    expect(config).toHaveBeenCalledOnce()
  })
})

describe('lazy Monaco component references', () => {
  it('exposes lazy-loaded editor and diff-editor components', () => {
    expect(MonacoEditor).toBeDefined()
    expect(MonacoDiffEditor).toBeDefined()
    expect(typeof MonacoEditor).toBe('object')
    expect(typeof MonacoDiffEditor).toBe('object')
  })
})

describe('languageForFilePath', () => {
  it.each([
    ['App.tsx', 'typescript'],
    ['index.ts', 'typescript'],
    ['component.jsx', 'javascript'],
    ['script.js', 'javascript'],
    ['main.py', 'python'],
    ['lib.rs', 'rust'],
    ['styles.css', 'css'],
    ['page.html', 'html'],
    ['README.md', 'markdown'],
    ['data.json', 'json'],
    ['run.sh', 'shellscript'],
  ])('maps %s to %s', (path, expected) => {
    expect(languageForFilePath(path)).toBe(expected)
  })

  it('is case-insensitive on the extension', () => {
    expect(languageForFilePath('Script.TS')).toBe('typescript')
  })

  it('falls back to "text" for unknown or missing extensions', () => {
    expect(languageForFilePath('Makefile')).toBe('text')
    expect(languageForFilePath('data.unknownext')).toBe('text')
  })

  it('uses only the final extension for multi-dot filenames', () => {
    expect(languageForFilePath('archive.tar.gz')).toBe('text')
    expect(languageForFilePath('component.test.ts')).toBe('typescript')
  })

  it('resolves a nested path by its basename extension', () => {
    expect(languageForFilePath('src/components/Foo.tsx')).toBe('typescript')
  })
})
