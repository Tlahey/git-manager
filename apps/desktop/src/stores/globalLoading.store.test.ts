import { describe, it, expect, beforeEach } from 'vitest'
import {
  useGlobalLoadingStore,
  selectIsGlobalLoading,
  selectGlobalLoadingLabel,
} from './globalLoading.store'

describe('globalLoading.store', () => {
  beforeEach(() => {
    useGlobalLoadingStore.setState({ active: {} })
  })

  it('is idle by default', () => {
    expect(selectIsGlobalLoading(useGlobalLoadingStore.getState())).toBe(false)
    expect(selectGlobalLoadingLabel(useGlobalLoadingStore.getState())).toBe('')
  })

  it('becomes active while an operation is registered and idle again after it ends', () => {
    const token = useGlobalLoadingStore.getState().begin('Loading history...')
    expect(selectIsGlobalLoading(useGlobalLoadingStore.getState())).toBe(true)
    expect(selectGlobalLoadingLabel(useGlobalLoadingStore.getState())).toBe('Loading history...')

    useGlobalLoadingStore.getState().end(token)
    expect(selectIsGlobalLoading(useGlobalLoadingStore.getState())).toBe(false)
  })

  it('ref-counts overlapping operations (one ending does not clear the other)', () => {
    const a = useGlobalLoadingStore.getState().begin('A')
    const b = useGlobalLoadingStore.getState().begin('B')

    useGlobalLoadingStore.getState().end(a)
    expect(selectIsGlobalLoading(useGlobalLoadingStore.getState())).toBe(true)
    // The most recent surviving operation drives the caption.
    expect(selectGlobalLoadingLabel(useGlobalLoadingStore.getState())).toBe('B')

    useGlobalLoadingStore.getState().end(b)
    expect(selectIsGlobalLoading(useGlobalLoadingStore.getState())).toBe(false)
  })

  it('ignores end() for an unknown token', () => {
    const token = useGlobalLoadingStore.getState().begin('A')
    useGlobalLoadingStore.getState().end(-999)
    expect(selectIsGlobalLoading(useGlobalLoadingStore.getState())).toBe(true)
    useGlobalLoadingStore.getState().end(token)
    expect(selectIsGlobalLoading(useGlobalLoadingStore.getState())).toBe(false)
  })
})
