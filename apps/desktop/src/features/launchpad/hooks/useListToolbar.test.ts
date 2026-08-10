import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useListToolbar } from './useListToolbar'
import { useLaunchpadControlsStore } from '../stores/launchpadControls.store'

const OPTIONS = { repos: ['git-manager'], statuses: ['open'], authors: ['antoine'] }

beforeEach(() => {
  useLaunchpadControlsStore.setState({ search: '' })
})

describe('useListToolbar', () => {
  it('opens on the newest-first date sort, with nothing searched or filtered', () => {
    const { result } = renderHook(() => useListToolbar(OPTIONS))

    expect(result.current.sortKey).toBe('date')
    expect(result.current.sortDir).toBe('desc')
    expect(result.current.search).toBe('')
    expect(result.current.statusFilter.size).toBe(0)
    expect(result.current.repoFilter.size).toBe(0)
    expect(result.current.authorFilter.size).toBe(0)
  })

  it('opens on the sort key the tab asked for — the WIP tab sorts by change count', () => {
    const { result } = renderHook(() => useListToolbar({ ...OPTIONS, initialSortKey: 'files' }))

    expect(result.current.sortKey).toBe('files')
  })

  it('starts with the statuses the tab pre-ticked — the issues tab opens on open issues', () => {
    const { result } = renderHook(() => useListToolbar({ ...OPTIONS, initialStatuses: ['open'] }))

    expect([...result.current.statusFilter]).toEqual(['open'])
  })

  /** The behaviour six tabs each re-implemented, two of them without memoizing the callback. */
  it('flips the direction when the active sort key is clicked again', () => {
    const { result } = renderHook(() => useListToolbar(OPTIONS))

    act(() => result.current.toolbarProps.onSort('date'))
    expect(result.current.sortDir).toBe('asc')

    act(() => result.current.toolbarProps.onSort('date'))
    expect(result.current.sortDir).toBe('desc')
  })

  it('selects a different sort key newest-first, whatever direction was showing', () => {
    const { result } = renderHook(() => useListToolbar(OPTIONS))

    act(() => result.current.toolbarProps.onSort('date')) // now ascending
    act(() => result.current.toolbarProps.onSort('author'))

    expect(result.current.sortKey).toBe('author')
    expect(result.current.sortDir).toBe('desc')
  })

  it('toggles a filter value on and off, and clears the whole set', () => {
    const { result } = renderHook(() => useListToolbar(OPTIONS))

    act(() => result.current.toolbarProps.onToggleRepo('git-manager'))
    expect([...result.current.repoFilter]).toEqual(['git-manager'])

    act(() => result.current.toolbarProps.onToggleRepo('git-manager'))
    expect(result.current.repoFilter.size).toBe(0)

    act(() => result.current.toolbarProps.onToggleAuthor('antoine'))
    act(() => result.current.toolbarProps.onClearAuthor())
    expect(result.current.authorFilter.size).toBe(0)
  })

  it('keeps the three filters independent of one another', () => {
    const { result } = renderHook(() => useListToolbar(OPTIONS))

    act(() => result.current.toolbarProps.onToggleStatus('open'))
    act(() => result.current.toolbarProps.onToggleRepo('git-manager'))
    act(() => result.current.toolbarProps.onClearStatus())

    expect(result.current.statusFilter.size).toBe(0)
    expect([...result.current.repoFilter]).toEqual(['git-manager'])
  })

  /** The Launchpad-wide box narrows every tab on top of the tab's own search, so a tab has to see
   * both. Reported here rather than merged so each tab can decide what "matches" means for it. */
  it('reports the Launchpad-wide search alongside the tab own search box', () => {
    const { result } = renderHook(() => useListToolbar(OPTIONS))

    act(() => result.current.toolbarProps.onSearch('rebase'))
    act(() => useLaunchpadControlsStore.setState({ search: 'graph' }))

    expect(result.current.search).toBe('rebase')
    expect(result.current.globalSearch).toBe('graph')
  })

  it('passes the dropdown options through to the toolbar untouched', () => {
    const { result } = renderHook(() => useListToolbar(OPTIONS))

    expect(result.current.toolbarProps.repos).toEqual(['git-manager'])
    expect(result.current.toolbarProps.statuses).toEqual(['open'])
    expect(result.current.toolbarProps.authors).toEqual(['antoine'])
  })
})
