import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PushButton } from './PushButton'

function setup(overrides: Partial<Parameters<typeof PushButton>[0]> = {}) {
  const onPush = vi.fn()
  const onPushSkippingHooks = vi.fn()
  const onForcePushWithLease = vi.fn()
  render(
    <PushButton
      onPush={onPush}
      onPushSkippingHooks={onPushSkippingHooks}
      onForcePushWithLease={onForcePushWithLease}
      {...overrides}
    />
  )
  return { onPush, onPushSkippingHooks, onForcePushWithLease }
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

  it('offers a force push with lease behind the caret', async () => {
    const user = userEvent.setup()
    const { onPush, onForcePushWithLease } = setup()

    await user.click(screen.getByTestId('toolbar-push-menu-button'))
    expect(
      await screen.findByText('Refused if someone pushed since your last fetch')
    ).toBeInTheDocument()
    await user.click(screen.getByText('Force push (with lease)'))

    expect(onForcePushWithLease).toHaveBeenCalledTimes(1)
    expect(onPush).not.toHaveBeenCalled()
  })

  it('says the force push is needed once the branch has diverged', async () => {
    const user = userEvent.setup()
    setup({ diverged: true })

    await user.click(screen.getByTestId('toolbar-push-menu-button'))

    expect(
      await screen.findByText('Needed: your branch and the remote have diverged')
    ).toBeInTheDocument()
  })

  it('refuses the force push on a protected branch', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { onForcePushWithLease } = setup({ forceDisabled: true, diverged: true })

    await user.click(screen.getByTestId('toolbar-push-menu-button'))
    const item = await screen.findByTestId('toolbar-push-force-with-lease')

    expect(item).toHaveAttribute('data-disabled')
    expect(screen.getByText('Unavailable on a protected branch')).toBeInTheDocument()
    await user.click(item)
    expect(onForcePushWithLease).not.toHaveBeenCalled()
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
