import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InlineMarkdown } from './InlineMarkdown'

function renderInline(text: string) {
  const { container } = render(
    <p data-testid="host">
      <InlineMarkdown text={text} />
    </p>
  )
  return container
}

describe('InlineMarkdown', () => {
  /** The component is a fragment on purpose: the caller's element owns the size, the clamp and the
   * colour, and a wrapper would sit between that element and its own text. */
  it('renders straight into the caller’s element, adding no wrapper', () => {
    renderInline('Fix the header')
    const host = screen.getByTestId('host')
    expect(host).toHaveTextContent('Fix the header')
    expect(host.children).toHaveLength(0)
  })

  it('renders bold, italic, strikethrough and code as elements', () => {
    const container = renderInline('**bold** _italic_ ~~gone~~ `code()`')
    expect(container.querySelector('strong')).toHaveTextContent('bold')
    expect(container.querySelector('em')).toHaveTextContent('italic')
    expect(container.querySelector('s')).toHaveTextContent('gone')
    expect(container.querySelector('code')).toHaveTextContent('code()')
  })

  it('shows no marker character of what it rendered', () => {
    renderInline('**Fix** the `use_state` ~~crash~~ in [the editor](https://example.test)')
    expect(screen.getByTestId('host').textContent).toBe('Fix the use_state crash in the editor')
  })

  /** A link's target is not shown and not clickable: what this renders inside — a board card — is
   * itself the click target, and an anchor within it would swallow the click that opens it. */
  it('keeps a link’s text without making it a link', () => {
    const container = renderInline('See [the spec](https://example.test/a)')
    expect(container.querySelector('a')).toBeNull()
    expect(screen.getByTestId('host')).toHaveTextContent('See the spec')
  })

  it('renders nothing for an empty title', () => {
    renderInline('')
    expect(screen.getByTestId('host').textContent).toBe('')
  })
})
