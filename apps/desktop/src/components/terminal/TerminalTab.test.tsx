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

  it('breathes while a command holds the terminal', () => {
    renderTab({ isBusy: true, command: 'claude' })
    const chip = screen.getByTestId('terminal-state-sess-1')
    expect(chip).toHaveAttribute('data-state', 'busy')
    expect(chip.className).toContain('animate-pulse')
  })

  it('settles onto a still green chip at an idle prompt', () => {
    renderTab()
    const chip = screen.getByTestId('terminal-state-sess-1')
    expect(chip).toHaveAttribute('data-state', 'idle')
    expect(chip.className).not.toContain('animate-pulse')
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
