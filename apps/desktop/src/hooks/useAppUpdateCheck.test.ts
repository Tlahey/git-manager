import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const { loadCurrentVersion, checkForUpdate } = vi.hoisted(() => ({
  loadCurrentVersion: vi.fn(),
  checkForUpdate: vi.fn(),
}))

vi.mock('../stores/updater.store', () => ({
  useUpdaterStore: { getState: () => ({ loadCurrentVersion, checkForUpdate }) },
}))

import { useAppUpdateCheck } from './useAppUpdateCheck'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useAppUpdateCheck', () => {
  it('loads the current version and silently checks for an update once on mount', () => {
    renderHook(() => useAppUpdateCheck())
    expect(loadCurrentVersion).toHaveBeenCalledTimes(1)
    expect(checkForUpdate).toHaveBeenCalledTimes(1)
    expect(checkForUpdate).toHaveBeenCalledWith({ silent: true })
  })

  it('does not re-run on re-render', () => {
    const { rerender } = renderHook(() => useAppUpdateCheck())
    rerender()
    rerender()
    expect(loadCurrentVersion).toHaveBeenCalledTimes(1)
    expect(checkForUpdate).toHaveBeenCalledTimes(1)
  })
})
