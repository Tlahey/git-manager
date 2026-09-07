import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { NotificationSettings } from '@git-manager/git-types'
import { NotificationEventRow } from './NotificationEventRow'
import { EVENT_TOGGLES } from './notificationEvents.config'

const CI = EVENT_TOGGLES.find((t) => t.key === 'notifyOnCi')!
const FETCH = EVENT_TOGGLES.find((t) => t.key === 'notifyOnFetch')!

function settings(overrides: Partial<NotificationSettings> = {}): NotificationSettings {
  return {
    enabled: true,
    notifyOnFetch: true,
    notifyOnPull: true,
    notifyOnPush: true,
    enableSound: false,
    ...overrides,
  }
}

describe('NotificationEventRow — the toggle', () => {
  it('reflects the stored value and reports a change under its own key', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<NotificationEventRow toggle={CI} notifications={settings()} onChange={onChange} />)

    const checkbox = screen.getByRole('checkbox', { name: 'CI results' })
    expect(checkbox).toBeChecked()
    await user.click(checkbox)
    expect(onChange).toHaveBeenCalledWith({ notifyOnCi: false })
  })

  it('defaults to on for an event the stored settings say nothing about', () => {
    render(<NotificationEventRow toggle={CI} notifications={settings()} onChange={vi.fn()} />)
    expect(screen.getByRole('checkbox', { name: 'CI results' })).toBeChecked()
  })
})

describe('NotificationEventRow — the audience filter', () => {
  it('offers both audiences on a PR event, defaulting to all of them', () => {
    render(<NotificationEventRow toggle={CI} notifications={settings()} onChange={vi.fn()} />)
    const select = screen.getByRole('combobox')
    expect(select).toHaveValue('all')
    expect(screen.getByText('Every PR I follow')).toBeInTheDocument()
    expect(screen.getByText('Only PRs I opened')).toBeInTheDocument()
  })

  it('writes the chosen scope under the event’s key, keeping the other events’ scopes', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <NotificationEventRow
        toggle={CI}
        notifications={settings({ scopes: { notifyOnPrMerged: 'mine' } })}
        onChange={onChange}
      />
    )

    await user.selectOptions(screen.getByRole('combobox'), 'mine')
    expect(onChange).toHaveBeenCalledWith({
      scopes: { notifyOnPrMerged: 'mine', notifyOnCi: 'mine' },
    })
  })

  it('shows the stored scope', () => {
    render(
      <NotificationEventRow
        toggle={CI}
        notifications={settings({ scopes: { notifyOnCi: 'mine' } })}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByRole('combobox')).toHaveValue('mine')
  })

  // A filter on a notification that is never raised is a control that silently does nothing.
  it('hides the filter while the event itself is off', () => {
    render(
      <NotificationEventRow
        toggle={CI}
        notifications={settings({ notifyOnCi: false })}
        onChange={vi.fn()}
      />
    )
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  // Fetch/pull/push have no PR to belong to, so there is nothing to scope them by.
  it('offers no filter on a local git event', () => {
    render(<NotificationEventRow toggle={FETCH} notifications={settings()} onChange={vi.fn()} />)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
})
