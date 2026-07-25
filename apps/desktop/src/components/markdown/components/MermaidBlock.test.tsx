import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const { initialize, mermaidRender } = vi.hoisted(() => ({
  initialize: vi.fn(),
  mermaidRender: vi.fn(async (_id: string, code: string) => {
    if (code.includes('boom')) throw new Error('Syntax error in graph')
    return { svg: `<svg data-testid="rendered-svg">${code}</svg>` }
  }),
}))
vi.mock('mermaid', () => ({ default: { initialize, render: mermaidRender } }))

import { MermaidBlock } from './MermaidBlock'

beforeEach(() => {
  vi.clearAllMocks()
  document.documentElement.dataset.theme = ''
  document.documentElement.classList.remove('dark')
})

describe('MermaidBlock — rendering', () => {
  it('renders the diagram it was given', async () => {
    render(<MermaidBlock code="graph TD; A-->B;" />)

    await waitFor(() => expect(screen.getByTestId('rendered-svg')).toBeInTheDocument())
    expect(mermaidRender).toHaveBeenCalledWith(expect.any(String), 'graph TD; A-->B;')
  })

  it('unescapes the entities the markdown pipeline leaves in a fence', async () => {
    // `A --> B["x"]` reaches the component with its quotes and angle brackets escaped.
    render(<MermaidBlock code={'graph TD; A--&gt;B[&quot;x&quot;];'} />)

    await waitFor(() => expect(mermaidRender).toHaveBeenCalled())
    expect(mermaidRender.mock.calls[0][1]).toBe('graph TD; A-->B["x"];')
  })

  it('renders nothing at all for an empty fence, rather than an error banner', async () => {
    render(<MermaidBlock code="   " />)

    await waitFor(() => expect(screen.queryByTestId('mermaid-loading')).not.toBeInTheDocument())
    expect(mermaidRender).not.toHaveBeenCalled()
    expect(screen.queryByTestId('mermaid-error-fallback')).not.toBeInTheDocument()
  })
})

describe('MermaidBlock — security and theming', () => {
  it('renders at the strict security level, since the diagram comes from untrusted markdown', async () => {
    // The SVG is injected with dangerouslySetInnerHTML; `loose` would let a README or a PR
    // description put its own markup inside a node label.
    render(<MermaidBlock code="graph TD; A-->B;" />)

    await waitFor(() => expect(initialize).toHaveBeenCalled())
    expect(initialize.mock.calls[0][0]).toMatchObject({ securityLevel: 'strict' })
  })

  it('picks the dark diagram theme from the app theme', async () => {
    document.documentElement.dataset.theme = 'twilight-dark'
    render(<MermaidBlock code="graph TD; A-->B;" />)

    await waitFor(() => expect(initialize).toHaveBeenCalled())
    expect(initialize.mock.calls[0][0]).toMatchObject({ theme: 'dark' })
  })
})

describe('MermaidBlock — failure', () => {
  it('falls back to the diagram source when it cannot be parsed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<MermaidBlock code="graph boom" />)

    await waitFor(() => expect(screen.getByTestId('mermaid-error-fallback')).toBeInTheDocument())
    expect(screen.getByText('Cannot display the Mermaid diagram')).toBeInTheDocument()
    // The source stays readable: a broken diagram shouldn't swallow what the author wrote.
    expect(screen.getByText('graph boom')).toBeInTheDocument()
    warn.mockRestore()
  })
})
