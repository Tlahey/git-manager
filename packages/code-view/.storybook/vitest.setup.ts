import { vi, beforeAll } from 'vitest'
import { setProjectAnnotations } from '@storybook/react'
import * as projectAnnotations from './preview'

// Mock monaco-editor and @monaco-editor/react because they require browser environments
// and fail under JSDOM/Node resolver.
vi.mock('monaco-editor', () => {
  return {
    Range: class {
      constructor(public startLine: number, public startCol: number, public endLine: number, public endCol: number) {}
    },
    editor: {
      create: vi.fn(() => ({
        dispose: vi.fn(),
        getValue: vi.fn(),
        setValue: vi.fn(),
        setHiddenAreas: vi.fn(),
      })),
    },
  }
})

vi.mock('@monaco-editor/react', () => {
  return {
    loader: {
      config: vi.fn(),
      init: vi.fn(() => Promise.resolve({})),
    },
    default: vi.fn(() => null),
  }
})

const project = setProjectAnnotations([projectAnnotations])
beforeAll(project.beforeAll)
