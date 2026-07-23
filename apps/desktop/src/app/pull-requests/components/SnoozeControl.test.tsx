import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SnoozeControl } from './SnoozeControl'
import { useLaunchpadStore } from '../../../stores/launchpad.store'

beforeEach(() => {
  useLaunchpadStore.setState({ snoozed: {} })
})

describe('SnoozeControl', () => {
  it('offers the four durations when the PR is awake and snoozes on selection', async () => {
    const user = userEvent.setup()
    render(<SnoozeControl prId="pr-1" />)

    const trigger = screen.getByTestId('snooze-trigger-pr-1')
    expect(trigger).toHaveAttribute('aria-label', 'Snooze')

    await user.click(trigger)
    expect(screen.getByRole('button', { name: 'Snooze for 1 hour' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Snooze indefinitely' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Snooze until tomorrow' }))
    expect(useLaunchpadStore.getState().snoozed['pr-1']).toBeTypeOf('number')
  })

  it('opens the duration menu on hover', async () => {
    const user = userEvent.setup()
    render(<SnoozeControl prId="pr-1" />)
    await user.hover(screen.getByTestId('snooze-trigger-pr-1'))
    expect(screen.getByTestId('snooze-menu-pr-1')).toBeInTheDocument()
  })

  it('shows the wake time and Unsnooze when already snoozed', async () => {
    useLaunchpadStore.setState({ snoozed: { 'pr-1': Date.now() + 2 * 3_600_000 + 5 * 60_000 } })
    const user = userEvent.setup()
    render(<SnoozeControl prId="pr-1" />)

    const trigger = screen.getByTestId('snooze-trigger-pr-1')
    expect(trigger).toHaveAttribute('aria-label', 'Unsnooze')

    await user.click(trigger)
    // Both the trigger and the menu item are named "Unsnooze" — scope to the open menu.
    const menu = screen.getByTestId('snooze-menu-pr-1')
    expect(within(menu).getByText('Snoozed · 2h')).toBeInTheDocument()
    await user.click(within(menu).getByRole('button', { name: 'Unsnooze' }))
    expect(useLaunchpadStore.getState().snoozed['pr-1']).toBeUndefined()
  })
})
