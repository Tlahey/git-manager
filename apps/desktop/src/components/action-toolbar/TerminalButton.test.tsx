import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const toggle = vi.fn()
const apiOpenTerminal = vi.fn()

vi.mock('../../hooks/useIntegratedTerminal', () => ({
  useIntegratedTerminal: () => ({
    open: false,
    toggle,
    addSession: vi.fn(),
    closeSession: vi.fn(),
    openTerminal: vi.fn(),
  }),
}))
vi.mock('../../api/shell.api', () => ({
  apiOpenTerminal: (...args: unknown[]) => apiOpenTerminal(...args),
}))

import { TerminalButton } from './TerminalButton'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useSettingsStore } from '../../stores/settings.store'

const ITERM = '/Applications/iTerm.app'

beforeEach(() => {
  toggle.mockReset()
  apiOpenTerminal.mockReset()
  useRepoUIStore.setState({ activeRepo: '/repo', activeWorkspacePath: null })
  const current = useSettingsStore.getState().settings
  useSettingsStore.setState({
    settings: { ...current, externalTools: { externalTerminalCommand: ITERM } },
  })
})

describe('TerminalButton', () => {
  it('toggles the integrated panel when the primary button is clicked', async () => {
    const user = userEvent.setup()
    render(<TerminalButton />)
    await user.click(screen.getByTestId('toolbar-terminal-button-primary'))
    expect(toggle).toHaveBeenCalledTimes(1)
  })

  it('opens the preferred external terminal at the active path', async () => {
    const user = userEvent.setup()
    render(<TerminalButton />)
    await user.click(screen.getByTestId('toolbar-terminal-button-menu'))
    await user.click(await screen.findByTestId('toolbar-terminal-external-preferred'))
    expect(apiOpenTerminal).toHaveBeenCalledWith('/repo', ITERM)
  })

  it('offers the system-default terminal', async () => {
    const user = userEvent.setup()
    render(<TerminalButton />)
    await user.click(screen.getByTestId('toolbar-terminal-button-menu'))
    await user.click(await screen.findByTestId('toolbar-terminal-external-default'))
    expect(apiOpenTerminal).toHaveBeenCalledWith('/repo', '')
  })

  it('targets the active worktree path when one is selected', async () => {
    useRepoUIStore.setState({ activeRepo: '/repo', activeWorkspacePath: '/repo/.worktrees/wt' })
    const user = userEvent.setup()
    render(<TerminalButton />)
    await user.click(screen.getByTestId('toolbar-terminal-button-menu'))
    await user.click(await screen.findByTestId('toolbar-terminal-external-default'))
    expect(apiOpenTerminal).toHaveBeenCalledWith('/repo/.worktrees/wt', '')
  })
})
