import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TerminalItem } from './TerminalItem'

vi.mock('./HoverExpandLabel', () => ({
  HoverExpandLabel: ({
    children,
    className,
  }: {
    children: React.ReactNode
    className?: string
  }) => <span className={className}>{children}</span>,
}))

const session = { id: 'sess-1', title: 'zsh 1', cwd: '/repo/.worktrees/feature' }

const renderItem = (over: Partial<React.ComponentProps<typeof TerminalItem>> = {}) =>
  render(
    <TerminalItem
      session={session}
      location="feat/login"
      isActive={false}
      isBusy={false}
      command={null}
      {...over}
    />
  )

describe('TerminalItem', () => {
  it('leads with the worktree the session is bound to', () => {
    renderItem()
    expect(screen.getByTestId('terminal-item-sess-1')).toHaveTextContent('feat/login')
  })

  it('names the session when nothing is running, and the command when something is', () => {
    const { unmount } = renderItem()
    expect(screen.getByTestId('terminal-item-sess-1')).toHaveTextContent('zsh 1')
    unmount()

    renderItem({ isBusy: true, command: 'claude' })
    const row = screen.getByTestId('terminal-item-sess-1')
    expect(row).toHaveTextContent('claude')
    expect(row).not.toHaveTextContent('zsh 1')
    expect(screen.getByTestId('terminal-item-busy-sess-1')).toBeInTheDocument()
  })

  it('falls back to a generic label when the command could not be resolved', () => {
    renderItem({ isBusy: true, command: null })
    expect(screen.getByTestId('terminal-item-sess-1')).toHaveTextContent('A command is running')
  })

  it('focuses the session on click', () => {
    const onFocus = vi.fn()
    renderItem({ onFocus })
    fireEvent.click(screen.getByTestId('terminal-item-open-sess-1'))
    expect(onFocus).toHaveBeenCalledWith(session)
  })

  it('closes the session from its own button', () => {
    const onClose = vi.fn()
    renderItem({ onClose })
    fireEvent.click(screen.getByTestId('terminal-item-close-sess-1'))
    expect(onClose).toHaveBeenCalledWith('sess-1')
  })

  it('marks the session the panel is showing', () => {
    renderItem({ isActive: true })
    expect(screen.getByTestId('terminal-item-sess-1').className).toContain('bg-sidebar-accent')
  })

  it('highlights the matched substring in the worktree label', () => {
    const { container } = renderItem({ filterQuery: 'login' })
    const marks = container.querySelectorAll('mark')
    expect(marks).toHaveLength(1)
    expect(marks[0].textContent).toBe('login')
  })
})
