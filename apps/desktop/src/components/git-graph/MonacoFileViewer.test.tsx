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

vi.mock('@monaco-editor/react', () => ({
  default: FakeMonacoEditor,
  loader: { config: vi.fn() },
}))

const { registerAndApplyDynamicTheme } = vi.hoisted(() => ({
  registerAndApplyDynamicTheme: vi.fn(),
}))
vi.mock('../../lib/monacoThemes', () => ({ registerAndApplyDynamicTheme }))

import { MonacoFileViewer } from './MonacoFileViewer'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('MonacoFileViewer', () => {
  it('renders the file contents in a read-only single-pane editor', async () => {
    render(<MonacoFileViewer content="const a = 1" filePath="src/a.ts" />)
    const editor = await screen.findByTestId('fake-monaco-editor')
    expect(editor).toHaveTextContent('const a = 1')
    expect(editor.dataset.path).toBe('src/a.ts')
  })

  it('applies the dynamic theme once Monaco mounts', async () => {
    render(<MonacoFileViewer content="line1" filePath="src/a.ts" />)
    await screen.findByTestId('fake-monaco-editor')
    expect(registerAndApplyDynamicTheme).toHaveBeenCalled()
  })
})
