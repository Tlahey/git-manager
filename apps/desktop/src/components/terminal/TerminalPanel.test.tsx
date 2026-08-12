import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitWorktree, TerminalStatus } from '@git-manager/git-types'

const addSession = vi.fn()
const closeSession = vi.fn()
const closeAllSessions = vi.fn()
const activity = vi.fn<() => Record<string, TerminalStatus>>(() => ({}))
const worktrees = vi.fn<() => GitWorktree[]>(() => [])

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
vi.mock('../../hooks/useTerminalActivity', () => ({
  useTerminalActivity: () => activity(),
}))
vi.mock('../../hooks/useWorktrees', () => ({
  useWorktrees: () => worktrees(),
}))
// XtermView drives real xterm.js (canvas) — stub it out; its own test covers the registry wiring.
vi.mock('./XtermView', () => ({
  XtermView: ({ id }: { id: string }) => <div data-testid={`xterm-${id}`} />,
}))

import { TerminalPanel } from './TerminalPanel'
import { useTerminalStore } from '../../stores/terminal.store'

const seed = () =>
  useTerminalStore.setState({
    open: true,
    height: 260,
    sessions: [
      { id: 'a', title: 'zsh 1', cwd: '/repo' },
      { id: 'b', title: 'zsh 2', cwd: '/repo/.worktrees/feature' },
    ],
    activeId: 'a',
    finished: {},
    lastActivity: {},
  })

beforeEach(() => {
  addSession.mockReset()
  closeSession.mockReset()
  closeAllSessions.mockReset()
  activity.mockReturnValue({})
  worktrees.mockReturnValue([
    { path: '/repo', branch: 'main', isMain: true } as GitWorktree,
    { path: '/repo/.worktrees/feature', branch: 'feat/login' } as GitWorktree,
  ])
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

  it('lists a session opened on another worktree, naming its branch', () => {
    // The strip spans every session: one bound to a worktree the user has since left is exactly the
    // one they need a way back to.
    render(<TerminalPanel path="/repo" />)
    expect(screen.getByTestId('terminal-tab-b')).toHaveTextContent('feat/login')
    expect(screen.getByTestId('terminal-tab-a')).toHaveTextContent('main')
  })

  it('marks the session that is running a command, and leaves the quiet one quiet', () => {
    activity.mockReturnValue({ b: { id: 'b', busy: true, command: 'claude' } })
    render(<TerminalPanel path="/repo" />)
    expect(screen.getByTestId('terminal-state-b')).toHaveAttribute('data-state', 'busy')
    expect(screen.getByTestId('terminal-state-a')).toHaveAttribute('data-state', 'idle')
  })

  it('flags a session whose command finished while another one was on screen', () => {
    useTerminalStore.setState({ finished: { b: { command: 'pnpm' } } })
    render(<TerminalPanel path="/repo" />)
    expect(screen.getByTestId('terminal-state-b')).toHaveAttribute('data-state', 'done')
  })

  it('clears the flag of the session it is showing — looking at it is what marks it seen', () => {
    useTerminalStore.setState({ finished: { a: { command: 'pnpm' } } })
    render(<TerminalPanel path="/repo" />)
    expect(useTerminalStore.getState().finished).toEqual({})
    expect(screen.getByTestId('terminal-state-a')).toHaveAttribute('data-state', 'idle')
  })

  it('clears the flag of a session the user switches to', async () => {
    const user = userEvent.setup()
    useTerminalStore.setState({ finished: { b: { command: 'pnpm' } } })
    render(<TerminalPanel path="/repo" />)
    expect(useTerminalStore.getState().finished).toHaveProperty('b')

    await user.click(screen.getByTestId('terminal-tab-b'))
    expect(useTerminalStore.getState().finished).toEqual({})
  })

  it('switches the shown session on click, without touching the view', async () => {
    const user = userEvent.setup()
    render(<TerminalPanel path="/repo" />)
    await user.click(screen.getByTestId('terminal-tab-b'))
    expect(useTerminalStore.getState().activeId).toBe('b')
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

  it('sizes itself from the store and offers the resize handle', () => {
    render(<TerminalPanel path="/repo" />)
    expect(screen.getByTestId('terminal-panel')).toHaveStyle({ height: '260px' })
    expect(screen.getByTestId('terminal-resize-handle')).toBeInTheDocument()
  })
})
