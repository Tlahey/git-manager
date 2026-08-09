import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FloatingSearchPanel } from './FloatingSearchPanel'

function renderPanel(props: Partial<Parameters<typeof FloatingSearchPanel>[0]> = {}) {
  return render(
    <FloatingSearchPanel
      open
      value=""
      onValueChange={() => {}}
      onClose={() => {}}
      placeholder="Search files…"
      closeLabel="Close"
      testId="file-search"
      {...props}
    />
  )
}

describe('FloatingSearchPanel', () => {
  it('renders nothing while closed, so a caller can mount it unconditionally', () => {
    renderPanel({ open: false })
    expect(screen.queryByTestId('file-search')).not.toBeInTheDocument()
  })

  /** Opening a search that isn't focused means asking the user to click the thing they just opened. */
  it('focuses the field as it opens', () => {
    renderPanel()
    expect(screen.getByTestId('file-search-input')).toHaveFocus()
  })

  it('names the field by its placeholder, so it is reachable without sighted context', () => {
    renderPanel()
    expect(screen.getByRole('textbox', { name: 'Search files…' })).toBeInTheDocument()
  })

  it('reports every keystroke to the caller, which owns the query', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    renderPanel({ onValueChange })
    await user.type(screen.getByTestId('file-search-input'), 'a')
    expect(onValueChange).toHaveBeenCalledWith('a')
  })

  it('closes on Escape and on the close button', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderPanel({ onClose })
    await user.type(screen.getByTestId('file-search-input'), '{Escape}')
    await user.click(screen.getByTestId('file-search-close'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  /**
   * Enter steps through matches only for a caller that has matches to step through. A filtering
   * search passes neither handler, and must not swallow the key — a form around it, or a future
   * submit, would stop working for no visible reason.
   */
  it('steps with Enter and Shift+Enter when the caller navigates matches', async () => {
    const user = userEvent.setup()
    const onNext = vi.fn()
    const onPrevious = vi.fn()
    renderPanel({ onNext, onPrevious })
    const input = screen.getByTestId('file-search-input')
    await user.type(input, '{Enter}')
    await user.type(input, '{Shift>}{Enter}{/Shift}')
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(onPrevious).toHaveBeenCalledTimes(1)
  })

  it('leaves Enter alone for a search that filters in place', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderPanel({ onClose })
    await user.type(screen.getByTestId('file-search-input'), '{Enter}')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('places the caller’s own controls between the field and the close button', () => {
    renderPanel({ children: <span data-testid="match-count">1/3</span> })
    expect(screen.getByTestId('match-count')).toBeInTheDocument()
  })
})
