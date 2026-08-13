import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState, type RefObject } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { EditorView } from '@codemirror/view'
import { MarkdownLiveEditor } from './MarkdownLiveEditor'
import { useMarkdownLiveEditor } from './useMarkdownLiveEditor'

/** The mounted view, captured from the harness — the same handle the toolbar drives it through. */
let editor: RefObject<EditorView | null> | null = null

function Harness({
  initial = '',
  onChange,
  disabled,
  onFiles,
}: {
  initial?: string
  onChange?: (value: string) => void
  disabled?: boolean
  onFiles?: (files: File[]) => void
}) {
  const [value, setValue] = useState(initial)
  const { viewRef, runCommand } = useMarkdownLiveEditor()
  editor = viewRef
  return (
    <>
      <MarkdownLiveEditor
        value={value}
        onChange={(next) => {
          setValue(next)
          onChange?.(next)
        }}
        viewRef={viewRef}
        onCommand={runCommand}
        disabled={disabled}
        onFiles={onFiles}
        data-testid="live"
      />
      <button type="button" onClick={() => runCommand('bold')}>
        bold
      </button>
      <output data-testid="value">{value}</output>
    </>
  )
}

function doc(): string {
  return editor?.current?.state.doc.toString() ?? ''
}

function select(anchor: number, head: number) {
  act(() => {
    editor?.current?.dispatch({ selection: { anchor, head } })
  })
}

beforeEach(() => {
  editor = null
})

describe('MarkdownLiveEditor', () => {
  it('renders the markdown it is given', () => {
    render(<Harness initial="## Title" />)

    expect(screen.getByTestId('live').textContent).toContain('Title')
  })

  it('formats the selection through the shared commands', async () => {
    render(<Harness initial="hello world" />)
    select(6, 11)

    await userEvent.click(screen.getByRole('button', { name: 'bold' }))

    expect(doc()).toBe('hello **world**')
  })

  it('reports every edit to its owner', () => {
    const onChange = vi.fn()
    render(<Harness initial="a" onChange={onChange} />)

    act(() => {
      editor?.current?.dispatch({ changes: { from: 1, insert: 'b' } })
    })

    expect(onChange).toHaveBeenCalledWith('ab')
  })

  it('takes in a value replaced from outside, without rebuilding the editor', () => {
    const { rerender } = render(<Harness initial="draft" />)
    const view = editor?.current

    rerender(<Harness initial="draft" />)

    expect(editor?.current).toBe(view)
    expect(doc()).toBe('draft')
  })

  it('keeps the caret where it was when its own edit echoes back', async () => {
    render(<Harness initial="hello world" />)
    select(6, 11)

    await userEvent.click(screen.getByRole('button', { name: 'bold' }))

    expect(editor?.current?.state.selection.main.from).toBe(8)
  })

  it('hands a pasted file to its owner instead of inserting it', () => {
    const onFiles = vi.fn()
    render(<Harness initial="x" onFiles={onFiles} />)

    const content = screen.getByTestId('live').querySelector('.cm-content') as HTMLElement
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: {
        files: [new File(['bytes'], 'shot.png', { type: 'image/png' })],
        getData: () => '',
      },
    })
    content.dispatchEvent(event)

    expect(onFiles).toHaveBeenCalledWith([expect.objectContaining({ name: 'shot.png' })])
    expect(event.defaultPrevented).toBe(true)
  })

  it('leaves a plain text paste to CodeMirror', () => {
    const onFiles = vi.fn()
    render(<Harness initial="x" onFiles={onFiles} />)

    const content = screen.getByTestId('live').querySelector('.cm-content') as HTMLElement
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: { files: [], getData: () => 'pasted text' },
    })
    content.dispatchEvent(event)

    expect(onFiles).not.toHaveBeenCalled()
  })

  it('stops accepting input when disabled', () => {
    render(<Harness initial="x" disabled />)

    expect(editor?.current?.state.readOnly || !editor?.current?.dom.isContentEditable).toBe(true)
    expect(screen.getByTestId('live').className).toContain('cursor-not-allowed')
  })
})
