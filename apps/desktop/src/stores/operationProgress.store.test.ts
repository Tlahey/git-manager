import { describe, it, expect, beforeEach } from 'vitest'
import { useOperationProgressStore } from './operationProgress.store'

beforeEach(() => {
  useOperationProgressStore.setState({ running: {} })
})

describe('useOperationProgressStore', () => {
  it('starts with nothing running', () => {
    expect(useOperationProgressStore.getState().running).toEqual({})
  })

  it('start() records the running operation kind for a repo', () => {
    useOperationProgressStore.getState().start('/repo/a', 'rebase')
    expect(useOperationProgressStore.getState().running).toEqual({ '/repo/a': 'rebase' })
  })

  it('tracks multiple repos independently', () => {
    useOperationProgressStore.getState().start('/repo/a', 'rebase')
    useOperationProgressStore.getState().start('/repo/b', 'rebase')
    expect(useOperationProgressStore.getState().running).toEqual({
      '/repo/a': 'rebase',
      '/repo/b': 'rebase',
    })
  })

  it('clear() removes only the given repo', () => {
    useOperationProgressStore.getState().start('/repo/a', 'rebase')
    useOperationProgressStore.getState().start('/repo/b', 'rebase')
    useOperationProgressStore.getState().clear('/repo/a')
    expect(useOperationProgressStore.getState().running).toEqual({ '/repo/b': 'rebase' })
  })

  it('clear() on a repo with nothing running is a no-op', () => {
    useOperationProgressStore.getState().clear('/repo/unknown')
    expect(useOperationProgressStore.getState().running).toEqual({})
  })
})
