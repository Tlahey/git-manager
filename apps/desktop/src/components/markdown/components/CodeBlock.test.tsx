import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

vi.mock('./MermaidBlock', () => ({
  MermaidBlock: ({ code }: { code: string }) => <div data-testid="mermaid-block">{code}</div>,
}))

import { CodeBlock } from './CodeBlock'

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  })
})

describe('CodeBlock — inline vs fenced', () => {
  it('renders inline code as a bare styled <code>, with no copy affordance', () => {
    render(<CodeBlock inline>const x = 1</CodeBlock>)

    expect(screen.getByTestId('inline-code')).toHaveTextContent('const x = 1')
    expect(screen.queryByTestId('code-block')).not.toBeInTheDocument()
    expect(screen.queryByTestId('code-block-copy-button')).not.toBeInTheDocument()
  })

  it('only treats code as inline when explicitly told to, never by guessing from className', () => {
    // MarkdownRenderer is the one place that decides inline vs. fenced (it also checks for a
    // newline, which className alone can't do) and always passes `inline` explicitly — so absent
    // that flag, a bare `!className` guess must not override it. See the regression below for the
    // case this used to break: a fenced block with no language tag.
    render(<CodeBlock>plain</CodeBlock>)
    expect(screen.queryByTestId('inline-code')).not.toBeInTheDocument()
    expect(screen.getByTestId('code-block')).toBeInTheDocument()
  })

  it('renders a fenced block with no language tag as a real code block, not inline text', () => {
    // Regression: a plain ``` fence (no language) also has no `className`, which CodeBlock used to
    // read as "this must be inline" — even though MarkdownRenderer correctly computed `inline=false`
    // for it (multi-line content). The explicit `inline` flag must win.
    render(<CodeBlock inline={false}>{'a/\nb/\nc/\n'}</CodeBlock>)
    expect(screen.queryByTestId('inline-code')).not.toBeInTheDocument()
    expect(screen.getByTestId('code-block')).toBeInTheDocument()
    expect(screen.getByText('TEXT')).toBeInTheDocument()
  })

  it('renders a fenced block with its language in the header', () => {
    render(<CodeBlock className="language-ts">const greeting = 'hi'</CodeBlock>)

    expect(screen.getByTestId('code-block')).toBeInTheDocument()
    expect(screen.getByText('TS')).toBeInTheDocument()
  })

  it('labels a fence with no recognised language rather than showing an empty header', () => {
    render(<CodeBlock className="language-">x</CodeBlock>)
    expect(screen.getByText('TEXT')).toBeInTheDocument()
  })

  it('hands a mermaid fence to the diagram renderer instead of printing it', () => {
    render(<CodeBlock className="language-mermaid">{'graph TD;\n A-->B;'}</CodeBlock>)

    expect(screen.getByTestId('mermaid-block')).toHaveTextContent('graph TD;')
    expect(screen.queryByTestId('code-block')).not.toBeInTheDocument()
  })
})

// `fireEvent`, not `userEvent`: setting the latter up swaps in its own `navigator.clipboard` stub,
// which is precisely the thing under test here (same reason as MarkdownRenderer.test.tsx).
describe('CodeBlock — copying', () => {
  it('copies the code without the trailing newline markdown leaves behind', async () => {
    render(<CodeBlock className="language-ts">{'const a = 1\n'}</CodeBlock>)

    fireEvent.click(screen.getByTestId('code-block-copy-button'))

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('const a = 1')
  })

  it('confirms the copy in the interface language, then goes back to the idle label', async () => {
    vi.useFakeTimers()
    render(<CodeBlock className="language-ts">code</CodeBlock>)
    expect(screen.getByText('Copy')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByTestId('code-block-copy-button'))
    })
    expect(screen.getByText('Copied')).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByText('Copy')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('survives a clipboard the webview refuses, without losing the block', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    })
    render(<CodeBlock className="language-ts">code</CodeBlock>)

    await act(async () => {
      fireEvent.click(screen.getByTestId('code-block-copy-button'))
    })

    expect(error).toHaveBeenCalled()
    // Still idle, still readable: a refused clipboard must not claim success.
    expect(screen.getByText('Copy')).toBeInTheDocument()
    error.mockRestore()
  })
})
