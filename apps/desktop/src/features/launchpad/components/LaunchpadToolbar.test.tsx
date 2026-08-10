import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LaunchpadToolbar } from './LaunchpadToolbar'
import { useLaunchpadControlsStore } from '../stores/launchpadControls.store'

describe('LaunchpadToolbar', () => {
  beforeEach(() => {
    useLaunchpadControlsStore.setState({ search: '', collapseAllNonce: 0, expandAllNonce: 0 })
  })

  it('writes typed text into the global search store', async () => {
    const user = userEvent.setup()
    render(<LaunchpadToolbar />)
    await user.type(screen.getByTestId('launchpad-global-search'), 'bug')
    expect(useLaunchpadControlsStore.getState().search).toBe('bug')
  })

  /** The button used to be titled with the *placeholder* ("Search…"), which is what this test
   * asserted; the shared `SearchInput` names it for what it does. */
  it('clears the search with the clear button', async () => {
    const user = userEvent.setup()
    useLaunchpadControlsStore.setState({ search: 'bug' })
    render(<LaunchpadToolbar />)
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(useLaunchpadControlsStore.getState().search).toBe('')
  })

  it('bumps the collapse/expand nonces from the buttons', async () => {
    const user = userEvent.setup()
    render(<LaunchpadToolbar />)
    await user.click(screen.getByTestId('launchpad-collapse-all'))
    await user.click(screen.getByTestId('launchpad-expand-all'))
    expect(useLaunchpadControlsStore.getState().collapseAllNonce).toBe(1)
    expect(useLaunchpadControlsStore.getState().expandAllNonce).toBe(1)
  })
})
