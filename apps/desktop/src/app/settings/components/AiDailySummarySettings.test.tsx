import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AiDailySummarySettings } from './AiDailySummarySettings'
import { useSettingsStore } from '../../../stores/settings.store'

const INITIAL_SETTINGS = useSettingsStore.getState()

beforeEach(() => {
  useSettingsStore.setState(INITIAL_SETTINGS, true)
})

describe('AiDailySummarySettings', () => {
  it('shows the feature on by default with its auto-generate sub-toggle', () => {
    render(<AiDailySummarySettings />)
    expect(screen.getByText('Daily summary')).toBeInTheDocument()
    expect(screen.getByTestId('daily-summary-enabled-toggle')).toBeChecked()
    expect(screen.getByTestId('daily-summary-auto-toggle')).toBeChecked()
  })

  it('persists the enable flag and hides the sub-toggle when turned off', async () => {
    const user = userEvent.setup()
    render(<AiDailySummarySettings />)

    await user.click(screen.getByTestId('daily-summary-enabled-toggle'))
    expect(useSettingsStore.getState().settings.dailySummary?.enabled).toBe(false)
    expect(screen.queryByTestId('daily-summary-auto-toggle')).not.toBeInTheDocument()
  })

  it('persists the auto-generate flag', async () => {
    const user = userEvent.setup()
    render(<AiDailySummarySettings />)

    await user.click(screen.getByTestId('daily-summary-auto-toggle'))
    expect(useSettingsStore.getState().settings.dailySummary?.autoGenerate).toBe(false)
  })
})
