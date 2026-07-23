import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const stashForBisect = vi.fn()
vi.mock('../../hooks/useBisectActions', () => ({
  useBisectActions: () => ({ stashForBisect, pending: false }),
}))

import { BisectStashDialog } from './BisectStashDialog'
import { useBisectUIStore } from '../../stores/bisectUI.store'

function resetStore(overrides: Partial<ReturnType<typeof useBisectUIStore.getState>> = {}) {
  useBisectUIStore.setState({
    setupActive: false,
    activeSlot: 'bad',
    pendingBadOid: null,
    pendingGoodOid: null,
    autoStashed: false,
    stashDialogOpen: false,
    ...overrides,
  })
}

describe('BisectStashDialog', () => {
  beforeEach(() => {
    stashForBisect.mockReset().mockResolvedValue(true)
    resetStore()
  })

  it('is not shown when the stash dialog is closed', () => {
    render(<BisectStashDialog repoPath="/repo" />)
    expect(screen.queryByTestId('bisect-stash-dialog')).not.toBeInTheDocument()
  })

  it('stashes then begins the commit selection on confirm', async () => {
    resetStore({ stashDialogOpen: true })
    const user = userEvent.setup()
    render(<BisectStashDialog repoPath="/repo" />)
    expect(screen.getByTestId('bisect-stash-dialog')).toBeInTheDocument()
    await user.click(screen.getByTestId('bisect-stash-confirm'))
    expect(stashForBisect).toHaveBeenCalled()
    // The setup (commit picking) only starts once the stash succeeded, and the dialog closes.
    await waitFor(() => expect(useBisectUIStore.getState().setupActive).toBe(true))
    expect(useBisectUIStore.getState().stashDialogOpen).toBe(false)
  })

  it('starts no bisect on refuse', async () => {
    resetStore({ stashDialogOpen: true })
    const user = userEvent.setup()
    render(<BisectStashDialog repoPath="/repo" />)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(stashForBisect).not.toHaveBeenCalled()
    expect(useBisectUIStore.getState().setupActive).toBe(false)
    expect(useBisectUIStore.getState().stashDialogOpen).toBe(false)
  })

  it('keeps the dialog open and does not begin setup if the stash fails', async () => {
    stashForBisect.mockResolvedValue(false)
    resetStore({ stashDialogOpen: true })
    const user = userEvent.setup()
    render(<BisectStashDialog repoPath="/repo" />)
    await user.click(screen.getByTestId('bisect-stash-confirm'))
    expect(useBisectUIStore.getState().setupActive).toBe(false)
    expect(useBisectUIStore.getState().stashDialogOpen).toBe(true)
  })
})
