import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useEffect } from 'react'

interface FakeMonacoEditorProps {
  path?: string
  value?: string
  onMount?: (editor: unknown, monacoInstance: unknown) => void
}

function FakeMonacoEditor({ path, value, onMount }: FakeMonacoEditorProps) {
  useEffect(() => {
    onMount?.({}, {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])
  return (
    <div data-testid="fake-monaco-editor" data-path={path}>
      {value}
    </div>
  )
}

// Mock the local Monaco modules (dependency-injection style) rather than `@monaco-editor/react`:
// the package aliases `monaco-editor` to a setup file that self-mocks `@monaco-editor/react`, so a
// module-level mock of it would be clobbered. Feeding a synchronous fake editor also avoids the
// lazy/Suspense round-trip entirely.
const { registerAndApplyDynamicTheme } = vi.hoisted(() => ({
  registerAndApplyDynamicTheme: vi.fn(),
}))
vi.mock('./monaco/setup', () => ({
  MonacoEditor: FakeMonacoEditor,
  languageForFilePath: () => 'typescript',
}))
vi.mock('./monaco/themes', () => ({ registerAndApplyDynamicTheme }))

import { CodeEditor } from './CodeEditor'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CodeEditor', () => {
  it('renders the file contents in a read-only single-pane editor', async () => {
    render(<CodeEditor content="const a = 1" filePath="src/a.ts" />)
    const editor = await screen.findByTestId('fake-monaco-editor')
    expect(editor).toHaveTextContent('const a = 1')
    expect(editor.dataset.path).toBe('src/a.ts')
  })

  it('applies the dynamic theme once Monaco mounts', async () => {
    render(<CodeEditor content="line1" filePath="src/a.ts" />)
    await screen.findByTestId('fake-monaco-editor')
    expect(registerAndApplyDynamicTheme).toHaveBeenCalled()
  })
})
