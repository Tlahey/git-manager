import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BoardSection } from './BoardSection'
import { useSettingsStore } from '../../../stores/settings.store'

const INITIAL_SETTINGS = useSettingsStore.getState()

beforeEach(() => {
  useSettingsStore.setState(INITIAL_SETTINGS, true)
})

describe('BoardSection', () => {
  it('defaults to auto-sync disabled with a 5 minute interval', () => {
    render(<BoardSection />)
    expect(screen.getByTestId('settings-board-autosync-enabled')).not.toBeChecked()
    expect(screen.getByTestId('settings-board-autosync-interval')).toHaveValue(5)
    expect(screen.getByTestId('settings-board-autosync-interval')).toBeDisabled()
  })

  it('enables auto-sync and the interval input', async () => {
    render(<BoardSection />)
    await userEvent.click(screen.getByTestId('settings-board-autosync-enabled'))

    expect(useSettingsStore.getState().settings.board?.autoSync.enabled).toBe(true)
    expect(screen.getByTestId('settings-board-autosync-interval')).toBeEnabled()
  })

  it('clamps the interval to the 1–120 minute range', async () => {
    render(<BoardSection />)
    await userEvent.click(screen.getByTestId('settings-board-autosync-enabled'))

    const input = screen.getByTestId('settings-board-autosync-interval')
    await userEvent.clear(input)
    await userEvent.type(input, '999')
    expect(useSettingsStore.getState().settings.board?.autoSync.intervalMinutes).toBe(120)

    await userEvent.clear(input)
    await userEvent.type(input, '0')
    expect(useSettingsStore.getState().settings.board?.autoSync.intervalMinutes).toBe(1)
  })
})
