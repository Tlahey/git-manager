import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const stashAndCheckout = vi.fn()
vi.mock('../../hooks/useBranchCheckout', () => ({
  useBranchCheckout: () => ({ stashAndCheckout, pending: false }),
}))

import { CheckoutStashConfirm } from './CheckoutStashConfirm'
import { useStashDialogStore } from '../../stores/stashDialog.store'

describe('CheckoutStashConfirm', () => {
  beforeEach(() => {
    stashAndCheckout.mockReset().mockResolvedValue(true)
    useStashDialogStore.getState().closeDialog()
  })

  it('is not shown while the stash dialog is closed', () => {
    render(<CheckoutStashConfirm />)
    expect(screen.queryByTestId('checkout-stash-dialog')).not.toBeInTheDocument()
  })

  it('ignores a dialog opened for the bisect flow', () => {
    useStashDialogStore.getState().openBisectDialog('/repo')
    render(<CheckoutStashConfirm />)
    expect(screen.queryByTestId('checkout-stash-dialog')).not.toBeInTheDocument()
  })

  it('names the target branch and stashes then checks out on confirm', async () => {
    useStashDialogStore.getState().openCheckoutDialog('/repo', 'feature-x', {
      fromRef: 'main',
      fromDetached: false,
    })
    const user = userEvent.setup()
    render(<CheckoutStashConfirm />)

    expect(screen.getByTestId('checkout-stash-dialog')).toBeInTheDocument()
    expect(screen.getByText(/switch to branch "feature-x"/)).toBeInTheDocument()

    await user.click(screen.getByTestId('checkout-stash-confirm-button'))
    expect(stashAndCheckout).toHaveBeenCalledWith('/repo', 'feature-x', {
      fromRef: 'main',
      fromDetached: false,
    })
  })

  it('closes without checking out on cancel', async () => {
    useStashDialogStore.getState().openCheckoutDialog('/repo', 'feature-x')
    const user = userEvent.setup()
    render(<CheckoutStashConfirm />)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(stashAndCheckout).not.toHaveBeenCalled()
    expect(useStashDialogStore.getState().isOpen).toBe(false)
  })
})
