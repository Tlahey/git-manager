import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../api/ai.api', () => ({ aiStatusService: { check: vi.fn() } }))

import { aiStatusService } from '../api/ai.api'
import { useAiStatusCheck } from './useAiStatusCheck'
import { useSettingsStore } from '../stores/settings.store'
import { useAiStatusStore } from '../stores/aiStatus.store'

const mockedCheck = aiStatusService.check as unknown as ReturnType<typeof vi.fn>
const INITIAL_SETTINGS = useSettingsStore.getState()
const INITIAL_STATUS = useAiStatusStore.getState()

function setAiEnabled(enabled: boolean) {
  const { settings, updateSettings } = useSettingsStore.getState()
  updateSettings({ ai: { ...settings.ai, enabled } })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedCheck.mockResolvedValue({ connected: true, models: ['llama3.2'] })
  useSettingsStore.setState(INITIAL_SETTINGS, true)
  useAiStatusStore.setState(INITIAL_STATUS, true)
})

describe('useAiStatusCheck', () => {
  it('checks the configured provider on mount', async () => {
    renderHook(() => useAiStatusCheck())
    await waitFor(() => expect(useAiStatusStore.getState().state).toBe('connected'))
    expect(mockedCheck).toHaveBeenCalledWith(useSettingsStore.getState().settings.ai)
  })

  it('does not touch the provider when AI features are off', () => {
    setAiEnabled(false)
    renderHook(() => useAiStatusCheck())
    expect(mockedCheck).not.toHaveBeenCalled()
    expect(useAiStatusStore.getState().state).toBe('unknown')
  })

  it('clears a previous outcome when AI gets disabled, so no stale warning survives', async () => {
    const { rerender } = renderHook(() => useAiStatusCheck())
    await waitFor(() => expect(useAiStatusStore.getState().state).toBe('connected'))

    setAiEnabled(false)
    rerender()
    await waitFor(() => expect(useAiStatusStore.getState().state).toBe('unknown'))
  })

  it('re-checks when AI is turned back on', async () => {
    setAiEnabled(false)
    const { rerender } = renderHook(() => useAiStatusCheck())
    expect(mockedCheck).not.toHaveBeenCalled()

    setAiEnabled(true)
    rerender()
    await waitFor(() => expect(mockedCheck).toHaveBeenCalledOnce())
  })

  it('does not re-check on every keystroke in the provider URL', async () => {
    const { rerender } = renderHook(() => useAiStatusCheck())
    await waitFor(() => expect(mockedCheck).toHaveBeenCalledOnce())

    const { settings, updateSettings } = useSettingsStore.getState()
    updateSettings({ ai: { ...settings.ai, url: 'http://localhost:999' } })
    rerender()

    expect(mockedCheck).toHaveBeenCalledOnce()
  })
})
