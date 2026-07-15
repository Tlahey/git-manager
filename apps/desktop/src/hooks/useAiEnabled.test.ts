import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAiEnabled } from './useAiEnabled'
import { useSettingsStore } from '../stores/settings.store'

const INITIAL = useSettingsStore.getState()

beforeEach(() => {
  useSettingsStore.setState(INITIAL, true)
})

function setEnabled(enabled: boolean | undefined) {
  useSettingsStore.setState((s) => ({
    settings: { ...s.settings, ai: { ...s.settings.ai, enabled } },
  }))
}

describe('useAiEnabled', () => {
  it('is true by default', () => {
    expect(renderHook(() => useAiEnabled()).result.current).toBe(true)
  })

  it('treats undefined as enabled (back-compat)', () => {
    setEnabled(undefined)
    expect(renderHook(() => useAiEnabled()).result.current).toBe(true)
  })

  it('is false only when explicitly disabled', () => {
    setEnabled(false)
    expect(renderHook(() => useAiEnabled()).result.current).toBe(false)
  })
})
