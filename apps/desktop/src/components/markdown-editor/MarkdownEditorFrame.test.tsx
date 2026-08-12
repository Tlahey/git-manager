import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MarkdownEditorFrame } from './MarkdownEditorFrame'

function setUp(value = '# Title\n\nSome **text**.', richEditor?: ReactNode) {
  const onModeChange = vi.fn()
  render(
    <MarkdownEditorFrame
      value={value}
      onCommand={vi.fn()}
      onModeChange={onModeChange}
      richEditor={richEditor}
    >
      <textarea defaultValue={value} data-testid="editor" />
    </MarkdownEditorFrame>
  )
  return onModeChange
}

async function showPreview() {
  await userEvent.click(screen.getByTestId('markdown-tab-preview'))
}

describe('MarkdownEditorFrame', () => {
  it('opens on the code view, with the formatting bar', () => {
    setUp()

    expect(screen.getByTestId('markdown-toolbar')).toBeInTheDocument()
    expect(screen.queryByTestId('markdown-preview')).not.toBeInTheDocument()
  })

  it('renders the markdown once the preview is picked', async () => {
    setUp()

    await showPreview()

    expect(screen.getByTestId('markdown-preview')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument()
  })

  it('keeps the editor mounted behind the preview, so nothing typed is lost', async () => {
    setUp()

    await showPreview()

    expect(screen.getByTestId('editor')).toBeInTheDocument()
  })

  it('hides the formatting bar while previewing — it has nothing to act on', async () => {
    setUp()

    await showPreview()

    expect(screen.queryByTestId('markdown-toolbar')).not.toBeInTheDocument()
  })

  it('comes back to the editor', async () => {
    setUp()

    await showPreview()
    await userEvent.click(screen.getByTestId('markdown-tab-code'))

    expect(screen.queryByTestId('markdown-preview')).not.toBeInTheDocument()
    expect(screen.getByTestId('markdown-toolbar')).toBeInTheDocument()
  })

  it('says so when there is nothing to preview', async () => {
    setUp('')

    await showPreview()

    expect(screen.getByText('Nothing to preview yet.')).toBeInTheDocument()
  })

  it('reports the switch to a caller that measures the field', async () => {
    const onModeChange = setUp()

    await showPreview()

    expect(onModeChange).toHaveBeenCalledWith('preview')
  })

  it('offers no formatted tab unless one is supplied', () => {
    setUp()

    expect(screen.queryByTestId('markdown-tab-rich')).not.toBeInTheDocument()
  })

  it('shows the formatted editor under its own tab, the raw one staying mounted', async () => {
    setUp('# Title', <div data-testid="rich-editor" />)

    await userEvent.click(screen.getByTestId('markdown-tab-rich'))

    expect(screen.getByTestId('rich-editor')).toBeInTheDocument()
    expect(screen.getByTestId('editor')).toBeInTheDocument()
    expect(screen.getByTestId('markdown-toolbar')).toBeInTheDocument()
  })

  it('sends the toolbar commands to whichever editor is on screen', async () => {
    const onRich = vi.fn()
    render(
      <MarkdownEditorFrame
        value="x"
        onCommand={vi.fn()}
        onRichCommand={onRich}
        richEditor={<div data-testid="rich-editor" />}
      >
        <textarea data-testid="editor" />
      </MarkdownEditorFrame>
    )

    await userEvent.click(screen.getByTestId('markdown-tab-rich'))
    await userEvent.click(screen.getByTestId('markdown-toolbar-bold'))

    expect(onRich).toHaveBeenCalledWith('bold')
  })
})
