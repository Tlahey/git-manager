import { useState, useMemo, useCallback } from 'react'
import { Eye, GitPullRequest } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'

import { Toolbar } from './Toolbar'
import { TableHeader, GroupHeader, LoadMore, usePRSort, useSetFilter } from './ListHelpers'
import { PRRowSkeleton } from './RowSkeletons'
import { PRRow } from './PRRow'
import type { MockPR, SortKey, SortDir } from '../types'

const PAGE_SIZE = 20

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
  const [gNeedsOpen, setGNeedsOpen] = useState(true)
  const [gOtherOpen, setGOtherOpen] = useState(true)
  const [gPinnedOpen, setGPinnedOpen] = useState(true)
  const [shownNeeds, setShownNeeds] = useState(PAGE_SIZE)
  const [shownOther, setShownOther] = useState(PAGE_SIZE)

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
      if (search) {
        const q = search.toLowerCase()
        return (
          pr.title.toLowerCase().includes(q) ||
          pr.author.toLowerCase().includes(q) ||
          pr.repo.toLowerCase().includes(q) ||
          String(pr.number).includes(q)
        )
      }
      return true
    })
  }, [allPRs, search, statusFilter, repoFilter, authorFilter])

  const pinnedPRs = usePRSort(
    useMemo(() => filtered.filter((pr) => pinnedIds.has(pr.id)), [filtered, pinnedIds]),
    sortKey,
    sortDir
  )
  const needsReview = usePRSort(
    useMemo(
      () => filtered.filter((pr) => pr.needsMyReview && !pinnedIds.has(pr.id)),
      [filtered, pinnedIds]
    ),
    sortKey,
    sortDir
  )
  const other = usePRSort(
    useMemo(
      () => filtered.filter((pr) => !pr.needsMyReview && !pinnedIds.has(pr.id)),
      [filtered, pinnedIds]
    ),
    sortKey,
    sortDir
  )

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
                  open={gPinnedOpen}
                  onToggle={() => setGPinnedOpen((v) => !v)}
                  accent="text-amber-400"
                />
                {gPinnedOpen &&
                  pinnedPRs.map((pr) => (
                    <PRRow key={pr.id} pr={pr} pinned onTogglePin={onTogglePin} />
                  ))}
              </>
            )}
            <GroupHeader
              label={t('group.needsReview')}
              count={needsReview.length}
              open={gNeedsOpen}
              onToggle={() => setGNeedsOpen((v) => !v)}
              accent="text-orange-400"
            />
            {gNeedsOpen && (
              <>
                {needsReview.length === 0 && (
                  <div className="flex items-center justify-center py-6 text-xs text-muted-foreground/50">
                    <Eye className="mr-2 h-4 w-4 opacity-30" /> {t('group.noWaitingReview')}
                  </div>
                )}
                {needsReview.slice(0, shownNeeds).map((pr) => (
                  <PRRow key={pr.id} pr={pr} pinned={false} onTogglePin={onTogglePin} />
                ))}
                <LoadMore
                  total={needsReview.length}
                  shown={shownNeeds}
                  onLoadMore={() => setShownNeeds((n) => n + PAGE_SIZE)}
                />
              </>
            )}
            <GroupHeader
              label={t('group.other')}
              count={other.length}
              open={gOtherOpen}
              onToggle={() => setGOtherOpen((v) => !v)}
            />
            {gOtherOpen && (
              <>
                {other.length === 0 && (
                  <div className="flex items-center justify-center py-6 text-xs text-muted-foreground/50">
                    <GitPullRequest className="mr-2 h-4 w-4 opacity-30" /> {t('group.noPrs')}
                  </div>
                )}
                {other.slice(0, shownOther).map((pr) => (
                  <PRRow key={pr.id} pr={pr} pinned={false} onTogglePin={onTogglePin} />
                ))}
                <LoadMore
                  total={other.length}
                  shown={shownOther}
                  onLoadMore={() => setShownOther((n) => n + PAGE_SIZE)}
                />
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
