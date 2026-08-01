import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const { addSession } = vi.hoisted(() => ({ addSession: vi.fn() }))
vi.mock('../../../hooks/useIntegratedTerminal', () => ({
  useIntegratedTerminal: () => ({
    open: true,
    addSession,
    closeSession: vi.fn(),
    closeAllSessions: vi.fn(),
    openTerminal: vi.fn(),
    toggle: vi.fn(),
  }),
}))
// XtermView drives real xterm.js (canvas), which jsdom can't render.
vi.mock('../../../components/terminal/XtermView', () => ({
  XtermView: ({ id }: { id: string }) => <div data-testid={`xterm-${id}`} />,
}))

import { RepoTerminalView } from './RepoTerminalView'
import { useTerminalStore } from '../../../stores/terminal.store'

beforeEach(() => {
  addSession.mockReset()
  addSession.mockResolvedValue(undefined)
  useTerminalStore.setState({ open: false, height: 260, byPath: {} })
})

describe('RepoTerminalView', () => {
  it('spawns a first shell when the path has none yet', async () => {
    render(<RepoTerminalView path="/repo" />)
    await waitFor(() => expect(addSession).toHaveBeenCalledTimes(1))
  })

  it('reuses the existing shells instead of spawning another', () => {
    useTerminalStore.setState({
      byPath: { '/repo': { tabs: [{ id: 'a', title: 'zsh 1', cwd: '/repo' }], activeId: 'a' } },
    })
    render(<RepoTerminalView path="/repo" />)
    expect(addSession).not.toHaveBeenCalled()
    expect(screen.getByTestId('xterm-a')).toBeInTheDocument()
  })

  it('renders the terminal in its view variant, as a labelled tab panel', () => {
    render(<RepoTerminalView path="/repo" />)
    expect(screen.getByTestId('repo-terminal-view')).toHaveAttribute('role', 'tabpanel')
    expect(screen.getByTestId('terminal-panel')).toHaveAttribute('data-variant', 'view')
  })

  it('survives a failed spawn without crashing', async () => {
    addSession.mockRejectedValue(new Error('no pty'))
    render(<RepoTerminalView path="/repo" />)
    await waitFor(() => expect(addSession).toHaveBeenCalled())
    expect(screen.getByTestId('terminal-panel')).toBeInTheDocument()
  })
})
