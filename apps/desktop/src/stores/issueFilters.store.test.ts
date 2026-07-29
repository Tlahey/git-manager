import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_ISSUE_FILTERS,
  issueFilterLabel,
  useIssueFiltersStore,
} from './issueFilters.store'

function reset() {
  useIssueFiltersStore.setState({ filters: DEFAULT_ISSUE_FILTERS })
}

const ids = () => useIssueFiltersStore.getState().filters.map((f) => f.id)

describe('issueFilters.store', () => {
  beforeEach(reset)

  it('ships the two built-in filters, in order', () => {
    expect(ids()).toEqual(['builtin:all-open', 'builtin:mine-open'])
    expect(useIssueFiltersStore.getState().filters[0].query).toBe('is:open')
    expect(useIssueFiltersStore.getState().filters[1].query).toBe('is:open author:@me')
  })

  it('addFilter appends a trimmed filter and returns its id', () => {
    const id = useIssueFiltersStore.getState().addFilter({ name: '  Bugs  ', query: '  label:bug  ' })
    const added = useIssueFiltersStore.getState().filters.at(-1)
    expect(added).toEqual({ id, name: 'Bugs', query: 'label:bug' })
  })

  it('addFilter generates distinct ids', () => {
    const { addFilter } = useIssueFiltersStore.getState()
    const a = addFilter({ name: 'A', query: 'is:open' })
    const b = addFilter({ name: 'B', query: 'is:open' })
    expect(a).not.toBe(b)
  })

  it('updateFilter changes only the requested fields', () => {
    const id = useIssueFiltersStore.getState().addFilter({ name: 'Bugs', query: 'label:bug' })
    useIssueFiltersStore.getState().updateFilter(id, { query: 'label:bug is:open' })
    const filter = useIssueFiltersStore.getState().filters.find((f) => f.id === id)
    expect(filter).toEqual({ id, name: 'Bugs', query: 'label:bug is:open' })
  })

  it('renaming a built-in drops its translated label so the new name sticks', () => {
    useIssueFiltersStore.getState().updateFilter('builtin:all-open', { name: 'Everything' })
    const filter = useIssueFiltersStore.getState().filters[0]
    expect(filter.name).toBe('Everything')
    expect(filter.labelKey).toBeUndefined()
  })

  it('clearing a built-in name back to empty keeps its translated label', () => {
    useIssueFiltersStore.getState().updateFilter('builtin:all-open', { name: '   ' })
    expect(useIssueFiltersStore.getState().filters[0].labelKey).toBe(
      'sidebar.issueFilters.defaults.allOpen'
    )
  })

  it('removeFilter drops just that filter', () => {
    useIssueFiltersStore.getState().removeFilter('builtin:all-open')
    expect(ids()).toEqual(['builtin:mine-open'])
  })

  it('moveFilter swaps with its neighbour', () => {
    useIssueFiltersStore.getState().moveFilter('builtin:mine-open', 'up')
    expect(ids()).toEqual(['builtin:mine-open', 'builtin:all-open'])
    useIssueFiltersStore.getState().moveFilter('builtin:mine-open', 'down')
    expect(ids()).toEqual(['builtin:all-open', 'builtin:mine-open'])
  })

  it('moveFilter is a no-op at either end of the list', () => {
    const before = useIssueFiltersStore.getState().filters
    useIssueFiltersStore.getState().moveFilter('builtin:all-open', 'up')
    useIssueFiltersStore.getState().moveFilter('builtin:mine-open', 'down')
    expect(useIssueFiltersStore.getState().filters).toBe(before)
  })

  it('moveFilter ignores an unknown id', () => {
    const before = useIssueFiltersStore.getState().filters
    useIssueFiltersStore.getState().moveFilter('nope', 'up')
    expect(useIssueFiltersStore.getState().filters).toBe(before)
  })
})

describe('issueFilterLabel', () => {
  it('translates a built-in filter with no user name', () => {
    expect(issueFilterLabel(DEFAULT_ISSUE_FILTERS[0], (k) => `T:${k}`)).toBe(
      'T:sidebar.issueFilters.defaults.allOpen'
    )
  })

  it('prefers the user-typed name over the built-in label', () => {
    const filter = { ...DEFAULT_ISSUE_FILTERS[0], name: 'Everything' }
    expect(issueFilterLabel(filter, (k) => `T:${k}`)).toBe('Everything')
  })

  it('returns an empty string for a nameless filter with no label key', () => {
    expect(issueFilterLabel({ id: 'x', name: '', query: 'is:open' }, (k) => k)).toBe('')
  })
})
