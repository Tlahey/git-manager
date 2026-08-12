import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MarkdownRenderer } from '../MarkdownRenderer'

/** Driven through the real renderer rather than the component alone: what a blockquote's children
 * actually look like is remark's business, and that is exactly what the parser depends on. */
function renderMarkdown(content: string) {
  render(<MarkdownRenderer content={content} />)
}

describe('MarkdownBlockquote', () => {
  it('renders a GitHub alert with its own title', () => {
    renderMarkdown('> [!WARNING]\n> Force-pushing rewrites history.')

    expect(screen.getByTestId('markdown-alert-warning')).toBeInTheDocument()
    expect(screen.getByText('Warning')).toBeInTheDocument()
    expect(screen.getByText('Force-pushing rewrites history.')).toBeInTheDocument()
  })

  it('never leaves the marker visible', () => {
    renderMarkdown('> [!NOTE]\n> Nothing to worry about.')

    expect(screen.queryByText(/\[!NOTE\]/)).not.toBeInTheDocument()
  })

  it('renders each kind under its own testid', () => {
    renderMarkdown(
      ['> [!NOTE]\n> a', '> [!TIP]\n> b', '> [!IMPORTANT]\n> c', '> [!CAUTION]\n> d'].join('\n\n')
    )

    for (const kind of ['note', 'tip', 'important', 'caution']) {
      expect(screen.getByTestId(`markdown-alert-${kind}`)).toBeInTheDocument()
    }
  })

  it('keeps rendering an ordinary quote as a quote', () => {
    renderMarkdown('> Someone else said this.')

    expect(screen.queryByTestId('markdown-alert-note')).not.toBeInTheDocument()
    expect(screen.getByText('Someone else said this.')).toBeInTheDocument()
  })
})
