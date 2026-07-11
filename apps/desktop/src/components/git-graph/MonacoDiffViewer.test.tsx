import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createRef } from 'react'

vi.mock('@monaco-editor/react', async () => {
  const fake = await import('./__tests__/fakeMonacoDiffEditor')
  return { default: fake.FakeMonacoEditor, DiffEditor: fake.FakeMonacoDiffEditor, loader: { config: vi.fn() } }
})

const { registerAndApplyDynamicTheme } = vi.hoisted(() => ({ registerAndApplyDynamicTheme: vi.fn() }))
vi.mock('../../lib/monacoThemes', () => ({ registerAndApplyDynamicTheme }))

import { MonacoDiffViewer, type MonacoDiffViewerRef } from './MonacoDiffViewer'
import { fakeDiffEditors, resetFakeDiffEditors, lastDiffEditorOptions } from './__tests__/fakeMonacoDiffEditor'

beforeEach(() => {
  vi.clearAllMocks()
  resetFakeDiffEditors()
  lastDiffEditorOptions.clear()
})

function baseProps() {
  return {
    original: 'line1\nline2',
    modified: 'line1\nline2 changed',
    filePath: 'src/a.ts',
    viewMode: 'split' as const,
    activeTab: 'diff' as const,
    ignoreWhitespace: false,
  }
}

describe('MonacoDiffViewer — rendering', () => {
  it('renders the single-pane editor for the "file" tab', async () => {
    render(<MonacoDiffViewer {...baseProps()} activeTab="file" />)
    const editor = await screen.findByTestId('fake-monaco-editor')
    expect(editor).toHaveTextContent('line1 line2 changed')
    expect(editor.dataset.path).toBe('src/a.ts')
  })

  it('renders the diff editor for the "diff" tab with both sides', async () => {
    render(<MonacoDiffViewer {...baseProps()} />)
    await screen.findByTestId('fake-monaco-diff-editor')
    expect(screen.getByTestId('original')).toHaveTextContent('line1 line2')
    expect(screen.getByTestId('modified')).toHaveTextContent('line1 line2 changed')
  })

  it('applies the dynamic theme once Monaco mounts', async () => {
    render(<MonacoDiffViewer {...baseProps()} />)
    await screen.findByTestId('fake-monaco-diff-editor')
    expect(registerAndApplyDynamicTheme).toHaveBeenCalled()
  })

  it('derives the editor options from viewMode/ignoreWhitespace/collapseUnchanged', async () => {
    render(<MonacoDiffViewer {...baseProps()} viewMode="inline" ignoreWhitespace collapseUnchanged />)
    await screen.findByTestId('fake-monaco-diff-editor')
    const options = lastDiffEditorOptions.get('src/a.ts.mod') as {
      renderSideBySide: boolean
      ignoreTrimWhitespace: boolean
      hideUnchangedRegions: { enabled: boolean }
    }
    expect(options.renderSideBySide).toBe(false)
    expect(options.ignoreTrimWhitespace).toBe(true)
    expect(options.hideUnchangedRegions.enabled).toBe(true)
  })
})

describe('MonacoDiffViewer — onChangeCount', () => {
  it('reports the line-change count whenever the diff updates', async () => {
    const onChangeCount = vi.fn()
    render(<MonacoDiffViewer {...baseProps()} onChangeCount={onChangeCount} />)
    await screen.findByTestId('fake-monaco-diff-editor')
    const handle = fakeDiffEditors.get('src/a.ts.mod')!
    handle.setLineChanges([{ modifiedStartLineNumber: 2 }, { modifiedStartLineNumber: 5 }])
    handle.triggerDiffUpdate()
    expect(onChangeCount).toHaveBeenCalledWith(2)
  })
})

describe('MonacoDiffViewer — imperative ref', () => {
  async function mountWithRef(overrides: Partial<ReturnType<typeof baseProps>> = {}) {
    const ref = createRef<MonacoDiffViewerRef>()
    render(<MonacoDiffViewer ref={ref} {...baseProps()} {...overrides} />)
    await screen.findByTestId('fake-monaco-diff-editor')
    return { ref: ref.current!, handle: fakeDiffEditors.get('src/a.ts.mod')! }
  }

  it('goToNextChange moves to the first change after the cursor', async () => {
    const { ref, handle } = await mountWithRef()
    handle.setLineChanges([{ modifiedStartLineNumber: 2 }, { modifiedStartLineNumber: 8 }])
    handle.setCurrentLine(1)
    ref.goToNextChange()
    expect(handle.revealedLines).toEqual([2])
    expect(handle.positionCalls).toEqual([{ lineNumber: 2, column: 1 }])
    expect(handle.focusCalls).toHaveLength(1)
  })

  it('goToNextChange wraps around to the first change past the last one', async () => {
    const { ref, handle } = await mountWithRef()
    handle.setLineChanges([{ modifiedStartLineNumber: 2 }, { modifiedStartLineNumber: 8 }])
    handle.setCurrentLine(8)
    ref.goToNextChange()
    expect(handle.revealedLines).toEqual([2])
  })

  it('goToNextChange does nothing when there are no changes', async () => {
    const { ref, handle } = await mountWithRef()
    handle.setLineChanges([])
    ref.goToNextChange()
    expect(handle.revealedLines).toEqual([])
  })

  it('goToPreviousChange moves to the last change before the cursor', async () => {
    const { ref, handle } = await mountWithRef()
    handle.setLineChanges([{ modifiedStartLineNumber: 2 }, { modifiedStartLineNumber: 8 }])
    handle.setCurrentLine(10)
    ref.goToPreviousChange()
    expect(handle.revealedLines).toEqual([8])
  })

  it('goToPreviousChange wraps around to the last change before the first one', async () => {
    const { ref, handle } = await mountWithRef()
    handle.setLineChanges([{ modifiedStartLineNumber: 2 }, { modifiedStartLineNumber: 8 }])
    handle.setCurrentLine(1)
    ref.goToPreviousChange()
    expect(handle.revealedLines).toEqual([8])
  })

  it('getModifiedValue/setModifiedValue proxy to the modified editor', async () => {
    const { ref, handle } = await mountWithRef()
    expect(ref.getModifiedValue()).toBe(handle.getModifiedEditor().getValue())
    ref.setModifiedValue('new content')
    expect(handle.getModifiedEditor().getValue()).toBe('new content')
  })

  it('imperative methods are no-ops on the "file" tab (no diff editor mounted)', async () => {
    const ref = createRef<MonacoDiffViewerRef>()
    render(<MonacoDiffViewer ref={ref} {...baseProps()} activeTab="file" />)
    await screen.findByTestId('fake-monaco-editor')
    expect(() => ref.current!.goToNextChange()).not.toThrow()
    expect(() => ref.current!.goToPreviousChange()).not.toThrow()
    expect(ref.current!.getModifiedValue()).toBe('')
  })
})
