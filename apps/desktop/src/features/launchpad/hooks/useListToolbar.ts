import { useCallback, useState } from 'react'
import { useSetFilter } from './listHooks'
import { useLaunchpadControlsStore } from '../stores/launchpadControls.store'
import type { SortKey, SortDir } from '../lib/launchpadTypes'
import type { ToolbarProps } from '../components/Toolbar'

/**
 * The state behind a list tab's `<Toolbar>`: its search box, its sort key and direction, and its
 * three multi-select filters.
 *
 * Every tab that shows a list — pull requests, waiting-for-review, followed, snoozed, issues, WIP —
 * needs exactly this and nothing more, and each used to declare it itself: six `useState`
 * /`useSetFilter` lines, a hand-rolled sort toggle, then fourteen props threaded into `Toolbar`.
 * Six copies of the toggle had already drifted apart (some memoized, some not), which is the kind
 * of divergence this hook exists to make impossible.
 *
 * What it deliberately does *not* own is the filtering and sorting themselves. Those genuinely
 * differ per tab — the WIP rows are local worktrees matched on branch name, the issues tab layers
 * a "mine only" toggle over the same three filters, the PR tabs group their result — so the hook
 * hands back the raw filter sets and lets each tab decide what they mean.
 */

interface UseListToolbarOptions {
  /** Sort key the list opens on. `date` everywhere except WIP, which opens on change count. */
  initialSortKey?: SortKey
  /** Status values ticked on mount — the issues tab opens filtered to `open`. */
  initialStatuses?: Iterable<string>
  /** Dropdown options, derived from the rows by the caller (see `facetOptions`). */
  repos: string[]
  statuses: string[]
  authors: string[]
}

export interface ListToolbarState {
  search: string
  sortKey: SortKey
  sortDir: SortDir
  /** The Launchpad-wide search, which narrows every tab on top of its own search box. */
  globalSearch: string
  statusFilter: Set<string>
  repoFilter: Set<string>
  authorFilter: Set<string>
  /** Spread onto `<Toolbar>` — it takes fourteen props and no tab varies any of them. */
  toolbarProps: Omit<ToolbarProps, 'children'>
}

export function useListToolbar({
  initialSortKey = 'date',
  initialStatuses,
  repos,
  statuses,
  authors,
}: UseListToolbarOptions): ListToolbarState {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>(initialSortKey)
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [statusFilter, toggleStatus, clearStatus] = useSetFilter(initialStatuses)
  const [repoFilter, toggleRepo, clearRepo] = useSetFilter()
  const [authorFilter, toggleAuthor, clearAuthor] = useSetFilter()
  const globalSearch = useLaunchpadControlsStore((s) => s.search)

  /** Clicking the active sort key flips the direction; any other key selects it, newest first. */
  const onSort = useCallback((k: SortKey) => {
    setSortKey((prevKey) => {
      if (k === prevKey) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        return prevKey
      }
      setSortDir('desc')
      return k
    })
  }, [])

  return {
    search,
    sortKey,
    sortDir,
    globalSearch,
    statusFilter,
    repoFilter,
    authorFilter,
    toolbarProps: {
      search,
      onSearch: setSearch,
      sortKey,
      sortDir,
      onSort,
      statusFilter,
      onToggleStatus: toggleStatus,
      onClearStatus: clearStatus,
      repoFilter,
      onToggleRepo: toggleRepo,
      onClearRepo: clearRepo,
      authorFilter,
      onToggleAuthor: toggleAuthor,
      onClearAuthor: clearAuthor,
      repos,
      statuses,
      authors,
    },
  }
}
