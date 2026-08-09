import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_ISSUE_FILTERS, issueFilterLabel, useIssueFiltersStore } from './issueFilters.store'
import { DEFAULT_PR_FILTERS, usePrFiltersStore } from './prFilters.store'

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
    const id = useIssueFiltersStore
      .getState()
      .addFilter({ name: '  Bugs  ', query: '  label:bug  ' })
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

describe('prFilters.store', () => {
  beforeEach(() => {
    usePrFiltersStore.setState({ filters: DEFAULT_PR_FILTERS })
  })

  // These four replace the fixed groups the PR section used to hardcode, and reuse their label keys
  // so the copy is unchanged for anyone who never opens the filter editor.
  it('ships the four built-in views, in the order the section used to hardcode', () => {
    expect(usePrFiltersStore.getState().filters.map((f) => f.labelKey)).toEqual([
      'sidebar.prGroups.mine',
      'sidebar.prGroups.assigned',
      'sidebar.prGroups.awaitingReview',
      'sidebar.prGroups.all',
    ])
  })

  it('queries each built-in view the way GitHub search spells it', () => {
    expect(usePrFiltersStore.getState().filters.map((f) => f.query)).toEqual([
      'is:open author:@me',
      'is:open assignee:@me',
      'is:open review-requested:@me',
      'is:open',
    ])
  })

  // Same factory as the issue store, so only the wiring needs checking here.
  it('edits and reorders like the issue list does', () => {
    const id = usePrFiltersStore.getState().addFilter({ name: 'Drafts', query: 'is:draft' })
    expect(usePrFiltersStore.getState().filters.at(-1)).toMatchObject({ name: 'Drafts' })

    usePrFiltersStore.getState().moveFilter(id, 'up')
    expect(usePrFiltersStore.getState().filters.at(-2)!.id).toBe(id)

    usePrFiltersStore.getState().removeFilter(id)
    expect(usePrFiltersStore.getState().filters.map((f) => f.id)).not.toContain(id)
  })

  // Two stores, two persist keys — one list must never overwrite the other.
  it('persists under its own key, separate from the issue filters', () => {
    usePrFiltersStore.getState().addFilter({ name: 'Drafts', query: 'is:draft' })
    expect(useIssueFiltersStore.getState().filters).toEqual(DEFAULT_ISSUE_FILTERS)
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
