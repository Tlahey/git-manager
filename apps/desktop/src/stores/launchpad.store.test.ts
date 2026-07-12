import { describe, it, expect, beforeEach } from 'vitest'
import { useLaunchpadStore } from './launchpad.store'

const INITIAL_FILTERS = useLaunchpadStore.getState().savedFilters

beforeEach(() => {
  useLaunchpadStore.setState({ savedFilters: INITIAL_FILTERS, activeTab: 'prs' })
  localStorage.clear()
})

describe('useLaunchpadStore', () => {
  it('seeds two example filters by default', () => {
    expect(useLaunchpadStore.getState().savedFilters.map((f) => f.id)).toEqual([
      'preset-needs-review',
      'preset-bugs',
    ])
  })

  it('setActiveTab updates the active tab', () => {
    useLaunchpadStore.getState().setActiveTab('issues')
    expect(useLaunchpadStore.getState().activeTab).toBe('issues')
  })

  it('addFilter appends a new filter with a generated id and createdAt', () => {
    useLaunchpadStore.getState().addFilter({ name: 'My filter', emoji: '⭐', type: 'prs' })
    const filters = useLaunchpadStore.getState().savedFilters
    expect(filters).toHaveLength(3)
    const added = filters[2]
    expect(added.name).toBe('My filter')
    expect(added.id).toMatch(/^filter-\d+$/)
    expect(typeof added.createdAt).toBe('number')
  })

  it('updateFilter patches only the matching filter by id', () => {
    useLaunchpadStore.getState().updateFilter('preset-bugs', { name: 'Renamed' })
    const filters = useLaunchpadStore.getState().savedFilters
    expect(filters.find((f) => f.id === 'preset-bugs')?.name).toBe('Renamed')
    expect(filters.find((f) => f.id === 'preset-needs-review')?.name).toBe('Needs My Review')
  })

  it('deleteFilter removes only the matching filter', () => {
    useLaunchpadStore.getState().deleteFilter('preset-bugs')
    expect(useLaunchpadStore.getState().savedFilters.map((f) => f.id)).toEqual([
      'preset-needs-review',
    ])
  })

  it('reorderFilters moves a filter from one index to another', () => {
    useLaunchpadStore.getState().addFilter({ name: 'Third', emoji: '3', type: 'prs' })
    useLaunchpadStore.getState().reorderFilters(0, 2)
    expect(useLaunchpadStore.getState().savedFilters.map((f) => f.name)).toEqual([
      'Bugs',
      'Third',
      'Needs My Review',
    ])
  })
})
