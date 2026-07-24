import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const addSession = vi.fn()
const closeSession = vi.fn()
const closeAllSessions = vi.fn()

vi.mock('../../hooks/useIntegratedTerminal', () => ({
  useIntegratedTerminal: () => ({
    open: true,
    addSession,
    closeSession,
    closeAllSessions,
    openTerminal: vi.fn(),
    toggle: vi.fn(),
  }),
}))
// XtermView drives real xterm.js (canvas) — stub it out; its own test covers the registry wiring.
vi.mock('./XtermView', () => ({ XtermView: ({ id }: { id: string }) => <div data-testid={`xterm-${id}`} /> }))

import { TerminalPanel } from './TerminalPanel'
import { useTerminalStore } from '../../stores/terminal.store'

const seed = () =>
  useTerminalStore.setState({
    open: true,
    height: 260,
    byPath: {
      '/repo': {
        tabs: [
          { id: 'a', title: 'zsh 1', cwd: '/repo' },
          { id: 'b', title: 'zsh 2', cwd: '/repo' },
        ],
        activeId: 'a',
      },
    },
  })

beforeEach(() => {
  addSession.mockReset()
  closeSession.mockReset()
  closeAllSessions.mockReset()
  seed()
})

describe('TerminalPanel', () => {
  it('renders a tab per session and mounts the active one', () => {
    render(<TerminalPanel path="/repo" />)
    expect(screen.getByTestId('terminal-tab-a')).toBeInTheDocument()
    expect(screen.getByTestId('terminal-tab-b')).toBeInTheDocument()
    expect(screen.getByTestId('xterm-a')).toBeInTheDocument()
    expect(screen.queryByTestId('xterm-b')).not.toBeInTheDocument()
  })

  it('switches the active tab on click', async () => {
    const user = userEvent.setup()
    render(<TerminalPanel path="/repo" />)
    await user.click(screen.getByTestId('terminal-tab-b'))
    expect(useTerminalStore.getState().tabsFor('/repo').activeId).toBe('b')
  })

  it('spawns a new session from the + button', async () => {
    const user = userEvent.setup()
    render(<TerminalPanel path="/repo" />)
    await user.click(screen.getByTestId('terminal-new-tab'))
    expect(addSession).toHaveBeenCalledTimes(1)
  })

  it('closes a session from its close button', async () => {
    const user = userEvent.setup()
    render(<TerminalPanel path="/repo" />)
    await user.click(screen.getByTestId('terminal-close-tab-a'))
    expect(closeSession).toHaveBeenCalledWith('a')
  })

  it('hides the panel from the collapse button', async () => {
    const user = userEvent.setup()
    render(<TerminalPanel path="/repo" />)
    await user.click(screen.getByTestId('terminal-hide'))
    expect(useTerminalStore.getState().open).toBe(false)
  })

  it('closes all sessions and the panel from the close button', async () => {
    const user = userEvent.setup()
    render(<TerminalPanel path="/repo" />)
    await user.click(screen.getByTestId('terminal-close'))
    expect(closeAllSessions).toHaveBeenCalledTimes(1)
  })
})
