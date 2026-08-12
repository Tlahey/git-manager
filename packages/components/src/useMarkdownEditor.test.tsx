import { describe, it, expect } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useMarkdownEditor } from './useMarkdownEditor'
import type { MarkdownCommandId } from './markdownCommands'

function Harness({ initial, command }: { initial: string; command: MarkdownCommandId }) {
  const [value, setValue] = useState(initial)
  const { textareaRef, runCommand, handleKeyDown } = useMarkdownEditor(setValue)
  return (
    <>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        data-testid="editor"
      />
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => runCommand(command)}
      >
        apply
      </button>
    </>
  )
}

function setUp(initial: string, command: MarkdownCommandId = 'bold') {
  render(<Harness initial={initial} command={command} />)
  return screen.getByTestId('editor') as HTMLTextAreaElement
}

/**
 * jsdom's textarea keeps `scrollTop` at 0 whatever happens, so the regression this guards against —
 * WebKit resetting the scroll when `value` is assigned — cannot happen on its own here. Faking it
 * on the element is what makes the assertion mean something: without the save/restore in the hook,
 * the scroll would come back as 0.
 */
function fakeScrollResetOnValueWrite(element: HTMLTextAreaElement, scrollTop: number) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')
  let scroll = scrollTop
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => scroll,
    set: (next: number) => {
      scroll = next
    },
  })
  Object.defineProperty(element, 'value', {
    configurable: true,
    get: () => descriptor?.get?.call(element) as string,
    set: (next: string) => {
      descriptor?.set?.call(element, next)
      scroll = 0
    },
  })
  return () => scroll
}

describe('useMarkdownEditor', () => {
  it('applies the command to the current selection and reports the new value', async () => {
    const editor = setUp('hello world')
    editor.setSelectionRange(6, 11)

    await userEvent.click(screen.getByRole('button', { name: 'apply' }))

    expect(editor.value).toBe('hello **world**')
  })

  it('leaves the formatted text selected', async () => {
    const editor = setUp('hello world')
    editor.setSelectionRange(6, 11)

    await userEvent.click(screen.getByRole('button', { name: 'apply' }))

    expect([editor.selectionStart, editor.selectionEnd]).toEqual([8, 13])
  })

  it('does not move the scroll position when a style is applied', async () => {
    const editor = setUp('hello world')
    const readScroll = fakeScrollResetOnValueWrite(editor, 120)
    editor.setSelectionRange(6, 11)

    await userEvent.click(screen.getByRole('button', { name: 'apply' }))

    expect(readScroll()).toBe(120)
  })

  it('runs the command bound to a keyboard shortcut', async () => {
    const editor = setUp('hello world')

    // `type` clicks the field first, which would collapse a selection set by hand.
    await userEvent.type(editor, '{Meta>}b{/Meta}', {
      initialSelectionStart: 6,
      initialSelectionEnd: 11,
    })

    expect(editor.value).toBe('hello **world**')
  })

  it('runs the shifted shortcuts', async () => {
    const editor = setUp('hello world')

    await userEvent.type(editor, '{Meta>}{Shift>}x{/Shift}{/Meta}', {
      initialSelectionStart: 6,
      initialSelectionEnd: 11,
    })

    expect(editor.value).toBe('hello ~~world~~')
  })

  it('ignores a plain keystroke', async () => {
    const editor = setUp('hi')
    editor.setSelectionRange(2, 2)

    await userEvent.type(editor, 'b')

    expect(editor.value).toBe('hib')
  })

  it('does nothing when the command has no edit to make', async () => {
    const editor = setUp('text', 'escape')
    editor.setSelectionRange(2, 2)

    await userEvent.click(screen.getByRole('button', { name: 'apply' }))

    expect(editor.value).toBe('text')
  })
})
