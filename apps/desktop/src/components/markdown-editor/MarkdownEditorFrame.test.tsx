import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MarkdownEditorFrame } from './MarkdownEditorFrame'

function setUp() {
  const onModeChange = vi.fn()
  const onCommand = vi.fn()
  const onRichCommand = vi.fn()
  render(
    <MarkdownEditorFrame
      onCommand={onCommand}
      onRichCommand={onRichCommand}
      onModeChange={onModeChange}
      richEditor={<div data-testid="rich-editor" />}
    >
      <textarea data-testid="editor" />
    </MarkdownEditorFrame>
  )
  return { onModeChange, onCommand, onRichCommand }
}

describe('MarkdownEditorFrame', () => {
  it('opens on the formatted mode', () => {
    setUp()

    expect(screen.getByTestId('rich-editor')).toBeInTheDocument()
    expect(screen.getByTestId('markdown-toolbar')).toBeInTheDocument()
  })

  it('offers the raw markdown as the other mode', async () => {
    setUp()

    await userEvent.click(screen.getByTestId('markdown-tab-code'))

    expect(screen.getByTestId('editor')).toBeInTheDocument()
  })

  it('keeps both editors mounted, so nothing typed is lost on a switch', async () => {
    setUp()

    await userEvent.click(screen.getByTestId('markdown-tab-code'))

    expect(screen.getByTestId('editor')).toBeInTheDocument()
    expect(screen.getByTestId('rich-editor')).toBeInTheDocument()
  })

  it('sends the toolbar commands to whichever editor is on screen', async () => {
    const { onCommand, onRichCommand } = setUp()

    await userEvent.click(screen.getByTestId('markdown-toolbar-bold'))
    expect(onRichCommand).toHaveBeenCalledWith('bold')

    await userEvent.click(screen.getByTestId('markdown-tab-code'))
    await userEvent.click(screen.getByTestId('markdown-toolbar-bold'))
    expect(onCommand).toHaveBeenCalledWith('bold')
  })

  it('reports the switch to a caller that measures the raw field', async () => {
    const { onModeChange } = setUp()

    await userEvent.click(screen.getByTestId('markdown-tab-code'))

    expect(onModeChange).toHaveBeenCalledWith('code')
  })

  it('no longer carries a read-only preview', () => {
    setUp()

    expect(screen.queryByTestId('markdown-tab-preview')).not.toBeInTheDocument()
  })
})
