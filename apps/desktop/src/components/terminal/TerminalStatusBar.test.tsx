import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TerminalStatusBar } from './TerminalStatusBar'
import { useTerminalStore } from '../../stores/terminal.store'

const reset = () => useTerminalStore.setState({ open: false, height: 260, byPath: {} })

beforeEach(reset)

describe('TerminalStatusBar', () => {
  it('renders nothing when the path has no sessions', () => {
    const { container } = render(<TerminalStatusBar path="/repo" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the collapsed sessions with a count', () => {
    useTerminalStore.setState({
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
    render(<TerminalStatusBar path="/repo" />)
    const bar = screen.getByTestId('terminal-status-bar')
    expect(bar).toBeInTheDocument()
    expect(bar).toHaveTextContent('2')
  })

  it('re-opens the panel when clicked', async () => {
    useTerminalStore.setState({
      byPath: { '/repo': { tabs: [{ id: 'a', title: 'zsh 1', cwd: '/repo' }], activeId: 'a' } },
    })
    const user = userEvent.setup()
    render(<TerminalStatusBar path="/repo" />)
    await user.click(screen.getByTestId('terminal-status-bar'))
    expect(useTerminalStore.getState().open).toBe(true)
  })
})
