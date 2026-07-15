import { describe, it, expect, beforeEach } from 'vitest'
import { useCommitSearchStore } from './commitSearch.store'

beforeEach(() => {
  useCommitSearchStore.setState({ open: false, query: '' })
})

describe('commitSearch.store', () => {
  it('starts closed with an empty query', () => {
    expect(useCommitSearchStore.getState().open).toBe(false)
    expect(useCommitSearchStore.getState().query).toBe('')
  })

  it('toggle flips the open flag', () => {
    useCommitSearchStore.getState().toggle()
    expect(useCommitSearchStore.getState().open).toBe(true)
    useCommitSearchStore.getState().toggle()
    expect(useCommitSearchStore.getState().open).toBe(false)
  })

  it('setQuery updates the query', () => {
    useCommitSearchStore.getState().setQuery('feature')
    expect(useCommitSearchStore.getState().query).toBe('feature')
  })

  it('closeSearch closes the panel and clears the query', () => {
    useCommitSearchStore.setState({ open: true, query: 'feature' })
    useCommitSearchStore.getState().closeSearch()
    expect(useCommitSearchStore.getState().open).toBe(false)
    expect(useCommitSearchStore.getState().query).toBe('')
  })
})
