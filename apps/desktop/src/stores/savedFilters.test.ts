import { beforeEach, describe, expect, it } from 'vitest'
import { createSavedFiltersStore, type SavedFilter } from './savedFilters'

/**
 * Exercises `createSavedFiltersStore` directly, against a store built just for this file — not the
 * real `issueFilters.store.ts` / `prFilters.store.ts` singletons — so these tests cover the shared
 * factory's own logic in isolation rather than relying on either consumer's wiring.
 */
const DEFAULTS: SavedFilter[] = [
  { id: 'builtin:first', name: '', labelKey: 'test.first', query: 'is:open' },
  { id: 'builtin:second', name: '', labelKey: 'test.second', query: 'is:open author:@me' },
  { id: 'builtin:third', name: '', labelKey: 'test.third', query: 'is:closed' },
]

const useTestFiltersStore = createSavedFiltersStore('git-manager-test-saved-filters', DEFAULTS)

const ids = () => useTestFiltersStore.getState().filters.map((f) => f.id)

beforeEach(() => {
  useTestFiltersStore.setState({ filters: DEFAULTS })
})

describe('createSavedFiltersStore', () => {
  describe('addFilter', () => {
    it('appends a trimmed filter and returns its generated id', () => {
      const id = useTestFiltersStore
        .getState()
        .addFilter({ name: '  Bugs  ', query: '  label:bug  ' })
      expect(useTestFiltersStore.getState().filters.at(-1)).toEqual({
        id,
        name: 'Bugs',
        query: 'label:bug',
      })
    })

    it('generates a distinct id per call', () => {
      const { addFilter } = useTestFiltersStore.getState()
      const a = addFilter({ name: 'A', query: 'is:open' })
      const b = addFilter({ name: 'B', query: 'is:open' })
      expect(a).not.toBe(b)
    })
  })

  describe('removeFilter', () => {
    it('drops only the requested filter, keeping the rest in order', () => {
      useTestFiltersStore.getState().removeFilter('builtin:second')
      expect(ids()).toEqual(['builtin:first', 'builtin:third'])
    })

    it('is a no-op for an unknown id', () => {
      useTestFiltersStore.getState().removeFilter('nope')
      expect(ids()).toEqual(['builtin:first', 'builtin:second', 'builtin:third'])
    })
  })

  describe('moveFilter', () => {
    it('swaps a filter with its upward neighbour', () => {
      useTestFiltersStore.getState().moveFilter('builtin:second', 'up')
      expect(ids()).toEqual(['builtin:second', 'builtin:first', 'builtin:third'])
    })

    it('swaps a filter with its downward neighbour', () => {
      useTestFiltersStore.getState().moveFilter('builtin:second', 'down')
      expect(ids()).toEqual(['builtin:first', 'builtin:third', 'builtin:second'])
    })

    it('clamps at the top: moving the first item up is a no-op', () => {
      const before = useTestFiltersStore.getState().filters
      useTestFiltersStore.getState().moveFilter('builtin:first', 'up')
      expect(useTestFiltersStore.getState().filters).toBe(before)
      expect(ids()).toEqual(['builtin:first', 'builtin:second', 'builtin:third'])
    })

    it('clamps at the bottom: moving the last item down is a no-op', () => {
      const before = useTestFiltersStore.getState().filters
      useTestFiltersStore.getState().moveFilter('builtin:third', 'down')
      expect(useTestFiltersStore.getState().filters).toBe(before)
      expect(ids()).toEqual(['builtin:first', 'builtin:second', 'builtin:third'])
    })

    it('ignores an id that is not in the list', () => {
      const before = useTestFiltersStore.getState().filters
      useTestFiltersStore.getState().moveFilter('nope', 'up')
      expect(useTestFiltersStore.getState().filters).toBe(before)
    })
  })

  describe('updateFilter', () => {
    it('updates only the fields present in the patch', () => {
      useTestFiltersStore.getState().updateFilter('builtin:first', { query: 'is:open label:bug' })
      const filter = useTestFiltersStore.getState().filters.find((f) => f.id === 'builtin:first')
      expect(filter).toEqual({
        id: 'builtin:first',
        name: '',
        labelKey: 'test.first',
        query: 'is:open label:bug',
      })
    })

    it('trims a renamed name and query', () => {
      useTestFiltersStore
        .getState()
        .updateFilter('builtin:first', { name: '  Mine  ', query: '  is:open  ' })
      const filter = useTestFiltersStore.getState().filters.find((f) => f.id === 'builtin:first')
      expect(filter?.name).toBe('Mine')
      expect(filter?.query).toBe('is:open')
    })

    it('drops labelKey once the user types a non-empty name, so the built-in label never comes back', () => {
      useTestFiltersStore.getState().updateFilter('builtin:first', { name: 'Everything' })
      const filter = useTestFiltersStore.getState().filters.find((f) => f.id === 'builtin:first')
      expect(filter?.name).toBe('Everything')
      expect(filter?.labelKey).toBeUndefined()
    })

    it('keeps labelKey when a rename patch trims down to an empty name', () => {
      useTestFiltersStore.getState().updateFilter('builtin:first', { name: '   ' })
      const filter = useTestFiltersStore.getState().filters.find((f) => f.id === 'builtin:first')
      expect(filter?.name).toBe('')
      expect(filter?.labelKey).toBe('test.first')
    })

    it('never restores labelKey once it has been dropped by an earlier non-empty rename', () => {
      useTestFiltersStore.getState().updateFilter('builtin:first', { name: 'Everything' })
      useTestFiltersStore.getState().updateFilter('builtin:first', { name: '   ' })
      const filter = useTestFiltersStore.getState().filters.find((f) => f.id === 'builtin:first')
      expect(filter?.name).toBe('')
      expect(filter?.labelKey).toBeUndefined()
    })

    it('is a no-op for an unknown id', () => {
      const before = useTestFiltersStore.getState().filters
      useTestFiltersStore.getState().updateFilter('nope', { name: 'X' })
      expect(useTestFiltersStore.getState().filters).toEqual(before)
    })
  })

  it('supports a full add / reorder / rename / remove round trip', () => {
    const id = useTestFiltersStore.getState().addFilter({ name: 'Drafts', query: 'is:draft' })
    useTestFiltersStore.getState().moveFilter(id, 'up')
    expect(ids().at(-2)).toBe(id)

    useTestFiltersStore.getState().updateFilter(id, { name: 'WIP' })
    expect(useTestFiltersStore.getState().filters.find((f) => f.id === id)?.name).toBe('WIP')

    useTestFiltersStore.getState().removeFilter(id)
    expect(ids()).not.toContain(id)
  })

  it('keeps two independently created stores from the same factory fully isolated', () => {
    const otherDefaults: SavedFilter[] = [{ id: 'only-here', name: '', query: 'is:open' }]
    const useOtherStore = createSavedFiltersStore(
      'git-manager-test-saved-filters-other',
      otherDefaults
    )

    useTestFiltersStore.getState().addFilter({ name: 'Added to first', query: 'is:open' })

    expect(useOtherStore.getState().filters).toEqual(otherDefaults)
  })
})
