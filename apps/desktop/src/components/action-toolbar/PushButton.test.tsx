import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PushButton } from './PushButton'

function setup(overrides: Partial<Parameters<typeof PushButton>[0]> = {}) {
  const onPush = vi.fn()
  const onPushSkippingHooks = vi.fn()
  render(<PushButton onPush={onPush} onPushSkippingHooks={onPushSkippingHooks} {...overrides} />)
  return { onPush, onPushSkippingHooks }
}

describe('PushButton', () => {
  it('pushes on the primary segment', async () => {
    const user = userEvent.setup()
    const { onPush, onPushSkippingHooks } = setup()

    await user.click(screen.getByTestId('toolbar-push-button'))

    expect(onPush).toHaveBeenCalledTimes(1)
    expect(onPushSkippingHooks).not.toHaveBeenCalled()
  })

  // The escape hatch costs a deliberate extra click on purpose: a `pre-push` hook is somebody's
  // quality gate, and skipping it should never be the thing you hit by accident.
  it('keeps the no-verify push behind the caret', async () => {
    const user = userEvent.setup()
    const { onPush, onPushSkippingHooks } = setup()

    expect(screen.queryByTestId('toolbar-push-skip-hooks')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('toolbar-push-menu-button'))
    await user.click(await screen.findByText('Push without running hooks'))

    expect(onPushSkippingHooks).toHaveBeenCalledTimes(1)
    expect(onPush).not.toHaveBeenCalled()
  })

  it('shows how many commits are waiting', () => {
    setup({ aheadCount: 3 })
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('disables both segments while a push is in flight', () => {
    setup({ loading: true })
    expect(screen.getByTestId('toolbar-push-button')).toBeDisabled()
    expect(screen.getByTestId('toolbar-push-menu-button')).toBeDisabled()
  })

  it('disables both segments when the toolbar is disabled', () => {
    setup({ disabled: true })
    expect(screen.getByTestId('toolbar-push-button')).toBeDisabled()
    expect(screen.getByTestId('toolbar-push-menu-button')).toBeDisabled()
  })
})
