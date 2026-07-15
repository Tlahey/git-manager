import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Markdown } from './Markdown'

describe('Markdown — headers', () => {
  it('renders h1/h2/h3 for #, ##, ###', () => {
    render(<Markdown content={'# Title\n## Subtitle\n### Section'} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Title' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Subtitle' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Section' })).toBeInTheDocument()
  })
})

describe('Markdown — lists', () => {
  it('renders unordered list items for "- " and "* " prefixes', () => {
    const { container } = render(<Markdown content={'- first\n* second'} />)
    const items = container.querySelectorAll('ul li')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('first')
    expect(items[1]).toHaveTextContent('second')
  })

  it('renders ordered list items for "1. " style prefixes', () => {
    const { container } = render(<Markdown content={'1. first\n2. second'} />)
    const items = container.querySelectorAll('ol li')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('first')
    expect(items[1]).toHaveTextContent('second')
  })

  it('renders GFM task list items as real checkboxes, not literal "[x]" text', () => {
    const { container } = render(<Markdown content={'- [ ] todo\n- [x] done'} />)
    const checkboxes = container.querySelectorAll('input[type="checkbox"]')
    expect(checkboxes).toHaveLength(2)
    expect(checkboxes[0]).not.toBeChecked()
    expect(checkboxes[1]).toBeChecked()
    expect(checkboxes[0]).toBeDisabled()
    expect(screen.getByText('todo')).toBeInTheDocument()
    expect(screen.getByText('done')).toBeInTheDocument()
    expect(container.textContent).not.toContain('[ ]')
    expect(container.textContent).not.toContain('[x]')
  })

  it('supports uppercase "[X]" and the "*" list marker for task items', () => {
    const { container } = render(<Markdown content="* [X] done via asterisk" />)
    const checkbox = container.querySelector('input[type="checkbox"]')!
    expect(checkbox).toBeChecked()
    expect(screen.getByText('done via asterisk')).toBeInTheDocument()
  })

  it('applies inline formatting inside task list item text', () => {
    render(<Markdown content="- [ ] a **bold** todo" />)
    expect(screen.getByText('bold').tagName).toBe('STRONG')
  })
})

describe('Markdown — interactive checkboxes (onToggleCheckbox)', () => {
  it('stays disabled and non-interactive without the prop', () => {
    const { container } = render(<Markdown content="- [ ] todo" />)
    expect(container.querySelector('input[type="checkbox"]')).toBeDisabled()
  })

  it('becomes clickable when onToggleCheckbox is provided, and reports the checkbox index', async () => {
    const onToggleCheckbox = vi.fn()
    const user = userEvent.setup()
    const { container } = render(
      <Markdown content={'- [ ] first\n- [x] second'} onToggleCheckbox={onToggleCheckbox} />
    )
    const checkboxes = container.querySelectorAll('input[type="checkbox"]')
    expect(checkboxes[0]).toBeEnabled()
    expect(checkboxes[1]).toBeEnabled()

    await user.click(checkboxes[1])
    expect(onToggleCheckbox).toHaveBeenCalledWith(1)

    await user.click(checkboxes[0])
    expect(onToggleCheckbox).toHaveBeenCalledWith(0)
  })

  it('indices skip fenced code blocks, matching toggleMarkdownCheckbox', async () => {
    const onToggleCheckbox = vi.fn()
    const user = userEvent.setup()
    const { container } = render(
      <Markdown
        content={'- [ ] real\n```\n- [ ] fake\n```\n- [ ] also real'}
        onToggleCheckbox={onToggleCheckbox}
      />
    )
    const checkboxes = container.querySelectorAll('input[type="checkbox"]')
    expect(checkboxes).toHaveLength(2)
    await user.click(checkboxes[1])
    expect(onToggleCheckbox).toHaveBeenCalledWith(1)
  })
})

describe('Markdown — blockquotes and paragraphs', () => {
  it('renders a blockquote for "> " prefixed lines', () => {
    render(<Markdown content="> a quoted line" />)
    expect(screen.getByText('a quoted line').closest('blockquote')).toBeInTheDocument()
  })

  it('renders a plain line as a paragraph', () => {
    const { container } = render(<Markdown content="Just a sentence." />)
    expect(container.querySelector('p')).toHaveTextContent('Just a sentence.')
  })

  it('renders a blank spacer for empty lines without crashing', () => {
    const { container } = render(<Markdown content={'para one\n\npara two'} />)
    expect(container.querySelectorAll('p')).toHaveLength(2)
  })
})

describe('Markdown — code blocks', () => {
  it('renders a fenced code block with a language label', () => {
    const { container } = render(<Markdown content={'```ts\nconst a = 1\n```'} />)
    const pre = container.querySelector('pre')!
    expect(pre).toBeInTheDocument()
    expect(pre.querySelector('code')).toHaveTextContent('const a = 1')
    expect(pre.textContent).toContain('ts')
  })

  it('omits the language label when the fence has no language', () => {
    const { container } = render(<Markdown content={'```\nplain code\n```'} />)
    const pre = container.querySelector('pre')!
    expect(pre.querySelector('code')).toHaveTextContent('plain code')
    // no language div is rendered above the <code>
    expect(pre.children).toHaveLength(1)
  })

  it('renders text before and after a code block as normal markdown', () => {
    render(<Markdown content={'# Heading\n```js\ncode()\n```\nAfter text.'} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Heading' })).toBeInTheDocument()
    expect(screen.getByText('After text.')).toBeInTheDocument()
  })
})

describe('Markdown — inline formatting', () => {
  it('renders bold text', () => {
    render(<Markdown content="This is **bold** text." />)
    expect(screen.getByText('bold').tagName).toBe('STRONG')
  })

  it('renders inline code', () => {
    render(<Markdown content="Use `npm install` to set up." />)
    expect(screen.getByText('npm install').tagName).toBe('CODE')
  })

  it('renders a markdown link with target=_blank', () => {
    render(<Markdown content="See [the docs](https://example.com/docs) for more." />)
    const link = screen.getByText('the docs')
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', 'https://example.com/docs')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('applies inline formatting inside list items and blockquotes too', () => {
    render(<Markdown content={'- a **bold** item\n> a `coded` quote'} />)
    expect(screen.getByText('bold').tagName).toBe('STRONG')
    expect(screen.getByText('coded').tagName).toBe('CODE')
  })
})
