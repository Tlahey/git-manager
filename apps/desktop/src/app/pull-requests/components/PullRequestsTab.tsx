import { useState, useMemo, useCallback, useEffect } from 'react'
import { GitPullRequest } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'

import { Toolbar } from './Toolbar'
import { TableHeader, GroupHeader, LoadMore, usePRSort, useSetFilter } from './ListHelpers'
import { PRRowSkeleton } from './RowSkeletons'
import { PRRow } from './PRRow'
import { groupPrs, PR_GROUP_ORDER, PR_GROUP_META, type PrGroupKey } from '../prGroups'
import { useLaunchpadControlsStore } from '../../../stores/launchpadControls.store'
import { matchesPrSearch } from '../prSearch'
import type { MockPR, SortKey, SortDir } from '../types'

const PAGE_SIZE = 20

/** A page-size counter per group id, so "load more" paginates each group independently. */
type ShownState = Record<string, number>
/** Open/closed collapse state per group id (defaults to open). */
type OpenState = Record<string, boolean>

interface PullRequestsTabProps {
  allPRs: MockPR[]
  pinnedIds: Set<string>
  onTogglePin: (id: string) => void
  loading: boolean
}

export function PullRequestsTab({ allPRs, pinnedIds, onTogglePin, loading }: PullRequestsTabProps) {
  const { t } = useTranslation('launchpad')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [statusFilter, toggleStatus, clearStatus] = useSetFilter()
  const [repoFilter, toggleRepo, clearRepo] = useSetFilter()
  const [authorFilter, toggleAuthor, clearAuthor] = useSetFilter()
  // Collapse + pagination state is keyed by group id ('pinned' plus every PrGroupKey) so each
  // section folds and paginates on its own. Missing keys default to open / one page shown.
  const [openState, setOpenState] = useState<OpenState>({})
  const [shownState, setShownState] = useState<ShownState>({})

  // Global Launchpad controls (search + collapse/expand-all), shared across every tab.
  const globalSearch = useLaunchpadControlsStore((s) => s.search)
  const collapseNonce = useLaunchpadControlsStore((s) => s.collapseAllNonce)
  const expandNonce = useLaunchpadControlsStore((s) => s.expandAllNonce)

  const isOpen = useCallback((key: string) => openState[key] ?? true, [openState])
  const toggleOpen = useCallback(
    (key: string) => setOpenState((s) => ({ ...s, [key]: !(s[key] ?? true) })),
    []
  )

  // "Collapse all" folds every section; "Expand all" clears the overrides back to the open default.
  // Skip the initial mount (nonce 0) so the tab starts fully expanded.
  useEffect(() => {
    if (collapseNonce === 0) return
    const folded: OpenState = { pinned: false }
    for (const key of PR_GROUP_ORDER) folded[key] = false
    setOpenState(folded)
  }, [collapseNonce])
  useEffect(() => {
    if (expandNonce === 0) return
    setOpenState({})
  }, [expandNonce])
  const shownFor = useCallback((key: string) => shownState[key] ?? PAGE_SIZE, [shownState])
  const loadMore = useCallback(
    (key: string) =>
      setShownState((s) => ({ ...s, [key]: (s[key] ?? PAGE_SIZE) + PAGE_SIZE })),
    []
  )

  const handleSort = useCallback((k: SortKey) => {
    setSortKey((prevKey) => {
      if (k === prevKey) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        return prevKey
      } else {
        setSortDir('desc')
        return k
      }
    })
  }, [])

  const repos = useMemo(() => [...new Set(allPRs.map((p) => p.repo))].sort(), [allPRs])
  const statuses = useMemo(() => [...new Set(allPRs.map((p) => p.status))].sort(), [allPRs])
  const authors = useMemo(() => [...new Set(allPRs.map((p) => p.author))].sort(), [allPRs])

  const filtered = useMemo(() => {
    return allPRs.filter((pr) => {
      if (statusFilter.size > 0 && !statusFilter.has(pr.status)) return false
      if (repoFilter.size > 0 && !repoFilter.has(pr.repo)) return false
      if (authorFilter.size > 0 && !authorFilter.has(pr.author)) return false
      // The tab's own search box and the global Launchpad search both narrow the list.
      return matchesPrSearch(pr, search) && matchesPrSearch(pr, globalSearch)
    })
  }, [allPRs, search, globalSearch, statusFilter, repoFilter, authorFilter])

  const pinnedPRs = usePRSort(
    useMemo(() => filtered.filter((pr) => pinnedIds.has(pr.id)), [filtered, pinnedIds]),
    sortKey,
    sortDir
  )
  // Everything not pinned, sorted once, then partitioned into the display buckets (a PR lands in
  // exactly one). Pinned PRs are shown separately on top and excluded here to avoid duplication.
  const sortedUnpinned = usePRSort(
    useMemo(() => filtered.filter((pr) => !pinnedIds.has(pr.id)), [filtered, pinnedIds]),
    sortKey,
    sortDir
  )
  const groups = useMemo(() => groupPrs(sortedUnpinned), [sortedUnpinned])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Toolbar
        search={search}
        onSearch={setSearch}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        statusFilter={statusFilter}
        onToggleStatus={toggleStatus}
        onClearStatus={clearStatus}
        repoFilter={repoFilter}
        onToggleRepo={toggleRepo}
        onClearRepo={clearRepo}
        authorFilter={authorFilter}
        onToggleAuthor={toggleAuthor}
        onClearAuthor={clearAuthor}
        repos={repos}
        statuses={statuses}
        authors={authors}
      />
      <TableHeader />
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <>
            <PRRowSkeleton />
            <PRRowSkeleton />
            <PRRowSkeleton />
            <PRRowSkeleton />
          </>
        ) : (
          <>
            {pinnedPRs.length > 0 && (
              <>
                <GroupHeader
                  label={t('group.pinned')}
                  count={pinnedPRs.length}
                  open={isOpen('pinned')}
                  onToggle={() => toggleOpen('pinned')}
                  accent="text-amber-400"
                />
                {isOpen('pinned') &&
                  pinnedPRs.map((pr) => (
                    <PRRow key={pr.id} pr={pr} pinned onTogglePin={onTogglePin} />
                  ))}
              </>
            )}
            {sortedUnpinned.length === 0 && (
              <div className="flex items-center justify-center py-10 text-xs text-muted-foreground/50">
                <GitPullRequest className="mr-2 h-4 w-4 opacity-30" /> {t('group.noPrs')}
              </div>
            )}
            {PR_GROUP_ORDER.map((key: PrGroupKey) => {
              const list = groups[key]
              if (list.length === 0) return null
              const meta = PR_GROUP_META[key]
              return (
                <div key={key}>
                  <GroupHeader
                    label={t(meta.labelKey)}
                    count={list.length}
                    open={isOpen(key)}
                    onToggle={() => toggleOpen(key)}
                    accent={meta.accent}
                  />
                  {isOpen(key) && (
                    <>
                      {list.slice(0, shownFor(key)).map((pr) => (
                        <PRRow key={pr.id} pr={pr} pinned={false} onTogglePin={onTogglePin} />
                      ))}
                      <LoadMore
                        total={list.length}
                        shown={shownFor(key)}
                        onLoadMore={() => loadMore(key)}
                      />
                    </>
                  )}
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
