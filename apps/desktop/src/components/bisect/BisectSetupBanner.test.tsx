import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import type { ReactElement } from 'react'

const start = vi.fn()
const restoreStash = vi.fn()
const apiBisectCheckRange = vi.fn()

vi.mock('../../hooks/useBisectActions', () => ({
  useBisectActions: () => ({ start, restoreStash, mark: vi.fn(), reset: vi.fn(), pending: false }),
}))
vi.mock('../../api/git.api', () => ({
  apiBisectCheckRange: (...a: unknown[]) => apiBisectCheckRange(...a),
}))

import { BisectSetupBanner } from './BisectSetupBanner'
import { useBisectUIStore } from '../../stores/bisectUI.store'

/** Fresh SWR cache per render so the range check doesn't bleed between tests. */
function renderIsolated(ui: ReactElement) {
  return render(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>)
}

function setup(overrides: Partial<ReturnType<typeof useBisectUIStore.getState>> = {}) {
  useBisectUIStore.setState({
    setupActive: true,
    activeSlot: 'bad',
    pendingBadOid: null,
    pendingGoodOid: null,
    stashDialogOpen: false,
    ...overrides,
  })
}

describe('BisectSetupBanner', () => {
  beforeEach(() => {
    start.mockReset().mockResolvedValue(true)
    restoreStash.mockReset().mockResolvedValue(true)
    apiBisectCheckRange.mockReset().mockResolvedValue(true)
    useBisectUIStore.setState({
      setupActive: false,
      activeSlot: 'bad',
      pendingBadOid: null,
      pendingGoodOid: null,
      autoStashed: false,
      stashDialogOpen: false,
    })
  })

  it('renders nothing when setup is inactive', () => {
    const { container } = renderIsolated(<BisectSetupBanner repoPath="/repo" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows both slots with a disabled validate until both are set', () => {
    setup()
    renderIsolated(<BisectSetupBanner repoPath="/repo" />)
    expect(screen.getByTestId('bisect-slot-bad')).toBeInTheDocument()
    expect(screen.getByTestId('bisect-slot-good')).toBeInTheDocument()
    expect(screen.getByTestId('bisect-setup-validate')).toBeDisabled()
  })

  it('enables validate once both slots are set and the range is valid', async () => {
    setup({ pendingBadOid: 'bad1', pendingGoodOid: 'good1' })
    renderIsolated(<BisectSetupBanner repoPath="/repo" />)
    await waitFor(() => expect(screen.getByTestId('bisect-setup-validate')).toBeEnabled())
    expect(apiBisectCheckRange).toHaveBeenCalledWith('/repo', 'bad1', 'good1')
  })

  it('blocks starting and shows a message when the range is inverted', async () => {
    apiBisectCheckRange.mockResolvedValue(false)
    setup({ pendingBadOid: 'older', pendingGoodOid: 'newer' })
    renderIsolated(<BisectSetupBanner repoPath="/repo" />)
    await waitFor(() =>
      expect(screen.getByTestId('bisect-setup-invalid-range')).toBeInTheDocument()
    )
    expect(screen.getByTestId('bisect-setup-validate')).toBeDisabled()
  })

  it('starts the bisect on validate (the tree is already clean by now)', async () => {
    setup({ pendingBadOid: 'bad1', pendingGoodOid: 'good1' })
    const user = userEvent.setup()
    renderIsolated(<BisectSetupBanner repoPath="/repo" />)
    await waitFor(() => expect(screen.getByTestId('bisect-setup-validate')).toBeEnabled())
    await user.click(screen.getByTestId('bisect-setup-validate'))
    expect(start).toHaveBeenCalledWith('bad1', 'good1')
  })

  it('focuses a slot when clicked', async () => {
    setup({ activeSlot: 'bad' })
    const user = userEvent.setup()
    renderIsolated(<BisectSetupBanner repoPath="/repo" />)
    await user.click(screen.getByTestId('bisect-slot-good'))
    expect(useBisectUIStore.getState().activeSlot).toBe('good')
  })

  it('cancels setup without restoring when nothing was stashed', async () => {
    setup({ autoStashed: false })
    const user = userEvent.setup()
    renderIsolated(<BisectSetupBanner repoPath="/repo" />)
    await user.click(screen.getByTestId('bisect-setup-cancel'))
    expect(restoreStash).not.toHaveBeenCalled()
    expect(useBisectUIStore.getState().setupActive).toBe(false)
  })

  it('restores an up-front stash when cancelling', async () => {
    setup({ autoStashed: true })
    const user = userEvent.setup()
    renderIsolated(<BisectSetupBanner repoPath="/repo" />)
    await user.click(screen.getByTestId('bisect-setup-cancel'))
    expect(restoreStash).toHaveBeenCalled()
    await waitFor(() => expect(useBisectUIStore.getState().setupActive).toBe(false))
  })
})
