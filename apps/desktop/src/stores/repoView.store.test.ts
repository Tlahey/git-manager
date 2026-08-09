import { describe, it, expect, beforeEach } from 'vitest'
import { goToRepoContent, goToRepoDiff, useRepoViewStore } from './repoView.store'

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

describe('goToRepoContent', () => {
  beforeEach(() => {
    useRepoViewStore.setState({ view: 'graph', isPanelOpen: true })
  })

  it('brings the graph forward from the board', () => {
    useRepoViewStore.getState().setView('board')
    goToRepoContent()
    expect(useRepoViewStore.getState().view).toBe('graph')
  })

  it('brings the graph forward from the files view', () => {
    useRepoViewStore.getState().setView('files')
    goToRepoContent()
    expect(useRepoViewStore.getState().view).toBe('graph')
  })

  it('is a no-op on the graph itself', () => {
    goToRepoContent()
    expect(useRepoViewStore.getState().view).toBe('graph')
  })

  // Which panel is folded away is a standing choice about width, not part of where the user is
  // being taken: a notification click should not reopen a sidebar they had put away.
  it('leaves the panel as the user left it', () => {
    useRepoViewStore.setState({ view: 'board', isPanelOpen: false })
    goToRepoContent()
    expect(useRepoViewStore.getState().isPanelOpen).toBe(false)
  })
})

describe('goToRepoDiff', () => {
  beforeEach(() => {
    useRepoViewStore.setState({ view: 'graph', isPanelOpen: true })
  })

  // The board is the only view with nowhere to draw a diff, so it is the only one this moves off.
  it('leaves the board for the graph', () => {
    useRepoViewStore.getState().setView('board')
    goToRepoDiff()
    expect(useRepoViewStore.getState().view).toBe('graph')
  })

  it('stays on the files view, which is built around the diff', () => {
    useRepoViewStore.getState().setView('files')
    goToRepoDiff()
    expect(useRepoViewStore.getState().view).toBe('files')
  })

  it('stays on the graph', () => {
    goToRepoDiff()
    expect(useRepoViewStore.getState().view).toBe('graph')
  })
})
