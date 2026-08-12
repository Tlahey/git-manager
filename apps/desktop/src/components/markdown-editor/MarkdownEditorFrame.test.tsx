import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MarkdownEditorFrame } from './MarkdownEditorFrame'

function setUp(value = '# Title\n\nSome **text**.') {
  const onPreviewingChange = vi.fn()
  render(
    <MarkdownEditorFrame value={value} onCommand={vi.fn()} onPreviewingChange={onPreviewingChange}>
      <textarea defaultValue={value} data-testid="editor" />
    </MarkdownEditorFrame>
  )
  return onPreviewingChange
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
    const onPreviewingChange = setUp()

    await showPreview()

    expect(onPreviewingChange).toHaveBeenCalledWith(true)
  })
})
