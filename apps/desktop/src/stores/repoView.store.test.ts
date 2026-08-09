import { describe, it, expect, beforeEach } from 'vitest'
import { useRepoViewStore } from './repoView.store'

describe('repoView.store', () => {
  beforeEach(() => {
    useRepoViewStore.setState({ view: 'graph' })
  })

  it('starts on the graph', () => {
    expect(useRepoViewStore.getState().view).toBe('graph')
  })

  it('switches between the three views', () => {
    useRepoViewStore.getState().setView('files')
    expect(useRepoViewStore.getState().view).toBe('files')

    useRepoViewStore.getState().setView('board')
    expect(useRepoViewStore.getState().view).toBe('board')

    useRepoViewStore.getState().setView('graph')
    expect(useRepoViewStore.getState().view).toBe('graph')
  })

  // The reason this store exists: selecting a view is one write, so no call site can leave two
  // views claiming the central area at once.
  it('holds exactly one view at a time', () => {
    useRepoViewStore.getState().setView('board')
    useRepoViewStore.getState().setView('files')
    expect(useRepoViewStore.getState().view).toBe('files')
  })
})
