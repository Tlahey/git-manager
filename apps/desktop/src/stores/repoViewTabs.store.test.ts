import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_REPO_VIEW, REPO_VIEW_IDS, useRepoViewTabsStore } from './repoViewTabs.store'

const reset = () => useRepoViewTabsStore.setState({ byPath: {} })

describe('useRepoViewTabsStore', () => {
  beforeEach(reset)

  it('exposes the three repo views, graph first', () => {
    expect(REPO_VIEW_IDS).toEqual(['graph', 'terminal', 'settings'])
    expect(DEFAULT_REPO_VIEW).toBe('graph')
  })

  it('defaults an unknown path to the graph view', () => {
    expect(useRepoViewTabsStore.getState().activeViewFor('/repo')).toBe('graph')
    expect(useRepoViewTabsStore.getState().byPath).toEqual({})
  })

  it('remembers the active view per path independently', () => {
    const { setActiveView } = useRepoViewTabsStore.getState()
    setActiveView('/repo-a', 'terminal')
    setActiveView('/repo-b', 'settings')
    const { activeViewFor } = useRepoViewTabsStore.getState()
    expect(activeViewFor('/repo-a')).toBe('terminal')
    expect(activeViewFor('/repo-b')).toBe('settings')
    expect(activeViewFor('/repo-c')).toBe('graph')
  })

  it('overwrites a path’s view when it switches again', () => {
    useRepoViewTabsStore.getState().setActiveView('/repo', 'settings')
    useRepoViewTabsStore.getState().setActiveView('/repo', 'graph')
    expect(useRepoViewTabsStore.getState().activeViewFor('/repo')).toBe('graph')
  })

  it('clearForPath forgets only that path', () => {
    const { setActiveView } = useRepoViewTabsStore.getState()
    setActiveView('/repo-a', 'terminal')
    setActiveView('/repo-b', 'settings')
    useRepoViewTabsStore.getState().clearForPath('/repo-a')
    expect(useRepoViewTabsStore.getState().byPath).toEqual({ '/repo-b': 'settings' })
    expect(useRepoViewTabsStore.getState().activeViewFor('/repo-a')).toBe('graph')
  })

  it('clearForPath on an untracked path is a no-op that keeps the same state object', () => {
    const before = useRepoViewTabsStore.getState().byPath
    useRepoViewTabsStore.getState().clearForPath('/never-opened')
    expect(useRepoViewTabsStore.getState().byPath).toBe(before)
  })
})
