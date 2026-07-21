import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TruncatedLabel } from './TruncatedLabel'

// jsdom ships neither ResizeObserver nor real layout metrics — stub both so the
// overflow measurement (`scrollWidth > clientWidth`) is controllable per test.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

function mockWidths({ scrollWidth, clientWidth }: { scrollWidth: number; clientWidth: number }) {
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get: () => scrollWidth,
  })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => clientWidth,
  })
}

afterEach(() => {
  delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth
})

describe('TruncatedLabel', () => {
  it('renders the label text truncated', () => {
    mockWidths({ scrollWidth: 50, clientWidth: 50 })
    render(<TruncatedLabel label="feature/very-long-branch" />)
    const span = screen.getByText('feature/very-long-branch')
    expect(span.className).toContain('truncate')
  })

  it('reveals the full text in a tooltip on hover when the text overflows', async () => {
    mockWidths({ scrollWidth: 200, clientWidth: 80 })
    const user = userEvent.setup()
    render(<TruncatedLabel label="feature/very-long-branch" />)

    await user.hover(screen.getByText('feature/very-long-branch'))
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent('feature/very-long-branch')
  })

  it('does not show a tooltip on hover when the text fits', async () => {
    mockWidths({ scrollWidth: 60, clientWidth: 80 })
    const user = userEvent.setup()
    render(<TruncatedLabel label="main" />)

    await user.hover(screen.getByText('main'))
    // Give the tooltip's open delay time to elapse; it must stay absent.
    await new Promise((resolve) => setTimeout(resolve, 250))
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
  })
})
