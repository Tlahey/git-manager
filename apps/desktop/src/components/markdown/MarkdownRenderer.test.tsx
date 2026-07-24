import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MarkdownRenderer } from './MarkdownRenderer'
import { CodeBlock } from './components/CodeBlock'
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
  })

  it('copies code block content to clipboard when copy button is clicked', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    })

    render(<CodeBlock className="language-ts">const greeting = "Hello";</CodeBlock>)

    const copyBtn = screen.getByTestId('code-block-copy-button')
    expect(copyBtn).toBeInTheDocument()

    fireEvent.click(copyBtn)

    expect(writeTextMock).toHaveBeenCalledWith('const greeting = "Hello";')
    await waitFor(() => {
      expect(screen.getByText('Copié')).toBeInTheDocument()
    })
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
      expect(screen.getByText("Impossible d'afficher le diagramme Mermaid")).toBeInTheDocument()
    })
  })
})
