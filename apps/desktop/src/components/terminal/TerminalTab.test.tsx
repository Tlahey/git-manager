import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TerminalTab } from './TerminalTab'

const session = { id: 'sess-1', title: 'zsh 2', cwd: '/repo/.worktrees/feature' }

const renderTab = (over: Partial<React.ComponentProps<typeof TerminalTab>> = {}) =>
  render(
    <TerminalTab
      session={session}
      isActive={false}
      location="feat/login"
      onSelect={vi.fn()}
      onClose={vi.fn()}
      {...over}
    />
  )

describe('TerminalTab', () => {
  it('names the worktree first and keeps the session name beside it', () => {
    renderTab()
    const tab = screen.getByTestId('terminal-tab-sess-1')
    expect(tab).toHaveTextContent('feat/login')
    expect(tab).toHaveTextContent('zsh 2')
  })

  it('spins while a command holds the terminal', () => {
    renderTab({ isBusy: true, command: 'claude' })
    expect(screen.getByTestId('terminal-busy-sess-1')).toBeInTheDocument()
  })

  it('shows no spinner at an idle prompt', () => {
    renderTab()
    expect(screen.queryByTestId('terminal-busy-sess-1')).not.toBeInTheDocument()
  })

  it('selects and closes through its own buttons', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    renderTab({ onSelect, onClose })
    fireEvent.click(screen.getByTestId('terminal-tab-sess-1'))
    expect(onSelect).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('terminal-close-tab-sess-1'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
