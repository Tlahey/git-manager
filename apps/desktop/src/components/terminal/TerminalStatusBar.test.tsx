import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TerminalStatus } from '@git-manager/git-types'

const activity = vi.fn<() => Record<string, TerminalStatus>>(() => ({}))
vi.mock('../../hooks/useTerminalActivity', () => ({
  useTerminalActivity: () => activity(),
}))

import { TerminalStatusBar } from './TerminalStatusBar'
import { useTerminalStore } from '../../stores/terminal.store'

const session = (id: string, cwd = '/repo') => ({ id, title: `zsh ${id}`, cwd })

beforeEach(() => {
  activity.mockReturnValue({})
  useTerminalStore.setState({ open: false, height: 260, sessions: [], activeId: null })
})

describe('TerminalStatusBar', () => {
  it('renders nothing when no session is alive', () => {
    const { container } = render(<TerminalStatusBar />)
    expect(container).toBeEmptyDOMElement()
  })

  it('counts every session, wherever it was opened', () => {
    // A shell on another worktree is still running; a bar that ignored it would report zero the
    // moment the user entered a different workspace.
    useTerminalStore.setState({
      sessions: [session('a'), session('b', '/repo/.worktrees/feature')],
      activeId: 'a',
    })
    render(<TerminalStatusBar />)
    const bar = screen.getByTestId('terminal-status-bar')
    expect(bar).toBeInTheDocument()
    expect(bar).toHaveTextContent('2')
  })

  it('says how many sessions are running a command', () => {
    useTerminalStore.setState({ sessions: [session('a'), session('b')], activeId: 'a' })
    activity.mockReturnValue({
      a: { id: 'a', busy: true, command: 'claude' },
      b: { id: 'b', busy: false, command: null },
    })
    render(<TerminalStatusBar />)
    expect(screen.getByTestId('terminal-status-busy')).toHaveTextContent('1 running')
  })

  it('shows no running badge while every session sits at its prompt', () => {
    useTerminalStore.setState({ sessions: [session('a')], activeId: 'a' })
    activity.mockReturnValue({ a: { id: 'a', busy: false, command: null } })
    render(<TerminalStatusBar />)
    expect(screen.queryByTestId('terminal-status-busy')).not.toBeInTheDocument()
  })

  it('re-opens the panel when clicked', async () => {
    useTerminalStore.setState({ sessions: [session('a')], activeId: 'a' })
    const user = userEvent.setup()
    render(<TerminalStatusBar />)
    await user.click(screen.getByTestId('terminal-status-bar'))
    expect(useTerminalStore.getState().open).toBe(true)
  })
})
