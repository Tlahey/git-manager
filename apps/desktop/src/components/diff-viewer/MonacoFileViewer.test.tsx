import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

// Capture the props the wrapper forwards to the library's presentational CodeEditor.
const { codeEditorSpy } = vi.hoisted(() => ({ codeEditorSpy: vi.fn() }))
vi.mock('@git-manager/editor', () => ({
  CodeEditor: (props: Record<string, unknown>) => {
    codeEditorSpy(props)
    return null
  },
}))

import { MonacoFileViewer } from './MonacoFileViewer'
import { useSettingsStore } from '../../stores/settings.store'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('MonacoFileViewer (app wrapper)', () => {
  it('forwards content/filePath and the store theme + sticky-scroll to CodeEditor', () => {
    useSettingsStore.setState((s) => ({
      settings: {
        ...s.settings,
        appearance: { ...s.settings.appearance, theme: 'git-manager-nord', stickyScroll: true },
      },
    }))

    const onMount = vi.fn()
    render(<MonacoFileViewer content="const a = 1" filePath="src/a.ts" onMount={onMount} />)

    expect(codeEditorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'const a = 1',
        filePath: 'src/a.ts',
        theme: 'git-manager-nord',
        stickyScroll: true,
        onMount,
      })
    )
  })
})
